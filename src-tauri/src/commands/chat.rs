use crate::chat_engine::{
    ChatEngine, ChatEvent, ChatReferenceContext, MessageInfo, MessageSearchResult,
    SendMessageRequest, SessionInfo,
};
use std::collections::HashSet;
use std::sync::Mutex;
use tauri::ipc::Channel;

static STOPPED_SESSIONS: Mutex<Option<HashSet<String>>> = Mutex::new(None);

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
/// 从指定消息开始截断会话的请求体。
pub struct TruncateMessagesFromInput {
    pub conversation_id: String,
    pub message_id: String,
    #[serde(default)]
    pub preserve_first_message_attachments: bool,
}

#[tauri::command]
/// 发送一条聊天消息，并把流式响应桥接给前端。
pub async fn send_message(
    request: SendMessageRequest,
    on_event: Channel<ChatEvent>,
) -> Result<(), String> {
    let handle = tokio::runtime::Handle::current();
    let (tx, rx) = tokio::sync::oneshot::channel();
    std::thread::spawn(move || {
        let result =
            handle.block_on(async { ChatEngine::new().send_message(request, on_event).await });
        let _ = tx.send(result);
    });
    rx.await.map_err(|e| e.to_string())?
}

#[tauri::command]
/// 列出全部聊天会话摘要。
pub fn list_sessions() -> Result<Vec<SessionInfo>, String> {
    ChatEngine::new().list_sessions()
}

#[tauri::command]
/// 创建一个新的聊天会话。
pub fn create_session() -> Result<String, String> {
    Ok(ChatEngine::new().create_session())
}

#[tauri::command]
/// 删除指定聊天会话。
pub fn delete_session(session_id: String) -> Result<(), String> {
    ChatEngine::new().delete_session(&session_id)
}

#[tauri::command]
/// 读取指定聊天会话的消息列表。
pub fn get_session_messages(session_id: String) -> Result<Vec<MessageInfo>, String> {
    ChatEngine::new().get_messages(&session_id)
}

#[tauri::command]
/// 按关键词搜索聊天消息。
pub fn search_conversation_messages(query: String) -> Result<Vec<MessageSearchResult>, String> {
    ChatEngine::new().search_messages(&query)
}

#[tauri::command]
/// 为“引用聊天上下文”功能生成提示词上下文。
pub fn build_chat_reference_context(
    conversation_id: String,
) -> Result<ChatReferenceContext, String> {
    ChatEngine::new().build_chat_reference_context(&conversation_id)
}

#[tauri::command]
/// 删除指定聊天会话中的一轮问答。
pub fn delete_message(session_id: String, pair_index: usize) -> Result<(), String> {
    ChatEngine::new().delete_message(&session_id, pair_index)
}

#[tauri::command]
/// 从指定消息开始截断聊天会话。
pub fn truncate_messages_from(
    input: TruncateMessagesFromInput,
) -> Result<Vec<MessageInfo>, String> {
    ChatEngine::new().truncate_messages_from(
        &input.conversation_id,
        &input.message_id,
        input.preserve_first_message_attachments,
    )
}

#[tauri::command]
/// 清空指定聊天会话。
pub fn clear_session(session_id: String) -> Result<(), String> {
    ChatEngine::new().clear_session(&session_id)
}

#[tauri::command]
/// 更新聊天会话标题。
pub fn update_conversation_title(id: String, title: String) -> Result<SessionInfo, String> {
    ChatEngine::new().update_conversation_title(&id, &title)
}

#[tauri::command]
/// 更新聊天会话的模型与渠道绑定。
pub fn update_conversation_model(
    id: String,
    model_id: String,
    channel_id: String,
) -> Result<SessionInfo, String> {
    ChatEngine::new().update_conversation_model(&id, &model_id, &channel_id)
}

#[tauri::command]
/// 更新聊天会话中的上下文分隔点。
pub fn update_context_dividers(
    conversation_id: String,
    dividers: Vec<String>,
) -> Result<SessionInfo, String> {
    ChatEngine::new().update_context_dividers(&conversation_id, &dividers)
}

#[tauri::command]
/// 请求中止指定聊天会话当前的生成过程。
pub fn stop_generation(session_id: String) -> Result<(), String> {
    ChatEngine::validate_session_id(&session_id)?;
    let mut guard = STOPPED_SESSIONS.lock().map_err(|e| e.to_string())?;
    let set = guard.get_or_insert_with(HashSet::new);
    set.insert(session_id);
    Ok(())
}

#[tauri::command]
/// 切换聊天会话的置顶状态。
pub fn toggle_pin_conversation(session_id: String) -> Result<SessionInfo, String> {
    ChatEngine::new().toggle_pin(&session_id)
}

#[tauri::command]
/// 切换聊天会话的归档状态。
pub fn toggle_archive_conversation(session_id: String) -> Result<SessionInfo, String> {
    ChatEngine::new().toggle_archive(&session_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::{Mutex, OnceLock};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    struct TestEnvGuard {
        _lock: std::sync::MutexGuard<'static, ()>,
        root: PathBuf,
        old_userprofile: Option<String>,
        old_home: Option<String>,
        old_appdata: Option<String>,
    }

    impl TestEnvGuard {
        fn new(slug: &str) -> Self {
            let lock = env_lock().lock().expect("env lock should be available");
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock should be valid")
                .as_nanos();
            let root = std::env::temp_dir().join(format!("j-gui-chat-{slug}-{unique}"));
            let user_root = root.join("user");
            let appdata_root = root.join("appdata");
            std::fs::create_dir_all(&user_root).expect("test user root should be created");
            std::fs::create_dir_all(&appdata_root).expect("test appdata root should be created");

            let old_userprofile = std::env::var("USERPROFILE").ok();
            let old_home = std::env::var("HOME").ok();
            let old_appdata = std::env::var("APPDATA").ok();

            std::env::set_var("USERPROFILE", &user_root);
            std::env::set_var("HOME", &user_root);
            std::env::set_var("APPDATA", &appdata_root);

            Self {
                _lock: lock,
                root,
                old_userprofile,
                old_home,
                old_appdata,
            }
        }
    }

    impl Drop for TestEnvGuard {
        fn drop(&mut self) {
            match &self.old_userprofile {
                Some(value) => std::env::set_var("USERPROFILE", value),
                None => std::env::remove_var("USERPROFILE"),
            }
            match &self.old_home {
                Some(value) => std::env::set_var("HOME", value),
                None => std::env::remove_var("HOME"),
            }
            match &self.old_appdata {
                Some(value) => std::env::set_var("APPDATA", value),
                None => std::env::remove_var("APPDATA"),
            }
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    struct Cleanup(String);

    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = ChatEngine::new().delete_session(&self.0);
        }
    }

    #[test]
    fn test_toggle_pin_cycle() {
        let _guard = TestEnvGuard::new("toggle-pin-cycle");
        let engine = ChatEngine::new();
        let id = engine.create_session();
        let _cleanup = Cleanup(id.clone());

        // 第一次切换应置顶
        let info = engine.toggle_pin(&id).unwrap();
        assert!(info.pinned, "session should be pinned after toggle");

        // 第二次切换应取消置顶
        let info = engine.toggle_pin(&id).unwrap();
        assert!(
            !info.pinned,
            "session should be unpinned after second toggle"
        );
    }

    #[test]
    fn test_toggle_archive_cycle() {
        let _guard = TestEnvGuard::new("toggle-archive-cycle");
        let engine = ChatEngine::new();
        let id = engine.create_session();
        let _cleanup = Cleanup(id.clone());

        // 第一次切换应归档
        let info = engine.toggle_archive(&id).unwrap();
        assert!(info.archived, "session should be archived after toggle");

        // 第二次切换应取消归档
        let info = engine.toggle_archive(&id).unwrap();
        assert!(
            !info.archived,
            "session should be unarchived after second toggle"
        );
    }

    #[test]
    fn test_toggle_invalid_session() {
        let _guard = TestEnvGuard::new("toggle-invalid-session");
        let engine = ChatEngine::new();
        let result = engine.toggle_pin("invalid-session-id!");
        assert!(result.is_err(), "invalid session id should fail");
    }

    #[test]
    fn test_session_lifecycle_round_trip() {
        let _guard = TestEnvGuard::new("session-lifecycle");
        let engine = ChatEngine::new();
        let id = engine.create_session();

        let sessions = engine.list_sessions().unwrap();
        assert!(
            sessions.iter().any(|session| session.id == id),
            "created session should be listed"
        );

        let messages = engine.get_messages(&id).unwrap();
        assert!(
            messages.is_empty(),
            "newly created session should not have seeded messages"
        );

        engine.delete_session(&id).unwrap();
        let sessions = engine.list_sessions().unwrap();
        assert!(
            sessions.iter().all(|session| session.id != id),
            "deleted session should no longer be listed"
        );
    }

    #[test]
    fn test_stop_generation_marks_and_clears_session_state() {
        let _guard = TestEnvGuard::new("stop-generation-state");
        let engine = ChatEngine::new();
        let id = engine.create_session();
        let _cleanup = Cleanup(id.clone());

        assert!(
            !is_session_stopped(&id),
            "new session should not be marked as stopped"
        );

        stop_generation(id.clone()).unwrap();
        assert!(
            is_session_stopped(&id),
            "stop_generation should mark the session as stopped"
        );

        clear_stopped_session(&id);
        assert!(
            !is_session_stopped(&id),
            "clear_stopped_session should remove the stop marker"
        );
    }

    #[test]
    fn test_stop_generation_rejects_invalid_session_id() {
        let _guard = TestEnvGuard::new("stop-generation-invalid");
        let result = stop_generation("invalid-session-id!".to_string());
        assert!(result.is_err(), "invalid session id should fail");
    }

    #[test]
    fn test_session_meta_updates_round_trip() {
        let _guard = TestEnvGuard::new("session-meta-round-trip");
        let engine = ChatEngine::new();
        let id = engine.create_session();
        let _cleanup = Cleanup(id.clone());

        let titled = engine
            .update_conversation_title(&id, "标题已更新")
            .expect("title update should succeed");
        assert_eq!(titled.title.as_deref(), Some("标题已更新"));

        let modeled = engine
            .update_conversation_model(&id, "deepseek-chat", "deepseek-channel")
            .expect("model update should succeed");
        assert_eq!(modeled.model_id.as_deref(), Some("deepseek-chat"));
        assert_eq!(modeled.channel_id.as_deref(), Some("deepseek-channel"));

        let divided = engine
            .update_context_dividers(&id, &[String::from("chat-index-3")])
            .expect("divider update should succeed");
        assert_eq!(
            divided.context_dividers,
            Some(vec![String::from("chat-index-3")])
        );

        let listed = engine.list_sessions().expect("sessions should list");
        let session = listed
            .into_iter()
            .find(|session| session.id == id)
            .expect("updated session should be present");
        assert_eq!(session.title.as_deref(), Some("标题已更新"));
        assert_eq!(session.model_id.as_deref(), Some("deepseek-chat"));
        assert_eq!(session.channel_id.as_deref(), Some("deepseek-channel"));
        assert_eq!(session.context_dividers, Some(vec!["chat-index-3".into()]));
    }
}

/// 由 chat engine 的流式循环读取此状态。
pub fn is_session_stopped(session_id: &str) -> bool {
    STOPPED_SESSIONS
        .lock()
        .ok()
        .and_then(|guard| guard.as_ref().map(|set| set.contains(session_id)))
        .unwrap_or(false)
}

/// 在 engine 确认停止后清除此状态。
pub fn clear_stopped_session(session_id: &str) {
    if let Ok(mut guard) = STOPPED_SESSIONS.lock() {
        if let Some(set) = guard.as_mut() {
            set.remove(session_id);
        }
    }
}
