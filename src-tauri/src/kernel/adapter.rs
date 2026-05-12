//! JcliAdapter：通过委托既有 jcli 调用来实现全部 kernel trait。
//! 这是项目里唯一允许包含 `j_cli::` 导入的文件。

use base64::Engine;
use std::collections::HashMap;
use std::path::PathBuf;

use super::chat::{
    ChatKernel, KernelAppendMessage, KernelChatStreamCallbacks, KernelChatStreamRequest,
};
use super::config::ConfigKernel;
use super::error::KernelError;
use super::governance::GovernanceKernel;
use super::types::*;
use crate::commands::files::resolve_attachment_path;

// ===== jcli 导入 —— 项目内唯一允许位置 =====
use j_cli::command::chat::agent::config::{AgentLoopConfig, AgentLoopSharedState};
use j_cli::command::chat::agent::{run_main_agent_loop, MainAgentLoopParams};
use j_cli::command::chat::app::types::StreamMsg;
use j_cli::command::chat::app::types::{AskRequest, PlanDecision, ToolResultMsg};
use j_cli::command::chat::context::compact::new_invoked_skills_map;
#[cfg(test)]
use j_cli::command::chat::error::ChatError;
use j_cli::command::chat::infra::hook::manager::HookManager;
use j_cli::command::chat::infra::hook::types::OnError;
use j_cli::command::chat::infra::skill::load_all_skills;
use j_cli::command::chat::permission::JcliConfig;
use j_cli::command::chat::storage::session::list_sessions;
#[cfg(test)]
use j_cli::command::chat::storage::session::sessions_dir;
use j_cli::command::chat::storage::session::SessionPaths;
#[cfg(test)]
use j_cli::command::chat::storage::ToolCallItem;
use j_cli::command::chat::storage::{
    self, load_agent_config, load_system_prompt as jcli_load_system_prompt, save_agent_config,
    save_system_prompt as jcli_save_system_prompt, ChatMessage as JcliChatMessage, DisplayHint,
    ImageData, MessageRole, ModelProvider, SessionEvent,
};
use j_cli::command::chat::tools::background::BackgroundManager;
use j_cli::command::chat::tools::definition::ToolRegistry;
use j_cli::command::chat::tools::derived_shared::SubAgentMetrics;
use j_cli::command::chat::tools::task::TaskManager;
use j_cli::command::chat::tools::todo::TodoManager;
use j_cli::config::YamlConfig;
use j_cli::constants::ALL_SECTIONS;
use j_cli::llm::{ChatRequest, Content, LlmClient, Message, Role};
use j_cli::theme::ThemeName;

#[path = "adapter_chat.rs"]
mod adapter_chat;
#[path = "adapter_config.rs"]
mod adapter_config;
#[path = "adapter_governance.rs"]
mod adapter_governance;
#[path = "adapter_session.rs"]
mod adapter_session;
#[path = "adapter_transport.rs"]
mod adapter_transport;

use self::adapter_session::{stream_msg_to_json_string, toggle_session_bool_field};
#[cfg(test)]
use self::adapter_transport::{build_anthropic_stream_request, build_openai_responses_request};
use self::adapter_transport::{
    build_chat_request_extra, stream_anthropic_messages, stream_openai_responses,
};
use async_trait::async_trait;
use futures_util::StreamExt;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

const JCLI_VERSION: &str = j_cli::constants::VERSION;
type JcliAgentConfig = j_cli::command::chat::storage::AgentConfig;
type InvokedSkillsMap = Arc<
    Mutex<std::collections::HashMap<String, j_cli::command::chat::context::compact::InvokedSkill>>,
>;

// ===== JcliAdapter =====

/// 通过委托 jcli 调用来实现全部 kernel trait 的适配器。
pub struct JcliAdapter;

impl JcliAdapter {
    /// 创建新的适配器实例。
    pub fn new() -> Self {
        Self
    }

    /// 返回 [`ConfigKernel`] 视图。
    pub fn config(&self) -> &dyn ConfigKernel {
        self
    }
    /// 返回 [`ChatKernel`] 视图。
    #[allow(dead_code)]
    /// 暴露 ChatKernel 视图，供需要聊天能力的上层代码复用。
    pub fn chat(&self) -> &dyn ChatKernel {
        self
    }
    /// 返回 [`GovernanceKernel`] 视图。
    pub fn governance(&self) -> &dyn GovernanceKernel {
        self
    }

    fn spawn_bridge_thread(
        rx: std::sync::mpsc::Receiver<StreamMsg>,
        event_interceptor: Option<std::sync::mpsc::Sender<String>>,
        on_event: tauri::ipc::Channel<String>,
    ) {
        std::thread::spawn(move || {
            while let Ok(msg) = rx.recv() {
                let json = stream_msg_to_json_string(&msg);
                if let Some(ref interceptor) = event_interceptor {
                    let _ = interceptor.send(json.clone());
                }
                if on_event.send(json).is_err() {
                    break;
                }
            }
        });
    }
}

// ===== 辅助函数 =====

/// agent_config.json 的路径（位于 jcli 数据目录下）。
fn agent_config_path() -> PathBuf {
    YamlConfig::data_dir()
        .join("agent")
        .join("data")
        .join("agent_config.json")
}

/// 以通用 JSON 值形式读取 agent_config.json；文件不存在时返回 `Ok(None)`。
fn read_agent_config_value() -> Result<Option<serde_json::Value>, KernelError> {
    let path = agent_config_path();
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path)?;
    serde_json::from_str(&content)
        .map(Some)
        .map_err(|e| KernelError::Config(format!("解析 agent_config.json 失败: {e}")))
}

/// 判断当前保存的配置是新格式（V1）还是旧格式（V0）。
fn is_v1_format(config: &serde_json::Value) -> bool {
    if let Some(version) = config.get("version").and_then(|v| v.as_u64()) {
        if version >= 1 {
            return true;
        }
    }
    if let Some(providers) = config.get("providers").and_then(|p| p.as_array()) {
        if let Some(first) = providers.first() {
            if first.get("models").is_some() || first.get("id").is_some() {
                return true;
            }
        }
    }
    false
}

/// 把单个旧格式的 `KernelProvider`（空 id）迁移为新格式。
fn migrate_provider(p: &mut KernelProvider) {
    if p.id.is_empty() {
        p.id = uuid::Uuid::new_v4().to_string();
    }
    if p.provider.is_empty() {
        p.provider = infer_provider(&p.api_base);
    }
    if p.created_at == 0 {
        p.created_at = current_timestamp();
    }
    if p.updated_at == 0 {
        p.updated_at = current_timestamp();
    }
}

fn to_jcli_provider(p: &KernelProvider) -> ModelProvider {
    ModelProvider {
        name: p.name.clone(),
        api_base: p.api_base.clone(),
        api_key: p.api_key.clone(),
        model: p.models.first().map(|m| m.id.clone()).unwrap_or_default(),
        supports_vision: p.supports_vision,
    }
}

fn from_jcli_provider(p: &ModelProvider) -> KernelProvider {
    KernelProvider {
        id: String::new(),
        name: p.name.clone(),
        provider: String::new(),
        protocol_hint: None,
        api_base: p.api_base.clone(),
        api_key: p.api_key.clone(),
        models: vec![KernelChannelModel {
            id: p.model.clone(),
            name: p.model.clone(),
            enabled: true,
        }],
        enabled: true,
        supports_vision: p.supports_vision,
        created_at: 0,
        updated_at: 0,
    }
}

fn to_jcli_messages(msgs: &[KernelChatMessage]) -> Vec<JcliChatMessage> {
    msgs.iter()
        .map(|m| JcliChatMessage {
            role: match m.role.as_str() {
                "user" => MessageRole::User,
                "assistant" => MessageRole::Assistant,
                "tool" => MessageRole::Tool,
                "system" => MessageRole::System,
                _ => MessageRole::User,
            },
            content: m.content.clone(),
            tool_calls: None,
            tool_call_id: None,
            images: None,
            reasoning_content: m.reasoning.clone(),
            sender_name: None,
            recipient_name: None,
            display_hint: DisplayHint::Normal,
        })
        .collect()
}

fn load_attachment_images(
    attachments: &[KernelFileAttachment],
) -> Result<Vec<ImageData>, KernelError> {
    attachments
        .iter()
        .map(|attachment| {
            let path =
                resolve_attachment_path(&attachment.local_path).map_err(KernelError::Config)?;
            let bytes = std::fs::read(&path)?;
            Ok(ImageData {
                base64: base64::engine::general_purpose::STANDARD.encode(bytes),
                media_type: attachment.media_type.clone(),
            })
        })
        .collect()
}

fn build_user_content(message: &KernelChatMessage) -> Result<Option<Content>, KernelError> {
    let Some(attachments) = message
        .attachments
        .as_ref()
        .filter(|items| !items.is_empty())
    else {
        return Ok((!message.content.is_empty()).then(|| Content::Text(message.content.clone())));
    };

    let images = load_attachment_images(attachments)?;
    let mut parts = Vec::with_capacity(images.len() + usize::from(!message.content.is_empty()));
    if !message.content.is_empty() {
        parts.push(j_cli::llm::ContentPart::Text {
            text: message.content.clone(),
        });
    }
    for image in images {
        parts.push(j_cli::llm::ContentPart::ImageUrl {
            image_url: j_cli::llm::ImageUrl {
                url: format!("data:{};base64,{}", image.media_type, image.base64),
                detail: None,
            },
        });
    }
    Ok(Some(Content::Parts(parts)))
}

fn to_llm_messages(msgs: &[KernelChatMessage]) -> Result<Vec<Message>, KernelError> {
    msgs.iter()
        .map(|m| {
            Ok(Message {
                role: match m.role.as_str() {
                    "assistant" => Role::Assistant,
                    "system" => Role::System,
                    "tool" => Role::Tool,
                    _ => Role::User,
                },
                content: if m.role == "user" {
                    build_user_content(m)?
                } else {
                    (!m.content.is_empty()).then(|| Content::Text(m.content.clone()))
                },
                name: None,
                tool_calls: None,
                tool_call_id: None,
                reasoning_content: m.reasoning.clone(),
            })
        })
        .collect()
}

fn chat_attachment_sidecar_path(session_id: &str) -> PathBuf {
    SessionPaths::new(session_id)
        .dir()
        .join("chat_attachments.json")
}

fn load_chat_attachment_sidecar(session_id: &str) -> HashMap<usize, Vec<KernelFileAttachment>> {
    let path = chat_attachment_sidecar_path(session_id);
    let Ok(content) = std::fs::read_to_string(path) else {
        return HashMap::new();
    };
    serde_json::from_str(&content).unwrap_or_default()
}

fn save_chat_attachment_sidecar(
    session_id: &str,
    attachments: &HashMap<usize, Vec<KernelFileAttachment>>,
) -> Result<(), KernelError> {
    let path = chat_attachment_sidecar_path(session_id);
    if attachments.is_empty() {
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
        return Ok(());
    }
    let json = serde_json::to_string_pretty(attachments)
        .map_err(|e| KernelError::Config(format!("序列化附件元数据失败: {e}")))?;
    std::fs::write(path, json)?;
    Ok(())
}

fn remove_attachment_files(attachments: &[KernelFileAttachment]) {
    for attachment in attachments {
        if let Ok(path) = resolve_attachment_path(&attachment.local_path) {
            let _ = std::fs::remove_file(path);
        }
    }
}

fn model_id(provider: &KernelProvider) -> &str {
    provider
        .models
        .first()
        .map(|m| m.id.as_str())
        .unwrap_or_default()
}

// ===== Workspace 辅助函数 =====

fn workspace_dir(slug: &str) -> PathBuf {
    super::home_dir()
        .join(".jgui")
        .join("agent-workspaces")
        .join(slug)
}

fn workspace_skills_dir(slug: &str) -> PathBuf {
    workspace_dir(slug).join("skills")
}

fn workspace_mcp_config_path(slug: &str) -> PathBuf {
    workspace_dir(slug).join("mcp.json")
}

fn sdk_config_dir() -> PathBuf {
    YamlConfig::data_dir().join("agent").join("sdk-config")
}

fn parse_skill_frontmatter(content: &str) -> Option<(String, String)> {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return None;
    }
    let rest = &trimmed[3..];
    let end_idx = rest.find("\n---")?;
    let fm_str = rest[..end_idx].trim();

    let mut name = None;
    let mut description = None;
    for line in fm_str.lines() {
        let line = line.trim();
        if let Some((key, value)) = line.split_once(':') {
            match key.trim() {
                "name" => name = Some(value.trim().to_string()),
                "description" => description = Some(value.trim().to_string()),
                _ => {}
            }
        }
    }
    Some((name?, description.unwrap_or_default()))
}

fn scan_workspace_skills_dir(skills_dir: &std::path::Path) -> Vec<KernelSkillInfo> {
    if !skills_dir.is_dir() {
        return Vec::new();
    }
    let mut skills = Vec::new();
    let entries = match std::fs::read_dir(skills_dir) {
        Ok(e) => e,
        Err(_) => return skills,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let skill_md = path.join("SKILL.md");
        let content = match std::fs::read_to_string(&skill_md) {
            Ok(c) => c,
            Err(_) => continue,
        };
        if let Some((name, description)) = parse_skill_frontmatter(&content) {
            let slug = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            skills.push(KernelSkillInfo {
                name,
                description,
                source: format!("workspace:{}", slug),
                dir_path: path.to_string_lossy().to_string(),
            });
        }
    }
    skills
}

// ===== 会话元数据辅助函数 =====

/// 切换 session.json 元数据中的布尔字段。
/// 会读取当前值、翻转后写回，并返回更新后的摘要。
// ===== 测试 =====

#[cfg(test)]
#[path = "../tests/kernel_adapter.rs"]
mod tests;
