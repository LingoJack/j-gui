use super::CreateAgentSessionRequest;
use crate::agent_session::{self, AgentSessionInfo, AgentTimelineItem, CreateSessionMetaInput};

pub(super) fn create_agent_session(
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

pub(super) fn list_agent_sessions() -> Result<Vec<AgentSessionInfo>, String> {
    agent_session::list_agent_sessions()
}

pub(super) fn get_agent_session(session_id: String) -> Result<Vec<AgentTimelineItem>, String> {
    agent_session::get_agent_session(&session_id)
}

pub(super) fn get_agent_session_sdk_messages(id: String) -> Result<Vec<serde_json::Value>, String> {
    let timeline = agent_session::get_agent_session(&id)?;
    Ok(agent_session::timeline_to_sdk_messages(&id, &timeline))
}

pub(super) fn search_agent_session_messages(
    query: String,
) -> Result<Vec<agent_session::AgentMessageSearchResult>, String> {
    agent_session::search_agent_session_messages(&query)
}

pub(super) fn delete_agent_session(session_id: String) -> Result<(), String> {
    agent_session::delete_agent_session(&session_id)
}
