use crate::agent_session::agent_storage_guard::sanitize_timeline_item_for_storage;
use crate::agent_session::{agent_sessions_dir, validate_session_id, AgentTimelineItem};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::sync::Mutex;

fn session_dir(session_id: &str) -> PathBuf {
    agent_sessions_dir().join(session_id)
}

fn transcript_path(session_id: &str) -> PathBuf {
    session_dir(session_id).join("transcript.jsonl")
}

pub(crate) fn append_timeline_item_with_lock(
    transcript_lock: &Mutex<()>,
    session_id: &str,
    item: &AgentTimelineItem,
) -> Result<(), String> {
    validate_session_id(session_id)?;
    let _guard = transcript_lock
        .lock()
        .map_err(|e| format!("锁定 Agent transcript 失败: {}", e))?;
    let path = transcript_path(session_id);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建 transcript 目录失败: {}", e))?;
    }
    let line = serde_json::to_string(&sanitize_timeline_item_for_storage(item))
        .map_err(|e| e.to_string())?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("打开 transcript 失败: {}", e))?;
    writeln!(file, "{}", line).map_err(|e| format!("写入 transcript 失败: {}", e))?;
    Ok(())
}

pub(crate) fn read_timeline(session_id: &str) -> Result<Vec<AgentTimelineItem>, String> {
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

pub(crate) fn write_timeline(session_id: &str, items: &[AgentTimelineItem]) -> Result<(), String> {
    let path = transcript_path(session_id);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建 transcript 目录失败: {}", e))?;
    }
    let mut content = String::new();
    for item in items {
        let sanitized = sanitize_timeline_item_for_storage(item);
        content.push_str(&serde_json::to_string(&sanitized).map_err(|e| e.to_string())?);
        content.push('\n');
    }
    std::fs::write(path, content).map_err(|e| e.to_string())
}

pub(crate) fn transcript_message_count(session_id: &str) -> usize {
    let path = transcript_path(session_id);
    if !path.exists() {
        return 0;
    }
    std::fs::File::open(&path)
        .ok()
        .map(|file| BufReader::new(file).lines().count())
        .unwrap_or(0)
}

pub(crate) fn infer_title_from_transcript(session_id: &str) -> Option<String> {
    let path = transcript_path(session_id);
    if !path.exists() {
        return None;
    }
    let file = std::fs::File::open(path).ok()?;
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        let item = serde_json::from_str::<serde_json::Value>(&line).ok()?;
        if item["kind"].as_str() == Some("user_message") {
            return item["content"]
                .as_str()
                .map(|content| content.chars().take(24).collect());
        }
    }
    None
}

pub(crate) fn transcript_updated_at(session_id: &str, fallback: u64) -> u64 {
    transcript_path(session_id)
        .metadata()
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(fallback)
}

pub(crate) fn delete_session_dir(session_id: &str) -> Result<(), String> {
    let dir = session_dir(session_id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}
