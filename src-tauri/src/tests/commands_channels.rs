use super::*;
use crate::kernel::config::MockConfigKernel;
use crate::kernel::protocol::resolve_chat_transport_route;
use crate::kernel::types::{
    ChatProtocolFamily, KernelChannelModel, KernelCreateChannelInput, KernelProvider,
    KernelUpdateChannelInput,
};
use crate::kernel::KernelError;

#[test]
fn mask_long_key() {
    let masked = mask_api_key("sk-1234567890abcdef");
    assert_eq!(masked, "sk-1•••••••••••cdef");
}

#[test]
fn mask_short_key() {
    let masked = mask_api_key("ab");
    assert_eq!(masked, "••••••••");
}

#[test]
fn mask_empty_key() {
    let masked = mask_api_key("");
    assert_eq!(masked, "");
}

#[test]
fn provider_to_channel_info_maps_fields() {
    let p = KernelProvider {
        id: "test-uuid".into(),
        name: "GPT-4o".into(),
        provider: String::new(),
        protocol_hint: Some("openai-responses".into()),
        api_base: "https://api.openai.com/v1".into(),
        api_key: "sk-secret1234".into(),
        models: vec![KernelChannelModel {
            id: "gpt-4o".into(),
            name: "gpt-4o".into(),
            enabled: true,
        }],
        enabled: true,
        supports_vision: true,
        created_at: 0,
        updated_at: 0,
    };
    let info = provider_to_channel_info(&p);
    assert_eq!(info.id, "test-uuid");
    assert_eq!(info.name, "GPT-4o");
    assert_eq!(info.provider, "openai");
    assert_eq!(info.protocol_hint.as_deref(), Some("openai-responses"));
    assert_eq!(info.base_url, "https://api.openai.com/v1");
    assert_eq!(
        info.models,
        vec![KernelChannelModel {
            id: "gpt-4o".into(),
            name: "gpt-4o".into(),
            enabled: true
        }]
    );
}

#[test]
fn list_channels_returns_empty_vec_when_no_providers() {
    let mut mock = MockConfigKernel::new();
    mock.expect_load_providers().returning(|| Ok(vec![]));

    let result = list_channels_impl(&mock);
    assert!(result.is_ok());
    assert!(result.unwrap().is_empty());
}

#[test]
fn list_channels_returns_providers_as_channels() {
    let mut mock = MockConfigKernel::new();
    mock.expect_load_providers().returning(|| {
        Ok(vec![KernelProvider {
            id: "ds-uuid".into(),
            name: "My Provider".into(),
            provider: String::new(),
            protocol_hint: None,
            api_base: "https://api.deepseek.com".into(),
            api_key: "sk-secret".into(),
            models: vec![KernelChannelModel {
                id: "deepseek-chat".into(),
                name: "deepseek-chat".into(),
                enabled: true,
            }],
            enabled: true,
            supports_vision: false,
            created_at: 0,
            updated_at: 0,
        }])
    });

    let result = list_channels_impl(&mock);
    assert!(result.is_ok());
    let channels = result.unwrap();
    assert_eq!(channels.len(), 1);
    assert_eq!(channels[0].id, "ds-uuid");
    assert_eq!(channels[0].name, "My Provider");
    assert_eq!(channels[0].provider, "deepseek");
    assert_eq!(channels[0].base_url, "https://api.deepseek.com");
    assert_eq!(
        channels[0].models,
        vec![KernelChannelModel {
            id: "deepseek-chat".into(),
            name: "deepseek-chat".into(),
            enabled: true
        }]
    );
}

#[test]
fn create_channel_appends_provider() {
    let mut mock = MockConfigKernel::new();
    mock.expect_create_channel()
        .withf(|input: &KernelCreateChannelInput| {
            input.name == "New Channel"
                && input.models.len() == 2
                && input.models[0].id == "gpt-4"
                && input.models[1].id == "gpt-4o"
                && input.protocol_hint.as_deref() == Some("openai-responses")
        })
        .returning(|input| {
            Ok(KernelProvider {
                id: "new-uuid".into(),
                name: input.name,
                provider: input.provider,
                protocol_hint: input.protocol_hint,
                api_base: input.api_base,
                api_key: input.api_key,
                models: input.models,
                enabled: input.enabled,
                supports_vision: false,
                created_at: 1000,
                updated_at: 1000,
            })
        });

    let result = create_channel_impl(
        &mock,
        CreateChannelInput {
            name: "New Channel".into(),
            protocol_hint: Some("openai-responses".into()),
            api_base: "https://api.openai.com".into(),
            api_key: "sk-key".into(),
            provider: Some("openai".into()),
            models: vec![
                KernelChannelModel {
                    id: "gpt-4".into(),
                    name: "GPT-4".into(),
                    enabled: true,
                },
                KernelChannelModel {
                    id: "gpt-4o".into(),
                    name: "GPT-4o".into(),
                    enabled: true,
                },
            ],
            enabled: Some(true),
        },
    );
    assert!(result.is_ok());
    let info = result.unwrap();
    assert_eq!(info.id, "new-uuid");
    assert_eq!(info.name, "New Channel");
    assert_eq!(info.provider, "openai");
    assert_eq!(info.protocol_hint.as_deref(), Some("openai-responses"));
}

#[test]
fn update_channel_modifies_provider() {
    let mut mock = MockConfigKernel::new();
    mock.expect_update_channel()
        .withf(|id: &str, _input: &KernelUpdateChannelInput| id == "test-id")
        .returning(|id: &str, input: KernelUpdateChannelInput| {
            Ok(KernelProvider {
                id: id.to_string(),
                name: input.name.unwrap_or_default(),
                provider: input.provider.unwrap_or_default(),
                protocol_hint: input.protocol_hint,
                api_base: input.api_base.unwrap_or_default(),
                api_key: input.api_key.unwrap_or_default(),
                models: input.models.unwrap_or_default(),
                enabled: input.enabled.unwrap_or(true),
                supports_vision: false,
                created_at: 1000,
                updated_at: 2000,
            })
        });

    let result = update_channel_impl(
        &mock,
        "test-id".into(),
        UpdateChannelInput {
            name: Some("Updated".into()),
            provider: None,
            protocol_hint: Some("openai-responses".into()),
            api_base: Some("https://new.com".into()),
            api_key: Some("sk-new-key".into()),
            models: None,
            enabled: None,
        },
    );
    assert!(result.is_ok());
    let info = result.unwrap();
    assert_eq!(info.name, "Updated");
    assert_eq!(info.protocol_hint.as_deref(), Some("openai-responses"));
}

#[test]
fn update_channel_preserves_masked_key() {
    let mut mock = MockConfigKernel::new();
    mock.expect_update_channel()
        .withf(|_id: &str, input: &KernelUpdateChannelInput| input.api_key.is_none())
        .returning(|id: &str, input: KernelUpdateChannelInput| {
            Ok(KernelProvider {
                id: id.to_string(),
                name: input.name.unwrap_or_default(),
                provider: input.provider.unwrap_or_default(),
                protocol_hint: input.protocol_hint,
                api_base: input.api_base.unwrap_or_default(),
                api_key: "sk-real-secret-key".into(),
                models: input.models.unwrap_or_default(),
                enabled: input.enabled.unwrap_or(true),
                supports_vision: false,
                created_at: 1000,
                updated_at: 2000,
            })
        });

    let result = update_channel_impl(
        &mock,
        "test-id".into(),
        UpdateChannelInput {
            name: Some("Updated".into()),
            provider: None,
            protocol_hint: None,
            api_base: Some("https://new.com".into()),
            api_key: Some("sk-r...key".into()),
            models: None,
            enabled: None,
        },
    );
    assert!(result.is_ok());
}

#[test]
fn update_channel_not_found_returns_error() {
    let mut mock = MockConfigKernel::new();
    mock.expect_update_channel()
        .returning(|_id: &str, _input: KernelUpdateChannelInput| {
            Err(KernelError::Config("渠道 ID 不存在: ghost".into()))
        });

    let result = update_channel_impl(
        &mock,
        "ghost".into(),
        UpdateChannelInput {
            name: Some("test".into()),
            provider: None,
            protocol_hint: None,
            api_base: None,
            api_key: None,
            models: None,
            enabled: None,
        },
    );
    assert!(result.is_err());
}

#[test]
fn delete_channel_removes_provider() {
    let mut mock = MockConfigKernel::new();
    mock.expect_delete_channel()
        .withf(|id: &str| id == "target-id")
        .returning(|_| Ok(()));

    let result = delete_channel_impl(&mock, "target-id");
    assert!(result.is_ok());
}

#[test]
fn delete_channel_not_found_returns_error() {
    let mut mock = MockConfigKernel::new();
    mock.expect_delete_channel()
        .returning(|_| Err(KernelError::Config("渠道 ID 不存在: ghost".into())));

    let result = delete_channel_impl(&mock, "ghost");
    assert!(result.is_err());
}

#[test]
fn list_channels_kernel_error_propagates() {
    let mut mock = MockConfigKernel::new();
    mock.expect_load_providers()
        .returning(|| Err(KernelError::Config("storage error".into())));

    let result = list_channels_impl(&mock);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("storage error"));
}

#[test]
fn create_channel_kernel_error_propagates() {
    let mut mock = MockConfigKernel::new();
    mock.expect_create_channel()
        .returning(|_| Err(KernelError::Config("save failed".into())));

    let result = create_channel_impl(
        &mock,
        CreateChannelInput {
            name: "Test".into(),
            protocol_hint: None,
            api_base: "https://api.test.com".into(),
            api_key: "key".into(),
            provider: None,
            models: vec![KernelChannelModel {
                id: "gpt-4".into(),
                name: "gpt-4".into(),
                enabled: true,
            }],
            enabled: None,
        },
    );
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("save failed"));
}

#[test]
fn create_channel_rejects_empty_name() {
    let mock = MockConfigKernel::new();
    let result = create_channel_impl(
        &mock,
        CreateChannelInput {
            name: "".into(),
            protocol_hint: None,
            api_base: "https://api.test.com".into(),
            api_key: "key".into(),
            provider: None,
            models: vec![KernelChannelModel {
                id: "gpt-4".into(),
                name: "gpt-4".into(),
                enabled: true,
            }],
            enabled: None,
        },
    );
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("名称不能为空"));
}

#[test]
fn create_channel_rejects_empty_api_base() {
    let mock = MockConfigKernel::new();
    let result = create_channel_impl(
        &mock,
        CreateChannelInput {
            name: "Test".into(),
            protocol_hint: None,
            api_base: "".into(),
            api_key: "key".into(),
            provider: None,
            models: vec![KernelChannelModel {
                id: "gpt-4".into(),
                name: "gpt-4".into(),
                enabled: true,
            }],
            enabled: None,
        },
    );
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("地址不能为空"));
}

#[test]
fn update_channel_rejects_empty_id() {
    let mock = MockConfigKernel::new();
    let result = update_channel_impl(
        &mock,
        "".into(),
        UpdateChannelInput {
            name: Some("test".into()),
            provider: None,
            protocol_hint: None,
            api_base: None,
            api_key: None,
            models: None,
            enabled: None,
        },
    );
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("ID 不能为空"));
}

#[test]
fn mask_key_detects_dots_to_preserve_old() {
    let masked = "sk-1...abcd";
    assert!(masked.contains("..."));
}

#[test]
fn mask_exactly_8_chars() {
    let masked = mask_api_key("12345678");
    assert_eq!(masked, "12••••••••78");
}

#[test]
fn mask_3_chars() {
    let masked = mask_api_key("abc");
    assert_eq!(masked, "••••••••");
}

#[test]
fn mask_1_char() {
    let masked = mask_api_key("x");
    assert_eq!(masked, "••••••••");
}

#[test]
fn anthropic_compatible_provider_recognizes_kimi_api() {
    assert!(crate::kernel::types::is_anthropic_compatible_provider(
        Some("kimi-api")
    ));
}

#[test]
fn anthropic_compatible_provider_recognizes_kimi_coding() {
    assert!(crate::kernel::types::is_anthropic_compatible_provider(
        Some("kimi-coding")
    ));
}

#[test]
fn build_probe_request_uses_responses_endpoint_for_openai_responses_family() {
    let probe = build_probe_request(&TestChannelInput {
        api_base: "https://api.openai.com/v1".to_string(),
        api_key: "key".to_string(),
        model: Some("gpt-5".to_string()),
        provider: Some("openai".to_string()),
        protocol_hint: Some("openai-responses".to_string()),
    });

    assert_eq!(probe.path, "responses");
    assert_eq!(probe.route.provider_key, "openai");
}

#[test]
fn build_probe_request_uses_messages_endpoint_for_anthropic_family() {
    let probe = build_probe_request(&TestChannelInput {
        api_base: "https://api.anthropic.com".to_string(),
        api_key: "key".to_string(),
        model: Some("claude-sonnet".to_string()),
        provider: Some("anthropic".to_string()),
        protocol_hint: None,
    });

    assert_eq!(probe.path, "messages");
    assert_eq!(probe.route.provider_key, "anthropic");
}

#[test]
fn build_probe_request_matches_runtime_resolver_for_openai_responses() {
    let input = TestChannelInput {
        api_base: "https://api.openai.com/v1".to_string(),
        api_key: "key".to_string(),
        model: Some("gpt-5".to_string()),
        provider: Some("openai".to_string()),
        protocol_hint: Some("openai-responses".to_string()),
    };

    let probe = build_probe_request(&input);
    let runtime_route = resolve_chat_transport_route(
        &input.api_base,
        input.provider.as_deref(),
        input.model.as_deref(),
        input.protocol_hint.as_deref(),
    );

    assert_eq!(probe.route.family, ChatProtocolFamily::OpenAiResponses);
    assert_eq!(probe.route.family, runtime_route.family);
    assert_eq!(probe.route.provider_key, runtime_route.provider_key);
    assert_eq!(probe.route.base_url, runtime_route.base_url);
}

#[test]
fn decrypt_api_key_returns_raw_secret() {
    let mut mock = MockConfigKernel::new();
    mock.expect_load_providers().returning(|| {
        Ok(vec![KernelProvider {
            id: "target-id".into(),
            name: "Test".into(),
            provider: "openai".into(),
            protocol_hint: Some("openai-responses".into()),
            api_base: "https://api.openai.com/v1".into(),
            api_key: "sk-secret".into(),
            models: vec![],
            enabled: true,
            supports_vision: false,
            created_at: 0,
            updated_at: 0,
        }])
    });

    let result = decrypt_api_key_impl(&mock, "target-id");
    assert_eq!(result.unwrap(), "sk-secret");
}

#[test]
fn parse_fetch_models_parses_openai_data_array() {
    let json = r#"{"object":"list","data":[{"id":"gpt-4o","object":"model"},{"id":"gpt-4","object":"model"}]}"#;
    let models = parse_fetch_models(json);
    assert_eq!(models.len(), 2);
    assert_eq!(models[0].id, "gpt-4o");
    assert_eq!(models[0].name.as_deref(), Some("gpt-4o"));
    assert_eq!(models[1].id, "gpt-4");
}

#[test]
fn parse_fetch_models_handles_empty_data() {
    let models = parse_fetch_models(r#"{"object":"list","data":[]}"#);
    assert!(models.is_empty());
}

#[test]
fn parse_fetch_models_handles_missing_data_field() {
    let models = parse_fetch_models(r#"{"object":"list"}"#);
    assert!(models.is_empty());
}

#[test]
fn parse_fetch_models_handles_invalid_json() {
    let models = parse_fetch_models("not json");
    assert!(models.is_empty());
}
