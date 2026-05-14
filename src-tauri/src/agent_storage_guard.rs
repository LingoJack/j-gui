use super::AgentTimelineItem;

/// 单条 transcript 记录允许写入磁盘的最大序列化长度。
pub(crate) const MAX_TRANSCRIPT_ITEM_LENGTH: usize = 256 * 1024;
const TRUNCATED_PREVIEW_LENGTH: usize = 2_000;

/// 在写入 transcript 前裁剪超大条目，避免单条 JSONL 记录无限膨胀。
pub(crate) fn sanitize_timeline_item_for_storage(item: &AgentTimelineItem) -> AgentTimelineItem {
    let original_length = serialized_length(item);
    if original_length <= MAX_TRANSCRIPT_ITEM_LENGTH {
        return item.clone();
    }

    let truncation_note = format!(
        "\n[内容已截断: 原始 {}K chars 超出存储限制]",
        original_length.div_ceil(1024)
    );
    let truncation_threshold = MAX_TRANSCRIPT_ITEM_LENGTH / 2;
    let mut sanitized = item.clone();

    sanitized.content = sanitized
        .content
        .as_ref()
        .map(|value| sanitize_string_field(value, truncation_threshold, &truncation_note));

    if let Some(tool_call) = sanitized.tool_call.as_mut() {
        tool_call.tool_input = sanitize_string_field(
            &tool_call.tool_input,
            truncation_threshold,
            &truncation_note,
        );
        if let Some(tool_output) = tool_call.tool_output.as_mut() {
            *tool_output =
                sanitize_string_field(tool_output, truncation_threshold, &truncation_note);
        }
    }

    if let Some(interrupt) = sanitized.interrupt.as_mut() {
        interrupt.tool_input = sanitize_string_field(
            &interrupt.tool_input,
            truncation_threshold,
            &truncation_note,
        );
        if let Some(response) = interrupt.response.as_mut() {
            *response = sanitize_string_field(response, truncation_threshold, &truncation_note);
        }
    }

    if serialized_length(&sanitized) <= MAX_TRANSCRIPT_ITEM_LENGTH {
        return sanitized;
    }

    build_fallback_item(item, &truncation_note)
}

fn serialized_length(item: &AgentTimelineItem) -> usize {
    serde_json::to_string(item)
        .map(|serialized| serialized.len())
        .unwrap_or(usize::MAX)
}

fn sanitize_string_field(value: &str, threshold: usize, truncation_note: &str) -> String {
    if value.len() <= threshold {
        return value.to_string();
    }

    let preview: String = value.chars().take(TRUNCATED_PREVIEW_LENGTH).collect();
    format!("{preview}{truncation_note}")
}

fn build_fallback_item(item: &AgentTimelineItem, truncation_note: &str) -> AgentTimelineItem {
    let summary = format!("[transcript guard] {truncation_note}");
    let mut fallback = item.clone();

    fallback.content = fallback.content.as_ref().map(|_| summary.clone());

    if let Some(tool_call) = fallback.tool_call.as_mut() {
        tool_call.tool_input = summary.clone();
        tool_call.tool_output = tool_call.tool_output.as_ref().map(|_| summary.clone());
    }

    if let Some(interrupt) = fallback.interrupt.as_mut() {
        interrupt.tool_input = summary.clone();
        interrupt.response = interrupt.response.as_ref().map(|_| summary.clone());
    }

    fallback
}
