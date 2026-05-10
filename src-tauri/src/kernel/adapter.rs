//! JcliAdapter — implements all kernel traits by delegating to existing jcli calls.
//! This is the ONLY file allowed to contain `j_cli::` imports.

use async_trait::async_trait;
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::ipc::Channel;

use super::chat::ChatKernel;
use super::config::ConfigKernel;
use super::error::KernelError;
use super::governance::GovernanceKernel;
use super::types::*;

// ===== jcli imports (ONLY place in entire project) =====
use j_cli::command::chat::infra::hook::manager::HookManager;
use j_cli::command::chat::infra::hook::types::OnError;
use j_cli::command::chat::infra::skill::load_all_skills;
use j_cli::command::chat::storage::{
    self, load_agent_config, load_system_prompt as jcli_load_system_prompt,
    save_agent_config, save_system_prompt as jcli_save_system_prompt,
    ChatMessage as JcliChatMessage, MessageRole, SessionEvent,
};
use j_cli::config::YamlConfig;

// ===== JcliAdapter =====

pub struct JcliAdapter;

impl JcliAdapter {
    pub fn new() -> Self {
        Self
    }

    pub fn config(&self) -> &dyn ConfigKernel {
        self
    }

    pub fn chat(&self) -> &dyn ChatKernel {
        self
    }

    pub fn governance(&self) -> &dyn GovernanceKernel {
        self
    }
}

// ===== ConfigKernel impl =====

impl ConfigKernel for JcliAdapter {
    fn load_providers(&self) -> Result<Vec<KernelProvider>, KernelError> {
        let config = load_agent_config();
        Ok(config
            .providers
            .iter()
            .map(|p| KernelProvider {
                name: p.name.clone(),
                api_base: p.api_base.clone(),
                api_key: p.api_key.clone(),
                model: p.model.clone(),
                supports_vision: p.supports_vision,
            })
            .collect())
    }

    fn save_providers(&self, providers: &[KernelProvider]) -> Result<(), KernelError> {
        let mut config = load_agent_config();
        config.providers = providers
            .iter()
            .map(|p| j_cli::command::chat::storage::ModelProvider {
                name: p.name.clone(),
                api_base: p.api_base.clone(),
                api_key: p.api_key.clone(),
                model: p.model.clone(),
                supports_vision: p.supports_vision,
            })
            .collect();
        if save_agent_config(&config) {
            Ok(())
        } else {
            Err(KernelError::Config("保存 provider 配置失败".into()))
        }
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
                        name,
                        value,
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

    fn get_yaml_sections(
        &self,
    ) -> Result<HashMap<String, HashMap<String, String>>, KernelError> {
        use j_cli::constants::ALL_SECTIONS;
        let config = YamlConfig::load();
        let mut result = HashMap::new();
        for section in ALL_SECTIONS {
            if let Some(props) = config.get_section(section) {
                result.insert(section.to_string(), props);
            } else {
                result.insert(section.to_string(), HashMap::new());
            }
        }
        Ok(result)
    }

    fn set_yaml_property(
        &self,
        section: &str,
        key: &str,
        value: &str,
    ) -> Result<(), KernelError> {
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

    fn version(&self) -> String {
        j_cli::constants::VERSION.to_string()
    }

    fn data_dir(&self) -> PathBuf {
        YamlConfig::data_dir()
    }

    fn set_theme(&self, _theme: &str) -> Result<(), KernelError> {
        // Theme is handled by Tauri app.emit("theme-changed") in the command layer.
        Ok(())
    }
}

// ===== ChatKernel impl =====

#[async_trait]
impl ChatKernel for JcliAdapter {
    async fn stream_chat(
        &self,
        provider: &KernelProvider,
        messages: &[KernelChatMessage],
        system_prompt: Option<&str>,
        on_event: Channel<String>,
    ) -> Result<(), KernelError> {
        let jcli_provider = j_cli::command::chat::storage::ModelProvider {
            name: provider.name.clone(),
            api_base: provider.api_base.clone(),
            api_key: provider.api_key.clone(),
            model: provider.model.clone(),
            supports_vision: provider.supports_vision,
        };

        let jcli_messages: Vec<JcliChatMessage> = messages
            .iter()
            .map(|m| JcliChatMessage {
                role: match m.role.as_str() {
                    "user" => MessageRole::User,
                    "assistant" => MessageRole::Assistant,
                    _ => MessageRole::User,
                },
                content: m.content.clone(),
            })
            .collect();

        j_cli::command::chat::agent::api::call_llm_stream_async(
            &jcli_provider,
            &jcli_messages,
            system_prompt,
            &mut |chunk: &str| {
                let _ = on_event.send(chunk.to_string());
            },
        )
        .await
        .map_err(|e| KernelError::Chat(Box::new(std::io::Error::new(
            std::io::ErrorKind::Other,
            e,
        ))))
    }

    fn list_sessions(&self) -> Result<Vec<KernelSessionSummary>, KernelError> {
        let sessions = storage::list_sessions().unwrap_or_default();
        Ok(sessions
            .into_iter()
            .map(|s| KernelSessionSummary {
                id: s.id,
                title: s.title,
                message_count: s.message_count,
                updated_at: s.updated_at,
            })
            .collect())
    }

    fn get_session(&self, session_id: &str) -> Result<Vec<KernelSessionEvent>, KernelError> {
        let events = storage::load_session(session_id).unwrap_or_default();
        Ok(events
            .into_iter()
            .filter_map(|e| match e {
                SessionEvent::Msg(msg) => Some(KernelSessionEvent {
                    role: format!("{:?}", msg.role).to_lowercase(),
                    content: msg.content,
                    timestamp: 0,
                }),
                _ => None,
            })
            .collect())
    }

    fn create_session(&self) -> Result<String, KernelError> {
        Ok(uuid::Uuid::new_v4().to_string())
    }

    fn delete_session(&self, session_id: &str) -> Result<(), KernelError> {
        let paths = storage::session::SessionPaths::new(session_id);
        let _ = std::fs::remove_file(paths.transcript());
        let _ = std::fs::remove_file(paths.meta_file());
        Ok(())
    }

    fn delete_message(
        &self,
        _session_id: &str,
        _pair_index: usize,
    ) -> Result<(), KernelError> {
        // Message deletion requires rewriting the JSONL transcript.
        // Keep existing ChatEngine logic for now — this is migrated in step 6.
        Err(KernelError::Unsupported(
            "delete_message via kernel not yet implemented".into(),
        ))
    }

    fn clear_session(&self, session_id: &str) -> Result<(), KernelError> {
        // Append a Clear event to the session transcript.
        if let Ok(mut events) = storage::load_session(session_id) {
            events.push(SessionEvent::Clear);
            storage::append_session_event(session_id, &SessionEvent::Clear)
                .map_err(|e| KernelError::Chat(Box::new(e)))?;
        }
        Ok(())
    }
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
        // Global skills scan is pure filesystem I/O, not jcli.
        // Kept inline for now — will be extracted in step 7.
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
            .map_err(|e| KernelError::Governance(e))
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
        .map_err(|e| KernelError::Governance(e))
    }

    fn list_hooks(&self) -> Result<Vec<KernelHookInfo>, KernelError> {
        let manager = HookManager::load();
        let entries = manager.list_hooks();
        Ok(entries
            .into_iter()
            .map(|h| {
                let on_error_str = match h.on_error {
                    OnError::Skip => Some("skip".to_string()),
                    OnError::Stop => Some("stop".to_string()),
                };
                KernelHookInfo {
                    name: h.name,
                    event: format!("{:?}", h.event),
                    source: h.source,
                    hook_type: h.hook_type,
                    label: h.label,
                    timeout: h.timeout,
                    on_error: on_error_str,
                    unique_id: h.unique_id,
                }
            })
            .collect())
    }

    fn toggle_hook(&self, _unique_id: &str, _enabled: bool) -> Result<(), KernelError> {
        Err(KernelError::Unsupported(
            "toggle_hook not yet implemented — will be added in #28".into(),
        ))
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
            .map_err(|e| KernelError::Governance(e))
    }

    fn save_mcp_servers(
        &self,
        servers: &[KernelMcpServerConfig],
    ) -> Result<(), KernelError> {
        let jcli_servers: Vec<_> = servers
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
            .collect();
        crate::commands::governance::save_mcp_servers(jcli_servers)
            .map_err(|e| KernelError::Governance(e))
    }

    fn list_chat_tools(&self) -> Result<Vec<KernelToolInfo>, KernelError> {
        let config = load_agent_config();
        let disabled = &config.disabled_tools;
        // Built-in tools list — must match governance.rs BUILTIN_TOOLS
        let builtin: &[(&str, &str)] = &[
            ("Bash", "Execute shell commands"),
            ("Read", "Read files from the filesystem"),
            ("Write", "Write files to the filesystem"),
            ("Edit", "Edit existing files"),
            ("Glob", "Find files by pattern"),
            ("Grep", "Search file contents with regex"),
            ("WebFetch", "Fetch content from a URL"),
            ("WebSearch", "Search the web"),
            ("Browser", "Browse web pages"),
            ("Ask", "Ask the user a question"),
            ("TaskOutput", "Get task output"),
            ("Task", "Create a task"),
            ("TodoWrite", "Write todo items"),
            ("TodoRead", "Read todo items"),
            ("Compact", "Compact conversation context"),
            ("RegisterHook", "Register a hook"),
            ("EnterPlanMode", "Enter plan mode"),
            ("ExitPlanMode", "Exit plan mode"),
            ("EnterWorktree", "Enter git worktree"),
            ("ExitWorktree", "Exit git worktree"),
            ("LoadSkill", "Load a skill"),
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
            .map_err(|e| KernelError::Governance(e))
    }
}
