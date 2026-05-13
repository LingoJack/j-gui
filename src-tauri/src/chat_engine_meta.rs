use crate::chat_engine::SessionInfo;
use crate::kernel::adapter::chat_session_meta_path;
use crate::kernel::types::KernelSessionSummary;

/// 返回当前时间的毫秒级 Unix 时间戳。
pub fn current_timestamp_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// 生成聊天会话元数据的默认 JSON 结构。
pub fn default_session_meta(session_id: &str) -> serde_json::Value {
    serde_json::json!({
        "id": session_id,
        "title": "",
        "message_count": 0,
        "created_at": 0,
        "updated_at": 0,
    })
}

/// 读取聊天会话元数据；当文件不存在或损坏时回退到默认结构。
pub fn load_session_meta(session_id: &str) -> Result<serde_json::Value, String> {
    let meta_path = chat_session_meta_path(session_id);
    if !meta_path.exists() {
        return Ok(default_session_meta(session_id));
    }
    let content =
        std::fs::read_to_string(&meta_path).map_err(|e| format!("读取会话元数据失败: {e}"))?;
    Ok(serde_json::from_str(&content).unwrap_or_else(|_| default_session_meta(session_id)))
}

/// 将聊天会话元数据写回磁盘。
pub fn write_session_meta(session_id: &str, meta: &serde_json::Value) -> Result<(), String> {
    let meta_path = chat_session_meta_path(session_id);
    if let Some(parent) = meta_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建会话元数据目录失败: {e}"))?;
    }
    let content =
        serde_json::to_string_pretty(meta).map_err(|e| format!("序列化会话元数据失败: {e}"))?;
    std::fs::write(meta_path, content).map_err(|e| format!("写入会话元数据失败: {e}"))
}

fn parse_context_dividers(meta: &serde_json::Value) -> Option<Vec<String>> {
    let dividers = meta
        .get("context_dividers")
        .and_then(|value| value.as_array())?
        .iter()
        .filter_map(|value| value.as_str().map(ToString::to_string))
        .collect::<Vec<_>>();
    Some(dividers)
}

/// 把 kernel 会话摘要与元数据文件合并为前端消费的会话信息。
pub fn merge_session_info(summary: KernelSessionSummary, meta: &serde_json::Value) -> SessionInfo {
    let title = meta
        .get("title")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .map(ToString::to_string)
        .or(summary.title);
    let created_at = meta
        .get("created_at")
        .and_then(|value| value.as_u64())
        .unwrap_or(summary.updated_at);
    let updated_at = meta
        .get("updated_at")
        .and_then(|value| value.as_u64())
        .unwrap_or(summary.updated_at);

    SessionInfo {
        id: summary.id,
        title,
        message_count: summary.message_count,
        created_at,
        updated_at,
        pinned: meta
            .get("pinned")
            .and_then(|value| value.as_bool())
            .unwrap_or(summary.pinned),
        archived: meta
            .get("archived")
            .and_then(|value| value.as_bool())
            .unwrap_or(summary.archived),
        channel_id: meta
            .get("channel_id")
            .and_then(|value| value.as_str())
            .map(ToString::to_string),
        model_id: meta
            .get("model_id")
            .and_then(|value| value.as_str())
            .map(ToString::to_string),
        context_dividers: parse_context_dividers(meta),
    }
}
