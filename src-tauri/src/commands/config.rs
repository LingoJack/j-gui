use j_cli::command::chat::storage::{load_agent_config, save_agent_config};
use serde::{Deserialize, Serialize};

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
