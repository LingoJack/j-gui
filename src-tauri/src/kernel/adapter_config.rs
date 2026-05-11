use super::*;

impl ConfigKernel for JcliAdapter {
    fn load_providers(&self) -> Result<Vec<KernelProvider>, KernelError> {
        let config_val = read_agent_config_value()?;

        let providers: Vec<KernelProvider> = match config_val {
            Some(ref val) if is_v1_format(val) => serde_json::from_value(val["providers"].clone())
                .map_err(|e| KernelError::Config(format!("反序列化 providers 失败: {e}")))?,
            Some(_) => {
                let jcli_config = load_agent_config();
                let mut providers: Vec<KernelProvider> = jcli_config
                    .providers
                    .iter()
                    .map(from_jcli_provider)
                    .collect();
                for p in &mut providers {
                    migrate_provider(p);
                }
                self.save_providers(&providers)?;
                providers
            }
            None => vec![],
        };

        Ok(providers)
    }

    fn save_providers(&self, providers: &[KernelProvider]) -> Result<(), KernelError> {
        let mut config: serde_json::Value = match read_agent_config_value()? {
            Some(val) => val,
            None => {
                let jcli_config = load_agent_config();
                serde_json::to_value(&jcli_config)
                    .map_err(|e| KernelError::Config(format!("序列化默认配置失败: {e}")))?
            }
        };

        let mut providers_val = serde_json::to_value(providers)
            .map_err(|e| KernelError::Config(format!("序列化 providers 失败: {e}")))?;
        if let Some(arr) = providers_val.as_array_mut() {
            for p in arr {
                if p.get("model").is_none() {
                    if let Some(first_id) = p["models"]
                        .as_array()
                        .and_then(|m| m.first())
                        .and_then(|m| m["id"].as_str())
                    {
                        p["model"] = serde_json::json!(first_id);
                    }
                }
            }
        }
        config["providers"] = providers_val;
        config["version"] = serde_json::json!(1);

        let path = agent_config_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(&config)
            .map_err(|e| KernelError::Config(format!("序列化配置失败: {e}")))?;
        std::fs::write(&path, json)?;
        Ok(())
    }

    fn create_channel(
        &self,
        input: KernelCreateChannelInput,
    ) -> Result<KernelProvider, KernelError> {
        let mut providers = self.load_providers()?;
        let provider = KernelProvider {
            id: uuid::Uuid::new_v4().to_string(),
            name: input.name,
            provider: if input.provider.is_empty() {
                infer_provider(&input.api_base)
            } else {
                input.provider
            },
            protocol_hint: input.protocol_hint,
            api_base: input.api_base,
            api_key: input.api_key,
            models: input.models,
            enabled: input.enabled,
            supports_vision: false,
            created_at: current_timestamp(),
            updated_at: current_timestamp(),
        };
        providers.push(provider.clone());
        self.save_providers(&providers)?;
        Ok(provider)
    }

    fn update_channel(
        &self,
        id: &str,
        input: KernelUpdateChannelInput,
    ) -> Result<KernelProvider, KernelError> {
        let mut providers = self.load_providers()?;
        let provider = providers
            .iter_mut()
            .find(|p| p.id == id)
            .ok_or_else(|| KernelError::Config(format!("渠道 ID 不存在: {id}")))?;

        if let Some(name) = input.name {
            provider.name = name;
        }
        if let Some(ref p) = input.provider {
            provider.provider = p.clone();
        }
        if let Some(protocol_hint) = input.protocol_hint {
            provider.protocol_hint = if protocol_hint.trim().is_empty() {
                None
            } else {
                Some(protocol_hint)
            };
        }
        if let Some(ref api_base) = input.api_base {
            provider.api_base = api_base.clone();
        }
        if let Some(ref api_key) = input.api_key {
            if !api_key.contains("...") {
                provider.api_key = api_key.clone();
            }
        }
        if let Some(ref models) = input.models {
            provider.models = models.clone();
        }
        if let Some(enabled) = input.enabled {
            provider.enabled = enabled;
        }
        provider.updated_at = current_timestamp();

        let result = provider.clone();
        self.save_providers(&providers)?;
        Ok(result)
    }

    fn delete_channel(&self, id: &str) -> Result<(), KernelError> {
        let mut providers = self.load_providers()?;
        let len_before = providers.len();
        providers.retain(|p| p.id != id);
        if providers.len() == len_before {
            return Err(KernelError::Config(format!("渠道 ID 不存在: {id}")));
        }
        self.save_providers(&providers)?;
        Ok(())
    }

    fn list_aliases(&self) -> Result<Vec<KernelAliasEntry>, KernelError> {
        let config = YamlConfig::load();
        let sections = &["path", "inner_url", "outer_url", "script"];
        let mut entries = Vec::new();
        for section in sections {
            if let Some(props) = config.get_section(section) {
                for (name, value) in props {
                    entries.push(KernelAliasEntry {
                        section: section.to_string(),
                        name: name.clone(),
                        value: value.clone(),
                    });
                }
            }
        }
        Ok(entries)
    }

    fn set_alias(&self, section: &str, name: &str, value: &str) -> Result<(), KernelError> {
        let mut config = YamlConfig::load();
        config
            .set_property(section, name, value)
            .map_err(|e| KernelError::Config(format!("设置别名失败: {}", e)))
    }

    fn remove_alias(&self, section: &str, name: &str) -> Result<(), KernelError> {
        let mut config = YamlConfig::load();
        config
            .remove_property(section, name)
            .map_err(|e| KernelError::Config(format!("删除别名失败: {}", e)))
    }

    fn load_system_prompt(&self) -> Result<Option<String>, KernelError> {
        Ok(jcli_load_system_prompt())
    }

    fn save_system_prompt(&self, prompt: &str) -> Result<(), KernelError> {
        jcli_save_system_prompt(prompt);
        Ok(())
    }

    fn get_yaml_sections(&self) -> Result<HashMap<String, HashMap<String, String>>, KernelError> {
        let config = YamlConfig::load();
        let mut result = HashMap::new();
        for section in ALL_SECTIONS {
            if let Some(props) = config.get_section(section) {
                result.insert(section.to_string(), props.clone().into_iter().collect());
            } else {
                result.insert(section.to_string(), HashMap::new());
            }
        }
        Ok(result)
    }

    fn set_yaml_property(&self, section: &str, key: &str, value: &str) -> Result<(), KernelError> {
        let mut config = YamlConfig::load();
        if value.is_empty() {
            config
                .remove_property(section, key)
                .map_err(|e| KernelError::Config(format!("删除属性失败: {}", e)))
        } else {
            config
                .set_property(section, key, value)
                .map_err(|e| KernelError::Config(format!("设置属性失败: {}", e)))
        }
    }

    fn load_active_index(&self) -> Result<usize, KernelError> {
        let config = load_agent_config();
        Ok(config.active_index)
    }

    fn set_active_index(&self, index: usize) -> Result<(), KernelError> {
        let mut config = load_agent_config();
        config.active_index = index;
        if save_agent_config(&config) {
            Ok(())
        } else {
            Err(KernelError::Config("保存 active_index 失败".into()))
        }
    }

    fn load_theme_name(&self) -> Result<String, KernelError> {
        let config = load_agent_config();
        Ok(config.theme.to_str().to_string())
    }

    fn version(&self) -> String {
        JCLI_VERSION.to_string()
    }

    fn data_dir(&self) -> PathBuf {
        YamlConfig::data_dir()
    }

    fn set_theme(&self, theme: &str) -> Result<(), KernelError> {
        let mut config = load_agent_config();
        config.theme = ThemeName::parse(theme);
        if !save_agent_config(&config) {
            return Err(KernelError::Config("保存主题配置失败".into()));
        }
        Ok(())
    }
}
