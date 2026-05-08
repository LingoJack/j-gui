use crate::agent_engine::{AgentEngine, AgentEvent};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

pub struct AgentState(pub Arc<Mutex<Option<AgentEngine>>>);

#[tauri::command]
pub fn start_agent(
    state: tauri::State<'_, AgentState>,
    on_event: Channel<AgentEvent>,
) -> Result<(), String> {
    let engine = AgentEngine::start(on_event)?;
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(engine);
    Ok(())
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
