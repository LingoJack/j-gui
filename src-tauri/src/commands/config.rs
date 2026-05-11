use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::Arc;

use crate::kernel::types::{infer_provider, KernelChannelModel, KernelProvider};
use crate::kernel::{ConfigKernel, JcliAdapter};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub name: String,
    pub api_base: String,
    pub api_key: String,
    pub model: String,
    pub supports_vision: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfigInfo {
    pub providers: Vec<ProviderInfo>,
    pub active_index: usize,
    pub theme: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YamlConfigInfo {
    pub sections: BTreeMap<String, BTreeMap<String, String>>,
}

// ---------------------------------------------------------------------------
// Tauri 命令层薄封装
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
// 纯逻辑（_impl）—— 可通过 MockConfigKernel 做测试
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
                protocol_hint: None,
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
// 测试
// ---------------------------------------------------------------------------

#[cfg(test)]
#[path = "../tests/commands_config.rs"]
mod tests;
