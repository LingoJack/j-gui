pub mod adapter;
pub mod chat;
pub mod config;
pub mod error;
pub mod governance;
pub mod types;

pub use adapter::JcliAdapter;

/// Get the user home directory.
/// Platform-aware: uses `USERPROFILE` on Windows, `HOME` on Unix.
/// Falls back to `C:\` (Windows) or `/tmp` (Unix) if env var is unset.
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
