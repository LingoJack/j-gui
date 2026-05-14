use super::AgentInterruptAskUserAnswer;
use crate::kernel::types::{KernelAgentInterruptResponse, KernelPlanDecision};

/// 按中断类型把前端 JSON 响应解析为内核可消费的结构。
pub(super) fn parse_interrupt_response(
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
