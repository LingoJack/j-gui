use super::*;
use crate::kernel::config::MockConfigKernel;
use crate::kernel::types::{KernelSessionEvent, KernelSessionSummary};
use async_trait::async_trait;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

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
