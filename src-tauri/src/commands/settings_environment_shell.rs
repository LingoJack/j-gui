use super::{command_output, find_in_path, get_tool_version};
use crate::commands::settings::{
    PosixShellStatus, ShellCandidateStatus, ShellEnvironmentStatus, WindowsShellStatus, WslStatus,
};
#[cfg(windows)]
use std::path::{Path, PathBuf};

struct ShellProbe<'a> {
    family: &'a str,
    source: &'a str,
    path: Option<String>,
    version: Option<String>,
    error: Option<String>,
}

fn shell_candidate(probe: ShellProbe<'_>) -> ShellCandidateStatus {
    ShellCandidateStatus {
        family: probe.family.to_string(),
        available: probe.path.is_some() && probe.version.is_some(),
        path: probe.path,
        version: probe.version,
        source: probe.source.to_string(),
        error: probe.error,
    }
}

fn unavailable_shell_candidate(family: &str, source: &str, error: &str) -> ShellCandidateStatus {
    shell_candidate(ShellProbe {
        family,
        source,
        path: None,
        version: None,
        error: Some(error.to_string()),
    })
}

fn detect_shell_binary(
    family: &str,
    tool: &str,
    version_flag: &str,
    source: &str,
) -> ShellCandidateStatus {
    let path = find_in_path(tool);
    let version = path
        .as_deref()
        .and_then(|resolved| get_tool_version(resolved, version_flag));
    let error = if path.is_none() {
        Some(format!("未找到 {family}"))
    } else if version.is_none() {
        Some(format!("无法读取 {family} 版本"))
    } else {
        None
    };
    shell_candidate(ShellProbe {
        family,
        source,
        path,
        version,
        error,
    })
}

fn detect_shell_binary_by_path(
    family: &str,
    path: String,
    source: &str,
    version_flag: &str,
) -> ShellCandidateStatus {
    let version = get_tool_version(&path, version_flag);
    let error = if version.is_none() {
        Some(format!("无法读取 {family} 版本"))
    } else {
        None
    };
    shell_candidate(ShellProbe {
        family,
        source,
        path: Some(path),
        version,
        error,
    })
}

#[cfg(windows)]
fn parse_bash_version(output: &str) -> Option<String> {
    let marker = "version ";
    let start = output.find(marker)? + marker.len();
    let tail = output.get(start..)?.trim();
    let token = tail.split_whitespace().next()?.trim();
    let clean = token.split('(').next()?.trim();
    if clean.is_empty() {
        None
    } else {
        Some(clean.to_string())
    }
}

#[cfg(windows)]
fn common_git_bash_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    for env_key in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
        if let Some(base) = std::env::var_os(env_key) {
            let base = PathBuf::from(base);
            let roots = if env_key == "LOCALAPPDATA" {
                vec![base.join("Programs").join("Git")]
            } else {
                vec![base.join("Git")]
            };
            for root in roots {
                paths.push(root.join("bin").join("bash.exe"));
                paths.push(root.join("usr").join("bin").join("bash.exe"));
            }
        }
    }
    paths
}

#[cfg(windows)]
fn query_git_install_path_from_registry() -> Option<PathBuf> {
    for hive in [
        "HKLM\\SOFTWARE\\GitForWindows",
        "HKCU\\SOFTWARE\\GitForWindows",
    ] {
        let Some(output) = std::process::Command::new("reg")
            .args(["query", hive, "/v", "InstallPath"])
            .output()
            .ok()
        else {
            continue;
        };
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if !line.contains("InstallPath") || !line.contains("REG_SZ") {
                continue;
            }
            let value = line.split("REG_SZ").nth(1)?.trim();
            if !value.is_empty() {
                return Some(PathBuf::from(value));
            }
        }
    }
    None
}

#[cfg(windows)]
fn verify_git_bash_candidate(path: &Path, source: &str) -> Option<ShellCandidateStatus> {
    if !path.is_file() {
        return None;
    }
    let output = command_output(path.to_string_lossy().as_ref(), &["--version"])?;
    let version = parse_bash_version(&output)?;
    Some(shell_candidate(ShellProbe {
        family: "git-bash",
        source,
        path: Some(path.to_string_lossy().to_string()),
        version: Some(version),
        error: None,
    }))
}

#[cfg(windows)]
fn detect_git_bash_status() -> ShellCandidateStatus {
    for path in common_git_bash_paths() {
        if let Some(status) = verify_git_bash_candidate(&path, "path-scan") {
            return status;
        }
    }

    if let Some(root) = query_git_install_path_from_registry() {
        for path in [
            root.join("bin").join("bash.exe"),
            root.join("usr").join("bin").join("bash.exe"),
        ] {
            if let Some(status) = verify_git_bash_candidate(&path, "registry") {
                return status;
            }
        }
    }

    if let Some(path) = find_in_path("bash") {
        let looks_like_git = path.to_ascii_lowercase().contains("git");
        if looks_like_git {
            let candidate = PathBuf::from(path);
            if let Some(status) = verify_git_bash_candidate(&candidate, "path-scan") {
                return status;
            }
        }
    }

    unavailable_shell_candidate("git-bash", "unknown", "未找到 Git Bash 环境")
}

#[cfg(not(windows))]
fn detect_git_bash_status() -> ShellCandidateStatus {
    unavailable_shell_candidate("git-bash", "unknown", "非 Windows 平台")
}

#[cfg(windows)]
fn split_wsl_columns(line: &str) -> Vec<String> {
    let mut columns = Vec::new();
    let mut start = 0usize;
    let chars: Vec<(usize, char)> = line.char_indices().collect();
    let mut idx = 0usize;

    while idx < chars.len() {
        if chars[idx].1 != ' ' {
            idx += 1;
            continue;
        }

        let gap_start = chars[idx].0;
        let mut gap_end = gap_start;
        let mut gap_len = 0usize;
        while idx < chars.len() && chars[idx].1 == ' ' {
            gap_end = chars[idx].0 + chars[idx].1.len_utf8();
            gap_len += 1;
            idx += 1;
        }

        if gap_len >= 2 {
            let segment = line[start..gap_start].trim();
            if !segment.is_empty() {
                columns.push(segment.to_string());
            }
            start = gap_end;
        }
    }

    let tail = line[start..].trim();
    if !tail.is_empty() {
        columns.push(tail.to_string());
    }

    columns
}

#[cfg(windows)]
fn parse_wsl_list_output(output: &str) -> (Option<u8>, Option<String>, Vec<String>) {
    let mut default_distro = None;
    let mut default_version = None;
    let mut distros = Vec::new();
    let mut header_skipped = false;

    for raw_line in output.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }

        let is_default = line.starts_with('*');
        let normalized = if is_default {
            line.trim_start_matches('*').trim()
        } else {
            line
        };

        if !header_skipped {
            header_skipped = true;
            continue;
        }

        let columns = split_wsl_columns(normalized);
        if columns.is_empty() {
            continue;
        }
        let version = columns.last().and_then(|last| match last.as_str() {
            "1" => Some(1_u8),
            "2" => Some(2_u8),
            _ => None,
        });

        let distro_name = columns.first().cloned().unwrap_or_default();
        if distro_name.is_empty() {
            continue;
        }

        if is_default {
            default_distro = Some(distro_name.clone());
            default_version = version;
        }
        distros.push(distro_name);
    }

    (default_version, default_distro, distros)
}

#[cfg(windows)]
fn detect_wsl_status() -> WslStatus {
    let Some(path) = find_in_path("wsl") else {
        return WslStatus {
            available: false,
            version: None,
            default_distro: None,
            distros: Vec::new(),
            error: Some("未找到 WSL".into()),
        };
    };

    let verbose_output = command_output(&path, &["--list", "--verbose"]);
    if let Some(output) = verbose_output {
        let (version, default_distro, distros) = parse_wsl_list_output(&output);
        if !distros.is_empty() {
            return WslStatus {
                available: true,
                version,
                default_distro,
                distros,
                error: None,
            };
        }
    }

    let quiet_output = command_output(&path, &["--list", "--quiet"]);
    if let Some(output) = quiet_output {
        let distros = output
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(ToString::to_string)
            .collect::<Vec<_>>();
        if !distros.is_empty() {
            return WslStatus {
                available: true,
                version: None,
                default_distro: distros.first().cloned(),
                distros,
                error: None,
            };
        }
    }

    WslStatus {
        available: false,
        version: None,
        default_distro: None,
        distros: Vec::new(),
        error: Some("WSL 已安装但未检测到可用发行版".into()),
    }
}

#[cfg(not(windows))]
fn detect_wsl_status() -> WslStatus {
    WslStatus {
        available: false,
        version: None,
        default_distro: None,
        distros: Vec::new(),
        error: Some("非 Windows 平台".into()),
    }
}

#[cfg(windows)]
fn detect_windows_shell_status() -> WindowsShellStatus {
    let powershell = detect_shell_binary("powershell", "pwsh", "--version", "path-scan");
    let cmd = if let Some(path) = std::env::var_os("ComSpec") {
        detect_shell_binary_by_path("cmd", path.to_string_lossy().to_string(), "env", "/?")
    } else {
        detect_shell_binary("cmd", "cmd", "/?", "path-scan")
    };
    let git_bash = detect_git_bash_status();
    let wsl = detect_wsl_status();
    let recommended = if git_bash.available {
        Some("git-bash".to_string())
    } else if wsl.available {
        Some("wsl".to_string())
    } else if powershell.available {
        Some("powershell".to_string())
    } else if cmd.available {
        Some("cmd".to_string())
    } else {
        Some("unknown".to_string())
    };
    WindowsShellStatus {
        powershell,
        cmd,
        git_bash,
        wsl,
        recommended,
    }
}

#[cfg(not(windows))]
fn detect_windows_shell_status() -> WindowsShellStatus {
    WindowsShellStatus {
        powershell: unavailable_shell_candidate("powershell", "unknown", "非 Windows 平台"),
        cmd: unavailable_shell_candidate("cmd", "unknown", "非 Windows 平台"),
        git_bash: unavailable_shell_candidate("git-bash", "unknown", "非 Windows 平台"),
        wsl: detect_wsl_status(),
        recommended: None,
    }
}

#[cfg(windows)]
fn detect_current_windows_shell(windows: &WindowsShellStatus) -> Option<ShellCandidateStatus> {
    if let Ok(shell_path) = std::env::var("SHELL") {
        if let Some(current) = detect_posix_shell_from_path(shell_path, "env") {
            return Some(current);
        }
    }

    if let Some(comspec) = std::env::var_os("ComSpec") {
        let current_path = comspec.to_string_lossy().to_string();
        let family = shell_family_from_path(&current_path);
        if family == "cmd" {
            return Some(detect_shell_binary_by_path(
                "cmd",
                current_path,
                "env",
                "/?",
            ));
        }
    }

    if windows.powershell.available {
        Some(windows.powershell.clone())
    } else {
        None
    }
}

fn detect_posix_candidate(family: &str) -> ShellCandidateStatus {
    detect_shell_binary(family, family, "--version", "path-scan")
}

fn shell_family_from_path(path: &str) -> &'static str {
    let normalized = path.replace('\\', "/").to_ascii_lowercase();
    let leaf = normalized.rsplit('/').next().unwrap_or_default();
    if leaf.contains("pwsh") || leaf.contains("powershell") {
        "powershell"
    } else if leaf == "cmd.exe" || leaf == "cmd" {
        "cmd"
    } else if leaf.contains("bash")
        && (normalized.contains("/git/bin/")
            || normalized.contains("/git/usr/bin/")
            || normalized.contains("/gitforwindows/"))
    {
        "git-bash"
    } else if leaf.contains("bash") {
        "bash"
    } else if leaf.contains("zsh") {
        "zsh"
    } else if leaf.contains("fish") {
        "fish"
    } else if leaf == "sh" {
        "sh"
    } else {
        "unknown"
    }
}

fn detect_posix_shell_from_path(shell_path: String, source: &str) -> Option<ShellCandidateStatus> {
    if shell_path.trim().is_empty() {
        return None;
    }
    let family = shell_family_from_path(&shell_path);
    if !std::path::Path::new(&shell_path).is_file() {
        return Some(shell_candidate(ShellProbe {
            family,
            source,
            path: Some(shell_path),
            version: None,
            error: Some("SHELL 指向的默认 shell 路径不存在".to_string()),
        }));
    }
    let version = get_tool_version(&shell_path, "--version").or_else(|| {
        command_output(
            &shell_path,
            &["-c", "echo $ZSH_VERSION$BASH_VERSION$FISH_VERSION"],
        )
    });
    let filtered_version = version.filter(|value| !value.trim().is_empty());
    let has_version = filtered_version.is_some();
    Some(shell_candidate(ShellProbe {
        family,
        source,
        path: Some(shell_path),
        version: filtered_version,
        error: if has_version {
            None
        } else {
            Some("无法读取当前默认 shell 版本".to_string())
        },
    }))
}

fn detect_current_posix_shell() -> Option<ShellCandidateStatus> {
    let shell_path = match std::env::var("SHELL") {
        Ok(path) => path,
        Err(_) => {
            return Some(unavailable_shell_candidate(
                "unknown",
                "env",
                "SHELL 环境变量缺失",
            ));
        }
    };
    detect_posix_shell_from_path(shell_path, "env")
}

fn has_available_shell(candidates: &[ShellCandidateStatus], family: &str) -> bool {
    candidates
        .iter()
        .any(|item| item.family == family && item.available)
}

fn detect_posix_shell_status() -> PosixShellStatus {
    let current = detect_current_posix_shell();
    let candidates = ["bash", "zsh", "fish", "sh"]
        .into_iter()
        .map(detect_posix_candidate)
        .collect::<Vec<_>>();
    let recommended = if cfg!(target_os = "macos") {
        if has_available_shell(&candidates, "zsh") {
            Some("zsh".to_string())
        } else if has_available_shell(&candidates, "bash") {
            Some("bash".to_string())
        } else if has_available_shell(&candidates, "sh") {
            Some("sh".to_string())
        } else {
            Some("unknown".to_string())
        }
    } else if has_available_shell(&candidates, "bash") {
        Some("bash".to_string())
    } else if has_available_shell(&candidates, "zsh") {
        Some("zsh".to_string())
    } else if has_available_shell(&candidates, "fish") {
        Some("fish".to_string())
    } else if has_available_shell(&candidates, "sh") {
        Some("sh".to_string())
    } else {
        Some("unknown".to_string())
    };

    PosixShellStatus {
        current,
        candidates,
        recommended,
    }
}

fn default_fallback_order() -> Vec<String> {
    if cfg!(windows) {
        vec!["git-bash", "wsl", "powershell", "cmd"]
    } else if cfg!(target_os = "macos") {
        vec!["zsh", "bash", "sh"]
    } else {
        vec!["bash", "zsh", "fish", "sh"]
    }
    .into_iter()
    .map(str::to_string)
    .collect()
}

/// 探测当前平台可用的 shell 环境与推荐顺序。
pub(crate) fn detect_shell_environment() -> ShellEnvironmentStatus {
    let platform = if cfg!(windows) {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    };
    let fallback_order = default_fallback_order();

    if cfg!(windows) {
        let windows = detect_windows_shell_status();
        let current = detect_current_windows_shell(&windows);
        let recommended = windows.recommended.clone();
        ShellEnvironmentStatus {
            platform: platform.to_string(),
            current,
            recommended,
            fallback_order,
            windows: Some(windows),
            posix: None,
        }
    } else {
        let posix = detect_posix_shell_status();
        let current = posix.current.clone();
        let recommended = posix.recommended.clone();
        ShellEnvironmentStatus {
            platform: platform.to_string(),
            current,
            recommended,
            fallback_order,
            windows: None,
            posix: Some(posix),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_family_from_path_detects_common_posix_shells() {
        assert_eq!(shell_family_from_path("/bin/bash"), "bash");
        assert_eq!(shell_family_from_path("/bin/zsh"), "zsh");
        assert_eq!(shell_family_from_path("/opt/homebrew/bin/fish"), "fish");
        assert_eq!(shell_family_from_path("/bin/sh"), "sh");
        assert_eq!(shell_family_from_path("C:/Windows/System32/cmd.exe"), "cmd");
        assert_eq!(
            shell_family_from_path("C:/Program Files/Git/bin/bash.exe"),
            "git-bash"
        );
    }

    #[cfg(windows)]
    #[test]
    fn parse_bash_version_extracts_number() {
        assert_eq!(
            parse_bash_version("GNU bash, version 5.2.15(1)-release (x86_64-pc-msys)"),
            Some("5.2.15".into())
        );
        assert_eq!(parse_bash_version("bash"), None);
    }

    #[cfg(windows)]
    #[test]
    fn parse_wsl_verbose_output_reads_default_distro() {
        let output = "\
  NAME            STATE           VERSION\n\
* Ubuntu-22.04    Running         2\n\
  Debian          Stopped         1\n";
        let (version, default_distro, distros) = parse_wsl_list_output(output);
        assert_eq!(version, Some(2));
        assert_eq!(default_distro.as_deref(), Some("Ubuntu-22.04"));
        assert_eq!(
            distros,
            vec!["Ubuntu-22.04".to_string(), "Debian".to_string()]
        );
    }

    #[cfg(windows)]
    #[test]
    fn parse_wsl_verbose_output_keeps_distros_without_version_token() {
        let output = "\
  NAME            STATE           VERSION\n\
* Ubuntu Preview  Running\n\
  Debian          Stopped\n";
        let (version, default_distro, distros) = parse_wsl_list_output(output);
        assert_eq!(version, None);
        assert_eq!(default_distro.as_deref(), Some("Ubuntu Preview"));
        assert_eq!(
            distros,
            vec!["Ubuntu Preview".to_string(), "Debian".to_string()]
        );
    }

    #[cfg(windows)]
    #[test]
    fn split_wsl_columns_preserves_distro_name_spacing() {
        assert_eq!(
            split_wsl_columns("Ubuntu Preview  Running  2"),
            vec![
                "Ubuntu Preview".to_string(),
                "Running".to_string(),
                "2".to_string()
            ]
        );
    }

    #[cfg(not(windows))]
    #[test]
    fn posix_fallback_order_matches_platform() {
        if cfg!(target_os = "macos") {
            assert_eq!(default_fallback_order(), vec!["zsh", "bash", "sh"]);
        } else {
            assert_eq!(default_fallback_order(), vec!["bash", "zsh", "fish", "sh"]);
        }
    }

    #[test]
    fn detect_posix_shell_from_path_marks_missing_path_with_error() {
        let current = detect_posix_shell_from_path("/definitely/missing-shell".to_string(), "env");
        let current =
            current.expect("missing shell path should still produce current shell error surface");
        assert!(!current.available);
        assert_eq!(
            current.error.as_deref(),
            Some("SHELL 指向的默认 shell 路径不存在")
        );
    }

    #[cfg(not(windows))]
    #[test]
    fn detect_current_posix_shell_marks_missing_env_with_error() {
        let original_shell = std::env::var_os("SHELL");
        // SAFETY: 该测试只在当前进程内临时修改 SHELL，并会在断言前恢复原值。
        unsafe {
            std::env::remove_var("SHELL");
        }

        let current = detect_current_posix_shell();

        match original_shell {
            // SAFETY: 恢复测试前读取到的原始 SHELL 值，作用域仅限当前测试进程。
            Some(value) => unsafe {
                std::env::set_var("SHELL", value);
            },
            // SAFETY: 原本就不存在 SHELL 时，将环境恢复到“未设置”状态。
            None => unsafe {
                std::env::remove_var("SHELL");
            },
        }

        let current =
            current.expect("missing SHELL env should still produce current shell error surface");
        assert!(!current.available);
        assert_eq!(current.family, "unknown");
        assert_eq!(current.error.as_deref(), Some("SHELL 环境变量缺失"));
    }
}
