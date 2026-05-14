/// j-cli 适配器实现。
pub mod adapter;
/// 聊天内核 trait 与请求结构。
pub mod chat;
/// 配置内核 trait。
pub mod config;
/// 内核统一错误类型。
pub mod error;
/// 治理内核 trait。
pub mod governance;
/// 协议路由与协议族辅助逻辑。
pub mod protocol;
/// kernel 层共享领域类型。
pub mod types;

/// 默认的 j-cli 适配器实现。
pub use adapter::JcliAdapter;

/// 获取用户主目录。
/// 会按平台选择环境变量：Windows 使用 `USERPROFILE`，Unix 使用 `HOME`。
/// 如果环境变量缺失，则回退到 `C:\`（Windows）或 `/tmp`（Unix）。
pub fn home_dir() -> std::path::PathBuf {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|_| std::path::PathBuf::from("C:\\"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|_| std::path::PathBuf::from("/tmp"))
    }
}

#[allow(unused_imports)]
/// 聊天内核 trait。
pub use chat::ChatKernel;
#[allow(unused_imports)]
/// 配置内核 trait。
pub use config::ConfigKernel;
#[allow(unused_imports)]
/// 内核统一错误类型。
pub use error::KernelError;
#[allow(unused_imports)]
/// 治理内核 trait。
pub use governance::GovernanceKernel;
