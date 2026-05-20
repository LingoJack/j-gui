use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// MCP 服务配置项。
pub struct McpServerConfig {
    pub name: String,
    pub transport: String, // 可选值："stdio" | "sse"
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub url: Option<String>,
    pub env: Option<std::collections::HashMap<String, String>>,
    pub disabled: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// 工作区级 MCP 配置结构。
pub struct McpWorkspaceConfig {
    pub servers: Vec<McpServerConfig>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// 聊天工具列表项。
pub struct ToolInfo {
    pub name: String,
    pub description: String,
    pub enabled: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// 工作区聚合能力视图中的 Skill 项。
pub struct WorkspaceCapabilitySkill {
    pub slug: String,
    pub name: String,
    pub description: String,
    pub enabled: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// 工作区聚合能力视图中的 MCP 服务项。
pub struct WorkspaceCapabilityServer {
    pub name: String,
    pub enabled: bool,
    pub r#type: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// 工作区聚合能力视图。
pub struct WorkspaceCapabilities {
    pub mcp_servers: Vec<WorkspaceCapabilityServer>,
    pub skills: Vec<WorkspaceCapabilitySkill>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// MCP 连接测试结果。
pub struct ConnectionTestResult {
    pub success: bool,
    pub message: String,
}
