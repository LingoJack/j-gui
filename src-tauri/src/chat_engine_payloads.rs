use crate::kernel::types::KernelFileAttachment;
use serde::{Deserialize, Serialize};

/// 解析可空布尔字段，兼容缺失与显式 null。
pub(super) fn parse_optional_bool(
    value: Option<&serde_json::Value>,
) -> Result<Option<bool>, String> {
    match value {
        None | Some(serde_json::Value::Null) => Ok(None),
        Some(serde_json::Value::Bool(flag)) => Ok(Some(*flag)),
        Some(other) => Err(format!("thinkingEnabled 必须是布尔值，收到: {}", other)),
    }
}

/// 解析上下文裁剪轮数配置。
pub(super) fn parse_context_length(
    value: Option<&serde_json::Value>,
) -> Result<Option<usize>, String> {
    // `null` 和 `"infinite"` 都表示“不显式截断上下文”。
    // 保留这两种入口是为了兼容历史前端状态与配置落盘格式，避免一次协议收紧就把旧会话读坏。
    match value {
        None | Some(serde_json::Value::Null) => Ok(None),
        Some(serde_json::Value::String(text)) if text == "infinite" => Ok(None),
        Some(serde_json::Value::Number(number)) => number
            .as_u64()
            .map(|value| Some(value as usize))
            .ok_or_else(|| {
                format!(
                    "contextLength 必须是非负整数或 'infinite'，收到: {}",
                    number
                )
            }),
        Some(other) => Err(format!(
            "contextLength 必须是非负整数或 'infinite'，收到: {}",
            other
        )),
    }
}

/// 解析上下文分隔点列表。
pub(super) fn parse_context_dividers(
    value: Option<&serde_json::Value>,
) -> Result<Vec<String>, String> {
    match value {
        None | Some(serde_json::Value::Null) => Ok(Vec::new()),
        Some(serde_json::Value::Array(items)) => items
            .iter()
            .map(|item| {
                item.as_str()
                    .filter(|value| !value.trim().is_empty())
                    .map(ToString::to_string)
                    .ok_or_else(|| format!("contextDividers 项必须是非空字符串，收到: {}", item))
            })
            .collect(),
        Some(other) => Err(format!("contextDividers 必须是字符串数组，收到: {}", other)),
    }
}

/// 解析并校验当前支持的图片附件列表。
pub(super) fn parse_image_attachments(
    value: Option<&serde_json::Value>,
) -> Result<Vec<KernelFileAttachment>, String> {
    match value {
        None | Some(serde_json::Value::Null) => Ok(Vec::new()),
        Some(serde_json::Value::Array(items)) if items.is_empty() => Ok(Vec::new()),
        Some(raw) => {
            let attachments: Vec<KernelFileAttachment> = serde_json::from_value(raw.clone())
                .map_err(|e| format!("attachments 格式无效: {e}"))?;
            for attachment in &attachments {
                // 当前聊天内核只支持图片附件透传。
                // 这里提前拒绝非图片文件，是为了避免后面 provider 适配层各自出现半支持、半静默丢弃的分叉行为。
                if !attachment.media_type.starts_with("image/") {
                    return Err(format!(
                        "attachments 当前仅支持 image/*，收到: {}",
                        attachment.media_type
                    ));
                }
                if attachment.local_path.trim().is_empty() {
                    return Err(format!(
                        "attachments 缺少 localPath: {}",
                        attachment.filename
                    ));
                }
            }
            Ok(attachments)
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
/// 前端发送聊天消息时提交的完整请求。
pub struct SendMessageRequest {
    pub session_id: String,
    pub content: String,
    pub channel_id: Option<String>,
    pub model_id: Option<String>,
    pub protocol_hint: Option<String>,
    pub system_message: Option<String>,
    pub context_length: Option<serde_json::Value>,
    pub context_dividers: Option<serde_json::Value>,
    pub attachments: Option<serde_json::Value>,
    pub thinking_enabled: Option<serde_json::Value>,
    pub enabled_tool_ids: Option<serde_json::Value>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
/// Chat 流式通道中的事件类型。
pub enum ChatEvent {
    Chunk { index: u32, delta: String },
    Reasoning { index: u32, delta: String },
    Done { total_tokens: u32 },
    Error { message: String },
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// 单条聊天消息的前端返回结构。
pub struct MessageInfo {
    pub id: String,
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<KernelFileAttachment>>,
    pub created_at: u64,
    pub timestamp: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// 聊天会话列表项的前端返回结构。
pub struct SessionInfo {
    pub id: String,
    pub title: Option<String>,
    pub message_count: usize,
    pub created_at: u64,
    pub updated_at: u64,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub archived: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_dividers: Option<Vec<String>>,
}

#[derive(Clone, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
/// 聊天消息搜索结果。
pub struct MessageSearchResult {
    pub conversation_id: String,
    pub conversation_title: String,
    pub message_id: String,
    pub role: String,
    pub snippet: String,
    pub match_start: usize,
    pub match_length: usize,
    #[serde(default)]
    pub archived: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// “引用聊天上下文”功能返回的提示词上下文。
pub struct ChatReferenceContext {
    pub conversation_id: String,
    pub conversation_title: String,
    pub message_count: usize,
    pub included_message_count: usize,
    pub omitted_message_count: usize,
    pub prompt: String,
}
