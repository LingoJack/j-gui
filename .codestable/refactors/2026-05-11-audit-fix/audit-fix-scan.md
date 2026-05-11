---
doc_type: refactor-scan
refactor: 2026-05-11-audit-fix
status: pending-user-selection
scope: agent_engine.rs / kernel/adapter.rs / chat_engine.rs / commands/agent.rs / commands/channels.rs — 5 文件，约 800 行关键区域
summary: 发现 5 条优化点：结构 2 / 可读性 3；全部低风险；AI 可自证
---

# 审计修复重构 scan

## 总览

- **扫描范围**：`src-tauri/src/agent_engine.rs`、`src-tauri/src/kernel/adapter.rs`、`src-tauri/src/chat_engine.rs`、`src-tauri/src/commands/agent.rs`、`src-tauri/src/commands/channels.rs`
- **发现 5 条优化点**：结构 2 / 可读性 3
- **按风险**：全部低（纯局部改动，有测试覆盖）
- **建议先做**：#1 #2 #3（低风险、独立、涉及行数最少）
- **建议慎做**：无高风险项，全部可独立执行
- **前置检查 7 条全过**：✓

## 条目

### #1 提取 agent_engine::start() 中的 stdout 解析闭包为独立方法

- **位置**：`src-tauri/src/agent_engine.rs:107-211`（闭包内联在 `start()` 方法中）
- **分类**：结构
- **现状**：`start()` 方法 ~170 行，其中包含一个 104 行的内联闭包处理 stdout 解析（逐行读取 → parse_sdk_line → 路由 tool_use/interrupt → 写 timeline → channel.send）。外层 66 行负责子进程启动
- **问题**：函数总长 ~170 行，内联闭包 104 行包含事件解析、工具路由、timeline 写入、channel 发送四个职责，无法独立测试
- **建议**：提取闭包为私有方法 `fn spawn_stdout_reader(stdout, on_event, permission_mode, session_id) -> JoinHandle<()>`，start() 中仅调用 `let handle = Self::spawn_stdout_reader(...)`
- **建议映射的方法**：M-L2-01（Extract Function）
- **风险**：低（纯结构重组，闭包已是 move || { ... }，捕获变量明确，提取后签名稳定）
- **验证**：AI 自证（cargo test agent_engine — 18 个测试覆盖事件解析和 CLI 交互）
- **范围**：约 104 行 / 1 文件

### #2 提取 adapter::run_agent_loop() 中的基础设施构建为辅助方法

- **位置**：`src-tauri/src/kernel/adapter.rs:432-572`
- **分类**：结构
- **现状**：`run_agent_loop()` 方法 ~141 行，在一个函数中执行 9 个顺序步骤：加载 provider → 构建 Arc 共享状态 → 加载 skills → 构建 ToolRegistry → 构建 AgentLoopConfig → 构建 MainAgentLoopParams → spawn bridge 线程 → 调用 run_main_agent_loop
- **问题**：9 个步骤混在一个函数中，圈复杂度正常但线性步骤过长（141 行），每步的局部变量集中在同一作用域增加认知负担
- **建议**：提取 3 个私有辅助方法：`build_agent_shared_state(params) -> AgentSharedState`（第 2 步 14 个 Arc/Mutex）、`build_tool_registry(skills, ...) -> ToolRegistry`（第 3-4 步）、`spawn_bridge_thread(...) -> JoinHandle<()>`（第 7 步）。参数不超过 4 个
- **建议映射的方法**：M-L2-01（Extract Function）
- **风险**：低（每个提取的辅助方法是纯构造/初始化逻辑，无副作用依赖；adapter 测试覆盖 `test_toggle_session_bool_field_*` 验证整体 JcliAdapter 行为）
- **验证**：AI 自证（cargo test kernel::adapter）
- **范围**：约 100 行 / 1 文件

### #3 提取 CLIsubprocess 优雅退出宽限期为命名常量

- **位置**：`src-tauri/src/agent_engine.rs:387`
- **分类**：可读性
- **现状**：`std::thread::sleep(std::time::Duration::from_millis(500))` — 裸数字 500 控制子进程 kill 前的等待时间
- **问题**：如果将来需要调整宽限期，需要在已编译代码中搜索 500 这个值，容易漏掉或误解
- **建议**：添加 `const CLAUDE_GRACE_PERIOD_MS: u64 = 500;` 在文件顶部 impl 块外
- **建议映射的方法**：M-L2-04（Extract Constant）
- **风险**：低（值不变，纯替换）
- **验证**：AI 自证（cargo test agent_engine + cargo clippy）
- **范围**：2 行 / 1 文件

### #4 提取日志行截断长度 + LLM 标题魔法值为命名常量

- **位置**：3 处
  - `src-tauri/src/agent_engine.rs:464` — `line.len().min(200)` 日志截断
  - `src-tauri/src/agent_engine.rs:492` — `line.len().min(120)` 日志截断
  - `src-tauri/src/commands/agent.rs:273` — `chars().take(30)` fallback 标题截断
  - `src-tauri/src/commands/agent.rs:291` — `max_tokens: 30` LLM 标题生成长度
- **分类**：可读性
- **现状**：4 个不相关的魔法数字散落在 2 个文件中，用途和调整逻辑各不相同，当前都是裸字面量
- **问题**：裸数字不清楚"为什么是这个值"，调整时容易遗漏关联的约束（如 LLM prompt 说 max 10 words 但 max_tokens 是 30，关系不直观）
- **建议**：各添加命名常量：
  - `const LOG_LINE_TRUNCATE_SDK: usize = 200;`
  - `const LOG_LINE_TRUNCATE_UNKNOWN: usize = 120;`
  - `const FALLBACK_TITLE_MAX_CHARS: usize = 30;`
  - `const GENERATED_TITLE_MAX_TOKENS: u32 = 30;`
- **建议映射的方法**：M-L2-04（Extract Constant）
- **风险**：低（纯常量替换，值不变）
- **验证**：AI 自证（cargo test + cargo clippy）
- **范围**：约 8 行 / 2 文件

### #5 提取测试连接回退模型 + total_tokens 占位为命名常量

- **位置**：3 处
  - `src-tauri/src/commands/channels.rs:337` — `"claude-3-5-sonnet-20241022"` 回退模型
  - `src-tauri/src/commands/channels.rs:339` — `"gpt-3.5-turbo"` 回退模型
  - `src-tauri/src/chat_engine.rs:189` — `total_tokens: 0` Done 事件
- **分类**：可读性
- **现状**：两个硬编码模型 ID 作为 `try_chat_completion()` 的回退值；`ChatEvent::Done { total_tokens: 0 }` 已有 TODO 注释说明 kernel API 限制
- **问题**：模型 ID 会过时且分散在代码中；`total_tokens: 0` 虽然已有注释但无符号名，代码中不能自说明
- **建议**：添加：
  - `const FALLBACK_MODEL_ANTHROPIC: &str = "claude-3-5-sonnet-20241022";`
  - `const FALLBACK_MODEL_OPENAI: &str = "gpt-3.5-turbo";`
  - `const TOKEN_COUNT_UNSUPPORTED: u32 = 0;`（自文档化 kernel API 限制）
- **建议映射的方法**：M-L2-04（Extract Constant）
- **风险**：低（纯常量替换）
- **验证**：AI 自证（cargo test channels + cargo test chat）
- **范围**：约 6 行 / 2 文件
