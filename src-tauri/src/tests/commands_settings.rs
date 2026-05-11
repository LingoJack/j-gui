use super::*;

fn test_config() -> SystemPromptConfig {
    SystemPromptConfig {
        prompts: vec![
            SystemPromptEntry {
                id: "builtin-1".into(),
                name: "Default".into(),
                content: "You are a helpful assistant.".into(),
                builtin: true,
                created_at: 0,
                updated_at: 0,
            },
            SystemPromptEntry {
                id: "custom-1".into(),
                name: "Custom".into(),
                content: "Custom prompt.".into(),
                builtin: false,
                created_at: 0,
                updated_at: 0,
            },
        ],
        default_prompt_id: "builtin-1".into(),
        append_date_time_and_user_name: true,
    }
}

#[test]
fn test_add_prompt_entry() {
    let mut config = test_config();
    let entry = SystemPromptEntry {
        id: "new-1".into(),
        name: "New".into(),
        content: "New content.".into(),
        builtin: false,
        created_at: 1000,
        updated_at: 1000,
    };
    config.prompts.push(entry);
    assert_eq!(config.prompts.len(), 3);
}

#[test]
fn test_update_prompt_entry() {
    let mut config = test_config();
    let entry = config
        .prompts
        .iter_mut()
        .find(|p| p.id == "custom-1")
        .unwrap();
    entry.content = "Updated.".into();
    assert_eq!(config.prompts[1].content, "Updated.");
}

#[test]
fn test_delete_prompt_entry() {
    let mut config = test_config();
    config.prompts.retain(|p| p.id != "custom-1");
    assert_eq!(config.prompts.len(), 1);
}

#[test]
fn test_builtin_flag_protection() {
    let config = test_config();
    let builtin = config.prompts.iter().find(|p| p.id == "builtin-1").unwrap();
    assert!(builtin.builtin);
}

#[test]
fn test_set_default_prompt() {
    let mut config = test_config();
    config.default_prompt_id = "custom-1".into();
    assert_eq!(config.default_prompt_id, "custom-1");
}

#[test]
fn test_delete_default_fallback() {
    let mut config = test_config();
    config.default_prompt_id = "custom-1".into();
    config.prompts.retain(|p| p.id != "custom-1");
    if config.default_prompt_id == "custom-1" {
        config.default_prompt_id = "builtin-1".into();
    }
    assert_eq!(config.default_prompt_id, "builtin-1");
}

#[test]
fn test_default_config_structure() {
    let config = SystemPromptConfig {
        prompts: vec![SystemPromptEntry {
            id: "jcli-default".into(),
            name: "j-cli 系统提示词".into(),
            content: "test content".into(),
            builtin: true,
            created_at: 1000,
            updated_at: 1000,
        }],
        default_prompt_id: "jcli-default".into(),
        append_date_time_and_user_name: true,
    };
    assert_eq!(config.prompts.len(), 1);
    assert!(config.prompts[0].builtin);
    assert_eq!(config.prompts[0].id, "jcli-default");
    assert_eq!(config.default_prompt_id, "jcli-default");
    assert!(config.append_date_time_and_user_name);
}

#[test]
fn test_serde_is_builtin_rename() {
    let entry = SystemPromptEntry {
        id: "test".into(),
        name: "Test".into(),
        content: "Content".into(),
        builtin: true,
        created_at: 0,
        updated_at: 0,
    };
    let json = serde_json::to_string(&entry).unwrap();
    assert!(
        json.contains("\"isBuiltin\""),
        "JSON should contain isBuiltin, got: {}",
        json
    );
    assert!(
        !json.contains("\"builtin\""),
        "JSON should not contain bare builtin, got: {}",
        json
    );
}

#[test]
fn test_serde_camel_case_config() {
    let config = SystemPromptConfig {
        prompts: vec![],
        default_prompt_id: "default".into(),
        append_date_time_and_user_name: true,
    };
    let json = serde_json::to_string(&config).unwrap();
    assert!(json.contains("\"defaultPromptId\""));
    assert!(json.contains("\"appendDateTimeAndUserName\""));
}

#[test]
fn test_parse_version_valid() {
    assert_eq!(parse_version("v18.0.0"), Some((18, 0, 0)));
    assert_eq!(parse_version("v22.1.3"), Some((22, 1, 3)));
    assert_eq!(parse_version("18.0.0"), Some((18, 0, 0)));
}

#[test]
fn test_parse_version_invalid() {
    assert_eq!(parse_version("v18"), None);
    assert_eq!(parse_version("invalid"), None);
    assert_eq!(parse_version(""), None);
    assert_eq!(parse_version("v.a.b"), None);
}

#[test]
fn test_version_gte() {
    assert!(version_gte("v22.0.0", "18.0.0"));
    assert!(version_gte("v22.0.0", "22.0.0"));
    assert!(!version_gte("v18.0.0", "22.0.0"));
    assert!(!version_gte("invalid", "18.0.0"));
    assert!(!version_gte("v18.0.0", "invalid"));
}
