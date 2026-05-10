#![allow(dead_code)]

/// Unified error type for kernel traits.
#[derive(Debug, thiserror::Error)]
pub enum KernelError {
    /// Configuration-related error.
    #[error("config error: {0}")]
    Config(String),
    /// Chat/LLM call error with source.
    #[error("chat error: {0}")]
    Chat(#[source] Box<dyn std::error::Error + Send + Sync>),
    /// Governance operation error.
    #[error("governance error: {0}")]
    Governance(String),
    /// Unsupported operation error.
    #[error("unsupported: {0}")]
    Unsupported(String),
    /// I/O operation error (auto-converted from std::io::Error).
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

/// Convert a string into a [`KernelError::Config`] variant.
impl From<String> for KernelError {
    fn from(s: String) -> Self {
        KernelError::Config(s)
    }
}
