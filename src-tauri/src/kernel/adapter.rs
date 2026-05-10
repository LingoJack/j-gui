//! JcliAdapter — implements all kernel traits by delegating to existing jcli calls.
//! This is the ONLY file allowed to contain `j_cli::` imports.

use async_trait::async_trait;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use super::chat::ChatKernel;
use super::config::ConfigKernel;
use super::error::KernelError;
use super::governance::GovernanceKernel;
use super::types::*;

// ===== jcli imports — ONLY place in project =====
use j_cli::command::chat::agent::api::call_llm_stream_async;
use j_cli::command::chat::infra::hook::manager::HookManager;
use j_cli::command::chat::infra::hook::types::OnError;
use j_cli::command::chat::infra::skill::load_all_skills;
use j_cli::command::chat::storage::session::{list_sessions, SessionPaths};
use j_cli::command::chat::storage::{
    self, load_agent_config, load_system_prompt as jcli_load_system_prompt, save_agent_config,
    save_system_prompt as jcli_save_system_prompt, ChatMessage as JcliChatMessage, DisplayHint,
    MessageRole, ModelProvider,
};
use j_cli::config::YamlConfig;
use j_cli::theme::ThemeName;

// ===== JcliAdapter =====

/// Adapter that implements all kernel traits by delegating to jcli calls.
pub struct JcliAdapter;

impl JcliAdapter {
    /// Create a new adapter instance.
    pub fn new() -> Self {
        Self
    }

    /// Return a reference to the [`ConfigKernel`] implementation.
    pub fn config(&self) -> &dyn ConfigKernel {
        self
    }
    /// Return a reference to the [`ChatKernel`] implementation.
    #[allow(dead_code)]
    pub fn chat(&self) -> &dyn ChatKernel {
        self
    }
    /// Return a reference to the [`GovernanceKernel`] implementation.
    pub fn governance(&self) -> &dyn GovernanceKernel {
        self
    }
}

// ===== Helpers =====

/// Path to agent_config.json (jcli data directory).
fn agent_config_path() -> PathBuf {
    YamlConfig::data_dir()
        .join("agent")
        .join("data")
        .join("agent_config.json")
}

/// Load agent_config.json as a generic JSON value returns Ok(None) if file missing.
fn read_agent_config_value() -> Result<Option<serde_json::Value>, KernelError> {
    let path = agent_config_path();
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path)?;
    serde_json::from_str(&content)
        .map(Some)
        .map_err(|e| KernelError::Config(format!("解析 agent_config.json 失败: {e}")))
}

/// Detect whether the stored config uses the new format (V1) or old format (V0).
fn is_v1_format(config: &serde_json::Value) -> bool {
    if let Some(version) = config.get("version").and_then(|v| v.as_u64()) {
        if version >= 1 {
            return true;
        }
    }
    if let Some(providers) = config.get("providers").and_then(|p| p.as_array()) {
        if let Some(first) = providers.first() {
            if first.get("models").is_some() || first.get("id").is_some() {
                return true;
            }
        }
    }
    false
}

/// Migrate a single old-format KernelProvider (empty id) to new format.
fn migrate_provider(p: &mut KernelProvider) {
    if p.id.is_empty() {
        p.id = uuid::Uuid::new_v4().to_string();
    }
    if p.provider.is_empty() {
        p.provider = infer_provider(&p.api_base);
    }
    if p.created_at == 0 {
        p.created_at = current_timestamp();
    }
    if p.updated_at == 0 {
        p.updated_at = current_timestamp();
    }
}

fn to_jcli_provider(p: &KernelProvider) -> ModelProvider {
    ModelProvider {
        name: p.name.clone(),
        api_base: p.api_base.clone(),
        api_key: p.api_key.clone(),
        model: p.models.first().map(|m| m.id.clone()).unwrap_or_default(),
        supports_vision: p.supports_vision,
    }
}

fn from_jcli_provider(p: &ModelProvider) -> KernelProvider {
    KernelProvider {
        id: String::new(),
        name: p.name.clone(),
        provider: String::new(),
        api_base: p.api_base.clone(),
        api_key: p.api_key.clone(),
        models: vec![KernelChannelModel {
            id: p.model.clone(),
            name: p.model.clone(),
            enabled: true,
        }],
        enabled: true,
        supports_vision: p.supports_vision,
        created_at: 0,
        updated_at: 0,
    }
}

fn to_jcli_messages(msgs: &[KernelChatMessage]) -> Vec<JcliChatMessage> {
    msgs.iter()
        .map(|m| JcliChatMessage {
            role: match m.role.as_str() {
                "user" => MessageRole::User,
                "assistant" => MessageRole::Assistant,
                "tool" => MessageRole::Tool,
                "system" => MessageRole::System,
                _ => MessageRole::User,
            },
            content: m.content.clone(),
            tool_calls: None,
            tool_call_id: None,
            images: None,
            reasoning_content: None,
            sender_name: None,
            recipient_name: None,
            display_hint: DisplayHint::Normal,
        })
        .collect()
}

// ===== ConfigKernel impl =====

impl ConfigKernel for JcliAdapter {
    fn load_providers(&self) -> Result<Vec<KernelProvider>, KernelError> {
        let config_val = read_agent_config_value()?;

        let providers: Vec<KernelProvider> = match config_val {
            Some(ref val) if is_v1_format(val) => serde_json::from_value(val["providers"].clone())
                .map_err(|e| KernelError::Config(format!("反序列化 providers 失败: {e}")))?,
            Some(_) => {
                // V0 format: use jcli to load, then migrate
                let jcli_config = load_agent_config();
                let mut providers: Vec<KernelProvider> = jcli_config
                    .providers
                    .iter()
                    .map(from_jcli_provider)
                    .collect();
                for p in &mut providers {
                    migrate_provider(p);
                }
                // Save migrated format
                self.save_providers(&providers)?;
                providers
            }
            None => vec![],
        };

        Ok(providers)
    }

    fn save_providers(&self, providers: &[KernelProvider]) -> Result<(), KernelError> {
        // Read existing config to preserve non-provider fields (active_index, theme, etc.)
        let mut config: serde_json::Value = match read_agent_config_value()? {
            Some(val) => val,
            None => {
                // New file: start with jcli defaults
                let jcli_config = load_agent_config();
                serde_json::to_value(&jcli_config)
                    .map_err(|e| KernelError::Config(format!("序列化默认配置失败: {e}")))?
            }
        };

        // Serialize providers with our format
        let providers_val = serde_json::to_value(providers)
            .map_err(|e| KernelError::Config(format!("序列化 providers 失败: {e}")))?;
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

        // Apply partial updates (only non-None fields)
        if let Some(name) = input.name {
            provider.name = name;
        }
        if let Some(ref p) = input.provider {
            provider.provider = p.clone();
        }
        if let Some(ref api_base) = input.api_base {
            provider.api_base = api_base.clone();
        }
        if let Some(ref api_key) = input.api_key {
            // If the incoming api_key is masked (contains "..."), preserve the old key
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
        use j_cli::constants::ALL_SECTIONS;
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
        j_cli::constants::VERSION.to_string()
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

// ===== ChatKernel impl =====

#[async_trait(?Send)]
impl ChatKernel for JcliAdapter {
    async fn stream_chat(
        &self,
        provider: &KernelProvider,
        messages: &[KernelChatMessage],
        system_prompt: Option<&str>,
        on_chunk: &mut dyn for<'a> FnMut(&'a str),
    ) -> Result<String, KernelError> {
        let jcli_provider = to_jcli_provider(provider);
        let jcli_messages = to_jcli_messages(messages);

        call_llm_stream_async(&jcli_provider, &jcli_messages, system_prompt, on_chunk)
            .await
            .map_err(|e| KernelError::Chat(Box::new(std::io::Error::other(e.to_string()))))
    }

    fn append_message(
        &self,
        session_id: &str,
        role: &str,
        content: &str,
    ) -> Result<(), KernelError> {
        use j_cli::command::chat::storage::SessionEvent;
        let role_enum = match role {
            "user" => MessageRole::User,
            "assistant" => MessageRole::Assistant,
            "system" => MessageRole::System,
            "tool" => MessageRole::Tool,
            _ => MessageRole::User,
        };
        let msg = JcliChatMessage::text(role_enum, content);
        if !storage::append_session_event(session_id, &SessionEvent::msg(msg)) {
            return Err(KernelError::Config("写入会话记录失败".into()));
        }
        Ok(())
    }

    fn list_sessions(&self) -> Result<Vec<KernelSessionSummary>, KernelError> {
        let sessions = list_sessions();
        Ok(sessions
            .into_iter()
            .map(|s| {
                // Read pinned/archived from session.json metadata
                let meta_path = SessionPaths::new(&s.id).meta_file();
                let (pinned, archived) = if meta_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&meta_path) {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                            (
                                val.get("pinned").and_then(|v| v.as_bool()).unwrap_or(false),
                                val.get("archived")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false),
                            )
                        } else {
                            (false, false)
                        }
                    } else {
                        (false, false)
                    }
                } else {
                    (false, false)
                };

                KernelSessionSummary {
                    id: s.id,
                    title: s.title,
                    message_count: s.message_count,
                    updated_at: s.updated_at,
                    pinned,
                    archived,
                }
            })
            .collect())
    }

    fn get_session(&self, session_id: &str) -> Result<Vec<KernelSessionEvent>, KernelError> {
        let messages = storage::load_session(session_id);
        Ok(messages
            .into_iter()
            .map(|m| KernelSessionEvent {
                role: m.role.to_string(),
                content: m.content,
                timestamp: 0,
            })
            .collect())
    }

    fn create_session(&self) -> Result<String, KernelError> {
        let id = uuid::Uuid::new_v4().to_string();
        let paths = SessionPaths::new(&id);
        if let Some(parent) = paths.transcript().parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(paths.transcript(), "")?;
        Ok(id)
    }

    fn delete_session(&self, session_id: &str) -> Result<(), KernelError> {
        let paths = SessionPaths::new(session_id);
        let _ = std::fs::remove_file(paths.transcript());
        let _ = std::fs::remove_file(paths.meta_file());
        Ok(())
    }

    fn delete_message(&self, session_id: &str, pair_index: usize) -> Result<(), KernelError> {
        let paths = SessionPaths::new(session_id);
        let transcript_path = paths.transcript();
        if !transcript_path.exists() {
            return Err(KernelError::Config("会话记录不存在".into()));
        }
        let content = std::fs::read_to_string(&transcript_path)?;

        // Count message events (skip non-message events like Clear)
        let mut msg_event_indices: Vec<usize> = Vec::new();
        for (i, line) in content.lines().enumerate() {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                if v.get("msg").is_some() {
                    msg_event_indices.push(i);
                }
            }
        }

        let user_idx = pair_index * 2;
        let assistant_idx = user_idx + 1;
        if assistant_idx >= msg_event_indices.len() {
            return Err(KernelError::Config("消息索引超出范围".into()));
        }

        let remove_lines: HashSet<usize> = [
            msg_event_indices[user_idx],
            msg_event_indices[assistant_idx],
        ]
        .into_iter()
        .collect();

        let new_content: String = content
            .lines()
            .enumerate()
            .filter(|(i, _)| !remove_lines.contains(i))
            .map(|(_, line)| line.to_string() + "\n")
            .collect();

        std::fs::write(&transcript_path, new_content)?;

        Ok(())
    }

    fn clear_session(&self, session_id: &str) -> Result<(), KernelError> {
        use j_cli::command::chat::storage::SessionEvent;
        if !storage::append_session_event(session_id, &SessionEvent::Clear) {
            return Err(KernelError::Config("清除会话失败".into()));
        }
        Ok(())
    }

    fn toggle_pin(&self, session_id: &str) -> Result<KernelSessionSummary, KernelError> {
        toggle_session_bool_field(session_id, "pinned")
    }

    fn toggle_archive(&self, session_id: &str) -> Result<KernelSessionSummary, KernelError> {
        toggle_session_bool_field(session_id, "archived")
    }
}

// ===== Workspace helpers =====

fn home_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("C:\\"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("/tmp"))
    }
}

fn workspace_dir(slug: &str) -> PathBuf {
    home_dir().join(".jgui").join("agent-workspaces").join(slug)
}

fn workspace_skills_dir(slug: &str) -> PathBuf {
    workspace_dir(slug).join("skills")
}

fn workspace_mcp_config_path(slug: &str) -> PathBuf {
    workspace_dir(slug).join("mcp.json")
}

fn sdk_config_dir() -> PathBuf {
    YamlConfig::data_dir().join("agent").join("sdk-config")
}

fn parse_skill_frontmatter(content: &str) -> Option<(String, String)> {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return None;
    }
    let rest = &trimmed[3..];
    let end_idx = rest.find("\n---")?;
    let fm_str = rest[..end_idx].trim();

    let mut name = None;
    let mut description = None;
    for line in fm_str.lines() {
        let line = line.trim();
        if let Some((key, value)) = line.split_once(':') {
            match key.trim() {
                "name" => name = Some(value.trim().to_string()),
                "description" => description = Some(value.trim().to_string()),
                _ => {}
            }
        }
    }
    Some((name?, description.unwrap_or_default()))
}

fn scan_workspace_skills_dir(skills_dir: &std::path::Path) -> Vec<KernelSkillInfo> {
    if !skills_dir.is_dir() {
        return Vec::new();
    }
    let mut skills = Vec::new();
    let entries = match std::fs::read_dir(skills_dir) {
        Ok(e) => e,
        Err(_) => return skills,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let skill_md = path.join("SKILL.md");
        let content = match std::fs::read_to_string(&skill_md) {
            Ok(c) => c,
            Err(_) => continue,
        };
        if let Some((name, description)) = parse_skill_frontmatter(&content) {
            let slug = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            skills.push(KernelSkillInfo {
                name,
                description,
                source: format!("workspace:{}", slug),
                dir_path: path.to_string_lossy().to_string(),
            });
        }
    }
    skills
}

// ===== Session metadata helpers =====

/// Toggle a boolean field in session.json metadata.
/// Reads the current value, flips it, writes back, and returns the updated summary.
fn toggle_session_bool_field(
    session_id: &str,
    field: &str,
) -> Result<KernelSessionSummary, KernelError> {
    let paths = SessionPaths::new(session_id);

    // Guard: don't create phantom meta for non-existent sessions
    if !paths.transcript().exists() {
        return Err(KernelError::Chat("session not found".into()));
    }

    let meta_path = paths.meta_file();

    // Read existing meta or create default
    let mut meta: serde_json::Value = if meta_path.exists() {
        let content = std::fs::read_to_string(&meta_path)?;
        serde_json::from_str(&content).unwrap_or_else(|_| {
            serde_json::json!({
                "id": session_id,
                "title": "",
                "message_count": 0,
                "created_at": 0,
                "updated_at": 0,
            })
        })
    } else {
        serde_json::json!({
            "id": session_id,
            "title": "",
            "message_count": 0,
            "created_at": 0,
            "updated_at": 0,
        })
    };

    // Toggle the field
    let current = meta.get(field).and_then(|v| v.as_bool()).unwrap_or(false);
    meta[field] = serde_json::json!(!current);

    // Update timestamp
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    meta["updated_at"] = serde_json::json!(now);

    // Write back
    if let Some(parent) = meta_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json =
        serde_json::to_string_pretty(&meta).map_err(|e| KernelError::Config(e.to_string()))?;
    std::fs::write(&meta_path, json)?;

    // Build summary
    let pinned = meta
        .get("pinned")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let archived = meta
        .get("archived")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let title = meta
        .get("title")
        .and_then(|v| v.as_str())
        .map(|s| {
            if s.is_empty() {
                None
            } else {
                Some(s.to_string())
            }
        })
        .unwrap_or(None);

    Ok(KernelSessionSummary {
        id: session_id.to_string(),
        title,
        message_count: meta
            .get("message_count")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as usize,
        updated_at: now,
        pinned,
        archived,
    })
}

// ===== GovernanceKernel impl =====

impl GovernanceKernel for JcliAdapter {
    fn list_skills(&self) -> Result<Vec<KernelSkillInfo>, KernelError> {
        let skills = load_all_skills();
        Ok(skills
            .into_iter()
            .map(|s| KernelSkillInfo {
                name: s.frontmatter.name,
                description: s.frontmatter.description,
                source: format!("{:?}", s.source).to_lowercase(),
                dir_path: s.dir_path.to_string_lossy().to_string(),
            })
            .collect())
    }

    fn scan_global_skills(&self) -> Result<Vec<KernelSkillInfo>, KernelError> {
        // Delegates to governance command which does pure fs I/O
        crate::commands::governance::scan_global_skills()
            .map(|skills| {
                skills
                    .into_iter()
                    .map(|s| KernelSkillInfo {
                        name: s.name,
                        description: s.description,
                        source: s.source,
                        dir_path: s.dir_path,
                    })
                    .collect()
            })
            .map_err(KernelError::Governance)
    }

    fn copy_skill_to_workspace(
        &self,
        source_dir: &str,
        workspace_slug: &str,
        skill_slug: &str,
    ) -> Result<(), KernelError> {
        crate::commands::governance::copy_skill_to_workspace(
            source_dir.to_string(),
            workspace_slug.to_string(),
            skill_slug.to_string(),
        )
        .map_err(KernelError::Governance)
    }

    fn list_hooks(&self) -> Result<Vec<KernelHookInfo>, KernelError> {
        let manager = HookManager::load();
        let entries = manager.list_hooks();
        let config = load_agent_config();
        Ok(entries
            .into_iter()
            .map(|h| KernelHookInfo {
                name: h.name,
                event: format!("{:?}", h.event),
                source: h.source.to_string(),
                hook_type: h.hook_type.to_string(),
                label: h.label,
                timeout: h.timeout,
                on_error: h.on_error.map(|e| match e {
                    OnError::Skip => "skip".into(),
                    OnError::Stop => "stop".into(),
                }),
                unique_id: h.unique_id.clone(),
                enabled: !config.disabled_hooks.iter().any(|d| d == &h.unique_id),
            })
            .collect())
    }

    fn toggle_hook(&self, unique_id: &str, enabled: bool) -> Result<(), KernelError> {
        let mut config = load_agent_config();
        if enabled {
            config.disabled_hooks.retain(|d| d != unique_id);
        } else if !config.disabled_hooks.iter().any(|d| d == unique_id) {
            config.disabled_hooks.push(unique_id.to_string());
        }
        if save_agent_config(&config) {
            Ok(())
        } else {
            Err(KernelError::Config("保存 agent_config 失败".into()))
        }
    }

    fn read_skill_content(
        &self,
        workspace_slug: &str,
        skill_slug: &str,
    ) -> Result<String, KernelError> {
        let path = workspace_skills_dir(workspace_slug)
            .join(skill_slug)
            .join("SKILL.md");
        if !path.exists() {
            return Err(KernelError::Governance(format!(
                "SKILL.md not found: {}",
                path.display()
            )));
        }
        Ok(std::fs::read_to_string(&path)?)
    }

    fn write_skill_content(
        &self,
        workspace_slug: &str,
        skill_slug: &str,
        content: &str,
    ) -> Result<(), KernelError> {
        let path = workspace_skills_dir(workspace_slug)
            .join(skill_slug)
            .join("SKILL.md");
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        Ok(std::fs::write(&path, content)?)
    }

    fn toggle_workspace_skill(
        &self,
        _workspace_slug: &str,
        skill_slug: &str,
        enabled: bool,
    ) -> Result<(), KernelError> {
        let mut config = load_agent_config();
        if enabled {
            config.disabled_skills.retain(|d| d != skill_slug);
        } else if !config.disabled_skills.iter().any(|d| d == skill_slug) {
            config.disabled_skills.push(skill_slug.to_string());
        }
        if save_agent_config(&config) {
            Ok(())
        } else {
            Err(KernelError::Config("保存 agent_config 失败".into()))
        }
    }

    fn delete_workspace_skill(
        &self,
        workspace_slug: &str,
        skill_slug: &str,
    ) -> Result<(), KernelError> {
        let path = workspace_skills_dir(workspace_slug).join(skill_slug);
        if path.exists() {
            std::fs::remove_dir_all(&path)?;
        }
        Ok(())
    }

    fn get_workspace_skills(
        &self,
        workspace_slug: &str,
    ) -> Result<Vec<KernelSkillInfo>, KernelError> {
        let skills_dir = workspace_skills_dir(workspace_slug);
        Ok(scan_workspace_skills_dir(&skills_dir))
    }

    fn get_workspace_skills_dir(&self, workspace_slug: &str) -> Result<String, KernelError> {
        let dir = workspace_skills_dir(workspace_slug);
        std::fs::create_dir_all(&dir)?;
        Ok(dir.to_string_lossy().to_string())
    }

    fn get_other_workspace_skills(
        &self,
        workspace_slug: &str,
    ) -> Result<Vec<KernelSkillInfo>, KernelError> {
        let base = home_dir().join(".jgui").join("agent-workspaces");
        if !base.is_dir() {
            return Ok(Vec::new());
        }
        let mut skills = Vec::new();
        let entries = match std::fs::read_dir(&base) {
            Ok(e) => e,
            Err(_) => return Ok(skills),
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let slug = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            if slug == workspace_slug {
                continue;
            }
            let skills_dir = path.join("skills");
            skills.extend(scan_workspace_skills_dir(&skills_dir));
        }
        Ok(skills)
    }

    fn import_skill_from_workspace(
        &self,
        from_slug: &str,
        to_slug: &str,
        skill_slug: &str,
    ) -> Result<(), KernelError> {
        let from = workspace_skills_dir(from_slug)
            .join(skill_slug)
            .join("SKILL.md");
        if !from.exists() {
            return Err(KernelError::Governance(format!(
                "源 SKILL.md 不存在: {}",
                from.display()
            )));
        }
        let to = workspace_skills_dir(to_slug)
            .join(skill_slug)
            .join("SKILL.md");
        if let Some(parent) = to.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(&from, &to)?;
        Ok(())
    }

    fn get_workspace_mcp_config(
        &self,
        workspace_slug: &str,
    ) -> Result<KernelMcpWorkspaceConfig, KernelError> {
        let path = workspace_mcp_config_path(workspace_slug);
        if !path.exists() {
            return Ok(KernelMcpWorkspaceConfig {
                servers: Vec::new(),
            });
        }
        let content = std::fs::read_to_string(&path)?;
        let servers: Vec<KernelMcpServerConfig> = serde_json::from_str(&content)
            .map_err(|e| KernelError::Governance(format!("解析 MCP 配置失败: {}", e)))?;
        Ok(KernelMcpWorkspaceConfig { servers })
    }

    fn save_workspace_mcp_config(
        &self,
        workspace_slug: &str,
        config: &KernelMcpWorkspaceConfig,
    ) -> Result<(), KernelError> {
        let path = workspace_mcp_config_path(workspace_slug);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string_pretty(&config.servers)
            .map_err(|e| KernelError::Governance(format!("序列化 MCP 配置失败: {}", e)))?;
        Ok(std::fs::write(&path, content)?)
    }

    fn import_cc_sdk_hooks(&self) -> Result<Vec<KernelHookInfo>, KernelError> {
        let hooks_dir = sdk_config_dir().join("hooks");
        if !hooks_dir.is_dir() {
            return Ok(Vec::new());
        }
        let mut hooks = Vec::new();
        let entries = match std::fs::read_dir(&hooks_dir) {
            Ok(e) => e,
            Err(_) => return Ok(hooks),
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e != "json").unwrap_or(true) {
                continue;
            }
            let content = match std::fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };
            if let Ok(hook) = serde_json::from_str::<KernelHookInfo>(&content) {
                hooks.push(hook);
            }
        }
        Ok(hooks)
    }

    fn import_cc_sdk_mcp(
        &self,
        _workspace_slug: &str,
    ) -> Result<Vec<KernelMcpServerConfig>, KernelError> {
        let path = sdk_config_dir().join("mcp_config.json");
        if !path.exists() {
            return Ok(Vec::new());
        }
        let content = std::fs::read_to_string(&path)?;
        let servers: Vec<KernelMcpServerConfig> = serde_json::from_str(&content)
            .map_err(|e| KernelError::Governance(format!("解析 SDK MCP 配置失败: {}", e)))?;
        Ok(servers)
    }

    fn list_mcp_servers(&self) -> Result<Vec<KernelMcpServerConfig>, KernelError> {
        crate::commands::governance::list_mcp_servers()
            .map(|servers| {
                servers
                    .into_iter()
                    .map(|s| KernelMcpServerConfig {
                        name: s.name,
                        transport: s.transport,
                        command: s.command,
                        args: s.args,
                        url: s.url,
                        env: s.env,
                        disabled: s.disabled,
                    })
                    .collect()
            })
            .map_err(KernelError::Governance)
    }

    fn save_mcp_servers(&self, servers: &[KernelMcpServerConfig]) -> Result<(), KernelError> {
        crate::commands::governance::save_mcp_servers(
            servers
                .iter()
                .map(|s| crate::commands::governance::McpServerConfig {
                    name: s.name.clone(),
                    transport: s.transport.clone(),
                    command: s.command.clone(),
                    args: s.args.clone(),
                    url: s.url.clone(),
                    env: s.env.clone(),
                    disabled: s.disabled,
                })
                .collect(),
        )
        .map_err(KernelError::Governance)
    }

    fn list_chat_tools(&self) -> Result<Vec<KernelToolInfo>, KernelError> {
        let config = load_agent_config();
        let disabled = &config.disabled_tools;
        let builtin: &[(&str, &str)] = &[
            ("Bash", "Execute shell commands"),
            ("Read", "Read files"),
            ("Write", "Write files"),
            ("Edit", "Edit files"),
            ("Glob", "Find files by pattern"),
            ("Grep", "Search with regex"),
            ("WebFetch", "Fetch URL"),
            ("WebSearch", "Search web"),
            ("Browser", "Browse pages"),
            ("Ask", "Ask user"),
            ("TaskOutput", "Get task output"),
            ("Task", "Create task"),
            ("TodoWrite", "Write todos"),
            ("TodoRead", "Read todos"),
            ("Compact", "Compact context"),
            ("RegisterHook", "Register hook"),
            ("EnterPlanMode", "Enter plan mode"),
            ("ExitPlanMode", "Exit plan mode"),
            ("EnterWorktree", "Enter worktree"),
            ("ExitWorktree", "Exit worktree"),
            ("LoadSkill", "Load skill"),
        ];
        Ok(builtin
            .iter()
            .map(|&(name, desc)| KernelToolInfo {
                name: name.to_string(),
                description: desc.to_string(),
                enabled: !disabled.iter().any(|d| d == name),
            })
            .collect())
    }

    fn set_tool_enabled(&self, name: &str, enabled: bool) -> Result<(), KernelError> {
        crate::commands::governance::set_tool_enabled(name.to_string(), enabled)
            .map_err(KernelError::Governance)
    }
}

// ===== Tests =====

#[cfg(test)]
mod tests {
    use super::*;
    use j_cli::command::chat::storage::session::sessions_dir;
    use std::fs;

    /// toggle_session_bool_field returns error when transcript is missing
    /// (should not create phantom meta file for non-existent session)
    #[test]
    fn test_toggle_session_bool_field_ghost_session_rejected() {
        let session_id = "toggle-ghost-test-no-transcript";
        let session_dir = sessions_dir().join(session_id);
        let _ = fs::remove_dir_all(&session_dir);
        fs::create_dir_all(&session_dir).unwrap();

        // Create meta file but NO transcript — this is the ghost session scenario
        let meta = serde_json::json!({
            "id": session_id,
            "title": "ghost",
            "message_count": 0,
            "created_at": 0,
            "updated_at": 0,
            "archived": false,
        });
        fs::write(
            session_dir.join("session.json"),
            serde_json::to_string_pretty(&meta).unwrap(),
        )
        .unwrap();

        // Toggle should fail because transcript.jsonl doesn't exist
        let result = toggle_session_bool_field(session_id, "archived");
        assert!(
            result.is_err(),
            "should reject toggle when transcript is missing"
        );
        let err = result.unwrap_err();
        assert!(
            err.to_string().contains("session not found"),
            "expected 'session not found', got: {}",
            err
        );

        // Clean up
        let _ = fs::remove_dir_all(&session_dir);
    }

    /// toggle_session_bool_field succeeds when transcript exists
    #[test]
    fn test_toggle_session_bool_field_with_transcript() {
        let session_id = "toggle-transcript-test-valid";
        let session_dir = sessions_dir().join(session_id);
        let _ = fs::remove_dir_all(&session_dir);
        fs::create_dir_all(&session_dir).unwrap();

        // Create transcript file (empty content is fine — existence is what matters)
        fs::write(session_dir.join("transcript.jsonl"), "").unwrap();

        // Toggle should succeed and create meta with toggled field
        let result = toggle_session_bool_field(session_id, "archived");
        assert!(
            result.is_ok(),
            "toggle should succeed when transcript exists"
        );

        let summary = result.unwrap();
        assert!(summary.archived, "archived should be toggled to true");

        // Toggle again — should flip back
        let result = toggle_session_bool_field(session_id, "archived");
        assert!(result.is_ok());
        let summary = result.unwrap();
        assert!(
            !summary.archived,
            "archived should be toggled back to false"
        );

        // Clean up
        let _ = fs::remove_dir_all(&session_dir);
    }
}
