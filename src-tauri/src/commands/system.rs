use serde::Serialize;
use std::sync::Arc;
use tauri::Emitter;

use crate::kernel::{ConfigKernel, JcliAdapter};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelInfo {
    /// j-cli crate version embedded in j-gui at compile time.
    pub crate_version: String,
    /// j-gui application version from Tauri config.
    pub app_version: String,
    /// Locally installed j CLI version (detected via `j version`).
    pub local_cli_version: Option<String>,
    /// Whether the local j CLI is installed and accessible on PATH.
    pub local_cli_installed: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    /// Current embedded crate version.
    pub current: String,
    /// Latest version available on crates.io (None if check failed).
    pub latest: Option<String>,
    /// Whether an update is available.
    pub update_available: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateInfo {
    /// Current j-gui app version.
    pub current: String,
    /// Latest release tag on GitHub (None if check failed).
    pub latest: Option<String>,
    /// Download URL for the latest release.
    pub download_url: Option<String>,
    /// Whether an update is available.
    pub update_available: bool,
}

#[tauri::command]
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

/// Strip ANSI escape codes (CSI sequences like `\x1b[0m`, `\x1b[39m`).
fn strip_ansi(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' && chars.peek() == Some(&'[') {
            chars.next(); // skip '['
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

/// Detect the locally installed j CLI version.
/// Runs `j version` and parses the "kernel" row from the table output.
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
pub fn get_version(state: tauri::State<'_, Arc<JcliAdapter>>) -> Result<String, String> {
    Ok(get_version_impl(state.config()))
}

fn get_version_impl(config: &dyn ConfigKernel) -> String {
    config.version()
}

#[tauri::command]
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
}
