use super::*;

struct CliAttemptStart {
    process: Child,
    stdin: ChildStdin,
    stdout_thread: JoinHandle<()>,
    stderr_thread: JoinHandle<()>,
}

struct CliLaunchConfig<'a> {
    on_event: &'a Channel<AgentEvent>,
    permission_mode: &'a str,
    session_id: &'a str,
    model: &'a str,
    api_base: &'a str,
    api_key: &'a str,
    resume_session_id: Option<String>,
    fork_session: bool,
    initial_user_message: Option<&'a str>,
}

struct SpawnedCliProcess {
    process: Child,
    stdin: ChildStdin,
    stdout: std::process::ChildStdout,
    stderr: std::process::ChildStderr,
}

pub(crate) fn build_claude_args(
    model: &str,
    permission_mode: &str,
    resume_session_id: Option<&str>,
    fork_session: bool,
) -> Vec<String> {
    let mut args = vec![
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--input-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--permission-mode".to_string(),
        permission_mode.to_string(),
    ];

    if let Some(resume_session_id) = resume_session_id.filter(|value| !value.is_empty()) {
        args.push("--resume".to_string());
        args.push(resume_session_id.to_string());
    }

    if fork_session {
        args.push("--fork-session".to_string());
    }

    if !model.is_empty() {
        args.push("--model".to_string());
        args.push(model.to_string());
    }

    args
}

pub(super) fn start_cli_with_recovery(
    config: AgentCliStartParams,
) -> Result<(Child, ChildStdin, JoinHandle<()>, JoinHandle<()>), String> {
    let AgentCliStartParams {
        on_event,
        permission_mode,
        session_id,
        model,
        api_base,
        api_key,
        mut resume_session_id,
        mut fork_session,
        initial_user_message,
    } = config;
    let retry_policy = RetryPolicy::default();
    let mut attempt = 1_u32;

    loop {
        match start_cli_attempt(CliLaunchConfig {
            on_event: &on_event,
            permission_mode: &permission_mode,
            session_id: &session_id,
            model: &model,
            api_base: &api_base,
            api_key: &api_key,
            resume_session_id: resume_session_id.clone(),
            fork_session,
            initial_user_message: initial_user_message.as_deref(),
        }) {
            Ok(started) => {
                return Ok((
                    started.process,
                    started.stdin,
                    started.stdout_thread,
                    started.stderr_thread,
                ));
            }
            Err(error) => {
                let decision = classify_recovery(&error, resume_session_id.is_some());
                if matches!(decision.action, RecoveryAction::Fail)
                    || !retry_policy.can_retry(attempt)
                {
                    return Err(error);
                }

                let delay_seconds = retry_policy.delay_seconds_for(attempt);
                let reason = if decision.reason.is_empty() {
                    error.clone()
                } else {
                    decision.reason
                };
                let _ = on_event.send(AgentEvent::Retrying {
                    attempt,
                    max_attempts: retry_policy.max_attempts,
                    delay_seconds,
                    reason: reason.clone(),
                });

                if matches!(decision.action, RecoveryAction::RetryWithoutResume) {
                    resume_session_id = None;
                    fork_session = false;
                    let _ = agent_session::set_session_sdk_session_id(&session_id, None);
                }

                std::thread::sleep(std::time::Duration::from_secs(delay_seconds as u64));
                attempt += 1;
            }
        }
    }
}

fn start_cli_attempt(config: CliLaunchConfig<'_>) -> Result<CliAttemptStart, String> {
    let SpawnedCliProcess {
        mut process,
        mut stdin,
        stdout,
        stderr,
    } = spawn_cli_process(&config)?;
    if let Err(error) = write_initial_cli_message(&mut stdin, config.initial_user_message) {
        cleanup_failed_cli_start(&mut process);
        return Err(error);
    }
    let stderr_lines = Arc::new(Mutex::new(Vec::<String>::new()));
    let stderr_thread = spawn_cli_stderr_thread(stderr, Arc::clone(&stderr_lines));
    let (startup_tx, startup_rx) = mpsc::channel::<Result<(), String>>();
    let stdout_thread = spawn_cli_stdout_thread(
        stdout,
        startup_tx,
        config.on_event.clone(),
        config.permission_mode.to_string(),
        config.session_id.to_string(),
    );
    finalize_cli_startup(
        process,
        stdin,
        stdout_thread,
        stderr_thread,
        startup_rx,
        stderr_lines,
    )
}

fn cleanup_failed_cli_start(process: &mut Child) {
    let _ = process.kill();
    let _ = process.wait();
}

fn spawn_cli_process(config: &CliLaunchConfig<'_>) -> Result<SpawnedCliProcess, String> {
    let claude_path = which_claude()?;
    let mut cmd = Command::new(&claude_path);
    let args = build_claude_args(
        config.model,
        config.permission_mode,
        config.resume_session_id.as_deref(),
        config.fork_session,
    );
    cmd.args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if !config.api_base.is_empty() {
        cmd.env("ANTHROPIC_BASE_URL", config.api_base);
    }
    // SAFETY: 这是 Claude CLI 文档约定的认证方式。
    // 进程生命周期较短，在单用户桌面环境下该做法可接受。
    // 但在共享系统上，/proc/<pid>/environ（Linux）或进程环境读取 API（Windows）
    // 可能把密钥暴露给同用户的其他进程，这是当前明确接受的权衡。
    if !config.api_key.is_empty() {
        cmd.env("ANTHROPIC_API_KEY", config.api_key);
    }

    let mut process = cmd
        .spawn()
        .map_err(|e| format!("启动 claude CLI 失败: {}", e))?;

    let stdout = process.stdout.take().ok_or("无法获取 claude stdout")?;
    let stderr = process.stderr.take().ok_or("无法获取 claude stderr")?;
    let stdin = process.stdin.take().ok_or("无法获取 claude stdin")?;

    Ok(SpawnedCliProcess {
        process,
        stdin,
        stdout,
        stderr,
    })
}

fn write_initial_cli_message(
    stdin: &mut ChildStdin,
    initial_user_message: Option<&str>,
) -> Result<(), String> {
    if let Some(user_message) = initial_user_message
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let msg = serde_json::json!({
            "type": "user",
            "message": {
                "role": "user",
                "content": [{ "type": "text", "text": user_message }]
            }
        });
        writeln!(
            stdin,
            "{}",
            serde_json::to_string(&msg).map_err(|e| e.to_string())?
        )
        .map_err(|e| format!("写入 claude stdin 失败: {}", e))?;
    }
    Ok(())
}

fn spawn_cli_stderr_thread(
    stderr: std::process::ChildStderr,
    stderr_lines: Arc<Mutex<Vec<String>>>,
) -> JoinHandle<()> {
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            eprintln!("[claude stderr] {}", line);
            if let Ok(mut lines) = stderr_lines.lock() {
                lines.push(line);
                if lines.len() > 16 {
                    let drain_until = lines.len() - 16;
                    lines.drain(0..drain_until);
                }
            }
        }
    })
}

fn spawn_cli_stdout_thread(
    stdout: std::process::ChildStdout,
    startup_tx: mpsc::Sender<Result<(), String>>,
    on_event: Channel<AgentEvent>,
    permission_mode: String,
    session_id: String,
) -> JoinHandle<()> {
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut startup_reported = false;
        let mut visible_progress_started = false;

        for line in reader.lines() {
            let line = match line {
                Ok(line) => line,
                Err(_) => break,
            };
            if line.is_empty() {
                continue;
            }

            persist_sdk_session_id(&session_id, &line);
            let events = parse_sdk_line(&line);
            if !visible_progress_started && cli_events_show_visible_progress(&events) {
                visible_progress_started = true;
                if !startup_reported {
                    let _ = startup_tx.send(Ok(()));
                    startup_reported = true;
                }
            }
            if !visible_progress_started {
                if let Some(error) = cli_startup_error_from_events(&events) {
                    if !startup_reported && startup_tx.send(Err(error.clone())).is_err() {
                        let _ = forward_cli_event(
                            &on_event,
                            &session_id,
                            &permission_mode,
                            AgentEvent::Error { message: error },
                        );
                    }
                    return;
                }
            }
            for event in events {
                if !forward_cli_event(&on_event, &session_id, &permission_mode, event) {
                    return;
                }
            }
        }

        if !startup_reported {
            let error = "Claude CLI 在启动阶段提前结束".to_string();
            if startup_tx.send(Err(error.clone())).is_err() {
                let _ = forward_cli_event(
                    &on_event,
                    &session_id,
                    &permission_mode,
                    AgentEvent::Error { message: error },
                );
            }
        }
    })
}

fn finalize_cli_startup(
    mut process: Child,
    stdin: ChildStdin,
    stdout_thread: JoinHandle<()>,
    stderr_thread: JoinHandle<()>,
    startup_rx: mpsc::Receiver<Result<(), String>>,
    stderr_lines: Arc<Mutex<Vec<String>>>,
) -> Result<CliAttemptStart, String> {
    match startup_rx.recv_timeout(std::time::Duration::from_millis(
        CLI_STARTUP_SUPERVISOR_TIMEOUT_MS,
    )) {
        Ok(Ok(())) | Err(mpsc::RecvTimeoutError::Timeout) => Ok(CliAttemptStart {
            process,
            stdin,
            stdout_thread,
            stderr_thread,
        }),
        Ok(Err(error)) => {
            let stderr_tail = stderr_lines
                .lock()
                .ok()
                .and_then(|lines| lines.last().cloned())
                .filter(|line| !line.trim().is_empty());
            let _ = process.kill();
            let _ = process.wait();
            let _ = stdout_thread.join();
            let _ = stderr_thread.join();

            if let Some(stderr_tail) = stderr_tail {
                Err(format!("{error} | stderr: {stderr_tail}"))
            } else {
                Err(error)
            }
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            let stderr_tail = stderr_lines
                .lock()
                .ok()
                .and_then(|lines| lines.last().cloned())
                .filter(|line| !line.trim().is_empty());
            let _ = process.kill();
            let _ = process.wait();
            let _ = stdout_thread.join();
            let _ = stderr_thread.join();
            if let Some(stderr_tail) = stderr_tail {
                Err(format!(
                    "Claude CLI 在启动阶段提前结束 | stderr: {stderr_tail}"
                ))
            } else {
                Err("Claude CLI 在启动阶段提前结束".to_string())
            }
        }
    }
}

pub(crate) fn cli_events_show_visible_progress(events: &[AgentEvent]) -> bool {
    events.iter().any(|event| {
        matches!(
            event,
            AgentEvent::AssistantContent { .. }
                | AgentEvent::ToolUse { .. }
                | AgentEvent::Interrupt { .. }
                | AgentEvent::ToolResult { .. }
                | AgentEvent::Done { .. }
        )
    })
}

pub(crate) fn cli_startup_error_from_events(events: &[AgentEvent]) -> Option<String> {
    events.iter().find_map(|event| match event {
        AgentEvent::Error { message } => Some(message.clone()),
        _ => None,
    })
}

pub(super) fn serialize_interrupt_response(response: &KernelAgentInterruptResponse) -> String {
    match response {
        KernelAgentInterruptResponse::Permission {
            allowed: true,
            always_allow: true,
        } => "always_approved".to_string(),
        KernelAgentInterruptResponse::Permission {
            allowed: true,
            always_allow: false,
        } => "approved".to_string(),
        KernelAgentInterruptResponse::Permission { allowed: false, .. } => "denied".to_string(),
        KernelAgentInterruptResponse::AskUser { result_json } => result_json.clone(),
        KernelAgentInterruptResponse::Plan { decision, feedback } => serde_json::json!({
            "decision": match decision {
                KernelPlanDecision::Approve => "approve",
                KernelPlanDecision::ApproveAndClearContext => "approve_and_clear_context",
                KernelPlanDecision::Reject => "reject",
                KernelPlanDecision::None => "reject",
            },
            "feedback": feedback,
        })
        .to_string(),
    }
}

pub(super) fn kernel_tool_result_from_response(
    interrupt_id: &str,
    response: &KernelAgentInterruptResponse,
) -> KernelAgentToolResult {
    match response {
        KernelAgentInterruptResponse::Permission {
            allowed,
            always_allow,
        } => KernelAgentToolResult {
            tool_call_id: interrupt_id.to_string(),
            result: if *allowed && *always_allow {
                "always_approved".to_string()
            } else if *allowed {
                "approved".to_string()
            } else {
                "denied".to_string()
            },
            is_error: !allowed,
            plan_decision: KernelPlanDecision::None,
        },
        KernelAgentInterruptResponse::AskUser { result_json } => KernelAgentToolResult {
            tool_call_id: interrupt_id.to_string(),
            result: result_json.clone(),
            is_error: false,
            plan_decision: KernelPlanDecision::None,
        },
        KernelAgentInterruptResponse::Plan { decision, feedback } => KernelAgentToolResult {
            tool_call_id: interrupt_id.to_string(),
            result: feedback.clone().unwrap_or_default(),
            is_error: matches!(decision, KernelPlanDecision::Reject),
            plan_decision: decision.clone(),
        },
    }
}
