use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::Emitter;

use crate::kernel::JcliAdapter;

#[path = "settings_agent_workspaces.rs"]
mod settings_agent_workspaces;
#[path = "settings_environment.rs"]
mod settings_environment;
#[path = "settings_system_prompts.rs"]
mod settings_system_prompts;
use settings_agent_workspaces as workspace_commands;
use settings_environment as environment_commands;
pub use settings_system_prompts::{
    CreateSystemPromptInput, SystemPromptConfig, SystemPromptEntry, UpdateSystemPromptInput,
};

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
    #[cfg(target_os = "windows")]
    {
        std::env::var("APPDATA")
            .ok()
            .map(|d| PathBuf::from(d).join("j-gui"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME")
            .ok()
            .map(|d| PathBuf::from(d).join(".jgui"))
    }
}

// ============================================================
// 设置类型 —— 与前端 src/types/settings.ts 中的 AppSettings 对齐
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
pub fn update_settings(
    app: tauri::AppHandle,
    updates: serde_json::Value,
) -> Result<GuiSettings, String> {
    let mut settings = load_settings();
    let mut theme_changed = false;

    if let Some(obj) = updates.as_object() {
        for (key, value) in obj {
            match key.as_str() {
                "themeMode" => {
                    set_str!(value, settings, theme_mode);
                    theme_changed = true;
                }
                "themeStyle" => {
                    set_str!(value, settings, theme_style);
                    theme_changed = true;
                }
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
    if theme_changed {
        app.emit(
            "theme-changed",
            serde_json::json!({
                "themeMode": settings.theme_mode,
                "themeStyle": settings.theme_style,
            }),
        )
        .map_err(|e| e.to_string())?;
    }
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
// Agent 工作区相关命令
// ============================================================

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentWorkspaceInfo {
    pub id: String,
    pub name: String,
    pub slug: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAgentWorkspaceInput {
    pub name: String,
}

fn workspaces_path() -> PathBuf {
    let mut p = settings_dir();
    p.push("workspaces.json");
    p
}

pub(crate) fn load_workspaces() -> Vec<AgentWorkspaceInfo> {
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

pub(crate) fn save_workspaces(workspaces: &[AgentWorkspaceInfo]) -> Result<(), String> {
    let path = workspaces_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(workspaces).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_agent_workspaces() -> Result<Vec<AgentWorkspaceInfo>, String> {
    workspace_commands::list_agent_workspaces()
}

#[tauri::command]
pub fn create_agent_workspace(name: String) -> Result<AgentWorkspaceInfo, String> {
    workspace_commands::create_agent_workspace(name)
}

#[tauri::command]
pub fn update_agent_workspace(
    id: String,
    updates: UpdateAgentWorkspaceInput,
) -> Result<AgentWorkspaceInfo, String> {
    workspace_commands::update_agent_workspace(id, updates)
}

#[tauri::command]
pub fn delete_agent_workspace(id: String) -> Result<(), String> {
    workspace_commands::delete_agent_workspace(id)
}

#[tauri::command]
pub fn reorder_agent_workspaces(
    ordered_ids: Vec<String>,
) -> Result<Vec<AgentWorkspaceInfo>, String> {
    workspace_commands::reorder_agent_workspaces(ordered_ids)
}

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

#[cfg(test)]
pub(crate) use settings_environment::{parse_version, version_gte};

#[tauri::command]
pub fn check_environment() -> Result<EnvCheckResult, String> {
    environment_commands::check_environment()
}

#[tauri::command]
pub fn get_system_prompts(
    state: tauri::State<'_, Arc<JcliAdapter>>,
) -> Result<Vec<SystemPromptEntry>, String> {
    settings_system_prompts::get_system_prompts(state)
}

#[tauri::command]
pub fn get_system_prompt_config(
    state: tauri::State<'_, Arc<JcliAdapter>>,
) -> Result<SystemPromptConfig, String> {
    settings_system_prompts::get_system_prompt_config(state)
}

#[tauri::command]
pub fn create_system_prompt(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    input: CreateSystemPromptInput,
) -> Result<SystemPromptEntry, String> {
    settings_system_prompts::create_system_prompt(state, input)
}

#[tauri::command]
pub fn update_system_prompt(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    id: String,
    input: UpdateSystemPromptInput,
) -> Result<SystemPromptEntry, String> {
    settings_system_prompts::update_system_prompt(state, id, input)
}

#[tauri::command]
pub fn delete_system_prompt(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    id: String,
) -> Result<(), String> {
    settings_system_prompts::delete_system_prompt(state, id)
}

#[tauri::command]
pub fn set_default_prompt(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    prompt_id: String,
) -> Result<(), String> {
    settings_system_prompts::set_default_prompt(state, prompt_id)
}

#[tauri::command]
pub fn update_append_setting(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    append_date_time_and_user_name: bool,
) -> Result<(), String> {
    settings_system_prompts::update_append_setting(state, append_date_time_and_user_name)
}

#[cfg(test)]
#[path = "../tests/commands_settings.rs"]
mod settings_tests;
