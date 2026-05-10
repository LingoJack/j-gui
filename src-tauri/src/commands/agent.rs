use crate::agent_engine::{AgentEngine, AgentEvent};
use crate::agent_session::{self, AgentSessionInfo, AgentTimelineItem};
use crate::kernel::{ChatKernel, JcliAdapter};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

pub struct AgentState(pub Arc<Mutex<Option<AgentEngine>>>);

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum AgentInterruptResponse {
    Permission {
        allowed: bool,
        #[serde(default, rename = "alwaysAllow")]
        always_allow: bool,
    },
    AskUser {
        #[serde(default, rename = "selectedOptions")]
        selected_options: Vec<String>,
        #[serde(default, rename = "customText")]
        custom_text: Option<String>,
    },
    Plan {
        decision: String,
        #[serde(default)]
        feedback: Option<String>,
    },
}

#[tauri::command]
pub fn start_agent(
    state: tauri::State<'_, AgentState>,
    kernel: tauri::State<'_, Arc<JcliAdapter>>,
    on_event: Channel<AgentEvent>,
    permission_mode: Option<String>,
    session_id: Option<String>,
    use_jagent: Option<bool>,
) -> Result<(), String> {
    let use_jagent = use_jagent.unwrap_or(false);

    let providers = kernel
        .config()
        .load_providers()
        .map_err(|e| e.to_string())?;
    let active_index = kernel
        .config()
        .load_active_index()
        .map_err(|e| e.to_string())?;
    let provider = providers.get(active_index).ok_or("未配置模型提供方")?;

    let mode = permission_mode.unwrap_or_else(|| "default".to_string());
    let sid = match session_id {
        Some(id) => id,
        None => agent_session::create_agent_session()?,
    };

    if use_jagent {
        let engine = AgentEngine::start_jagent(
            Arc::clone(&*kernel) as Arc<dyn ChatKernel>,
            on_event,
            sid,
            vec![], // empty initial messages
            mode,
            None, // no system prompt
        )?;
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        *guard = Some(engine);
    } else {
        let engine = AgentEngine::start(
            on_event,
            &mode,
            &sid,
            provider.models.first().map(|m| m.id.as_str()).unwrap_or(""),
            &provider.api_base,
            &provider.api_key,
        )?;
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        *guard = Some(engine);
    }
    Ok(())
}

#[tauri::command]
pub fn create_agent_session() -> Result<String, String> {
    agent_session::create_agent_session()
}

#[tauri::command]
pub fn list_agent_sessions() -> Result<Vec<AgentSessionInfo>, String> {
    agent_session::list_agent_sessions()
}

#[tauri::command]
pub fn get_agent_session(session_id: String) -> Result<Vec<AgentTimelineItem>, String> {
    agent_session::get_agent_session(&session_id)
}

#[tauri::command]
pub fn delete_agent_session(session_id: String) -> Result<(), String> {
    agent_session::delete_agent_session(&session_id)
}

#[tauri::command]
pub fn respond_agent_interrupt(
    state: tauri::State<'_, AgentState>,
    interrupt_id: String,
    kind: String,
    response: serde_json::Value,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let engine = guard.as_mut().ok_or("Agent 未启动")?;

    let parsed = match kind.as_str() {
        "ask_user" => {
            let selected_options = response["selectedOptions"]
                .as_array()
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.as_str().map(|s| s.to_string()))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let custom_text = response["customText"].as_str().map(|s| s.to_string());
            AgentInterruptResponse::AskUser {
                selected_options,
                custom_text,
            }
        }
        "plan" => AgentInterruptResponse::Plan {
            decision: response["decision"]
                .as_str()
                .unwrap_or("reject")
                .to_string(),
            feedback: response["feedback"].as_str().map(|s| s.to_string()),
        },
        _ => AgentInterruptResponse::Permission {
            allowed: response["allowed"].as_bool().unwrap_or(false),
            always_allow: response["alwaysAllow"].as_bool().unwrap_or(false),
        },
    };

    let content = match parsed {
        AgentInterruptResponse::AskUser {
            selected_options,
            custom_text,
        } => serde_json::json!({
            "selected_options": selected_options,
            "custom_text": custom_text,
        })
        .to_string(),
        AgentInterruptResponse::Plan { decision, feedback } => serde_json::json!({
            "decision": decision,
            "feedback": feedback,
        })
        .to_string(),
        AgentInterruptResponse::Permission {
            allowed,
            always_allow,
        } => {
            if allowed {
                if always_allow {
                    "always_approved".to_string()
                } else {
                    "approved".to_string()
                }
            } else {
                "denied".to_string()
            }
        }
    };

    engine.respond_interrupt(&interrupt_id, &content)
}

#[tauri::command]
pub fn send_agent_message(
    state: tauri::State<'_, AgentState>,
    content: String,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let engine = guard.as_mut().ok_or("Agent 未启动")?;
    engine.send_message(&content)
}

#[tauri::command]
pub fn stop_agent(state: tauri::State<'_, AgentState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut engine) = guard.take() {
        engine.close();
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSessionTitleRequest {
    session_id: String,
    title: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSessionTitleResult {
    session_id: String,
    title: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRequest {
    #[allow(dead_code)]
    #[allow(dead_code)]
    session_id: String,
    interrupt_id: String,
    /// One of "approve", "approve_always", "deny"
    decision: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AskUserAnswer {
    question_id: String,
    #[serde(default)]
    selected_options: Vec<String>,
    #[serde(default)]
    custom_text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AskUserRequest {
    #[allow(dead_code)]
    session_id: String,
    #[allow(dead_code)]
    interrupt_id: String,
    answers: Vec<AskUserAnswer>,
}

/// Generate a title for an agent session by asking the active LLM to
/// summarize the first user message and first assistant response.
#[tauri::command]
pub async fn generate_agent_title(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    session_id: String,
) -> Result<String, String> {
    let timeline = agent_session::get_agent_session(&session_id)?;

    let first_user_msg = timeline
        .iter()
        .find(|item| item.kind == "user_message")
        .and_then(|item| item.content.as_deref());

    let first_assistant_msg = timeline
        .iter()
        .find(|item| item.kind == "assistant_content")
        .and_then(|item| item.content.as_deref());

    let conversation_text = match (first_user_msg, first_assistant_msg) {
        (Some(user), Some(assistant)) => {
            format!("User: {}\nAssistant: {}", user, assistant)
        }
        (Some(user), None) => user.to_string(),
        _ => {
            return Ok(first_user_msg
                .map(|s| s.chars().take(30).collect::<String>())
                .unwrap_or_else(|| "New conversation".to_string()));
        }
    };

    let fallback_title: String = first_user_msg
        .map(|s| s.chars().take(30).collect::<String>())
        .unwrap_or_else(|| "New conversation".to_string());

    // Try LLM-based title generation via reqwest
    let providers = state.config().load_providers().map_err(|e| e.to_string())?;
    let active_index = state
        .config()
        .load_active_index()
        .map_err(|e| e.to_string())?;
    if let Some(provider) = providers.get(active_index) {
        let client = reqwest::Client::new();
        let prompt = format!("Generate a short title (max 10 words) for this conversation. Return ONLY the title, no quotes, no punctuation:\n\n{}", conversation_text);
        let body = serde_json::json!({
            "model": provider.models.first().map(|m| &m.id),
            "messages": [
                {"role": "system", "content": "You are a title generator. Return ONLY the title."},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 30,
            "stream": false
        });
        let url = format!(
            "{}/chat/completions",
            provider.api_base.trim_end_matches('/')
        );
        if let Ok(resp) = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", provider.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
        {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(title) = json["choices"][0]["message"]["content"].as_str() {
                    let title = title.trim().trim_matches('"').to_string();
                    if !title.is_empty() {
                        return Ok(title);
                    }
                }
            }
        }
    }
    Ok(fallback_title)
}

/// Persist a title for an agent session.
#[tauri::command]
pub fn update_agent_session_title(
    request: UpdateSessionTitleRequest,
) -> Result<UpdateSessionTitleResult, String> {
    agent_session::update_session_title(&request.session_id, &request.title)?;
    Ok(UpdateSessionTitleResult {
        session_id: request.session_id,
        title: request.title,
    })
}

/// Respond to a permission interrupt (tool approval).
/// Writes the decision to the agent's stdin as a tool_result.
#[tauri::command]
pub fn respond_permission(
    state: tauri::State<'_, AgentState>,
    request: PermissionRequest,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let engine = guard.as_mut().ok_or("Agent 未启动")?;

    let content = match request.decision.as_str() {
        "approve" => "approved".to_string(),
        "approve_always" => "always_approved".to_string(),
        "deny" => "denied".to_string(),
        other => return Err(format!("无效的决策: {}", other)),
    };

    engine.respond_interrupt(&request.interrupt_id, &content)
}

/// Respond to an ask_user interrupt.
/// Writes the selected options and custom text to the agent's stdin as a tool_result.
#[tauri::command]
pub fn respond_ask_user(
    state: tauri::State<'_, AgentState>,
    request: AskUserRequest,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let engine = guard.as_mut().ok_or("Agent 未启动")?;

    let content = serde_json::json!({
        "answers": request.answers.iter().map(|a| serde_json::json!({
            "question_id": a.question_id,
            "selected_options": a.selected_options,
            "custom_text": a.custom_text,
        })).collect::<Vec<_>>(),
    })
    .to_string();

    engine.respond_interrupt(&request.interrupt_id, &content)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── AgentInterruptResponse tests ──

    #[test]
    fn deserializes_permission_response() {
        let value = serde_json::json!({
            "kind": "permission",
            "allowed": true,
            "alwaysAllow": true,
        });

        let parsed: AgentInterruptResponse = serde_json::from_value(value).unwrap();
        match parsed {
            AgentInterruptResponse::Permission {
                allowed,
                always_allow,
            } => {
                assert!(allowed);
                assert!(always_allow);
            }
            _ => panic!("expected permission response"),
        }
    }

    #[test]
    fn deserializes_ask_user_response() {
        let value = serde_json::json!({
            "kind": "askUser",
            "selectedOptions": ["A", "B"],
            "customText": "hello",
        });

        let parsed: AgentInterruptResponse = serde_json::from_value(value).unwrap();
        match parsed {
            AgentInterruptResponse::AskUser {
                selected_options,
                custom_text,
            } => {
                assert_eq!(selected_options, vec!["A", "B"]);
                assert_eq!(custom_text.as_deref(), Some("hello"));
            }
            _ => panic!("expected ask_user response"),
        }
    }

    #[test]
    fn deserializes_plan_response() {
        let value = serde_json::json!({
            "kind": "plan",
            "decision": "approve_and_run",
            "feedback": "ok",
        });

        let parsed: AgentInterruptResponse = serde_json::from_value(value).unwrap();
        match parsed {
            AgentInterruptResponse::Plan { decision, feedback } => {
                assert_eq!(decision, "approve_and_run");
                assert_eq!(feedback.as_deref(), Some("ok"));
            }
            _ => panic!("expected plan response"),
        }
    }

    // ── PermissionRequest tests ──

    #[test]
    fn deserializes_permission_request_approve() {
        let value = serde_json::json!({
            "sessionId": "abc-123",
            "interruptId": "toolu_01",
            "decision": "approve",
        });

        let req: PermissionRequest = serde_json::from_value(value).unwrap();
        assert_eq!(req.session_id, "abc-123");
        assert_eq!(req.interrupt_id, "toolu_01");
        assert_eq!(req.decision, "approve");
    }

    #[test]
    fn deserializes_permission_request_deny() {
        let value = serde_json::json!({
            "sessionId": "abc-123",
            "interruptId": "toolu_02",
            "decision": "deny",
        });

        let req: PermissionRequest = serde_json::from_value(value).unwrap();
        assert_eq!(req.session_id, "abc-123");
        assert_eq!(req.interrupt_id, "toolu_02");
        assert_eq!(req.decision, "deny");
    }

    #[test]
    fn deserializes_permission_request_approve_always() {
        let value = serde_json::json!({
            "sessionId": "abc-123",
            "interruptId": "toolu_03",
            "decision": "approve_always",
        });

        let req: PermissionRequest = serde_json::from_value(value).unwrap();
        assert_eq!(req.decision, "approve_always");
    }

    #[test]
    fn respond_permission_maps_decision_to_content() {
        let mappings = [
            ("approve", "approved"),
            ("approve_always", "always_approved"),
            ("deny", "denied"),
        ];
        for (decision, expected) in mappings {
            let actual = match decision {
                "approve" => "approved",
                "approve_always" => "always_approved",
                "deny" => "denied",
                _ => unreachable!(),
            };
            assert_eq!(
                actual, expected,
                "mapping for '{}' should be '{}'",
                decision, expected
            );
        }
    }

    // ── AskUserRequest / AskUserAnswer tests ──

    #[test]
    fn deserializes_ask_user_request_single_answer() {
        let value = serde_json::json!({
            "sessionId": "abc-123",
            "interruptId": "toolu_ask1",
            "answers": [{
                "questionId": "q1",
                "selectedOptions": ["Option A", "Option B"],
                "customText": "extra note",
            }],
        });

        let req: AskUserRequest = serde_json::from_value(value).unwrap();
        assert_eq!(req.session_id, "abc-123");
        assert_eq!(req.interrupt_id, "toolu_ask1");
        assert_eq!(req.answers.len(), 1);
        assert_eq!(req.answers[0].question_id, "q1");
        assert_eq!(
            req.answers[0].selected_options,
            vec!["Option A", "Option B"]
        );
        assert_eq!(req.answers[0].custom_text.as_deref(), Some("extra note"));
    }

    #[test]
    fn deserializes_ask_user_answer_with_defaults() {
        let value = serde_json::json!({
            "questionId": "q1",
        });

        let answer: AskUserAnswer = serde_json::from_value(value).unwrap();
        assert_eq!(answer.question_id, "q1");
        assert!(answer.selected_options.is_empty());
        assert!(answer.custom_text.is_none());
    }

    #[test]
    fn deserializes_ask_user_request_multiple_answers() {
        let value = serde_json::json!({
            "sessionId": "abc-123",
            "interruptId": "toolu_ask2",
            "answers": [
                {"questionId": "q1", "selectedOptions": ["A"]},
                {"questionId": "q2", "selectedOptions": ["B", "C"], "customText": "note"},
            ],
        });

        let req: AskUserRequest = serde_json::from_value(value).unwrap();
        assert_eq!(req.answers.len(), 2);
        assert_eq!(req.answers[0].question_id, "q1");
        assert_eq!(req.answers[1].question_id, "q2");
        assert_eq!(req.answers[1].selected_options, vec!["B", "C"]);
    }

    #[test]
    fn ask_user_content_json_includes_answers() {
        let answers = vec![
            AskUserAnswer {
                question_id: "q1".into(),
                selected_options: vec!["A".into()],
                custom_text: Some("extra".into()),
            },
            AskUserAnswer {
                question_id: "q2".into(),
                selected_options: vec!["B".into(), "C".into()],
                custom_text: None,
            },
        ];

        let content = serde_json::json!({
            "answers": answers.iter().map(|a| serde_json::json!({
                "question_id": a.question_id,
                "selected_options": a.selected_options,
                "custom_text": a.custom_text,
            })).collect::<Vec<_>>(),
        });

        let arr = content["answers"].as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["question_id"], "q1");
        assert_eq!(arr[0]["selected_options"][0], "A");
        assert_eq!(arr[0]["custom_text"], "extra");
        assert_eq!(arr[1]["custom_text"], serde_json::Value::Null);
    }

    // ── UpdateSessionTitle tests ──

    #[test]
    fn deserializes_update_session_title_request() {
        let value = serde_json::json!({
            "sessionId": "abc-123",
            "title": "My Session",
        });

        let req: UpdateSessionTitleRequest = serde_json::from_value(value).unwrap();
        assert_eq!(req.session_id, "abc-123");
        assert_eq!(req.title, "My Session");
    }

    #[test]
    fn serializes_update_session_title_result() {
        let result = UpdateSessionTitleResult {
            session_id: "abc-123".into(),
            title: "My Session".into(),
        };

        let json = serde_json::to_value(result).unwrap();
        assert_eq!(json["sessionId"], "abc-123");
        assert_eq!(json["title"], "My Session");
    }
}
