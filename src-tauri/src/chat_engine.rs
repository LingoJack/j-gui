use crate::kernel::types::{
    canonical_provider_key, infer_provider, KernelChatMessage, KernelChatRequestOptions,
    KernelFileAttachment, KernelProvider,
};
use crate::kernel::{
    chat::{KernelAppendMessage, KernelChatStreamCallbacks, KernelChatStreamRequest},
    protocol::resolve_chat_transport_route,
    ChatKernel, ConfigKernel, JcliAdapter,
};
use std::cell::{Cell, RefCell};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::ipc::Channel;

#[path = "chat_engine_payloads.rs"]
mod chat_engine_payloads;
use chat_engine_payloads::{parse_context_length, parse_image_attachments, parse_optional_bool};
pub use chat_engine_payloads::{ChatEvent, MessageInfo, SendMessageRequest, SessionInfo};

static SESSION_WRITE_LOCK: Mutex<()> = Mutex::new(());

static SESSION_COUNTER: AtomicU64 = AtomicU64::new(0);

const TOKEN_COUNT_UNSUPPORTED: u32 = 0;

/// 面向 Tauri 命令层的聊天编排器，负责会话校验、持久化与流式转发。
pub struct ChatEngine {
    chat_kernel: Arc<dyn ChatKernel>,
    config_kernel: Arc<dyn ConfigKernel>,
}

struct PendingUserMessage {
    content: String,
    attachments: Vec<KernelFileAttachment>,
}

struct PreparedSendMessage {
    provider: KernelProvider,
    options: KernelChatRequestOptions,
    messages: Vec<KernelChatMessage>,
    system_prompt: Option<String>,
    pending_user: PendingUserMessage,
}

struct StreamUiForwarder<'a> {
    request: &'a SendMessageRequest,
    on_event: &'a Channel<ChatEvent>,
    cancelled: &'a Cell<bool>,
}

impl ChatEngine {
    /// 使用默认 JcliAdapter 构造聊天引擎。
    pub fn new() -> Self {
        let adapter = Arc::new(JcliAdapter::new());
        Self::new_with_kernel(adapter.clone(), adapter)
    }

    /// 使用注入的 kernel 实现构造聊天引擎，便于测试和替换后端。
    pub fn new_with_kernel(
        chat_kernel: Arc<dyn ChatKernel>,
        config_kernel: Arc<dyn ConfigKernel>,
    ) -> Self {
        Self {
            chat_kernel,
            config_kernel,
        }
    }

    /// 校验聊天会话 ID 是否满足当前持久化格式约束。
    pub fn validate_session_id(id: &str) -> Result<(), String> {
        if id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') && !id.is_empty() {
            Ok(())
        } else {
            Err(format!("无效的 session ID: {}", id))
        }
    }

    /// 为本次 LLM 调用构造消息列表。
    fn build_messages(
        &self,
        session_id: &str,
        user_message: PendingUserMessage,
        system_message: Option<&str>,
        context_length: Option<usize>,
    ) -> Result<(Vec<KernelChatMessage>, Option<String>), String> {
        let kernel_events = self
            .chat_kernel
            .get_session(session_id)
            .map_err(|e| e.to_string())?;
        let mut messages: Vec<KernelChatMessage> = kernel_events
            .iter()
            .map(|e| KernelChatMessage {
                role: e.role.clone(),
                content: e.content.clone(),
                reasoning: e.reasoning.clone(),
                attachments: e.attachments.clone(),
            })
            .collect();
        if let Some(limit) = context_length {
            messages = Self::trim_messages_to_recent_rounds(messages, limit);
        }
        messages.push(KernelChatMessage {
            role: "user".to_string(),
            content: user_message.content,
            reasoning: None,
            attachments: (!user_message.attachments.is_empty()).then_some(user_message.attachments),
        });
        let system_prompt = match system_message {
            Some(prompt) => Some(prompt.to_string()),
            None => self
                .config_kernel
                .load_system_prompt()
                .map_err(|e| e.to_string())?,
        };
        Ok((messages, system_prompt))
    }

    fn trim_messages_to_recent_rounds(
        messages: Vec<KernelChatMessage>,
        round_limit: usize,
    ) -> Vec<KernelChatMessage> {
        if round_limit == 0 || messages.is_empty() {
            return Vec::new();
        }

        let mut remaining_user_rounds = round_limit;
        let mut start_index = 0usize;

        for (index, message) in messages.iter().enumerate().rev() {
            if message.role == "user" {
                remaining_user_rounds -= 1;
                start_index = index;
                if remaining_user_rounds == 0 {
                    break;
                }
            }
        }

        if remaining_user_rounds > 0 {
            messages
        } else {
            messages.into_iter().skip(start_index).collect()
        }
    }

    fn unsupported_request_fields(request: &SendMessageRequest) -> Vec<&'static str> {
        let mut fields = Vec::new();
        if request
            .context_length
            .as_ref()
            .is_some_and(|value| parse_context_length(Some(value)).is_err())
        {
            fields.push("contextLength");
        }
        if request.context_dividers.as_ref().is_some_and(
            |value| !matches!(value, serde_json::Value::Array(items) if items.is_empty()),
        ) {
            fields.push("contextDividers");
        }
        if request.enabled_tool_ids.as_ref().is_some_and(
            |value| !matches!(value, serde_json::Value::Array(items) if items.is_empty()),
        ) {
            fields.push("enabledToolIds");
        }
        fields
    }

    fn validate_send_message_request(request: &SendMessageRequest) -> Result<(), String> {
        Self::validate_session_id(&request.session_id)?;
        parse_context_length(request.context_length.as_ref())?;
        parse_optional_bool(request.thinking_enabled.as_ref())?;
        parse_image_attachments(request.attachments.as_ref())?;
        let unsupported_fields = Self::unsupported_request_fields(request);
        if unsupported_fields.is_empty() {
            Ok(())
        } else {
            Err(format!(
                "不支持的请求字段: {}",
                unsupported_fields.join(", ")
            ))
        }
    }

    fn resolve_provider_for_request(
        &self,
        request: &SendMessageRequest,
    ) -> Result<KernelProvider, String> {
        let providers = self
            .config_kernel
            .load_providers()
            .map_err(|e| e.to_string())?;

        let provider = if let Some(channel_id) = request
            .channel_id
            .as_deref()
            .filter(|value| !value.is_empty())
        {
            providers
                .into_iter()
                .find(|provider| provider.id == channel_id)
                .ok_or_else(|| format!("渠道 ID 不存在: {channel_id}"))?
        } else {
            let active_index = self
                .config_kernel
                .load_active_index()
                .map_err(|e| e.to_string())?;
            providers
                .get(active_index)
                .cloned()
                .ok_or_else(|| "未配置模型提供方，请先在设置中添加并选择".to_string())?
        };

        if let Some(model_id) = request
            .model_id
            .as_deref()
            .filter(|value| !value.is_empty())
        {
            let mut provider = provider;
            let model = provider
                .models
                .iter()
                .find(|model| model.id == model_id)
                .cloned()
                .ok_or_else(|| format!("渠道 {} 中不存在模型: {}", provider.id, model_id))?;
            provider.models = vec![model];
            provider.provider = if provider.provider.is_empty() {
                infer_provider(&provider.api_base)
            } else {
                canonical_provider_key(&provider.provider)
            };
            return Ok(provider);
        }

        if provider.models.is_empty() {
            Err(format!("渠道 {} 未配置可用模型", provider.id))
        } else {
            let mut provider = provider;
            provider.provider = if provider.provider.is_empty() {
                infer_provider(&provider.api_base)
            } else {
                canonical_provider_key(&provider.provider)
            };
            Ok(provider)
        }
    }

    fn resolve_transport_route_for_request(
        provider: &KernelProvider,
        request: &SendMessageRequest,
    ) -> crate::kernel::types::ChatTransportRoute {
        resolve_chat_transport_route(
            &provider.api_base,
            Some(&provider.provider),
            request.model_id.as_deref(),
            request
                .protocol_hint
                .as_deref()
                .or(provider.protocol_hint.as_deref()),
        )
    }

    /// 把助手回复持久化写入会话 transcript。
    fn persist_response(
        &self,
        session_id: &str,
        response: &str,
        reasoning: Option<&str>,
    ) -> Result<(), String> {
        let _lock = SESSION_WRITE_LOCK
            .lock()
            .map_err(|e| format!("锁定会话写入失败: {}", e))?;
        self.chat_kernel
            .append_message(KernelAppendMessage {
                session_id,
                role: "assistant",
                content: response,
                reasoning,
                attachments: None,
            })
            .map_err(|e| e.to_string())
    }

    fn prepare_send_message(
        &self,
        request: &SendMessageRequest,
    ) -> Result<PreparedSendMessage, String> {
        Self::validate_send_message_request(request)?;
        let provider = self.resolve_provider_for_request(request)?;
        let route = Self::resolve_transport_route_for_request(&provider, request);
        let pending_user = PendingUserMessage {
            content: request.content.clone(),
            attachments: parse_image_attachments(request.attachments.as_ref())?,
        };
        let (messages, system_prompt) = self.build_messages(
            &request.session_id,
            PendingUserMessage {
                content: pending_user.content.clone(),
                attachments: pending_user.attachments.clone(),
            },
            request.system_message.as_deref(),
            parse_context_length(request.context_length.as_ref())?,
        )?;
        Ok(PreparedSendMessage {
            provider,
            options: KernelChatRequestOptions {
                thinking_enabled: parse_optional_bool(request.thinking_enabled.as_ref())?,
                protocol_family: Some(route.family),
            },
            messages,
            system_prompt,
            pending_user,
        })
    }

    fn persist_user_message(
        &self,
        session_id: &str,
        pending_user: &PendingUserMessage,
    ) -> Result<(), String> {
        let _lock = SESSION_WRITE_LOCK
            .lock()
            .map_err(|e| format!("锁定会话写入失败: {}", e))?;
        self.chat_kernel
            .append_message(KernelAppendMessage {
                session_id,
                role: "user",
                content: &pending_user.content,
                reasoning: None,
                attachments: (!pending_user.attachments.is_empty())
                    .then_some(pending_user.attachments.as_slice()),
            })
            .map_err(|e| e.to_string())
    }

    async fn stream_model_response(
        &self,
        request: &SendMessageRequest,
        prepared: &PreparedSendMessage,
        on_event: Channel<ChatEvent>,
    ) -> Result<(String, String), String> {
        let chunk_index = Cell::new(0u32);
        let reasoning_index = Cell::new(0u32);
        let cancelled = Cell::new(false);
        let full_reasoning = RefCell::new(String::new());
        let forwarder = StreamUiForwarder {
            request,
            on_event: &on_event,
            cancelled: &cancelled,
        };
        let result = self
            .chat_kernel
            .stream_chat(
                KernelChatStreamRequest {
                    provider: &prepared.provider,
                    messages: &prepared.messages,
                    system_prompt: prepared.system_prompt.as_deref(),
                    options: prepared.options,
                },
                KernelChatStreamCallbacks {
                    on_chunk: &mut |chunk: &str| forwarder.emit_chunk(&chunk_index, chunk),
                    on_reasoning: &mut |delta: &str| {
                        forwarder.emit_reasoning(&reasoning_index, &full_reasoning, delta)
                    },
                },
            )
            .await;
        if cancelled.get() {
            crate::commands::chat::clear_stopped_session(&request.session_id);
            return Err("流式传输已取消".to_string());
        }
        let full_text = result.map_err(|e| e.to_string())?;
        Ok((full_text, full_reasoning.into_inner()))
    }

    /// 发送一条用户消息，并把模型流式响应转发给前端。
    pub async fn send_message(
        &self,
        request: SendMessageRequest,
        on_event: Channel<ChatEvent>,
    ) -> Result<(), String> {
        let prepared = self.prepare_send_message(&request)?;
        self.persist_user_message(&request.session_id, &prepared.pending_user)?;
        let result = self
            .stream_model_response(&request, &prepared, on_event.clone())
            .await;
        finalize_send_message_result(self, &request.session_id, on_event, result).await
    }

    /// 返回当前所有聊天会话摘要。
    pub fn list_sessions(&self) -> Result<Vec<SessionInfo>, String> {
        let sessions = self
            .chat_kernel
            .list_sessions()
            .map_err(|e| e.to_string())?;
        Ok(sessions
            .into_iter()
            .map(|s| SessionInfo {
                id: s.id,
                title: s.title,
                message_count: s.message_count,
                updated_at: s.updated_at,
                pinned: s.pinned,
                archived: s.archived,
            })
            .collect())
    }

    /// 创建一个新的聊天会话，必要时退回到本地兜底 ID 生成。
    pub fn create_session(&self) -> String {
        match self.chat_kernel.create_session() {
            Ok(id) => id,
            Err(_) => {
                let ts = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_micros();
                let pid = std::process::id();
                let seq = SESSION_COUNTER.fetch_add(1, Ordering::Relaxed);
                format!("{:x}-{:x}-{:x}", ts, pid, seq)
            }
        }
    }

    /// 读取指定会话的全部消息并转换为前端展示结构。
    pub fn get_messages(&self, session_id: &str) -> Result<Vec<MessageInfo>, String> {
        Self::validate_session_id(session_id)?;
        let events = self
            .chat_kernel
            .get_session(session_id)
            .map_err(|e| e.to_string())?;
        Ok(events
            .into_iter()
            .map(|e| MessageInfo {
                role: e.role,
                content: e.content,
                reasoning: e.reasoning,
                attachments: e.attachments,
                timestamp: SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
            })
            .collect())
    }

    /// 删除指定轮次的用户/助手消息对。
    pub fn delete_message(&self, session_id: &str, pair_index: usize) -> Result<(), String> {
        Self::validate_session_id(session_id)?;
        let _lock = SESSION_WRITE_LOCK
            .lock()
            .map_err(|e| format!("锁定会话写入失败: {}", e))?;
        self.chat_kernel
            .delete_message(session_id, pair_index)
            .map_err(|e| e.to_string())
    }

    /// 清空指定会话中的全部消息。
    pub fn clear_session(&self, session_id: &str) -> Result<(), String> {
        Self::validate_session_id(session_id)?;
        let _lock = SESSION_WRITE_LOCK
            .lock()
            .map_err(|e| format!("锁定会话写入失败: {}", e))?;
        self.chat_kernel
            .clear_session(session_id)
            .map_err(|e| e.to_string())
    }

    /// 删除指定聊天会话。
    pub fn delete_session(&self, session_id: &str) -> Result<(), String> {
        Self::validate_session_id(session_id)?;
        self.chat_kernel
            .delete_session(session_id)
            .map_err(|e| e.to_string())
    }

    /// 切换指定会话的置顶状态并返回最新摘要。
    pub fn toggle_pin(&self, session_id: &str) -> Result<SessionInfo, String> {
        Self::validate_session_id(session_id)?;
        let summary = self
            .chat_kernel
            .toggle_pin(session_id)
            .map_err(|e| e.to_string())?;
        Ok(SessionInfo {
            id: summary.id,
            title: summary.title,
            message_count: summary.message_count,
            updated_at: summary.updated_at,
            pinned: summary.pinned,
            archived: summary.archived,
        })
    }

    /// 切换指定会话的归档状态并返回最新摘要。
    pub fn toggle_archive(&self, session_id: &str) -> Result<SessionInfo, String> {
        Self::validate_session_id(session_id)?;
        let summary = self
            .chat_kernel
            .toggle_archive(session_id)
            .map_err(|e| e.to_string())?;
        Ok(SessionInfo {
            id: summary.id,
            title: summary.title,
            message_count: summary.message_count,
            updated_at: summary.updated_at,
            pinned: summary.pinned,
            archived: summary.archived,
        })
    }
}

impl StreamUiForwarder<'_> {
    fn emit_chunk(&self, chunk_index: &Cell<u32>, chunk: &str) {
        if self.cancelled.get() {
            return;
        }
        if crate::commands::chat::is_session_stopped(&self.request.session_id) {
            self.cancelled.set(true);
            return;
        }
        if self
            .on_event
            .send(ChatEvent::Chunk {
                index: chunk_index.get(),
                delta: chunk.to_string(),
            })
            .is_err()
        {
            self.cancelled.set(true);
        }
        chunk_index.set(chunk_index.get() + 1);
    }

    fn emit_reasoning(
        &self,
        reasoning_index: &Cell<u32>,
        full_reasoning: &RefCell<String>,
        delta: &str,
    ) {
        if self.cancelled.get() {
            return;
        }
        if crate::commands::chat::is_session_stopped(&self.request.session_id) {
            self.cancelled.set(true);
            return;
        }
        full_reasoning.borrow_mut().push_str(delta);
        if self
            .on_event
            .send(ChatEvent::Reasoning {
                index: reasoning_index.get(),
                delta: delta.to_string(),
            })
            .is_err()
        {
            self.cancelled.set(true);
        }
        reasoning_index.set(reasoning_index.get() + 1);
    }
}

async fn finalize_send_message_result(
    engine: &ChatEngine,
    session_id: &str,
    on_event: Channel<ChatEvent>,
    result: Result<(String, String), String>,
) -> Result<(), String> {
    match result {
        Ok((full_text, full_reasoning)) => {
            engine.persist_response(
                session_id,
                &full_text,
                (!full_reasoning.is_empty()).then_some(full_reasoning.as_str()),
            )?;
            let _ = on_event.send(ChatEvent::Done {
                total_tokens: TOKEN_COUNT_UNSUPPORTED,
            });
            crate::commands::chat::clear_stopped_session(session_id);
            Ok(())
        }
        Err(message) => {
            crate::commands::chat::clear_stopped_session(session_id);
            let _ = on_event.send(ChatEvent::Error {
                message: message.clone(),
            });
            Err(message)
        }
    }
}

#[cfg(test)]
#[path = "tests/chat_engine.rs"]
mod tests;
