use crate::agent_session::{self, AgentSessionInfo};
use crate::commands::agent::{
    respond_agent_interrupt_impl, AgentState, RespondAgentInterruptRequest,
};
use crate::kernel::JcliAdapter;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

const FALLBACK_TITLE_MAX_CHARS: usize = 30;
const GENERATED_TITLE_MAX_TOKENS: u32 = 30;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
/// 更新 Agent 会话标题的请求体。
pub struct UpdateSessionTitleRequest {
    pub session_id: String,
    pub title: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
/// 更新 Agent 会话标题后的返回结果。
pub struct UpdateSessionTitleResult {
    pub session_id: String,
    pub title: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
/// 权限中断的前端响应体。
pub struct PermissionRequest {
    #[allow(dead_code)]
    pub session_id: String,
    pub interrupt_id: String,
    /// 可选值之一："approve"、"approve_always"、"deny"
    pub decision: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
/// ask_user 中单个问题的作答结果。
pub struct AskUserAnswer {
    pub question_id: String,
    #[serde(default)]
    pub selected_options: Vec<String>,
    #[serde(default)]
    pub custom_text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
/// ask_user 中断的前端响应体。
pub struct AskUserRequest {
    #[allow(dead_code)]
    pub session_id: String,
    #[allow(dead_code)]
    pub interrupt_id: String,
    pub answers: Vec<AskUserAnswer>,
}

/// 调用当前激活的 LLM，为 Agent 会话生成标题。
/// 标题基于首条用户消息与首条助手回复进行摘要。
pub(crate) async fn generate_agent_title(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    session_id: String,
) -> Result<String, String> {
    let timeline = agent_session::get_agent_session(&session_id)?;

    let first_user_msg = timeline
        .iter()
        .find(|item| item.kind == "user_message")
        .and_then(|item| item.content.as_deref());

    let first_assistant_msg = timeline
        .iter()
        .find(|item| item.kind == "assistant_content")
        .and_then(|item| item.content.as_deref());

    let conversation_text = match (first_user_msg, first_assistant_msg) {
        (Some(user), Some(assistant)) => {
            format!("User: {}\nAssistant: {}", user, assistant)
        }
        (Some(user), None) => user.to_string(),
        _ => {
            return Ok(first_user_msg
                .map(|s| s.chars().take(FALLBACK_TITLE_MAX_CHARS).collect::<String>())
                .unwrap_or_else(|| "New conversation".to_string()));
        }
    };

    let fallback_title: String = first_user_msg
        .map(|s| s.chars().take(FALLBACK_TITLE_MAX_CHARS).collect::<String>())
        .unwrap_or_else(|| "New conversation".to_string());

    let providers = state.config().load_providers().map_err(|e| e.to_string())?;
    let active_index = state
        .config()
        .load_active_index()
        .map_err(|e| e.to_string())?;
    if let Some(provider) = providers.get(active_index) {
        let client = reqwest::Client::new();
        let prompt = format!(
            "Generate a short title (max 10 words) for this conversation. Return ONLY the title, no quotes, no punctuation:\n\n{}",
            conversation_text
        );
        let body = serde_json::json!({
            "model": provider.models.first().map(|m| &m.id),
            "messages": [
                {"role": "system", "content": "You are a title generator. Return ONLY the title."},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": GENERATED_TITLE_MAX_TOKENS,
            "stream": false
        });
        let url = format!(
            "{}/chat/completions",
            provider.api_base.trim_end_matches('/')
        );
        if let Ok(resp) = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", provider.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
        {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(title) = json["choices"][0]["message"]["content"].as_str() {
                    let title = title.trim().trim_matches('"').to_string();
                    if !title.is_empty() {
                        return Ok(title);
                    }
                }
            }
        }
    }
    Ok(fallback_title)
}

/// 持久化保存 Agent 会话标题。
pub(crate) fn update_agent_session_title(
    request: UpdateSessionTitleRequest,
) -> Result<UpdateSessionTitleResult, String> {
    agent_session::update_session_title(&request.session_id, &request.title)?;
    Ok(UpdateSessionTitleResult {
        session_id: request.session_id,
        title: request.title,
    })
}

/// 切换 Agent 会话的置顶状态。
pub(crate) fn toggle_pin_agent_session(session_id: String) -> Result<AgentSessionInfo, String> {
    agent_session::toggle_pin_agent_session(&session_id)
}

/// 切换 Agent 会话的归档状态。
pub(crate) fn toggle_archive_agent_session(session_id: String) -> Result<AgentSessionInfo, String> {
    agent_session::toggle_archive_agent_session(&session_id)
}

/// 切换 Agent 会话的手动工作中状态。
pub(crate) fn toggle_manual_working_agent_session(
    session_id: String,
) -> Result<AgentSessionInfo, String> {
    agent_session::toggle_manual_working_agent_session(&session_id)
}

/// 更新 Agent 会话的权限模式，并校验模式值是否合法。
pub(crate) fn update_session_permission_mode(
    session_id: String,
    mode: String,
) -> Result<(), String> {
    {
        let valid = matches!(mode.as_str(), "auto" | "bypassPermissions" | "plan");
        if !valid {
            return Err(format!("无效的权限模式: {}", mode));
        }
    }
    agent_session::update_session_permission_mode(&session_id, &mode)
}

/// 响应权限中断（工具审批）。
/// 会把决策结果作为 `tool_result` 写入 Agent 的 stdin。
pub(crate) fn respond_permission(
    state: tauri::State<'_, AgentState>,
    request: PermissionRequest,
) -> Result<(), String> {
    let content = match request.decision.as_str() {
        "approve" => "approved".to_string(),
        "approve_always" => "always_approved".to_string(),
        "deny" => "denied".to_string(),
        other => return Err(format!("无效的决策: {}", other)),
    };

    respond_agent_interrupt_impl(
        state,
        RespondAgentInterruptRequest {
            session_id: request.session_id,
            interrupt_id: request.interrupt_id,
            kind: "permission".to_string(),
            response: serde_json::json!({
                "allowed": content != "denied",
                "alwaysAllow": content == "always_approved",
            }),
        },
    )
}

/// 响应 `ask_user` 类型中断。
/// 会把所选选项和自定义文本作为 `tool_result` 写入 Agent 的 stdin。
pub(crate) fn respond_ask_user(
    state: tauri::State<'_, AgentState>,
    request: AskUserRequest,
) -> Result<(), String> {
    respond_agent_interrupt_impl(
        state,
        RespondAgentInterruptRequest {
            session_id: request.session_id,
            interrupt_id: request.interrupt_id,
            kind: "ask_user".to_string(),
            response: serde_json::json!({
                "answers": request.answers.iter().map(|a| serde_json::json!({
                    "question_id": a.question_id,
                    "selected_options": a.selected_options,
                    "custom_text": a.custom_text,
                })).collect::<Vec<_>>(),
            }),
        },
    )
}
