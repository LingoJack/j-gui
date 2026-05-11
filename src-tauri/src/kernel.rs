pub mod adapter;
pub mod chat;
pub mod config;
pub mod error;
pub mod governance;
pub mod protocol;
pub mod types;

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
pub use chat::ChatKernel;
#[allow(unused_imports)]
pub use config::ConfigKernel;
#[allow(unused_imports)]
pub use error::KernelError;
#[allow(unused_imports)]
pub use governance::GovernanceKernel;
