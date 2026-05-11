use super::*;
use std::fs;

fn test_provider(provider: &str, api_base: &str, model: &str) -> KernelProvider {
    KernelProvider {
        id: "provider-1".to_string(),
        name: "provider-1".to_string(),
        provider: provider.to_string(),
        protocol_hint: None,
        api_base: api_base.to_string(),
        api_key: "key".to_string(),
        models: vec![KernelChannelModel {
            id: model.to_string(),
            name: model.to_string(),
            enabled: true,
        }],
        enabled: true,
        supports_vision: false,
        created_at: 0,
        updated_at: 0,
    }
}

#[test]
fn stream_msg_chunk_serialization() {
    let json = stream_msg_to_json_string(&StreamMsg::Chunk);
    let v: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(v["type"], "chunk");
}

#[test]
fn stream_msg_done_serialization() {
    let json = stream_msg_to_json_string(&StreamMsg::Done);
    let v: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(v["type"], "done");
}

#[test]
fn stream_msg_error_serialization() {
    let err = ChatError::Other("test error".into());
    let json = stream_msg_to_json_string(&StreamMsg::Error(err));
    let v: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(v["type"], "error");
    assert!(v["message"].as_str().unwrap().contains("test error"));
}

#[test]
fn stream_msg_tool_call_request_serialization() {
    let tools = vec![ToolCallItem {
        id: "tool1".into(),
        name: "Bash".into(),
        arguments: r#"{"command":"ls"}"#.into(),
    }];
    let json = stream_msg_to_json_string(&StreamMsg::ToolCallRequest(tools));
    let v: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(v["type"], "toolCallRequest");
    assert_eq!(v["tools"][0]["id"], "tool1");
    assert_eq!(v["tools"][0]["name"], "Bash");
}

#[test]
fn stream_msg_cancelled_serialization() {
    let json = stream_msg_to_json_string(&StreamMsg::Cancelled);
    let v: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(v["type"], "cancelled");
}

#[test]
fn stream_msg_retrying_serialization() {
    let json = stream_msg_to_json_string(&StreamMsg::Retrying {
        attempt: 2,
        max_attempts: 3,
        delay_ms: 1000,
        error: "timeout".into(),
    });
    let v: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(v["type"], "retrying");
    assert_eq!(v["attempt"], 2);
    assert_eq!(v["maxAttempts"], 3);
    assert_eq!(v["delayMs"], 1000);
    assert_eq!(v["error"], "timeout");
}

#[test]
fn stream_msg_compacting_serialization() {
    let json = stream_msg_to_json_string(&StreamMsg::Compacting);
    let v: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(v["type"], "compacting");
}

#[test]
fn stream_msg_compacted_serialization() {
    let json = stream_msg_to_json_string(&StreamMsg::Compacted {
        messages_before: 42,
    });
    let v: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(v["type"], "compacted");
    assert_eq!(v["messagesBefore"], 42);
}

#[test]
fn build_chat_request_extra_only_applies_deepseek_mapping() {
    let deepseek = test_provider(
        "deepseek",
        "https://api.deepseek.com/anthropic",
        "deepseek-v4-pro",
    );
    let generic = test_provider("openai", "https://example.com", "gpt-4.1");

    let enabled = build_chat_request_extra(
        &deepseek,
        KernelChatRequestOptions {
            thinking_enabled: Some(true),
            protocol_family: None,
        },
    );
    assert_eq!(enabled["thinking"]["type"], "enabled");
    assert_eq!(enabled["output_config"]["effort"], "max");

    let disabled = build_chat_request_extra(
        &deepseek,
        KernelChatRequestOptions {
            thinking_enabled: Some(false),
            protocol_family: None,
        },
    );
    assert_eq!(disabled["thinking"]["type"], "disabled");
    assert!(disabled.get("output_config").is_none());

    let generic_extra = build_chat_request_extra(
        &generic,
        KernelChatRequestOptions {
            thinking_enabled: Some(true),
            protocol_family: None,
        },
    );
    assert!(generic_extra.is_empty());
}

#[test]
fn build_anthropic_stream_request_uses_messages_protocol() {
    let provider = test_provider("anthropic", "https://api.anthropic.com", "claude-sonnet");
    let request = build_anthropic_stream_request(
        &provider,
        &[KernelChatMessage {
            role: "user".to_string(),
            content: "hello".to_string(),
            reasoning: None,
            attachments: None,
        }],
        Some("system prompt"),
        KernelChatRequestOptions {
            thinking_enabled: Some(true),
            protocol_family: Some(ChatProtocolFamily::AnthropicMessages),
        },
    )
    .expect("anthropic request should build");

    assert_eq!(request.url, "https://api.anthropic.com/messages");
    assert_eq!(request.body["model"], "claude-sonnet");
    assert_eq!(request.body["stream"], true);
    assert_eq!(request.body["system"], "system prompt");
    assert_eq!(request.body["messages"][0]["role"], "user");
}

#[test]
fn build_openai_responses_request_uses_responses_protocol() {
    let provider = test_provider("openai", "https://api.openai.com/v1", "gpt-5");
    let request = build_openai_responses_request(
        &provider,
        &[KernelChatMessage {
            role: "user".to_string(),
            content: "hello".to_string(),
            reasoning: None,
            attachments: None,
        }],
        Some("system prompt"),
        KernelChatRequestOptions {
            thinking_enabled: Some(true),
            protocol_family: Some(ChatProtocolFamily::OpenAiResponses),
        },
    )
    .expect("responses request should build");

    assert_eq!(request.url, "https://api.openai.com/v1/responses");
    assert_eq!(request.body["model"], "gpt-5");
    assert_eq!(request.body["stream"], true);
    assert_eq!(request.body["instructions"], "system prompt");
    assert_eq!(request.body["input"][0]["type"], "message");
    assert_eq!(request.body["input"][0]["role"], "user");
}

#[test]
fn test_toggle_session_bool_field_ghost_session_rejected() {
    let session_id = "toggle-ghost-test-no-transcript";
    let session_dir = sessions_dir().join(session_id);
    let _ = fs::remove_dir_all(&session_dir);
    fs::create_dir_all(&session_dir).unwrap();

    let meta = serde_json::json!({
        "id": session_id,
        "title": "ghost",
        "message_count": 0,
        "created_at": 0,
        "updated_at": 0,
        "archived": false,
    });
    fs::write(
        session_dir.join("session.json"),
        serde_json::to_string_pretty(&meta).unwrap(),
    )
    .unwrap();

    let result = toggle_session_bool_field(session_id, "archived");
    assert!(
        result.is_err(),
        "should reject toggle when transcript is missing"
    );
    let err = result.unwrap_err();
    assert!(
        err.to_string().contains("session not found"),
        "expected 'session not found', got: {}",
        err
    );

    let _ = fs::remove_dir_all(&session_dir);
}

#[test]
fn test_toggle_session_bool_field_with_transcript() {
    let session_id = "toggle-transcript-test-valid";
    let session_dir = sessions_dir().join(session_id);
    let _ = fs::remove_dir_all(&session_dir);
    fs::create_dir_all(&session_dir).unwrap();
    fs::write(session_dir.join("transcript.jsonl"), "").unwrap();

    let result = toggle_session_bool_field(session_id, "archived");
    assert!(
        result.is_ok(),
        "toggle should succeed when transcript exists"
    );

    let summary = result.unwrap();
    assert!(summary.archived, "archived should be toggled to true");

    let result = toggle_session_bool_field(session_id, "archived");
    assert!(result.is_ok());
    let summary = result.unwrap();
    assert!(
        !summary.archived,
        "archived should be toggled back to false"
    );

    let _ = fs::remove_dir_all(&session_dir);
}

#[test]
fn append_message_persists_attachment_sidecar_for_session_reload() {
    let adapter = JcliAdapter::new();
    let session_id = "attachment-sidecar-test";
    let paths = SessionPaths::new(session_id);
    let _ = fs::remove_dir_all(paths.dir());
    fs::create_dir_all(paths.dir()).unwrap();
    fs::write(paths.transcript(), "").unwrap();

    let attachment = KernelFileAttachment {
        id: "att-1".to_string(),
        filename: "image.png".to_string(),
        media_type: "image/png".to_string(),
        local_path: "image.png".to_string(),
        size: 123,
    };

    adapter
        .append_message(crate::kernel::chat::KernelAppendMessage {
            session_id,
            role: "user",
            content: "hello",
            reasoning: None,
            attachments: Some(std::slice::from_ref(&attachment)),
        })
        .unwrap();

    let events = adapter.get_session(session_id).unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].attachments.as_ref(), Some(&vec![attachment]));

    let _ = fs::remove_dir_all(paths.dir());
}
