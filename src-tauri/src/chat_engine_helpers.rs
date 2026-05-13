use super::*;

pub(crate) struct PendingUserMessage {
    pub(super) content: String,
    pub(super) attachments: Vec<KernelFileAttachment>,
}

pub(super) struct PreparedSendMessage {
    provider: KernelProvider,
    options: KernelChatRequestOptions,
    messages: Vec<KernelChatMessage>,
    system_prompt: Option<String>,
    pub(super) pending_user: PendingUserMessage,
}

struct StreamUiForwarder<'a> {
    request: &'a SendMessageRequest,
    on_event: &'a Channel<ChatEvent>,
    cancelled: &'a Cell<bool>,
}

pub(crate) struct MessageBuildContext<'a> {
    pub(super) session_id: &'a str,
    pub(super) system_message: Option<&'a str>,
    pub(super) context_length: Option<usize>,
    pub(super) context_dividers: &'a [String],
}

pub(crate) struct ChatReferencePrompt<'a> {
    pub(super) session_id: &'a str,
    pub(super) conversation_title: &'a str,
    pub(super) messages: &'a [MessageInfo],
    pub(super) total_count: usize,
    pub(super) omitted_count: usize,
}

const TOKEN_COUNT_UNSUPPORTED: u32 = 0;

impl ChatEngine {
    pub(super) fn build_messages(
        &self,
        user_message: PendingUserMessage,
        context: MessageBuildContext<'_>,
    ) -> Result<(Vec<KernelChatMessage>, Option<String>), String> {
        let kernel_events = self
            .chat_kernel
            .get_session(context.session_id)
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
        if let Some(divider_index) = Self::latest_context_divider_index(context.context_dividers)? {
            messages = messages.into_iter().skip(divider_index + 1).collect();
        }
        if let Some(limit) = context.context_length {
            messages = Self::trim_messages_to_recent_rounds(messages, limit);
        }
        messages.push(KernelChatMessage {
            role: "user".to_string(),
            content: user_message.content,
            reasoning: None,
            attachments: (!user_message.attachments.is_empty()).then_some(user_message.attachments),
        });
        let system_prompt = match context.system_message {
            Some(prompt) => Some(prompt.to_string()),
            None => self
                .config_kernel
                .load_system_prompt()
                .map_err(|e| e.to_string())?,
        };
        Ok((messages, system_prompt))
    }

    fn latest_context_divider_index(dividers: &[String]) -> Result<Option<usize>, String> {
        for divider in dividers.iter().rev() {
            if divider.trim().is_empty() {
                continue;
            }
            return parse_message_render_index(divider).map(Some);
        }
        Ok(None)
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
        if request.enabled_tool_ids.as_ref().is_some_and(
            |value| !matches!(value, serde_json::Value::Array(items) if items.is_empty()),
        ) {
            fields.push("enabledToolIds");
        }
        fields
    }

    pub(super) fn validate_send_message_request(
        request: &SendMessageRequest,
    ) -> Result<(), String> {
        Self::validate_session_id(&request.session_id)?;
        parse_context_length(request.context_length.as_ref())?;
        parse_context_dividers(request.context_dividers.as_ref())?;
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

    pub(super) fn resolve_provider_for_request(
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

    pub(super) fn resolve_transport_route_for_request(
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

    pub(super) fn persist_response(
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

    pub(super) fn prepare_send_message(
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
        let context_dividers = parse_context_dividers(request.context_dividers.as_ref())?;
        let (messages, system_prompt) = self.build_messages(
            PendingUserMessage {
                content: pending_user.content.clone(),
                attachments: pending_user.attachments.clone(),
            },
            MessageBuildContext {
                session_id: &request.session_id,
                system_message: request.system_message.as_deref(),
                context_length: parse_context_length(request.context_length.as_ref())?,
                context_dividers: &context_dividers,
            },
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

    pub(super) fn persist_user_message(
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

    pub(super) async fn stream_model_response(
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
}

pub(super) fn build_message_search_id(index: usize) -> String {
    format!("chat-index-{}", index)
}

pub(super) fn parse_message_render_index(message_id: &str) -> Result<usize, String> {
    message_id
        .strip_prefix("chat-index-")
        .ok_or_else(|| format!("无效的消息锚点 ID: {}", message_id))?
        .parse::<usize>()
        .map_err(|_| format!("无效的消息锚点 ID: {}", message_id))
}

pub(super) fn build_search_snippet(
    content: &str,
    normalized_query: &str,
    query_utf16_len: usize,
) -> Option<(String, usize, usize)> {
    let content_utf16: Vec<u16> = content.to_lowercase().encode_utf16().collect();
    let query_utf16: Vec<u16> = normalized_query.encode_utf16().collect();
    let match_start = find_utf16_subsequence(&content_utf16, &query_utf16)?;
    let window_start = match_start.saturating_sub(30);
    let window_end = (match_start + query_utf16_len + 50).min(content.encode_utf16().count());
    let (snippet, snippet_start) = slice_utf16_window(content, window_start, window_end);
    Some((
        snippet,
        match_start.saturating_sub(snippet_start),
        query_utf16_len,
    ))
}

pub(super) fn build_chat_reference_prompt(prompt: ChatReferencePrompt<'_>) -> String {
    let mut lines = vec![
        "[引用 Chat 对话上下文]".to_string(),
        format!("对话标题：{}", prompt.conversation_title),
        format!("对话 ID：{}", prompt.session_id),
        format!("总消息数：{}", prompt.total_count),
    ];

    if prompt.omitted_count > 0 {
        lines.push(format!(
            "说明：为控制上下文长度，已省略更早的 {} 条消息，仅保留最近 {} 条。",
            prompt.omitted_count,
            prompt.messages.len()
        ));
    } else {
        lines.push(format!(
            "说明：以下包含该对话的全部 {} 条消息。",
            prompt.messages.len()
        ));
    }

    lines.push(String::new());

    for (index, message) in prompt.messages.iter().enumerate() {
        let role_label = match message.role.as_str() {
            "assistant" => "助手",
            "system" => "系统",
            _ => "用户",
        };
        lines.push(format!("## {} {}", role_label, index + 1));
        if let Some(attachments) = message.attachments.as_ref() {
            if !attachments.is_empty() {
                let names = attachments
                    .iter()
                    .map(|attachment| attachment.filename.clone())
                    .collect::<Vec<_>>()
                    .join("、");
                lines.push(format!("附件：{}", names));
            }
        }
        lines.push(message.content.clone());
        lines.push(String::new());
    }

    lines.join("\n").trim().to_string()
}

fn find_utf16_subsequence(haystack: &[u16], needle: &[u16]) -> Option<usize> {
    if needle.is_empty() {
        return Some(0);
    }
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn slice_utf16_window(content: &str, start_utf16: usize, end_utf16: usize) -> (String, usize) {
    let mut boundaries = Vec::with_capacity(content.chars().count() + 1);
    boundaries.push((0usize, 0usize));

    let mut utf16_offset = 0usize;
    for (byte_index, ch) in content.char_indices() {
        utf16_offset += ch.len_utf16();
        boundaries.push((utf16_offset, byte_index + ch.len_utf8()));
    }

    let snippet_start = boundaries
        .iter()
        .rfind(|(offset, _)| *offset <= start_utf16)
        .copied()
        .unwrap_or((0, 0));
    let snippet_end = boundaries
        .iter()
        .find(|(offset, _)| *offset >= end_utf16)
        .copied()
        .unwrap_or((content.encode_utf16().count(), content.len()));

    (
        content[snippet_start.1..snippet_end.1].to_string(),
        snippet_start.0,
    )
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

pub(super) async fn finalize_send_message_result(
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
