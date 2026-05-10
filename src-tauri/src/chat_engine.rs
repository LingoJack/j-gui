use crate::kernel::types::{KernelChatMessage, KernelProvider};
use crate::kernel::{ChatKernel, ConfigKernel, JcliAdapter};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::ipc::Channel;

static SESSION_WRITE_LOCK: Mutex<()> = Mutex::new(());

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
    pub timestamp: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub title: Option<String>,
    pub message_count: usize,
    pub updated_at: u64,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub archived: bool,
}

pub struct ChatEngine {
    chat_kernel: Arc<dyn ChatKernel>,
    config_kernel: Arc<dyn ConfigKernel>,
}

impl ChatEngine {
    pub fn new() -> Self {
        let adapter = Arc::new(JcliAdapter::new());
        Self::new_with_kernel(adapter.clone(), adapter)
    }

    pub fn new_with_kernel(
        chat_kernel: Arc<dyn ChatKernel>,
        config_kernel: Arc<dyn ConfigKernel>,
    ) -> Self {
        Self {
            chat_kernel,
            config_kernel,
        }
    }

    pub fn validate_session_id(id: &str) -> Result<(), String> {
        if id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') && !id.is_empty() {
            Ok(())
        } else {
            Err(format!("无效的 session ID: {}", id))
        }
    }

    /// Load the active provider from config.
    fn load_active_provider(&self) -> Result<KernelProvider, String> {
        let providers = self
            .config_kernel
            .load_providers()
            .map_err(|e| e.to_string())?;
        let active_index = self
            .config_kernel
            .load_active_index()
            .map_err(|e| e.to_string())?;
        providers
            .get(active_index)
            .ok_or_else(|| "未配置模型提供方，请先在设置中添加并选择".to_string())
            .cloned()
    }

    /// Build the message list for the LLM call.
    fn build_messages(
        &self,
        session_id: &str,
        content: &str,
    ) -> Result<(Vec<KernelChatMessage>, Option<String>), String> {
        let kernel_events = self
            .chat_kernel
            .get_session(session_id)
            .map_err(|e| e.to_string())?;
        let mut messages: Vec<KernelChatMessage> = kernel_events
            .iter()
            .map(|e| KernelChatMessage {
                role: e.role.clone(),
                content: e.content.clone(),
            })
            .collect();
        messages.push(KernelChatMessage {
            role: "user".to_string(),
            content: content.to_string(),
        });
        let system_prompt = self
            .config_kernel
            .load_system_prompt()
            .map_err(|e| e.to_string())?;
        Ok((messages, system_prompt))
    }

    /// Persist the assistant response to the session transcript.
    fn persist_response(&self, session_id: &str, response: &str) -> Result<(), String> {
        let _lock = SESSION_WRITE_LOCK
            .lock()
            .map_err(|e| format!("锁定会话写入失败: {}", e))?;
        self.chat_kernel
            .append_message(session_id, "assistant", response)
            .map_err(|e| e.to_string())
    }

    pub async fn send_message(
        &self,
        session_id: String,
        content: String,
        on_event: Channel<ChatEvent>,
    ) -> Result<(), String> {
        Self::validate_session_id(&session_id)?;

        let provider = self.load_active_provider()?;
        let (messages, system_prompt) = self.build_messages(&session_id, &content)?;

        // Persist user message before LLM call to avoid data loss on error
        {
            let _lock = SESSION_WRITE_LOCK
                .lock()
                .map_err(|e| format!("锁定会话写入失败: {}", e))?;
            self.chat_kernel
                .append_message(&session_id, "user", &content)
                .map_err(|e| e.to_string())?;
        }

        // Stream LLM call
        let mut index: u32 = 0;
        let mut cancelled = false;

        let result = self
            .chat_kernel
            .stream_chat(
                &provider,
                &messages,
                system_prompt.as_deref(),
                &mut |chunk: &str| {
                    if cancelled {
                        return;
                    }
                    // Check if generation was externally stopped
                    if crate::commands::chat::is_session_stopped(&session_id) {
                        cancelled = true;
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
            crate::commands::chat::clear_stopped_session(&session_id);
            return Err("流式传输已取消".to_string());
        }

        match result {
            Ok(full_text) => {
                self.persist_response(&session_id, &full_text)?;
                // TODO(#26): extract token count from LLM response — kernel API
                // currently returns only the full response text, not usage stats.
                let _ = on_event.send(ChatEvent::Done { total_tokens: 0 });
                crate::commands::chat::clear_stopped_session(&session_id);
                Ok(())
            }
            Err(e) => {
                crate::commands::chat::clear_stopped_session(&session_id);
                let msg = e.to_string();
                let _ = on_event.send(ChatEvent::Error {
                    message: msg.clone(),
                });
                Err(msg)
            }
        }
    }

    pub fn list_sessions(&self) -> Result<Vec<SessionInfo>, String> {
        let sessions = self
            .chat_kernel
            .list_sessions()
            .map_err(|e| e.to_string())?;
        Ok(sessions
            .into_iter()
            .map(|s| SessionInfo {
                id: s.id,
                title: s.title,
                message_count: s.message_count,
                updated_at: s.updated_at,
                pinned: s.pinned,
                archived: s.archived,
            })
            .collect())
    }

    pub fn create_session(&self) -> String {
        match self.chat_kernel.create_session() {
            Ok(id) => id,
            Err(_) => {
                let ts = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_micros();
                let pid = std::process::id();
                let seq = SESSION_COUNTER.fetch_add(1, Ordering::Relaxed);
                format!("{:x}-{:x}-{:x}", ts, pid, seq)
            }
        }
    }

    pub fn get_messages(&self, session_id: &str) -> Result<Vec<MessageInfo>, String> {
        Self::validate_session_id(session_id)?;
        let events = self
            .chat_kernel
            .get_session(session_id)
            .map_err(|e| e.to_string())?;
        Ok(events
            .into_iter()
            .map(|e| MessageInfo {
                role: e.role,
                content: e.content,
                timestamp: SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
            })
            .collect())
    }

    pub fn delete_message(&self, session_id: &str, pair_index: usize) -> Result<(), String> {
        let _lock = SESSION_WRITE_LOCK
            .lock()
            .map_err(|e| format!("锁定会话写入失败: {}", e))?;
        Self::validate_session_id(session_id)?;
        self.chat_kernel
            .delete_message(session_id, pair_index)
            .map_err(|e| e.to_string())
    }

    pub fn clear_session(&self, session_id: &str) -> Result<(), String> {
        Self::validate_session_id(session_id)?;
        let _lock = SESSION_WRITE_LOCK
            .lock()
            .map_err(|e| format!("锁定会话写入失败: {}", e))?;
        self.chat_kernel
            .clear_session(session_id)
            .map_err(|e| e.to_string())
    }

    pub fn delete_session(&self, session_id: &str) -> Result<(), String> {
        Self::validate_session_id(session_id)?;
        self.chat_kernel
            .delete_session(session_id)
            .map_err(|e| e.to_string())
    }

    pub fn toggle_pin(&self, session_id: &str) -> Result<SessionInfo, String> {
        Self::validate_session_id(session_id)?;
        let summary = self
            .chat_kernel
            .toggle_pin(session_id)
            .map_err(|e| e.to_string())?;
        Ok(SessionInfo {
            id: summary.id,
            title: summary.title,
            message_count: summary.message_count,
            updated_at: summary.updated_at,
            pinned: summary.pinned,
            archived: summary.archived,
        })
    }

    pub fn toggle_archive(&self, session_id: &str) -> Result<SessionInfo, String> {
        Self::validate_session_id(session_id)?;
        let summary = self
            .chat_kernel
            .toggle_archive(session_id)
            .map_err(|e| e.to_string())?;
        Ok(SessionInfo {
            id: summary.id,
            title: summary.title,
            message_count: summary.message_count,
            updated_at: summary.updated_at,
            pinned: summary.pinned,
            archived: summary.archived,
        })
    }
}
