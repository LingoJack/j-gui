#![allow(dead_code)]

use super::error::KernelError;
use super::types::{
    KernelHookInfo, KernelMcpServerConfig, KernelMcpWorkspaceConfig, KernelSkillInfo,
    KernelToolInfo,
};

/// 技能、钩子、MCP 与聊天工具共用的治理层 kernel trait。
#[cfg_attr(test, mockall::automock)]
pub trait GovernanceKernel: Send + Sync {
    /// 列出所有已加载的技能。
    fn list_skills(&self) -> Result<Vec<KernelSkillInfo>, KernelError>;
    /// 扫描全局目录中可用的技能。
    fn scan_global_skills(&self) -> Result<Vec<KernelSkillInfo>, KernelError>;
    /// 把全局目录中的技能复制到某个工作区。
    fn copy_skill_to_workspace(
        &self,
        source_dir: &str,
        workspace_slug: &str,
        skill_slug: &str,
    ) -> Result<(), KernelError>;

    /// 列出所有已注册的钩子。
    fn list_hooks(&self) -> Result<Vec<KernelHookInfo>, KernelError>;
    /// 按唯一 ID 启用或禁用钩子。
    fn toggle_hook(&self, unique_id: &str, enabled: bool) -> Result<(), KernelError>;

    /// 列出全部 MCP 服务配置。
    fn list_mcp_servers(&self) -> Result<Vec<KernelMcpServerConfig>, KernelError>;
    /// 持久化保存 MCP 服务配置。
    fn save_mcp_servers(&self, servers: &[KernelMcpServerConfig]) -> Result<(), KernelError>;

    /// 列出全部内置聊天工具。
    fn list_chat_tools(&self) -> Result<Vec<KernelToolInfo>, KernelError>;
    /// 按名称启用或禁用聊天工具。
    fn set_tool_enabled(&self, name: &str, enabled: bool) -> Result<(), KernelError>;
    /// 返回当前全局禁用的 Skill slug 列表。
    fn get_disabled_skill_slugs(&self) -> Result<Vec<String>, KernelError>;

    // === 技能工作区管理 ===

    /// 读取工作区技能的 `SKILL.md` 内容。
    fn read_skill_content(
        &self,
        workspace_slug: &str,
        skill_slug: &str,
    ) -> Result<String, KernelError>;
    /// 写入或替换工作区技能的 `SKILL.md` 内容。
    fn write_skill_content(
        &self,
        workspace_slug: &str,
        skill_slug: &str,
        content: &str,
    ) -> Result<(), KernelError>;
    /// 启用或禁用工作区技能。
    fn toggle_workspace_skill(
        &self,
        workspace_slug: &str,
        skill_slug: &str,
        enabled: bool,
    ) -> Result<(), KernelError>;
    /// 删除工作区技能目录。
    fn delete_workspace_skill(
        &self,
        workspace_slug: &str,
        skill_slug: &str,
    ) -> Result<(), KernelError>;
    /// 列出某个工作区中的全部技能。
    fn get_workspace_skills(
        &self,
        workspace_slug: &str,
    ) -> Result<Vec<KernelSkillInfo>, KernelError>;
    /// 获取工作区技能目录路径；必要时负责创建。
    fn get_workspace_skills_dir(&self, workspace_slug: &str) -> Result<String, KernelError>;
    /// 列出其他工作区的技能（排除给定 slug）。
    fn get_other_workspace_skills(
        &self,
        workspace_slug: &str,
    ) -> Result<Vec<KernelSkillInfo>, KernelError>;
    /// 把一个工作区中的技能复制到另一个工作区。
    fn import_skill_from_workspace(
        &self,
        from_slug: &str,
        to_slug: &str,
        skill_slug: &str,
    ) -> Result<(), KernelError>;

    // === MCP 工作区管理 ===

    /// 读取某个工作区的 MCP 配置。
    fn get_workspace_mcp_config(
        &self,
        workspace_slug: &str,
    ) -> Result<KernelMcpWorkspaceConfig, KernelError>;
    /// 持久化保存某个工作区的 MCP 配置。
    fn save_workspace_mcp_config(
        &self,
        workspace_slug: &str,
        config: &KernelMcpWorkspaceConfig,
    ) -> Result<(), KernelError>;

    // === CC SDK 导入 ===

    /// 从 CC SDK 配置目录导入钩子。
    fn import_cc_sdk_hooks(&self) -> Result<Vec<KernelHookInfo>, KernelError>;
    /// 从 CC SDK 配置目录导入 MCP 服务。
    fn import_cc_sdk_mcp(
        &self,
        workspace_slug: &str,
    ) -> Result<Vec<KernelMcpServerConfig>, KernelError>;
}
