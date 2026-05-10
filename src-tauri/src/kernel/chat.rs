use async_trait::async_trait;
use tauri::ipc::Channel;

use super::error::KernelError;
use super::types::{KernelChatMessage, KernelProvider, KernelSessionEvent, KernelSessionSummary};

/// Chat + Session kernel trait.
// mockall::automock unavailable: stream_chat takes Channel<String> (not Clone).
// Use mockall::mock! macro for manual mock when writing kernel-based tests.
#[async_trait]
pub trait ChatKernel: Send + Sync {
    /// Stream LLM response via Channel<String>. Each chunk is a text delta.
    async fn stream_chat(
        &self,
        provider: &KernelProvider,
        messages: &[KernelChatMessage],
        system_prompt: Option<&str>,
        on_event: Channel<String>,
    ) -> Result<(), KernelError>;

    // -- Session CRUD --

    fn list_sessions(&self) -> Result<Vec<KernelSessionSummary>, KernelError>;
    fn get_session(&self, session_id: &str) -> Result<Vec<KernelSessionEvent>, KernelError>;
    fn create_session(&self) -> Result<String, KernelError>;
    fn delete_session(&self, session_id: &str) -> Result<(), KernelError>;
    fn delete_message(&self, session_id: &str, pair_index: usize) -> Result<(), KernelError>;
    fn clear_session(&self, session_id: &str) -> Result<(), KernelError>;
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
