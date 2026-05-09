use crate::agent_engine::{AgentEngine, AgentEvent};
use crate::agent_session::{self, AgentSessionInfo, AgentTimelineItem};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

pub struct AgentState(pub Arc<Mutex<Option<AgentEngine>>>);

#[tauri::command]
pub fn start_agent(
    state: tauri::State<'_, AgentState>,
    on_event: Channel<AgentEvent>,
    permission_mode: Option<String>,
    session_id: Option<String>,
) -> Result<(), String> {
    let mode = permission_mode.unwrap_or_else(|| "default".to_string());
    let sid = match session_id {
        Some(id) => id,
        None => agent_session::create_agent_session()?,
    };
    let engine = AgentEngine::start(on_event, &mode, &sid)?;
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(engine);
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

    let content = match kind.as_str() {
        "ask_user" => {
            let selected = response["selectedOptions"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let custom_text = response["customText"].as_str().unwrap_or("");
            let answer = serde_json::json!({
                "selected_options": selected,
                "custom_text": custom_text,
            });
            answer.to_string()
        }
        "plan" => {
            let decision = response["decision"]
                .as_str()
                .unwrap_or("rejected")
                .to_string();
            let feedback = response["feedback"].as_str().unwrap_or("");
            let answer = serde_json::json!({
                "decision": decision,
                "feedback": feedback,
            });
            answer.to_string()
        }
        _ => {
            // Permission: backward-compatible behavior
            if response["allowed"].as_bool().unwrap_or(false) {
                if response["alwaysAllow"].as_bool().unwrap_or(false) {
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
