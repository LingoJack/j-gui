use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

fn settings_dir() -> PathBuf {
    dirs_next().unwrap_or_else(|| PathBuf::from("."))
}

fn settings_path() -> PathBuf {
    let mut p = settings_dir();
    p.push("settings.json");
    p
}

fn user_profile_path() -> PathBuf {
    let mut p = settings_dir();
    p.push("user-profile.json");
    p
}

pub(crate) fn dirs_next() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("j-gui"))
}

// ============================================================
// Settings types — match frontend AppSettings from src/types/settings.ts
// ============================================================

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GuiSettings {
    #[serde(default = "default_theme_mode")]
    pub theme_mode: String,
    #[serde(default = "default_theme_style")]
    pub theme_style: String,
    #[serde(default)]
    pub onboarding_completed: bool,
    pub agent_channel_id: Option<String>,
    pub agent_model_id: Option<String>,
    #[serde(default)]
    pub agent_channel_ids: Vec<String>,
    pub agent_workspace_id: Option<String>,
    #[serde(default = "default_true")]
    pub notifications_enabled: bool,
    #[serde(default)]
    pub notification_sound_enabled: bool,
    #[serde(default)]
    pub tutorial_banner_dismissed: bool,
    #[serde(default = "default_archive_days")]
    pub archive_after_days: u32,
    #[serde(default)]
    pub send_with_cmd_enter: bool,
    #[serde(default = "default_true")]
    pub sticky_user_message_enabled: bool,
    pub agent_thinking: Option<serde_json::Value>,
    pub agent_effort: Option<String>,
    pub agent_max_budget_usd: Option<f64>,
    pub agent_max_turns: Option<u32>,
    #[serde(default)]
    pub tab_state: Option<serde_json::Value>,
    #[serde(default)]
    pub shortcut_overrides: Option<serde_json::Value>,
    pub app_icon_variant: Option<String>,
    #[serde(default)]
    pub environment_check_skipped: bool,
    pub last_environment_check: Option<serde_json::Value>,
    #[serde(default)]
    pub notification_sounds: Option<serde_json::Value>,
    pub voice_dictation: Option<serde_json::Value>,
}

fn default_theme_mode() -> String {
    "dark".into()
}
fn default_theme_style() -> String {
    "default".into()
}
fn default_true() -> bool {
    true
}
fn default_archive_days() -> u32 {
    7
}

impl Default for GuiSettings {
    fn default() -> Self {
        Self {
            theme_mode: default_theme_mode(),
            theme_style: default_theme_style(),
            onboarding_completed: false,
            agent_channel_id: None,
            agent_model_id: None,
            agent_channel_ids: vec![],
            agent_workspace_id: None,
            notifications_enabled: true,
            notification_sound_enabled: false,
            tutorial_banner_dismissed: false,
            archive_after_days: default_archive_days(),
            send_with_cmd_enter: false,
            sticky_user_message_enabled: true,
            agent_thinking: None,
            agent_effort: None,
            agent_max_budget_usd: None,
            agent_max_turns: None,
            tab_state: None,
            shortcut_overrides: None,
            app_icon_variant: None,
            environment_check_skipped: false,
            last_environment_check: None,
            notification_sounds: None,
            voice_dictation: None,
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    #[serde(default = "default_user_name")]
    pub user_name: String,
    #[serde(default = "default_avatar")]
    pub avatar: String,
}

fn default_user_name() -> String {
    "User".into()
}
fn default_avatar() -> String {
    "🧑‍💻".into()
}

impl Default for UserProfile {
    fn default() -> Self {
        Self {
            user_name: default_user_name(),
            avatar: default_avatar(),
        }
    }
}

static SETTINGS_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn load_settings() -> GuiSettings {
    let _lock = SETTINGS_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let path = settings_path();
    if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        GuiSettings::default()
    }
}

fn save_settings(settings: &GuiSettings) -> Result<(), String> {
    let _lock = SETTINGS_LOCK
        .lock()
        .map_err(|e| format!("锁定设置失败: {}", e))?;
    let path = settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

fn load_user_profile() -> UserProfile {
    let path = user_profile_path();
    if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        UserProfile::default()
    }
}

fn save_user_profile(profile: &UserProfile) -> Result<(), String> {
    let path = user_profile_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(profile).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

// ============================================================
// Tauri Commands
// ============================================================

#[tauri::command]
pub fn get_settings() -> Result<GuiSettings, String> {
    Ok(load_settings())
}

macro_rules! set_str {
    ($val:expr, $settings:expr, $field:ident) => {
        if let Some(v) = $val.as_str() {
            $settings.$field = v.to_string();
        }
    };
}

macro_rules! set_bool {
    ($val:expr, $settings:expr, $field:ident) => {
        if let Some(v) = $val.as_bool() {
            $settings.$field = v;
        }
    };
}

macro_rules! set_u64 {
    ($val:expr, $settings:expr, $field:ident) => {
        if let Some(v) = $val.as_u64() {
            $settings.$field = v as u32;
        }
    };
}

macro_rules! set_opt_str {
    ($val:expr, $settings:expr, $field:ident) => {
        if $val.is_null() {
            $settings.$field = None;
        } else if let Some(v) = $val.as_str() {
            $settings.$field = Some(v.to_string());
        }
    };
}

macro_rules! set_opt_val {
    ($val:expr, $settings:expr, $field:ident) => {
        if $val.is_null() {
            $settings.$field = None;
        } else {
            $settings.$field = Some($val.clone());
        }
    };
}

macro_rules! set_opt_u64 {
    ($val:expr, $settings:expr, $field:ident) => {
        if $val.is_null() {
            $settings.$field = None;
        } else if let Some(v) = $val.as_u64() {
            $settings.$field = Some(v as u32);
        }
    };
}

macro_rules! set_opt_f64 {
    ($val:expr, $settings:expr, $field:ident) => {
        if $val.is_null() {
            $settings.$field = None;
        } else if let Some(v) = $val.as_f64() {
            $settings.$field = Some(v);
        }
    };
}

macro_rules! set_arr_str {
    ($val:expr, $settings:expr, $field:ident) => {
        if let Some(arr) = $val.as_array() {
            $settings.$field = arr
                .iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect();
        }
    };
}

#[tauri::command]
pub fn update_settings(updates: serde_json::Value) -> Result<GuiSettings, String> {
    let mut settings = load_settings();

    if let Some(obj) = updates.as_object() {
        for (key, value) in obj {
            match key.as_str() {
                "themeMode" => set_str!(value, settings, theme_mode),
                "themeStyle" => set_str!(value, settings, theme_style),
                "onboardingCompleted" => set_bool!(value, settings, onboarding_completed),
                "agentChannelId" => set_opt_str!(value, settings, agent_channel_id),
                "agentModelId" => set_opt_str!(value, settings, agent_model_id),
                "agentChannelIds" => set_arr_str!(value, settings, agent_channel_ids),
                "agentWorkspaceId" => set_opt_str!(value, settings, agent_workspace_id),
                "notificationsEnabled" => set_bool!(value, settings, notifications_enabled),
                "notificationSoundEnabled" => {
                    set_bool!(value, settings, notification_sound_enabled)
                }
                "tutorialBannerDismissed" => set_bool!(value, settings, tutorial_banner_dismissed),
                "archiveAfterDays" => set_u64!(value, settings, archive_after_days),
                "sendWithCmdEnter" => set_bool!(value, settings, send_with_cmd_enter),
                "stickyUserMessageEnabled" => {
                    set_bool!(value, settings, sticky_user_message_enabled)
                }
                "agentThinking" => set_opt_val!(value, settings, agent_thinking),
                "agentEffort" => set_opt_str!(value, settings, agent_effort),
                "agentMaxBudgetUsd" => set_opt_f64!(value, settings, agent_max_budget_usd),
                "agentMaxTurns" => set_opt_u64!(value, settings, agent_max_turns),
                "tabState" => set_opt_val!(value, settings, tab_state),
                "shortcutOverrides" => set_opt_val!(value, settings, shortcut_overrides),
                "appIconVariant" => set_opt_str!(value, settings, app_icon_variant),
                "environmentCheckSkipped" => set_bool!(value, settings, environment_check_skipped),
                "lastEnvironmentCheck" => set_opt_val!(value, settings, last_environment_check),
                "notificationSounds" => set_opt_val!(value, settings, notification_sounds),
                "voiceDictation" => set_opt_val!(value, settings, voice_dictation),
                _ => {}
            }
        }
    }

    save_settings(&settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn get_user_profile() -> Result<UserProfile, String> {
    Ok(load_user_profile())
}

#[tauri::command]
pub fn update_user_profile(updates: serde_json::Value) -> Result<UserProfile, String> {
    let mut profile = load_user_profile();

    if let Some(obj) = updates.as_object() {
        if let Some(v) = obj.get("userName").and_then(|v| v.as_str()) {
            profile.user_name = v.to_string();
        }
        if let Some(v) = obj.get("avatar").and_then(|v| v.as_str()) {
            profile.avatar = v.to_string();
        }
    }

    save_user_profile(&profile)?;
    Ok(profile)
}

// ============================================================
// Agent Workspace commands
// ============================================================

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentWorkspaceInfo {
    pub id: String,
    pub name: String,
    pub slug: String,
}

fn workspaces_path() -> PathBuf {
    let mut p = settings_dir();
    p.push("workspaces.json");
    p
}

fn load_workspaces() -> Vec<AgentWorkspaceInfo> {
    let path = workspaces_path();
    if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        vec![]
    }
}

fn save_workspaces(workspaces: &[AgentWorkspaceInfo]) -> Result<(), String> {
    let path = workspaces_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(workspaces).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_agent_workspaces() -> Result<Vec<AgentWorkspaceInfo>, String> {
    Ok(load_workspaces())
}

#[tauri::command]
pub fn create_agent_workspace(name: String) -> Result<AgentWorkspaceInfo, String> {
    let mut workspaces = load_workspaces();
    let slug = name.to_lowercase().replace(' ', "-");
    let id = uuid::Uuid::new_v4().to_string();
    let ws = AgentWorkspaceInfo { id, name, slug };
    workspaces.push(ws.clone());
    save_workspaces(&workspaces)?;
    Ok(ws)
}

#[tauri::command]
pub fn delete_agent_workspace(id: String) -> Result<(), String> {
    let mut workspaces = load_workspaces();
    workspaces.retain(|w| w.id != id);
    save_workspaces(&workspaces)
}

// ============================================================
// Environment Check — scan system PATH for git/node
// ============================================================

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvCheckResult {
    pub nodejs: EnvToolStatus,
    pub git: EnvToolStatus,
    pub platform: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvToolStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub meets_minimum: bool,
    pub meets_recommended: bool,
    pub meets_requirement: bool,
    pub download_url: Option<String>,
    pub error: Option<String>,
}

fn find_in_path(tool: &str) -> Option<String> {
    std::env::var("PATH").ok().and_then(|path| {
        for dir in std::env::split_paths(&path) {
            let exe = if cfg!(windows) {
                dir.join(format!("{}.exe", tool))
            } else {
                dir.join(tool)
            };
            if exe.exists() {
                return Some(exe.to_string_lossy().to_string());
            }
        }
        None
    })
}

fn get_tool_version(tool: &str, version_flag: &str) -> Option<String> {
    std::process::Command::new(tool)
        .arg(version_flag)
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
}

fn parse_version(v: &str) -> Option<(u32, u32, u32)> {
    let v = v.trim_start_matches('v');
    let parts: Vec<&str> = v.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    Some((
        parts[0].parse().ok()?,
        parts[1].parse().ok()?,
        parts[2].parse().ok()?,
    ))
}

fn version_gte(version: &str, minimum: &str) -> bool {
    match (parse_version(version), parse_version(minimum)) {
        (Some(v), Some(m)) => v >= m,
        _ => false,
    }
}

#[tauri::command]
pub fn check_environment() -> Result<EnvCheckResult, String> {
    let platform = if cfg!(windows) {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    };

    let nodejs = {
        let installed = find_in_path("node").is_some();
        let version = get_tool_version("node", "--version");
        let meets_minimum = version.as_ref().is_some_and(|v| version_gte(v, "18.0.0"));
        let meets_recommended = version.as_ref().is_some_and(|v| version_gte(v, "22.0.0"));
        EnvToolStatus {
            installed,
            version,
            meets_minimum,
            meets_recommended,
            meets_requirement: meets_minimum,
            download_url: Some("https://nodejs.org/".into()),
            error: if installed {
                None
            } else {
                Some("Node.js not found in PATH".into())
            },
        }
    };

    let git = {
        let installed = find_in_path("git").is_some();
        let version = get_tool_version("git", "--version");
        let ok = version.is_some();
        EnvToolStatus {
            installed,
            version,
            meets_minimum: ok,
            meets_recommended: ok,
            meets_requirement: ok,
            download_url: Some("https://git-scm.com/".into()),
            error: if installed {
                None
            } else {
                Some("Git not found in PATH".into())
            },
        }
    };

    Ok(EnvCheckResult {
        nodejs,
        git,
        platform: platform.into(),
    })
}

// ============================================================
// System Prompt Management
// ============================================================

use j_cli::command::chat::storage::load_system_prompt;

static SYSTEM_PROMPT_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

const JCLI_DEFAULT_ID: &str = "jcli-default";

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn system_prompts_config_path() -> PathBuf {
    settings_dir().join("system_prompts.json")
}

fn migrate_system_prompts_config() {
    let new_path = system_prompts_config_path();
    if new_path.exists() {
        return;
    }
    let old_path = j_cli::command::chat::storage::agent_data_dir()
        .join("gui")
        .join("system_prompts.json");
    if old_path.exists() {
        if let Some(parent) = new_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if fs::rename(&old_path, &new_path).is_ok() {
            eprintln!("已迁移系统提示词配置到新路径: {}", new_path.display());
        }
    }
}

fn create_default_system_prompt_config() -> SystemPromptConfig {
    let content = load_system_prompt().unwrap_or_default();
    let now = now_millis();
    SystemPromptConfig {
        prompts: vec![SystemPromptEntry {
            id: JCLI_DEFAULT_ID.to_string(),
            name: "j-cli 系统提示词".to_string(),
            content,
            builtin: true,
            created_at: now,
            updated_at: now,
        }],
        default_prompt_id: JCLI_DEFAULT_ID.to_string(),
        append_date_time_and_user_name: true,
    }
}

fn load_system_prompts_config_inner() -> Result<SystemPromptConfig, String> {
    let path = system_prompts_config_path();
    if path.exists() {
        let content =
            fs::read_to_string(&path).map_err(|e| format!("读取系统提示词配置失败: {}", e))?;
        match serde_json::from_str(&content) {
            Ok(config) => Ok(config),
            Err(e) => {
                eprintln!("警告: 系统提示词配置已损坏 ({}), 将重置为默认配置", e);
                let config = create_default_system_prompt_config();
                let _ = save_system_prompts_config_inner(&config);
                Ok(config)
            }
        }
    } else {
        let config = create_default_system_prompt_config();
        save_system_prompts_config_inner(&config)?;
        Ok(config)
    }
}

fn save_system_prompts_config_inner(config: &SystemPromptConfig) -> Result<(), String> {
    let path = system_prompts_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

fn modify_system_prompts_config<T>(
    f: impl FnOnce(&mut SystemPromptConfig) -> Result<T, String>,
) -> Result<T, String> {
    let _lock = SYSTEM_PROMPT_LOCK
        .lock()
        .map_err(|e| format!("锁定系统提示词配置失败: {}", e))?;
    migrate_system_prompts_config();
    let mut config = load_system_prompts_config_inner()?;
    let result = f(&mut config)?;
    save_system_prompts_config_inner(&config)?;
    Ok(result)
}

fn read_system_prompts_config<T>(f: impl FnOnce(&SystemPromptConfig) -> T) -> Result<T, String> {
    let _lock = SYSTEM_PROMPT_LOCK
        .lock()
        .map_err(|e| format!("锁定系统提示词配置失败: {}", e))?;
    migrate_system_prompts_config();
    let config = load_system_prompts_config_inner()?;
    Ok(f(&config))
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SystemPromptConfig {
    pub prompts: Vec<SystemPromptEntry>,
    pub default_prompt_id: String,
    pub append_date_time_and_user_name: bool,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SystemPromptEntry {
    pub id: String,
    pub name: String,
    pub content: String,
    #[serde(rename = "isBuiltin")]
    pub builtin: bool,
    #[serde(default)]
    pub created_at: u64,
    #[serde(default)]
    pub updated_at: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSystemPromptInput {
    pub name: String,
    pub content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSystemPromptInput {
    pub name: Option<String>,
    pub content: Option<String>,
}

#[tauri::command]
pub fn get_system_prompts() -> Result<Vec<SystemPromptEntry>, String> {
    read_system_prompts_config(|c| c.prompts.clone())
}

#[tauri::command]
pub fn get_system_prompt_config() -> Result<SystemPromptConfig, String> {
    read_system_prompts_config(|c| c.clone())
}

#[tauri::command]
pub fn create_system_prompt(input: CreateSystemPromptInput) -> Result<SystemPromptEntry, String> {
    modify_system_prompts_config(|config| {
        let now = now_millis();
        let entry = SystemPromptEntry {
            id: uuid::Uuid::new_v4().to_string(),
            name: input.name.clone(),
            content: input.content.clone(),
            builtin: false,
            created_at: now,
            updated_at: now,
        };
        config.prompts.push(entry.clone());
        Ok(entry)
    })
}

#[tauri::command]
pub fn update_system_prompt(
    id: String,
    input: UpdateSystemPromptInput,
) -> Result<SystemPromptEntry, String> {
    modify_system_prompts_config(|config| {
        let entry = config
            .prompts
            .iter_mut()
            .find(|p| p.id == id)
            .ok_or_else(|| format!("提示词 '{}' 未找到", id))?;
        if entry.builtin {
            return Err("内置提示词不可编辑".to_string());
        }
        if let Some(name) = &input.name {
            entry.name = name.clone();
        }
        if let Some(content) = &input.content {
            entry.content = content.clone();
        }
        entry.updated_at = now_millis();
        Ok(entry.clone())
    })
}

#[tauri::command]
pub fn delete_system_prompt(id: String) -> Result<(), String> {
    modify_system_prompts_config(|config| {
        let idx = config
            .prompts
            .iter()
            .position(|p| p.id == id)
            .ok_or_else(|| format!("提示词 '{}' 未找到", id))?;
        if config.prompts[idx].builtin {
            return Err("内置提示词不可删除".to_string());
        }
        config.prompts.remove(idx);
        // If deleting the default, fall back to jcli-default
        if config.default_prompt_id == id {
            config.default_prompt_id = JCLI_DEFAULT_ID.to_string();
        }
        Ok(())
    })
}

#[tauri::command]
pub fn set_default_prompt(prompt_id: String) -> Result<(), String> {
    modify_system_prompts_config(|config| {
        if !config.prompts.iter().any(|p| p.id == prompt_id) {
            return Err(format!("提示词 '{}' 未找到", prompt_id));
        }
        config.default_prompt_id = prompt_id;
        Ok(())
    })
}

#[tauri::command]
pub fn update_append_setting(append_date_time_and_user_name: bool) -> Result<(), String> {
    modify_system_prompts_config(|config| {
        config.append_date_time_and_user_name = append_date_time_and_user_name;
        Ok(())
    })
}

#[cfg(test)]
mod system_prompt_tests {
    use super::*;

    fn test_config() -> SystemPromptConfig {
        SystemPromptConfig {
            prompts: vec![
                SystemPromptEntry {
                    id: "builtin-1".into(),
                    name: "Default".into(),
                    content: "You are a helpful assistant.".into(),
                    builtin: true,
                    created_at: 0,
                    updated_at: 0,
                },
                SystemPromptEntry {
                    id: "custom-1".into(),
                    name: "Custom".into(),
                    content: "Custom prompt.".into(),
                    builtin: false,
                    created_at: 0,
                    updated_at: 0,
                },
            ],
            default_prompt_id: "builtin-1".into(),
            append_date_time_and_user_name: true,
        }
    }

    #[test]
    fn test_add_prompt_entry() {
        let mut config = test_config();
        let entry = SystemPromptEntry {
            id: "new-1".into(),
            name: "New".into(),
            content: "New content.".into(),
            builtin: false,
            created_at: 1000,
            updated_at: 1000,
        };
        config.prompts.push(entry);
        assert_eq!(config.prompts.len(), 3);
    }

    #[test]
    fn test_update_prompt_entry() {
        let mut config = test_config();
        let entry = config
            .prompts
            .iter_mut()
            .find(|p| p.id == "custom-1")
            .unwrap();
        entry.content = "Updated.".into();
        assert_eq!(config.prompts[1].content, "Updated.");
    }

    #[test]
    fn test_delete_prompt_entry() {
        let mut config = test_config();
        config.prompts.retain(|p| p.id != "custom-1");
        assert_eq!(config.prompts.len(), 1);
    }

    #[test]
    fn test_builtin_flag_protection() {
        let config = test_config();
        let builtin = config.prompts.iter().find(|p| p.id == "builtin-1").unwrap();
        assert!(builtin.builtin);
    }

    #[test]
    fn test_set_default_prompt() {
        let mut config = test_config();
        config.default_prompt_id = "custom-1".into();
        assert_eq!(config.default_prompt_id, "custom-1");
    }

    #[test]
    fn test_delete_default_fallback() {
        let mut config = test_config();
        config.default_prompt_id = "custom-1".into();
        config.prompts.retain(|p| p.id != "custom-1");
        if config.default_prompt_id == "custom-1" {
            config.default_prompt_id = "builtin-1".into();
        }
        assert_eq!(config.default_prompt_id, "builtin-1");
    }

    #[test]
    fn test_default_config_structure() {
        let config = SystemPromptConfig {
            prompts: vec![SystemPromptEntry {
                id: "jcli-default".into(),
                name: "j-cli 系统提示词".into(),
                content: "test content".into(),
                builtin: true,
                created_at: 1000,
                updated_at: 1000,
            }],
            default_prompt_id: "jcli-default".into(),
            append_date_time_and_user_name: true,
        };
        assert_eq!(config.prompts.len(), 1);
        assert!(config.prompts[0].builtin);
        assert_eq!(config.prompts[0].id, "jcli-default");
        assert_eq!(config.default_prompt_id, "jcli-default");
        assert!(config.append_date_time_and_user_name);
    }

    #[test]
    fn test_serde_is_builtin_rename() {
        let entry = SystemPromptEntry {
            id: "test".into(),
            name: "Test".into(),
            content: "Content".into(),
            builtin: true,
            created_at: 0,
            updated_at: 0,
        };
        let json = serde_json::to_string(&entry).unwrap();
        assert!(
            json.contains("\"isBuiltin\""),
            "JSON should contain isBuiltin, got: {}",
            json
        );
        assert!(
            !json.contains("\"builtin\""),
            "JSON should not contain bare builtin, got: {}",
            json
        );
    }

    #[test]
    fn test_serde_camel_case_config() {
        let config = SystemPromptConfig {
            prompts: vec![],
            default_prompt_id: "default".into(),
            append_date_time_and_user_name: true,
        };
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("\"defaultPromptId\""));
        assert!(json.contains("\"appendDateTimeAndUserName\""));
    }
}
#[cfg(test)]
mod version_tests {
    use super::*;

    #[test]
    fn test_parse_version_valid() {
        assert_eq!(parse_version("v18.0.0"), Some((18, 0, 0)));
        assert_eq!(parse_version("v22.1.3"), Some((22, 1, 3)));
        assert_eq!(parse_version("18.0.0"), Some((18, 0, 0)));
    }

    #[test]
    fn test_parse_version_invalid() {
        assert_eq!(parse_version("v18"), None);
        assert_eq!(parse_version("invalid"), None);
        assert_eq!(parse_version(""), None);
        assert_eq!(parse_version("v.a.b"), None);
    }

    #[test]
    fn test_version_gte() {
        assert!(version_gte("v22.0.0", "18.0.0"));
        assert!(version_gte("v22.0.0", "22.0.0"));
        assert!(!version_gte("v18.0.0", "22.0.0"));
        assert!(!version_gte("invalid", "18.0.0"));
        assert!(!version_gte("v18.0.0", "invalid"));
    }
}
