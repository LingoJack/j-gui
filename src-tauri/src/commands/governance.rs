use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::kernel::{GovernanceKernel, JcliAdapter};
#[path = "governance_mcp.rs"]
mod governance_mcp;
#[path = "governance_types.rs"]
mod governance_types;
use governance_mcp as mcp_commands;
/// 治理命令使用的导出类型。
pub use governance_types::*;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// Skill 列表项。
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub source: String, // 可选值："user" | "project"
    pub dir_path: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// Hook 列表项。
pub struct HookInfo {
    pub name: Option<String>,
    pub event: String,     // 可选值："PreSendMessage" | "PostLlmResponse" | ...
    pub source: String,    // 可选值："builtin" | "user" | "project" | "session"
    pub hook_type: String, // 可选值："bash" | "llm" | "builtin"
    pub label: String,
    pub timeout: Option<u64>,
    pub on_error: Option<String>, // 可选值："skip" | "stop"
    pub unique_id: String,
    pub enabled: bool,
}

#[tauri::command]
/// 列出当前可见的全部 Skill。
pub fn list_skills(state: tauri::State<'_, Arc<JcliAdapter>>) -> Result<Vec<SkillInfo>, String> {
    list_skills_impl(state.governance())
}

fn list_skills_impl(kernel: &dyn GovernanceKernel) -> Result<Vec<SkillInfo>, String> {
    let skills = kernel.list_skills().map_err(|e| e.to_string())?;
    Ok(skills
        .into_iter()
        .map(|s| SkillInfo {
            name: s.name,
            description: s.description,
            source: s.source,
            dir_path: s.dir_path,
        })
        .collect())
}

#[tauri::command]
/// 列出当前可见的全部 Hook。
pub fn list_hooks(state: tauri::State<'_, Arc<JcliAdapter>>) -> Result<Vec<HookInfo>, String> {
    list_hooks_impl(state.governance())
}

fn list_hooks_impl(kernel: &dyn GovernanceKernel) -> Result<Vec<HookInfo>, String> {
    let hooks = kernel.list_hooks().map_err(|e| e.to_string())?;
    Ok(hooks
        .into_iter()
        .map(|h| HookInfo {
            name: h.name,
            event: h.event,
            source: h.source,
            hook_type: h.hook_type,
            label: h.label,
            timeout: h.timeout,
            on_error: h.on_error,
            unique_id: h.unique_id,
            enabled: h.enabled,
        })
        .collect())
}

// ===== MCP 配置 =====

#[tauri::command]
/// 列出全局 MCP 服务配置。
pub fn list_mcp_servers(
    state: tauri::State<'_, Arc<JcliAdapter>>,
) -> Result<Vec<McpServerConfig>, String> {
    let servers = state
        .governance()
        .list_mcp_servers()
        .map_err(|e| e.to_string())?;
    Ok(servers
        .into_iter()
        .map(|s| McpServerConfig {
            name: s.name,
            transport: s.transport,
            command: s.command,
            args: s.args,
            url: s.url,
            env: s.env,
            disabled: s.disabled,
        })
        .collect())
}

#[tauri::command]
/// 覆盖保存全局 MCP 服务配置。
pub fn save_mcp_servers(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    servers: Vec<McpServerConfig>,
) -> Result<(), String> {
    let kernel_servers = servers
        .iter()
        .map(|s| crate::kernel::types::KernelMcpServerConfig {
            name: s.name.clone(),
            transport: s.transport.clone(),
            command: s.command.clone(),
            args: s.args.clone(),
            url: s.url.clone(),
            env: s.env.clone(),
            disabled: s.disabled,
        })
        .collect::<Vec<_>>();
    state
        .governance()
        .save_mcp_servers(&kernel_servers)
        .map_err(|e| e.to_string())
}

// ===== 聊天工具 =====

#[tauri::command]
/// 列出全部聊天工具及其开关状态。
pub fn list_chat_tools(state: tauri::State<'_, Arc<JcliAdapter>>) -> Result<Vec<ToolInfo>, String> {
    let tools = state
        .governance()
        .list_chat_tools()
        .map_err(|e| e.to_string())?;
    Ok(tools
        .into_iter()
        .map(|t| ToolInfo {
            name: t.name,
            description: t.description,
            enabled: t.enabled,
        })
        .collect())
}

#[tauri::command]
/// 切换单个聊天工具的启用状态。
pub fn set_tool_enabled(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    name: String,
    enabled: bool,
) -> Result<(), String> {
    state
        .governance()
        .set_tool_enabled(&name, enabled)
        .map_err(|e| e.to_string())
}

// ===== 技能：全局扫描与导入 =====

const GLOBAL_SKILLS_SUBPATHS: &[&str] = &[".claude/agents/skills", ".agent/skills"];

fn validate_slug(s: &str) -> Result<(), String> {
    if s.is_empty()
        || s.contains("..")
        || s.contains('/')
        || s.contains('\\')
        || !s
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        return Err(format!("非法标识符: {}", s));
    }
    Ok(())
}

fn validate_source_dir(source_dir: &str) -> Result<PathBuf, String> {
    let source_path = std::fs::canonicalize(source_dir)
        .map_err(|e| format!("无法解析源路径 '{}': {}", source_dir, e))?;
    let home = crate::kernel::home_dir();
    let is_allowed = GLOBAL_SKILLS_SUBPATHS.iter().any(|subpath| {
        let base = home.join(subpath);
        // 基准路径也要做规范化，确保路径格式一致
        // 例如在 Windows 上去掉 \\?\ 前缀
        let base = std::fs::canonicalize(&base).unwrap_or(base);
        source_path.starts_with(&base)
    });
    if !is_allowed {
        return Err(format!("不允许的源路径: {}", source_dir));
    }
    Ok(source_path)
}

fn parse_skill_frontmatter(path: &Path) -> Option<(String, String)> {
    let content = fs::read_to_string(path).ok()?;
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return None;
    }
    let rest = &trimmed[3..];
    let end_idx = rest.find("\n---")?;
    let fm_str = rest[..end_idx].trim();

    let mut name = None;
    let mut description = None;
    for line in fm_str.lines() {
        let line = line.trim();
        if let Some((key, value)) = line.split_once(':') {
            let value = value.trim();
            match key.trim() {
                "name" => name = Some(value.to_string()),
                "description" => description = Some(value.to_string()),
                _ => {}
            }
        }
    }

    let name = name?;
    let description = description.unwrap_or_default();
    Some((name, description))
}

fn scan_skills_dir(home_dir: &Path, subpath: &str) -> Vec<SkillInfo> {
    let dir = home_dir.join(subpath);
    if !dir.is_dir() {
        return Vec::new();
    }
    let mut skills = Vec::new();
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("警告: 读取技能目录失败 {}: {}", dir.display(), e);
            return skills;
        }
    };
    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                eprintln!("警告: 读取目录项失败: {}", e);
                continue;
            }
        };
        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(e) => {
                eprintln!("警告: 无法获取文件类型: {}", e);
                continue;
            }
        };
        if !file_type.is_dir() {
            continue;
        }
        let path = entry.path();
        let skill_md = path.join("SKILL.md");
        if !skill_md.exists() {
            continue;
        }
        if let Some((name, description)) = parse_skill_frontmatter(&skill_md) {
            let dir_name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let source = format!("global:{}/{}", subpath, dir_name);
            skills.push(SkillInfo {
                name,
                description,
                source,
                dir_path: path.to_string_lossy().to_string(),
            });
        }
    }
    skills
}

#[tauri::command]
/// 扫描用户全局技能目录中的可导入 Skill。
pub fn scan_global_skills() -> Result<Vec<SkillInfo>, String> {
    let home = crate::kernel::home_dir();
    let mut skills = Vec::new();
    for subpath in GLOBAL_SKILLS_SUBPATHS {
        skills.extend(scan_skills_dir(&home, subpath));
    }
    Ok(skills)
}

#[tauri::command]
/// 将一个全局 Skill 复制到指定工作区。
pub fn copy_skill_to_workspace(
    source_dir: String,
    workspace_slug: String,
    skill_slug: String,
) -> Result<(), String> {
    validate_slug(&workspace_slug)?;
    validate_slug(&skill_slug)?;
    let source_path = validate_source_dir(&source_dir)?;

    let source_skill_md = source_path.join("SKILL.md");
    if !source_skill_md.exists() {
        return Err(format!("源 SKILL.md 不存在: {}", source_skill_md.display()));
    }

    let home = crate::kernel::home_dir();
    let target_base = home
        .join(".jgui")
        .join("agent-workspaces")
        .join(&workspace_slug)
        .join("skills")
        .join(&skill_slug);
    fs::create_dir_all(&target_base).map_err(|e| format!("创建目标目录失败: {}", e))?;

    let target_skill_md = target_base.join("SKILL.md");

    fs::copy(&source_skill_md, &target_skill_md)
        .map_err(|e| format!("复制 SKILL.md 失败: {}", e))?;

    Ok(())
}

// ===== 治理命令（#28） =====

#[tauri::command]
/// 切换指定 Hook 的启用状态。
pub fn toggle_hook(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    unique_id: String,
    enabled: bool,
) -> Result<(), String> {
    state
        .governance()
        .toggle_hook(&unique_id, enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
/// 读取工作区 Skill 的原始内容。
pub fn read_skill_content(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    workspace_slug: String,
    skill_slug: String,
) -> Result<String, String> {
    state
        .governance()
        .read_skill_content(&workspace_slug, &skill_slug)
        .map_err(|e| e.to_string())
}

#[tauri::command]
/// 覆盖保存工作区 Skill 的原始内容。
pub fn write_skill_content(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    workspace_slug: String,
    skill_slug: String,
    content: String,
) -> Result<(), String> {
    state
        .governance()
        .write_skill_content(&workspace_slug, &skill_slug, &content)
        .map_err(|e| e.to_string())
}

#[tauri::command]
/// 切换工作区 Skill 的启用状态。
pub fn toggle_workspace_skill(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    workspace_slug: String,
    skill_slug: String,
    enabled: bool,
) -> Result<(), String> {
    state
        .governance()
        .toggle_workspace_skill(&workspace_slug, &skill_slug, enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
/// 删除一个工作区 Skill。
pub fn delete_workspace_skill(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    workspace_slug: String,
    skill_slug: String,
) -> Result<(), String> {
    state
        .governance()
        .delete_workspace_skill(&workspace_slug, &skill_slug)
        .map_err(|e| e.to_string())
}

#[tauri::command]
/// 列出指定工作区下的全部 Skill。
pub fn get_workspace_skills(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    workspace_slug: String,
) -> Result<Vec<SkillInfo>, String> {
    let skills = state
        .governance()
        .get_workspace_skills(&workspace_slug)
        .map_err(|e| e.to_string())?;
    Ok(skills
        .into_iter()
        .map(|s| SkillInfo {
            name: s.name,
            description: s.description,
            source: s.source,
            dir_path: s.dir_path,
        })
        .collect())
}

#[tauri::command]
/// 返回指定工作区的 Skill 目录路径。
pub fn get_workspace_skills_dir(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    workspace_slug: String,
) -> Result<String, String> {
    state
        .governance()
        .get_workspace_skills_dir(&workspace_slug)
        .map_err(|e| e.to_string())
}

#[tauri::command]
/// 列出除当前工作区外其他工作区的 Skill。
pub fn get_other_workspace_skills(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    current_slug: String,
) -> Result<Vec<SkillInfo>, String> {
    let skills = state
        .governance()
        .get_other_workspace_skills(&current_slug)
        .map_err(|e| e.to_string())?;
    Ok(skills
        .into_iter()
        .map(|s| SkillInfo {
            name: s.name,
            description: s.description,
            source: s.source,
            dir_path: s.dir_path,
        })
        .collect())
}

#[tauri::command]
/// 从另一个工作区导入一个 Skill 到当前工作区。
pub fn import_skill_from_workspace(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    target_slug: String,
    source_slug: String,
    skill_slug: String,
) -> Result<(), String> {
    state
        .governance()
        .import_skill_from_workspace(&source_slug, &target_slug, &skill_slug)
        .map_err(|e| e.to_string())
}

#[tauri::command]
/// 读取指定工作区的 MCP 配置。
pub fn get_workspace_mcp_config(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    workspace_slug: String,
) -> Result<McpWorkspaceConfig, String> {
    mcp_commands::get_workspace_mcp_config(state, workspace_slug)
}

#[tauri::command]
/// 保存指定工作区的 MCP 配置。
pub fn save_workspace_mcp_config(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    workspace_slug: String,
    config: McpWorkspaceConfig,
) -> Result<(), String> {
    mcp_commands::save_workspace_mcp_config(state, workspace_slug, config)
}

#[tauri::command]
/// 读取指定工作区的聚合能力视图。
pub fn get_workspace_capabilities(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    workspace_slug: String,
) -> Result<WorkspaceCapabilities, String> {
    mcp_commands::get_workspace_capabilities(state, workspace_slug)
}

#[tauri::command]
/// 测试单条 MCP 服务配置是否可用。
pub fn test_mcp_server(
    name: String,
    entry: serde_json::Value,
) -> Result<ConnectionTestResult, String> {
    mcp_commands::test_mcp_server(name, entry)
}

#[tauri::command]
/// 从 CC SDK 导入 Hook 配置。
pub fn import_cc_sdk_hooks(
    state: tauri::State<'_, Arc<JcliAdapter>>,
) -> Result<Vec<HookInfo>, String> {
    let hooks = state
        .governance()
        .import_cc_sdk_hooks()
        .map_err(|e| e.to_string())?;
    Ok(hooks
        .into_iter()
        .map(|h| HookInfo {
            name: h.name,
            event: h.event,
            source: h.source,
            hook_type: h.hook_type,
            label: h.label,
            timeout: h.timeout,
            on_error: h.on_error,
            unique_id: h.unique_id,
            enabled: h.enabled,
        })
        .collect())
}

#[tauri::command]
/// 从 CC SDK 导入 MCP 配置。
pub fn import_cc_sdk_mcp(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    workspace_slug: String,
) -> Result<Vec<McpServerConfig>, String> {
    let servers = state
        .governance()
        .import_cc_sdk_mcp(&workspace_slug)
        .map_err(|e| e.to_string())?;
    Ok(servers
        .into_iter()
        .map(|s| McpServerConfig {
            name: s.name,
            transport: s.transport,
            command: s.command,
            args: s.args,
            url: s.url,
            env: s.env,
            disabled: s.disabled,
        })
        .collect())
}

#[cfg(test)]
#[path = "../tests/commands_governance.rs"]
mod tests;
