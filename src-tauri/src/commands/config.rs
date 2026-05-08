use j_cli::command::chat::storage::{load_agent_config, save_agent_config, load_system_prompt, save_system_prompt};
use j_cli::config::YamlConfig;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

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

#[tauri::command]
pub fn get_agent_config() -> Result<AgentConfigInfo, String> {
    let config = load_agent_config();
    Ok(AgentConfigInfo {
        providers: config
            .providers
            .iter()
            .map(|p| {
                let masked_key = if p.api_key.len() > 8 {
                    format!(
                        "{}...{}",
                        &p.api_key[..4],
                        &p.api_key[p.api_key.len() - 4..]
                    )
                } else {
                    "****".to_string()
                };
                ProviderInfo {
                    name: p.name.clone(),
                    api_base: p.api_base.clone(),
                    api_key: masked_key,
                    model: p.model.clone(),
                    supports_vision: p.supports_vision,
                }
            })
            .collect(),
        active_index: config.active_index,
        theme: config.theme.to_str().to_string(),
    })
}

#[tauri::command]
pub fn set_agent_config(config: AgentConfigInfo) -> Result<(), String> {
    let mut current = load_agent_config();
    let old_providers = current.providers.clone();
    current.providers = config
        .providers
        .iter()
        .enumerate()
        .map(|(i, p)| {
            // If the key looks masked (contains "..."), keep the old key
            let api_key = if p.api_key.contains("...") {
                old_providers
                    .get(i)
                    .map(|old| old.api_key.clone())
                    .unwrap_or(p.api_key.clone())
            } else {
                p.api_key.clone()
            };
            j_cli::command::chat::storage::ModelProvider {
                name: p.name.clone(),
                api_base: p.api_base.clone(),
                api_key,
                model: p.model.clone(),
                supports_vision: p.supports_vision,
            }
        })
        .collect();
    current.active_index = config.active_index;
    if save_agent_config(&current) {
        Ok(())
    } else {
        Err("保存配置失败".to_string())
    }
}

#[tauri::command]
pub fn set_active_provider(index: usize) -> Result<(), String> {
    let mut config = load_agent_config();
    if index >= config.providers.len() {
        return Err(format!("无效的 provider 索引: {}（共 {} 个提供方）", index, config.providers.len()));
    }
    config.active_index = index;
    if save_agent_config(&config) {
        Ok(())
    } else {
        Err("保存配置失败".to_string())
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YamlConfigInfo {
    pub sections: BTreeMap<String, BTreeMap<String, String>>,
}

#[tauri::command]
pub fn get_config() -> Result<YamlConfigInfo, String> {
    let config = YamlConfig::load();
    let mut sections: BTreeMap<String, BTreeMap<String, String>> = BTreeMap::new();
    for &s in j_cli::constants::ALL_SECTIONS {
        if let Some(map) = config.get_section(s) {
            sections.insert(s.to_string(), map.clone());
        }
    }
    Ok(YamlConfigInfo { sections })
}

#[tauri::command]
pub fn set_config(section: String, key: String, value: String) -> Result<(), String> {
    let mut config = YamlConfig::load();
    if value.is_empty() {
        config.remove_property(&section, &key)
    } else {
        config.set_property(&section, &key, &value)
    }
}

#[tauri::command]
pub fn get_system_prompt() -> Result<Option<String>, String> {
    Ok(load_system_prompt())
}

#[tauri::command]
pub fn set_system_prompt(prompt: String) -> Result<(), String> {
    if save_system_prompt(&prompt) {
        Ok(())
    } else {
        Err("保存系统提示词失败".to_string())
    }
}
