/// Unified error type for kernel traits.
#[derive(Debug, thiserror::Error)]
pub enum KernelError {
    #[error("config error: {0}")]
    Config(String),
    #[error("chat error: {0}")]
    Chat(#[source] Box<dyn std::error::Error + Send + Sync>),
    #[error("governance error: {0}")]
    Governance(String),
    #[error("unsupported: {0}")]
    Unsupported(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

impl From<String> for KernelError {
    fn from(s: String) -> Self {
        KernelError::Config(s)
    }
}
