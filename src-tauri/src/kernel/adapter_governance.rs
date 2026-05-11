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
