use super::AgentEvent;
use crate::agent_session::{self, AgentTimelineItem, ToolCallSnapshot};

const LOG_LINE_TRUNCATE_SDK: usize = 200;
const LOG_LINE_TRUNCATE_UNKNOWN: usize = 120;

/// 解析一行 stream-json SDK 输出，并映射为前端 Agent 事件。
pub(super) fn parse_sdk_line(line: &str) -> Vec<AgentEvent> {
    let value: serde_json::Value = match serde_json::from_str(line) {
        Ok(value) => value,
        Err(err) => {
            return vec![AgentEvent::Error {
                message: format!("解析 JSON: {}", err),
            }];
        }
    };

    let msg_type = value["type"].as_str().unwrap_or("");
    if msg_type.is_empty() {
        eprintln!(
            "[warn] parse_sdk_line: missing or non-string 'type' field in SDK line: {}",
            &line[..line.len().min(LOG_LINE_TRUNCATE_SDK)]
        );
    }

    match msg_type {
        "assistant" => parse_assistant_event(&value),
        "result" => parse_result_event(&value),
        "system" | "stream_event" => parse_system_event(&value),
        "user" => parse_user_event(&value),
        "plan" => parse_plan_event(&value),
        _ => {
            eprintln!(
                "[warn] parse_sdk_line: unknown msg_type '{}' from SDK line: {}",
                msg_type,
                &line[..line.len().min(LOG_LINE_TRUNCATE_UNKNOWN)]
            );
            Vec::new()
        }
    }
}

fn parse_result_event(value: &serde_json::Value) -> Vec<AgentEvent> {
    if value["is_error"].as_bool().unwrap_or(false) {
        let message = value["result"]
            .as_str()
            .unwrap_or("Claude CLI 返回错误")
            .to_string();
        return vec![AgentEvent::Error { message }];
    }

    vec![AgentEvent::Done {
        total_tokens: value["total_tokens"].as_u64().unwrap_or(0) as u32,
        result_subtype: value["subtype"].as_str().map(ToString::to_string),
    }]
}

fn parse_system_event(value: &serde_json::Value) -> Vec<AgentEvent> {
    match value["subtype"].as_str() {
        Some("init") => value["model"]
            .as_str()
            .filter(|model| !model.is_empty())
            .map(|model| {
                vec![AgentEvent::ModelResolved {
                    model: model.to_string(),
                }]
            })
            .unwrap_or_default(),
        Some("compacting") => vec![AgentEvent::Compacting],
        Some("compact_boundary") => vec![AgentEvent::CompactComplete],
        _ => Vec::new(),
    }
}

fn parse_assistant_event(value: &serde_json::Value) -> Vec<AgentEvent> {
    let Some(items) = value["message"]["content"].as_array() else {
        return Vec::new();
    };

    let mut block_count = 0u32;
    let events = items
        .iter()
        .filter_map(|item| {
            let event = parse_assistant_content_item(item);
            if event.is_some() {
                block_count += 1;
            }
            event
        })
        .collect::<Vec<_>>();

    if block_count > 1 {
        eprintln!(
            "[warn] parse_assistant_event: {} content blocks in one message \
             (expected 1 per stream-json line); some downstream consumers may \
             only handle the first",
            block_count
        );
    }

    events
}

fn parse_assistant_content_item(item: &serde_json::Value) -> Option<AgentEvent> {
    match item["type"].as_str() {
        Some("text") => item["text"]
            .as_str()
            .map(|text| AgentEvent::AssistantContent {
                text: text.to_string(),
            }),
        Some("tool_use") => Some(AgentEvent::ToolUse {
            tool_id: resolve_tool_id(item),
            tool_name: resolve_tool_name(item),
            tool_input: item["input"].to_string(),
        }),
        _ => None,
    }
}

fn resolve_tool_id(item: &serde_json::Value) -> String {
    // 历史事件里 tool id 的字段名并不稳定，优先按已知位置回收。
    // 如果仍然缺失，至少要生成一个可复现的兜底 id，而不是留空：
    // UI 的 tool/result/timeline 关联都依赖这个键，空字符串会让多个工具调用直接共用同一个槽位。
    // 这里的 hash 只是降低空 id 带来的冲突风险，并不承诺全局唯一。
    item["id"]
        .as_str()
        .or_else(|| item["tool_use_id"].as_str())
        .or_else(|| item["tool_use"]["id"].as_str())
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| {
            let raw = serde_json::to_string(item).unwrap_or_default();
            let hash: String = raw
                .bytes()
                .take(8)
                .map(|byte| format!("{:02x}", byte))
                .collect();
            format!("tool_{}", hash)
        })
}

fn resolve_tool_name(item: &serde_json::Value) -> String {
    item["name"]
        .as_str()
        .or_else(|| item["tool_name"].as_str())
        .or_else(|| item["tool_use"]["name"].as_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("Tool")
        .to_string()
}

fn parse_user_event(value: &serde_json::Value) -> Vec<AgentEvent> {
    let Some(items) = value["message"]["content"].as_array() else {
        return Vec::new();
    };

    for item in items {
        if item["type"].as_str() == Some("tool_result") {
            let tool_id = item["tool_use_id"].as_str().unwrap_or("").to_string();
            let content = item["content"].as_str().unwrap_or("").to_string();
            if tool_id.is_empty() {
                eprintln!("[warn] parse_user_event: tool_result missing tool_use_id");
            }
            return vec![AgentEvent::ToolResult { tool_id, content }];
        }
    }

    Vec::new()
}

fn parse_plan_event(value: &serde_json::Value) -> Vec<AgentEvent> {
    let plan_id = value["id"]
        .as_str()
        .filter(|id| !id.is_empty())
        .unwrap_or("plan")
        .to_string();
    let tool_input = serde_json::json!({
        "plan_summary": value["plan_summary"].as_str().unwrap_or(""),
        "steps": value["steps"].as_array(),
    })
    .to_string();
    vec![AgentEvent::Interrupt {
        interrupt_id: plan_id,
        kind: "plan".to_string(),
        tool_name: "plan".to_string(),
        tool_input,
    }]
}

/// 把 j-agent agent loop 事件流发出的 JSON 字符串
/// （由 adapter.rs 中的 `stream_msg_to_json_string` 生成）转换成一个或多个 AgentEvent。
/// 同时会为当前会话补充 timeline 条目。
pub(super) fn json_stream_msg_to_agent_events(
    json: &str,
    session_id: &str,
    permission_mode: &str,
) -> Vec<AgentEvent> {
    let value: serde_json::Value = match serde_json::from_str(json) {
        Ok(value) => value,
        Err(_) => return vec![],
    };

    match value["type"].as_str() {
        Some("toolCallRequest") => parse_tool_call_request(&value, session_id, permission_mode),
        Some("done") => vec![AgentEvent::Done {
            total_tokens: 0,
            result_subtype: None,
        }],
        Some("error") => vec![AgentEvent::Error {
            message: value["message"].as_str().unwrap_or("未知错误").to_string(),
        }],
        Some("cancelled") => vec![AgentEvent::Cancelled],
        Some("retrying") => vec![AgentEvent::Retrying {
            attempt: value["attempt"].as_u64().unwrap_or(1) as u32,
            max_attempts: value["maxAttempts"].as_u64().unwrap_or(1) as u32,
            delay_seconds: value["delayMs"].as_u64().unwrap_or(0).div_ceil(1000) as u32,
            reason: value["error"].as_str().unwrap_or("").to_string(),
        }],
        Some("compacting") => vec![AgentEvent::Compacting],
        Some("compacted") => vec![AgentEvent::CompactComplete],
        Some("chunk") => Vec::new(),
        _ => Vec::new(),
    }
}

fn parse_tool_call_request(
    value: &serde_json::Value,
    session_id: &str,
    permission_mode: &str,
) -> Vec<AgentEvent> {
    let Some(tools) = value["tools"].as_array() else {
        return Vec::new();
    };

    // 一条 toolCallRequest 里可能批量带多个工具。
    // 这里既要发流式事件，也要立即补 timeline 快照；
    // 否则前端只在真正收到 tool_result 后才知道这个工具存在，过程态会丢失。
    tools
        .iter()
        .map(|tool| {
            let tool_id = tool["id"].as_str().unwrap_or("").to_string();
            let tool_name = tool["name"].as_str().unwrap_or("").to_string();
            let tool_input = tool["arguments"].as_str().unwrap_or("{}").to_string();
            append_tool_call_timeline_item(session_id, &tool_id, &tool_name, &tool_input);
            if let Some(kind) = interrupt_kind_for_tool(&tool_name, permission_mode) {
                AgentEvent::Interrupt {
                    interrupt_id: tool_id,
                    kind: kind.to_string(),
                    tool_name,
                    tool_input,
                }
            } else {
                AgentEvent::ToolUse {
                    tool_id,
                    tool_name,
                    tool_input,
                }
            }
        })
        .collect()
}

fn interrupt_kind_for_tool(tool_name: &str, permission_mode: &str) -> Option<&'static str> {
    match tool_name {
        "Ask" | "ask_user" | "AskUser" => Some("ask_user"),
        "ExitPlanMode" | "plan" => Some("plan"),
        _ if permission_mode != "bypassPermissions" => Some("permission"),
        _ => None,
    }
}

fn append_tool_call_timeline_item(
    session_id: &str,
    tool_id: &str,
    tool_name: &str,
    tool_input: &str,
) {
    // timeline 写入失败不应打断主流式路径。
    // 这里的时间线是增强信息，真正的事件仍然通过 AgentEvent 发往前端。
    let _ = agent_session::append_timeline_item(
        session_id,
        &AgentTimelineItem {
            id: agent_session::generate_item_id(),
            kind: "tool_call".into(),
            content: None,
            tool_call: Some(ToolCallSnapshot {
                tool_id: tool_id.to_string(),
                tool_name: tool_name.to_string(),
                tool_input: tool_input.to_string(),
                tool_output: None,
                status: "running".into(),
            }),
            interrupt: None,
            created_at: agent_session::now_millis(),
        },
    );
}
