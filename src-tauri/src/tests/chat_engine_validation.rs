use super::*;

#[test]
fn validate_request_rejects_unsupported_fields() {
    let mut req = request(Some("channel-a"), Some("model-a1"));
    req.context_dividers = Some(json!(["divider-1"]));
    let err =
        ChatEngine::validate_send_message_request(&req).expect_err("unsupported fields must fail");
    assert!(err.contains("contextDividers"));
}

#[test]
fn validate_request_allows_default_noop_fields() {
    let mut req = request(Some("channel-a"), Some("model-a1"));
    req.context_length = Some(json!("infinite"));
    req.context_dividers = Some(json!([]));
    req.attachments = Some(json!([]));
    req.thinking_enabled = Some(json!(false));
    req.enabled_tool_ids = Some(json!([]));
    ChatEngine::validate_send_message_request(&req)
        .expect("default no-op fields should be allowed");
}

#[test]
fn validate_request_allows_thinking_enabled() {
    let mut req = request(Some("channel-a"), Some("model-a1"));
    req.thinking_enabled = Some(json!(true));
    ChatEngine::validate_send_message_request(&req)
        .expect("thinkingEnabled should be forwarded to the backend kernel");
}

#[test]
fn validate_request_allows_numeric_context_length() {
    let mut req = request(Some("channel-a"), Some("model-a1"));
    req.context_length = Some(json!(5));
    ChatEngine::validate_send_message_request(&req)
        .expect("contextLength should be forwarded to the backend kernel");
}

#[test]
fn validate_request_rejects_invalid_context_length() {
    let mut req = request(Some("channel-a"), Some("model-a1"));
    req.context_length = Some(json!(-1));
    let err = ChatEngine::validate_send_message_request(&req)
        .expect_err("negative contextLength should fail validation");
    assert!(err.contains("contextLength"));
}

#[test]
fn validate_request_rejects_invalid_thinking_enabled_type() {
    let mut req = request(Some("channel-a"), Some("model-a1"));
    req.thinking_enabled = Some(json!("yes"));
    let err = ChatEngine::validate_send_message_request(&req)
        .expect_err("string thinkingEnabled should fail validation");
    assert!(err.contains("thinkingEnabled"));
}

#[test]
fn validate_request_allows_image_attachments() {
    let mut req = request(Some("channel-a"), Some("model-a1"));
    req.attachments = Some(json!([{
        "id": "att-1",
        "filename": "image.png",
        "mediaType": "image/png",
        "localPath": "image.png",
        "size": 123
    }]));
    ChatEngine::validate_send_message_request(&req)
        .expect("image attachments should be forwarded to the backend kernel");
}

#[test]
fn validate_request_rejects_non_image_attachments() {
    let mut req = request(Some("channel-a"), Some("model-a1"));
    req.attachments = Some(json!([{
        "id": "att-1",
        "filename": "notes.txt",
        "mediaType": "text/plain",
        "localPath": "notes.txt",
        "size": 123
    }]));
    let err = ChatEngine::validate_send_message_request(&req)
        .expect_err("non-image attachments should be rejected");
    assert!(err.contains("image/*"));
}
