use j_cli::command::chat::storage::{load_agent_config, save_agent_config};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use crate::kernel::{GovernanceKernel, JcliAdapter};

fn home_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE").ok().map(PathBuf::from)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME").ok().map(PathBuf::from)
    }
}

static GOVERNANCE_CONFIG_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub source: String, // "user" | "project"
    pub dir_path: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookInfo {
    pub name: Option<String>,
    pub event: String,     // "PreSendMessage" | "PostLlmResponse" | ...
    pub source: String,    // "builtin" | "user" | "project" | "session"
    pub hook_type: String, // "bash" | "llm" | "builtin"
    pub label: String,
    pub timeout: Option<u64>,
    pub on_error: Option<String>, // "skip" | "stop"
    pub unique_id: String,
    pub enabled: bool,
}

#[tauri::command]
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

// ===== MCP Config =====

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    pub name: String,
    pub transport: String, // "stdio" | "sse"
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub url: Option<String>,
    pub env: Option<std::collections::HashMap<String, String>>,
    pub disabled: bool,
}

fn mcp_config_path() -> PathBuf {
    j_cli::config::YamlConfig::data_dir()
        .join("agent")
        .join("mcp_config.json")
}

#[tauri::command]
pub fn list_mcp_servers() -> Result<Vec<McpServerConfig>, String> {
    let path = mcp_config_path();
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取 MCP 配置失败: {}", e))?;
    let value: Value =
        serde_json::from_str(&content).map_err(|e| format!("解析 MCP 配置失败: {}", e))?;
    let servers = value
        .as_array()
        .ok_or_else(|| "MCP 配置格式错误: 顶层必须是数组".to_string())?;

    servers
        .iter()
        .map(|item| {
            serde_json::from_value(item.clone()).map_err(|e| format!("解析 MCP server 失败: {}", e))
        })
        .collect()
}

#[tauri::command]
pub fn save_mcp_servers(servers: Vec<McpServerConfig>) -> Result<(), String> {
    let _lock = GOVERNANCE_CONFIG_LOCK
        .lock()
        .map_err(|e| format!("锁定 MCP 配置失败: {}", e))?;
    let path = mcp_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    let existing = if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| format!("读取 MCP 配置失败: {}", e))?;
        serde_json::from_str::<Vec<McpServerConfig>>(&content)
            .map_err(|e| format!("解析 MCP 配置失败: {}", e))?
    } else {
        Vec::new()
    };

    let merged = merge_mcp_config(&existing, &servers);
    let content =
        serde_json::to_string_pretty(&merged).map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("写入 MCP 配置失败: {}", e))
}

/// Merge incoming MCP server configs into existing ones by name.
/// Existing servers not present in `incoming` are removed from the result.
/// For servers with the same name, incoming values overwrite existing ones;
/// existing values are preserved only where incoming has `None` for optional fields.
fn merge_mcp_config(
    existing: &[McpServerConfig],
    incoming: &[McpServerConfig],
) -> Vec<McpServerConfig> {
    let mut by_name: HashMap<&str, &McpServerConfig> = HashMap::new();
    for s in existing {
        by_name.entry(s.name.as_str()).or_insert(s);
    }

    incoming
        .iter()
        .map(|server| {
            if let Some(existing_server) = by_name.get(server.name.as_str()) {
                McpServerConfig {
                    command: server
                        .command
                        .clone()
                        .or_else(|| existing_server.command.clone()),
                    args: server.args.clone().or_else(|| existing_server.args.clone()),
                    url: server.url.clone().or_else(|| existing_server.url.clone()),
                    env: server.env.clone().or_else(|| existing_server.env.clone()),
                    ..server.clone()
                }
            } else {
                server.clone()
            }
        })
        .collect()
}

// ===== Chat Tools =====

/// 内置工具目录 — 名称和描述与 j-cli ToolRegistry 中注册的工具一一对应
static BUILTIN_TOOLS: &[(&str, &str)] = &[
    (
        "PowerShell",
        "Execute PowerShell commands on the current Windows system, returning stdout and stderr.",
    ),
    (
        "Read",
        "Read a file from the local filesystem. Supports line range, pagination, and image files.",
    ),
    (
        "Write",
        "Write content to a file. Creates the file and parent directories if they don't exist.",
    ),
    (
        "Edit",
        "Perform exact string replacements in files. Supports bulk replacement with two-step confirmation.",
    ),
    (
        "Glob",
        "Fast file pattern matching tool using glob syntax to find files by name.",
    ),
    (
        "Grep",
        "Regex-based search tool for searching within file contents.",
    ),
    (
        "WebFetch",
        "Fetch content from a URL and convert HTML to Markdown or plain text.",
    ),
    (
        "WebSearch",
        "Search the web for up-to-date information using the Exa Search API.",
    ),
    (
        "Browser",
        "Browser automation tool for web browsing, interaction, and content extraction via CDP.",
    ),
    (
        "Ask",
        "Present structured questions to the user with single-select or multi-select options.",
    ),
    (
        "TaskOutput",
        "Retrieve output from a running or completed background task.",
    ),
    (
        "Task",
        "Manage tasks with create, get, list, and update operations.",
    ),
    (
        "TodoWrite",
        "Create and manage a structured todo list to maintain state across long turns.",
    ),
    (
        "TodoRead",
        "Read and list all current todo items with their id, content, and status.",
    ),
    (
        "Compact",
        "Trigger conversation compression to free up context window.",
    ),
    (
        "RegisterHook",
        "Register, list, or remove session-level hooks.",
    ),
    (
        "EnterPlanMode",
        "Enter plan mode to explore the codebase and design an implementation approach before writing code.",
    ),
    (
        "ExitPlanMode",
        "Exit plan mode and submit the plan for user approval.",
    ),
    (
        "EnterWorktree",
        "Create an isolated git worktree and switch the session into it.",
    ),
    (
        "ExitWorktree",
        "Exit the current worktree session, keeping or removing it.",
    ),
    (
        "LoadSkill",
        "Load the full content of a specified skill into context.",
    ),
];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub name: String,
    pub description: String,
    pub enabled: bool,
}

#[tauri::command]
pub fn list_chat_tools() -> Result<Vec<ToolInfo>, String> {
    let config = load_agent_config();
    let disabled = &config.disabled_tools;
    let tools: Vec<ToolInfo> = BUILTIN_TOOLS
        .iter()
        .map(|&(name, desc)| ToolInfo {
            name: name.to_string(),
            description: desc.to_string(),
            enabled: !disabled.iter().any(|d| d == name),
        })
        .collect();
    Ok(tools)
}

#[tauri::command]
pub fn set_tool_enabled(name: String, enabled: bool) -> Result<(), String> {
    let _lock = GOVERNANCE_CONFIG_LOCK
        .lock()
        .map_err(|e| format!("锁定配置失败: {}", e))?;
    let mut config = load_agent_config();
    let exists = BUILTIN_TOOLS.iter().any(|&(n, _)| n == name);
    if !exists {
        return Err(format!("未知工具: {}", name));
    }
    if enabled {
        config.disabled_tools.retain(|d| d != &name);
    } else if !config.disabled_tools.iter().any(|d| d == &name) {
        config.disabled_tools.push(name);
    }
    if save_agent_config(&config) {
        Ok(())
    } else {
        Err("保存配置失败".to_string())
    }
}

// ===== Skills: Global scan & import =====

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
    let home = home_dir().ok_or_else(|| "无法获取 home 目录".to_string())?;
    let is_allowed = GLOBAL_SKILLS_SUBPATHS.iter().any(|subpath| {
        let base = home.join(subpath);
        // Canonicalize the base as well to ensure consistent format
        // (e.g. strips \\?\ prefix on Windows)
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
pub fn scan_global_skills() -> Result<Vec<SkillInfo>, String> {
    let home = home_dir().ok_or_else(|| "无法获取 home 目录".to_string())?;
    let mut skills = Vec::new();
    for subpath in GLOBAL_SKILLS_SUBPATHS {
        skills.extend(scan_skills_dir(&home, subpath));
    }
    Ok(skills)
}

#[tauri::command]
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

    let home = home_dir().ok_or_else(|| "无法获取 home 目录".to_string())?;
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

// ===== Governance Commands (#28) =====

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpWorkspaceConfig {
    pub servers: Vec<McpServerConfig>,
}

#[tauri::command]
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
pub fn get_workspace_mcp_config(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    workspace_slug: String,
) -> Result<McpWorkspaceConfig, String> {
    let config = state
        .governance()
        .get_workspace_mcp_config(&workspace_slug)
        .map_err(|e| e.to_string())?;
    Ok(McpWorkspaceConfig {
        servers: config
            .servers
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
            .collect(),
    })
}

#[tauri::command]
pub fn save_workspace_mcp_config(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    workspace_slug: String,
    config: McpWorkspaceConfig,
) -> Result<(), String> {
    let kernel_config = crate::kernel::types::KernelMcpWorkspaceConfig {
        servers: config
            .servers
            .into_iter()
            .map(|s| crate::kernel::types::KernelMcpServerConfig {
                name: s.name,
                transport: s.transport,
                command: s.command,
                args: s.args,
                url: s.url,
                env: s.env,
                disabled: s.disabled,
            })
            .collect(),
    };
    state
        .governance()
        .save_workspace_mcp_config(&workspace_slug, &kernel_config)
        .map_err(|e| e.to_string())
}

#[tauri::command]
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
mod tests {
    use super::*;
    use std::io::Write;

    use crate::kernel::error::KernelError;
    use crate::kernel::governance::MockGovernanceKernel;
    use crate::kernel::types::{KernelHookInfo, KernelSkillInfo};

    #[test]
    fn test_parse_skill_frontmatter_valid() {
        let dir = std::env::temp_dir().join("j-gui-test-parse-fm");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("SKILL.md");
        let mut file = fs::File::create(&path).unwrap();
        writeln!(file, "---").unwrap();
        writeln!(file, "name: Test Skill").unwrap();
        writeln!(file, "description: A test skill").unwrap();
        writeln!(file, "---").unwrap();
        writeln!(file, "This is the body").unwrap();
        drop(file);

        let result = parse_skill_frontmatter(&path);
        assert!(result.is_some());
        let (name, desc) = result.unwrap();
        assert_eq!(name, "Test Skill");
        assert_eq!(desc, "A test skill");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_parse_skill_frontmatter_invalid() {
        let dir = std::env::temp_dir().join("j-gui-test-parse-fm-invalid");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("SKILL.md");
        let mut file = fs::File::create(&path).unwrap();
        writeln!(file, "No frontmatter here").unwrap();
        writeln!(file, "Just content").unwrap();
        drop(file);

        let result = parse_skill_frontmatter(&path);
        assert!(result.is_none());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_parse_skill_frontmatter_no_name() {
        let dir = std::env::temp_dir().join("j-gui-test-parse-fm-noname");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("SKILL.md");
        let mut file = fs::File::create(&path).unwrap();
        writeln!(file, "---").unwrap();
        writeln!(file, "description: No name here").unwrap();
        writeln!(file, "---").unwrap();
        writeln!(file, "Body").unwrap();
        drop(file);

        // Without name field, should return None
        let result = parse_skill_frontmatter(&path);
        assert!(result.is_none());

        let _ = fs::remove_dir_all(&dir);
    }

    // === validate_slug tests ===
    #[test]
    fn test_validate_slug_valid() {
        assert!(validate_slug("my-skill").is_ok());
        assert!(validate_slug("MySkill_123").is_ok());
        assert!(validate_slug("test").is_ok());
        assert!(validate_slug("a-b_c").is_ok());
    }

    #[test]
    fn test_validate_slug_empty() {
        assert!(validate_slug("").is_err());
    }

    #[test]
    fn test_validate_slug_path_traversal() {
        assert!(validate_slug("..").is_err());
        assert!(validate_slug("a/b").is_err());
        assert!(validate_slug("a\\b").is_err());
    }

    #[test]
    fn test_validate_slug_special_chars() {
        assert!(validate_slug("a b").is_err());
        assert!(validate_slug("a.b").is_err());
    }

    // === scan_skills_dir tests ===
    #[test]
    fn test_scan_skills_dir_nonexistent() {
        let dir = std::env::temp_dir().join("j-gui-test-nonexistent-scan");
        let _ = fs::remove_dir_all(&dir);
        let skills = scan_skills_dir(&std::env::temp_dir(), "j-gui-test-nonexistent-scan");
        assert!(skills.is_empty());
    }

    #[test]
    fn test_scan_skills_dir_skips_symlinks() {
        let dir = std::env::temp_dir().join("j-gui-test-scan-symlink");
        let _ = fs::remove_dir_all(&dir);

        fs::create_dir_all(&dir.join("real_skill")).unwrap();
        let mut file = fs::File::create(&dir.join("real_skill").join("SKILL.md")).unwrap();
        writeln!(file, "---\nname: Real\n---").unwrap();
        drop(file);

        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&dir.join("real_skill"), &dir.join("link_skill")).ok();
        }
        #[cfg(windows)]
        {
            std::os::windows::fs::symlink_dir(&dir.join("real_skill"), &dir.join("link_skill"))
                .ok();
        }

        let skills = scan_skills_dir(&dir, "");
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "Real");

        let _ = fs::remove_dir_all(&dir);
    }

    // === validate_source_dir tests ===
    #[test]
    fn test_validate_source_dir_rejects_invalid_path() {
        let dir = std::env::temp_dir().join("j-gui-test-validate-source");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let result = validate_source_dir(&dir.to_string_lossy());
        assert!(result.is_err());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_validate_source_dir_accepts_skills_dir() {
        let home = home_dir().unwrap();
        let skill_dir = home.join(".claude/agents/skills/j-gui-test-validate-skill");
        let _ = fs::remove_dir_all(&skill_dir);
        fs::create_dir_all(&skill_dir).unwrap();

        let result = validate_source_dir(&skill_dir.to_string_lossy());
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), std::fs::canonicalize(&skill_dir).unwrap());

        let _ = fs::remove_dir_all(&skill_dir);
    }

    // === Kernel-based list_skills tests ===

    #[test]
    fn list_skills_returns_mapped_skills() {
        let mut mock = MockGovernanceKernel::new();
        mock.expect_list_skills().returning(|| {
            Ok(vec![KernelSkillInfo {
                name: "Test Skill".into(),
                description: "A test skill".into(),
                source: "user".into(),
                dir_path: "/tmp/test/skill".into(),
            }])
        });

        let result = list_skills_impl(&mock);
        assert!(result.is_ok());
        let skills = result.unwrap();
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "Test Skill");
        assert_eq!(skills[0].description, "A test skill");
        assert_eq!(skills[0].source, "user");
        assert_eq!(skills[0].dir_path, "/tmp/test/skill");
    }

    #[test]
    fn list_skills_empty() {
        let mut mock = MockGovernanceKernel::new();
        mock.expect_list_skills().returning(|| Ok(vec![]));

        let result = list_skills_impl(&mock);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 0);
    }

    #[test]
    fn list_skills_kernel_error_propagates() {
        let mut mock = MockGovernanceKernel::new();
        mock.expect_list_skills()
            .returning(|| Err(KernelError::Governance("db error".into())));

        let result = list_skills_impl(&mock);
        assert!(result.is_err());
    }

    // === Kernel-based list_hooks tests ===

    #[test]
    fn list_hooks_returns_mapped_hooks() {
        let mut mock = MockGovernanceKernel::new();
        mock.expect_list_hooks().returning(|| {
            Ok(vec![KernelHookInfo {
                name: Some("My Hook".into()),
                event: "PreSendMessage".into(),
                source: "user".into(),
                hook_type: "bash".into(),
                label: "Lint check".into(),
                timeout: Some(30),
                on_error: Some("skip".into()),
                unique_id: "abc-123".into(),
                enabled: true,
            }])
        });

        let result = list_hooks_impl(&mock);
        assert!(result.is_ok());
        let hooks = result.unwrap();
        assert_eq!(hooks.len(), 1);
        assert_eq!(hooks[0].name, Some("My Hook".into()));
        assert_eq!(hooks[0].event, "PreSendMessage");
        assert_eq!(hooks[0].source, "user");
        assert_eq!(hooks[0].hook_type, "bash");
        assert_eq!(hooks[0].label, "Lint check");
        assert_eq!(hooks[0].timeout, Some(30));
        assert_eq!(hooks[0].on_error, Some("skip".into()));
        assert_eq!(hooks[0].unique_id, "abc-123");
    }

    #[test]
    fn list_hooks_empty() {
        let mut mock = MockGovernanceKernel::new();
        mock.expect_list_hooks().returning(|| Ok(vec![]));

        let result = list_hooks_impl(&mock);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 0);
    }

    #[test]
    fn list_hooks_kernel_error_propagates() {
        let mut mock = MockGovernanceKernel::new();
        mock.expect_list_hooks()
            .returning(|| Err(KernelError::Governance("hook error".into())));

        let result = list_hooks_impl(&mock);
        assert!(result.is_err());
    }

    #[test]
    fn list_hooks_maps_all_fields() {
        let mut mock = MockGovernanceKernel::new();
        mock.expect_list_hooks().returning(|| {
            Ok(vec![KernelHookInfo {
                name: None,
                event: "PostLlmResponse".into(),
                source: "builtin".into(),
                hook_type: "llm".into(),
                label: "Auto-format".into(),
                timeout: None,
                on_error: Some("stop".into()),
                unique_id: "xyz-789".into(),
                enabled: true,
            }])
        });

        let result = list_hooks_impl(&mock);
        assert!(result.is_ok());
        let hooks = result.unwrap();
        assert_eq!(hooks.len(), 1);
        assert_eq!(hooks[0].name, None);
        assert_eq!(hooks[0].event, "PostLlmResponse");
        assert_eq!(hooks[0].source, "builtin");
        assert_eq!(hooks[0].hook_type, "llm");
        assert_eq!(hooks[0].label, "Auto-format");
        assert_eq!(hooks[0].timeout, None);
        assert_eq!(hooks[0].on_error, Some("stop".into()));
        assert_eq!(hooks[0].unique_id, "xyz-789");
    }
}
