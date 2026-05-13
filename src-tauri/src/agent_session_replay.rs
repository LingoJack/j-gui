use crate::agent_session::{AgentMessageSearchResult, AgentTimelineItem};
use serde_json::json;
use std::collections::HashSet;

fn parse_tool_input_json(input: &str) -> serde_json::Value {
    serde_json::from_str::<serde_json::Value>(input).unwrap_or_else(|_| json!({}))
}

struct TextMessagePayload<'a> {
    message_type: &'a str,
    content: &'a str,
}

fn push_text_message(
    messages: &mut Vec<serde_json::Value>,
    session_id: &str,
    item: &AgentTimelineItem,
    payload: TextMessagePayload<'_>,
) {
    messages.push(json!({
        "type": payload.message_type,
        "session_id": session_id,
        "uuid": item.id,
        "parent_tool_use_id": null,
        "message": {
            "content": [{ "type": "text", "text": payload.content }]
        },
        "_createdAt": item.created_at,
    }));
}

fn push_tool_call_messages(
    messages: &mut Vec<serde_json::Value>,
    session_id: &str,
    item: &AgentTimelineItem,
) {
    let Some(tool_call) = item.tool_call.as_ref() else {
        return;
    };
    messages.push(json!({
        "type": "assistant",
        "session_id": session_id,
        "uuid": item.id,
        "parent_tool_use_id": null,
        "message": {
            "content": [{
                "type": "tool_use",
                "id": tool_call.tool_id,
                "name": tool_call.tool_name,
                "input": parse_tool_input_json(&tool_call.tool_input),
            }]
        },
        "_createdAt": item.created_at,
    }));

    if let Some(output) = tool_call.tool_output.as_deref() {
        messages.push(json!({
            "type": "user",
            "session_id": session_id,
            "uuid": format!("{}-result", item.id),
            "parent_tool_use_id": null,
            "message": {
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": tool_call.tool_id,
                    "content": output,
                }]
            },
            "_createdAt": item.created_at,
        }));
    }
}

fn push_interrupt_messages(
    messages: &mut Vec<serde_json::Value>,
    session_id: &str,
    item: &AgentTimelineItem,
    persisted_tool_call_ids: &HashSet<&str>,
) {
    let Some(interrupt) = item.interrupt.as_ref() else {
        return;
    };
    if !persisted_tool_call_ids.contains(interrupt.interrupt_id.as_str()) {
        messages.push(json!({
            "type": "assistant",
            "session_id": session_id,
            "uuid": item.id,
            "parent_tool_use_id": null,
            "message": {
                "content": [{
                    "type": "tool_use",
                    "id": interrupt.interrupt_id,
                    "name": interrupt.tool_name,
                    "input": parse_tool_input_json(&interrupt.tool_input),
                }]
            },
            "_createdAt": item.created_at,
        }));
    }

    if let Some(response) = interrupt.response.as_deref() {
        messages.push(json!({
            "type": "user",
            "session_id": session_id,
            "uuid": format!("{}-response", item.id),
            "parent_tool_use_id": null,
            "message": {
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": interrupt.interrupt_id,
                    "content": response,
                }]
            },
            "_createdAt": item.created_at,
        }));
    }
}

/// 将 Agent 时间线转换为前端可直接消费的 SDK message 形状。
pub fn timeline_to_sdk_messages(
    session_id: &str,
    timeline: &[AgentTimelineItem],
) -> Vec<serde_json::Value> {
    let mut messages = Vec::new();
    let persisted_tool_call_ids: HashSet<&str> = timeline
        .iter()
        .filter_map(|item| {
            item.tool_call
                .as_ref()
                .map(|tool_call| tool_call.tool_id.as_str())
        })
        .collect();

    for item in timeline {
        match item.kind.as_str() {
            "user_message" => {
                if let Some(content) = item.content.as_deref() {
                    push_text_message(
                        &mut messages,
                        session_id,
                        item,
                        TextMessagePayload {
                            message_type: "user",
                            content,
                        },
                    );
                }
            }
            "assistant_content" => {
                if let Some(content) = item.content.as_deref() {
                    push_text_message(
                        &mut messages,
                        session_id,
                        item,
                        TextMessagePayload {
                            message_type: "assistant",
                            content,
                        },
                    );
                }
            }
            "tool_call" => push_tool_call_messages(&mut messages, session_id, item),
            "interrupt" => {
                push_interrupt_messages(&mut messages, session_id, item, &persisted_tool_call_ids)
            }
            _ => {}
        }
    }

    messages
}

#[cfg(test)]
mod tests {
    use super::timeline_to_sdk_messages;
    use crate::agent_session::{AgentTimelineItem, InterruptSnapshot, ToolCallSnapshot};

    #[test]
    fn replay_deduplicates_interrupt_when_tool_call_exists() {
        let timeline = vec![
            AgentTimelineItem {
                id: "tool-item".to_string(),
                kind: "tool_call".to_string(),
                content: None,
                tool_call: Some(ToolCallSnapshot {
                    tool_id: "tool-1".to_string(),
                    tool_name: "Bash".to_string(),
                    tool_input: r#"{"command":"ls"}"#.to_string(),
                    tool_output: None,
                    status: "running".to_string(),
                }),
                interrupt: None,
                created_at: 1,
            },
            AgentTimelineItem {
                id: "interrupt-item".to_string(),
                kind: "interrupt".to_string(),
                content: None,
                tool_call: None,
                interrupt: Some(InterruptSnapshot {
                    interrupt_id: "tool-1".to_string(),
                    kind: "permission".to_string(),
                    tool_name: "Bash".to_string(),
                    tool_input: r#"{"command":"ls"}"#.to_string(),
                    response: Some("approved".to_string()),
                }),
                created_at: 2,
            },
        ];

        let messages = timeline_to_sdk_messages("session-1", &timeline);
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0]["type"], "assistant");
        assert_eq!(messages[0]["message"]["content"][0]["type"], "tool_use");
        assert_eq!(messages[1]["type"], "user");
        assert_eq!(messages[1]["message"]["content"][0]["type"], "tool_result");
        assert_eq!(
            messages[1]["message"]["content"][0]["tool_use_id"],
            "tool-1"
        );
    }

    #[test]
    fn replay_keeps_interrupt_tool_use_for_legacy_interrupt_only_timeline() {
        let timeline = vec![AgentTimelineItem {
            id: "interrupt-item".to_string(),
            kind: "interrupt".to_string(),
            content: None,
            tool_call: None,
            interrupt: Some(InterruptSnapshot {
                interrupt_id: "tool-legacy".to_string(),
                kind: "permission".to_string(),
                tool_name: "Read".to_string(),
                tool_input: r#"{"filePath":"a.txt"}"#.to_string(),
                response: Some("approved".to_string()),
            }),
            created_at: 2,
        }];

        let messages = timeline_to_sdk_messages("session-1", &timeline);
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0]["message"]["content"][0]["type"], "tool_use");
        assert_eq!(messages[1]["message"]["content"][0]["type"], "tool_result");
    }
}

fn build_snippet(content: &str, query: &str) -> Option<(String, usize, usize)> {
    let content_lower = content.to_lowercase();
    let query_lower = query.to_lowercase();
    let match_index = content_lower.find(&query_lower)?;
    let start = match_index.saturating_sub(30);
    let end = (match_index + query.len() + 50).min(content.len());
    Some((
        content[start..end].to_string(),
        match_index - start,
        query.len(),
    ))
}

/// 按关键字搜索所有 Agent 会话的可见文本内容，返回统一搜索结果。
pub fn search_agent_session_messages(query: &str) -> Result<Vec<AgentMessageSearchResult>, String> {
    let sessions = crate::agent_session::list_agent_sessions()?;
    let mut results = Vec::new();

    for session in sessions {
        let session_title = session
            .title
            .clone()
            .unwrap_or_else(|| "新 Agent 会话".to_string());
        let timeline = crate::agent_session::get_agent_session(&session.id)?;

        for item in timeline {
            if let Some(content) = item.content.as_deref() {
                if let Some((snippet, match_start, match_length)) = build_snippet(content, query) {
                    results.push(AgentMessageSearchResult {
                        session_id: session.id.clone(),
                        session_title: session_title.clone(),
                        message_id: item.id.clone(),
                        role: if item.kind == "user_message" {
                            "user".to_string()
                        } else {
                            "assistant".to_string()
                        },
                        snippet,
                        match_start,
                        match_length,
                        archived: session.archived,
                    });
                }
            }

            if let Some(tool_call) = item.tool_call.as_ref() {
                if let Some(output) = tool_call.tool_output.as_deref() {
                    if let Some((snippet, match_start, match_length)) = build_snippet(output, query)
                    {
                        results.push(AgentMessageSearchResult {
                            session_id: session.id.clone(),
                            session_title: session_title.clone(),
                            message_id: format!("{}-result", item.id),
                            role: "tool".to_string(),
                            snippet,
                            match_start,
                            match_length,
                            archived: session.archived,
                        });
                    }
                }
            }
        }
    }

    Ok(results)
}
