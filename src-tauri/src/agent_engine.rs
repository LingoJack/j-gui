use crate::agent_session::{self, AgentTimelineItem};
use crate::kernel::types::{KernelAgentParams, KernelChatMessage};
use crate::kernel::ChatKernel;
use serde::Serialize;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Arc;
use std::thread::JoinHandle;
use tauri::ipc::Channel;

#[path = "agent_engine_events.rs"]
mod agent_engine_events;
use agent_engine_events::{json_stream_msg_to_agent_events, parse_sdk_line};
#[path = "agent_engine_runtime.rs"]
mod agent_engine_runtime;
#[cfg(test)]
pub(crate) use agent_engine_runtime::timeline_items_from_event;
use agent_engine_runtime::{forward_cli_event, persist_sdk_session_id, which_claude};

const CLAUDE_GRACE_PERIOD_MS: u64 = 500;

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

/// Agent 运行时当前挂接的后端类型。
pub enum AgentBackend {
    /// 既有的 Claude CLI 子进程后端。
    Cli {
        process: Option<Child>,
        stdin: Option<ChildStdin>,
        stdout_thread: Option<JoinHandle<()>>,
        stderr_thread: Option<JoinHandle<()>>,
    },
    /// 新的进程内 j-agent 后端（走 `ChatKernel::run_agent_loop`）。
    JAgent {
        #[allow(dead_code)]
        session_id: String,
        agent_handle: Option<JoinHandle<()>>,
        bridge_handle: Option<JoinHandle<()>>,
    },
}

/// 负责驱动 Agent 生命周期并维护会话 transcript 的运行时封装。
pub struct AgentEngine {
    pub(crate) backend: AgentBackend,
    #[allow(dead_code)]
    session_id: String,
    #[allow(dead_code)]
    transcript_path: PathBuf,
}

pub(crate) struct AgentCliStartParams {
    pub on_event: Channel<AgentEvent>,
    pub permission_mode: String,
    pub session_id: String,
    pub model: String,
    pub api_base: String,
    pub api_key: String,
}

pub(crate) struct AgentJStartParams {
    pub kernel: Arc<dyn ChatKernel>,
    pub on_event: Channel<AgentEvent>,
    pub session_id: String,
    pub messages: Vec<KernelChatMessage>,
    pub permission_mode: String,
    pub system_prompt: Option<String>,
}

impl AgentEngine {
    /// 启动 Claude CLI 后端并建立 stdout/stderr 桥接线程。
    pub fn start(params: AgentCliStartParams) -> Result<Self, String> {
        let AgentCliStartParams {
            on_event,
            permission_mode,
            session_id,
            model,
            api_base,
            api_key,
        } = params;
        let claude_path = which_claude()?;

        let mut cmd = Command::new(&claude_path);
        let args = build_claude_args(&model, &permission_mode);
        cmd.args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if !api_base.is_empty() {
            cmd.env("ANTHROPIC_BASE_URL", &api_base);
        }
        // SAFETY: 这是 Claude CLI 文档约定的认证方式。
        // 进程生命周期较短，在单用户桌面环境下该做法可接受。
        // 但在共享系统上，/proc/<pid>/environ（Linux）或进程环境读取 API（Windows）
        // 可能把密钥暴露给同用户的其他进程，这是当前明确接受的权衡。
        if !api_key.is_empty() {
            cmd.env("ANTHROPIC_API_KEY", &api_key);
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
            permission_mode.clone(),
            session_id.clone(),
        );

        // 后台线程：持续记录 stderr
        let stderr_thread = std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for l in reader.lines().map_while(Result::ok) {
                eprintln!("[claude stderr] {}", l);
            }
        });

        let transcript_path = agent_session::agent_sessions_dir()
            .join(&session_id)
            .join("transcript.jsonl");

        Ok(Self {
            backend: AgentBackend::Cli {
                process: Some(process),
                stdin: Some(stdin),
                stdout_thread: Some(stdout_thread),
                stderr_thread: Some(stderr_thread),
            },
            session_id,
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
                persist_sdk_session_id(&session_id, &line);
                for event in parse_sdk_line(&line) {
                    if !forward_cli_event(&on_event, &session_id, &mode, event) {
                        return;
                    }
                }
            }
        })
    }

    /// 启动进程内 j-agent 后端。
    /// 会在后台线程调用 `ChatKernel::run_agent_loop`，
    /// 并把 StreamMsg JSON 事件桥接到前端的 AgentEvent 通道。
    pub fn start_jagent(params: AgentJStartParams) -> Result<Self, String> {
        let AgentJStartParams {
            kernel,
            on_event,
            session_id,
            messages,
            permission_mode,
            system_prompt,
        } = params;
        // 1. 创建拦截通道，用于把 StreamMsg JSON 桥接成 AgentEvent
        let (interceptor_tx, interceptor_rx) = std::sync::mpsc::channel::<String>();

        // 2. 为 KernelAgentParams.on_event 创建 Channel<String>。
        //    这里的回调不做额外处理，因为事件只通过 bridge 转发给前端。
        let json_channel: Channel<String> = Channel::new(|_| Ok(()));

        // 3. 组装带拦截器的 KernelAgentParams
        let params = KernelAgentParams {
            session_id: session_id.clone(),
            messages,
            system_prompt,
            permission_mode,
            on_event: json_channel,
            event_interceptor: Some(interceptor_tx),
        };

        // 4. bridge 线程：从拦截器接收 agent loop 发出的 JSON 字符串，
        //    转成 AgentEvent 后再转发给前端。
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

        // 5. agent loop 线程：创建 tokio runtime 并调用 run_agent_loop。
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

        // 6. 构造 transcript 路径
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

    /// 向当前 Agent 会话追加一条用户消息。
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

    /// 回应一个等待中的 Agent 中断请求。
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

    /// 判断当前运行时是否已经自然结束。
    pub fn is_finished(&mut self) -> bool {
        match &mut self.backend {
            AgentBackend::Cli { process, .. } => match process.as_mut() {
                Some(child) => child.try_wait().ok().flatten().is_some(),
                None => true,
            },
            AgentBackend::JAgent {
                agent_handle,
                bridge_handle,
                ..
            } => {
                let agent_finished = agent_handle
                    .as_ref()
                    .map(std::thread::JoinHandle::is_finished)
                    .unwrap_or(true);
                let bridge_finished = bridge_handle
                    .as_ref()
                    .map(std::thread::JoinHandle::is_finished)
                    .unwrap_or(true);
                agent_finished && bridge_finished
            }
        }
    }

    #[cfg(test)]
    pub(crate) fn test_stub(session_id: &str, backend: AgentBackend) -> Self {
        Self {
            backend,
            session_id: session_id.to_string(),
            transcript_path: PathBuf::new(),
        }
    }

    /// 关闭当前 Agent 后端并回收相关线程句柄。
    pub fn close(&mut self) {
        match &mut self.backend {
            AgentBackend::Cli {
                stdin,
                process,
                stdout_thread,
                stderr_thread,
            } => {
                // 关闭 stdin，通知 CLI 停止
                if let Some(stdin) = stdin.take() {
                    drop(stdin);
                }
                // 在关闭 stdin 后给进程一个很短的自然退出窗口，
                // 让它有机会在被强制终止前刷出剩余输出。
                if let Some(mut process) = process.take() {
                    std::thread::sleep(std::time::Duration::from_millis(CLAUDE_GRACE_PERIOD_MS));
                    match process.try_wait() {
                        Ok(Some(_)) => { /* 已自然退出 */ }
                        Ok(None) | Err(_) => {
                            let _ = process.kill();
                            let _ = process.wait();
                        }
                    }
                }
                // 回收 reader 线程；此时进程已经结束，pipe 也已断开，join 是安全的。
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
                // 分离 agent 与 bridge 线程（它们会运行到 agent loop 自然结束）。
                // 当前还没有主动取消机制，因此 loop 会自行跑完。
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
        // NOTE: 不要使用 -p；那是单次执行模式，会导致 CLI 无法在多次 send_message 之间维持会话状态。
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

#[cfg(test)]
#[path = "tests/agent_engine.rs"]
mod tests;
