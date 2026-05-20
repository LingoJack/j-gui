use crate::commands::settings_environment_shell::*;

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
#[allow(unsafe_code)]
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
