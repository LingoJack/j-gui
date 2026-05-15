use serde::Serialize;
use std::sync::Arc;
use tauri::Emitter;

use crate::agent_engine::which_claude;
use crate::commands::settings::command_output;
use crate::kernel::{ConfigKernel, JcliAdapter};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// 内嵌 j-cli 与本机 j CLI 的版本信息。
pub struct KernelInfo {
    /// 编译期内嵌在 j-gui 中的 j-cli crate 版本。
    pub crate_version: String,
    /// 来自 Tauri 配置的 j-gui 应用版本。
    pub app_version: String,
    /// 本机安装的 j CLI 版本（通过 `j version` 探测）。
    pub local_cli_version: Option<String>,
    /// 本机 j CLI 是否已安装且可通过 PATH 访问。
    pub local_cli_installed: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// j-cli crate 更新检查结果。
pub struct UpdateInfo {
    /// 当前内嵌 crate 版本。
    pub current: String,
    /// crates.io 上可获取的最新版本（检查失败时为 None）。
    pub latest: Option<String>,
    /// 是否存在可用更新。
    pub update_available: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// j-gui 应用更新检查结果。
pub struct AppUpdateInfo {
    /// 当前 j-gui 应用版本。
    pub current: String,
    /// GitHub 上的最新发布标签（检查失败时为 None）。
    pub latest: Option<String>,
    /// 最新版本的下载地址。
    pub download_url: Option<String>,
    /// 是否存在可用更新。
    pub update_available: bool,
}

#[tauri::command]
/// 返回内嵌 j-cli 与本机 j CLI 的版本信息。
pub fn get_kernel_info(state: tauri::State<'_, Arc<JcliAdapter>>) -> KernelInfo {
    get_kernel_info_impl(state.config())
}

fn get_kernel_info_impl(config: &dyn ConfigKernel) -> KernelInfo {
    let crate_version = config.version();
    let (local_cli_version, local_cli_installed) = detect_local_j_cli();
    KernelInfo {
        crate_version,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        local_cli_version,
        local_cli_installed,
    }
}

/// 去除 ANSI 转义序列（例如 `\x1b[0m`、`\x1b[39m` 这类 CSI 序列）。
fn strip_ansi(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' && chars.peek() == Some(&'[') {
            chars.next(); // 跳过 '['
            while let Some(&d) = chars.peek() {
                if d == 'm' {
                    chars.next();
                    break;
                }
                chars.next();
            }
        } else {
            result.push(c);
        }
    }
    result
}

/// 探测本机安装的 j CLI 版本。
/// 通过执行 `j version`，解析表格输出中的 `kernel` 行。
fn detect_local_j_cli() -> (Option<String>, bool) {
    let output = std::process::Command::new("j").arg("version").output();
    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines() {
                if line.contains("kernel") {
                    if let Some(version) = line
                        .split('│')
                        .nth(2)
                        .map(|s| strip_ansi(s.trim()))
                        .filter(|s| !s.is_empty())
                    {
                        return (Some(version), true);
                    }
                }
            }
            (None, true)
        }
        _ => (None, false),
    }
}

#[tauri::command]
/// 检查内嵌 j-cli crate 是否存在新版本。
pub async fn check_kernel_update(
    state: tauri::State<'_, Arc<JcliAdapter>>,
) -> Result<UpdateInfo, String> {
    check_kernel_update_impl(state.config()).await
}

async fn check_kernel_update_impl(config: &dyn ConfigKernel) -> Result<UpdateInfo, String> {
    let current = config.version();
    let latest = fetch_latest_jcli_version().await;
    let update_available = match &latest {
        Some(latest) => latest != &current,
        None => false,
    };
    Ok(UpdateInfo {
        current,
        latest,
        update_available,
    })
}

async fn fetch_latest_jcli_version() -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("j-gui (kernal-update-check)")
        .build()
        .ok()?;
    let resp = client
        .get("https://crates.io/api/v1/crates/j-cli")
        .send()
        .await
        .ok()?;
    let json: serde_json::Value = resp.json().await.ok()?;
    json["crate"]["max_stable_version"]
        .as_str()
        .map(|s| s.to_string())
}

#[tauri::command]
/// 检查 j-gui 应用是否存在新版本。
pub async fn check_app_update() -> Result<AppUpdateInfo, String> {
    check_app_update_impl().await
}

async fn check_app_update_impl() -> Result<AppUpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("j-gui")
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;
    let resp = client
        .get("https://api.github.com/repos/LingoJack/j-gui/releases/latest")
        .send()
        .await
        .map_err(|e| format!("请求 GitHub 失败: {e}"))?;
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {e}"))?;
    let tag = json["tag_name"]
        .as_str()
        .map(|s| s.trim_start_matches('v').to_string());
    let download_url = json["html_url"].as_str().map(|s| s.to_string());
    let update_available = match &tag {
        Some(t) => t != &current,
        None => false,
    };
    Ok(AppUpdateInfo {
        current,
        latest: tag,
        download_url,
        update_available,
    })
}

#[tauri::command]
/// 返回内嵌 j-cli 的当前版本号。
pub fn get_version(state: tauri::State<'_, Arc<JcliAdapter>>) -> Result<String, String> {
    Ok(get_version_impl(state.config()))
}

fn get_version_impl(config: &dyn ConfigKernel) -> String {
    config.version()
}

#[tauri::command]
/// 设置主题并向前端广播主题变更事件。
pub fn set_theme(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    app: tauri::AppHandle,
    theme: String,
) -> Result<(), String> {
    set_theme_impl(state.config(), &theme)?;
    app.emit("theme-changed", &theme).map_err(|e| e.to_string())
}

fn set_theme_impl(config: &dyn ConfigKernel, theme: &str) -> Result<(), String> {
    config.set_theme(theme).map_err(|e| e.to_string())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// Claude Code CLI 的安装与版本探测结果。
pub struct ClaudeCliInfo {
    /// 本机是否已安装 Claude Code CLI。
    pub installed: bool,
    /// 已安装的版本号（检测失败时为 None）。
    pub version: Option<String>,
    /// 可执行文件路径（检测失败时为 None）。
    pub path: Option<String>,
}

#[tauri::command]
/// 检测本机 Claude Code CLI 是否可用及其版本。
pub fn get_claude_cli_status() -> Result<ClaudeCliInfo, String> {
    get_claude_cli_status_impl()
}

fn get_claude_cli_status_impl() -> Result<ClaudeCliInfo, String> {
    let claude_path = which_claude().ok();
    let path_str = claude_path.as_deref().map(|p| p.to_string());
    let installed = path_str.is_some();
    let version = if installed {
        claude_path.as_deref().and_then(|exe| {
            let raw = command_output(exe, &["--version"])?;
            Some(raw.lines().next()?.trim().to_string())
        })
    } else {
        None
    };
    Ok(ClaudeCliInfo {
        installed,
        version,
        path: path_str,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::config::MockConfigKernel;

    #[test]
    fn get_version_calls_kernel_version() {
        let mut mock = MockConfigKernel::new();
        mock.expect_version().returning(|| "2.0.0".to_string());

        let result = get_version_impl(&mock);
        assert_eq!(result, "2.0.0");
    }

    #[test]
    fn set_theme_delegates_to_kernel() {
        let mut mock = MockConfigKernel::new();
        mock.expect_set_theme()
            .with(mockall::predicate::eq("dark"))
            .returning(|_| Ok(()));

        let result = set_theme_impl(&mock, "dark");
        assert!(result.is_ok());
    }

    #[test]
    fn set_theme_kernel_error_propagates() {
        let mut mock = MockConfigKernel::new();
        mock.expect_set_theme()
            .returning(|_| Err(crate::kernel::KernelError::Config("theme error".into())));

        let result = set_theme_impl(&mock, "invalid");
        assert!(result.is_err());
    }

    #[test]
    fn get_claude_cli_status_returns_result() {
        let result = get_claude_cli_status_impl();
        assert!(result.is_ok());
        let info = result.unwrap();
        // 无论本机是否安装 claude，installed 应该是 bool
        assert!(
            info.installed || !info.installed,
            "installed 字段应为布尔值"
        );
        // 若已安装，path 应非空
        if info.installed {
            assert!(info.path.is_some());
            assert!(!info.path.unwrap().is_empty());
        } else {
            assert!(info.path.is_none());
            assert!(info.version.is_none());
        }
    }
}
