---
doc_type: refactor-design
refactor: 2026-05-11-audit-fix
status: approved
scope: 5 文件（agent_engine.rs / adapter.rs / chat_engine.rs / commands/agent.rs / commands/channels.rs）
summary: 2 处长函数拆分 + 9 个魔法值提取为命名常量，纯结构/可读性重构，行为完全等价
---

# audit-fix refactor design

## 1. 本次范围

从 scan 勾选了 5 条：

| # | 标题 | 方法 | 风险 |
|---|------|------|------|
| 1 | 提取 stdout 解析闭包为独立方法 | M-L2-01 | 低 |
| 2 | 提取 run_agent_loop 基础设施构建辅助方法 | M-L2-01 | 低 |
| 3 | 优雅退出宽限期常量 | M-L2-04 | 低 |
| 4 | 日志截断 + LLM 标题魔法值常量 | M-L2-04 | 低 |
| 5 | 回退模型 + total_tokens 占位常量 | M-L2-04 | 低 |

- **不做**：无（全部勾选）
- **预估总工作量**：约 220 行改动 / 5 文件 / 3 步执行
- **总风险**：低（全局部改动，覆盖测试 151 条）

## 2. 前置依赖

- ✅ 测试覆盖：151 Rust 测试覆盖 agent_engine (18 条)、kernel::adapter、chat、channels
- ✅ 无跨模块依赖：所有改动在单文件内
- ✅ 无新增依赖、无公开接口变更

## 3. 执行顺序

按低风险优先、AI 可自证优先排序。3 步，前 2 步无依赖可任意顺序。

### 步骤 1：提取魔法值常量（#3 #4 #5 合并）

- **引用方法**：M-L2-04（Extract Constant）
- **具体操作**：
  1. `agent_engine.rs` 顶部添加常量：
     ```rust
     const CLAUDE_GRACE_PERIOD_MS: u64 = 500;
     const LOG_LINE_TRUNCATE_SDK: usize = 200;
     const LOG_LINE_TRUNCATE_UNKNOWN: usize = 120;
     ```
  2. `agent_engine.rs:387` — `Duration::from_millis(500)` → `Duration::from_millis(CLAUDE_GRACE_PERIOD_MS)`
  3. `agent_engine.rs:464` — `line.len().min(200)` → `line.len().min(LOG_LINE_TRUNCATE_SDK)`
  4. `agent_engine.rs:492` — `line.len().min(120)` → `line.len().min(LOG_LINE_TRUNCATE_UNKNOWN)`
  5. `commands/agent.rs` 顶部添加常量：
     ```rust
     const FALLBACK_TITLE_MAX_CHARS: usize = 30;
     const GENERATED_TITLE_MAX_TOKENS: u32 = 30;
     ```
  6. `commands/agent.rs:273` — `.take(30)` → `.take(FALLBACK_TITLE_MAX_CHARS)`
  7. `commands/agent.rs:291` — `"max_tokens": 30` → `"max_tokens": GENERATED_TITLE_MAX_TOKENS`
  8. `commands/channels.rs` 顶部添加常量：
     ```rust
     const FALLBACK_MODEL_ANTHROPIC: &str = "claude-3-5-sonnet-20241022";
     const FALLBACK_MODEL_OPENAI: &str = "gpt-3.5-turbo";
     ```
  9. `commands/channels.rs:337,339` — 替换硬编码字符串
  10. `chat_engine.rs` 添加常量：
      ```rust
      const TOKEN_COUNT_UNSUPPORTED: u32 = 0;
      ```
  11. `chat_engine.rs:189` — `total_tokens: 0` → `total_tokens: TOKEN_COUNT_UNSUPPORTED`
- **退出信号**：`cargo test` 全通过 + `cargo clippy -- -D warnings` 零新告警
- **验证责任**：AI 自证
- **回滚**：`git revert` 单次提交

### 步骤 2：提取 agent_engine::start() stdout 闭包（#1）

- **引用方法**：M-L2-01（Extract Function）
- **具体操作**：
  1. 在 `impl AgentEngine` 块内添加私有方法签名：
     ```rust
     fn spawn_stdout_reader(
         stdout: ChildStdout,
         on_event: Channel<AgentEvent>,
         permission_mode: String,
         session_id: String,
     ) -> JoinHandle<()>
     ```
  2. 将 `start()` 中第 107-211 行的闭包体移到新方法中
  3. 在 `start()` 中将闭包替换为 `let stdout_thread = Self::spawn_stdout_reader(stdout, on_event.clone(), mode, sid);`
  4. 确认方法签名不用 `&self`（闭包捕获外部变量通过参数传入，保证纯函数）
- **退出信号**：`cargo test agent_engine` 18 tests 全通过
- **验证责任**：AI 自证
- **回滚**：`git revert` 单次提交

### 步骤 3：提取 run_agent_loop 辅助方法（#2）

- **引用方法**：M-L2-01（Extract Function）
- **具体操作**：
  1. 提取第 2 步（14 个 Arc/Mutex 构建）→ `fn build_agent_shared_state(params: &KernelAgentParams) -> AgentSharedState`
     其中 `AgentSharedState` 是包含 14 个 Arc 字段的私有 struct
  2. 提取第 7 步（bridge 线程 spawn）→ `fn spawn_bridge_thread(...) -> JoinHandle<()>`
  3. `run_agent_loop()` 变为：加载 provider → 构建共享状态 → 加载 skills → 构建 ToolRegistry → 构建 loop config → spawn bridge → 调用 run_main_agent_loop
  4. 不改第 3-4 步（ToolRegistry 构建与 skills 强耦合）和第 5-6 步（config/params 构造简单）
- **退出信号**：`cargo test kernel::adapter` 全通过 + `cargo clippy` 零新告警
- **验证责任**：AI 自证
- **回滚**：`git revert` 单次提交

## 4. 风险与看点

- **步骤 1**：零风险。纯常量替换，编译器保证类型一致
- **步骤 2**：stdout 闭包当前是 `move || { ... }`，捕获 `reader, event_channel, mode, sid, stdin`。提取后通过参数传递，需确认 `stdin` 在闭包内的使用方式（`stdin.write_all` 在 `send_message` / `respond_interrupt` 中通过 `self.stdin` 调用，闭包本身不写 stdin，只持有 stdin 实例的 move 所有权以维持管道开启）。需要将 stdin 也作为参数传入或保持 move 捕获
- **步骤 3**：`AgentSharedState` struct 包含 14 个 `Arc<Mutex<...>>` 字段，类型复杂但无逻辑，纯数据容器。如果觉得定义 struct 过重，可降级为仅提取 `spawn_bridge_thread` 一个方法，将 run_agent_loop 从 141 行减至 ~100 行

**步骤 3 潜在回退**：如果 `AgentSharedState` struct 定义被 clippy 认为"too many fields"或导致类型噪音过大，可以只提取 `spawn_bridge_thread()` 保持轻量。
