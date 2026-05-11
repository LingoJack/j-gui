#![allow(dead_code)]

/// kernel trait 统一使用的错误类型。
#[derive(Debug, thiserror::Error)]
pub enum KernelError {
    /// 配置相关错误。
    #[error("config error: {0}")]
    Config(String),
    /// 聊天 / LLM 调用错误，保留原始错误来源。
    #[error("chat error: {0}")]
    Chat(#[source] Box<dyn std::error::Error + Send + Sync>),
    /// 治理层操作错误。
    #[error("governance error: {0}")]
    Governance(String),
    /// 不支持的操作错误。
    #[error("unsupported: {0}")]
    Unsupported(String),
    /// I/O 操作错误（可由 `std::io::Error` 自动转换）。
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

/// 把字符串转换成 [`KernelError::Config`] 变体。
impl From<String> for KernelError {
    fn from(s: String) -> Self {
        KernelError::Config(s)
    }
}
