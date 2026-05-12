use super::*;

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
        let base = crate::kernel::home_dir()
            .join(".jgui")
            .join("agent-workspaces");
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
        let path = YamlConfig::data_dir().join("agent").join("mcp_config.json");
        if !path.exists() {
            return Ok(Vec::new());
        }
        let content = std::fs::read_to_string(&path)?;
        serde_json::from_str(&content)
            .map_err(|e| KernelError::Governance(format!("解析 MCP 配置失败: {}", e)))
    }

    fn save_mcp_servers(&self, servers: &[KernelMcpServerConfig]) -> Result<(), KernelError> {
        let path = YamlConfig::data_dir().join("agent").join("mcp_config.json");
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string_pretty(servers)
            .map_err(|e| KernelError::Governance(format!("序列化 MCP 配置失败: {}", e)))?;
        std::fs::write(&path, content)?;
        Ok(())
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
        let mut config = load_agent_config();
        let exists = self.list_chat_tools()?.iter().any(|tool| tool.name == name);
        if !exists {
            return Err(KernelError::Governance(format!("未知工具: {}", name)));
        }
        if enabled {
            config.disabled_tools.retain(|d| d != name);
        } else if !config.disabled_tools.iter().any(|d| d == name) {
            config.disabled_tools.push(name.to_string());
        }
        if save_agent_config(&config) {
            Ok(())
        } else {
            Err(KernelError::Config("保存 agent_config 失败".into()))
        }
    }

    fn get_disabled_skill_slugs(&self) -> Result<Vec<String>, KernelError> {
        Ok(load_agent_config().disabled_skills)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::{Mutex, OnceLock};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    struct TestEnvGuard {
        _lock: std::sync::MutexGuard<'static, ()>,
        root: PathBuf,
        old_userprofile: Option<String>,
        old_home: Option<String>,
        old_appdata: Option<String>,
    }

    impl TestEnvGuard {
        fn new(slug: &str) -> Self {
            let lock = env_lock().lock().unwrap();
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let root = std::env::temp_dir().join(format!("j-gui-{slug}-{unique}"));
            let user_root = root.join("user");
            let appdata_root = root.join("appdata");
            std::fs::create_dir_all(&user_root).unwrap();
            std::fs::create_dir_all(&appdata_root).unwrap();

            let old_userprofile = std::env::var("USERPROFILE").ok();
            let old_home = std::env::var("HOME").ok();
            let old_appdata = std::env::var("APPDATA").ok();

            std::env::set_var("USERPROFILE", &user_root);
            std::env::set_var("HOME", &user_root);
            std::env::set_var("APPDATA", &appdata_root);

            Self {
                _lock: lock,
                root,
                old_userprofile,
                old_home,
                old_appdata,
            }
        }
    }

    impl Drop for TestEnvGuard {
        fn drop(&mut self) {
            match &self.old_userprofile {
                Some(value) => std::env::set_var("USERPROFILE", value),
                None => std::env::remove_var("USERPROFILE"),
            }
            match &self.old_home {
                Some(value) => std::env::set_var("HOME", value),
                None => std::env::remove_var("HOME"),
            }
            match &self.old_appdata {
                Some(value) => std::env::set_var("APPDATA", value),
                None => std::env::remove_var("APPDATA"),
            }
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    #[ignore = "需要独占环境变量并串行执行，避免污染全量 Rust 测试"]
    fn governance_persists_workspace_skill_content_and_toggle_state() {
        let _guard = TestEnvGuard::new("governance-skill");
        let adapter = JcliAdapter::new();
        let content = "---\nname: Demo Skill\ndescription: Persisted skill\n---\nBody\n";

        adapter
            .write_skill_content("demo-workspace", "demo-skill", content)
            .unwrap();

        assert_eq!(
            adapter
                .read_skill_content("demo-workspace", "demo-skill")
                .unwrap(),
            content
        );

        let skills = adapter.get_workspace_skills("demo-workspace").unwrap();
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "Demo Skill");
        assert_eq!(skills[0].description, "Persisted skill");

        adapter
            .toggle_workspace_skill("demo-workspace", "demo-skill", false)
            .unwrap();
        assert_eq!(
            adapter.get_disabled_skill_slugs().unwrap(),
            vec!["demo-skill"]
        );

        adapter
            .toggle_workspace_skill("demo-workspace", "demo-skill", true)
            .unwrap();
        assert!(adapter.get_disabled_skill_slugs().unwrap().is_empty());
    }

    #[test]
    #[ignore = "需要独占环境变量并串行执行，避免污染全量 Rust 测试"]
    fn governance_persists_workspace_mcp_and_hook_state() {
        let _guard = TestEnvGuard::new("governance-mcp-hooks");
        let adapter = JcliAdapter::new();
        let config = KernelMcpWorkspaceConfig {
            servers: vec![KernelMcpServerConfig {
                name: "demo-server".into(),
                transport: "stdio".into(),
                command: Some("demo-cmd".into()),
                args: Some(vec!["--serve".into()]),
                url: None,
                env: None,
                disabled: false,
            }],
        };

        adapter
            .save_workspace_mcp_config("demo-workspace", &config)
            .unwrap();
        assert_eq!(
            adapter.get_workspace_mcp_config("demo-workspace").unwrap(),
            config
        );

        adapter.toggle_hook("hook-pre-send", false).unwrap();
        assert_eq!(
            load_agent_config().disabled_hooks,
            vec![String::from("hook-pre-send")]
        );

        adapter.toggle_hook("hook-pre-send", true).unwrap();
        assert!(load_agent_config().disabled_hooks.is_empty());
    }

    #[test]
    #[ignore = "需要独占环境变量并串行执行，避免污染全量 Rust 测试"]
    fn governance_imports_cc_sdk_artifacts_from_real_sdk_config_dir() {
        let _guard = TestEnvGuard::new("governance-sdk-import");
        let adapter = JcliAdapter::new();
        let sdk_dir = YamlConfig::data_dir().join("agent").join("sdk-config");
        let hooks_dir = sdk_dir.join("hooks");
        std::fs::create_dir_all(&hooks_dir).unwrap();

        std::fs::write(
            hooks_dir.join("hook-one.json"),
            serde_json::json!({
                "name": "SDK Hook",
                "event": "PreSendMessage",
                "source": "sdk",
                "hookType": "bash",
                "label": "SDK Hook",
                "timeout": 30,
                "onError": "skip",
                "uniqueId": "sdk-hook-1",
                "enabled": true
            })
            .to_string(),
        )
        .unwrap();

        std::fs::write(
            sdk_dir.join("mcp_config.json"),
            serde_json::json!([
                {
                    "name": "sdk-mcp",
                    "transport": "stdio",
                    "command": "sdk-mcp",
                    "args": ["--help"],
                    "disabled": false
                }
            ])
            .to_string(),
        )
        .unwrap();

        let hooks = adapter.import_cc_sdk_hooks().unwrap();
        assert_eq!(hooks.len(), 1);
        assert_eq!(hooks[0].unique_id, "sdk-hook-1");

        let servers = adapter.import_cc_sdk_mcp("demo-workspace").unwrap();
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].name, "sdk-mcp");
    }
}
