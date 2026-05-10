#![allow(dead_code)]

use async_trait::async_trait;

use super::error::KernelError;
use super::types::{
    KernelAgentParams, KernelChatMessage, KernelProvider, KernelSessionEvent, KernelSessionSummary,
};

/// Chat + Session kernel trait.
/// Requires Send + Sync so Arc<dyn ChatKernel> is Send (needed for thread::spawn).
/// The ?Send on async_trait allows the streaming callback to be !Send (jcli requirement).
#[async_trait(?Send)]
pub trait ChatKernel: Send + Sync {
    /// Stream LLM response. Each text delta is delivered via `on_chunk`.
    /// Returns the full response text on success.
    async fn stream_chat(
        &self,
        provider: &KernelProvider,
        messages: &[KernelChatMessage],
        system_prompt: Option<&str>,
        on_chunk: &mut dyn for<'a> FnMut(&'a str),
    ) -> Result<String, KernelError>;

    /// Run the jcli agent loop directly through the kernel.
    /// The agent loop handles multi-round tool calling, streaming,
    /// auto-compact, and interrupt handling.
    /// Events are streamed as JSON strings through `params.on_event`.
    async fn run_agent_loop(&self, params: KernelAgentParams) -> Result<(), KernelError>;

    /// Persist a message event to the session transcript.
    fn append_message(
        &self,
        session_id: &str,
        role: &str,
        content: &str,
    ) -> Result<(), KernelError>;

    // -- Session CRUD --

    /// List all session summaries.
    fn list_sessions(&self) -> Result<Vec<KernelSessionSummary>, KernelError>;
    /// Load session events by session ID.
    fn get_session(&self, session_id: &str) -> Result<Vec<KernelSessionEvent>, KernelError>;
    /// Create a new session and return its ID.
    fn create_session(&self) -> Result<String, KernelError>;
    /// Delete a session by ID.
    fn delete_session(&self, session_id: &str) -> Result<(), KernelError>;
    /// Delete a user/assistant message pair by index.
    fn delete_message(&self, session_id: &str, pair_index: usize) -> Result<(), KernelError>;
    /// Clear all messages from a session.
    fn clear_session(&self, session_id: &str) -> Result<(), KernelError>;

    /// Toggle the pinned state of a session. Returns the updated summary.
    fn toggle_pin(&self, session_id: &str) -> Result<KernelSessionSummary, KernelError>;

    /// Toggle the archived state of a session. Returns the updated summary.
    fn toggle_archive(&self, session_id: &str) -> Result<KernelSessionSummary, KernelError>;
}

// Unit tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kernel_error_display() {
        let err = KernelError::Chat("test error".into());
        assert!(format!("{}", err).contains("chat error"));
    }

    #[test]
    fn kernel_error_io_conversion() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let kernel_err: KernelError = io_err.into();
        assert!(format!("{}", kernel_err).contains("io error"));
    }

    #[test]
    fn kernel_error_from_string() {
        let err: KernelError = "config broken".to_string().into();
        assert!(format!("{}", err).contains("config error"));
    }
}
