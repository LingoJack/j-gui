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

#[path = "chat_engine_helpers.rs"]
mod chat_engine_helpers;
#[path = "chat_engine_meta.rs"]
mod chat_engine_meta;
#[path = "chat_engine_payloads.rs"]
mod chat_engine_payloads;
#[path = "chat_engine_session_meta.rs"]
mod chat_engine_session_meta;
use chat_engine_helpers::{
    build_chat_reference_prompt, build_message_search_id, build_search_snippet,
    finalize_send_message_result, parse_message_render_index,
};
#[cfg(test)]
pub(crate) use chat_engine_helpers::{MessageBuildContext, PendingUserMessage};
use chat_engine_meta::{
    current_timestamp_millis, default_session_meta, load_session_meta, merge_session_info,
};
use chat_engine_payloads::{
    parse_context_dividers, parse_context_length, parse_image_attachments, parse_optional_bool,
};
pub use chat_engine_payloads::{
    ChatEvent, ChatReferenceContext, MessageInfo, MessageSearchResult, SendMessageRequest,
    SessionInfo,
};
use chat_engine_session_meta::{
    load_merged_session_info, merged_info_with_fallback, update_session_meta_fields,
};

static SESSION_WRITE_LOCK: Mutex<()> = Mutex::new(());

static SESSION_COUNTER: AtomicU64 = AtomicU64::new(0);
const MAX_CHAT_REFERENCE_MESSAGES: usize = 20;

/// 面向 Tauri 命令层的聊天编排器，负责会话校验、持久化与流式转发。
pub struct ChatEngine {
    chat_kernel: Arc<dyn ChatKernel>,
    config_kernel: Arc<dyn ConfigKernel>,
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
            .map(|summary| {
                let meta = load_session_meta(&summary.id)
                    .unwrap_or_else(|_| default_session_meta(&summary.id));
                merge_session_info(summary, &meta)
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
        let fallback_timestamp = current_timestamp_millis();
        Ok(events
            .into_iter()
            .enumerate()
            .map(|(index, e)| MessageInfo {
                id: build_message_search_id(index),
                role: e.role,
                content: e.content,
                reasoning: e.reasoning,
                attachments: e.attachments,
                created_at: if e.timestamp > 0 {
                    e.timestamp
                } else {
                    fallback_timestamp
                },
                timestamp: if e.timestamp > 0 {
                    e.timestamp
                } else {
                    fallback_timestamp
                },
            })
            .collect())
    }

    /// 按关键字搜索所有聊天会话的消息内容，返回带消息锚点的搜索结果。
    pub fn search_messages(&self, query: &str) -> Result<Vec<MessageSearchResult>, String> {
        let trimmed_query = query.trim();
        if trimmed_query.is_empty() {
            return Ok(Vec::new());
        }
        let normalized_query = trimmed_query.to_lowercase();
        let query_utf16_len = trimmed_query.encode_utf16().count();

        let sessions = self.list_sessions()?;
        let mut results = Vec::new();

        for session in sessions {
            let session_title = session
                .title
                .clone()
                .unwrap_or_else(|| "新对话".to_string());
            let messages = match self.get_messages(&session.id) {
                Ok(messages) => messages,
                Err(_) => continue,
            };

            for (index, message) in messages.into_iter().enumerate() {
                if let Some((snippet, match_start, match_length)) =
                    build_search_snippet(&message.content, &normalized_query, query_utf16_len)
                {
                    results.push(MessageSearchResult {
                        conversation_id: session.id.clone(),
                        conversation_title: session_title.clone(),
                        message_id: build_message_search_id(index),
                        role: message.role,
                        snippet,
                        match_start,
                        match_length,
                        archived: session.archived,
                    });
                }
            }
        }

        Ok(results)
    }

    /// 把 Chat 会话格式化为可注入 Agent 输入的引用上下文。
    pub fn build_chat_reference_context(
        &self,
        session_id: &str,
    ) -> Result<ChatReferenceContext, String> {
        Self::validate_session_id(session_id)?;
        let sessions = self.list_sessions()?;
        let session = sessions
            .into_iter()
            .find(|item| item.id == session_id)
            .ok_or_else(|| format!("未找到对话: {}", session_id))?;
        let conversation_title = session.title.unwrap_or_else(|| "新对话".to_string());
        let messages = self.get_messages(session_id)?;
        let total_count = messages.len();
        let start_index = total_count.saturating_sub(MAX_CHAT_REFERENCE_MESSAGES);
        let included_messages = messages.into_iter().skip(start_index).collect::<Vec<_>>();
        let included_count = included_messages.len();
        let omitted_count = total_count.saturating_sub(included_count);
        let prompt = build_chat_reference_prompt(chat_engine_helpers::ChatReferencePrompt {
            session_id,
            conversation_title: &conversation_title,
            messages: &included_messages,
            total_count,
            omitted_count,
        });

        Ok(ChatReferenceContext {
            conversation_id: session_id.to_string(),
            conversation_title,
            message_count: total_count,
            included_message_count: included_count,
            omitted_message_count: omitted_count,
            prompt,
        })
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

    /// 从指定消息锚点开始截断后续全部消息对，并返回截断后的消息列表。
    pub fn truncate_messages_from(
        &self,
        session_id: &str,
        message_id: &str,
        preserve_first_message_attachments: bool,
    ) -> Result<Vec<MessageInfo>, String> {
        Self::validate_session_id(session_id)?;
        let pair_index = parse_message_render_index(message_id)? / 2;
        let _lock = SESSION_WRITE_LOCK
            .lock()
            .map_err(|e| format!("锁定会话写入失败: {}", e))?;
        self.chat_kernel
            .truncate_messages_from(session_id, pair_index, preserve_first_message_attachments)
            .map_err(|e| e.to_string())?;
        self.get_messages(session_id)
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

    /// 更新会话标题元数据。
    pub fn update_conversation_title(
        &self,
        session_id: &str,
        title: &str,
    ) -> Result<SessionInfo, String> {
        Self::validate_session_id(session_id)?;
        let meta = update_session_meta_fields(session_id, |meta| {
            meta["title"] = serde_json::json!(title);
        })?;
        load_merged_session_info(self.chat_kernel.as_ref(), session_id, &meta)
    }

    /// 更新会话绑定的模型与渠道元数据。
    pub fn update_conversation_model(
        &self,
        session_id: &str,
        model_id: &str,
        channel_id: &str,
    ) -> Result<SessionInfo, String> {
        Self::validate_session_id(session_id)?;
        let meta = update_session_meta_fields(session_id, |meta| {
            meta["model_id"] = serde_json::json!(model_id);
            meta["channel_id"] = serde_json::json!(channel_id);
        })?;
        load_merged_session_info(self.chat_kernel.as_ref(), session_id, &meta)
    }

    /// 更新上下文分隔线元数据，用于“清除上下文”展示与持久化。
    pub fn update_context_dividers(
        &self,
        session_id: &str,
        dividers: &[String],
    ) -> Result<SessionInfo, String> {
        Self::validate_session_id(session_id)?;
        let meta = update_session_meta_fields(session_id, |meta| {
            meta["context_dividers"] = serde_json::json!(dividers);
        })?;
        load_merged_session_info(self.chat_kernel.as_ref(), session_id, &meta)
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
        self.chat_kernel
            .toggle_pin(session_id)
            .map_err(|e| e.to_string())?;
        merged_info_with_fallback(self.chat_kernel.as_ref(), session_id)
    }

    /// 切换指定会话的归档状态并返回最新摘要。
    pub fn toggle_archive(&self, session_id: &str) -> Result<SessionInfo, String> {
        Self::validate_session_id(session_id)?;
        self.chat_kernel
            .toggle_archive(session_id)
            .map_err(|e| e.to_string())?;
        merged_info_with_fallback(self.chat_kernel.as_ref(), session_id)
    }
}

#[cfg(test)]
#[path = "tests/chat_engine.rs"]
mod tests;
