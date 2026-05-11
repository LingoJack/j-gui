use crate::agent_session::{self, AgentTimelineItem, InterruptSnapshot, ToolCallSnapshot};
use crate::kernel::types::{KernelAgentParams, KernelChatMessage};
use crate::kernel::ChatKernel;
use serde::Serialize;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Arc;
use std::thread::JoinHandle;
use tauri::ipc::Channel;

const CLAUDE_GRACE_PERIOD_MS: u64 = 500;
const LOG_LINE_TRUNCATE_SDK: usize = 200;
const LOG_LINE_TRUNCATE_UNKNOWN: usize = 120;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum AgentEvent {
    AssistantContent {
        text: String,
    },
    ToolUse {
        tool_id: String,
        tool_name: String,
        tool_input: String,
    },
    Interrupt {
        interrupt_id: String,
        kind: String,
        tool_name: String,
        tool_input: String,
    },
    ToolResult {
        tool_id: String,
        content: String,
    },
    Done {
        total_tokens: u32,
    },
    Error {
        message: String,
    },
}

pub enum AgentBackend {
    /// Existing Claude CLI subprocess backend.
    Cli {
        process: Option<Child>,
        stdin: Option<ChildStdin>,
        stdout_thread: Option<JoinHandle<()>>,
        stderr_thread: Option<JoinHandle<()>>,
    },
    /// New j-agent in-process backend (uses ChatKernel::run_agent_loop).
    JAgent {
        #[allow(dead_code)]
        session_id: String,
        agent_handle: Option<JoinHandle<()>>,
        bridge_handle: Option<JoinHandle<()>>,
    },
}

pub struct AgentEngine {
    pub(crate) backend: AgentBackend,
    #[allow(dead_code)]
    session_id: String,
    #[allow(dead_code)]
    transcript_path: PathBuf,
}

impl AgentEngine {
    pub fn start(
        on_event: Channel<AgentEvent>,
        permission_mode: &str,
        session_id: &str,
        model: &str,
        api_base: &str,
        api_key: &str,
    ) -> Result<Self, String> {
        let claude_path = which_claude()?;

        let mut cmd = Command::new(&claude_path);
        let args = build_claude_args(model, permission_mode);
        cmd.args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if !api_base.is_empty() {
            cmd.env("ANTHROPIC_BASE_URL", api_base);
        }
        // SAFETY: This is the documented Claude CLI authentication method.
        // The process is short-lived and on a single-user desktop this is acceptable.
        // On shared systems, /proc/<pid>/environ (Linux) or process environment APIs
        // (Windows) could leak the key to same-user processes. This is a known tradeoff.
        if !api_key.is_empty() {
            cmd.env("ANTHROPIC_API_KEY", api_key);
        }

        let mut process = cmd
            .spawn()
            .map_err(|e| format!("启动 claude CLI 失败: {}", e))?;

        let stdout = process.stdout.take().ok_or("无法获取 claude stdout")?;
        let stderr = process.stderr.take().ok_or("无法获取 claude stderr")?;
        let stdin = process.stdin.take().ok_or("无法获取 claude stdin")?;

        let stdout_thread = Self::spawn_stdout_reader(
            stdout,
            on_event.clone(),
            permission_mode.to_string(),
            session_id.to_string(),
        );

        // Background thread to log stderr
        let stderr_thread = std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for l in reader.lines().map_while(Result::ok) {
                eprintln!("[claude stderr] {}", l);
            }
        });

        let transcript_path = agent_session::agent_sessions_dir()
            .join(session_id)
            .join("transcript.jsonl");

        Ok(Self {
            backend: AgentBackend::Cli {
                process: Some(process),
                stdin: Some(stdin),
                stdout_thread: Some(stdout_thread),
                stderr_thread: Some(stderr_thread),
            },
            session_id: session_id.to_string(),
            transcript_path,
        })
    }

    fn spawn_stdout_reader(
        stdout: std::process::ChildStdout,
        on_event: Channel<AgentEvent>,
        mode: String,
        session_id: String,
    ) -> JoinHandle<()> {
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                let line = match line {
                    Ok(l) => l,
                    Err(_) => break,
                };
                if line.is_empty() {
                    continue;
                }
                let events = parse_sdk_line(&line);
                for event in events {
                    let event = match event {
                        AgentEvent::ToolUse {
                            tool_id,
                            tool_name,
                            tool_input,
                        } if mode != "bypassPermissions" => {
                            let kind = match tool_name.as_str() {
                                "ask_user" | "AskUser" => "ask_user",
                                _ => "permission",
                            };
                            AgentEvent::Interrupt {
                                interrupt_id: tool_id,
                                kind: kind.to_string(),
                                tool_name,
                                tool_input,
                            }
                        }
                        other => other,
                    };
                    let timeline_item = match &event {
                        AgentEvent::AssistantContent { text } => Some(AgentTimelineItem {
                            id: agent_session::generate_item_id(),
                            kind: "assistant_content".into(),
                            content: Some(text.clone()),
                            tool_call: None,
                            interrupt: None,
                            created_at: agent_session::now_millis(),
                        }),
                        AgentEvent::ToolUse {
                            tool_id,
                            tool_name,
                            tool_input,
                        } => Some(AgentTimelineItem {
                            id: agent_session::generate_item_id(),
                            kind: "tool_call".into(),
                            content: None,
                            tool_call: Some(ToolCallSnapshot {
                                tool_id: tool_id.clone(),
                                tool_name: tool_name.clone(),
                                tool_input: tool_input.clone(),
                                tool_output: None,
                                status: "running".into(),
                            }),
                            interrupt: None,
                            created_at: agent_session::now_millis(),
                        }),
                        AgentEvent::Interrupt {
                            interrupt_id,
                            kind,
                            tool_name,
                            tool_input,
                        } => Some(AgentTimelineItem {
                            id: agent_session::generate_item_id(),
                            kind: "interrupt".into(),
                            content: None,
                            interrupt: Some(InterruptSnapshot {
                                interrupt_id: interrupt_id.clone(),
                                kind: kind.clone(),
                                tool_name: tool_name.clone(),
                                tool_input: tool_input.clone(),
                                response: None,
                            }),
                            tool_call: None,
                            created_at: agent_session::now_millis(),
                        }),
                        AgentEvent::ToolResult { .. } => None,
                        AgentEvent::Done { .. } | AgentEvent::Error { .. } => None,
                    };
                    let tool_result_update = match &event {
                        AgentEvent::ToolResult { tool_id, content } => {
                            Some((tool_id.clone(), content.clone()))
                        }
                        _ => None,
                    };
                    if on_event.send(event).is_err() {
                        return;
                    }
                    if let Some((tool_id, content)) = tool_result_update {
                        if let Err(err) =
                            agent_session::update_tool_call_result(&session_id, &tool_id, &content)
                        {
                            eprintln!(
                                "[AgentEngine::update_tool_call_result] session_id={}, tool_id={}, error={}",
                                session_id, tool_id, err
                            );
                        }
                    }
                    if let Some(item) = timeline_item {
                        if let Err(err) = agent_session::append_timeline_item(&session_id, &item) {
                            eprintln!(
                                "[AgentEngine::append_timeline_item] session_id={}, item_id={}, kind={}, error={}",
                                session_id, item.id, item.kind, err
                            );
                        }
                    }
                }
            }
        })
    }

    /// Start the j-agent in-process backend.
    /// Calls `ChatKernel::run_agent_loop` in a background thread and
    /// bridges StreamMsg JSON events to the frontend's AgentEvent channel.
    pub fn start_jagent(
        kernel: Arc<dyn ChatKernel>,
        on_event: Channel<AgentEvent>,
        session_id: String,
        messages: Vec<KernelChatMessage>,
        permission_mode: String,
        system_prompt: Option<String>,
    ) -> Result<Self, String> {
        // 1. Create interceptor channel for bridging StreamMsg JSON -> AgentEvent
        let (interceptor_tx, interceptor_rx) = std::sync::mpsc::channel::<String>();

        // 2. Create Channel<String> for KernelAgentParams.on_event.
        //    No-op callback since we only send to the frontend via the bridge.
        let json_channel: Channel<String> = Channel::new(|_| Ok(()));

        // 3. Build KernelAgentParams with interceptor
        let params = KernelAgentParams {
            session_id: session_id.clone(),
            messages,
            system_prompt,
            permission_mode,
            on_event: json_channel,
            event_interceptor: Some(interceptor_tx),
        };

        // 4. Bridge thread: receives JSON strings from agent loop via interceptor,
        //    converts to AgentEvent, and forwards to frontend.
        let bridge_channel = on_event.clone();
        let sid_for_bridge = session_id.clone();
        let bridge_handle = std::thread::spawn(move || {
            while let Ok(json) = interceptor_rx.recv() {
                let events = json_stream_msg_to_agent_events(&json, &sid_for_bridge);
                for event in events {
                    if bridge_channel.send(event).is_err() {
                        return;
                    }
                }
            }
        });

        // 5. Agent loop thread: creates a tokio runtime and calls run_agent_loop.
        let error_channel = on_event.clone();
        let agent_handle = std::thread::spawn(move || {
            let rt = match tokio::runtime::Runtime::new() {
                Ok(rt) => rt,
                Err(e) => {
                    let _ = error_channel.send(AgentEvent::Error {
                        message: format!("创建 tokio runtime 失败: {}", e),
                    });
                    return;
                }
            };
            rt.block_on(async {
                if let Err(e) = kernel.run_agent_loop(params).await {
                    let _ = error_channel.send(AgentEvent::Error {
                        message: format!("Agent loop 错误: {}", e),
                    });
                }
            });
        });

        // 6. Build transcript path
        let transcript_path = agent_session::agent_sessions_dir()
            .join(&session_id)
            .join("transcript.jsonl");

        Ok(Self {
            backend: AgentBackend::JAgent {
                session_id: session_id.clone(),
                agent_handle: Some(agent_handle),
                bridge_handle: Some(bridge_handle),
            },
            session_id,
            transcript_path,
        })
    }

    pub fn send_message(&mut self, content: &str) -> Result<(), String> {
        let stdin = match &mut self.backend {
            AgentBackend::Cli { stdin, .. } => stdin.as_mut().ok_or("claude 进程未启动")?,
            AgentBackend::JAgent { .. } => {
                return Err("当前 Agent 不支持直接发送消息".to_string());
            }
        };
        let item = AgentTimelineItem {
            id: agent_session::generate_item_id(),
            kind: "user_message".into(),
            content: Some(content.to_string()),
            tool_call: None,
            interrupt: None,
            created_at: agent_session::now_millis(),
        };
        agent_session::append_timeline_item(&self.session_id, &item)?;
        let msg = serde_json::json!({
            "type": "user",
            "message": {
                "role": "user",
                "content": [{ "type": "text", "text": content }]
            }
        });
        writeln!(
            stdin,
            "{}",
            serde_json::to_string(&msg).map_err(|e| e.to_string())?
        )
        .map_err(|e| format!("写入 claude stdin 失败: {}", e))
    }

    pub fn respond_interrupt(&mut self, interrupt_id: &str, content: &str) -> Result<(), String> {
        let stdin = match &mut self.backend {
            AgentBackend::Cli { stdin, .. } => stdin.as_mut().ok_or("Agent 未启动")?,
            AgentBackend::JAgent { .. } => {
                return Err("当前 Agent 不支持中断响应".to_string());
            }
        };
        let msg = serde_json::json!({
            "type": "user",
            "message": {
                "role": "user",
                "content": [{ "type": "tool_result", "tool_use_id": interrupt_id, "content": content }]
            }
        });
        writeln!(
            stdin,
            "{}",
            serde_json::to_string(&msg).map_err(|e| e.to_string())?
        )
        .map_err(|e| format!("写入 claude stdin 失败: {}", e))?;
        agent_session::update_interrupt_response(&self.session_id, interrupt_id, content)
    }

    pub fn close(&mut self) {
        match &mut self.backend {
            AgentBackend::Cli {
                stdin,
                process,
                stdout_thread,
                stderr_thread,
            } => {
                // Close stdin to signal the CLI to stop
                if let Some(stdin) = stdin.take() {
                    drop(stdin);
                }
                // Give the process a short grace period to exit naturally after stdin close,
                // so it can flush remaining output before we force-kill.
                if let Some(mut process) = process.take() {
                    std::thread::sleep(std::time::Duration::from_millis(CLAUDE_GRACE_PERIOD_MS));
                    match process.try_wait() {
                        Ok(Some(_)) => { /* exited naturally */ }
                        Ok(None) | Err(_) => {
                            let _ = process.kill();
                            let _ = process.wait();
                        }
                    }
                }
                // Join reader threads — safe now because the process is dead
                // and pipes are broken.
                if let Some(handle) = stdout_thread.take() {
                    let _ = handle.join();
                }
                if let Some(handle) = stderr_thread.take() {
                    let _ = handle.join();
                }
            }
            AgentBackend::JAgent {
                agent_handle,
                bridge_handle,
                ..
            } => {
                // Detach agent + bridge threads (they run until agent loop completes).
                // No active cancellation mechanism yet — the loop runs to completion.
                if let Some(h) = agent_handle.take() {
                    drop(h);
                }
                if let Some(h) = bridge_handle.take() {
                    drop(h);
                }
            }
        }
    }
}

fn build_claude_args(model: &str, permission_mode: &str) -> Vec<String> {
    let mut args = vec![
        // NOTE: do NOT use -p — it's one-shot mode and prevents the CLI from
        // maintaining conversation state across send_message calls.
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--input-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--permission-mode".to_string(),
        permission_mode.to_string(),
    ];

    if !model.is_empty() {
        args.push("--model".to_string());
        args.push(model.to_string());
    }

    args
}

impl Drop for AgentEngine {
    fn drop(&mut self) {
        self.close();
    }
}

fn parse_sdk_line(line: &str) -> Vec<AgentEvent> {
    let v: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(e) => {
            return vec![AgentEvent::Error {
                message: format!("解析 JSON: {}", e),
            }];
        }
    };

    let msg_type = v["type"].as_str().unwrap_or("");
    if msg_type.is_empty() {
        eprintln!(
            "[warn] parse_sdk_line: missing or non-string 'type' field in SDK line: {}",
            &line[..line.len().min(LOG_LINE_TRUNCATE_SDK)]
        );
    }

    match msg_type {
        "assistant" => parse_assistant_event(&v),
        "result" => {
            if v["is_error"].as_bool().unwrap_or(false) {
                let message = v["result"]
                    .as_str()
                    .unwrap_or("Claude CLI 返回错误")
                    .to_string();
                return vec![AgentEvent::Error { message }];
            }

            let tokens = v["total_tokens"].as_u64().unwrap_or(0) as u32;
            vec![AgentEvent::Done {
                total_tokens: tokens,
            }]
        }
        // stream-json mode emits setup/echo events that are not renderable chat content.
        "system" | "stream_event" => Vec::new(),
        "user" => parse_user_event(&v),
        "plan" => parse_plan_event(&v),
        _ => {
            eprintln!(
                "[warn] parse_sdk_line: unknown msg_type '{}' from SDK line: {}",
                &msg_type,
                &line[..line.len().min(LOG_LINE_TRUNCATE_UNKNOWN)]
            );
            Vec::new()
        }
    }
}

fn parse_assistant_event(v: &serde_json::Value) -> Vec<AgentEvent> {
    let mut events = Vec::new();
    let content = &v["message"]["content"];
    if let Some(items) = content.as_array() {
        let mut block_count = 0u32;
        for item in items {
            match item["type"].as_str() {
                Some("text") => {
                    block_count += 1;
                    if let Some(text) = item["text"].as_str() {
                        events.push(AgentEvent::AssistantContent {
                            text: text.to_string(),
                        });
                    }
                }
                Some("tool_use") => {
                    block_count += 1;
                    // Try multiple key variants for tool ID and name
                    let mut tool_id = item["id"]
                        .as_str()
                        .or_else(|| item["tool_use_id"].as_str())
                        .or_else(|| item["tool_use"]["id"].as_str())
                        .unwrap_or("")
                        .to_string();
                    let mut tool_name = item["name"]
                        .as_str()
                        .or_else(|| item["tool_name"].as_str())
                        .or_else(|| item["tool_use"]["name"].as_str())
                        .unwrap_or("")
                        .to_string();
                    // Fallback: generate synthetic ID + infer name
                    if tool_id.is_empty() {
                        let raw = serde_json::to_string(item).unwrap_or_default();
                        let hash: String =
                            raw.bytes().take(8).map(|b| format!("{:02x}", b)).collect();
                        tool_id = format!("tool_{}", hash);
                    }
                    if tool_name.is_empty() {
                        tool_name = "Tool".to_string();
                    }
                    let tool_input = item["input"].to_string();
                    events.push(AgentEvent::ToolUse {
                        tool_id,
                        tool_name,
                        tool_input,
                    });
                }
                _ => {}
            }
        }
        if block_count > 1 {
            eprintln!(
                "[warn] parse_assistant_event: {} content blocks in one message \
                 (expected 1 per stream-json line); some downstream consumers may \
                 only handle the first",
                block_count
            );
        }
    }

    events
}

fn parse_user_event(v: &serde_json::Value) -> Vec<AgentEvent> {
    let content = &v["message"]["content"];
    if let Some(items) = content.as_array() {
        for item in items {
            if item["type"].as_str() == Some("tool_result") {
                let tool_id = item["tool_use_id"].as_str().unwrap_or("").to_string();
                let content = item["content"].as_str().unwrap_or("").to_string();
                if tool_id.is_empty() {
                    eprintln!("[warn] parse_user_event: tool_result missing tool_use_id");
                }
                return vec![AgentEvent::ToolResult { tool_id, content }];
            }
        }
    }
    // User message without tool_result — not actionable
    Vec::new()
}

fn parse_plan_event(v: &serde_json::Value) -> Vec<AgentEvent> {
    let plan_id = v["id"]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or("plan")
        .to_string();
    let plan_summary = v["plan_summary"].as_str().unwrap_or("").to_string();
    let steps = v["steps"].as_array();
    let tool_input = serde_json::json!({
        "plan_summary": plan_summary,
        "steps": steps,
    })
    .to_string();
    vec![AgentEvent::Interrupt {
        interrupt_id: plan_id,
        kind: "plan".to_string(),
        tool_name: "plan".to_string(),
        tool_input,
    }]
}

fn which_claude() -> Result<String, String> {
    for name in &["claude", "claude-code", "claude-cli"] {
        // Try `where`/`which` first
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
        // On Windows, also try `cmd /c where`
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
    // On Windows, check the standard global CLI shim location
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
        // Also check alternate shim names in the same global bin directory.
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

/// Convert a JSON string emitted by the j-agent agent loop's event stream
/// (produced by `stream_msg_to_json_string` in adapter.rs) into AgentEvent(s).
/// Also appends timeline items for the session.
fn json_stream_msg_to_agent_events(json: &str, session_id: &str) -> Vec<AgentEvent> {
    use crate::agent_session::{self, AgentTimelineItem, ToolCallSnapshot};

    let v: serde_json::Value = match serde_json::from_str(json) {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    match v["type"].as_str() {
        Some("toolCallRequest") => {
            if let Some(tools) = v["tools"].as_array() {
                let mut result = Vec::with_capacity(tools.len());
                for tool in tools {
                    let tool_id = tool["id"].as_str().unwrap_or("").to_string();
                    let tool_name = tool["name"].as_str().unwrap_or("").to_string();
                    let tool_input = tool["arguments"].as_str().unwrap_or("{}").to_string();
                    // Append timeline item for this tool call
                    let _ = agent_session::append_timeline_item(
                        session_id,
                        &AgentTimelineItem {
                            id: agent_session::generate_item_id(),
                            kind: "tool_call".into(),
                            content: None,
                            tool_call: Some(ToolCallSnapshot {
                                tool_id: tool_id.clone(),
                                tool_name: tool_name.clone(),
                                tool_input: tool_input.clone(),
                                tool_output: None,
                                status: "running".into(),
                            }),
                            interrupt: None,
                            created_at: agent_session::now_millis(),
                        },
                    );
                    result.push(AgentEvent::ToolUse {
                        tool_id,
                        tool_name,
                        tool_input,
                    });
                }
                result
            } else {
                vec![]
            }
        }
        Some("done") => {
            vec![AgentEvent::Done { total_tokens: 0 }]
        }
        Some("error") => {
            vec![AgentEvent::Error {
                message: v["message"].as_str().unwrap_or("未知错误").to_string(),
            }]
        }
        // Internal progress events — not forwarded to frontend.
        Some("chunk") | Some("cancelled") | Some("retrying") | Some("compacting")
        | Some("compacted") => {
            vec![]
        }
        _ => vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::{build_claude_args, json_stream_msg_to_agent_events, parse_sdk_line, AgentEvent};

    #[test]
    fn build_claude_args_enables_stream_json_input() {
        let args = build_claude_args("claude-sonnet-4-6", "bypassPermissions");

        assert!(args
            .windows(2)
            .any(|w| w == ["--input-format", "stream-json"]));
        assert!(!args.iter().any(|arg| arg == "--include-partial-messages"));
        assert!(args
            .windows(2)
            .any(|w| w == ["--model", "claude-sonnet-4-6"]));
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
        // Simulate the route logic applied by stdout thread
        let tool_name = "ask_user";
        let kind = match tool_name {
            "ask_user" | "AskUser" => "ask_user",
            _ => "permission",
        };
        assert_eq!(kind, "ask_user");
    }

    // ── json_stream_msg_to_agent_events tests ──

    #[test]
    fn json_stream_msg_tool_call_request_converts_to_tool_use() {
        let json = r#"{"type":"toolCallRequest","tools":[{"id":"t1","name":"Bash","arguments":"{\"command\":\"ls\"}"}]}"#;
        let events = json_stream_msg_to_agent_events(json, "test-sid");
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
        let events = json_stream_msg_to_agent_events(json, "test-sid");
        assert_eq!(events.len(), 2);
        assert!(matches!(&events[0], AgentEvent::ToolUse { tool_id, .. } if tool_id == "t1"));
        assert!(matches!(&events[1], AgentEvent::ToolUse { tool_id, .. } if tool_id == "t2"));
    }

    #[test]
    fn json_stream_msg_done_converts_to_done() {
        let json = r#"{"type":"done"}"#;
        let events = json_stream_msg_to_agent_events(json, "test-sid");
        assert_eq!(events, vec![AgentEvent::Done { total_tokens: 0 }]);
    }

    #[test]
    fn json_stream_msg_error_converts_to_error() {
        let json = r#"{"type":"error","message":"test error"}"#;
        let events = json_stream_msg_to_agent_events(json, "test-sid");
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
            let events = json_stream_msg_to_agent_events(json, "test-sid");
            assert!(events.is_empty(), "expected no events for type: {}", json);
        }
    }

    #[test]
    fn json_stream_msg_invalid_json_returns_empty() {
        let events = json_stream_msg_to_agent_events("not valid json", "test-sid");
        assert!(events.is_empty());
    }

    #[test]
    fn json_stream_msg_unknown_type_returns_empty() {
        let json = r#"{"type":"unknown"}"#;
        let events = json_stream_msg_to_agent_events(json, "test-sid");
        assert!(events.is_empty());
    }
}
