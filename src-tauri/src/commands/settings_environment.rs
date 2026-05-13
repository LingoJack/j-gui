use crate::commands::settings::{
    BunRuntimeStatus, EnvCheckResult, EnvToolStatus, GitBashStatus, RuntimeBinaryStatus,
    RuntimeStatus, ShellEnvironmentStatus, WslStatus,
};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn current_timestamp_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn find_in_path(tool: &str) -> Option<String> {
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

fn command_output(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;
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

fn get_tool_version(program: &str, version_flag: &str) -> Option<String> {
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

pub(crate) fn parse_bash_version(output: &str) -> Option<String> {
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
        let Some(output) = Command::new("reg")
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
fn verify_git_bash_candidate(path: &Path) -> Option<GitBashStatus> {
    if !path.is_file() {
        return None;
    }
    let output = command_output(path.to_string_lossy().as_ref(), &["--version"])?;
    let version = parse_bash_version(&output)?;
    Some(GitBashStatus {
        available: true,
        path: Some(path.to_string_lossy().to_string()),
        version: Some(version),
        error: None,
    })
}

#[cfg(windows)]
fn detect_git_bash_status() -> GitBashStatus {
    for path in common_git_bash_paths() {
        if let Some(status) = verify_git_bash_candidate(&path) {
            return status;
        }
    }

    if let Some(root) = query_git_install_path_from_registry() {
        for path in [
            root.join("bin").join("bash.exe"),
            root.join("usr").join("bin").join("bash.exe"),
        ] {
            if let Some(status) = verify_git_bash_candidate(&path) {
                return status;
            }
        }
    }

    if let Some(path) = find_in_path("bash") {
        let looks_like_git = path.to_ascii_lowercase().contains("git");
        if looks_like_git {
            let candidate = PathBuf::from(path);
            if let Some(status) = verify_git_bash_candidate(&candidate) {
                return status;
            }
        }
    }

    GitBashStatus {
        available: false,
        path: None,
        version: None,
        error: Some("未找到 Git Bash 环境".into()),
    }
}

#[cfg(not(windows))]
fn detect_git_bash_status() -> GitBashStatus {
    GitBashStatus {
        available: false,
        path: None,
        version: None,
        error: Some("非 Windows 平台".into()),
    }
}

pub(crate) fn parse_wsl_list_output(output: &str) -> (Option<u8>, Option<String>, Vec<String>) {
    let mut default_distro = None;
    let mut default_version = None;
    let mut distros = Vec::new();

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

        let parts: Vec<&str> = normalized.split_whitespace().collect();
        let version = parts.last().and_then(|last| match *last {
            "1" => Some(1_u8),
            "2" => Some(2_u8),
            _ => None,
        });
        let Some(version) = version else {
            continue;
        };

        let distro_name = if parts.len() >= 3 {
            parts[..parts.len() - 2].join(" ")
        } else {
            parts[0].to_string()
        };
        if distro_name.is_empty() {
            continue;
        }

        if is_default {
            default_distro = Some(distro_name.clone());
            default_version = Some(version);
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

fn recommended_shell(git_bash: &GitBashStatus, wsl: &WslStatus) -> Option<String> {
    if git_bash.available {
        Some("git-bash".into())
    } else if wsl.available {
        Some("wsl".into())
    } else {
        None
    }
}

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

pub(crate) fn version_gte(version: &str, minimum: &str) -> bool {
    match (parse_version(version), parse_version(minimum)) {
        (Some(v), Some(m)) => v >= m,
        _ => false,
    }
}

pub(crate) fn get_runtime_status() -> Result<RuntimeStatus, String> {
    let node = detect_runtime_binary("node", "--version", "PATH 中未找到 Node.js");
    let bun = detect_bun_runtime();
    let git = detect_runtime_binary("git", "--version", "PATH 中未找到 Git");
    let shell = if cfg!(windows) {
        let git_bash = detect_git_bash_status();
        let wsl = detect_wsl_status();
        Some(ShellEnvironmentStatus {
            recommended: recommended_shell(&git_bash, &wsl),
            git_bash,
            wsl,
        })
    } else {
        None
    };

    Ok(RuntimeStatus {
        node,
        bun,
        git,
        shell,
        env_loaded: false,
        initialized_at: current_timestamp_millis(),
    })
}

pub(crate) fn check_environment() -> Result<EnvCheckResult, String> {
    let platform = if cfg!(windows) {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    };

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
    fn parse_bash_version_extracts_number() {
        assert_eq!(
            parse_bash_version("GNU bash, version 5.2.15(1)-release (x86_64-pc-msys)"),
            Some("5.2.15".into())
        );
        assert_eq!(parse_bash_version("bash"), None);
    }

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

    #[test]
    fn recommended_shell_prefers_git_bash() {
        let git_bash = GitBashStatus {
            available: true,
            path: Some("C:/Program Files/Git/bin/bash.exe".into()),
            version: Some("5.2.15".into()),
            error: None,
        };
        let wsl = WslStatus {
            available: true,
            version: Some(2),
            default_distro: Some("Ubuntu".into()),
            distros: vec!["Ubuntu".into()],
            error: None,
        };

        assert_eq!(
            recommended_shell(&git_bash, &wsl).as_deref(),
            Some("git-bash")
        );
        assert_eq!(
            recommended_shell(
                &GitBashStatus {
                    available: false,
                    path: None,
                    version: None,
                    error: Some("missing".into()),
                },
                &wsl
            )
            .as_deref(),
            Some("wsl")
        );
    }
}
