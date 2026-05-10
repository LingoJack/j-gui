#![allow(dead_code)]

use super::error::KernelError;
use super::types::{
    KernelHookInfo, KernelMcpServerConfig, KernelMcpWorkspaceConfig, KernelSkillInfo,
    KernelToolInfo,
};

/// Skills + Hooks + MCP + Chat Tools governance kernel trait.
#[cfg_attr(test, mockall::automock)]
pub trait GovernanceKernel: Send + Sync {
    /// List all loaded skills.
    fn list_skills(&self) -> Result<Vec<KernelSkillInfo>, KernelError>;
    /// Scan global directories for available skills.
    fn scan_global_skills(&self) -> Result<Vec<KernelSkillInfo>, KernelError>;
    /// Copy a skill from a global directory into a workspace.
    fn copy_skill_to_workspace(
        &self,
        source_dir: &str,
        workspace_slug: &str,
        skill_slug: &str,
    ) -> Result<(), KernelError>;

    /// List all registered hooks.
    fn list_hooks(&self) -> Result<Vec<KernelHookInfo>, KernelError>;
    /// Enable or disable a hook by unique ID.
    fn toggle_hook(&self, unique_id: &str, enabled: bool) -> Result<(), KernelError>;

    /// List all MCP server configurations.
    fn list_mcp_servers(&self) -> Result<Vec<KernelMcpServerConfig>, KernelError>;
    /// Persist MCP server configurations.
    fn save_mcp_servers(&self, servers: &[KernelMcpServerConfig]) -> Result<(), KernelError>;

    /// List all built-in chat tools.
    fn list_chat_tools(&self) -> Result<Vec<KernelToolInfo>, KernelError>;
    /// Enable or disable a chat tool by name.
    fn set_tool_enabled(&self, name: &str, enabled: bool) -> Result<(), KernelError>;

    // === Skills workspace management ===

    /// Read the SKILL.md content of a workspace skill.
    fn read_skill_content(
        &self,
        workspace_slug: &str,
        skill_slug: &str,
    ) -> Result<String, KernelError>;
    /// Write/replace the SKILL.md content of a workspace skill.
    fn write_skill_content(
        &self,
        workspace_slug: &str,
        skill_slug: &str,
        content: &str,
    ) -> Result<(), KernelError>;
    /// Enable or disable a workspace skill.
    fn toggle_workspace_skill(
        &self,
        workspace_slug: &str,
        skill_slug: &str,
        enabled: bool,
    ) -> Result<(), KernelError>;
    /// Remove a workspace skill directory.
    fn delete_workspace_skill(
        &self,
        workspace_slug: &str,
        skill_slug: &str,
    ) -> Result<(), KernelError>;
    /// List all skills within a workspace.
    fn get_workspace_skills(
        &self,
        workspace_slug: &str,
    ) -> Result<Vec<KernelSkillInfo>, KernelError>;
    /// Get (and create) the workspace skills directory path.
    fn get_workspace_skills_dir(&self, workspace_slug: &str) -> Result<String, KernelError>;
    /// List skills from other workspaces (excluding the given slug).
    fn get_other_workspace_skills(
        &self,
        workspace_slug: &str,
    ) -> Result<Vec<KernelSkillInfo>, KernelError>;
    /// Copy a skill from one workspace to another.
    fn import_skill_from_workspace(
        &self,
        from_slug: &str,
        to_slug: &str,
        skill_slug: &str,
    ) -> Result<(), KernelError>;

    // === MCP workspace management ===

    /// Load MCP config for a workspace.
    fn get_workspace_mcp_config(
        &self,
        workspace_slug: &str,
    ) -> Result<KernelMcpWorkspaceConfig, KernelError>;
    /// Persist MCP config for a workspace.
    fn save_workspace_mcp_config(
        &self,
        workspace_slug: &str,
        config: &KernelMcpWorkspaceConfig,
    ) -> Result<(), KernelError>;

    // === CC SDK import ===

    /// Import hooks from the CC SDK config directory.
    fn import_cc_sdk_hooks(&self) -> Result<Vec<KernelHookInfo>, KernelError>;
    /// Import MCP servers from the CC SDK config directory.
    fn import_cc_sdk_mcp(
        &self,
        workspace_slug: &str,
    ) -> Result<Vec<KernelMcpServerConfig>, KernelError>;
}
