use crate::chat_engine::{ChatEngine, ChatEvent, MessageInfo, SessionInfo};
use tauri::ipc::Channel;

#[tauri::command]
pub async fn send_message(
    session_id: String,
    content: String,
    on_event: Channel<ChatEvent>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
        rt.block_on(async {
            let engine = ChatEngine::new();
            engine.send_message(session_id, content, on_event).await
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn list_sessions() -> Result<Vec<SessionInfo>, String> {
    ChatEngine::new().list_sessions()
}

#[tauri::command]
pub fn create_session() -> Result<String, String> {
    Ok(ChatEngine::new().create_session())
}

#[tauri::command]
pub fn delete_session(session_id: String) -> Result<(), String> {
    ChatEngine::new().delete_session(&session_id)
}

#[tauri::command]
pub fn get_session_messages(session_id: String) -> Result<Vec<MessageInfo>, String> {
    ChatEngine::new().get_messages(&session_id)
}

#[tauri::command]
pub fn delete_message(session_id: String, pair_index: usize) -> Result<(), String> {
    ChatEngine::new().delete_message(&session_id, pair_index)
}
