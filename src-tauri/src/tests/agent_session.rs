use crate::agent_session::{
    append_timeline_item, create_agent_session, delete_agent_session, generate_item_id,
    get_agent_session, now_millis, toggle_manual_working_agent_session, AgentTimelineItem,
    TestEnvGuard, ToolCallSnapshot,
};

#[test]
fn toggle_manual_working_agent_session_persists_meta() {
    let _guard = TestEnvGuard::new("toggle-manual-working");
    let session_id = create_agent_session().expect("create session");

    let first = toggle_manual_working_agent_session(&session_id).expect("toggle on");
    assert!(first.manual_working);

    let listed = crate::agent_session::list_agent_sessions().expect("list sessions");
    let persisted = listed
        .into_iter()
        .find(|session| session.id == session_id)
        .expect("session should exist");
    assert!(persisted.manual_working);

    let second = toggle_manual_working_agent_session(&session_id).expect("toggle off");
    assert!(!second.manual_working);

    delete_agent_session(&session_id).expect("cleanup session");
}

#[test]
fn append_timeline_item_truncates_oversized_content_before_persist() {
    let _guard = TestEnvGuard::new("append-truncated-content");
    let session_id = create_agent_session().expect("create session");
    let oversized =
        "x".repeat(crate::agent_session::agent_storage_guard::MAX_TRANSCRIPT_ITEM_LENGTH + 8_192);

    append_timeline_item(
        &session_id,
        &AgentTimelineItem {
            id: generate_item_id(),
            kind: "assistant_content".to_string(),
            content: Some(oversized),
            tool_call: None,
            interrupt: None,
            created_at: now_millis(),
        },
    )
    .expect("append timeline item");

    let items = get_agent_session(&session_id).expect("read session");
    let persisted = items
        .first()
        .and_then(|item| item.content.as_deref())
        .expect("persisted content");
    assert!(persisted.contains("内容已截断"));
    assert!(
        persisted.len() < crate::agent_session::agent_storage_guard::MAX_TRANSCRIPT_ITEM_LENGTH
    );

    delete_agent_session(&session_id).expect("cleanup session");
}

#[test]
fn update_tool_call_result_truncates_oversized_tool_output() {
    let _guard = TestEnvGuard::new("truncate-tool-output");
    let session_id = create_agent_session().expect("create session");
    let tool_id = "tool-1";
    append_timeline_item(
        &session_id,
        &AgentTimelineItem {
            id: generate_item_id(),
            kind: "tool_call".to_string(),
            content: None,
            tool_call: Some(ToolCallSnapshot {
                tool_id: tool_id.to_string(),
                tool_name: "Bash".to_string(),
                tool_input: "{\"command\":\"echo test\"}".to_string(),
                tool_output: None,
                status: "running".to_string(),
            }),
            interrupt: None,
            created_at: now_millis(),
        },
    )
    .expect("append tool call");

    crate::agent_session::update_tool_call_result(
        &session_id,
        tool_id,
        &"y".repeat(crate::agent_session::agent_storage_guard::MAX_TRANSCRIPT_ITEM_LENGTH + 4_096),
    )
    .expect("update tool output");

    let items = get_agent_session(&session_id).expect("read session");
    let persisted = items
        .first()
        .and_then(|item| item.tool_call.as_ref())
        .and_then(|tool_call| tool_call.tool_output.as_deref())
        .expect("tool output");
    assert!(persisted.contains("内容已截断"));
    assert!(
        persisted.len() < crate::agent_session::agent_storage_guard::MAX_TRANSCRIPT_ITEM_LENGTH
    );

    delete_agent_session(&session_id).expect("cleanup session");
}
