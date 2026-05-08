use j_cli::command::chat::agent::api::call_llm_stream_async;
use j_cli::command::chat::storage::{
    ChatMessage, MessageRole, SessionEvent, append_session_event, load_agent_config,
    load_session, load_system_prompt,
};
use j_cli::command::chat::storage::session::list_sessions;
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::ipc::Channel;

static SESSION_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
pub enum ChatEvent {
    Chunk { index: u32, content: String },
    Done { total_tokens: u32 },
    Error { message: String },
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub title: Option<String>,
    pub message_count: usize,
    pub updated_at: u64,
}

pub struct ChatEngine;

impl ChatEngine {
    pub fn new() -> Self {
        Self
    }

    pub async fn send_message(
        &self,
        session_id: String,
        content: String,
        on_event: Channel<ChatEvent>,
    ) -> Result<(), String> {
        let agent_config = load_agent_config();
        let provider = agent_config
            .providers
            .get(agent_config.active_index)
            .ok_or("未配置模型提供方，请先在设置中添加并选择")?
            .clone();

        let mut messages = load_session(&session_id);
        let user_msg = ChatMessage::text(MessageRole::User, &content);
        // Persist user message before LLM call to avoid data loss on error
        append_session_event(&session_id, &SessionEvent::msg(user_msg.clone()));
        messages.push(user_msg);

        let system_prompt = load_system_prompt();
        let system_prompt_str = system_prompt.as_deref();

        let mut index: u32 = 0;

        let result = call_llm_stream_async(
            &provider,
            &messages,
            system_prompt_str,
            &mut |chunk: &str| {
                let _ = on_event.send(ChatEvent::Chunk {
                    index,
                    content: chunk.to_string(),
                });
                index += 1;
            },
        )
        .await;

        match result {
            Ok(full_text) => {
                let assistant_msg = ChatMessage::text(MessageRole::Assistant, &full_text);
                append_session_event(&session_id, &SessionEvent::msg(assistant_msg));

                let _ = on_event.send(ChatEvent::Done { total_tokens: 0 });
                Ok(())
            }
            Err(e) => {
                let msg = e.display_message();
                let _ = on_event.send(ChatEvent::Error {
                    message: msg.clone(),
                });
                Err(msg)
            }
        }
    }

    pub fn list_sessions(&self) -> Result<Vec<SessionInfo>, String> {
        let sessions = list_sessions();
        Ok(sessions
            .into_iter()
            .map(|s| SessionInfo {
                id: s.id,
                title: s.title,
                message_count: s.message_count,
                updated_at: s.updated_at,
            })
            .collect())
    }

    pub fn create_session(&self) -> String {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_micros();
        let pid = std::process::id();
        let seq = SESSION_COUNTER.fetch_add(1, Ordering::Relaxed);
        format!("{:x}-{:x}-{:x}", ts, pid, seq)
    }

    pub fn delete_session(&self, session_id: &str) -> Result<(), String> {
        let path = j_cli::command::chat::storage::session::SessionPaths::new(session_id);
        let transcript = path.transcript();
        let meta = path.meta_file();
        if transcript.exists() {
            std::fs::remove_file(&transcript).map_err(|e| e.to_string())?;
        }
        if meta.exists() {
            std::fs::remove_file(&meta).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}
