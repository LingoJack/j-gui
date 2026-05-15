use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::kernel::JcliAdapter;

#[path = "settings_agent_workspaces.rs"]
mod settings_agent_workspaces;
#[path = "settings_environment.rs"]
mod settings_environment;
#[path = "settings_general.rs"]
mod settings_general;
#[path = "settings_storage.rs"]
mod settings_storage;
#[path = "settings_system_prompts.rs"]
mod settings_system_prompts;
use settings_agent_workspaces as workspace_commands;
use settings_environment as environment_commands;
use settings_storage as storage_commands;
/// 系统提示词配置相关的导出类型。
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

/// 返回 GUI 设置文件所在目录。
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
/// GUI 自管设置结构。
pub struct GuiSettings {
    #[serde(default = "default_theme_mode")]
    pub theme_mode: String,
    #[serde(default = "default_theme_style")]
    pub theme_style: String,
    #[serde(default)]
    pub onboarding_completed: bool,
    pub agent_channel_id: Option<String>,
    pub agent_model_id: Option<String>,
    pub agent_backend_mode: Option<String>,
    #[serde(default)]
    pub agent_channel_ids: Vec<String>,
    pub agent_workspace_id: Option<String>,
    pub chat_workspace_id: Option<String>,
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
            agent_backend_mode: None,
            agent_channel_ids: vec![],
            agent_workspace_id: None,
            chat_workspace_id: None,
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
/// GUI 侧用户资料结构。
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
/// 读取 GUI 自管设置。
pub fn get_settings() -> Result<GuiSettings, String> {
    Ok(load_settings())
}

#[tauri::command]
/// 按补丁方式更新 GUI 自管设置。
pub fn update_settings(
    app: tauri::AppHandle,
    updates: serde_json::Value,
) -> Result<GuiSettings, String> {
    settings_general::apply_settings_updates(app, load_settings(), updates)
}

#[tauri::command]
/// 读取 GUI 侧用户资料。
pub fn get_user_profile() -> Result<UserProfile, String> {
    Ok(load_user_profile())
}

#[tauri::command]
/// 更新 GUI 侧用户资料。
pub fn update_user_profile(updates: serde_json::Value) -> Result<UserProfile, String> {
    settings_general::apply_user_profile_updates(load_user_profile(), updates)
}

// ============================================================
// Agent 工作区相关命令
// ============================================================

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// Agent 工作区列表项。
pub struct AgentWorkspaceInfo {
    pub id: String,
    pub name: String,
    pub slug: String,
}

fn default_workspace() -> AgentWorkspaceInfo {
    AgentWorkspaceInfo {
        id: "default-workspace".to_string(),
        name: "默认工作区".to_string(),
        slug: "default".to_string(),
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// 更新 Agent 工作区时的请求体。
pub struct UpdateAgentWorkspaceInput {
    pub name: String,
}

fn workspaces_path() -> PathBuf {
    let mut p = settings_dir();
    p.push("workspaces.json");
    p
}

/// 读取本地保存的 Agent 工作区列表；空时会自动初始化默认工作区。
pub(crate) fn load_workspaces() -> Vec<AgentWorkspaceInfo> {
    let path = workspaces_path();
    let mut workspaces = if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        vec![]
    };

    if workspaces.is_empty() {
        workspaces.push(default_workspace());
        let _ = save_workspaces(&workspaces);
    }

    workspaces
}

/// 覆盖保存 Agent 工作区列表。
pub(crate) fn save_workspaces(workspaces: &[AgentWorkspaceInfo]) -> Result<(), String> {
    let path = workspaces_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(workspaces).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
/// 列出全部 Agent 工作区。
pub fn list_agent_workspaces() -> Result<Vec<AgentWorkspaceInfo>, String> {
    workspace_commands::list_agent_workspaces()
}

#[tauri::command]
/// 创建一个新的 Agent 工作区。
pub fn create_agent_workspace(name: String) -> Result<AgentWorkspaceInfo, String> {
    workspace_commands::create_agent_workspace(name)
}

#[tauri::command]
/// 更新一个已有 Agent 工作区。
pub fn update_agent_workspace(
    id: String,
    updates: UpdateAgentWorkspaceInput,
) -> Result<AgentWorkspaceInfo, String> {
    workspace_commands::update_agent_workspace(id, updates)
}

#[tauri::command]
/// 删除一个 Agent 工作区。
pub fn delete_agent_workspace(id: String) -> Result<(), String> {
    workspace_commands::delete_agent_workspace(id)
}

#[tauri::command]
/// 按给定顺序重排 Agent 工作区。
pub fn reorder_agent_workspaces(
    ordered_ids: Vec<String>,
) -> Result<Vec<AgentWorkspaceInfo>, String> {
    workspace_commands::reorder_agent_workspaces(ordered_ids)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// 设置页基础环境检查结果。
pub struct EnvCheckResult {
    pub nodejs: EnvToolStatus,
    pub git: EnvToolStatus,
    pub platform: String,
}

/// 基础环境检查里单个工具的状态。
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

/// Node/Git 这类运行时的统一状态结构。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeBinaryStatus {
    /// 运行时是否可用。
    pub available: bool,
    /// 运行时版本号。
    pub version: Option<String>,
    /// 可执行文件路径。
    pub path: Option<String>,
    /// 错误信息。
    pub error: Option<String>,
}

/// Bun 运行时状态。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BunRuntimeStatus {
    /// 运行时是否可用。
    pub available: bool,
    /// Bun 版本号。
    pub version: Option<String>,
    /// 可执行文件路径。
    pub path: Option<String>,
    /// Bun 来源，当前仅区分 system 或未知。
    pub source: Option<String>,
    /// 错误信息。
    pub error: Option<String>,
}

/// 单个 shell 候选项状态。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellCandidateStatus {
    /// shell 家族。
    pub family: String,
    /// shell 是否可用。
    pub available: bool,
    /// 可执行文件路径。
    pub path: Option<String>,
    /// 版本号。
    pub version: Option<String>,
    /// 探测来源。
    pub source: String,
    /// 错误信息。
    pub error: Option<String>,
}

/// Windows 下 WSL 的探测结果。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WslStatus {
    /// WSL 是否可用。
    pub available: bool,
    /// 默认发行版的 WSL 主版本，仅支持 1/2。
    pub version: Option<u8>,
    /// 默认发行版名称。
    pub default_distro: Option<String>,
    /// 已探测到的发行版列表。
    pub distros: Vec<String>,
    /// 错误信息。
    pub error: Option<String>,
}

/// POSIX shell 环境状态。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PosixShellStatus {
    /// 当前默认 shell。
    pub current: Option<ShellCandidateStatus>,
    /// 候选 shell 列表。
    pub candidates: Vec<ShellCandidateStatus>,
    /// 推荐使用的 shell。
    pub recommended: Option<String>,
}

/// Windows shell 环境状态。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsShellStatus {
    /// PowerShell 状态。
    pub powershell: ShellCandidateStatus,
    /// CMD 状态。
    pub cmd: ShellCandidateStatus,
    /// Git Bash 状态。
    pub git_bash: ShellCandidateStatus,
    /// WSL 状态。
    pub wsl: WslStatus,
    /// 推荐使用的 shell。
    pub recommended: Option<String>,
}

/// Shell 环境状态。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellEnvironmentStatus {
    /// 当前平台。
    pub platform: String,
    /// 当前默认 shell。
    pub current: Option<ShellCandidateStatus>,
    /// 推荐使用的 shell。
    pub recommended: Option<String>,
    /// fallback 顺序。
    pub fallback_order: Vec<String>,
    /// Windows 平台明细。
    pub windows: Option<WindowsShellStatus>,
    /// POSIX 平台明细。
    pub posix: Option<PosixShellStatus>,
}

/// 完整运行时状态。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    /// Node.js 状态。
    pub node: RuntimeBinaryStatus,
    /// Bun 状态。
    pub bun: BunRuntimeStatus,
    /// Git 状态。
    pub git: RuntimeBinaryStatus,
    /// Shell 状态。
    pub shell: ShellEnvironmentStatus,
    /// 是否完成额外 shell 环境加载；Tauri 当前恒为 false。
    pub env_loaded: bool,
    /// 本次探测时间戳。
    pub initialized_at: u64,
}

/// 单类存储目录的只读统计结果。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageBucketStats {
    /// 统计目标路径。
    pub path: String,
    /// 路径当前是否存在。
    pub exists: bool,
    /// 递归统计到的文件数。
    pub file_count: u64,
    /// 递归统计到的目录数（不含根目录自身）。
    pub directory_count: u64,
    /// 递归累计的字节数。
    pub total_bytes: u64,
}

/// 设置页使用的只读存储统计。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStats {
    /// Agent session 落盘目录统计。
    pub agent_sessions: StorageBucketStats,
    /// GUI 附件目录统计。
    pub attachments: StorageBucketStats,
    /// GUI 工作区目录统计。
    pub workspaces: StorageBucketStats,
    /// GUI 临时目录统计。
    pub temp_files: StorageBucketStats,
    /// 本次统计时间戳。
    pub checked_at: u64,
}

/// 供其他命令模块复用的命令输出与版本解析辅助函数。
pub(crate) use settings_environment::command_output;
#[cfg(test)]
/// 测试中复用的版本解析辅助函数。
pub(crate) use settings_environment::{parse_version, version_gte};

/// 执行基础环境检查，用于设置页缓存最低环境结论。
#[tauri::command]
pub fn check_environment() -> Result<EnvCheckResult, String> {
    environment_commands::check_environment()
}

/// 重新执行运行时环境检测，返回最新的 RuntimeStatus。
#[tauri::command]
pub fn reinit_runtime() -> Result<RuntimeStatus, String> {
    environment_commands::reinit_runtime()
}

/// 返回运行时详情，包含 Windows 下的 Git Bash / WSL 探测结果。
#[tauri::command]
pub fn get_runtime_status() -> Result<RuntimeStatus, String> {
    environment_commands::get_runtime_status()
}

/// 返回 GUI 自管目录的只读存储统计。
#[tauri::command]
pub fn get_storage_stats() -> Result<StorageStats, String> {
    storage_commands::get_storage_stats()
}

#[tauri::command]
/// 读取系统提示词列表。
pub fn get_system_prompts(
    state: tauri::State<'_, Arc<JcliAdapter>>,
) -> Result<Vec<SystemPromptEntry>, String> {
    settings_system_prompts::get_system_prompts(state)
}

#[tauri::command]
/// 读取系统提示词配置与默认项。
pub fn get_system_prompt_config(
    state: tauri::State<'_, Arc<JcliAdapter>>,
) -> Result<SystemPromptConfig, String> {
    settings_system_prompts::get_system_prompt_config(state)
}

#[tauri::command]
/// 创建一个新的系统提示词。
pub fn create_system_prompt(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    input: CreateSystemPromptInput,
) -> Result<SystemPromptEntry, String> {
    settings_system_prompts::create_system_prompt(state, input)
}

#[tauri::command]
/// 更新一个已有系统提示词。
pub fn update_system_prompt(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    id: String,
    input: UpdateSystemPromptInput,
) -> Result<SystemPromptEntry, String> {
    settings_system_prompts::update_system_prompt(state, id, input)
}

#[tauri::command]
/// 删除一个系统提示词。
pub fn delete_system_prompt(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    id: String,
) -> Result<(), String> {
    settings_system_prompts::delete_system_prompt(state, id)
}

#[tauri::command]
/// 设置默认系统提示词。
pub fn set_default_prompt(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    prompt_id: String,
) -> Result<(), String> {
    settings_system_prompts::set_default_prompt(state, prompt_id)
}

#[tauri::command]
/// 更新“附加日期时间与用户名”开关。
pub fn update_append_setting(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    append_date_time_and_user_name: bool,
) -> Result<(), String> {
    settings_system_prompts::update_append_setting(state, append_date_time_and_user_name)
}

#[cfg(test)]
#[path = "../tests/commands_settings.rs"]
mod settings_tests;
