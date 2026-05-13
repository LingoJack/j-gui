use super::{AgentEngine, AgentStartRequest};
use crate::agent_session;
use crate::kernel::types::KernelProvider;
use std::collections::HashMap;

#[derive(Debug, Default, PartialEq, Eq)]
pub(super) struct CliResumeState {
    pub(super) resume_session_id: Option<String>,
    pub(super) fork_session: bool,
}

pub(super) fn prune_finished_runtime(
    runtimes: &mut HashMap<String, AgentEngine>,
    session_id: &str,
) {
    let should_remove = runtimes
        .get_mut(session_id)
        .map(AgentEngine::is_finished)
        .unwrap_or(false);
    if should_remove {
        runtimes.remove(session_id);
    }
}

pub(super) fn insert_runtime(
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

pub(super) fn ensure_runtime_idle(
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

pub(super) fn resolve_cli_resume_state(session_id: &str) -> Result<CliResumeState, String> {
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

pub(super) struct InitialMessageBehavior<'a> {
    pub(super) user_message: Option<&'a str>,
    pub(super) persist_to_timeline: bool,
}

pub(super) fn append_initial_user_message(
    session_id: &str,
    user_message: Option<&str>,
) -> Result<(), String> {
    let Some(user_message) = user_message
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(());
    };
    agent_session::append_timeline_item(
        session_id,
        &agent_session::AgentTimelineItem {
            id: agent_session::generate_item_id(),
            kind: "user_message".to_string(),
            content: Some(user_message.to_string()),
            tool_call: None,
            interrupt: None,
            created_at: agent_session::now_millis(),
        },
    )
}

pub(super) fn insert_runtime_and_maybe_append_initial_message(
    runtimes: &mut HashMap<String, AgentEngine>,
    session_id: &str,
    engine: AgentEngine,
    behavior: InitialMessageBehavior<'_>,
) -> Result<(), String> {
    insert_runtime(runtimes, session_id, engine)?;
    if !behavior.persist_to_timeline {
        return Ok(());
    }
    if let Err(error) = append_initial_user_message(session_id, behavior.user_message) {
        if let Some(mut engine) = runtimes.remove(session_id) {
            engine.close();
        }
        return Err(error);
    }
    Ok(())
}

pub(super) struct AgentStartContext {
    pub(super) sid: String,
    pub(super) model_id: String,
    pub(super) mode: String,
    pub(super) cli_resume: CliResumeState,
}

pub(super) fn resolve_start_context(
    input: &AgentStartRequest,
    provider: &KernelProvider,
    use_jagent: bool,
) -> Result<AgentStartContext, String> {
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
        .or_else(|| provider.models.first().map(|model| model.id.as_str()))
        .unwrap_or("")
        .to_string();
    Ok(AgentStartContext {
        sid,
        model_id,
        mode,
        cli_resume,
    })
}
