use super::{KernelError, KernelSessionSummary, SessionPaths, StreamMsg};

/// 切换 session.json 元数据中的布尔字段。
/// 会读取当前值、翻转后写回，并返回更新后的摘要。
pub(super) fn toggle_session_bool_field(
    session_id: &str,
    field: &str,
) -> Result<KernelSessionSummary, KernelError> {
    let paths = SessionPaths::new(session_id);
    if !paths.transcript().exists() {
        return Err(KernelError::Chat("session not found".into()));
    }

    let meta_path = paths.meta_file();
    let mut meta = load_session_meta(session_id, &meta_path)?;
    let current = meta
        .get(field)
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    meta[field] = serde_json::json!(!current);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    meta["updated_at"] = serde_json::json!(now);
    write_session_meta(&meta_path, &meta)?;
    Ok(build_session_summary(session_id, &meta, now))
}

/// 把 jcli `StreamMsg` 转成前端 `Channel<String>` 使用的 JSON 字符串。
pub(super) fn stream_msg_to_json_string(msg: &StreamMsg) -> String {
    let value = match msg {
        StreamMsg::Chunk => serde_json::json!({"type": "chunk"}),
        StreamMsg::ToolCallRequest(tools) => serde_json::json!({
            "type": "toolCallRequest",
            "tools": tools.iter().map(|tool| serde_json::json!({
                "id": tool.id,
                "name": tool.name,
                "arguments": tool.arguments,
            })).collect::<Vec<_>>(),
        }),
        StreamMsg::Done => serde_json::json!({"type": "done"}),
        StreamMsg::Error(err) => serde_json::json!({
            "type": "error",
            "message": err.to_string(),
        }),
        StreamMsg::Cancelled => serde_json::json!({"type": "cancelled"}),
        StreamMsg::Retrying {
            attempt,
            max_attempts,
            delay_ms,
            error,
        } => serde_json::json!({
            "type": "retrying",
            "attempt": attempt,
            "maxAttempts": max_attempts,
            "delayMs": delay_ms,
            "error": error,
        }),
        StreamMsg::Compacting => serde_json::json!({"type": "compacting"}),
        StreamMsg::Compacted { messages_before } => serde_json::json!({
            "type": "compacted",
            "messagesBefore": messages_before,
        }),
    };
    value.to_string()
}

fn load_session_meta(
    session_id: &str,
    meta_path: &std::path::Path,
) -> Result<serde_json::Value, KernelError> {
    if meta_path.exists() {
        let content = std::fs::read_to_string(meta_path)?;
        Ok(serde_json::from_str(&content).unwrap_or_else(|_| default_session_meta(session_id)))
    } else {
        Ok(default_session_meta(session_id))
    }
}

fn default_session_meta(session_id: &str) -> serde_json::Value {
    serde_json::json!({
        "id": session_id,
        "title": "",
        "message_count": 0,
        "created_at": 0,
        "updated_at": 0,
    })
}

fn write_session_meta(
    meta_path: &std::path::Path,
    meta: &serde_json::Value,
) -> Result<(), KernelError> {
    if let Some(parent) = meta_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json =
        serde_json::to_string_pretty(meta).map_err(|err| KernelError::Config(err.to_string()))?;
    std::fs::write(meta_path, json)?;
    Ok(())
}

fn build_session_summary(
    session_id: &str,
    meta: &serde_json::Value,
    updated_at: u64,
) -> KernelSessionSummary {
    let title = meta
        .get("title")
        .and_then(|value| value.as_str())
        .and_then(|value| {
            if value.is_empty() {
                None
            } else {
                Some(value.to_string())
            }
        });
    KernelSessionSummary {
        id: session_id.to_string(),
        title,
        message_count: meta
            .get("message_count")
            .and_then(|value| value.as_u64())
            .unwrap_or(0) as usize,
        updated_at,
        pinned: meta
            .get("pinned")
            .and_then(|value| value.as_bool())
            .unwrap_or(false),
        archived: meta
            .get("archived")
            .and_then(|value| value.as_bool())
            .unwrap_or(false),
    }
}
