use crate::commands::settings::{EnvCheckResult, EnvToolStatus};

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

pub(crate) fn check_environment() -> Result<EnvCheckResult, String> {
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
                Some("PATH 中未找到 Node.js".into())
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
