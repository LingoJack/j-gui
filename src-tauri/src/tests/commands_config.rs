use super::*;
use crate::kernel::config::MockConfigKernel;
use crate::kernel::types::KernelProvider;

// --- mask_key 相关测试 ---

#[test]
fn mask_long_key() {
    assert_eq!(mask_key("sk-1234567890abcdef"), "sk-1...cdef");
}

#[test]
fn mask_short_key() {
    assert_eq!(mask_key("ab"), "...ab");
}

#[test]
fn mask_empty_key() {
    assert_eq!(mask_key(""), "");
}

#[test]
fn mask_8_chars() {
    assert_eq!(mask_key("12345678"), "12...78");
}

#[test]
fn mask_3_chars() {
    assert_eq!(mask_key("abc"), "ab...bc");
}

#[test]
fn mask_1_char() {
    assert_eq!(mask_key("x"), "...x");
}

// --- get_agent_config_impl 相关测试 ---

#[test]
fn get_agent_config_masks_keys_and_maps_fields() {
    let mut mock = MockConfigKernel::new();
    mock.expect_load_providers().returning(|| {
        Ok(vec![KernelProvider {
            id: String::new(),
            name: "My Provider".into(),
            provider: String::new(),
            protocol_hint: None,
            api_base: "https://api.openai.com".into(),
            api_key: "sk-1234567890abcdef".into(),
            models: vec![KernelChannelModel {
                id: "gpt-4o".into(),
                name: "gpt-4o".into(),
                enabled: true,
            }],
            enabled: true,
            supports_vision: true,
            created_at: 0,
            updated_at: 0,
        }])
    });
    mock.expect_load_active_index().returning(|| Ok(0));
    mock.expect_load_theme_name()
        .returning(|| Ok("dark".into()));

    let result = get_agent_config_impl(&mock);
    assert!(result.is_ok());
    let info = result.unwrap();
    assert_eq!(info.providers.len(), 1);
    assert_eq!(info.providers[0].name, "My Provider");
    assert_eq!(info.providers[0].api_key, "sk-1...cdef");
    assert_eq!(info.providers[0].api_base, "https://api.openai.com");
    assert_eq!(info.providers[0].model, "gpt-4o");
    assert!(info.providers[0].supports_vision);
    assert_eq!(info.active_index, 0);
    assert_eq!(info.theme, "dark");
}

#[test]
fn get_agent_config_empty_providers() {
    let mut mock = MockConfigKernel::new();
    mock.expect_load_providers().returning(|| Ok(vec![]));
    mock.expect_load_active_index().returning(|| Ok(0));
    mock.expect_load_theme_name()
        .returning(|| Ok("light".into()));

    let result = get_agent_config_impl(&mock);
    assert!(result.is_ok());
    assert!(result.unwrap().providers.is_empty());
}

// --- set_agent_config_impl 相关测试 ---

#[test]
fn set_agent_config_saves_providers_index_and_theme() {
    let mut mock = MockConfigKernel::new();
    mock.expect_load_providers().returning(|| Ok(vec![]));
    mock.expect_save_providers()
        .withf(|p: &[KernelProvider]| p.len() == 1 && p[0].name == "Test")
        .returning(|_| Ok(()));
    mock.expect_set_active_index()
        .with(mockall::predicate::eq(0))
        .returning(|_| Ok(()));
    mock.expect_set_theme()
        .with(mockall::predicate::eq("dark"))
        .returning(|_| Ok(()));

    let result = set_agent_config_impl(
        &mock,
        AgentConfigInfo {
            providers: vec![ProviderInfo {
                name: "Test".into(),
                api_base: "https://test.com".into(),
                api_key: "sk-key".into(),
                model: "gpt-4".into(),
                supports_vision: false,
            }],
            active_index: 0,
            theme: "dark".into(),
        },
    );
    assert!(result.is_ok());
}

#[test]
fn set_agent_config_unmasks_masked_key() {
    let mut mock = MockConfigKernel::new();
    // 旧 provider 中保存着真实密钥
    mock.expect_load_providers().returning(|| {
        Ok(vec![KernelProvider {
            id: "test-id".into(),
            name: "Old".into(),
            provider: "openai".into(),
            protocol_hint: None,
            api_base: "https://old.com".into(),
            api_key: "sk-real-secret-key-123".into(),
            models: vec![KernelChannelModel {
                id: "gpt-3.5".into(),
                name: "gpt-3.5".into(),
                enabled: true,
            }],
            enabled: true,
            supports_vision: false,
            created_at: 0,
            updated_at: 0,
        }])
    });
    mock.expect_save_providers()
        .withf(|p: &[KernelProvider]| p.len() == 1 && p[0].api_key == "sk-real-secret-key-123")
        .returning(|_| Ok(()));
    mock.expect_set_active_index()
        .with(mockall::predicate::eq(0))
        .returning(|_| Ok(()));
    mock.expect_set_theme()
        .with(mockall::predicate::eq("light"))
        .returning(|_| Ok(()));

    // 前端会传回脱敏后的密钥
    let result = set_agent_config_impl(
        &mock,
        AgentConfigInfo {
            providers: vec![ProviderInfo {
                name: "Updated".into(),
                api_base: "https://new.com".into(),
                api_key: "sk-r...123".into(), // 脱敏后的密钥
                model: "gpt-4".into(),
                supports_vision: true,
            }],
            active_index: 0,
            theme: "light".into(),
        },
    );
    assert!(result.is_ok());
}

#[test]
fn set_agent_config_rejects_invalid_active_index() {
    let mut mock = MockConfigKernel::new();
    mock.expect_load_providers()
        .returning(|| Ok(vec![KernelProvider::default()]));

    let result = set_agent_config_impl(
        &mock,
        AgentConfigInfo {
            providers: vec![ProviderInfo {
                name: "Test".into(),
                api_base: "https://test.com".into(),
                api_key: "key".into(),
                model: "m".into(),
                supports_vision: false,
            }],
            active_index: 5, // 越界索引
            theme: "dark".into(),
        },
    );
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("无效的 provider 索引"));
}

// --- set_active_provider_impl 相关测试 ---

#[test]
fn set_active_provider_sets_index() {
    let mut mock = MockConfigKernel::new();
    mock.expect_load_providers()
        .returning(|| Ok(vec![KernelProvider::default(), KernelProvider::default()]));
    mock.expect_set_active_index()
        .with(mockall::predicate::eq(1))
        .returning(|_| Ok(()));

    let result = set_active_provider_impl(&mock, 1);
    assert!(result.is_ok());
}

#[test]
fn set_active_provider_rejects_invalid_index() {
    let mut mock = MockConfigKernel::new();
    mock.expect_load_providers().returning(|| Ok(vec![]));

    let result = set_active_provider_impl(&mock, 0);
    assert!(result.is_err());
}

// --- get_config_impl 相关测试 ---

#[test]
fn get_config_returns_sections() {
    let mut mock = MockConfigKernel::new();
    let mut sections = std::collections::HashMap::new();
    let mut props = std::collections::HashMap::new();
    props.insert("key1".into(), "val1".into());
    sections.insert("path".into(), props);
    mock.expect_get_yaml_sections()
        .returning(move || Ok(sections.clone()));

    let result = get_config_impl(&mock);
    assert!(result.is_ok());
    let info = result.unwrap();
    assert_eq!(info.sections.len(), 1);
    assert_eq!(
        info.sections.get("path").unwrap().get("key1").unwrap(),
        "val1"
    );
}

// --- set_config_impl 相关测试 ---

#[test]
fn set_config_delegates_to_kernel() {
    let mut mock = MockConfigKernel::new();
    mock.expect_set_yaml_property()
        .with(
            mockall::predicate::eq("path"),
            mockall::predicate::eq("mykey"),
            mockall::predicate::eq("myval"),
        )
        .returning(|_, _, _| Ok(()));

    let result = set_config_impl(&mock, "path", "mykey", "myval");
    assert!(result.is_ok());
}

#[test]
fn set_config_kernel_error_propagates() {
    let mut mock = MockConfigKernel::new();
    mock.expect_set_yaml_property()
        .returning(|_, _, _| Err(crate::kernel::KernelError::Config("fail".into())));

    let result = set_config_impl(&mock, "s", "k", "v");
    assert!(result.is_err());
}

// --- get_system_prompt_impl 相关测试 ---

#[test]
fn get_system_prompt_returns_prompt() {
    let mut mock = MockConfigKernel::new();
    mock.expect_load_system_prompt()
        .returning(|| Ok(Some("You are a helpful assistant.".into())));

    let result = get_system_prompt_impl(&mock);
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), Some("You are a helpful assistant.".into()));
}

#[test]
fn get_system_prompt_returns_none() {
    let mut mock = MockConfigKernel::new();
    mock.expect_load_system_prompt().returning(|| Ok(None));

    let result = get_system_prompt_impl(&mock);
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), None);
}

// --- set_system_prompt_impl 相关测试 ---

#[test]
fn set_system_prompt_delegates_to_kernel() {
    let mut mock = MockConfigKernel::new();
    mock.expect_save_system_prompt()
        .with(mockall::predicate::eq("Hello"))
        .returning(|_| Ok(()));

    let result = set_system_prompt_impl(&mock, "Hello");
    assert!(result.is_ok());
}

#[test]
fn set_system_prompt_kernel_error_propagates() {
    let mut mock = MockConfigKernel::new();
    mock.expect_save_system_prompt()
        .returning(|_| Err(crate::kernel::KernelError::Config("fail".into())));

    let result = set_system_prompt_impl(&mock, "test");
    assert!(result.is_err());
}

// --- 错误传播测试 ---

#[test]
fn get_agent_config_kernel_error_propagates() {
    let mut mock = MockConfigKernel::new();
    mock.expect_load_providers()
        .returning(|| Err(crate::kernel::KernelError::Config("db error".into())));

    let result = get_agent_config_impl(&mock);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("db error"));
}

#[test]
fn set_agent_config_save_error_propagates() {
    let mut mock = MockConfigKernel::new();
    mock.expect_load_providers().returning(|| Ok(vec![]));
    mock.expect_save_providers()
        .returning(|_| Err(crate::kernel::KernelError::Config("disk full".into())));

    let result = set_agent_config_impl(
        &mock,
        AgentConfigInfo {
            providers: vec![ProviderInfo {
                name: "Test".into(),
                api_base: "https://test.com".into(),
                api_key: "key".into(),
                model: "m".into(),
                supports_vision: false,
            }],
            active_index: 0,
            theme: "dark".into(),
        },
    );
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("disk full"));
}

#[test]
fn set_active_provider_kernel_error_propagates() {
    let mut mock = MockConfigKernel::new();
    mock.expect_load_providers()
        .returning(|| Ok(vec![KernelProvider::default()]));
    mock.expect_set_active_index()
        .returning(|_| Err(crate::kernel::KernelError::Config("save failed".into())));

    let result = set_active_provider_impl(&mock, 0);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("save failed"));
}

#[test]
fn get_config_kernel_error_propagates() {
    let mut mock = MockConfigKernel::new();
    mock.expect_get_yaml_sections()
        .returning(|| Err(crate::kernel::KernelError::Config("parse error".into())));

    let result = get_config_impl(&mock);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("parse error"));
}

#[test]
fn get_system_prompt_kernel_error_propagates() {
    let mut mock = MockConfigKernel::new();
    mock.expect_load_system_prompt()
        .returning(|| Err(crate::kernel::KernelError::Config("io error".into())));

    let result = get_system_prompt_impl(&mock);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("io error"));
}
