use async_trait::async_trait;

use super::error::KernelError;
use super::types::{KernelChatMessage, KernelProvider, KernelSessionEvent, KernelSessionSummary};

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

    /// Persist a message event to the session transcript.
    fn append_message(
        &self,
        session_id: &str,
        role: &str,
        content: &str,
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
