use super::*;
use crate::kernel::types::{KernelSessionEvent, KernelSessionSummary};
use async_trait::async_trait;

pub(super) struct HistoryChatKernel {
    pub(super) history: Vec<KernelSessionEvent>,
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
