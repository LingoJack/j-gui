use crate::kernel::types::{
    canonical_provider_key, infer_provider, ChatProtocolFamily, ChatTransportRoute,
};

/// 解析前端显式传入的协议提示。
/// 这里只接受我们已经承诺支持的枚举值；未知字符串一律回退到自动推断，
/// 避免把前端临时实验字段静默固化成稳定协议。
fn parse_protocol_hint(hint: Option<&str>) -> Option<ChatProtocolFamily> {
    match hint.map(str::trim).filter(|value| !value.is_empty()) {
        Some("openai-chat-completions") => Some(ChatProtocolFamily::OpenAiChatCompletions),
        Some("openai-responses") => Some(ChatProtocolFamily::OpenAiResponses),
        Some("anthropic-messages") => Some(ChatProtocolFamily::AnthropicMessages),
        _ => None,
    }
}

/// 基于 provider、API base 和协议提示推导当前请求应走的聊天传输协议。
pub fn resolve_chat_transport_route(
    api_base: &str,
    provider: Option<&str>,
    model_id: Option<&str>,
    protocol_hint: Option<&str>,
) -> ChatTransportRoute {
    let provider_key = provider
        .filter(|value| !value.trim().is_empty())
        .map(canonical_provider_key)
        .unwrap_or_else(|| infer_provider(api_base));

    // 自动推断只负责“默认走哪一族协议”，不是精确能力探测。
    // 这里宁可保守地落到 OpenAI Chat Completions，也不要因为 base URL 长得像兼容层
    // 就擅自切到 Responses，避免把大量 OpenAI-compatible 渠道误路由到不支持的接口。
    let family = if let Some(explicit) = parse_protocol_hint(protocol_hint) {
        explicit
    } else {
        match provider_key.as_str() {
            "anthropic" | "deepseek" | "kimi-api" | "kimi-coding" => {
                ChatProtocolFamily::AnthropicMessages
            }
            // 其余 provider 先按 OpenAI Chat Completions 兜底。
            // 当某个渠道明确支持 Responses 时，应由前端/配置层显式传 protocol_hint。
            _ => ChatProtocolFamily::OpenAiChatCompletions,
        }
    };

    ChatTransportRoute {
        family,
        provider_key,
        base_url: api_base.trim_end_matches('/').to_string(),
        model_id: model_id.map(ToString::to_string),
    }
}

#[cfg(test)]
mod tests {
    use super::resolve_chat_transport_route;
    use crate::kernel::types::ChatProtocolFamily;

    #[test]
    fn resolve_chat_transport_route_prefers_explicit_protocol_hint() {
        let route = resolve_chat_transport_route(
            "https://api.openai.com/v1",
            Some("openai"),
            Some("gpt-4.1"),
            Some("openai-responses"),
        );

        assert_eq!(route.family, ChatProtocolFamily::OpenAiResponses);
        assert_eq!(route.provider_key, "openai");
    }

    #[test]
    fn resolve_chat_transport_route_defaults_openai_compat_to_chat_completions() {
        let route = resolve_chat_transport_route(
            "https://api.openai.com/v1",
            Some("openai"),
            Some("gpt-4.1"),
            None,
        );

        assert_eq!(route.family, ChatProtocolFamily::OpenAiChatCompletions);
    }

    #[test]
    fn resolve_chat_transport_route_maps_anthropic_provider_to_messages() {
        let route = resolve_chat_transport_route(
            "https://api.anthropic.com",
            Some("anthropic"),
            Some("claude-sonnet"),
            None,
        );

        assert_eq!(route.family, ChatProtocolFamily::AnthropicMessages);
    }

    #[test]
    fn resolve_chat_transport_route_infers_provider_key_from_api_base() {
        let route = resolve_chat_transport_route(
            "https://dashscope.aliyuncs.com/compatible-mode/v1",
            None,
            Some("qwen-max"),
            None,
        );

        assert_eq!(route.provider_key, "qwen");
        assert_eq!(route.family, ChatProtocolFamily::OpenAiChatCompletions);
    }
}
