#![allow(dead_code)]

//! j-gui owned domain types for the kernel trait boundary.
//! These are NOT jcli types — adapter does the conversion.
//!
//! All types derive Clone + Debug + PartialEq for mockall compatibility.

use serde::{Deserialize, Serialize};
use std::sync::mpsc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::ipc::Channel;

// ---------------------------------------------------------------------------
// Provider / Channel types
// ---------------------------------------------------------------------------

/// Model entry within a provider/channel.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelChannelModel {
    pub id: String,
    pub name: String,
    pub enabled: bool,
}

/// Provider configuration for LLM calls.
/// Fields are kept snake_case for agent_config.json backward compat with jcli;
/// new fields use explicit #[serde(rename)] for camelCase.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct KernelProvider {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub api_base: String,
    pub api_key: String,
    pub models: Vec<KernelChannelModel>,
    pub enabled: bool,
    pub supports_vision: bool,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
    #[serde(rename = "updatedAt")]
    pub updated_at: u64,
}

/// Input for creating a new channel.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelCreateChannelInput {
    pub name: String,
    pub provider: String,
    pub api_base: String,
    pub api_key: String,
    pub models: Vec<KernelChannelModel>,
    pub enabled: bool,
}

/// Input for updating an existing channel (all fields optional).
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelUpdateChannelInput {
    pub name: Option<String>,
    pub provider: Option<String>,
    pub api_base: Option<String>,
    pub api_key: Option<String>,
    pub models: Option<Vec<KernelChannelModel>>,
    pub enabled: Option<bool>,
}

/// Chat message.
#[derive(Clone, Debug, PartialEq)]
pub struct KernelChatMessage {
    pub role: String,
    pub content: String,
}

/// Session summary for listing.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelSessionSummary {
    pub id: String,
    pub title: Option<String>,
    pub message_count: usize,
    pub updated_at: u64,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub archived: bool,
}

/// Session event from transcript.
#[derive(Clone, Debug, PartialEq)]
pub struct KernelSessionEvent {
    pub role: String,
    pub content: String,
    pub timestamp: u64,
}

/// Alias entry.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelAliasEntry {
    pub section: String,
    pub name: String,
    pub value: String,
}

/// Skill info.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelSkillInfo {
    pub name: String,
    pub description: String,
    pub source: String,
    pub dir_path: String,
}

/// Hook info.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelHookInfo {
    pub name: Option<String>,
    pub event: String,
    pub source: String,
    pub hook_type: String,
    pub label: String,
    pub timeout: Option<u64>,
    pub on_error: Option<String>,
    pub unique_id: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

/// MCP server config.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelMcpServerConfig {
    pub name: String,
    pub transport: String,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub url: Option<String>,
    pub env: Option<std::collections::HashMap<String, String>>,
    pub disabled: bool,
}

/// Per-workspace MCP configuration.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelMcpWorkspaceConfig {
    pub servers: Vec<KernelMcpServerConfig>,
}

/// Built-in tool info.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelToolInfo {
    pub name: String,
    pub description: String,
    pub enabled: bool,
}

// ---------------------------------------------------------------------------
// Helpers (shared between adapter and commands)
// ---------------------------------------------------------------------------

/// Current unix timestamp in milliseconds.
pub fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Infer provider type string from an API base URL.
pub fn infer_provider(api_base: &str) -> String {
    let base = api_base.to_lowercase();
    if base.contains("deepseek") {
        return "deepseek".into();
    }
    if base.contains("openai") {
        return "openai".into();
    }
    if base.contains("anthropic") || base.contains("claude") {
        return "anthropic".into();
    }
    if base.contains("google") || base.contains("gemini") {
        return "google".into();
    }
    if base.contains("moonshot") || base.contains("kimi") {
        return "moonshot".into();
    }
    if base.contains("zhipu") || base.contains("chatglm") {
        return "zhipu".into();
    }
    if base.contains("minimax") {
        return "minimax".into();
    }
    if base.contains("doubao") || base.contains("volc") {
        return "doubao".into();
    }
    if base.contains("qwen") || base.contains("tongyi") {
        return "tongyi".into();
    }
    "custom".into()
}

/// Parameters for running the jcli agent loop directly through ChatKernel.
#[derive(Clone)]
pub struct KernelAgentParams {
    pub session_id: String,
    pub messages: Vec<KernelChatMessage>,
    pub system_prompt: Option<String>,
    pub permission_mode: String,
    /// Channel for streaming agent events as JSON strings.
    /// The frontend should parse each string as JSON.
    pub on_event: Channel<String>,
    /// Optional Rust-side interceptor for streamed event JSON strings.
    /// When set, every JSON string sent through on_event is also forwarded here.
    /// Used by JAgent backend to bridge events to the existing AgentEvent system.
    pub event_interceptor: Option<mpsc::Sender<String>>,
}
