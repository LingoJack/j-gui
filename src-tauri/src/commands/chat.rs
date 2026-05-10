use crate::chat_engine::{ChatEngine, ChatEvent, MessageInfo, SessionInfo};
use std::collections::HashSet;
use std::sync::Mutex;
use tauri::ipc::Channel;

static STOPPED_SESSIONS: Mutex<Option<HashSet<String>>> = Mutex::new(None);

#[tauri::command]
pub async fn send_message(
    session_id: String,
    content: String,
    on_event: Channel<ChatEvent>,
) -> Result<(), String> {
    let handle = tokio::runtime::Handle::current();
    let (tx, rx) = tokio::sync::oneshot::channel();
    std::thread::spawn(move || {
        let result = handle.block_on(async {
            ChatEngine::new()
                .send_message(session_id, content, on_event)
                .await
        });
        let _ = tx.send(result);
    });
    rx.await.map_err(|e| e.to_string())?
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

#[tauri::command]
pub fn clear_session(session_id: String) -> Result<(), String> {
    ChatEngine::new().clear_session(&session_id)
}

#[tauri::command]
pub fn stop_generation(session_id: String) -> Result<(), String> {
    ChatEngine::validate_session_id(&session_id)?;
    let mut guard = STOPPED_SESSIONS.lock().map_err(|e| e.to_string())?;
    let set = guard.get_or_insert_with(HashSet::new);
    set.insert(session_id);
    Ok(())
}

#[tauri::command]
pub fn toggle_pin_conversation(session_id: String) -> Result<SessionInfo, String> {
    ChatEngine::new().toggle_pin(&session_id)
}

#[tauri::command]
pub fn toggle_archive_conversation(session_id: String) -> Result<SessionInfo, String> {
    ChatEngine::new().toggle_archive(&session_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Cleanup(String);

    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = ChatEngine::new().delete_session(&self.0);
        }
    }

    #[test]
    fn test_toggle_pin_cycle() {
        let engine = ChatEngine::new();
        let id = engine.create_session();
        let _cleanup = Cleanup(id.clone());

        // Toggle on
        let info = engine.toggle_pin(&id).unwrap();
        assert!(info.pinned, "session should be pinned after toggle");

        // Toggle off
        let info = engine.toggle_pin(&id).unwrap();
        assert!(
            !info.pinned,
            "session should be unpinned after second toggle"
        );
    }

    #[test]
    fn test_toggle_archive_cycle() {
        let engine = ChatEngine::new();
        let id = engine.create_session();
        let _cleanup = Cleanup(id.clone());

        // Toggle on
        let info = engine.toggle_archive(&id).unwrap();
        assert!(info.archived, "session should be archived after toggle");

        // Toggle off
        let info = engine.toggle_archive(&id).unwrap();
        assert!(
            !info.archived,
            "session should be unarchived after second toggle"
        );
    }

    #[test]
    fn test_toggle_invalid_session() {
        let engine = ChatEngine::new();
        let result = engine.toggle_pin("invalid-session-id!");
        assert!(result.is_err(), "invalid session id should fail");
    }
}

/// Checked by the chat engine's streaming loop.
pub fn is_session_stopped(session_id: &str) -> bool {
    STOPPED_SESSIONS
        .lock()
        .ok()
        .and_then(|guard| guard.as_ref().map(|set| set.contains(session_id)))
        .unwrap_or(false)
}

/// Cleared after the engine acknowledges the stop.
pub fn clear_stopped_session(session_id: &str) {
    if let Ok(mut guard) = STOPPED_SESSIONS.lock() {
        if let Some(set) = guard.as_mut() {
            set.remove(session_id);
        }
    }
}
