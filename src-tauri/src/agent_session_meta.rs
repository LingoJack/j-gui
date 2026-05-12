use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentSessionMetaRecord {
    #[serde(default)]
    pub created_at: u64,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub channel_id: Option<String>,
    #[serde(default)]
    pub sdk_session_id: Option<String>,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub manual_working: bool,
    #[serde(default)]
    pub stopped_by_user: bool,
    #[serde(default)]
    pub permission_mode: Option<String>,
    #[serde(default)]
    pub backend_mode: Option<String>,
    #[serde(default)]
    pub fork_source_dir: Option<String>,
    #[serde(default)]
    pub fork_source_sdk_session_id: Option<String>,
    #[serde(default)]
    pub resume_at_message_uuid: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct CreateSessionMetaInput {
    pub title: Option<String>,
    pub channel_id: Option<String>,
    pub workspace_id: Option<String>,
    pub permission_mode: Option<String>,
    pub backend_mode: Option<String>,
    pub fork_source_dir: Option<String>,
    pub fork_source_sdk_session_id: Option<String>,
    pub resume_at_message_uuid: Option<String>,
}
