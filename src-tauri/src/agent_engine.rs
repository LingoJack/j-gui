use j_cli::command::chat::storage::load_agent_config;
use serde::Serialize;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::thread::JoinHandle;
use tauri::ipc::Channel;

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

pub struct AgentEngine {
    process: Option<Child>,
    stdin: Option<ChildStdin>,
    stdout_thread: Option<JoinHandle<()>>,
    stderr_thread: Option<JoinHandle<()>>,
}

impl AgentEngine {
    pub fn start(on_event: Channel<AgentEvent>) -> Result<Self, String> {
        let config = load_agent_config();
        let provider = config
            .providers
            .get(config.active_index)
            .ok_or("未配置模型提供方")?
            .clone();

        let claude_path = which_claude()?;

        let mut cmd = Command::new(&claude_path);
        let args = build_claude_args(&provider.model);
        cmd.args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if !provider.api_base.is_empty() {
            cmd.env("ANTHROPIC_BASE_URL", &provider.api_base);
        }
        if !provider.api_key.is_empty() {
            cmd.env("ANTHROPIC_API_KEY", &provider.api_key);
        }

        let mut process = cmd
            .spawn()
            .map_err(|e| format!("启动 claude CLI 失败: {}", e))?;

        let stdout = process.stdout.take().ok_or("无法获取 claude stdout")?;
        let stderr = process.stderr.take().ok_or("无法获取 claude stderr")?;
        let stdin = process.stdin.take().ok_or("无法获取 claude stdin")?;

        // Spawn background thread to read stdout
        let event_channel = on_event.clone();
        let stdout_thread = std::thread::spawn(move || {
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
                    // Channel send fails = frontend unmounted, stop reading
                    if event_channel.send(event).is_err() {
                        return;
                    }
                }
            }
        });

        // Background thread to log stderr
        let stderr_thread = std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for l in reader.lines().map_while(Result::ok) {
                eprintln!("[claude stderr] {}", l);
            }
        });

        Ok(Self {
            process: Some(process),
            stdin: Some(stdin),
            stdout_thread: Some(stdout_thread),
            stderr_thread: Some(stderr_thread),
        })
    }

    pub fn send_message(&mut self, content: &str) -> Result<(), String> {
        let stdin = self.stdin.as_mut().ok_or("claude 进程未启动")?;
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

    pub fn close(&mut self) {
        // Close stdin to signal the CLI to stop
        if let Some(stdin) = self.stdin.take() {
            drop(stdin);
        }
        // Kill process before joining reader threads.
        // If we join first, stdout_thread may block forever on a still-open pipe.
        if let Some(mut process) = self.process.take() {
            let _ = process.kill();
            let _ = process.wait();
        }
        // Join reader threads — safe now because the process is dead and pipes are broken.
        if let Some(handle) = self.stdout_thread.take() {
            let _ = handle.join();
        }
        if let Some(handle) = self.stderr_thread.take() {
            let _ = handle.join();
        }
    }
}

fn build_claude_args(model: &str) -> Vec<String> {
    let mut args = vec![
        "-p".to_string(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--input-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--permission-mode".to_string(),
        "bypassPermissions".to_string(),
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
        _ => Vec::new(),
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
                    let tool_id = item["id"].as_str().unwrap_or("").to_string();
                    let tool_name = item["name"].as_str().unwrap_or("").to_string();
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
                let tool_id = item["tool_use_id"]
                    .as_str()
                    .unwrap_or("")
                    .to_string();
                let content = item["content"].as_str().unwrap_or("").to_string();
                return vec![AgentEvent::ToolResult {
                    tool_id,
                    content,
                }];
            }
        }
    }
    // User message without tool_result — not actionable
    Vec::new()
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
    // On Windows, check npm global bin
    if cfg!(windows) {
        let npm_root = std::env::var("APPDATA").unwrap_or_default();
        for name in &["claude.cmd", "claude-code.cmd", "claude-cli.cmd"] {
            let p = std::path::PathBuf::from(&npm_root).join("npm").join(name);
            if p.exists() {
                return Ok(p.to_string_lossy().to_string());
            }
        }
        // Also check npx-based invocation: see if we can find node + claude package
        for name in &["claude", "claude-code"] {
            let p = std::path::PathBuf::from(&npm_root)
                .join("npm")
                .join(format!("{}.cmd", name));
            if p.exists() {
                return Ok(p.to_string_lossy().to_string());
            }
        }
    }
    Err("未找到 claude CLI。请运行:\n  npm i -g @anthropic-ai/claude-code\n安装后确保 %APPDATA%\\npm 在 PATH 中".to_string())
}

#[cfg(test)]
mod tests {
    use super::{build_claude_args, parse_sdk_line, AgentEvent};

    #[test]
    fn build_claude_args_enables_stream_json_input() {
        let args = build_claude_args("claude-sonnet-4-6");

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
}
