#![allow(dead_code)]

//! j-gui owned domain types for the kernel trait boundary.
//! These are NOT jcli types — adapter does the conversion.
//!
//! All types derive Clone + Debug + PartialEq for mockall compatibility.

use serde::{Deserialize, Serialize};

/// Provider configuration for LLM calls.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelProvider {
    pub name: String,
    pub api_base: String,
    pub api_key: String,
    pub model: String,
    pub supports_vision: bool,
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
#[derive(Clone, Debug, PartialEq, Serialize)]
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

/// Built-in tool info.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelToolInfo {
    pub name: String,
    pub description: String,
    pub enabled: bool,
}
