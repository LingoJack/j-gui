use crate::chat_engine::chat_engine_meta::{
    current_timestamp_millis, default_session_meta, load_session_meta, merge_session_info,
    write_session_meta,
};
use crate::chat_engine::SessionInfo;
use crate::kernel::{adapter::chat_session_transcript_path, ChatKernel};

fn ensure_session_exists(session_id: &str) -> Result<(), String> {
    if chat_session_transcript_path(session_id).exists() {
        Ok(())
    } else {
        Err(format!("未找到对话: {}", session_id))
    }
}

/// 更新会话 meta.json 的指定字段，并同步刷新更新时间。
pub(crate) fn update_session_meta_fields(
    session_id: &str,
    updates: impl FnOnce(&mut serde_json::Value),
) -> Result<serde_json::Value, String> {
    ensure_session_exists(session_id)?;
    let mut meta = load_session_meta(session_id)?;
    let now = current_timestamp_millis();
    meta["id"] = serde_json::json!(session_id);
    updates(&mut meta);
    if meta
        .get("created_at")
        .and_then(|value| value.as_u64())
        .unwrap_or(0)
        == 0
    {
        meta["created_at"] = serde_json::json!(now);
    }
    meta["updated_at"] = serde_json::json!(now);
    write_session_meta(session_id, &meta)?;
    Ok(meta)
}

/// 将内核会话摘要与本地 meta 合并成前端会话结构。
pub(crate) fn load_merged_session_info(
    chat_kernel: &dyn ChatKernel,
    session_id: &str,
    meta: &serde_json::Value,
) -> Result<SessionInfo, String> {
    let summary = chat_kernel
        .list_sessions()
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|item| item.id == session_id)
        .ok_or_else(|| format!("未找到对话: {}", session_id))?;
    Ok(merge_session_info(summary, meta))
}

/// 读取会话 meta；缺失时使用默认值后合并摘要。
pub(crate) fn merged_info_with_fallback(
    chat_kernel: &dyn ChatKernel,
    session_id: &str,
) -> Result<SessionInfo, String> {
    let meta = load_session_meta(session_id).unwrap_or_else(|_| default_session_meta(session_id));
    load_merged_session_info(chat_kernel, session_id, &meta)
}
