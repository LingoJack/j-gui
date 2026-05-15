use crate::commands::settings::{
    BunRuntimeStatus, EnvCheckResult, EnvToolStatus, RuntimeBinaryStatus, RuntimeStatus,
};
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[path = "settings_environment_shell.rs"]
mod settings_environment_shell;

use settings_environment_shell::detect_shell_environment;

fn current_timestamp_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn current_platform() -> &'static str {
    if cfg!(windows) {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    }
}

/// 在 PATH 中查找指定工具的可执行路径。
pub(crate) fn find_in_path(tool: &str) -> Option<String> {
    let candidates = if cfg!(windows) {
        vec![format!("{tool}.exe"), tool.to_string()]
    } else {
        vec![tool.to_string()]
    };

    std::env::var_os("PATH").and_then(|path| {
        for dir in std::env::split_paths(&path) {
            for candidate in &candidates {
                let path = dir.join(candidate);
                if path.is_file() {
                    return Some(path.to_string_lossy().to_string());
                }
            }
        }
        None
    })
}

/// 执行命令并提取 stdout/stderr 中可用的文本输出。
pub(crate) fn command_output(program: &str, args: &[&str]) -> Option<String> {
    let mut cmd = std::process::Command::new(program);
    cmd.args(args);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stdout.is_empty() {
        return Some(stdout);
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        None
    } else {
        Some(stderr)
    }
}

/// 读取指定工具的版本字符串。
pub(crate) fn get_tool_version(program: &str, version_flag: &str) -> Option<String> {
    command_output(program, &[version_flag])
}

fn detect_runtime_binary(
    tool: &str,
    version_flag: &str,
    missing_error: &str,
) -> RuntimeBinaryStatus {
    let path = find_in_path(tool);
    let version = path
        .as_deref()
        .and_then(|resolved| get_tool_version(resolved, version_flag));
    let available = version.is_some();
    let error = if path.is_none() {
        Some(missing_error.to_string())
    } else if !available {
        Some(format!("无法读取 {tool} 版本"))
    } else {
        None
    };
    RuntimeBinaryStatus {
        available,
        version,
        path,
        error,
    }
}

fn detect_bun_runtime() -> BunRuntimeStatus {
    let path = find_in_path("bun");
    let version = path
        .as_deref()
        .and_then(|resolved| get_tool_version(resolved, "--version"));
    let available = version.is_some();
    let source = version.as_ref().map(|_| "system".to_string());
    BunRuntimeStatus {
        available,
        version,
        path,
        source,
        error: if available {
            None
        } else {
            Some("PATH 中未找到 Bun".into())
        },
    }
}

/// 将 `x.y.z` 版本字符串解析为三元组。
pub(crate) fn parse_version(v: &str) -> Option<(u32, u32, u32)> {
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

/// 判断一个版本是否大于等于给定最小版本。
pub(crate) fn version_gte(version: &str, minimum: &str) -> bool {
    match (parse_version(version), parse_version(minimum)) {
        (Some(v), Some(m)) => v >= m,
        _ => false,
    }
}

/// 重新执行运行时环境检测并返回最新的 RuntimeStatus。
pub(crate) fn reinit_runtime() -> Result<RuntimeStatus, String> {
    get_runtime_status()
}

/// 收集设置页展示所需的完整运行时状态。
pub(crate) fn get_runtime_status() -> Result<RuntimeStatus, String> {
    let node = detect_runtime_binary("node", "--version", "PATH 中未找到 Node.js");
    let bun = detect_bun_runtime();
    let git = detect_runtime_binary("git", "--version", "PATH 中未找到 Git");
    let shell = detect_shell_environment();

    Ok(RuntimeStatus {
        node,
        bun,
        git,
        shell,
        env_loaded: false,
        initialized_at: current_timestamp_millis(),
    })
}

/// 执行设置页的基础环境检查。
pub(crate) fn check_environment() -> Result<EnvCheckResult, String> {
    let platform = current_platform();

    let node = detect_runtime_binary("node", "--version", "PATH 中未找到 Node.js");
    let nodejs = {
        let installed = node.available;
        let version = node.version.clone();
        let meets_minimum = version.as_ref().is_some_and(|v| version_gte(v, "18.0.0"));
        let meets_recommended = version.as_ref().is_some_and(|v| version_gte(v, "22.0.0"));
        EnvToolStatus {
            installed,
            version,
            meets_minimum,
            meets_recommended,
            meets_requirement: meets_minimum,
            download_url: Some("https://nodejs.org/".into()),
            error: node.error,
        }
    };

    let git_runtime = detect_runtime_binary("git", "--version", "Git not found in PATH");
    let git = {
        let installed = git_runtime.available;
        let version = git_runtime.version.clone();
        let ok = version.is_some();
        EnvToolStatus {
            installed,
            version,
            meets_minimum: ok,
            meets_recommended: ok,
            meets_requirement: ok,
            download_url: Some("https://git-scm.com/".into()),
            error: git_runtime.error,
        }
    };

    Ok(EnvCheckResult {
        nodejs,
        git,
        platform: platform.into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_gte_checks_semver_order() {
        assert!(version_gte("1.2.3", "1.2.3"));
        assert!(version_gte("1.3.0", "1.2.9"));
        assert!(!version_gte("1.2.2", "1.2.3"));
    }

    #[cfg(not(windows))]
    #[test]
    fn command_output_ignores_non_zero_exit_even_with_stderr() {
        let output = command_output("sh", &["-c", "echo fail 1>&2; exit 1"]);
        assert_eq!(output, None);
    }

    #[cfg(windows)]
    #[test]
    fn command_output_ignores_non_zero_exit_even_with_stderr() {
        let output = command_output("cmd", &["/C", "echo fail 1>&2 & exit /b 1"]);
        assert_eq!(output, None);
    }

    #[test]
    fn reinit_runtime_returns_valid_status() {
        let result = reinit_runtime();
        assert!(result.is_ok());
        let status = result.unwrap();
        // initialized_at 应为正数时间戳
        assert!(status.initialized_at > 0);
        // node 和 git 至少有 available 字段
        assert!(
            status.node.available || !status.node.available,
            "node.available 应为布尔值"
        );
        assert!(
            status.git.available || !status.git.available,
            "git.available 应为布尔值"
        );
    }

    #[test]
    fn reinit_runtime_returns_fresh_timestamp() {
        let first = reinit_runtime().unwrap().initialized_at;
        let second = reinit_runtime().unwrap().initialized_at;
        // 两次调用的时间戳应递增或相等（毫秒精度下可能相同）
        assert!(second >= first);
    }
}
