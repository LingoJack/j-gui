use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::Arc;

use crate::kernel::types::{infer_provider, KernelChannelModel, KernelProvider};
use crate::kernel::{ConfigKernel, JcliAdapter};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub name: String,
    pub api_base: String,
    pub api_key: String,
    pub model: String,
    pub supports_vision: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfigInfo {
    pub providers: Vec<ProviderInfo>,
    pub active_index: usize,
    pub theme: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YamlConfigInfo {
    pub sections: BTreeMap<String, BTreeMap<String, String>>,
}

// ---------------------------------------------------------------------------
// Tauri commands — thin wrappers
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_agent_config(
    state: tauri::State<'_, Arc<JcliAdapter>>,
) -> Result<AgentConfigInfo, String> {
    get_agent_config_impl(state.config())
}

#[tauri::command]
pub fn set_agent_config(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    input: AgentConfigInfo,
) -> Result<(), String> {
    set_agent_config_impl(state.config(), input)
}

#[tauri::command]
pub fn set_active_provider(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    index: usize,
) -> Result<(), String> {
    set_active_provider_impl(state.config(), index)
}

#[tauri::command]
pub fn get_config(state: tauri::State<'_, Arc<JcliAdapter>>) -> Result<YamlConfigInfo, String> {
    get_config_impl(state.config())
}

#[tauri::command]
pub fn set_config(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    section: String,
    key: String,
    value: String,
) -> Result<(), String> {
    set_config_impl(state.config(), &section, &key, &value)
}

#[tauri::command]
pub fn get_system_prompt(
    state: tauri::State<'_, Arc<JcliAdapter>>,
) -> Result<Option<String>, String> {
    get_system_prompt_impl(state.config())
}

#[tauri::command]
pub fn set_system_prompt(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    prompt: String,
) -> Result<(), String> {
    set_system_prompt_impl(state.config(), &prompt)
}

// ---------------------------------------------------------------------------
// Pure logic (_impl) — testable via MockConfigKernel
// ---------------------------------------------------------------------------

fn get_agent_config_impl(config: &dyn ConfigKernel) -> Result<AgentConfigInfo, String> {
    let providers = config.load_providers().map_err(|e| e.to_string())?;
    let active_index = config.load_active_index().map_err(|e| e.to_string())?;
    let theme = config.load_theme_name().map_err(|e| e.to_string())?;

    Ok(AgentConfigInfo {
        providers: providers
            .iter()
            .map(|p| {
                let masked_key = mask_key(&p.api_key);
                ProviderInfo {
                    name: p.name.clone(),
                    api_base: p.api_base.clone(),
                    api_key: masked_key,
                    model: p.models.first().map(|m| m.id.clone()).unwrap_or_default(),
                    supports_vision: p.supports_vision,
                }
            })
            .collect(),
        active_index,
        theme,
    })
}

fn set_agent_config_impl(config: &dyn ConfigKernel, input: AgentConfigInfo) -> Result<(), String> {
    let old_providers = config.load_providers().map_err(|e| e.to_string())?;

    let providers: Vec<KernelProvider> = input
        .providers
        .iter()
        .enumerate()
        .map(|(i, p)| {
            let api_key = if p.api_key.contains("...") {
                old_providers
                    .get(i)
                    .map(|old| old.api_key.clone())
                    .unwrap_or(p.api_key.clone())
            } else {
                p.api_key.clone()
            };
            let now_ms = crate::kernel::types::current_timestamp();
            KernelProvider {
                id: uuid::Uuid::new_v4().to_string(),
                name: p.name.clone(),
                provider: infer_provider(&p.api_base),
                api_base: p.api_base.clone(),
                api_key,
                models: vec![KernelChannelModel {
                    id: p.model.clone(),
                    name: p.model.clone(),
                    enabled: true,
                }],
                enabled: true,
                supports_vision: p.supports_vision,
                created_at: now_ms,
                updated_at: now_ms,
            }
        })
        .collect();

    if input.active_index >= providers.len() && !providers.is_empty() {
        return Err(format!(
            "无效的 provider 索引: {}（共 {} 个提供方）",
            input.active_index,
            providers.len()
        ));
    }

    config
        .save_providers(&providers)
        .map_err(|e| e.to_string())?;
    config
        .set_active_index(input.active_index)
        .map_err(|e| e.to_string())?;
    config.set_theme(&input.theme).map_err(|e| e.to_string())?;

    Ok(())
}

fn set_active_provider_impl(config: &dyn ConfigKernel, index: usize) -> Result<(), String> {
    let providers = config.load_providers().map_err(|e| e.to_string())?;
    if index >= providers.len() {
        return Err(format!(
            "无效的 provider 索引: {}（共 {} 个提供方）",
            index,
            providers.len()
        ));
    }
    config.set_active_index(index).map_err(|e| e.to_string())
}

fn get_config_impl(config: &dyn ConfigKernel) -> Result<YamlConfigInfo, String> {
    let raw = config.get_yaml_sections().map_err(|e| e.to_string())?;
    let sections: BTreeMap<String, BTreeMap<String, String>> = raw
        .into_iter()
        .map(|(k, v)| (k, v.into_iter().collect()))
        .collect();
    Ok(YamlConfigInfo { sections })
}

fn set_config_impl(
    config: &dyn ConfigKernel,
    section: &str,
    key: &str,
    value: &str,
) -> Result<(), String> {
    config
        .set_yaml_property(section, key, value)
        .map_err(|e| e.to_string())
}

fn get_system_prompt_impl(config: &dyn ConfigKernel) -> Result<Option<String>, String> {
    config.load_system_prompt().map_err(|e| e.to_string())
}

fn set_system_prompt_impl(config: &dyn ConfigKernel, prompt: &str) -> Result<(), String> {
    config.save_system_prompt(prompt).map_err(|e| e.to_string())
}

fn mask_key(key: &str) -> String {
    let len = key.len();
    if len > 8 {
        format!("{}...{}", &key[..4], &key[len - 4..])
    } else if len > 2 {
        format!("{}...{}", &key[..2], &key[len - 2..])
    } else if !key.is_empty() {
        format!("...{}", key)
    } else {
        String::new()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::config::MockConfigKernel;
    use crate::kernel::types::KernelProvider;

    // --- mask_key ---

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

    // --- get_agent_config_impl ---

    #[test]
    fn get_agent_config_masks_keys_and_maps_fields() {
        let mut mock = MockConfigKernel::new();
        mock.expect_load_providers().returning(|| {
            Ok(vec![KernelProvider {
                id: String::new(),
                name: "My Provider".into(),
                provider: String::new(),
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

    // --- set_agent_config_impl ---

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
        // old provider has the real key
        mock.expect_load_providers().returning(|| {
            Ok(vec![KernelProvider {
                id: "test-id".into(),
                name: "Old".into(),
                provider: "openai".into(),
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

        // frontend sends masked key
        let result = set_agent_config_impl(
            &mock,
            AgentConfigInfo {
                providers: vec![ProviderInfo {
                    name: "Updated".into(),
                    api_base: "https://new.com".into(),
                    api_key: "sk-r...123".into(), // masked
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
                active_index: 5, // out of bounds
                theme: "dark".into(),
            },
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("无效的 provider 索引"));
    }

    // --- set_active_provider_impl ---

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

    // --- get_config_impl ---

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

    // --- set_config_impl ---

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

    // --- get_system_prompt_impl ---

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

    // --- set_system_prompt_impl ---

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
}
