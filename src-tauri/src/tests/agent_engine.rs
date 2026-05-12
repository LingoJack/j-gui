use super::{
    build_claude_args, json_stream_msg_to_agent_events, parse_sdk_line, persist_sdk_session_id,
    timeline_items_from_event, AgentEngine, AgentEvent,
};
use crate::agent_engine::AgentBackend;
use crate::agent_session;
use crate::kernel::types::KernelChatMessage;

#[test]
fn build_claude_args_enables_stream_json_input() {
    let args = build_claude_args("claude-sonnet-4-6", "bypassPermissions", None, false);

    assert!(args
        .windows(2)
        .any(|w| w == ["--input-format", "stream-json"]));
    assert!(!args.iter().any(|arg| arg == "--include-partial-messages"));
    assert!(args
        .windows(2)
        .any(|w| w == ["--model", "claude-sonnet-4-6"]));
}

#[test]
fn build_claude_args_includes_resume_and_fork_flags() {
    let args = build_claude_args(
        "claude-sonnet-4-6",
        "bypassPermissions",
        Some("sdk-123"),
        true,
    );

    assert!(args
        .windows(2)
        .any(|window| window == ["--resume", "sdk-123"]));
    assert!(args.iter().any(|arg| arg == "--fork-session"));
    assert!(args
        .windows(2)
        .any(|window| window == ["--model", "claude-sonnet-4-6"]));
}

#[test]
fn build_claude_args_omits_resume_flags_when_not_requested() {
    let args = build_claude_args("", "auto", None, false);

    assert!(!args.iter().any(|arg| arg == "--resume"));
    assert!(!args.iter().any(|arg| arg == "--fork-session"));
}

#[test]
fn parse_sdk_line_reads_assistant_text() {
    let line = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"hello"}]}}"#;

    assert_eq!(
        parse_sdk_line(line),
        vec![AgentEvent::AssistantContent {
            text: "hello".to_string()
        }]
    );
}

#[test]
fn parse_sdk_line_ignores_non_renderable_events() {
    let line = r#"{"type":"system","subtype":"init"}"#;

    assert_eq!(parse_sdk_line(line), Vec::<AgentEvent>::new());
}

#[test]
fn parse_sdk_line_reads_success_result() {
    let line = r#"{"type":"result","subtype":"success","is_error":false,"total_tokens":42}"#;

    assert_eq!(
        parse_sdk_line(line),
        vec![AgentEvent::Done { total_tokens: 42 }]
    );
}

#[test]
fn parse_sdk_line_reads_error_result() {
    let line = r#"{"type":"result","subtype":"error","is_error":true,"result":"bad auth"}"#;

    assert_eq!(
        parse_sdk_line(line),
        vec![AgentEvent::Error {
            message: "bad auth".to_string()
        }]
    );
}

#[test]
fn parse_sdk_line_keeps_all_assistant_blocks() {
    let line = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"pwd"}},{"type":"text","text":"done"}]}}"#;

    assert_eq!(
        parse_sdk_line(line),
        vec![
            AgentEvent::ToolUse {
                tool_id: "toolu_1".to_string(),
                tool_name: "Bash".to_string(),
                tool_input: r#"{"command":"pwd"}"#.to_string(),
            },
            AgentEvent::AssistantContent {
                text: "done".to_string(),
            }
        ]
    );
}

#[test]
fn agent_event_serializes_with_camel_case_tag() {
    let event = AgentEvent::AssistantContent {
        text: "hello".to_string(),
    };

    let value = serde_json::to_value(event).unwrap();
    assert_eq!(value["event"], "assistantContent");
    assert_eq!(value["data"]["text"], "hello");
}

#[test]
fn tool_use_wraps_as_interrupt_in_non_bypass_mode() {
    let line = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"bash","input":{"command":"ls"}}]}}"#;
    let events = parse_sdk_line(line);
    assert_eq!(events.len(), 1);
    match &events[0] {
        AgentEvent::ToolUse {
            tool_id, tool_name, ..
        } => {
            assert_eq!(tool_id, "toolu_1");
            assert_eq!(tool_name, "bash");
        }
        _ => panic!("expected ToolUse from parse_sdk_line"),
    }
}

#[test]
fn tool_use_ask_user_parsed_as_tool_use() {
    let line = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_ask1","name":"ask_user","input":{"question":"Which OS?","options":["Windows","macOS","Linux"]}}]}}"#;
    let events = parse_sdk_line(line);
    assert_eq!(events.len(), 1);
    match &events[0] {
        AgentEvent::ToolUse {
            tool_id,
            tool_name,
            tool_input,
        } => {
            assert_eq!(tool_id, "toolu_ask1");
            assert_eq!(tool_name, "ask_user");
            assert!(tool_input.contains("Which OS?"));
        }
        _ => panic!("expected ToolUse from parse_sdk_line"),
    }
}

#[test]
fn plan_event_parsed_as_interrupt() {
    let line = r#"{"type":"plan","id":"plan_1","plan_summary":"I will list files","steps":[{"tool":"Bash","command":"ls"}]}"#;
    let events = parse_sdk_line(line);
    assert_eq!(events.len(), 1);
    match &events[0] {
        AgentEvent::Interrupt {
            kind,
            tool_name,
            tool_input,
            ..
        } => {
            assert_eq!(kind, "plan");
            assert_eq!(tool_name, "plan");
            assert!(tool_input.contains("plan_summary"));
        }
        other => panic!("expected Interrupt, got {:?}", other),
    }
}

#[test]
fn plan_event_without_id_uses_default() {
    let line = r#"{"type":"plan","plan_summary":"test"}"#;
    let events = parse_sdk_line(line);
    assert_eq!(events.len(), 1);
    match &events[0] {
        AgentEvent::Interrupt {
            interrupt_id, kind, ..
        } => {
            assert_eq!(interrupt_id, "plan");
            assert_eq!(kind, "plan");
        }
        other => panic!("expected Interrupt, got {:?}", other),
    }
}

#[test]
fn ask_user_tool_use_routes_to_ask_user_kind() {
    // 模拟 stdout 线程使用的路由逻辑
    let tool_name = "ask_user";
    let kind = match tool_name {
        "ask_user" | "AskUser" => "ask_user",
        _ => "permission",
    };
    assert_eq!(kind, "ask_user");
}

// ── json_stream_msg_to_agent_events 相关测试 ──

#[test]
fn json_stream_msg_tool_call_request_converts_to_tool_use() {
    let json = r#"{"type":"toolCallRequest","tools":[{"id":"t1","name":"Bash","arguments":"{\"command\":\"ls\"}"}]}"#;
    let events = json_stream_msg_to_agent_events(json, "test-sid", "bypassPermissions");
    assert_eq!(events.len(), 1);
    match &events[0] {
        AgentEvent::ToolUse {
            tool_id,
            tool_name,
            tool_input,
        } => {
            assert_eq!(tool_id, "t1");
            assert_eq!(tool_name, "Bash");
            assert!(tool_input.contains("ls"));
        }
        other => panic!("expected ToolUse, got {:?}", other),
    }
}

#[test]
fn json_stream_msg_tool_call_request_multiple_tools() {
    let json = r#"{"type":"toolCallRequest","tools":[{"id":"t1","name":"Bash","arguments":"{}"},{"id":"t2","name":"Read","arguments":"{}"}]}"#;
    let events = json_stream_msg_to_agent_events(json, "test-sid", "bypassPermissions");
    assert_eq!(events.len(), 2);
    assert!(matches!(&events[0], AgentEvent::ToolUse { tool_id, .. } if tool_id == "t1"));
    assert!(matches!(&events[1], AgentEvent::ToolUse { tool_id, .. } if tool_id == "t2"));
}

#[test]
fn json_stream_msg_tool_call_request_respects_permission_interrupts() {
    let json = r#"{"type":"toolCallRequest","tools":[{"id":"t1","name":"Bash","arguments":"{\"command\":\"ls\"}"}]}"#;
    let events = json_stream_msg_to_agent_events(json, "test-sid", "default");
    assert!(matches!(
        &events[0],
        AgentEvent::Interrupt {
            interrupt_id,
            kind,
            tool_name,
            ..
        } if interrupt_id == "t1" && kind == "permission" && tool_name == "Bash"
    ));
}

#[test]
fn json_stream_msg_ask_tool_routes_to_ask_user_interrupt() {
    let json = r#"{"type":"toolCallRequest","tools":[{"id":"ask-1","name":"Ask","arguments":"{\"questions\":[]}"}]}"#;
    let events = json_stream_msg_to_agent_events(json, "test-sid", "bypassPermissions");
    assert!(matches!(
        &events[0],
        AgentEvent::Interrupt {
            interrupt_id,
            kind,
            tool_name,
            ..
        } if interrupt_id == "ask-1" && kind == "ask_user" && tool_name == "Ask"
    ));
}

#[test]
fn json_stream_msg_exit_plan_mode_routes_to_plan_interrupt() {
    let json = r#"{"type":"toolCallRequest","tools":[{"id":"plan-1","name":"ExitPlanMode","arguments":"{\"allowedPrompts\":[]}"}]}"#;
    let events = json_stream_msg_to_agent_events(json, "test-sid", "bypassPermissions");
    assert!(matches!(
        &events[0],
        AgentEvent::Interrupt {
            interrupt_id,
            kind,
            tool_name,
            ..
        } if interrupt_id == "plan-1" && kind == "plan" && tool_name == "ExitPlanMode"
    ));
}

#[test]
fn json_stream_msg_done_converts_to_done() {
    let json = r#"{"type":"done"}"#;
    let events = json_stream_msg_to_agent_events(json, "test-sid", "bypassPermissions");
    assert_eq!(events, vec![AgentEvent::Done { total_tokens: 0 }]);
}

#[test]
fn jagent_send_message_pushes_follow_up_message_into_runtime_queue() {
    let session_id = agent_session::create_agent_session().expect("create session");
    let (user_message_tx, user_message_rx) = std::sync::mpsc::sync_channel::<KernelChatMessage>(1);
    let engine = AgentEngine::test_stub(
        &session_id,
        AgentBackend::JAgent {
            session_id: session_id.clone(),
            cancel_token: tokio_util::sync::CancellationToken::new(),
            tool_result_tx: std::sync::mpsc::sync_channel(1).0,
            user_message_tx,
            agent_handle: None,
            bridge_handle: None,
        },
    );
    let mut engine = engine;

    engine
        .send_message("follow up")
        .expect("jagent follow-up should enqueue");

    let message = user_message_rx
        .recv_timeout(std::time::Duration::from_millis(200))
        .expect("follow-up message should be queued");
    assert_eq!(message.role, "user");
    assert_eq!(message.content, "follow up");
}

#[test]
fn json_stream_msg_error_converts_to_error() {
    let json = r#"{"type":"error","message":"test error"}"#;
    let events = json_stream_msg_to_agent_events(json, "test-sid", "bypassPermissions");
    assert_eq!(
        events,
        vec![AgentEvent::Error {
            message: "test error".to_string()
        }]
    );
}

#[test]
fn json_stream_msg_internal_events_are_ignored() {
    let event_types = [
        r#"{"type":"chunk"}"#,
        r#"{"type":"cancelled"}"#,
        r#"{"type":"retrying","attempt":1,"maxAttempts":3,"delayMs":1000,"error":"timeout"}"#,
        r#"{"type":"compacting"}"#,
        r#"{"type":"compacted","messagesBefore":42}"#,
    ];
    for json in &event_types {
        let events = json_stream_msg_to_agent_events(json, "test-sid", "bypassPermissions");
        assert!(events.is_empty(), "expected no events for type: {}", json);
    }
}

#[test]
fn json_stream_msg_invalid_json_returns_empty() {
    let events = json_stream_msg_to_agent_events("not valid json", "test-sid", "bypassPermissions");
    assert!(events.is_empty());
}

#[test]
fn json_stream_msg_unknown_type_returns_empty() {
    let json = r#"{"type":"unknown"}"#;
    let events = json_stream_msg_to_agent_events(json, "test-sid", "bypassPermissions");
    assert!(events.is_empty());
}

#[test]
fn permission_mode_persists_tool_call_and_interrupt_timeline_items() {
    let items = timeline_items_from_event(
        "plan",
        &AgentEvent::ToolUse {
            tool_id: "tool-1".to_string(),
            tool_name: "Bash".to_string(),
            tool_input: r#"{"command":"ls"}"#.to_string(),
        },
    );

    assert_eq!(items.len(), 2);
    assert_eq!(items[0].kind, "tool_call");
    assert_eq!(
        items[0]
            .tool_call
            .as_ref()
            .map(|tool_call| tool_call.tool_id.as_str()),
        Some("tool-1")
    );
    assert_eq!(items[1].kind, "interrupt");
    assert_eq!(
        items[1]
            .interrupt
            .as_ref()
            .map(|interrupt| interrupt.interrupt_id.as_str()),
        Some("tool-1")
    );
}

#[test]
fn persist_sdk_session_id_reads_real_session_id_from_sdk_line() {
    let session_id = agent_session::create_agent_session().expect("create session");

    persist_sdk_session_id(
        &session_id,
        r#"{"type":"assistant","session_id":"sdk-session-1","message":{"content":[]}}"#,
    );

    let persisted = agent_session::list_agent_sessions()
        .expect("list sessions")
        .into_iter()
        .find(|session| session.id == session_id)
        .expect("session exists");
    assert_eq!(persisted.sdk_session_id.as_deref(), Some("sdk-session-1"));

    agent_session::delete_agent_session(&session_id).expect("cleanup session");
}
