#![allow(dead_code)]

//! j-gui 在 kernel trait 边界上自有的一组领域类型。
//! 这些不是 jcli 原生类型，适配器层会负责转换。
//!
//! 所有类型都派生了 `Clone`、`Debug` 与 `PartialEq`，以兼容 mockall。

use serde::{Deserialize, Serialize};
use std::sync::mpsc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::ipc::Channel;
use tokio_util::sync::CancellationToken;

// ---------------------------------------------------------------------------
// 提供方 / 渠道相关类型
// ---------------------------------------------------------------------------

/// 渠道配置下的模型条目。
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelChannelModel {
    pub id: String,
    pub name: String,
    pub enabled: bool,
}

/// LLM 调用所需的提供方配置。
/// 字段保持 snake_case，以兼容 jcli 的 agent_config.json；
/// 新增字段通过显式 `#[serde(rename)]` 映射为 camelCase。
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct KernelProvider {
    pub id: String,
    pub name: String,
    pub provider: String,
    #[serde(default)]
    pub protocol_hint: Option<String>,
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

/// 创建新渠道时的输入。
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelCreateChannelInput {
    pub name: String,
    pub provider: String,
    pub protocol_hint: Option<String>,
    pub api_base: String,
    pub api_key: String,
    pub models: Vec<KernelChannelModel>,
    pub enabled: bool,
}

/// 更新已有渠道时的输入（所有字段均可选）。
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelUpdateChannelInput {
    pub name: Option<String>,
    pub provider: Option<String>,
    pub protocol_hint: Option<String>,
    pub api_base: Option<String>,
    pub api_key: Option<String>,
    pub models: Option<Vec<KernelChannelModel>>,
    pub enabled: Option<bool>,
}

/// 文件附件信息。
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelFileAttachment {
    pub id: String,
    pub filename: String,
    pub media_type: String,
    pub local_path: String,
    pub size: u64,
}

/// 聊天消息。
#[derive(Clone, Debug, PartialEq)]
pub struct KernelChatMessage {
    pub role: String,
    pub content: String,
    pub reasoning: Option<String>,
    pub attachments: Option<Vec<KernelFileAttachment>>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
/// Agent 计划审批的结构化决策。
pub enum KernelPlanDecision {
    None,
    Approve,
    ApproveAndClearContext,
    Reject,
}

#[derive(Clone, Debug, PartialEq, Eq)]
/// 反馈给 Agent 工具调用的一次结果。
pub struct KernelAgentToolResult {
    pub tool_call_id: String,
    pub result: String,
    pub is_error: bool,
    pub plan_decision: KernelPlanDecision,
}

#[derive(Clone, Debug, PartialEq, Eq)]
/// 前端对 Agent 中断的结构化响应。
pub enum KernelAgentInterruptResponse {
    Permission {
        allowed: bool,
        always_allow: bool,
    },
    AskUser {
        result_json: String,
    },
    Plan {
        decision: KernelPlanDecision,
        feedback: Option<String>,
    },
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
/// 单次聊天请求可携带的额外选项。
pub struct KernelChatRequestOptions {
    pub thinking_enabled: Option<bool>,
    pub protocol_family: Option<ChatProtocolFamily>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
/// 聊天接口所属的协议家族。
pub enum ChatProtocolFamily {
    OpenAiChatCompletions,
    OpenAiResponses,
    AnthropicMessages,
}

#[derive(Clone, Debug, PartialEq, Eq)]
/// 一次聊天调用最终选择的传输路由。
pub struct ChatTransportRoute {
    pub family: ChatProtocolFamily,
    pub provider_key: String,
    pub base_url: String,
    pub model_id: Option<String>,
}

/// 用于列表展示的会话摘要。
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

/// 从会话 transcript 读取出的事件。
#[derive(Clone, Debug, PartialEq)]
pub struct KernelSessionEvent {
    pub role: String,
    pub content: String,
    pub reasoning: Option<String>,
    pub attachments: Option<Vec<KernelFileAttachment>>,
    pub timestamp: u64,
}

/// 别名条目。
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelAliasEntry {
    pub section: String,
    pub name: String,
    pub value: String,
}

/// 技能信息。
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelSkillInfo {
    pub name: String,
    pub description: String,
    pub source: String,
    pub dir_path: String,
}

/// 钩子信息。
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

/// MCP 服务配置。
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

/// 工作区级 MCP 配置。
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelMcpWorkspaceConfig {
    pub servers: Vec<KernelMcpServerConfig>,
}

/// 内置工具信息。
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelToolInfo {
    pub name: String,
    pub description: String,
    pub enabled: bool,
}

// ---------------------------------------------------------------------------
// 辅助函数（adapter 与 commands 共享）
// ---------------------------------------------------------------------------

/// 当前 Unix 毫秒时间戳。
pub fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// 将提供方别名归一化为 shared/frontend 使用的标准 provider key。
pub fn canonical_provider_key(provider: &str) -> String {
    match provider.trim().to_ascii_lowercase().as_str() {
        "tongyi" => "qwen".into(),
        other => other.to_string(),
    }
}

/// 根据 API base URL 推断提供方类型字符串。
pub fn infer_provider(api_base: &str) -> String {
    let base = api_base.to_lowercase();
    if base.contains("dashscope.aliyuncs.com") || base.contains("qwen") || base.contains("tongyi") {
        return "qwen".into();
    }
    if base.contains("api.kimi.com/coding") {
        return "kimi-coding".into();
    }
    if base.contains("moonshot.cn/anthropic") {
        return "kimi-api".into();
    }
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
    "custom".into()
}

/// 判断提供方是否应走 Anthropic Messages 兼容协议族。
pub fn is_anthropic_compatible_provider(provider: Option<&str>) -> bool {
    provider.is_some_and(|value| {
        matches!(
            canonical_provider_key(value).as_str(),
            "anthropic" | "deepseek" | "kimi-api" | "kimi-coding"
        )
    })
}

/// 直接通过 ChatKernel 运行 jcli agent loop 所需的参数。
pub struct KernelAgentParams {
    pub session_id: String,
    pub messages: Vec<KernelChatMessage>,
    pub system_prompt: Option<String>,
    pub permission_mode: String,
    pub cancel_token: CancellationToken,
    pub tool_result_rx: Option<mpsc::Receiver<KernelAgentToolResult>>,
    pub user_message_rx: Option<mpsc::Receiver<KernelChatMessage>>,
    /// 以 JSON 字符串流式发送 Agent 事件的通道。
    /// 前端需要把每个字符串当作 JSON 解析。
    pub on_event: Channel<String>,
    /// Rust 侧可选的流式事件 JSON 拦截器。
    /// 设置后，所有通过 on_event 发送的 JSON 字符串也会同步转发到这里。
    /// JAgent 后端用它把事件桥接到现有的 AgentEvent 系统。
    pub event_interceptor: Option<mpsc::Sender<String>>,
}

#[cfg(test)]
mod tests {
    use super::infer_provider;

    #[test]
    fn infer_provider_recognizes_qwen_dashscope_url() {
        assert_eq!(
            infer_provider("https://dashscope.aliyuncs.com/compatible-mode/v1"),
            "qwen"
        );
    }

    #[test]
    fn infer_provider_recognizes_kimi_api_anthropic_url() {
        assert_eq!(
            infer_provider("https://api.moonshot.cn/anthropic"),
            "kimi-api"
        );
    }

    #[test]
    fn infer_provider_recognizes_kimi_coding_url() {
        assert_eq!(
            infer_provider("https://api.kimi.com/coding/v1"),
            "kimi-coding"
        );
    }
}
