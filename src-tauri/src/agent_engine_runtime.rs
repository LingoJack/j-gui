use crate::agent_engine::AgentEvent;
use crate::agent_session::{self, AgentTimelineItem, InterruptSnapshot, ToolCallSnapshot};
use tauri::ipc::Channel;

pub(crate) fn which_claude() -> Result<String, String> {
    for name in &["claude", "claude-code", "claude-cli"] {
        let finder = if cfg!(windows) { "where" } else { "which" };
        if let Ok(output) = std::process::Command::new(finder).arg(name).output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if !path.is_empty() {
                    return Ok(path);
                }
            }
        }
        if cfg!(windows) {
            if let Ok(output) = std::process::Command::new("cmd")
                .args(["/c", "where", name])
                .output()
            {
                if output.status.success() {
                    let path = String::from_utf8_lossy(&output.stdout)
                        .lines()
                        .next()
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    if !path.is_empty() {
                        return Ok(path);
                    }
                }
            }
        }
    }
    if cfg!(windows) {
        let appdata_root = std::env::var("APPDATA").unwrap_or_default();
        for name in &["claude.cmd", "claude-code.cmd", "claude-cli.cmd"] {
            let p = std::path::PathBuf::from(&appdata_root)
                .join("npm")
                .join(name);
            if p.exists() {
                return Ok(p.to_string_lossy().to_string());
            }
        }
        for name in &["claude", "claude-code"] {
            let p = std::path::PathBuf::from(&appdata_root)
                .join("npm")
                .join(format!("{}.cmd", name));
            if p.exists() {
                return Ok(p.to_string_lossy().to_string());
            }
        }
    }
    Err("未找到 claude CLI。请先按项目约束安装 Claude Code CLI，并确保其 Windows 全局 shim 目录已加入 PATH。".to_string())
}

pub(crate) fn forward_cli_event(
    on_event: &Channel<AgentEvent>,
    session_id: &str,
    mode: &str,
    event: AgentEvent,
) -> bool {
    let timeline_items = timeline_items_from_event(mode, &event);
    let event = map_cli_event(mode, event);
    let tool_result_update = tool_result_update_from_event(&event);
    if on_event.send(event).is_err() {
        return false;
    }
    persist_tool_result_update(session_id, tool_result_update);
    persist_timeline_items(session_id, timeline_items);
    true
}

fn map_cli_event(mode: &str, event: AgentEvent) -> AgentEvent {
    match event {
        AgentEvent::ToolUse {
            tool_id,
            tool_name,
            tool_input,
        } if mode != "bypassPermissions" => AgentEvent::Interrupt {
            interrupt_id: tool_id,
            kind: interrupt_kind(&tool_name).to_string(),
            tool_name,
            tool_input,
        },
        other => other,
    }
}

fn interrupt_kind(tool_name: &str) -> &'static str {
    match tool_name {
        "ask_user" | "AskUser" => "ask_user",
        _ => "permission",
    }
}

pub(crate) fn timeline_items_from_event(mode: &str, event: &AgentEvent) -> Vec<AgentTimelineItem> {
    match event {
        AgentEvent::ToolUse {
            tool_id,
            tool_name,
            tool_input,
        } => {
            let mut items = vec![tool_call_timeline_item(tool_id, tool_name, tool_input)];
            if mode != "bypassPermissions" {
                items.push(interrupt_timeline_item(
                    tool_id,
                    interrupt_kind(tool_name),
                    tool_name,
                    tool_input,
                ));
            }
            items
        }
        AgentEvent::AssistantContent { text } => vec![AgentTimelineItem {
            id: agent_session::generate_item_id(),
            kind: "assistant_content".into(),
            content: Some(text.clone()),
            tool_call: None,
            interrupt: None,
            created_at: agent_session::now_millis(),
        }],
        AgentEvent::Interrupt {
            interrupt_id,
            kind,
            tool_name,
            tool_input,
        } => vec![interrupt_timeline_item(
            interrupt_id,
            kind,
            tool_name,
            tool_input,
        )],
        AgentEvent::Done { .. }
        | AgentEvent::ToolResult { .. }
        | AgentEvent::Error { .. }
        | AgentEvent::Cancelled
        | AgentEvent::Compacting
        | AgentEvent::CompactComplete
        | AgentEvent::ModelResolved { .. }
        | AgentEvent::Retrying { .. } => Vec::new(),
    }
}

fn tool_call_timeline_item(tool_id: &str, tool_name: &str, tool_input: &str) -> AgentTimelineItem {
    AgentTimelineItem {
        id: agent_session::generate_item_id(),
        kind: "tool_call".into(),
        content: None,
        tool_call: Some(ToolCallSnapshot {
            tool_id: tool_id.to_string(),
            tool_name: tool_name.to_string(),
            tool_input: tool_input.to_string(),
            tool_output: None,
            status: "running".into(),
        }),
        interrupt: None,
        created_at: agent_session::now_millis(),
    }
}

fn interrupt_timeline_item(
    interrupt_id: &str,
    kind: &str,
    tool_name: &str,
    tool_input: &str,
) -> AgentTimelineItem {
    AgentTimelineItem {
        id: agent_session::generate_item_id(),
        kind: "interrupt".into(),
        content: None,
        interrupt: Some(InterruptSnapshot {
            interrupt_id: interrupt_id.to_string(),
            kind: kind.to_string(),
            tool_name: tool_name.to_string(),
            tool_input: tool_input.to_string(),
            response: None,
        }),
        tool_call: None,
        created_at: agent_session::now_millis(),
    }
}

fn tool_result_update_from_event(event: &AgentEvent) -> Option<(String, String)> {
    match event {
        AgentEvent::ToolResult { tool_id, content } => Some((tool_id.clone(), content.clone())),
        _ => None,
    }
}

fn persist_tool_result_update(session_id: &str, update: Option<(String, String)>) {
    let Some((tool_id, content)) = update else {
        return;
    };
    if let Err(err) = agent_session::update_tool_call_result(session_id, &tool_id, &content) {
        eprintln!(
            "[AgentEngine::update_tool_call_result] session_id={}, tool_id={}, error={}",
            session_id, tool_id, err
        );
    }
}

fn persist_timeline_items(session_id: &str, items: Vec<AgentTimelineItem>) {
    for item in items {
        if let Err(err) = agent_session::append_timeline_item(session_id, &item) {
            eprintln!(
                "[AgentEngine::append_timeline_item] session_id={}, item_id={}, kind={}, error={}",
                session_id, item.id, item.kind, err
            );
        }
    }
}

pub(crate) fn persist_sdk_session_id(session_id: &str, line: &str) {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
        return;
    };
    let sdk_session_id = value["session_id"]
        .as_str()
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);
    if sdk_session_id.is_none() {
        return;
    }
    if let Err(err) = agent_session::set_session_sdk_session_id(session_id, sdk_session_id) {
        eprintln!(
            "[AgentEngine::set_session_sdk_session_id] session_id={}, error={}",
            session_id, err
        );
    }
}
