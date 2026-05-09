---
doc_type: architecture
slug: backend-agent-engine
scope: j-gui 后端 Agent 引擎与会话持久化
summary: AgentEngine 负责启动 claude CLI、解析 stream-json 事件、转发到前端并把 timeline 持久化到 agent session 目录
status: current
last_reviewed: 2026-05-10
tags: [backend, agent, claude-cli, streaming, session]
depends_on: []
implements: [j-gui-ai-interaction]
---

# Agent Engine — 后端 Agent 引擎

## 1. 定位与受众

`backend-agent-engine` 是 j-gui 当前 Agent 模式的后端执行面。它不复用 ChatEngine，而是直接启动外部 `claude` CLI，读取 `stream-json` 输出，把事件转成 `AgentEvent` 发给前端，同时把关键轨迹写回本地 timeline。

Agent 命令入口同时暴露了平级的管理能力：Skills/Hooks/MCP 列表、Chat Tools 启用/禁用的 governance 接口。

受众：

- feature-design：理解 Agent 运行边界
- issue-analyze：定位 Agent 无响应、审批、会话恢复问题
- 新人上手：理解前后端事件与持久化链路

## 2. 结构与交互

### 2.1 命令入口

`src-tauri/src/commands/agent.rs` 提供全部 Agent command，`src-tauri/src/commands/governance.rs` 提供 Agent 关联的管理能力。两者通过 `src-tauri/src/lib.rs:22-78` 注册到 Tauri invoke_handler。

#### Agent 命令

共享状态是单个 `AgentState(pub Arc<Mutex<Option<AgentEngine>>>)`，定义在 `src-tauri/src/commands/agent.rs:7`。当前进程内同一时刻只保存一个运行中的 `AgentEngine`。

| 命令 (src-tauri/src/commands/agent.rs) | 行范围 | 说明 |
|--------|--------|------|
| `start_agent` | 30-46 | 启动引擎；无 session_id 时自动创建 |
| `create_agent_session` | 48-51 | 创建空会话目录 |
| `list_agent_sessions` | 53-56 | 列出所有会话（含标题自动推导） |
| `get_agent_session` | 58-61 | 读取完整 timeline |
| `delete_agent_session` | 63-66 | 删除会话目录 |
| `respond_agent_interrupt` | 68-139 | 统一中断响应路由，按 kind 分派 |
| `send_agent_message` | 141-149 | 发送用户消息到运行引擎 |
| `stop_agent` | 151-158 | 停止运行引擎 |
| `generate_agent_title` | 207-268 | 异步调用 LLM 生成会话标题 |
| `update_agent_session_title` | 271-280 | 持久化标题到 meta.json |
| `respond_permission` | 284-300 | 专门处理工具审批中断 |
| `respond_ask_user` | 304-322 | 专门处理 AskUser 中断 |

关键类型：

- `AgentInterruptResponse` 枚举 (`src-tauri/src/commands/agent.rs:10-28`) 有三个变体，对应三种中断响应格式：`Permission { allowed, always_allow }`、`AskUser { selected_options, custom_text }`、`Plan { decision, feedback }`。
- `PermissionRequest` (`src-tauri/src/commands/agent.rs:174-183`) 和 `AskUserRequest` (`src-tauri/src/commands/agent.rs:195-203`) 是专用请求结构体。

#### Governance 命令

`src-tauri/src/commands/governance.rs:1-514` 提供 Skills/Hooks/MCP/Tools 的管理命令：

| 命令 (src-tauri/src/commands/governance.rs) | 行范围 |
|--------|--------|
| `list_skills` | 69-73 |
| `list_hooks` | 75-95 |
| `list_mcp_servers` | 129-148 |
| `save_mcp_servers` | 150-215 |
| `list_chat_tools` | 315-328 |
| `set_tool_enabled` | 330-350 |
| `scan_global_skills` | 412-419 |
| `copy_skill_to_workspace` | 421-447 |

`list_chat_tools` 返回的 25 个内置工具定义在 `src-tauri/src/commands/governance.rs:220-305` 的静态数组 `BUILTIN_TOOLS` 中。

### 2.2 运行链路

```text
start_agent
  -> create_agent_session?                   (无 session_id 时创建)
  -> AgentEngine::start(...)
     -> load_agent_config()                   (j-cli YamlConfig)
     -> which_claude()                        (查找 claude CLI 可执行文件)
     -> Command::new(claude_path)
     -> build_claude_args(model, permission_mode)   (无 -p flag)
     -> 注入 ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL env
     -> spawn child process
     -> stdout thread 解析 stream-json
     -> stderr thread 读取错误输出 (eprintln!)
     -> Arc<Mutex<Option<AgentEngine>>> 保存当前引擎
```

核心入口在 `src-tauri/src/agent_engine.rs:52-232`。

`which_claude()` (`src-tauri/src/agent_engine.rs:493-552`) 的查找顺序：

1. `where claude` / `which claude`（跨平台）
2. `where claude-code` / `which claude-code`
3. `where claude-cli` / `which claude-cli`
4. Windows 保底：`%APPDATA%/npm/claude.cmd`、`%APPDATA%/npm/claude-code.cmd` 等 shim 路径

`build_claude_args()` (`src-tauri/src/agent_engine.rs:305-324`) 构造的参数：

- `--output-format stream-json`
- `--input-format stream-json`
- `--verbose`
- `--permission-mode <mode>`
- `--model <model>`（如果配置中指定了）

**不包含** `-p`（一次性模式已被移除，因为它阻止多轮对话状态维持）。**不包含** `--include-partial-messages`。

### 2.3 stdout 事件链

stdout 后台线程位于 `src-tauri/src/agent_engine.rs:92-210`：

1. 逐行读取 CLI 输出
2. `parse_sdk_line(&line)` 解析为 `Vec<AgentEvent>` (`src-tauri/src/agent_engine.rs:332-379`)
3. 非 `bypassPermissions` 模式下，把 `ToolUse` 转成 `Interrupt` (`src-tauri/src/agent_engine.rs:108-126`) — 按 `tool_name` 路由 kind：
   - `"ask_user"` / `"AskUser"` → `kind = "ask_user"`
   - 其余 → `kind = "permission"`
4. 先构造 timeline item 或 tool result 更新
5. `event_channel.send(event)` 推给前端 (`src-tauri/src/agent_engine.rs:184-186`)
6. 再把 tool result / timeline 写回 agent session (`src-tauri/src/agent_engine.rs:187-207`)

失败路径统一通过 `j_cli::util::log::write_error_log()` 写错误日志（取代早期 `let _ =` 静默忽略）。

`parse_sdk_line()` (`src-tauri/src/agent_engine.rs:332-379`) 的事件分派：

| msg_type | 处理函数 | 产出 AgentEvent |
|----------|----------|----------------|
| `"assistant"` | `parse_assistant_event()` (`381-447`) | 0-N 个 `AssistantContent` / `ToolUse` |
| `"result"` | 内联 | `Done{total_tokens}` 或 `Error{message}` |
| `"user"` | `parse_user_event()` (`449-467`) | `ToolResult` 或无（纯 user message 忽略） |
| `"plan"` | `parse_plan_event()` (`469-491`) | `Interrupt{kind:"plan", tool_name:"plan"}` |
| `"system"` / `"stream_event"` | 忽略 | 空 Vec |
| 其他 | 警告日志 | 空 Vec |

`parse_assistant_event()` 的工具调用解析：

- 尝试多个 key 变体获取 `tool_id`：`id` → `tool_use_id` → `tool_use.id`
- 尝试多个 key 变体获取 `tool_name`：`name` → `tool_name` → `tool_use.name`
- **合成回退**：当 `tool_id` 为空时，以 JSON 序列化字节的 hex hash 生成 `tool_<hash>`；当 `tool_name` 为空时使用 `"Tool"`
- 调试写入：每次解析工具调用时，将 `item` 的 JSON 写入 `%TEMP%/jgui-agent-tooluse.json`

`parse_plan_event()` (`src-tauri/src/agent_engine.rs:469-491`)：

- 从 event JSON 中读取 `id`（无 id 时默认 `"plan"`）、`plan_summary`、`steps`
- 构造 `tool_input` 为 `{"plan_summary": "...", "steps": [...]}`
- 产出 `Interrupt{interrupt_id, kind:"plan", tool_name:"plan", tool_input}`

### 2.4 会话持久化链

持久化层在 `src-tauri/src/agent_session.rs:12-296`，目录为：

```
YamlConfig::data_dir()/agent/sessions/{session_id}/
```

会话 ID 格式：`{timestamp_micros}-{pid}-{counter}`（hex，`src-tauri/src/agent_session.rs:71-78`）。

当前文件：

- `meta.json` — 元数据：`{"created_at": <ms>, "title": <string|null>}`
- `transcript.jsonl` — 每行一个 JSON 格式的 `AgentTimelineItem`

ID 校验函数 `validate_session_id()` (`src-tauri/src/agent_session.rs:52-58`) 仅允许 ascii hex digit 和 `-`。

全局锁 `AGENT_TRANSCRIPT_LOCK` (`src-tauri/src/agent_session.rs:10`) 是一个 `Mutex<()>`，串行化所有 transcript.jsonl 的写操作。

写入 API：

- `append_timeline_item()` (`src-tauri/src/agent_session.rs:101-118`) — 获取锁，append 一行到 transcript.jsonl
- `update_tool_call_result()` (`src-tauri/src/agent_session.rs:149-169`) — 获取锁，全读→修改→全写（rewrite file）
- `update_interrupt_response()` (`src-tauri/src/agent_session.rs:171-190`) — 同上模式

读取 / 列表 API：

- `list_agent_sessions()` (`src-tauri/src/agent_session.rs:192-258`) — 遍历会话目录，读取 meta.json，**自动推导标题**：当 meta 中 `title` 为 null 时，读取 transcript.jsonl 第一条 `kind == "user_message"` 的内容（截取前 24 字符）作为显示标题
- `get_agent_session()` (`src-tauri/src/agent_session.rs:260-270`) — 获取锁后全量读取 timeline
- `delete_agent_session()` (`src-tauri/src/agent_session.rs:286-296`) — 获取锁后删除目录
- `update_session_title()` (`src-tauri/src/agent_session.rs:272-284`) — 直接写 meta.json（不持有 transcript 锁）

`generate_agent_title()` (`src-tauri/src/commands/agent.rs:207-268`) 是异步命令，通过 `reqwest` 调用 LLM 的 `/chat/completions` 接口，用会话首条 user + assistant 消息对生成标题，失败时 fallback 到首条用户消息前缀。

## 3. 数据与状态

### `AgentEvent`

定义在 `src-tauri/src/agent_engine.rs:11-38`，六种事件：

- `AssistantContent { text }`
- `ToolUse { tool_id, tool_name, tool_input }`
- `Interrupt { interrupt_id, kind, tool_name, tool_input }`
- `ToolResult { tool_id, content }`
- `Done { total_tokens }`
- `Error { message }`

序列化形式：`#[serde(tag = "event", content = "data", rename_all = "camelCase")]` — 前端接收 `{event: "assistantContent", data: {text: "..."}}` 等。

### `AgentEngine`

定义在 `src-tauri/src/agent_engine.rs:40-49`，六个字段：

- `process: Option<Child>`
- `stdin: Option<ChildStdin>`
- `stdout_thread: Option<JoinHandle<()>>`
- `stderr_thread: Option<JoinHandle<()>>`
- `session_id: String`
- `transcript_path: PathBuf`

`close()` 方法 (`src-tauri/src/agent_engine.rs:278-302`) 执行关闭三步：

1. drop stdin 发送 EOF
2. 等待 500ms 优雅退出，未退出则 `process.kill()` + `process.wait()`
3. join stdout/stderr 线程

`Drop` 实现 (`src-tauri/src/agent_engine.rs:326-330`) 委托给 `self.close()`。

### `AgentTimelineItem`

定义在 `src-tauri/src/agent_session.rs:12-21`：

- `id`
- `kind`（`"user_message"` / `"assistant_content"` / `"tool_call"` / `"interrupt"`）
- `content`
- `tool_call`
- `interrupt`
- `created_at`

### `ToolCallSnapshot` / `InterruptSnapshot`

分别定义在 `src-tauri/src/agent_session.rs:23-31`、`33-41`，用于 timeline 中的工具调用和中断快照。

### `AgentSessionInfo`

定义在 `src-tauri/src/agent_session.rs:43-50`，返回给前端的会话列表条目：

- `id`
- `title`（可能为 None，前端据此触发 `generate_agent_title`）
- `message_count`
- `updated_at`

## 4. 关键决策

- 使用外部 `claude` CLI，而不是在 j-gui 内部直接嵌入模型客户端。证据：`which_claude()` 与 `Command::new(&claude_path)` 在 `src-tauri/src/agent_engine.rs:64-82`。
- 采用 `stream-json` 输入输出协议。证据：`build_claude_args()` 在 `src-tauri/src/agent_engine.rs:305-324`。
- **不传 `-p` 参数**：`-p` 迫使 claude CLI 进入一次性模式，阻止多轮对话状态维持。移除后 `send_message()` 才能实现 multi-turn memory。证据：`build_claude_args()` 注释在 `src-tauri/src/agent_engine.rs:307-308`。
- 非 `bypassPermissions` 模式下，`ToolUse` 按 `tool_name` 路由中断 kind：`ask_user`/`AskUser` → `"ask_user"`，其余 → `"permission"`。证据：`src-tauri/src/agent_engine.rs:113-117`。
- **Plan 事件支持**：SDK `"type":"plan"` 事件被独立解析为 `Interrupt{kind:"plan", tool_name:"plan"}`，在前端展示计划审批流程。证据：`parse_plan_event()` 在 `src-tauri/src/agent_engine.rs:469-491`。
- **Tool Use 解析鲁棒性增强**：支持多个 JSON key 变体获取 tool_id/tool_name，并在缺失时通过 hash 合成回退 ID。证据：`src-tauri/src/agent_engine.rs:399-425`。
- **`respond_interrupt` 签名更改为 content**：`respond_interrupt(&mut self, interrupt_id: &str, content: &str)` 不再只传布尔值，而是构建任意响应文本写入 stdin 的 `tool_result`。证据：`src-tauri/src/agent_engine.rs:260-276`。
- **统一中断响应路由**：前端不再直接调用 `respond_interrupt` 的多个变体，而是通过 `respond_agent_interrupt`（`src-tauri/src/commands/agent.rs:68-139`）接收 `kind` + `response` JSON，由后端将不同格式转为对应 `content` 字符串再传递到引擎。同时保留专用命令 `respond_permission`（`284-300`）和 `respond_ask_user`（`304-322`）以满足前端不同组件需求。
- timeline 写入和更新通过全局 `AGENT_TRANSCRIPT_LOCK` 串行化，避免并发写坏 `transcript.jsonl`。同时 `get_agent_session()` 和 `delete_agent_session()` 也持该锁，避免读写竞争。证据：`src-tauri/src/agent_session.rs:10`、`101-118`、`149-190`、`260-270`、`286-296`。
- `send_message()` 和 `respond_interrupt()` 都先更新 session 存储，再写 stdin。证据：`src-tauri/src/agent_engine.rs:234-258`、`260-276`。
- **错误日志显式写入**：timeline 和 tool result 写入失败不再静默忽略，通过 `j_cli::util::log::write_error_log()` 记录详细 context。证据：`src-tauri/src/agent_engine.rs:187-207`。
- **进程停止加入优雅退出窗口**：先关闭 stdin 发送 EOF，给 claude CLI 500ms 缓冲期自然退出，超时后再 force-kill。证据：`src-tauri/src/agent_engine.rs:278-302`。
- **标题自动推导**：`list_agent_sessions()` 在 meta 中无 title 时，从 transcript.jsonl 的第一条 user_message 内容（截取 24 字符）推导显示标题。另提供 LLM 异步生成命令 `generate_agent_title()`。证据：`src-tauri/src/agent_session.rs:214-232`、`src-tauri/src/commands/agent.rs:207-268`。
- Session ID 严格校验：`validate_session_id()` 确保只有 hex digit 和 `-` 字符，防止路径遍历。证据：`src-tauri/src/agent_session.rs:52-58`。

## 5. 代码锚点

| 想看什么 | 从哪看 |
|----------|--------|
| Agent command 总入口（10 命令） | `src-tauri/src/commands/agent.rs:30-322` |
| Governance 命令（8 命令） | `src-tauri/src/commands/governance.rs:69-447` |
| 命令注册表 | `src-tauri/src/lib.rs:22-78` |
| 单槽位运行状态 | `src-tauri/src/commands/agent.rs:7` |
| AgentInterruptResponse 枚举（3 变体） | `src-tauri/src/commands/agent.rs:10-28` |
| 统一中断响应路由 | `src-tauri/src/commands/agent.rs:68-139` |
| 引擎启动流程 | `src-tauri/src/agent_engine.rs:52-232` |
| stdout 解析与前端转发 | `src-tauri/src/agent_engine.rs:92-210` |
| CLI 事件解析（含 plan 事件） | `src-tauri/src/agent_engine.rs:332-379` |
| 工具调用解析（含合成 ID 回退） | `src-tauri/src/agent_engine.rs:381-447` |
| Plan 事件解析 | `src-tauri/src/agent_engine.rs:469-491` |
| CLI 参数构造（无 -p） | `src-tauri/src/agent_engine.rs:305-324` |
| 进程优雅关闭（500ms grace） | `src-tauri/src/agent_engine.rs:278-302` |
| 查找 claude CLI 路径 | `src-tauri/src/agent_engine.rs:493-552` |
| 会话目录与 timeline 写入 | `src-tauri/src/agent_session.rs:60-118` |
| tool result / interrupt 回写 | `src-tauri/src/agent_session.rs:149-190` |
| 会话列表（含标题自动推导） | `src-tauri/src/agent_session.rs:192-258` |
| 会话读取与删除（锁定） | `src-tauri/src/agent_session.rs:260-296` |
| 标题持久化 | `src-tauri/src/agent_session.rs:272-284` |
| LLM 标题生成 | `src-tauri/src/commands/agent.rs:207-268` |
| 内置工具定义（25 个） | `src-tauri/src/commands/governance.rs:220-305` |

## 6. 已知约束

- 当前是单槽位 `AgentState`；再次 `start_agent` 会覆盖进程内当前引擎，而不是并行保存多个运行实例。证据：`src-tauri/src/commands/agent.rs:30-46`。
- `send_agent_message`、`respond_agent_interrupt`、`stop_agent` 都只作用于"当前已启动引擎"，不按 `session_id` 路由。证据：`src-tauri/src/commands/agent.rs:68-158`。
- stderr 线程当前直接 `eprintln!` 输出，而不是写文件日志。证据：`src-tauri/src/agent_engine.rs:212-218`。
- API Key 通过 `ANTHROPIC_API_KEY` 环境变量传入 Claude CLI 子进程，在同用户进程中可见。如果配置了 `api_base`，也通过 `ANTHROPIC_BASE_URL` 传入。证据：`src-tauri/src/agent_engine.rs:73-82`。
- `generate_agent_title()` 直接通过 HTTP 调用 LLM API 端点，不经过 claude CLI 子进程，因此消耗额外的 API 配额。证据：`src-tauri/src/commands/agent.rs:238-265`。
- `parse_assistant_event()` 的多 content block 仅记录警告日志，不作批量处理；下游消费者默认只处理第一个 block。证据：`src-tauri/src/agent_engine.rs:436-444`。
- `list_agent_sessions()` 的标题自动推导仅在内存中生效，不写回 `meta.json`；持久化需要前端后续调用 `update_agent_session_title`。证据：`src-tauri/src/agent_session.rs:214-232`。

## 7. 相关文档

- [ARCHITECTURE](./ARCHITECTURE.md)
- [backend-chat-engine](./backend-chat-engine.md)
- [agent-commands](/E:/Coding/AI/j-gui/docs/api/agent-commands.md)
