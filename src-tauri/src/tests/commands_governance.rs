use super::*;
use std::io::Write;

use crate::kernel::error::KernelError;
use crate::kernel::governance::MockGovernanceKernel;
use crate::kernel::types::{KernelHookInfo, KernelSkillInfo};

#[test]
fn test_parse_skill_frontmatter_valid() {
    let dir = std::env::temp_dir().join("j-gui-test-parse-fm");
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("SKILL.md");
    let mut file = fs::File::create(&path).unwrap();
    writeln!(file, "---").unwrap();
    writeln!(file, "name: Test Skill").unwrap();
    writeln!(file, "description: A test skill").unwrap();
    writeln!(file, "---").unwrap();
    writeln!(file, "This is the body").unwrap();
    drop(file);

    let result = parse_skill_frontmatter(&path);
    assert!(result.is_some());
    let (name, desc) = result.unwrap();
    assert_eq!(name, "Test Skill");
    assert_eq!(desc, "A test skill");

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn test_parse_skill_frontmatter_invalid() {
    let dir = std::env::temp_dir().join("j-gui-test-parse-fm-invalid");
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("SKILL.md");
    let mut file = fs::File::create(&path).unwrap();
    writeln!(file, "No frontmatter here").unwrap();
    writeln!(file, "Just content").unwrap();
    drop(file);

    let result = parse_skill_frontmatter(&path);
    assert!(result.is_none());

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn test_parse_skill_frontmatter_no_name() {
    let dir = std::env::temp_dir().join("j-gui-test-parse-fm-noname");
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("SKILL.md");
    let mut file = fs::File::create(&path).unwrap();
    writeln!(file, "---").unwrap();
    writeln!(file, "description: No name here").unwrap();
    writeln!(file, "---").unwrap();
    writeln!(file, "Body").unwrap();
    drop(file);

    // 缺少 name 字段时应返回 None
    let result = parse_skill_frontmatter(&path);
    assert!(result.is_none());

    let _ = fs::remove_dir_all(&dir);
}

// === validate_slug 相关测试 ===
#[test]
fn test_validate_slug_valid() {
    assert!(validate_slug("my-skill").is_ok());
    assert!(validate_slug("MySkill_123").is_ok());
    assert!(validate_slug("test").is_ok());
    assert!(validate_slug("a-b_c").is_ok());
}

#[test]
fn test_validate_slug_empty() {
    assert!(validate_slug("").is_err());
}

#[test]
fn test_validate_slug_path_traversal() {
    assert!(validate_slug("..").is_err());
    assert!(validate_slug("a/b").is_err());
    assert!(validate_slug("a\\b").is_err());
}

#[test]
fn test_validate_slug_special_chars() {
    assert!(validate_slug("a b").is_err());
    assert!(validate_slug("a.b").is_err());
}

// === scan_skills_dir 相关测试 ===
#[test]
fn test_scan_skills_dir_nonexistent() {
    let dir = std::env::temp_dir().join("j-gui-test-nonexistent-scan");
    let _ = fs::remove_dir_all(&dir);
    let skills = scan_skills_dir(&std::env::temp_dir(), "j-gui-test-nonexistent-scan");
    assert!(skills.is_empty());
}

#[test]
fn test_scan_skills_dir_skips_symlinks() {
    let dir = std::env::temp_dir().join("j-gui-test-scan-symlink");
    let _ = fs::remove_dir_all(&dir);

    fs::create_dir_all(&dir.join("real_skill")).unwrap();
    let mut file = fs::File::create(&dir.join("real_skill").join("SKILL.md")).unwrap();
    writeln!(file, "---\nname: Real\n---").unwrap();
    drop(file);

    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(&dir.join("real_skill"), &dir.join("link_skill")).ok();
    }
    #[cfg(windows)]
    {
        std::os::windows::fs::symlink_dir(&dir.join("real_skill"), &dir.join("link_skill")).ok();
    }

    let skills = scan_skills_dir(&dir, "");
    assert_eq!(skills.len(), 1);
    assert_eq!(skills[0].name, "Real");

    let _ = fs::remove_dir_all(&dir);
}

// === validate_source_dir 相关测试 ===
#[test]
fn test_validate_source_dir_rejects_invalid_path() {
    let dir = std::env::temp_dir().join("j-gui-test-validate-source");
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();

    let result = validate_source_dir(&dir.to_string_lossy());
    assert!(result.is_err());

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn test_validate_source_dir_accepts_skills_dir() {
    let home = crate::kernel::home_dir();
    let skill_dir = home.join(".claude/agents/skills/j-gui-test-validate-skill");
    let _ = fs::remove_dir_all(&skill_dir);
    fs::create_dir_all(&skill_dir).unwrap();

    let result = validate_source_dir(&skill_dir.to_string_lossy());
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), std::fs::canonicalize(&skill_dir).unwrap());

    let _ = fs::remove_dir_all(&skill_dir);
}

// === 基于 Kernel 的 list_skills 相关测试 ===

#[test]
fn list_skills_returns_mapped_skills() {
    let mut mock = MockGovernanceKernel::new();
    mock.expect_list_skills().returning(|| {
        Ok(vec![KernelSkillInfo {
            name: "Test Skill".into(),
            description: "A test skill".into(),
            source: "user".into(),
            dir_path: "/tmp/test/skill".into(),
        }])
    });

    let result = list_skills_impl(&mock);
    assert!(result.is_ok());
    let skills = result.unwrap();
    assert_eq!(skills.len(), 1);
    assert_eq!(skills[0].name, "Test Skill");
    assert_eq!(skills[0].description, "A test skill");
    assert_eq!(skills[0].source, "user");
    assert_eq!(skills[0].dir_path, "/tmp/test/skill");
}

#[test]
fn list_skills_empty() {
    let mut mock = MockGovernanceKernel::new();
    mock.expect_list_skills().returning(|| Ok(vec![]));

    let result = list_skills_impl(&mock);
    assert!(result.is_ok());
    assert_eq!(result.unwrap().len(), 0);
}

#[test]
fn list_skills_kernel_error_propagates() {
    let mut mock = MockGovernanceKernel::new();
    mock.expect_list_skills()
        .returning(|| Err(KernelError::Governance("db error".into())));

    let result = list_skills_impl(&mock);
    assert!(result.is_err());
}

// === 基于 Kernel 的 list_hooks 相关测试 ===

#[test]
fn list_hooks_returns_mapped_hooks() {
    let mut mock = MockGovernanceKernel::new();
    mock.expect_list_hooks().returning(|| {
        Ok(vec![KernelHookInfo {
            name: Some("My Hook".into()),
            event: "PreSendMessage".into(),
            source: "user".into(),
            hook_type: "bash".into(),
            label: "Lint check".into(),
            timeout: Some(30),
            on_error: Some("skip".into()),
            unique_id: "abc-123".into(),
            enabled: true,
        }])
    });

    let result = list_hooks_impl(&mock);
    assert!(result.is_ok());
    let hooks = result.unwrap();
    assert_eq!(hooks.len(), 1);
    assert_eq!(hooks[0].name, Some("My Hook".into()));
    assert_eq!(hooks[0].event, "PreSendMessage");
    assert_eq!(hooks[0].source, "user");
    assert_eq!(hooks[0].hook_type, "bash");
    assert_eq!(hooks[0].label, "Lint check");
    assert_eq!(hooks[0].timeout, Some(30));
    assert_eq!(hooks[0].on_error, Some("skip".into()));
    assert_eq!(hooks[0].unique_id, "abc-123");
}

#[test]
fn list_hooks_empty() {
    let mut mock = MockGovernanceKernel::new();
    mock.expect_list_hooks().returning(|| Ok(vec![]));

    let result = list_hooks_impl(&mock);
    assert!(result.is_ok());
    assert_eq!(result.unwrap().len(), 0);
}

#[test]
fn list_hooks_kernel_error_propagates() {
    let mut mock = MockGovernanceKernel::new();
    mock.expect_list_hooks()
        .returning(|| Err(KernelError::Governance("hook error".into())));

    let result = list_hooks_impl(&mock);
    assert!(result.is_err());
}

#[test]
fn list_hooks_maps_all_fields() {
    let mut mock = MockGovernanceKernel::new();
    mock.expect_list_hooks().returning(|| {
        Ok(vec![KernelHookInfo {
            name: None,
            event: "PostLlmResponse".into(),
            source: "builtin".into(),
            hook_type: "llm".into(),
            label: "Auto-format".into(),
            timeout: None,
            on_error: Some("stop".into()),
            unique_id: "xyz-789".into(),
            enabled: true,
        }])
    });

    let result = list_hooks_impl(&mock);
    assert!(result.is_ok());
    let hooks = result.unwrap();
    assert_eq!(hooks.len(), 1);
    assert_eq!(hooks[0].name, None);
    assert_eq!(hooks[0].event, "PostLlmResponse");
    assert_eq!(hooks[0].source, "builtin");
    assert_eq!(hooks[0].hook_type, "llm");
    assert_eq!(hooks[0].label, "Auto-format");
    assert_eq!(hooks[0].timeout, None);
    assert_eq!(hooks[0].on_error, Some("stop".into()));
    assert_eq!(hooks[0].unique_id, "xyz-789");
}
