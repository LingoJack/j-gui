use crate::agent_engine::{AgentCliStartParams, AgentEngine, AgentEvent, AgentJStartParams};
use crate::agent_session::{self, AgentSessionInfo, AgentTimelineItem, CreateSessionMetaInput};
use crate::kernel::types::{KernelAgentInterruptResponse, KernelPlanDecision};
use crate::kernel::{ChatKernel, JcliAdapter};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;
#[path = "agent_compat.rs"]
mod agent_compat;
use agent_compat as compat;
#[cfg(test)]
pub(crate) use agent_compat::{
    AskUserAnswer, AskUserRequest, PermissionRequest, UpdateSessionTitleRequest,
    UpdateSessionTitleResult,
};

/// Tauri 全局状态中的 AgentEngine 容器。
pub struct AgentState(pub Arc<Mutex<HashMap<String, AgentEngine>>>);

#[derive(Debug, Default, PartialEq, Eq)]
struct CliResumeState {
    resume_session_id: Option<String>,
    fork_session: bool,
}

fn prune_finished_runtime(runtimes: &mut HashMap<String, AgentEngine>, session_id: &str) {
    let should_remove = runtimes
        .get_mut(session_id)
        .map(AgentEngine::is_finished)
        .unwrap_or(false);
    if should_remove {
        runtimes.remove(session_id);
    }
}

fn insert_runtime(
    runtimes: &mut HashMap<String, AgentEngine>,
    session_id: &str,
    engine: AgentEngine,
) -> Result<(), String> {
    prune_finished_runtime(runtimes, session_id);
    if runtimes.contains_key(session_id) {
        return Err(format!("Agent 会话已在运行中: {}", session_id));
    }
    runtimes.insert(session_id.to_string(), engine);
    Ok(())
}

fn ensure_runtime_idle(
    runtimes: &mut HashMap<String, AgentEngine>,
    session_id: &str,
) -> Result<(), String> {
    prune_finished_runtime(runtimes, session_id);
    if runtimes.contains_key(session_id) {
        return Err(format!(
            "Agent 会话仍在运行中，无法在运行期间执行该操作: {}",
            session_id
        ));
    }
    Ok(())
}

fn resolve_cli_resume_state(session_id: &str) -> Result<CliResumeState, String> {
    let session = agent_session::list_agent_sessions()?
        .into_iter()
        .find(|item| item.id == session_id);
    let Some(session) = session else {
        return Ok(CliResumeState::default());
    };

    if session.resume_at_message_uuid.is_some() {
        return Ok(CliResumeState::default());
    }

    if let Some(sdk_session_id) = session.sdk_session_id {
        return Ok(CliResumeState {
            resume_session_id: Some(sdk_session_id),
            fork_session: false,
        });
    }

    if let Some(source_sdk_session_id) = session.fork_source_sdk_session_id {
        return Ok(CliResumeState {
            resume_session_id: Some(source_sdk_session_id),
            fork_session: true,
        });
    }

    Ok(CliResumeState::default())
}

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
    pub file_rewind: Option<serde_json::Value>,
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

    let mode = input
        .permission_mode_override
        .clone()
        .or(input.permission_mode.clone())
        .unwrap_or_else(|| "default".to_string());
    let sid = match input.session_id.clone() {
        Some(id) => id,
        None => agent_session::create_agent_session()?,
    };
    agent_session::set_session_stopped_by_user(&sid, false)?;
    let backend_mode = if use_jagent {
        Some("jagent")
    } else {
        Some("claude-sdk")
    };
    agent_session::set_session_backend_mode(&sid, backend_mode)?;
    let cli_resume = resolve_cli_resume_state(&sid)?;
    let model_id = input
        .model_id
        .as_deref()
        .or_else(|| provider.models.first().map(|m| m.id.as_str()))
        .unwrap_or("");

    if use_jagent {
        let engine = AgentEngine::start_jagent(AgentJStartParams {
            kernel: Arc::clone(&*kernel) as Arc<dyn ChatKernel>,
            on_event,
            session_id: sid.clone(),
            messages: build_jagent_messages(&input),
            permission_mode: mode,
            system_prompt: None,
        })?;
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        insert_runtime(&mut guard, &sid, engine)?;
    } else {
        let engine = AgentEngine::start(AgentCliStartParams {
            on_event,
            permission_mode: mode,
            session_id: sid.clone(),
            model: model_id.to_string(),
            api_base: provider.api_base.clone(),
            api_key: provider.api_key.clone(),
            resume_session_id: cli_resume.resume_session_id,
            fork_session: cli_resume.fork_session,
        })?;
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        insert_runtime(&mut guard, &sid, engine)?;
    }
    Ok(())
}

#[tauri::command]
pub fn create_agent_session(
    input: Option<CreateAgentSessionRequest>,
) -> Result<AgentSessionInfo, String> {
    let input = input.unwrap_or_default();
    let id = agent_session::create_agent_session_with_meta(CreateSessionMetaInput {
        title: input.title.clone(),
        channel_id: input.channel_id.clone(),
        workspace_id: input.workspace_id.clone(),
        permission_mode: Some("bypassPermissions".to_string()),
        backend_mode: None,
        fork_source_dir: None,
        fork_source_sdk_session_id: None,
        resume_at_message_uuid: None,
    })?;
    agent_session::list_agent_sessions()?
        .into_iter()
        .find(|session| session.id == id)
        .ok_or_else(|| "创建会话后未找到会话信息".to_string())
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
pub fn get_agent_session_sdk_messages(id: String) -> Result<Vec<serde_json::Value>, String> {
    let timeline = agent_session::get_agent_session(&id)?;
    Ok(agent_session::timeline_to_sdk_messages(&id, &timeline))
}

#[tauri::command]
pub fn search_agent_session_messages(
    query: String,
) -> Result<Vec<agent_session::AgentMessageSearchResult>, String> {
    agent_session::search_agent_session_messages(&query)
}

#[tauri::command]
pub fn delete_agent_session(session_id: String) -> Result<(), String> {
    agent_session::delete_agent_session(&session_id)
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
    let parsed = parse_interrupt_response(&kind, &response);
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

fn parse_interrupt_response(
    kind: &str,
    response: &serde_json::Value,
) -> KernelAgentInterruptResponse {
    match kind {
        "ask_user" => KernelAgentInterruptResponse::AskUser {
            result_json: build_ask_user_response_json(response),
        },
        "plan" => KernelAgentInterruptResponse::Plan {
            decision: parse_plan_decision(response["decision"].as_str().unwrap_or("reject")),
            feedback: response["feedback"].as_str().map(|s| s.to_string()),
        },
        _ => KernelAgentInterruptResponse::Permission {
            allowed: response["allowed"].as_bool().unwrap_or(false),
            always_allow: response["alwaysAllow"].as_bool().unwrap_or(false),
        },
    }
}

fn parse_ask_user_answers(response: &serde_json::Value) -> Vec<AgentInterruptAskUserAnswer> {
    response["answers"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    serde_json::from_value::<AgentInterruptAskUserAnswer>(item.clone()).ok()
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn parse_selected_options(response: &serde_json::Value) -> Vec<String> {
    response["selectedOptions"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn build_ask_user_response_json(response: &serde_json::Value) -> String {
    let answers = parse_ask_user_answers(response);
    if !answers.is_empty() {
        return serde_json::json!({
            "answers": answers.iter().map(|answer| serde_json::json!({
                "question_id": answer.question_id,
                "selected_options": answer.selected_options,
                "custom_text": answer.custom_text,
            })).collect::<Vec<_>>(),
        })
        .to_string();
    }

    serde_json::json!({
        "selected_options": parse_selected_options(response),
        "custom_text": response["customText"].as_str().map(|s| s.to_string()),
    })
    .to_string()
}

fn parse_plan_decision(decision: &str) -> KernelPlanDecision {
    match decision {
        "approve" | "approve_auto" => KernelPlanDecision::Approve,
        "approve_and_clear_context" | "approve_edit" => KernelPlanDecision::ApproveAndClearContext,
        "feedback" | "deny" | "reject" => KernelPlanDecision::Reject,
        _ => KernelPlanDecision::Reject,
    }
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
        file_rewind: Some(serde_json::json!({
            "canRewind": false,
            "error": "当前版本仅回退对话时间线，不恢复文件快照"
        })),
    })
}

#[cfg(test)]
#[path = "../tests/commands_agent.rs"]
mod tests;
