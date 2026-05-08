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
pub struct MessageInfo {
    pub role: String,
    pub content: String,
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

    pub fn validate_session_id(id: &str) -> Result<(), String> {
        if id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') && !id.is_empty() {
            Ok(())
        } else {
            Err(format!("无效的 session ID: {}", id))
        }
    }

    pub async fn send_message(
        &self,
        session_id: String,
        content: String,
        on_event: Channel<ChatEvent>,
    ) -> Result<(), String> {
        Self::validate_session_id(&session_id)?;
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
        let mut cancelled = false;

        let result = call_llm_stream_async(
            &provider,
            &messages,
            system_prompt_str,
            &mut |chunk: &str| {
                if cancelled {
                    return;
                }
                if on_event
                    .send(ChatEvent::Chunk {
                        index,
                        content: chunk.to_string(),
                    })
                    .is_err()
                {
                    cancelled = true;
                }
                index += 1;
            },
        )
        .await;

        if cancelled {
            return Err("流式传输已取消".to_string());
        }

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

    pub fn get_messages(&self, session_id: &str) -> Result<Vec<MessageInfo>, String> {
        Self::validate_session_id(session_id)?;
        let messages = load_session(session_id);
        Ok(messages
            .into_iter()
            .map(|m| MessageInfo {
                role: match m.role {
                    MessageRole::User => "user".to_string(),
                    MessageRole::Assistant => "assistant".to_string(),
                    _ => "unknown".to_string(),
                },
                content: m.content,
            })
            .collect())
    }

    pub fn delete_message(&self, session_id: &str, pair_index: usize) -> Result<(), String> {
        Self::validate_session_id(session_id)?;
        let paths = j_cli::command::chat::storage::session::SessionPaths::new(session_id);
        let transcript_path = paths.transcript();
        if !transcript_path.exists() {
            return Err("会话记录不存在".to_string());
        }

        let content = std::fs::read_to_string(&transcript_path)
            .map_err(|e| format!("读取会话记录失败: {}", e))?;

        // Count message events (skip non-message events like Clear)
        // Parse each line as JSON and check for {"msg":...} wrapper
        let mut msg_event_indices: Vec<usize> = Vec::new();
        for (i, line) in content.lines().enumerate() {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                if v.get("msg").is_some() {
                    msg_event_indices.push(i);
                }
            }
        }

        let user_idx = pair_index * 2;
        let assistant_idx = user_idx + 1;
        if assistant_idx >= msg_event_indices.len() {
            return Err("消息索引超出范围".to_string());
        }

        let remove_lines: std::collections::HashSet<usize> =
            [msg_event_indices[user_idx], msg_event_indices[assistant_idx]]
                .into_iter()
                .collect();

        let new_content: String = content
            .lines()
            .enumerate()
            .filter(|(i, _)| !remove_lines.contains(i))
            .map(|(_, line)| line.to_string() + "\n")
            .collect();

        std::fs::write(&transcript_path, new_content)
            .map_err(|e| format!("写入会话记录失败: {}", e))?;

        Ok(())
    }

    pub fn delete_session(&self, session_id: &str) -> Result<(), String> {
        Self::validate_session_id(session_id)?;
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
