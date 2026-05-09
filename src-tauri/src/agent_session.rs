use j_cli::config::YamlConfig;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

static AGENT_SESSION_COUNTER: AtomicU64 = AtomicU64::new(0);
static AGENT_TRANSCRIPT_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTimelineItem {
    pub id: String,
    pub kind: String,
    pub content: Option<String>,
    pub tool_call: Option<ToolCallSnapshot>,
    pub interrupt: Option<InterruptSnapshot>,
    pub created_at: u64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallSnapshot {
    pub tool_id: String,
    pub tool_name: String,
    pub tool_input: String,
    pub tool_output: Option<String>,
    pub status: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterruptSnapshot {
    pub interrupt_id: String,
    pub kind: String,
    pub tool_name: String,
    pub tool_input: String,
    pub response: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionInfo {
    pub id: String,
    pub title: Option<String>,
    pub message_count: usize,
    pub updated_at: u64,
}

fn validate_session_id(id: &str) -> Result<(), String> {
    if id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') && !id.is_empty() {
        Ok(())
    } else {
        Err(format!("无效的 session ID: {}", id))
    }
}

pub fn agent_sessions_dir() -> PathBuf {
    YamlConfig::data_dir().join("agent").join("sessions")
}

pub fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn generate_session_id() -> String {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    let pid = std::process::id();
    let seq = AGENT_SESSION_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{:x}-{:x}-{:x}", ts, pid, seq)
}

pub fn generate_item_id() -> String {
    format!(
        "{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    )
}

pub fn create_agent_session() -> Result<String, String> {
    let id = generate_session_id();
    let dir = agent_sessions_dir().join(&id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建会话目录失败: {}", e))?;
    let meta = serde_json::json!({"created_at": now_millis(), "title": null});
    std::fs::write(dir.join("meta.json"), serde_json::to_string(&meta).unwrap())
        .map_err(|e| format!("写入 meta 失败: {}", e))?;
    Ok(id)
}

pub fn append_timeline_item(session_id: &str, item: &AgentTimelineItem) -> Result<(), String> {
    validate_session_id(session_id)?;
    let _guard = AGENT_TRANSCRIPT_LOCK
        .lock()
        .map_err(|e| format!("锁定 Agent transcript 失败: {}", e))?;
    let path = agent_sessions_dir()
        .join(session_id)
        .join("transcript.jsonl");
    let line = serde_json::to_string(item).map_err(|e| e.to_string())?;
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("打开 transcript 失败: {}", e))?;
    writeln!(file, "{}", line).map_err(|e| format!("写入 transcript 失败: {}", e))?;
    Ok(())
}

fn transcript_path(session_id: &str) -> PathBuf {
    agent_sessions_dir()
        .join(session_id)
        .join("transcript.jsonl")
}

fn read_timeline(session_id: &str) -> Result<Vec<AgentTimelineItem>, String> {
    let path = transcript_path(session_id);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(content
        .lines()
        .filter(|line| !line.is_empty())
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect())
}

fn write_timeline(session_id: &str, items: &[AgentTimelineItem]) -> Result<(), String> {
    let path = transcript_path(session_id);
    let mut content = String::new();
    for item in items {
        content.push_str(&serde_json::to_string(item).map_err(|e| e.to_string())?);
        content.push('\n');
    }
    std::fs::write(path, content).map_err(|e| e.to_string())
}

pub fn update_tool_call_result(
    session_id: &str,
    tool_id: &str,
    content: &str,
) -> Result<(), String> {
    validate_session_id(session_id)?;
    let _guard = AGENT_TRANSCRIPT_LOCK
        .lock()
        .map_err(|e| format!("锁定 Agent transcript 失败: {}", e))?;
    let mut items = read_timeline(session_id)?;
    for item in items.iter_mut().rev() {
        if let Some(tool_call) = item.tool_call.as_mut() {
            if tool_call.tool_id == tool_id {
                tool_call.tool_output = Some(content.to_string());
                tool_call.status = "done".to_string();
                return write_timeline(session_id, &items);
            }
        }
    }
    Ok(())
}

pub fn update_interrupt_response(
    session_id: &str,
    interrupt_id: &str,
    response: &str,
) -> Result<(), String> {
    validate_session_id(session_id)?;
    let _guard = AGENT_TRANSCRIPT_LOCK
        .lock()
        .map_err(|e| format!("锁定 Agent transcript 失败: {}", e))?;
    let mut items = read_timeline(session_id)?;
    for item in items.iter_mut().rev() {
        if let Some(interrupt) = item.interrupt.as_mut() {
            if interrupt.interrupt_id == interrupt_id {
                interrupt.response = Some(response.to_string());
                return write_timeline(session_id, &items);
            }
        }
    }
    Ok(())
}

pub fn list_agent_sessions() -> Result<Vec<AgentSessionInfo>, String> {
    let dir = agent_sessions_dir();
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut sessions = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let id = entry.file_name().to_string_lossy().to_string();
        let meta_path = entry.path().join("meta.json");
        let mut title = None;
        let mut created_at = 0u64;
        if let Ok(content) = std::fs::read_to_string(&meta_path) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                title = v["title"].as_str().map(|s| s.to_string());
                created_at = v["created_at"].as_u64().unwrap_or(0);
            }
        }
        // Auto-derive title from first user message if meta has no title stored
        if title.is_none() {
            let ts_path = entry.path().join("transcript.jsonl");
            if ts_path.exists() {
                if let Ok(file) = std::fs::File::open(&ts_path) {
                    for line in BufReader::new(file).lines().map_while(Result::ok) {
                        if let Ok(item) = serde_json::from_str::<serde_json::Value>(&line) {
                            if item["kind"].as_str() == Some("user_message") {
                                if let Some(c) = item["content"].as_str() {
                                    let preview: String = c.chars().take(24).collect();
                                    title = Some(preview);
                                }
                                break;
                            }
                        }
                    }
                }
            }
        }
        let transcript_path = entry.path().join("transcript.jsonl");
        let message_count = if transcript_path.exists() {
            std::fs::File::open(&transcript_path)
                .ok()
                .map(|f| BufReader::new(f).lines().count())
                .unwrap_or(0)
        } else {
            0
        };
        let updated_at = transcript_path
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(created_at);
        sessions.push(AgentSessionInfo {
            id,
            title,
            message_count,
            updated_at,
        });
    }
    sessions.sort_by_key(|s| std::cmp::Reverse(s.updated_at));
    Ok(sessions)
}

pub fn get_agent_session(session_id: &str) -> Result<Vec<AgentTimelineItem>, String> {
    validate_session_id(session_id)?;
    let dir = agent_sessions_dir().join(session_id);
    if !dir.exists() {
        return Err("会话不存在".to_string());
    }
    let _guard = AGENT_TRANSCRIPT_LOCK
        .lock()
        .map_err(|e| format!("锁定 Agent transcript 失败: {}", e))?;
    read_timeline(session_id)
}

pub fn update_session_title(session_id: &str, title: &str) -> Result<(), String> {
    validate_session_id(session_id)?;
    let dir = agent_sessions_dir().join(session_id);
    let meta_path = dir.join("meta.json");
    let content =
        std::fs::read_to_string(&meta_path).map_err(|e| format!("读取 meta 失败: {}", e))?;
    let mut v: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    v["title"] = serde_json::Value::String(title.to_string());
    std::fs::write(&meta_path, serde_json::to_string(&v).unwrap())
        .map_err(|e| format!("写入 meta 失败: {}", e))?;
    Ok(())
}

pub fn delete_agent_session(session_id: &str) -> Result<(), String> {
    validate_session_id(session_id)?;
    let dir = agent_sessions_dir().join(session_id);
    let _guard = AGENT_TRANSCRIPT_LOCK
        .lock()
        .map_err(|e| format!("锁定 Agent transcript 失败: {}", e))?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}
