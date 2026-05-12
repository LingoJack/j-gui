use super::*;
use crate::kernel::config::MockConfigKernel;
use crate::kernel::types::{
    ChatProtocolFamily, KernelChannelModel, KernelProvider, KernelSessionEvent,
    KernelSessionSummary,
};
use async_trait::async_trait;
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

struct NoopChatKernel;

#[async_trait(?Send)]
impl ChatKernel for NoopChatKernel {
    async fn stream_chat(
        &self,
        _request: crate::kernel::chat::KernelChatStreamRequest<'_>,
        _callbacks: crate::kernel::chat::KernelChatStreamCallbacks<'_>,
    ) -> Result<String, crate::kernel::error::KernelError> {
        Ok(String::new())
    }

    async fn run_agent_loop(
        &self,
        _params: crate::kernel::types::KernelAgentParams,
    ) -> Result<(), crate::kernel::error::KernelError> {
        Ok(())
    }

    fn append_message(
        &self,
        _message: crate::kernel::chat::KernelAppendMessage<'_>,
    ) -> Result<(), crate::kernel::error::KernelError> {
        Ok(())
    }

    fn list_sessions(
        &self,
    ) -> Result<Vec<KernelSessionSummary>, crate::kernel::error::KernelError> {
        Ok(Vec::new())
    }

    fn get_session(
        &self,
        _session_id: &str,
    ) -> Result<Vec<KernelSessionEvent>, crate::kernel::error::KernelError> {
        Ok(Vec::new())
    }

    fn create_session(&self) -> Result<String, crate::kernel::error::KernelError> {
        Ok("test-session".to_string())
    }

    fn delete_session(&self, _session_id: &str) -> Result<(), crate::kernel::error::KernelError> {
        Ok(())
    }

    fn delete_message(
        &self,
        _session_id: &str,
        _pair_index: usize,
    ) -> Result<(), crate::kernel::error::KernelError> {
        Ok(())
    }

    fn truncate_messages_from(
        &self,
        _session_id: &str,
        _pair_index: usize,
        _preserve_first_message_attachments: bool,
    ) -> Result<(), crate::kernel::error::KernelError> {
        Ok(())
    }

    fn clear_session(&self, _session_id: &str) -> Result<(), crate::kernel::error::KernelError> {
        Ok(())
    }

    fn toggle_pin(
        &self,
        _session_id: &str,
    ) -> Result<KernelSessionSummary, crate::kernel::error::KernelError> {
        Ok(KernelSessionSummary {
            id: "test-session".to_string(),
            title: None,
            message_count: 0,
            updated_at: 0,
            pinned: false,
            archived: false,
        })
    }

    fn toggle_archive(
        &self,
        _session_id: &str,
    ) -> Result<KernelSessionSummary, crate::kernel::error::KernelError> {
        Ok(KernelSessionSummary {
            id: "test-session".to_string(),
            title: None,
            message_count: 0,
            updated_at: 0,
            pinned: false,
            archived: false,
        })
    }
}

fn make_engine(config_kernel: MockConfigKernel) -> ChatEngine {
    ChatEngine::new_with_kernel(Arc::new(NoopChatKernel), Arc::new(config_kernel))
}

fn provider(id: &str, model_id: &str) -> KernelProvider {
    KernelProvider {
        id: id.to_string(),
        name: id.to_string(),
        provider: "openai".to_string(),
        protocol_hint: None,
        api_base: "https://example.com".to_string(),
        api_key: "key".to_string(),
        models: vec![KernelChannelModel {
            id: model_id.to_string(),
            name: model_id.to_string(),
            enabled: true,
        }],
        enabled: true,
        supports_vision: false,
        created_at: 1,
        updated_at: 1,
    }
}

fn request(channel_id: Option<&str>, model_id: Option<&str>) -> SendMessageRequest {
    SendMessageRequest {
        session_id: "a1-b2-c3".to_string(),
        content: "hello".to_string(),
        channel_id: channel_id.map(ToString::to_string),
        model_id: model_id.map(ToString::to_string),
        protocol_hint: None,
        system_message: None,
        context_length: None,
        context_dividers: None,
        attachments: None,
        thinking_enabled: None,
        enabled_tool_ids: None,
    }
}

struct HistoryChatKernel {
    history: Vec<KernelSessionEvent>,
}

#[async_trait(?Send)]
impl ChatKernel for HistoryChatKernel {
    async fn stream_chat(
        &self,
        _request: crate::kernel::chat::KernelChatStreamRequest<'_>,
        _callbacks: crate::kernel::chat::KernelChatStreamCallbacks<'_>,
    ) -> Result<String, crate::kernel::error::KernelError> {
        Ok(String::new())
    }

    async fn run_agent_loop(
        &self,
        _params: crate::kernel::types::KernelAgentParams,
    ) -> Result<(), crate::kernel::error::KernelError> {
        Ok(())
    }

    fn append_message(
        &self,
        _message: crate::kernel::chat::KernelAppendMessage<'_>,
    ) -> Result<(), crate::kernel::error::KernelError> {
        Ok(())
    }

    fn list_sessions(
        &self,
    ) -> Result<Vec<KernelSessionSummary>, crate::kernel::error::KernelError> {
        Ok(Vec::new())
    }

    fn get_session(
        &self,
        _session_id: &str,
    ) -> Result<Vec<KernelSessionEvent>, crate::kernel::error::KernelError> {
        Ok(self.history.clone())
    }

    fn create_session(&self) -> Result<String, crate::kernel::error::KernelError> {
        Ok("test-session".to_string())
    }

    fn delete_session(&self, _session_id: &str) -> Result<(), crate::kernel::error::KernelError> {
        Ok(())
    }

    fn delete_message(
        &self,
        _session_id: &str,
        _pair_index: usize,
    ) -> Result<(), crate::kernel::error::KernelError> {
        Ok(())
    }

    fn truncate_messages_from(
        &self,
        _session_id: &str,
        _pair_index: usize,
        _preserve_first_message_attachments: bool,
    ) -> Result<(), crate::kernel::error::KernelError> {
        Ok(())
    }

    fn clear_session(&self, _session_id: &str) -> Result<(), crate::kernel::error::KernelError> {
        Ok(())
    }

    fn toggle_pin(
        &self,
        _session_id: &str,
    ) -> Result<KernelSessionSummary, crate::kernel::error::KernelError> {
        Ok(KernelSessionSummary {
            id: "test-session".to_string(),
            title: None,
            message_count: 0,
            updated_at: 0,
            pinned: false,
            archived: false,
        })
    }

    fn toggle_archive(
        &self,
        _session_id: &str,
    ) -> Result<KernelSessionSummary, crate::kernel::error::KernelError> {
        Ok(KernelSessionSummary {
            id: "test-session".to_string(),
            title: None,
            message_count: 0,
            updated_at: 0,
            pinned: false,
            archived: false,
        })
    }
}

struct SearchChatKernel {
    sessions: Vec<KernelSessionSummary>,
    history_by_session: HashMap<String, Vec<KernelSessionEvent>>,
    failing_sessions: HashSet<String>,
}

#[async_trait(?Send)]
impl ChatKernel for SearchChatKernel {
    async fn stream_chat(
        &self,
        _request: crate::kernel::chat::KernelChatStreamRequest<'_>,
        _callbacks: crate::kernel::chat::KernelChatStreamCallbacks<'_>,
    ) -> Result<String, crate::kernel::error::KernelError> {
        Ok(String::new())
    }

    async fn run_agent_loop(
        &self,
        _params: crate::kernel::types::KernelAgentParams,
    ) -> Result<(), crate::kernel::error::KernelError> {
        Ok(())
    }

    fn append_message(
        &self,
        _message: crate::kernel::chat::KernelAppendMessage<'_>,
    ) -> Result<(), crate::kernel::error::KernelError> {
        Ok(())
    }

    fn list_sessions(
        &self,
    ) -> Result<Vec<KernelSessionSummary>, crate::kernel::error::KernelError> {
        Ok(self.sessions.clone())
    }

    fn get_session(
        &self,
        session_id: &str,
    ) -> Result<Vec<KernelSessionEvent>, crate::kernel::error::KernelError> {
        if self.failing_sessions.contains(session_id) {
            return Err(crate::kernel::error::KernelError::Io(
                std::io::Error::other("broken session"),
            ));
        }
        Ok(self
            .history_by_session
            .get(session_id)
            .cloned()
            .unwrap_or_default())
    }

    fn create_session(&self) -> Result<String, crate::kernel::error::KernelError> {
        Ok("test-session".to_string())
    }

    fn delete_session(&self, _session_id: &str) -> Result<(), crate::kernel::error::KernelError> {
        Ok(())
    }

    fn delete_message(
        &self,
        _session_id: &str,
        _pair_index: usize,
    ) -> Result<(), crate::kernel::error::KernelError> {
        Ok(())
    }

    fn truncate_messages_from(
        &self,
        _session_id: &str,
        _pair_index: usize,
        _preserve_first_message_attachments: bool,
    ) -> Result<(), crate::kernel::error::KernelError> {
        Ok(())
    }

    fn clear_session(&self, _session_id: &str) -> Result<(), crate::kernel::error::KernelError> {
        Ok(())
    }

    fn toggle_pin(
        &self,
        _session_id: &str,
    ) -> Result<KernelSessionSummary, crate::kernel::error::KernelError> {
        Ok(self.sessions[0].clone())
    }

    fn toggle_archive(
        &self,
        _session_id: &str,
    ) -> Result<KernelSessionSummary, crate::kernel::error::KernelError> {
        Ok(self.sessions[0].clone())
    }
}

#[test]
fn resolve_provider_uses_requested_channel_and_model() {
    let mut config = MockConfigKernel::new();
    config.expect_load_providers().returning(|| {
        Ok(vec![
            provider("channel-a", "model-a1"),
            provider("channel-b", "model-b1"),
        ])
    });
    config.expect_load_active_index().returning(|| Ok(0));

    let engine = make_engine(config);
    let resolved = engine
        .resolve_provider_for_request(&request(Some("channel-b"), Some("model-b1")))
        .expect("provider should resolve");

    assert_eq!(resolved.id, "channel-b");
    assert_eq!(resolved.models.len(), 1);
    assert_eq!(resolved.models[0].id, "model-b1");
}

#[test]
fn build_messages_prefers_request_system_message() {
    let mut config = MockConfigKernel::new();
    config
        .expect_load_system_prompt()
        .returning(|| Ok(Some("default prompt".to_string())));

    let engine = make_engine(config);
    let (_messages, system_prompt) = engine
        .build_messages(
            "session-1",
            PendingUserMessage {
                content: "hello".to_string(),
                attachments: Vec::new(),
            },
            Some("override prompt"),
            None,
        )
        .expect("messages should build");

    assert_eq!(system_prompt.as_deref(), Some("override prompt"));
}

#[test]
fn build_messages_trims_history_to_recent_user_rounds() {
    let mut config = MockConfigKernel::new();
    config.expect_load_system_prompt().returning(|| Ok(None));
    let history = vec![
        KernelSessionEvent {
            role: "user".to_string(),
            content: "u1".to_string(),
            reasoning: None,
            attachments: None,
            timestamp: 0,
        },
        KernelSessionEvent {
            role: "assistant".to_string(),
            content: "a1".to_string(),
            reasoning: None,
            attachments: None,
            timestamp: 0,
        },
        KernelSessionEvent {
            role: "user".to_string(),
            content: "u2".to_string(),
            reasoning: None,
            attachments: None,
            timestamp: 0,
        },
        KernelSessionEvent {
            role: "assistant".to_string(),
            content: "a2".to_string(),
            reasoning: None,
            attachments: None,
            timestamp: 0,
        },
        KernelSessionEvent {
            role: "user".to_string(),
            content: "u3".to_string(),
            reasoning: None,
            attachments: None,
            timestamp: 0,
        },
        KernelSessionEvent {
            role: "assistant".to_string(),
            content: "a3".to_string(),
            reasoning: None,
            attachments: None,
            timestamp: 0,
        },
    ];
    let engine =
        ChatEngine::new_with_kernel(Arc::new(HistoryChatKernel { history }), Arc::new(config));

    let (messages, system_prompt) = engine
        .build_messages(
            "session-1",
            PendingUserMessage {
                content: "new-user".to_string(),
                attachments: Vec::new(),
            },
            None,
            Some(2),
        )
        .expect("messages should build");

    assert_eq!(system_prompt, None);
    let contents: Vec<&str> = messages
        .iter()
        .map(|message| message.content.as_str())
        .collect();
    assert_eq!(contents, vec!["u2", "a2", "u3", "a3", "new-user"]);
}

#[test]
fn build_messages_with_zero_context_only_keeps_new_user_message() {
    let mut config = MockConfigKernel::new();
    config.expect_load_system_prompt().returning(|| Ok(None));
    let history = vec![KernelSessionEvent {
        role: "user".to_string(),
        content: "u1".to_string(),
        reasoning: None,
        attachments: None,
        timestamp: 0,
    }];
    let engine =
        ChatEngine::new_with_kernel(Arc::new(HistoryChatKernel { history }), Arc::new(config));

    let (messages, _system_prompt) = engine
        .build_messages(
            "session-1",
            PendingUserMessage {
                content: "new-user".to_string(),
                attachments: Vec::new(),
            },
            None,
            Some(0),
        )
        .expect("messages should build");

    let contents: Vec<&str> = messages
        .iter()
        .map(|message| message.content.as_str())
        .collect();
    assert_eq!(contents, vec!["new-user"]);
}

#[test]
fn build_messages_attaches_current_user_images() {
    let mut config = MockConfigKernel::new();
    config.expect_load_system_prompt().returning(|| Ok(None));
    let engine = ChatEngine::new_with_kernel(
        Arc::new(HistoryChatKernel {
            history: Vec::new(),
        }),
        Arc::new(config),
    );
    let attachments = vec![KernelFileAttachment {
        id: "att-1".to_string(),
        filename: "image.png".to_string(),
        media_type: "image/png".to_string(),
        local_path: "image.png".to_string(),
        size: 123,
    }];

    let (messages, _system_prompt) = engine
        .build_messages(
            "session-1",
            PendingUserMessage {
                content: "new-user".to_string(),
                attachments: attachments.clone(),
            },
            None,
            None,
        )
        .expect("messages should build");

    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0].attachments.as_ref(), Some(&attachments));
}

#[test]
fn resolve_transport_route_for_request_normalizes_provider_alias() {
    let route = ChatEngine::resolve_transport_route_for_request(
        &KernelProvider {
            provider: "tongyi".to_string(),
            api_base: "https://dashscope.aliyuncs.com/compatible-mode/v1".to_string(),
            ..provider("channel-a", "qwen-max")
        },
        &SendMessageRequest {
            session_id: "a1-b2-c3".to_string(),
            content: "hello".to_string(),
            channel_id: Some("channel-a".to_string()),
            model_id: Some("qwen-max".to_string()),
            protocol_hint: None,
            system_message: None,
            context_length: None,
            context_dividers: None,
            attachments: None,
            thinking_enabled: None,
            enabled_tool_ids: None,
        },
    );

    assert_eq!(route.provider_key, "qwen");
    assert_eq!(route.family, ChatProtocolFamily::OpenAiChatCompletions);
}

#[test]
fn resolve_transport_route_for_request_maps_anthropic_provider_to_messages() {
    let anthropic_provider = KernelProvider {
        provider: "anthropic".to_string(),
        api_base: "https://api.anthropic.com".to_string(),
        ..provider("channel-a", "claude-sonnet")
    };

    let route = ChatEngine::resolve_transport_route_for_request(
        &anthropic_provider,
        &SendMessageRequest {
            session_id: "a1-b2-c3".to_string(),
            content: "hello".to_string(),
            channel_id: Some("channel-a".to_string()),
            model_id: Some("claude-sonnet".to_string()),
            protocol_hint: None,
            system_message: None,
            context_length: None,
            context_dividers: None,
            attachments: None,
            thinking_enabled: None,
            enabled_tool_ids: None,
        },
    );

    assert_eq!(route.provider_key, "anthropic");
    assert_eq!(route.family, ChatProtocolFamily::AnthropicMessages);
}

#[test]
fn resolve_transport_route_for_request_respects_openai_responses_hint() {
    let route = ChatEngine::resolve_transport_route_for_request(
        &KernelProvider {
            provider: "openai".to_string(),
            api_base: "https://api.openai.com/v1".to_string(),
            ..provider("channel-a", "gpt-5")
        },
        &SendMessageRequest {
            session_id: "a1-b2-c3".to_string(),
            content: "hello".to_string(),
            channel_id: Some("channel-a".to_string()),
            model_id: Some("gpt-5".to_string()),
            protocol_hint: Some("openai-responses".to_string()),
            system_message: None,
            context_length: None,
            context_dividers: None,
            attachments: None,
            thinking_enabled: None,
            enabled_tool_ids: None,
        },
    );

    assert_eq!(route.provider_key, "openai");
    assert_eq!(route.family, ChatProtocolFamily::OpenAiResponses);
}

#[test]
fn resolve_transport_route_for_request_falls_back_to_provider_protocol_hint() {
    let route = ChatEngine::resolve_transport_route_for_request(
        &KernelProvider {
            provider: "openai".to_string(),
            protocol_hint: Some("openai-responses".to_string()),
            api_base: "https://api.openai.com/v1".to_string(),
            ..provider("channel-a", "gpt-5")
        },
        &SendMessageRequest {
            session_id: "a1-b2-c3".to_string(),
            content: "hello".to_string(),
            channel_id: Some("channel-a".to_string()),
            model_id: Some("gpt-5".to_string()),
            protocol_hint: None,
            system_message: None,
            context_length: None,
            context_dividers: None,
            attachments: None,
            thinking_enabled: None,
            enabled_tool_ids: None,
        },
    );

    assert_eq!(route.provider_key, "openai");
    assert_eq!(route.family, ChatProtocolFamily::OpenAiResponses);
}

#[test]
fn chat_event_chunk_serializes_delta() {
    let event = ChatEvent::Chunk {
        index: 3,
        delta: "hello".to_string(),
    };

    let value = serde_json::to_value(event).expect("chat event should serialize");
    assert_eq!(value["event"], "chunk");
    assert_eq!(value["data"]["index"], 3);
    assert_eq!(value["data"]["delta"], "hello");
    assert!(value["data"].get("content").is_none());
}

#[test]
fn chat_event_reasoning_serializes_delta() {
    let event = ChatEvent::Reasoning {
        index: 2,
        delta: "step-1".to_string(),
    };

    let value = serde_json::to_value(event).expect("chat event should serialize");
    assert_eq!(value["event"], "reasoning");
    assert_eq!(value["data"]["index"], 2);
    assert_eq!(value["data"]["delta"], "step-1");
}

#[test]
fn search_messages_returns_anchor_and_snippet_from_backend_truth() {
    let config = MockConfigKernel::new();
    let sessions = vec![KernelSessionSummary {
        id: "a1-b2-c3".to_string(),
        title: Some("Search Title".to_string()),
        message_count: 2,
        updated_at: 123,
        pinned: false,
        archived: true,
    }];
    let history = vec![
        KernelSessionEvent {
            role: "user".to_string(),
            content: "hello world".to_string(),
            reasoning: None,
            attachments: None,
            timestamp: 0,
        },
        KernelSessionEvent {
            role: "assistant".to_string(),
            content: "matched content result".to_string(),
            reasoning: None,
            attachments: None,
            timestamp: 0,
        },
    ];
    let engine = ChatEngine::new_with_kernel(
        Arc::new(SearchChatKernel {
            sessions,
            history_by_session: HashMap::from([("a1-b2-c3".to_string(), history)]),
            failing_sessions: HashSet::new(),
        }),
        Arc::new(config),
    );

    let results = engine
        .search_messages("content")
        .expect("search should succeed");

    assert_eq!(results.len(), 1);
    assert_eq!(
        results[0],
        MessageSearchResult {
            conversation_id: "a1-b2-c3".to_string(),
            conversation_title: "Search Title".to_string(),
            message_id: "chat-index-1".to_string(),
            role: "assistant".to_string(),
            snippet: "matched content result".to_string(),
            match_start: 8,
            match_length: 7,
            archived: true,
        }
    );
}

#[test]
fn search_messages_handles_cjk_content_without_invalid_utf8_slicing() {
    let config = MockConfigKernel::new();
    let sessions = vec![KernelSessionSummary {
        id: "ab12-cd34".to_string(),
        title: Some("Unicode Search".to_string()),
        message_count: 1,
        updated_at: 123,
        pinned: false,
        archived: false,
    }];
    let history = vec![KernelSessionEvent {
        role: "assistant".to_string(),
        content: format!("{}匹配结果尾巴", "前文".repeat(20)),
        reasoning: None,
        attachments: None,
        timestamp: 0,
    }];
    let engine = ChatEngine::new_with_kernel(
        Arc::new(SearchChatKernel {
            sessions,
            history_by_session: HashMap::from([("ab12-cd34".to_string(), history)]),
            failing_sessions: HashSet::new(),
        }),
        Arc::new(config),
    );

    let results = engine
        .search_messages("匹配")
        .expect("search should succeed");

    assert_eq!(results.len(), 1);
    assert!(results[0].snippet.contains("匹配"));
    assert_eq!(results[0].match_length, "匹配".encode_utf16().count());
    let highlighted: String = results[0]
        .snippet
        .chars()
        .skip(results[0].match_start)
        .take(results[0].match_length)
        .collect();
    assert_eq!(highlighted, "匹配");
}

#[test]
fn search_messages_skips_failed_sessions_and_keeps_other_results() {
    let config = MockConfigKernel::new();
    let sessions = vec![
        KernelSessionSummary {
            id: "dead-beef".to_string(),
            title: Some("Broken".to_string()),
            message_count: 1,
            updated_at: 123,
            pinned: false,
            archived: false,
        },
        KernelSessionSummary {
            id: "cafe-babe".to_string(),
            title: Some("Healthy".to_string()),
            message_count: 1,
            updated_at: 124,
            pinned: false,
            archived: false,
        },
    ];
    let engine = ChatEngine::new_with_kernel(
        Arc::new(SearchChatKernel {
            sessions,
            history_by_session: HashMap::from([(
                "cafe-babe".to_string(),
                vec![KernelSessionEvent {
                    role: "assistant".to_string(),
                    content: "healthy content match".to_string(),
                    reasoning: None,
                    attachments: None,
                    timestamp: 0,
                }],
            )]),
            failing_sessions: HashSet::from(["dead-beef".to_string()]),
        }),
        Arc::new(config),
    );

    let results = engine
        .search_messages("match")
        .expect("search should succeed");

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].conversation_id, "cafe-babe");
    assert_eq!(results[0].snippet, "healthy content match");
}

#[path = "chat_engine_validation.rs"]
mod validation;
