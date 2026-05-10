#![allow(dead_code)]

use super::error::KernelError;
use super::types::{
    KernelHookInfo, KernelMcpServerConfig, KernelMcpWorkspaceConfig, KernelSkillInfo,
    KernelToolInfo,
};

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

    // === Skills workspace management ===

    fn read_skill_content(
        &self,
        workspace_slug: &str,
        skill_slug: &str,
    ) -> Result<String, KernelError>;
    fn write_skill_content(
        &self,
        workspace_slug: &str,
        skill_slug: &str,
        content: &str,
    ) -> Result<(), KernelError>;
    fn toggle_workspace_skill(
        &self,
        workspace_slug: &str,
        skill_slug: &str,
        enabled: bool,
    ) -> Result<(), KernelError>;
    fn delete_workspace_skill(
        &self,
        workspace_slug: &str,
        skill_slug: &str,
    ) -> Result<(), KernelError>;
    fn get_workspace_skills(
        &self,
        workspace_slug: &str,
    ) -> Result<Vec<KernelSkillInfo>, KernelError>;
    fn get_workspace_skills_dir(&self, workspace_slug: &str) -> Result<String, KernelError>;
    fn get_other_workspace_skills(
        &self,
        workspace_slug: &str,
    ) -> Result<Vec<KernelSkillInfo>, KernelError>;
    fn import_skill_from_workspace(
        &self,
        from_slug: &str,
        to_slug: &str,
        skill_slug: &str,
    ) -> Result<(), KernelError>;

    // === MCP workspace management ===

    fn get_workspace_mcp_config(
        &self,
        workspace_slug: &str,
    ) -> Result<KernelMcpWorkspaceConfig, KernelError>;
    fn save_workspace_mcp_config(
        &self,
        workspace_slug: &str,
        config: &KernelMcpWorkspaceConfig,
    ) -> Result<(), KernelError>;

    // === CC SDK import ===

    fn import_cc_sdk_hooks(&self) -> Result<Vec<KernelHookInfo>, KernelError>;
    fn import_cc_sdk_mcp(
        &self,
        workspace_slug: &str,
    ) -> Result<Vec<KernelMcpServerConfig>, KernelError>;
}
