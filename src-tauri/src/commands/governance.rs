use j_cli::command::chat::infra::hook::manager::HookManager;
use j_cli::command::chat::infra::hook::types::HookEvent;
use j_cli::command::chat::infra::skill::{load_all_skills, Skill, SkillSource};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

static MCP_CONFIG_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub source: String, // "user" | "project"
    pub dir_path: String,
}

impl From<Skill> for SkillInfo {
    fn from(s: Skill) -> Self {
        SkillInfo {
            name: s.frontmatter.name,
            description: s.frontmatter.description,
            source: match s.source {
                SkillSource::User => "user".to_string(),
                SkillSource::Project => "project".to_string(),
            },
            dir_path: s.dir_path.to_string_lossy().to_string(),
        }
    }
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
}

fn hook_event_to_str(e: HookEvent) -> String {
    match e {
        HookEvent::PreSendMessage => "PreSendMessage".to_string(),
        HookEvent::PostSendMessage => "PostSendMessage".to_string(),
        HookEvent::PreLlmRequest => "PreLlmRequest".to_string(),
        HookEvent::PostLlmResponse => "PostLlmResponse".to_string(),
        HookEvent::PreToolExecution => "PreToolExecution".to_string(),
        HookEvent::PostToolExecution => "PostToolExecution".to_string(),
        HookEvent::PostToolExecutionFailure => "PostToolExecutionFailure".to_string(),
        HookEvent::Stop => "Stop".to_string(),
        HookEvent::PreMicroCompact => "PreMicroCompact".to_string(),
        HookEvent::PostMicroCompact => "PostMicroCompact".to_string(),
        HookEvent::PreAutoCompact => "PreAutoCompact".to_string(),
        HookEvent::PostAutoCompact => "PostAutoCompact".to_string(),
        HookEvent::SessionStart => "SessionStart".to_string(),
        HookEvent::SessionEnd => "SessionEnd".to_string(),
    }
}

#[tauri::command]
pub fn list_skills() -> Result<Vec<SkillInfo>, String> {
    let skills = load_all_skills();
    Ok(skills.into_iter().map(SkillInfo::from).collect())
}

#[tauri::command]
pub fn list_hooks() -> Result<Vec<HookInfo>, String> {
    let manager = HookManager::load();
    let entries = manager.list_hooks();
    Ok(entries
        .into_iter()
        .map(|e| HookInfo {
            name: e.name,
            event: hook_event_to_str(e.event),
            source: e.source.to_string(),
            hook_type: e.hook_type.to_string(),
            label: e.label,
            timeout: e.timeout,
            on_error: e.on_error.map(|o| match o {
                j_cli::command::chat::infra::hook::types::OnError::Skip => "skip".to_string(),
                j_cli::command::chat::infra::hook::types::OnError::Stop => "stop".to_string(),
            }),
            unique_id: e.unique_id,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct McpServerConfigPayload {
    name: String,
    transport: String,
    command: Option<String>,
    args: Option<Vec<String>>,
    url: Option<String>,
    env: Option<HashMap<String, String>>,
    disabled: bool,
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
    let _lock = MCP_CONFIG_LOCK
        .lock()
        .map_err(|e| format!("锁定 MCP 配置失败: {}", e))?;
    let path = mcp_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    let existing_items = if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| format!("读取 MCP 配置失败: {}", e))?;
        match serde_json::from_str::<Value>(&content) {
            Ok(Value::Array(items)) => items,
            Ok(_) => return Err("MCP 配置格式错误: 顶层必须是数组".to_string()),
            Err(e) => return Err(format!("解析 MCP 配置失败: {}", e)),
        }
    } else {
        Vec::new()
    };

    let mut existing_by_name: HashMap<String, Value> = existing_items
        .into_iter()
        .filter_map(|item| {
            let name = item
                .get("name")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)?;
            Some((name, item))
        })
        .collect();

    let merged_items: Result<Vec<Value>, String> = servers
        .into_iter()
        .map(|server| {
            let payload = McpServerConfigPayload {
                name: server.name.clone(),
                transport: server.transport.clone(),
                command: server.command.clone(),
                args: server.args.clone(),
                url: server.url.clone(),
                env: server.env.clone(),
                disabled: server.disabled,
            };
            let payload_value =
                serde_json::to_value(payload).map_err(|e| format!("序列化失败: {}", e))?;
            let payload_object = payload_value
                .as_object()
                .ok_or_else(|| "MCP 配置序列化结果无效".to_string())?;

            let mut merged = match existing_by_name.remove(&server.name) {
                Some(Value::Object(map)) => map,
                Some(_) | None => Map::new(),
            };

            for (key, value) in payload_object {
                merged.insert(key.clone(), value.clone());
            }

            Ok(Value::Object(merged))
        })
        .collect();

    let content =
        serde_json::to_string_pretty(&merged_items?).map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("写入 MCP 配置失败: {}", e))
}
