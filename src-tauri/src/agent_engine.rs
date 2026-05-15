use crate::agent_retry::RetryPolicy;
use crate::agent_runtime_recovery::{classify_recovery, RecoveryAction};
use crate::agent_session::{self, AgentTimelineItem};
use crate::kernel::types::{
    KernelAgentInterruptResponse, KernelAgentParams, KernelAgentToolResult, KernelChatMessage,
    KernelPlanDecision,
};
use crate::kernel::ChatKernel;
use serde::Serialize;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use tauri::ipc::Channel;
use tokio_util::sync::CancellationToken;

#[path = "agent_engine_events.rs"]
mod agent_engine_events;
use agent_engine_events::{json_stream_msg_to_agent_events, parse_sdk_line};
#[path = "agent_engine_runtime.rs"]
mod agent_engine_runtime;
#[cfg(test)]
/// 测试中复用的时间线投影辅助函数。
pub(crate) use agent_engine_runtime::timeline_items_from_event;
/// 供 system 命令模块复用的 Claude CLI 定位函数。
pub(crate) use agent_engine_runtime::which_claude;
use agent_engine_runtime::{forward_cli_event, persist_sdk_session_id};
#[path = "agent_engine_cli.rs"]
mod agent_engine_cli;
#[cfg(test)]
/// 测试中复用的 CLI 参数与启动期分析辅助函数。
pub(crate) use agent_engine_cli::{
    build_claude_args, cli_events_show_visible_progress, cli_startup_error_from_events,
};
use agent_engine_cli::{
    kernel_tool_result_from_response, serialize_interrupt_response, start_cli_with_recovery,
};

const CLAUDE_GRACE_PERIOD_MS: u64 = 500;
const CLI_STARTUP_SUPERVISOR_TIMEOUT_MS: u64 = 3_000;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
/// 前端可订阅的 Agent 事件流。
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
        result_subtype: Option<String>,
    },
    Error {
        message: String,
    },
    Cancelled,
    Compacting,
    CompactComplete,
    ModelResolved {
        model: String,
    },
    Retrying {
        attempt: u32,
        max_attempts: u32,
        delay_seconds: u32,
        reason: String,
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
        cancel_token: CancellationToken,
        tool_result_tx: std::sync::mpsc::SyncSender<KernelAgentToolResult>,
        user_message_tx: std::sync::mpsc::SyncSender<KernelChatMessage>,
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

/// 启动 Claude CLI 后端所需的参数。
pub(crate) struct AgentCliStartParams {
    pub on_event: Channel<AgentEvent>,
    pub permission_mode: String,
    pub session_id: String,
    pub model: String,
    pub api_base: String,
    pub api_key: String,
    pub resume_session_id: Option<String>,
    pub fork_session: bool,
    pub initial_user_message: Option<String>,
}

/// 启动进程内 j-agent 后端所需的参数。
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
            resume_session_id,
            fork_session,
            initial_user_message,
        } = params;
        let (process, stdin, stdout_thread, stderr_thread) =
            start_cli_with_recovery(AgentCliStartParams {
                on_event: on_event.clone(),
                permission_mode: permission_mode.clone(),
                session_id: session_id.clone(),
                model: model.clone(),
                api_base: api_base.clone(),
                api_key: api_key.clone(),
                resume_session_id,
                fork_session,
                initial_user_message,
            })?;

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
        let cancel_token = CancellationToken::new();
        let (tool_result_tx, tool_result_rx) =
            std::sync::mpsc::sync_channel::<KernelAgentToolResult>(16);
        let (user_message_tx, user_message_rx) =
            std::sync::mpsc::sync_channel::<KernelChatMessage>(16);
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
            permission_mode: permission_mode.clone(),
            cancel_token: cancel_token.clone(),
            tool_result_rx: Some(tool_result_rx),
            user_message_rx: Some(user_message_rx),
            on_event: json_channel,
            event_interceptor: Some(interceptor_tx),
        };
        let bridge_handle = spawn_jagent_bridge_thread(
            on_event.clone(),
            interceptor_rx,
            session_id.clone(),
            permission_mode,
        );
        let agent_handle = spawn_jagent_runtime_thread(kernel, on_event.clone(), params);

        // 6. 构造 transcript 路径
        let transcript_path = agent_session::agent_sessions_dir()
            .join(&session_id)
            .join("transcript.jsonl");

        Ok(Self {
            backend: AgentBackend::JAgent {
                session_id: session_id.clone(),
                cancel_token,
                tool_result_tx,
                user_message_tx,
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
            AgentBackend::JAgent {
                user_message_tx, ..
            } => {
                let item = AgentTimelineItem {
                    id: agent_session::generate_item_id(),
                    kind: "user_message".into(),
                    content: Some(content.to_string()),
                    tool_call: None,
                    interrupt: None,
                    created_at: agent_session::now_millis(),
                };
                agent_session::append_timeline_item(&self.session_id, &item)?;
                user_message_tx
                    .send(KernelChatMessage {
                        role: "user".to_string(),
                        content: content.to_string(),
                        reasoning: None,
                        attachments: None,
                    })
                    .map_err(|e| format!("发送 jagent 用户消息失败: {}", e))?;
                return Ok(());
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
    pub fn respond_interrupt(
        &mut self,
        interrupt_id: &str,
        response: &KernelAgentInterruptResponse,
    ) -> Result<(), String> {
        let content = serialize_interrupt_response(response);
        match &mut self.backend {
            AgentBackend::Cli { stdin, .. } => {
                let stdin = stdin.as_mut().ok_or("Agent 未启动")?;
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
            }
            AgentBackend::JAgent { tool_result_tx, .. } => {
                tool_result_tx
                    .send(kernel_tool_result_from_response(interrupt_id, response))
                    .map_err(|e| format!("发送 Agent 中断响应失败: {}", e))?;
            }
        }
        agent_session::update_interrupt_response(&self.session_id, interrupt_id, &content)
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
    /// 创建一个仅用于测试的空壳 AgentEngine。
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
                cancel_token,
                tool_result_tx: _,
                user_message_tx: _,
                agent_handle,
                bridge_handle,
                ..
            } => {
                cancel_token.cancel();
                // j-cli agent loop 会在检测到 cancel token 后自行退出。
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

fn spawn_jagent_bridge_thread(
    on_event: Channel<AgentEvent>,
    interceptor_rx: std::sync::mpsc::Receiver<String>,
    session_id: String,
    permission_mode: String,
) -> JoinHandle<()> {
    std::thread::spawn(move || {
        while let Ok(json) = interceptor_rx.recv() {
            let events = json_stream_msg_to_agent_events(&json, &session_id, &permission_mode);
            for event in events {
                if on_event.send(event).is_err() {
                    return;
                }
            }
        }
    })
}

fn spawn_jagent_runtime_thread(
    kernel: Arc<dyn ChatKernel>,
    on_event: Channel<AgentEvent>,
    params: KernelAgentParams,
) -> JoinHandle<()> {
    std::thread::spawn(move || {
        let rt = match tokio::runtime::Runtime::new() {
            Ok(rt) => rt,
            Err(e) => {
                let _ = on_event.send(AgentEvent::Error {
                    message: format!("创建 tokio runtime 失败: {}", e),
                });
                return;
            }
        };
        rt.block_on(async {
            if let Err(e) = kernel.run_agent_loop(params).await {
                let _ = on_event.send(AgentEvent::Error {
                    message: format!("Agent loop 错误: {}", e),
                });
            }
        });
    })
}

impl Drop for AgentEngine {
    fn drop(&mut self) {
        self.close();
    }
}

#[cfg(test)]
#[path = "tests/agent_engine.rs"]
mod tests;
