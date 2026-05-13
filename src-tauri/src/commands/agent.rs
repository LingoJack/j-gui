use crate::agent_engine::{AgentCliStartParams, AgentEngine, AgentEvent, AgentJStartParams};
use crate::agent_session::{self, AgentSessionInfo, AgentTimelineItem};
use crate::kernel::{ChatKernel, JcliAdapter};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;
#[path = "agent_compat.rs"]
mod agent_compat;
#[path = "agent_interrupts.rs"]
mod agent_interrupts;
#[path = "agent_runtime_state.rs"]
mod agent_runtime_state;
#[path = "agent_session_commands.rs"]
mod agent_session_commands;
use agent_compat as compat;
#[cfg(test)]
pub(crate) use agent_compat::{
    AskUserAnswer, AskUserRequest, PermissionRequest, UpdateSessionTitleRequest,
    UpdateSessionTitleResult,
};
#[cfg(test)]
use agent_runtime_state::{
    append_initial_user_message, insert_runtime, resolve_cli_resume_state, CliResumeState,
};
use agent_runtime_state::{
    ensure_runtime_idle, insert_runtime_and_maybe_append_initial_message, prune_finished_runtime,
    resolve_start_context, InitialMessageBehavior,
};
/// Tauri 全局状态中的 AgentEngine 容器。
pub struct AgentState(pub Arc<Mutex<HashMap<String, AgentEngine>>>);

#[allow(dead_code)]
#[derive(Debug, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentStartRequest {
    pub session_id: Option<String>,
    pub channel_id: Option<String>,
    pub model_id: Option<String>,
    pub permission_mode_override: Option<String>,
    pub permission_mode: Option<String>,
    pub use_jagent: Option<bool>,
    pub user_message: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentSendMessageRequest {
    pub session_id: String,
    pub user_message: String,
}

#[derive(Debug, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentSessionRequest {
    pub title: Option<String>,
    pub channel_id: Option<String>,
    pub workspace_id: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MoveSessionToWorkspaceInput {
    pub session_id: String,
    pub target_workspace_id: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ForkSessionInput {
    pub session_id: String,
    pub up_to_message_uuid: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RewindSessionInput {
    pub session_id: String,
    pub assistant_message_uuid: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RewindSessionResult {
    pub remaining_messages: usize,
    pub file_rewind: Option<FileRewindResult>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileRewindResult {
    pub can_rewind: bool,
    pub code: String,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files_changed: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub insertions: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deletions: Option<u64>,
}

fn timeline_only_file_rewind_result() -> FileRewindResult {
    let reason = "当前版本仅回退对话时间线，不恢复文件快照".to_string();
    FileRewindResult {
        can_rewind: false,
        code: "timeline_only".to_string(),
        reason: reason.clone(),
        error: Some(reason),
        files_changed: None,
        insertions: None,
        deletions: None,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RespondAgentInterruptRequest {
    pub session_id: String,
    pub interrupt_id: String,
    pub kind: String,
    pub response: serde_json::Value,
}

fn resolve_start_provider<'a>(
    providers: &'a [crate::kernel::types::KernelProvider],
    active_index: usize,
    input: &AgentStartRequest,
) -> Result<&'a crate::kernel::types::KernelProvider, String> {
    if let Some(channel_id) = input.channel_id.as_deref() {
        if let Some(provider) = providers.iter().find(|provider| provider.id == channel_id) {
            return Ok(provider);
        }
        return Err(format!("未找到 Agent 渠道: {}", channel_id));
    }

    providers
        .get(active_index)
        .ok_or("未配置模型提供方".to_string())
}

fn build_jagent_messages(
    input: &AgentStartRequest,
) -> Vec<crate::kernel::types::KernelChatMessage> {
    input
        .user_message
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|message| {
            vec![crate::kernel::types::KernelChatMessage {
                role: "user".to_string(),
                content: message.to_string(),
                reasoning: None,
                attachments: None,
            }]
        })
        .unwrap_or_default()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentInterruptAskUserAnswer {
    question_id: String,
    #[serde(default)]
    selected_options: Vec<String>,
    #[serde(default)]
    custom_text: Option<String>,
}

#[cfg(test)]
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[allow(dead_code)]
enum AgentInterruptResponse {
    Permission {
        allowed: bool,
        #[serde(default, rename = "alwaysAllow")]
        always_allow: bool,
    },
    AskUser {
        #[serde(default)]
        answers: Vec<AgentInterruptAskUserAnswer>,
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
    input: Option<AgentStartRequest>,
) -> Result<(), String> {
    let input = input.unwrap_or_default();
    let use_jagent = input.use_jagent.unwrap_or(false);

    let providers = kernel
        .config()
        .load_providers()
        .map_err(|e| e.to_string())?;
    let active_index = kernel
        .config()
        .load_active_index()
        .map_err(|e| e.to_string())?;
    let provider = resolve_start_provider(&providers, active_index, &input)?;
    let context = resolve_start_context(&input, provider, use_jagent)?;

    if use_jagent {
        let engine = AgentEngine::start_jagent(AgentJStartParams {
            kernel: Arc::clone(&*kernel) as Arc<dyn ChatKernel>,
            on_event,
            session_id: context.sid.clone(),
            messages: build_jagent_messages(&input),
            permission_mode: context.mode,
            system_prompt: None,
        })?;
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        insert_runtime_and_maybe_append_initial_message(
            &mut guard,
            &context.sid,
            engine,
            InitialMessageBehavior {
                user_message: input.user_message.as_deref(),
                persist_to_timeline: true,
            },
        )?;
    } else {
        let engine = AgentEngine::start(AgentCliStartParams {
            on_event,
            permission_mode: context.mode,
            session_id: context.sid.clone(),
            model: context.model_id,
            api_base: provider.api_base.clone(),
            api_key: provider.api_key.clone(),
            resume_session_id: context.cli_resume.resume_session_id,
            fork_session: context.cli_resume.fork_session,
            initial_user_message: input.user_message.clone(),
        })?;
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        insert_runtime_and_maybe_append_initial_message(
            &mut guard,
            &context.sid,
            engine,
            InitialMessageBehavior {
                user_message: input.user_message.as_deref(),
                persist_to_timeline: false,
            },
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn create_agent_session(
    input: Option<CreateAgentSessionRequest>,
) -> Result<AgentSessionInfo, String> {
    agent_session_commands::create_agent_session(input)
}

#[tauri::command]
pub fn list_agent_sessions() -> Result<Vec<AgentSessionInfo>, String> {
    agent_session_commands::list_agent_sessions()
}

#[tauri::command]
pub fn get_agent_session(session_id: String) -> Result<Vec<AgentTimelineItem>, String> {
    agent_session_commands::get_agent_session(session_id)
}

#[tauri::command]
pub fn get_agent_session_sdk_messages(id: String) -> Result<Vec<serde_json::Value>, String> {
    agent_session_commands::get_agent_session_sdk_messages(id)
}

#[tauri::command]
pub fn search_agent_session_messages(
    query: String,
) -> Result<Vec<agent_session::AgentMessageSearchResult>, String> {
    agent_session_commands::search_agent_session_messages(query)
}

#[tauri::command]
pub fn delete_agent_session(session_id: String) -> Result<(), String> {
    agent_session_commands::delete_agent_session(session_id)
}

#[tauri::command]
pub fn respond_agent_interrupt(
    state: tauri::State<'_, AgentState>,
    input: RespondAgentInterruptRequest,
) -> Result<(), String> {
    respond_agent_interrupt_impl(state, input)
}

pub(crate) fn respond_agent_interrupt_impl(
    state: tauri::State<'_, AgentState>,
    input: RespondAgentInterruptRequest,
) -> Result<(), String> {
    let RespondAgentInterruptRequest {
        session_id,
        interrupt_id,
        kind,
        response,
    } = input;
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    prune_finished_runtime(&mut guard, &session_id);
    let engine = guard
        .get_mut(&session_id)
        .ok_or_else(|| format!("Agent 未启动: {}", session_id))?;
    let parsed = agent_interrupts::parse_interrupt_response(&kind, &response);
    engine.respond_interrupt(&interrupt_id, &parsed)
}

#[tauri::command]
pub async fn generate_agent_title(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    session_id: String,
) -> Result<String, String> {
    compat::generate_agent_title(state, session_id).await
}

#[tauri::command]
pub fn update_agent_session_title(
    request: compat::UpdateSessionTitleRequest,
) -> Result<compat::UpdateSessionTitleResult, String> {
    compat::update_agent_session_title(request)
}

#[tauri::command]
pub fn toggle_pin_agent_session(session_id: String) -> Result<AgentSessionInfo, String> {
    compat::toggle_pin_agent_session(session_id)
}

#[tauri::command]
pub fn toggle_archive_agent_session(session_id: String) -> Result<AgentSessionInfo, String> {
    compat::toggle_archive_agent_session(session_id)
}

#[tauri::command]
pub fn toggle_manual_working_agent_session(session_id: String) -> Result<AgentSessionInfo, String> {
    compat::toggle_manual_working_agent_session(session_id)
}

#[tauri::command]
pub fn update_session_permission_mode(session_id: String, mode: String) -> Result<(), String> {
    compat::update_session_permission_mode(session_id, mode)
}

#[tauri::command]
pub fn respond_permission(
    state: tauri::State<'_, AgentState>,
    request: compat::PermissionRequest,
) -> Result<(), String> {
    compat::respond_permission(state, request)
}

#[tauri::command]
pub fn respond_ask_user(
    state: tauri::State<'_, AgentState>,
    request: compat::AskUserRequest,
) -> Result<(), String> {
    compat::respond_ask_user(state, request)
}

#[tauri::command]
pub fn send_agent_message(
    state: tauri::State<'_, AgentState>,
    input: Option<AgentSendMessageRequest>,
    session_id: Option<String>,
    content: Option<String>,
) -> Result<(), String> {
    let content = match &input {
        Some(request) => request.user_message.clone(),
        None => content.ok_or("缺少 Agent 消息内容")?,
    };
    if let (Some(request), Some(expected_session_id)) = (&input, session_id.as_deref()) {
        if request.session_id != expected_session_id {
            return Err("Agent 会话 ID 不匹配".to_string());
        }
    }
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let target_session_id = input
        .as_ref()
        .map(|request| request.session_id.clone())
        .or(session_id)
        .ok_or("缺少 Agent 会话 ID".to_string())?;
    prune_finished_runtime(&mut guard, &target_session_id);
    let engine = guard
        .get_mut(&target_session_id)
        .ok_or_else(|| format!("Agent 未启动: {}", target_session_id))?;
    engine.send_message(&content)
}

#[tauri::command]
pub fn stop_agent(state: tauri::State<'_, AgentState>, session_id: String) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut engine) = guard.remove(&session_id) {
        engine.close();
    }
    agent_session::set_session_stopped_by_user(&session_id, true)?;
    Ok(())
}

#[tauri::command]
pub fn move_agent_session_to_workspace(
    input: MoveSessionToWorkspaceInput,
) -> Result<AgentSessionInfo, String> {
    let workspaces = crate::commands::settings::list_agent_workspaces()?;
    if !workspaces
        .iter()
        .any(|workspace| workspace.id == input.target_workspace_id)
    {
        return Err(format!("目标工作区不存在: {}", input.target_workspace_id));
    }
    agent_session::set_session_workspace(
        &input.session_id,
        Some(input.target_workspace_id.clone()),
    )?;
    agent_session::list_agent_sessions()?
        .into_iter()
        .find(|session| session.id == input.session_id)
        .ok_or_else(|| "迁移后未找到会话信息".to_string())
}

#[tauri::command]
pub fn fork_agent_session(
    state: tauri::State<'_, AgentState>,
    input: ForkSessionInput,
) -> Result<AgentSessionInfo, String> {
    {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        ensure_runtime_idle(&mut guard, &input.session_id)?;
    }
    agent_session::fork_agent_session(&input.session_id, input.up_to_message_uuid.as_deref())
}

#[tauri::command]
pub fn rewind_session(
    state: tauri::State<'_, AgentState>,
    input: RewindSessionInput,
) -> Result<RewindSessionResult, String> {
    {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        ensure_runtime_idle(&mut guard, &input.session_id)?;
    }
    let remaining_messages =
        agent_session::rewind_agent_session(&input.session_id, &input.assistant_message_uuid)?;
    Ok(RewindSessionResult {
        remaining_messages,
        file_rewind: Some(timeline_only_file_rewind_result()),
    })
}

#[cfg(test)]
#[path = "../tests/commands_agent.rs"]
mod tests;

#[cfg(test)]
mod phase3_tests {
    use super::{timeline_only_file_rewind_result, RewindSessionResult};

    #[test]
    fn timeline_only_file_rewind_result_is_structured_and_legacy_compatible() {
        let result = timeline_only_file_rewind_result();
        assert!(!result.can_rewind);
        assert_eq!(result.code, "timeline_only");
        assert_eq!(result.reason, "当前版本仅回退对话时间线，不恢复文件快照");
        assert_eq!(result.error.as_deref(), Some(result.reason.as_str()));
    }

    #[test]
    fn rewind_session_result_serializes_structured_file_rewind_fields() {
        let value = serde_json::to_value(RewindSessionResult {
            remaining_messages: 3,
            file_rewind: Some(timeline_only_file_rewind_result()),
        })
        .expect("serialize rewind result");

        assert_eq!(value["remainingMessages"], 3);
        assert_eq!(value["fileRewind"]["canRewind"], false);
        assert_eq!(value["fileRewind"]["code"], "timeline_only");
        assert_eq!(
            value["fileRewind"]["reason"],
            "当前版本仅回退对话时间线，不恢复文件快照"
        );
        assert_eq!(
            value["fileRewind"]["error"],
            "当前版本仅回退对话时间线，不恢复文件快照"
        );
    }
}
