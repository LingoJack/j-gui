use super::*;

struct AgentLoopState {
    streaming_content: Arc<Mutex<String>>,
    streaming_reasoning_content: Arc<Mutex<String>>,
    pending_user_messages: Arc<Mutex<Vec<JcliChatMessage>>>,
    background_manager: Arc<BackgroundManager>,
    display_messages: Arc<Mutex<Vec<JcliChatMessage>>>,
    context_messages: Arc<Mutex<Vec<JcliChatMessage>>>,
    estimated_context_tokens: Arc<Mutex<usize>>,
    invoked_skills: InvokedSkillsMap,
    derived_system_prompt: Arc<Mutex<Option<String>>>,
    deferred_tools: Arc<Mutex<Vec<String>>>,
    session_loaded_deferred: Arc<Mutex<Vec<String>>>,
    sub_agent_metrics: Arc<Mutex<SubAgentMetrics>>,
    tool_registry: Arc<ToolRegistry>,
}

#[async_trait(?Send)]
impl ChatKernel for JcliAdapter {
    async fn stream_chat(
        &self,
        request: KernelChatStreamRequest<'_>,
        callbacks: KernelChatStreamCallbacks<'_>,
    ) -> Result<String, KernelError> {
        match request
            .options
            .protocol_family
            .unwrap_or(ChatProtocolFamily::OpenAiChatCompletions)
        {
            ChatProtocolFamily::AnthropicMessages => {
                return stream_anthropic_messages(request, callbacks).await
            }
            ChatProtocolFamily::OpenAiResponses => {
                return stream_openai_responses(request, callbacks).await
            }
            ChatProtocolFamily::OpenAiChatCompletions => {}
        }

        stream_openai_chat_completions(request, callbacks).await
    }

    async fn run_agent_loop(&self, params: KernelAgentParams) -> Result<(), KernelError> {
        let mut params = params;
        let agent_config = load_agent_config();
        let provider = agent_config
            .providers
            .get(agent_config.active_index)
            .cloned()
            .ok_or_else(|| KernelError::Config("No active provider configured".into()))?;
        let loop_state = build_agent_loop_state(&params, &agent_config);
        let tool_result_rx = bridge_tool_result_receiver(params.tool_result_rx.take());
        bridge_user_message_receiver(
            params.user_message_rx.take(),
            Arc::clone(&loop_state.pending_user_messages),
        );

        let loop_params = MainAgentLoopParams {
            config: build_agent_loop_config(&agent_config, provider, params.cancel_token.clone()),
            shared: build_agent_loop_shared_state(&params, &agent_config, &loop_state),
            messages: to_jcli_messages(&params.messages),
            system_prompt_fn: build_system_prompt_fn(params.system_prompt.clone()),
            tx: create_stream_bridge(&params),
            tool_result_rx,
        };

        run_main_agent_loop(loop_params).await;
        Ok(())
    }

    fn append_message(&self, message: KernelAppendMessage<'_>) -> Result<(), KernelError> {
        let existing_len = storage::load_session(message.session_id).len();
        let role_enum = match message.role {
            "user" => MessageRole::User,
            "assistant" => MessageRole::Assistant,
            "system" => MessageRole::System,
            "tool" => MessageRole::Tool,
            _ => MessageRole::User,
        };
        let mut msg = JcliChatMessage::text(role_enum, message.content);
        msg.reasoning_content = message.reasoning.map(ToOwned::to_owned);
        if !storage::append_session_event(message.session_id, &SessionEvent::msg(msg)) {
            return Err(KernelError::Config("写入会话记录失败".into()));
        }
        if let Some(items) = message.attachments.filter(|items| !items.is_empty()) {
            let mut sidecar = load_chat_attachment_sidecar(message.session_id);
            sidecar.insert(existing_len, items.to_vec());
            save_chat_attachment_sidecar(message.session_id, &sidecar)?;
        }
        Ok(())
    }

    fn list_sessions(&self) -> Result<Vec<KernelSessionSummary>, KernelError> {
        let sessions = list_sessions();
        Ok(sessions
            .into_iter()
            .map(|s| {
                let meta_path = SessionPaths::new(&s.id).meta_file();
                let (pinned, archived) = if meta_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&meta_path) {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                            (
                                val.get("pinned").and_then(|v| v.as_bool()).unwrap_or(false),
                                val.get("archived")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false),
                            )
                        } else {
                            (false, false)
                        }
                    } else {
                        (false, false)
                    }
                } else {
                    (false, false)
                };

                KernelSessionSummary {
                    id: s.id,
                    title: s.title,
                    message_count: s.message_count,
                    updated_at: s.updated_at,
                    pinned,
                    archived,
                }
            })
            .collect())
    }

    fn get_session(&self, session_id: &str) -> Result<Vec<KernelSessionEvent>, KernelError> {
        let messages = storage::load_session(session_id);
        let attachment_sidecar = load_chat_attachment_sidecar(session_id);
        Ok(messages
            .into_iter()
            .enumerate()
            .map(|(index, m)| KernelSessionEvent {
                role: m.role.to_string(),
                content: m.content,
                reasoning: m.reasoning_content,
                attachments: attachment_sidecar.get(&index).cloned(),
                timestamp: 0,
            })
            .collect())
    }

    fn create_session(&self) -> Result<String, KernelError> {
        let id = uuid::Uuid::new_v4().to_string();
        let paths = SessionPaths::new(&id);
        if let Some(parent) = paths.transcript().parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(paths.transcript(), "")?;
        Ok(id)
    }

    fn delete_session(&self, session_id: &str) -> Result<(), KernelError> {
        let paths = SessionPaths::new(session_id);
        let sidecar = load_chat_attachment_sidecar(session_id);
        for attachments in sidecar.values() {
            remove_attachment_files(attachments);
        }
        let _ = std::fs::remove_file(paths.transcript());
        let _ = std::fs::remove_file(paths.meta_file());
        let _ = std::fs::remove_file(chat_attachment_sidecar_path(session_id));
        Ok(())
    }

    fn delete_message(&self, session_id: &str, pair_index: usize) -> Result<(), KernelError> {
        let paths = SessionPaths::new(session_id);
        let transcript_path = paths.transcript();
        if !transcript_path.exists() {
            return Err(KernelError::Config("会话记录不存在".into()));
        }
        let content = std::fs::read_to_string(&transcript_path)?;

        let mut msg_event_indices: Vec<usize> = Vec::new();
        for (i, line) in content.lines().enumerate() {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                if v.get("msg").is_some() {
                    msg_event_indices.push(i);
                }
            }
        }

        let user_idx = pair_index * 2;
        let assistant_idx = user_idx + 1;
        if assistant_idx >= msg_event_indices.len() {
            return Err(KernelError::Config("消息索引超出范围".into()));
        }

        let remove_lines: HashSet<usize> = [
            msg_event_indices[user_idx],
            msg_event_indices[assistant_idx],
        ]
        .into_iter()
        .collect();

        let new_content: String = content
            .lines()
            .enumerate()
            .filter(|(i, _)| !remove_lines.contains(i))
            .map(|(_, line)| line.to_string() + "\n")
            .collect();

        std::fs::write(&transcript_path, new_content)?;
        let mut sidecar = load_chat_attachment_sidecar(session_id);
        if !sidecar.is_empty() {
            let mut remapped = HashMap::new();
            for (index, attachments) in sidecar.drain() {
                if index == user_idx || index == assistant_idx {
                    remove_attachment_files(&attachments);
                    continue;
                }
                let new_index = if index > assistant_idx {
                    index - 2
                } else {
                    index
                };
                remapped.insert(new_index, attachments);
            }
            save_chat_attachment_sidecar(session_id, &remapped)?;
        }

        Ok(())
    }

    fn truncate_messages_from(
        &self,
        session_id: &str,
        pair_index: usize,
        preserve_first_message_attachments: bool,
    ) -> Result<(), KernelError> {
        let paths = SessionPaths::new(session_id);
        let transcript_path = paths.transcript();
        if !transcript_path.exists() {
            return Err(KernelError::Config("会话记录不存在".into()));
        }
        let content = std::fs::read_to_string(&transcript_path)?;

        let mut msg_event_indices: Vec<usize> = Vec::new();
        for (i, line) in content.lines().enumerate() {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                if v.get("msg").is_some() {
                    msg_event_indices.push(i);
                }
            }
        }

        let user_idx = pair_index * 2;
        if user_idx >= msg_event_indices.len() {
            return Err(KernelError::Config("消息索引超出范围".into()));
        }

        let remove_lines: HashSet<usize> = msg_event_indices[user_idx..].iter().copied().collect();
        let new_content: String = content
            .lines()
            .enumerate()
            .filter(|(i, _)| !remove_lines.contains(i))
            .map(|(_, line)| line.to_string() + "\n")
            .collect();

        std::fs::write(&transcript_path, new_content)?;

        let mut sidecar = load_chat_attachment_sidecar(session_id);
        if !sidecar.is_empty() {
            let mut remapped = HashMap::new();
            for (index, attachments) in sidecar.drain() {
                if index < user_idx {
                    remapped.insert(index, attachments);
                    continue;
                }

                if index == user_idx && preserve_first_message_attachments {
                    continue;
                }

                remove_attachment_files(&attachments);
            }
            save_chat_attachment_sidecar(session_id, &remapped)?;
        }

        Ok(())
    }

    fn clear_session(&self, session_id: &str) -> Result<(), KernelError> {
        if !storage::append_session_event(session_id, &SessionEvent::Clear) {
            return Err(KernelError::Config("清除会话失败".into()));
        }
        let sidecar = load_chat_attachment_sidecar(session_id);
        for attachments in sidecar.values() {
            remove_attachment_files(attachments);
        }
        let _ = std::fs::remove_file(chat_attachment_sidecar_path(session_id));
        Ok(())
    }

    fn toggle_pin(&self, session_id: &str) -> Result<KernelSessionSummary, KernelError> {
        toggle_session_bool_field(session_id, "pinned")
    }

    fn toggle_archive(&self, session_id: &str) -> Result<KernelSessionSummary, KernelError> {
        toggle_session_bool_field(session_id, "archived")
    }
}

fn bridge_tool_result_receiver(
    rx: Option<std::sync::mpsc::Receiver<KernelAgentToolResult>>,
) -> std::sync::mpsc::Receiver<ToolResultMsg> {
    let (tool_result_tx, tool_result_rx) = std::sync::mpsc::sync_channel::<ToolResultMsg>(16);
    if let Some(rx) = rx {
        std::thread::spawn(move || {
            while let Ok(result) = rx.recv() {
                if tool_result_tx
                    .send(ToolResultMsg {
                        tool_call_id: result.tool_call_id,
                        result: result.result,
                        is_error: result.is_error,
                        images: vec![],
                        plan_decision: match result.plan_decision {
                            KernelPlanDecision::None => PlanDecision::None,
                            KernelPlanDecision::Approve => PlanDecision::Approve,
                            KernelPlanDecision::ApproveAndClearContext => {
                                PlanDecision::ApproveAndClearContext
                            }
                            KernelPlanDecision::Reject => PlanDecision::Reject,
                        },
                    })
                    .is_err()
                {
                    return;
                }
            }
        });
    }
    tool_result_rx
}

fn bridge_user_message_receiver(
    rx: Option<std::sync::mpsc::Receiver<KernelChatMessage>>,
    pending_user_messages: Arc<Mutex<Vec<JcliChatMessage>>>,
) {
    if let Some(rx) = rx {
        std::thread::spawn(move || {
            while let Ok(message) = rx.recv() {
                let mut queue = match pending_user_messages.lock() {
                    Ok(queue) => queue,
                    Err(_) => return,
                };
                queue.push(to_pending_jcli_message(&message));
            }
        });
    }
}

fn to_pending_jcli_message(message: &KernelChatMessage) -> JcliChatMessage {
    JcliChatMessage {
        role: match message.role.as_str() {
            "user" => MessageRole::User,
            "assistant" => MessageRole::Assistant,
            "tool" => MessageRole::Tool,
            "system" => MessageRole::System,
            _ => MessageRole::User,
        },
        content: message.content.clone(),
        tool_calls: None,
        tool_call_id: None,
        images: None,
        reasoning_content: message.reasoning.clone(),
        sender_name: None,
        recipient_name: None,
        display_hint: DisplayHint::Normal,
    }
}

async fn stream_openai_chat_completions(
    request: KernelChatStreamRequest<'_>,
    callbacks: KernelChatStreamCallbacks<'_>,
) -> Result<String, KernelError> {
    let KernelChatStreamRequest {
        provider,
        messages,
        system_prompt,
        options,
    } = request;
    let KernelChatStreamCallbacks {
        on_chunk,
        on_reasoning,
    } = callbacks;
    let jcli_provider = to_jcli_provider(provider);
    let client = LlmClient::new(&jcli_provider.api_base, &jcli_provider.api_key);
    let request = ChatRequest {
        model: jcli_provider.model.clone(),
        messages: build_llm_messages(messages, system_prompt)?,
        tools: None,
        stream: Some(true),
        max_tokens: None,
        extra: build_chat_request_extra(provider, options),
    };
    let mut stream = client
        .chat_completion_stream(&request)
        .await
        .map_err(|e| KernelError::Chat(Box::new(std::io::Error::other(e.to_string()))))?;
    let mut full_content = String::new();
    while let Some(result) = stream.next().await {
        let response = result
            .map_err(|e| KernelError::Chat(Box::new(std::io::Error::other(e.to_string()))))?;
        for choice in response.choices {
            if let Some(content) = choice.delta.content.as_deref() {
                full_content.push_str(content);
                on_chunk(content);
            }
            if let Some(reasoning) = choice.delta.reasoning_content.as_deref() {
                on_reasoning(reasoning);
            }
        }
    }
    Ok(full_content)
}

fn build_llm_messages(
    messages: &[KernelChatMessage],
    system_prompt: Option<&str>,
) -> Result<Vec<Message>, KernelError> {
    let mut llm_messages =
        Vec::with_capacity(messages.len() + usize::from(system_prompt.is_some()));
    if let Some(system_prompt_text) = system_prompt.map(str::trim).filter(|text| !text.is_empty()) {
        llm_messages.push(Message {
            role: Role::System,
            content: Some(Content::Text(system_prompt_text.to_string())),
            name: None,
            tool_calls: None,
            tool_call_id: None,
            reasoning_content: None,
        });
    }
    llm_messages.extend(to_llm_messages(messages)?);
    Ok(llm_messages)
}

fn build_agent_loop_state(
    params: &KernelAgentParams,
    agent_config: &JcliAgentConfig,
) -> AgentLoopState {
    let streaming_content = Arc::new(Mutex::new(String::new()));
    let streaming_reasoning_content = Arc::new(Mutex::new(String::new()));
    let pending_user_messages = Arc::new(Mutex::new(Vec::new()));
    let background_manager = Arc::new(BackgroundManager::new());
    let display_messages = Arc::new(Mutex::new(Vec::new()));
    let context_messages = Arc::new(Mutex::new(Vec::new()));
    let estimated_context_tokens = Arc::new(Mutex::new(0usize));
    let invoked_skills = new_invoked_skills_map();
    let derived_system_prompt = Arc::new(Mutex::new(params.system_prompt.clone()));
    let deferred_tools = Arc::new(Mutex::new(agent_config.deferred_tools.clone()));
    let session_loaded_deferred = Arc::new(Mutex::new(Vec::new()));
    let sub_agent_metrics = Arc::new(Mutex::new(SubAgentMetrics::default()));
    let (ask_tx, ask_rx) = std::sync::mpsc::channel::<AskRequest>();
    let task_manager = Arc::new(TaskManager::new());
    let hook_manager_for_tools = Arc::new(Mutex::new(HookManager::load()));
    let tool_registry = Arc::new(ToolRegistry::new(
        load_all_skills(),
        ask_tx,
        Arc::clone(&background_manager),
        task_manager,
        hook_manager_for_tools,
        Arc::clone(&invoked_skills),
        todos_file_path(),
    ));
    spawn_unavailable_ask_tool_responder(ask_rx);
    AgentLoopState {
        streaming_content,
        streaming_reasoning_content,
        pending_user_messages,
        background_manager,
        display_messages,
        context_messages,
        estimated_context_tokens,
        invoked_skills,
        derived_system_prompt,
        deferred_tools,
        session_loaded_deferred,
        sub_agent_metrics,
        tool_registry,
    }
}

fn build_agent_loop_config(
    agent_config: &JcliAgentConfig,
    provider: ModelProvider,
    cancel_token: CancellationToken,
) -> AgentLoopConfig {
    AgentLoopConfig {
        provider,
        max_llm_rounds: agent_config.max_tool_rounds,
        compact_config: agent_config.compact.clone(),
        hook_manager: HookManager::load(),
        disabled_hooks: agent_config.disabled_hooks.clone(),
        cancel_token,
    }
}

fn build_agent_loop_shared_state(
    params: &KernelAgentParams,
    agent_config: &JcliAgentConfig,
    state: &AgentLoopState,
) -> AgentLoopSharedState {
    AgentLoopSharedState {
        streaming_content: Arc::clone(&state.streaming_content),
        streaming_reasoning_content: Arc::clone(&state.streaming_reasoning_content),
        pending_user_messages: Arc::clone(&state.pending_user_messages),
        background_manager: Arc::clone(&state.background_manager),
        todo_manager: Arc::new(TodoManager::new()),
        display_messages: Arc::clone(&state.display_messages),
        context_messages: Arc::clone(&state.context_messages),
        estimated_context_tokens: Arc::clone(&state.estimated_context_tokens),
        invoked_skills: Arc::clone(&state.invoked_skills),
        session_id: params.session_id.clone(),
        derived_system_prompt: Arc::clone(&state.derived_system_prompt),
        tool_registry: Arc::clone(&state.tool_registry),
        disabled_tools: agent_config.disabled_tools.clone(),
        deferred_tools: Arc::clone(&state.deferred_tools),
        session_loaded_deferred: Arc::clone(&state.session_loaded_deferred),
        tools_enabled: agent_config.tools_enabled,
        sub_agent_metrics: Arc::clone(&state.sub_agent_metrics),
    }
}

fn build_system_prompt_fn(
    system_prompt: Option<String>,
) -> Arc<dyn Fn() -> Option<String> + Send + Sync> {
    Arc::new(move || system_prompt.clone())
}

fn create_stream_bridge(params: &KernelAgentParams) -> std::sync::mpsc::Sender<StreamMsg> {
    let (tx, rx) = std::sync::mpsc::channel::<StreamMsg>();
    JcliAdapter::spawn_bridge_thread(
        rx,
        params.event_interceptor.clone(),
        params.on_event.clone(),
    );
    tx
}

fn spawn_unavailable_ask_tool_responder(ask_rx: std::sync::mpsc::Receiver<AskRequest>) {
    std::thread::spawn(move || {
        while let Ok(req) = ask_rx.recv() {
            let _ = req
                .response_tx
                .send("Ask tool not available in GUI agent mode".to_string());
        }
    });
}

fn todos_file_path() -> std::path::PathBuf {
    let config_dir = JcliConfig::find_config_dir().or_else(JcliConfig::ensure_config_dir);
    match config_dir {
        Some(dir) => {
            let _ = std::fs::create_dir_all(&dir);
            dir.join("todos.json")
        }
        None => {
            let dir = YamlConfig::data_dir().join("agent").join("data");
            let _ = std::fs::create_dir_all(&dir);
            dir.join("todos.json")
        }
    }
}
