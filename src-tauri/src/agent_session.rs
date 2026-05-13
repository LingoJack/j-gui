use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
#[cfg(test)]
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};
#[path = "agent_session_meta.rs"]
mod agent_session_meta;
#[path = "agent_session_replay.rs"]
mod agent_session_replay;
#[path = "agent_session_storage.rs"]
mod agent_session_storage;
#[path = "agent_storage_guard.rs"]
mod agent_storage_guard;
use agent_session_meta::AgentSessionMetaRecord;
pub(crate) use agent_session_meta::CreateSessionMetaInput;
pub use agent_session_replay::{search_agent_session_messages, timeline_to_sdk_messages};
use agent_session_storage::{
    append_timeline_item_with_lock, delete_session_dir, infer_title_from_transcript, read_timeline,
    transcript_message_count, transcript_updated_at, write_timeline,
};

static AGENT_SESSION_COUNTER: AtomicU64 = AtomicU64::new(0);
static AGENT_TRANSCRIPT_LOCK: Mutex<()> = Mutex::new(());

#[cfg(test)]
fn agent_test_env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[cfg(test)]
fn agent_test_data_dir_override() -> &'static Mutex<Option<PathBuf>> {
    static OVERRIDE: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
    OVERRIDE.get_or_init(|| Mutex::new(None))
}

#[cfg(test)]
pub(crate) struct TestEnvGuard {
    _lock: std::sync::MutexGuard<'static, ()>,
    root: PathBuf,
}

#[cfg(test)]
impl TestEnvGuard {
    pub(crate) fn new(slug: &str) -> Self {
        let lock = agent_test_env_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("j-gui-agent-{slug}-{unique}"));
        let data_root = root.join(".jdata");
        if let Err(err) = std::fs::create_dir_all(&data_root) {
            panic!("创建 Agent 测试数据目录失败: {}", err);
        }
        let mut override_guard = agent_test_data_dir_override()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *override_guard = Some(data_root);
        drop(override_guard);

        Self { _lock: lock, root }
    }
}

#[cfg(test)]
impl Drop for TestEnvGuard {
    fn drop(&mut self) {
        let mut override_guard = agent_test_data_dir_override()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *override_guard = None;
        drop(override_guard);
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

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
    #[serde(default)]
    pub channel_id: Option<String>,
    #[serde(default)]
    pub sdk_session_id: Option<String>,
    #[serde(default)]
    pub workspace_id: Option<String>,
    pub message_count: usize,
    pub updated_at: u64,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub manual_working: bool,
    #[serde(default)]
    pub stopped_by_user: bool,
    #[serde(default)]
    pub permission_mode: Option<String>,
    #[serde(default)]
    pub backend_mode: Option<String>,
    #[serde(default)]
    pub fork_source_dir: Option<String>,
    #[serde(default)]
    pub fork_source_sdk_session_id: Option<String>,
    #[serde(default)]
    pub resume_at_message_uuid: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMessageSearchResult {
    pub session_id: String,
    pub session_title: String,
    pub message_id: String,
    pub role: String,
    pub snippet: String,
    pub match_start: usize,
    pub match_length: usize,
    pub archived: bool,
}

pub(crate) fn validate_session_id(id: &str) -> Result<(), String> {
    if id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') && !id.is_empty() {
        Ok(())
    } else {
        Err(format!("无效的 session ID: {}", id))
    }
}

fn data_dir() -> PathBuf {
    #[cfg(test)]
    {
        let override_guard = agent_test_data_dir_override()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(path) = override_guard.clone() {
            return path;
        }
    }
    crate::kernel::home_dir().join(".jdata")
}

/// 返回 Agent 会话目录根路径。
pub fn agent_sessions_dir() -> PathBuf {
    data_dir().join("agent").join("sessions")
}

fn session_dir(session_id: &str) -> PathBuf {
    agent_sessions_dir().join(session_id)
}

fn session_meta_path(session_id: &str) -> PathBuf {
    session_dir(session_id).join("meta.json")
}

fn read_session_meta(session_id: &str) -> Result<AgentSessionMetaRecord, String> {
    validate_session_id(session_id)?;
    let path = session_meta_path(session_id);
    let content = std::fs::read_to_string(&path).map_err(|e| format!("读取 meta 失败: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("解析 meta 失败: {}", e))
}

fn write_session_meta(session_id: &str, meta: &AgentSessionMetaRecord) -> Result<(), String> {
    validate_session_id(session_id)?;
    let dir = session_dir(session_id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建会话目录失败: {}", e))?;
    let meta_str = serde_json::to_string(meta).map_err(|e| format!("序列化 meta 失败: {}", e))?;
    std::fs::write(session_meta_path(session_id), meta_str)
        .map_err(|e| format!("写入 meta 失败: {}", e))
}

fn update_session_meta(
    session_id: &str,
    update: impl FnOnce(&mut AgentSessionMetaRecord),
) -> Result<AgentSessionMetaRecord, String> {
    let mut meta = read_session_meta(session_id)?;
    update(&mut meta);
    write_session_meta(session_id, &meta)?;
    Ok(meta)
}

/// 返回当前 Unix 毫秒时间戳。
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

/// 为 transcript 条目生成近似唯一的字符串 ID。
pub fn generate_item_id() -> String {
    format!(
        "{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    )
}

/// 创建一个新的 Agent 会话目录并初始化元数据。
pub fn create_agent_session() -> Result<String, String> {
    let id = generate_session_id();
    let dir = session_dir(&id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建会话目录失败: {}", e))?;
    let meta = AgentSessionMetaRecord {
        created_at: now_millis(),
        permission_mode: Some("bypassPermissions".to_string()),
        ..AgentSessionMetaRecord::default()
    };
    write_session_meta(&id, &meta)?;
    Ok(id)
}

/// 创建带指定元数据的 Agent 会话。
pub fn create_agent_session_with_meta(input: CreateSessionMetaInput) -> Result<String, String> {
    let id = create_agent_session()?;
    update_session_meta(&id, |meta| {
        meta.title = input.title;
        meta.channel_id = input.channel_id;
        meta.workspace_id = input.workspace_id;
        if let Some(mode) = input.permission_mode {
            meta.permission_mode = Some(mode);
        }
        meta.backend_mode = input.backend_mode;
        meta.fork_source_dir = input.fork_source_dir;
        meta.fork_source_sdk_session_id = input.fork_source_sdk_session_id;
        meta.resume_at_message_uuid = input.resume_at_message_uuid;
    })?;
    Ok(id)
}

/// 向指定 Agent 会话的 transcript 追加一条时间线记录。
pub fn append_timeline_item(session_id: &str, item: &AgentTimelineItem) -> Result<(), String> {
    append_timeline_item_with_lock(&AGENT_TRANSCRIPT_LOCK, session_id, item)
}

/// 回填最近一次匹配工具调用的输出和完成状态。
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

/// 记录指定中断请求的用户响应内容。
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

/// 列出本地所有 Agent 会话摘要，按最近更新时间倒序返回。
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
        let meta = read_session_meta(&id).unwrap_or_default();
        let mut title = meta.title.clone();
        let created_at = meta.created_at;
        // 如果 meta 中还没有标题，则尝试从首条用户消息自动推导
        if title.is_none() {
            title = infer_title_from_transcript(&id);
        }
        let message_count = transcript_message_count(&id);
        let updated_at = transcript_updated_at(&id, created_at);
        sessions.push(AgentSessionInfo {
            id,
            title,
            channel_id: meta.channel_id.clone(),
            sdk_session_id: meta.sdk_session_id.clone(),
            workspace_id: meta.workspace_id.clone(),
            message_count,
            updated_at,
            pinned: meta.pinned,
            archived: meta.archived,
            manual_working: meta.manual_working,
            stopped_by_user: meta.stopped_by_user,
            permission_mode: meta.permission_mode.clone(),
            backend_mode: meta.backend_mode.clone(),
            fork_source_dir: meta.fork_source_dir.clone(),
            fork_source_sdk_session_id: meta.fork_source_sdk_session_id.clone(),
            resume_at_message_uuid: meta.resume_at_message_uuid.clone(),
        });
    }
    sessions.sort_by_key(|s| std::cmp::Reverse(s.updated_at));
    Ok(sessions)
}

/// 读取指定 Agent 会话的完整时间线。
pub fn get_agent_session(session_id: &str) -> Result<Vec<AgentTimelineItem>, String> {
    validate_session_id(session_id)?;
    let dir = session_dir(session_id);
    if !dir.exists() {
        return Err("会话不存在".to_string());
    }
    let _guard = AGENT_TRANSCRIPT_LOCK
        .lock()
        .map_err(|e| format!("锁定 Agent transcript 失败: {}", e))?;
    read_timeline(session_id)
}

/// 更新指定 Agent 会话的标题。
pub fn update_session_title(session_id: &str, title: &str) -> Result<(), String> {
    update_session_meta(session_id, |meta| {
        meta.title = Some(title.to_string());
    })?;
    Ok(())
}

/// 删除指定 Agent 会话目录及其持久化数据。
pub fn delete_agent_session(session_id: &str) -> Result<(), String> {
    validate_session_id(session_id)?;
    let _guard = AGENT_TRANSCRIPT_LOCK
        .lock()
        .map_err(|e| format!("锁定 Agent transcript 失败: {}", e))?;
    delete_session_dir(session_id)
}

fn toggle_meta_bool(session_id: &str, field: &str) -> Result<bool, String> {
    let meta = read_session_meta(session_id)?;
    let current = match field {
        "pinned" => meta.pinned,
        "archived" => meta.archived,
        "manual_working" => meta.manual_working,
        "stopped_by_user" => meta.stopped_by_user,
        _ => false,
    };
    let new_value = !current;
    update_session_meta(session_id, |meta| match field {
        "pinned" => meta.pinned = new_value,
        "archived" => meta.archived = new_value,
        "manual_working" => meta.manual_working = new_value,
        "stopped_by_user" => meta.stopped_by_user = new_value,
        _ => {}
    })?;
    Ok(new_value)
}

/// 切换指定 Agent 会话的置顶状态并返回最新摘要。
pub fn toggle_pin_agent_session(session_id: &str) -> Result<AgentSessionInfo, String> {
    toggle_meta_bool(session_id, "pinned")?;
    let sessions = list_agent_sessions()?;
    sessions
        .into_iter()
        .find(|s| s.id == session_id)
        .ok_or_else(|| "会话不存在".to_string())
}

/// 切换指定 Agent 会话的归档状态并返回最新摘要。
pub fn toggle_archive_agent_session(session_id: &str) -> Result<AgentSessionInfo, String> {
    toggle_meta_bool(session_id, "archived")?;
    let sessions = list_agent_sessions()?;
    sessions
        .into_iter()
        .find(|s| s.id == session_id)
        .ok_or_else(|| "会话不存在".to_string())
}

/// 切换指定 Agent 会话的手动工作中状态并返回最新摘要。
pub fn toggle_manual_working_agent_session(session_id: &str) -> Result<AgentSessionInfo, String> {
    toggle_meta_bool(session_id, "manual_working")?;
    let sessions = list_agent_sessions()?;
    sessions
        .into_iter()
        .find(|s| s.id == session_id)
        .ok_or_else(|| "会话不存在".to_string())
}

/// 更新指定 Agent 会话的权限模式元数据。
pub fn update_session_permission_mode(session_id: &str, mode: &str) -> Result<(), String> {
    update_session_meta(session_id, |meta| {
        meta.permission_mode = Some(mode.to_string());
    })?;
    Ok(())
}

/// 更新指定 Agent 会话最近一次实际运行所使用的后端模式。
pub fn set_session_backend_mode(
    session_id: &str,
    backend_mode: Option<&str>,
) -> Result<(), String> {
    update_session_meta(session_id, |meta| {
        meta.backend_mode = backend_mode.map(ToString::to_string);
    })?;
    Ok(())
}

/// 更新会话归属的工作区 ID。
pub fn set_session_workspace(session_id: &str, workspace_id: Option<String>) -> Result<(), String> {
    update_session_meta(session_id, |meta| {
        meta.workspace_id = workspace_id;
    })?;
    Ok(())
}

/// 更新会话最后一次运行是否被用户主动中断。
pub fn set_session_stopped_by_user(session_id: &str, stopped_by_user: bool) -> Result<(), String> {
    update_session_meta(session_id, |meta| {
        meta.stopped_by_user = stopped_by_user;
    })?;
    Ok(())
}

/// 更新会话绑定的 SDK session ID。
pub fn set_session_sdk_session_id(
    session_id: &str,
    sdk_session_id: Option<String>,
) -> Result<(), String> {
    update_session_meta(session_id, |meta| {
        meta.sdk_session_id = sdk_session_id;
    })?;
    Ok(())
}

/// 从指定历史锚点分叉出一个新会话。
pub fn fork_agent_session(
    session_id: &str,
    up_to_message_uuid: Option<&str>,
) -> Result<AgentSessionInfo, String> {
    let source_meta = read_session_meta(session_id)?;
    let timeline = get_agent_session(session_id)?;
    let fork_index = match up_to_message_uuid {
        Some(uuid) => timeline
            .iter()
            .position(|item| item.id == uuid)
            .ok_or_else(|| format!("未找到 fork 锚点消息: {}", uuid))?,
        None => timeline.len().saturating_sub(1),
    };
    let forked_timeline = if timeline.is_empty() {
        Vec::new()
    } else {
        timeline[..=fork_index].to_vec()
    };

    let new_session_id = create_agent_session_with_meta(CreateSessionMetaInput {
        title: source_meta.title.clone(),
        channel_id: source_meta.channel_id.clone(),
        workspace_id: source_meta.workspace_id.clone(),
        permission_mode: source_meta.permission_mode.clone(),
        backend_mode: source_meta.backend_mode.clone(),
        fork_source_dir: Some(session_dir(session_id).to_string_lossy().to_string()),
        fork_source_sdk_session_id: source_meta.sdk_session_id.clone(),
        resume_at_message_uuid: None,
    })?;

    if !forked_timeline.is_empty() {
        write_timeline(&new_session_id, &forked_timeline)?;
    }

    list_agent_sessions()?
        .into_iter()
        .find(|session| session.id == new_session_id)
        .ok_or_else(|| "分叉会话创建后未找到".to_string())
}

/// 在同一会话内回退到指定 assistant 消息锚点。
pub fn rewind_agent_session(
    session_id: &str,
    assistant_message_uuid: &str,
) -> Result<usize, String> {
    let _guard = AGENT_TRANSCRIPT_LOCK
        .lock()
        .map_err(|e| format!("锁定 Agent transcript 失败: {}", e))?;
    let timeline = read_timeline(session_id)?;
    let rewind_index = timeline
        .iter()
        .position(|item| item.id == assistant_message_uuid && item.kind == "assistant_content")
        .ok_or_else(|| format!("未找到回退锚点消息: {}", assistant_message_uuid))?;
    let remaining = timeline[..=rewind_index].to_vec();
    write_timeline(session_id, &remaining)?;
    update_session_meta(session_id, |meta| {
        meta.resume_at_message_uuid = Some(assistant_message_uuid.to_string());
        meta.stopped_by_user = false;
    })?;
    Ok(remaining.len())
}

#[cfg(test)]
#[path = "tests/agent_session.rs"]
mod tests;
