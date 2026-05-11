use crate::agent_session::{AgentMessageSearchResult, AgentTimelineItem};
use serde_json::json;

fn parse_tool_input_json(input: &str) -> serde_json::Value {
    serde_json::from_str::<serde_json::Value>(input).unwrap_or_else(|_| json!({}))
}

/// 将 Agent 时间线转换为前端可直接消费的 SDK message 形状。
pub fn timeline_to_sdk_messages(
    session_id: &str,
    timeline: &[AgentTimelineItem],
) -> Vec<serde_json::Value> {
    let mut messages = Vec::new();

    for item in timeline {
        match item.kind.as_str() {
            "user_message" => {
                if let Some(content) = item.content.as_deref() {
                    messages.push(json!({
                        "type": "user",
                        "session_id": session_id,
                        "uuid": item.id,
                        "parent_tool_use_id": null,
                        "message": {
                            "content": [{ "type": "text", "text": content }]
                        },
                        "_createdAt": item.created_at,
                    }));
                }
            }
            "assistant_content" => {
                if let Some(content) = item.content.as_deref() {
                    messages.push(json!({
                        "type": "assistant",
                        "session_id": session_id,
                        "uuid": item.id,
                        "parent_tool_use_id": null,
                        "message": {
                            "content": [{ "type": "text", "text": content }]
                        },
                        "_createdAt": item.created_at,
                    }));
                }
            }
            "tool_call" => {
                if let Some(tool_call) = item.tool_call.as_ref() {
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
            }
            "interrupt" => {
                if let Some(interrupt) = item.interrupt.as_ref() {
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
            }
            _ => {}
        }
    }

    messages
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
