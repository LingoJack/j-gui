use super::error::KernelError;
use super::types::{KernelHookInfo, KernelMcpServerConfig, KernelSkillInfo, KernelToolInfo};

/// Skills + Hooks + MCP + Chat Tools governance kernel trait.
#[cfg_attr(test, mockall::automock)]
pub trait GovernanceKernel: Send + Sync {
    // -- Skills --

    fn list_skills(&self) -> Result<Vec<KernelSkillInfo>, KernelError>;
    fn scan_global_skills(&self) -> Result<Vec<KernelSkillInfo>, KernelError>;
    fn copy_skill_to_workspace(
        &self,
        source_dir: &str,
        workspace_slug: &str,
        skill_slug: &str,
    ) -> Result<(), KernelError>;

    // -- Hooks --

    fn list_hooks(&self) -> Result<Vec<KernelHookInfo>, KernelError>;
    fn toggle_hook(&self, unique_id: &str, enabled: bool) -> Result<(), KernelError>;

    // -- MCP --

    fn list_mcp_servers(&self) -> Result<Vec<KernelMcpServerConfig>, KernelError>;
    fn save_mcp_servers(&self, servers: &[KernelMcpServerConfig]) -> Result<(), KernelError>;

    // -- Chat Tools --

    fn list_chat_tools(&self) -> Result<Vec<KernelToolInfo>, KernelError>;
    fn set_tool_enabled(&self, name: &str, enabled: bool) -> Result<(), KernelError>;
}
