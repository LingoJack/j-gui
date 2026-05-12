use super::*;
use crate::agent_engine::AgentBackend;

// ── AgentInterruptResponse 相关测试 ──

#[test]
fn deserializes_permission_response() {
    let value = serde_json::json!({
        "kind": "permission",
        "allowed": true,
        "alwaysAllow": true,
    });

    let parsed: AgentInterruptResponse = serde_json::from_value(value).unwrap();
    match parsed {
        AgentInterruptResponse::Permission {
            allowed,
            always_allow,
        } => {
            assert!(allowed);
            assert!(always_allow);
        }
        _ => panic!("expected permission response"),
    }
}

#[test]
fn deserializes_ask_user_response() {
    let value = serde_json::json!({
        "kind": "askUser",
        "selectedOptions": ["A", "B"],
        "customText": "hello",
    });

    let parsed: AgentInterruptResponse = serde_json::from_value(value).unwrap();
    match parsed {
        AgentInterruptResponse::AskUser {
            selected_options,
            custom_text,
            ..
        } => {
            assert_eq!(selected_options, vec!["A", "B"]);
            assert_eq!(custom_text.as_deref(), Some("hello"));
        }
        _ => panic!("expected ask_user response"),
    }
}

#[test]
fn deserializes_plan_response() {
    let value = serde_json::json!({
        "kind": "plan",
        "decision": "approve_and_run",
        "feedback": "ok",
    });

    let parsed: AgentInterruptResponse = serde_json::from_value(value).unwrap();
    match parsed {
        AgentInterruptResponse::Plan { decision, feedback } => {
            assert_eq!(decision, "approve_and_run");
            assert_eq!(feedback.as_deref(), Some("ok"));
        }
        _ => panic!("expected plan response"),
    }
}

// ── PermissionRequest 相关测试 ──

#[test]
fn deserializes_permission_request_approve() {
    let value = serde_json::json!({
        "sessionId": "abc-123",
        "interruptId": "toolu_01",
        "decision": "approve",
    });

    let req: PermissionRequest = serde_json::from_value(value).unwrap();
    assert_eq!(req.session_id, "abc-123");
    assert_eq!(req.interrupt_id, "toolu_01");
    assert_eq!(req.decision, "approve");
}

#[test]
fn deserializes_permission_request_deny() {
    let value = serde_json::json!({
        "sessionId": "abc-123",
        "interruptId": "toolu_02",
        "decision": "deny",
    });

    let req: PermissionRequest = serde_json::from_value(value).unwrap();
    assert_eq!(req.session_id, "abc-123");
    assert_eq!(req.interrupt_id, "toolu_02");
    assert_eq!(req.decision, "deny");
}

#[test]
fn deserializes_permission_request_approve_always() {
    let value = serde_json::json!({
        "sessionId": "abc-123",
        "interruptId": "toolu_03",
        "decision": "approve_always",
    });

    let req: PermissionRequest = serde_json::from_value(value).unwrap();
    assert_eq!(req.decision, "approve_always");
}

#[test]
fn respond_permission_maps_decision_to_content() {
    let mappings = [
        ("approve", "approved"),
        ("approve_always", "always_approved"),
        ("deny", "denied"),
    ];
    for (decision, expected) in mappings {
        let actual = match decision {
            "approve" => "approved",
            "approve_always" => "always_approved",
            "deny" => "denied",
            _ => unreachable!(),
        };
        assert_eq!(
            actual, expected,
            "mapping for '{}' should be '{}'",
            decision, expected
        );
    }
}

// ── AskUserRequest / AskUserAnswer 相关测试 ──

#[test]
fn deserializes_ask_user_request_single_answer() {
    let value = serde_json::json!({
        "sessionId": "abc-123",
        "interruptId": "toolu_ask1",
        "answers": [{
            "questionId": "q1",
            "selectedOptions": ["Option A", "Option B"],
            "customText": "extra note",
        }],
    });

    let req: AskUserRequest = serde_json::from_value(value).unwrap();
    assert_eq!(req.session_id, "abc-123");
    assert_eq!(req.interrupt_id, "toolu_ask1");
    assert_eq!(req.answers.len(), 1);
    assert_eq!(req.answers[0].question_id, "q1");
    assert_eq!(
        req.answers[0].selected_options,
        vec!["Option A", "Option B"]
    );
    assert_eq!(req.answers[0].custom_text.as_deref(), Some("extra note"));
}

#[test]
fn deserializes_ask_user_answer_with_defaults() {
    let value = serde_json::json!({
        "questionId": "q1",
    });

    let answer: AskUserAnswer = serde_json::from_value(value).unwrap();
    assert_eq!(answer.question_id, "q1");
    assert!(answer.selected_options.is_empty());
    assert!(answer.custom_text.is_none());
}

#[test]
fn deserializes_ask_user_request_multiple_answers() {
    let value = serde_json::json!({
        "sessionId": "abc-123",
        "interruptId": "toolu_ask2",
        "answers": [
            {"questionId": "q1", "selectedOptions": ["A"]},
            {"questionId": "q2", "selectedOptions": ["B", "C"], "customText": "note"},
        ],
    });

    let req: AskUserRequest = serde_json::from_value(value).unwrap();
    assert_eq!(req.answers.len(), 2);
    assert_eq!(req.answers[0].question_id, "q1");
    assert_eq!(req.answers[1].question_id, "q2");
    assert_eq!(req.answers[1].selected_options, vec!["B", "C"]);
}

#[test]
fn ask_user_content_json_includes_answers() {
    let answers = vec![
        AskUserAnswer {
            question_id: "q1".into(),
            selected_options: vec!["A".into()],
            custom_text: Some("extra".into()),
        },
        AskUserAnswer {
            question_id: "q2".into(),
            selected_options: vec!["B".into(), "C".into()],
            custom_text: None,
        },
    ];

    let content = serde_json::json!({
        "answers": answers.iter().map(|a| serde_json::json!({
            "question_id": a.question_id,
            "selected_options": a.selected_options,
            "custom_text": a.custom_text,
        })).collect::<Vec<_>>(),
    });

    let arr = content["answers"].as_array().unwrap();
    assert_eq!(arr.len(), 2);
    assert_eq!(arr[0]["question_id"], "q1");
    assert_eq!(arr[0]["selected_options"][0], "A");
    assert_eq!(arr[0]["custom_text"], "extra");
    assert_eq!(arr[1]["custom_text"], serde_json::Value::Null);
}

// ── UpdateSessionTitle 相关测试 ──

#[test]
fn deserializes_update_session_title_request() {
    let value = serde_json::json!({
        "sessionId": "abc-123",
        "title": "My Session",
    });

    let req: UpdateSessionTitleRequest = serde_json::from_value(value).unwrap();
    assert_eq!(req.session_id, "abc-123");
    assert_eq!(req.title, "My Session");
}

#[test]
fn serializes_update_session_title_result() {
    let result = UpdateSessionTitleResult {
        session_id: "abc-123".into(),
        title: "My Session".into(),
    };

    let json = serde_json::to_value(result).unwrap();
    assert_eq!(json["sessionId"], "abc-123");
    assert_eq!(json["title"], "My Session");
}

#[test]
fn send_agent_message_request_session_id_round_trips() {
    let value = serde_json::json!({
        "sessionId": "abc-123",
        "userMessage": "hello",
    });

    let req: AgentSendMessageRequest = serde_json::from_value(value).unwrap();
    assert_eq!(req.session_id, "abc-123");
    assert_eq!(req.user_message, "hello");
}

#[test]
fn insert_runtime_replaces_finished_slot_but_rejects_running_slot() {
    let session_id = "session-1";
    let mut runtimes = std::collections::HashMap::new();

    let finished_engine = AgentEngine::test_stub(
        session_id,
        AgentBackend::JAgent {
            session_id: session_id.to_string(),
            cancel_token: tokio_util::sync::CancellationToken::new(),
            tool_result_tx: std::sync::mpsc::sync_channel(1).0,
            user_message_tx: std::sync::mpsc::sync_channel(1).0,
            agent_handle: None,
            bridge_handle: None,
        },
    );
    insert_runtime(&mut runtimes, session_id, finished_engine).expect("first insert");

    let replacement_engine = AgentEngine::test_stub(
        session_id,
        AgentBackend::JAgent {
            session_id: session_id.to_string(),
            cancel_token: tokio_util::sync::CancellationToken::new(),
            tool_result_tx: std::sync::mpsc::sync_channel(1).0,
            user_message_tx: std::sync::mpsc::sync_channel(1).0,
            agent_handle: None,
            bridge_handle: None,
        },
    );
    insert_runtime(&mut runtimes, session_id, replacement_engine).expect("replace finished");
    assert_eq!(runtimes.len(), 1);

    let running_engine = AgentEngine::test_stub(
        session_id,
        AgentBackend::JAgent {
            session_id: session_id.to_string(),
            cancel_token: tokio_util::sync::CancellationToken::new(),
            tool_result_tx: std::sync::mpsc::sync_channel(1).0,
            user_message_tx: std::sync::mpsc::sync_channel(1).0,
            agent_handle: Some(std::thread::spawn(|| {
                std::thread::sleep(std::time::Duration::from_millis(50))
            })),
            bridge_handle: Some(std::thread::spawn(|| {
                std::thread::sleep(std::time::Duration::from_millis(50))
            })),
        },
    );
    runtimes.insert(session_id.to_string(), running_engine);

    let another_engine = AgentEngine::test_stub(
        session_id,
        AgentBackend::JAgent {
            session_id: session_id.to_string(),
            cancel_token: tokio_util::sync::CancellationToken::new(),
            tool_result_tx: std::sync::mpsc::sync_channel(1).0,
            user_message_tx: std::sync::mpsc::sync_channel(1).0,
            agent_handle: None,
            bridge_handle: None,
        },
    );
    let err = insert_runtime(&mut runtimes, session_id, another_engine)
        .expect_err("should reject running slot");
    assert!(err.contains("已在运行中"));
}

#[test]
fn ensure_runtime_idle_rejects_running_session() {
    let session_id = "session-1";
    let mut runtimes = std::collections::HashMap::new();
    runtimes.insert(
        session_id.to_string(),
        AgentEngine::test_stub(
            session_id,
            AgentBackend::JAgent {
                session_id: session_id.to_string(),
                cancel_token: tokio_util::sync::CancellationToken::new(),
                tool_result_tx: std::sync::mpsc::sync_channel(1).0,
                user_message_tx: std::sync::mpsc::sync_channel(1).0,
                agent_handle: Some(std::thread::spawn(|| {
                    std::thread::sleep(std::time::Duration::from_millis(50))
                })),
                bridge_handle: Some(std::thread::spawn(|| {
                    std::thread::sleep(std::time::Duration::from_millis(50))
                })),
            },
        ),
    );

    let err = ensure_runtime_idle(&mut runtimes, session_id)
        .expect_err("running session should reject rewind/fork style operations");
    assert!(err.contains("仍在运行中"));
}

#[test]
fn ensure_runtime_idle_allows_finished_session() {
    let session_id = "session-1";
    let mut runtimes = std::collections::HashMap::new();
    runtimes.insert(
        session_id.to_string(),
        AgentEngine::test_stub(
            session_id,
            AgentBackend::JAgent {
                session_id: session_id.to_string(),
                cancel_token: tokio_util::sync::CancellationToken::new(),
                tool_result_tx: std::sync::mpsc::sync_channel(1).0,
                user_message_tx: std::sync::mpsc::sync_channel(1).0,
                agent_handle: None,
                bridge_handle: None,
            },
        ),
    );

    ensure_runtime_idle(&mut runtimes, session_id)
        .expect("finished session should allow rewind/fork style operations");
    assert!(
        !runtimes.contains_key(session_id),
        "finished runtime should be pruned before the operation proceeds"
    );
}

#[test]
fn resolve_cli_resume_state_prefers_current_sdk_session() {
    let session_id = crate::agent_session::create_agent_session().expect("create session");
    crate::agent_session::set_session_sdk_session_id(&session_id, Some("sdk-current".to_string()))
        .expect("persist sdk session id");

    let state = resolve_cli_resume_state(&session_id).expect("resolve resume state");
    assert_eq!(
        state,
        CliResumeState {
            resume_session_id: Some("sdk-current".to_string()),
            fork_session: false,
        }
    );
}

#[test]
fn resolve_cli_resume_state_uses_source_session_for_forks() {
    let source_id = crate::agent_session::create_agent_session().expect("create source session");
    crate::agent_session::set_session_sdk_session_id(&source_id, Some("sdk-source".to_string()))
        .expect("persist source sdk session id");

    let forked = crate::agent_session::fork_agent_session(&source_id, None).expect("fork session");
    let state = resolve_cli_resume_state(&forked.id).expect("resolve fork resume state");
    assert_eq!(
        state,
        CliResumeState {
            resume_session_id: Some("sdk-source".to_string()),
            fork_session: true,
        }
    );
}
