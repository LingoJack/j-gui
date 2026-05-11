use crate::commands::governance::{
    ConnectionTestResult, McpServerConfig, McpWorkspaceConfig, WorkspaceCapabilities,
    WorkspaceCapabilityServer, WorkspaceCapabilitySkill,
};
use crate::kernel::JcliAdapter;
use std::path::Path;
use std::sync::Arc;

pub(crate) fn get_workspace_mcp_config(
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

pub(crate) fn save_workspace_mcp_config(
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

pub(crate) fn get_workspace_capabilities(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    workspace_slug: String,
) -> Result<WorkspaceCapabilities, String> {
    let skills = state
        .governance()
        .get_workspace_skills(&workspace_slug)
        .map_err(|e| e.to_string())?;
    let disabled_skills = state
        .governance()
        .get_disabled_skill_slugs()
        .map_err(|e| e.to_string())?;
    let mcp_config = state
        .governance()
        .get_workspace_mcp_config(&workspace_slug)
        .map_err(|e| e.to_string())?;

    Ok(WorkspaceCapabilities {
        mcp_servers: mcp_config
            .servers
            .into_iter()
            .map(|server| WorkspaceCapabilityServer {
                name: server.name,
                enabled: !server.disabled,
                r#type: server.transport,
            })
            .collect(),
        skills: skills
            .into_iter()
            .map(|skill| WorkspaceCapabilitySkill {
                slug: Path::new(&skill.dir_path)
                    .file_name()
                    .map(|name| name.to_string_lossy().to_string())
                    .unwrap_or_else(|| skill.name.clone()),
                name: skill.name.clone(),
                description: skill.description.clone(),
                enabled: !disabled_skills
                    .iter()
                    .any(|disabled| disabled == &skill.name),
            })
            .collect(),
    })
}

pub(crate) fn test_mcp_server(
    name: String,
    entry: serde_json::Value,
) -> Result<ConnectionTestResult, String> {
    let entry_type = entry
        .get("type")
        .and_then(serde_json::Value::as_str)
        .ok_or("缺少 MCP transport type".to_string())?;

    match entry_type {
        "stdio" => {
            let command = entry
                .get("command")
                .and_then(serde_json::Value::as_str)
                .ok_or("stdio MCP 缺少 command".to_string())?;
            let args = entry
                .get("args")
                .and_then(serde_json::Value::as_array)
                .map(|values| {
                    values
                        .iter()
                        .filter_map(serde_json::Value::as_str)
                        .map(ToString::to_string)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let output = std::process::Command::new(command)
                .args(&args)
                .arg("--help")
                .output()
                .map_err(|e| format!("启动 MCP 命令失败: {}", e))?;
            let success = output.status.success();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

            Ok(ConnectionTestResult {
                success,
                message: if success {
                    format!("MCP 命令 '{}' 可启动", name)
                } else if !stderr.is_empty() {
                    stderr
                } else if !stdout.is_empty() {
                    stdout
                } else {
                    format!("MCP 命令 '{}' 返回非零退出码", name)
                },
            })
        }
        "http" | "sse" => {
            let url = entry
                .get("url")
                .and_then(serde_json::Value::as_str)
                .ok_or("远程 MCP 缺少 url".to_string())?;
            let parsed = reqwest::Url::parse(url).map_err(|e| format!("MCP URL 无效: {}", e))?;
            Ok(ConnectionTestResult {
                success: true,
                message: format!("MCP 地址格式有效: {}", parsed),
            })
        }
        other => Err(format!("不支持的 MCP transport type: {}", other)),
    }
}
