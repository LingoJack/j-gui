// pub mod adapter; // uncomment when adapter type matching is complete
pub mod chat;
pub mod config;
pub mod error;
pub mod governance;
pub mod types;

// pub use adapter::JcliAdapter; — uncomment when adapter type matching is complete

#[allow(unused_imports)]
pub use chat::ChatKernel;
#[allow(unused_imports)]
pub use config::ConfigKernel;
#[allow(unused_imports)]
pub use error::KernelError;
#[allow(unused_imports)]
pub use governance::GovernanceKernel;
