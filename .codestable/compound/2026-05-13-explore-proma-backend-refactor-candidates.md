---
doc_type: explore
type: question
date: 2026-05-13
slug: proma-backend-refactor-candidates
topic: Proma 后端里哪些实现值得迁回 j-gui
scope: 对照 E:\Coding\AI\Proma 主进程服务层与 j-gui src-tauri 后端入口
keywords: [Proma, j-gui, backend, refactor, agent, runtime, storage, workspace, mcp]
status: active
confidence: high
---

# Proma 后端可迁移实现盘点

## 问题与范围

问题：上级目录里的 `Proma` 更新到最新后，它的后端实现里有哪些值得迁到 `j-gui`，哪些又不该直接搬。

范围：只看 `Proma` 的 `apps/electron/src/main/lib/` 与 `j-gui` 的 `src-tauri/src/` 后端，不讨论前端 UI，也不在这份文档里拍板具体改造方案。

## 速答

**先修正一个判断：Proma 的 `AgentOrchestrator` 不是“整块不该参考”，而是“不该原样搬入，但应该拆成 Rust 编排能力逐块引入”。**

`j-gui` 当前 Agent 后端已经有基础闭环：会话级 runtime table、历史 replay/fork/rewind、CLI/JAgent 双后端、权限/AskUser/Plan 中断、前端流式状态消费都已存在。但它还没有达到 Proma 那种“围绕失败恢复、resume 兜底、运行时环境、存储防线、磁盘治理、权限模式状态机、队友收尾事件”的完整编排层级。

**最值得迁的不是某一个大文件，而是下面五类编排能力：**

1. **自动重试与恢复状态机**：429/5xx、网络抖动、thinking signature 不兼容、无效 resume 的自动恢复链。
2. **resume / rewind / file snapshot 的完整 continue 边界**：把“可继续工作”从时间线级收口推进到 SDK session 与文件状态级收口。
3. **Agent 会话存储防膨胀策略**：截断超大 text/tool_result/base64 图片块。
4. **更完整的运行时环境与 SDK env 编排**：Git Bash / WSL 推荐、`ANTHROPIC_*` 污染隔离、独立 `CLAUDE_CONFIG_DIR`。
5. **磁盘巡检/孤儿清理模型**：sessions / sdk config / workspace / attachment 的分类统计与清理。

**不建议直接照搬的仍然有两块：**

1. **整个 Electron 风格的 `AgentOrchestrator` 宿主结构**：`j-gui` 需要的是 Rust 版 orchestrator helper，不是把 TS 主进程服务层映射一份。
2. **Proma 的 workspace/skills 自管平台整体**：`j-gui` 这部分已绑定 `GovernanceKernel` + `JcliAdapter` + `j_cli` 数据边界，只该借鉴局部策略。

## 关键证据

### 1. Proma 的 Agent 编排层确实更完整，但不能按原宿主模型整体迁入

- `E:\Coding\AI\Proma\apps\electron\src\main\lib\agent-orchestrator.ts:459-476`：`AgentOrchestrator` 自己持有 adapter、eventBus、activeSessions、queuedMessageUuids、permission mode 等运行态。
- `E:\Coding\AI\Proma\apps\electron\src\main\lib\agent-orchestrator.ts:479-513`：它内部还负责构建 SDK 环境变量、清理 `ANTHROPIC_*`、设置 `CLAUDE_CONFIG_DIR`。
- 对照 `E:\Coding\AI\j-gui\src-tauri\src\agent_engine.rs:57-108`：`j-gui` 当前后端主抽象是 Rust `AgentEngine`，并区分 `Cli` / `JAgent` 两种 backend。

支撑结论：Proma 这层的确比 `j-gui` 现状更完整，但它不是“可摘取的单一模块”，而是 Electron 主进程时代的总编排器。`j-gui` 该做的是把其中的编排能力重组到 Rust 侧，而不是复制 TS 宿主结构。

### 2. Proma 的超大 SDK 消息截断策略很值得迁

- `E:\Coding\AI\Proma\apps\electron\src\main\lib\agent-session-manager.ts:214-233`：`appendSDKMessages()` 在落盘前按消息序列化长度做阈值检查。
- `E:\Coding\AI\Proma\apps\electron\src\main\lib\agent-session-manager.ts:236-270`：`sanitizeOversizedMessage()` 会分别处理超长 text、超大 `tool_result` 和内嵌 base64 图片。
- 对照 `E:\Coding\AI\j-gui\src-tauri\src\agent_session.rs:208-228`：`j-gui` 当前 `append_timeline_item()` 是直接追加 JSONL，没有体积控制。

支撑结论：这块是清晰、局部、可迁移的防线，而且直接命中 `j-gui` Agent transcript 的存储风险。

### 3. j-gui 前端已经预留了一批 Proma 级编排事件，但 Rust 后端没有完整兑现

- `E:\Coding\AI\j-gui\src\hooks\useGlobalAgentListeners.ts:80-120`：前端已经能消费 `permission_mode_changed`、`waiting_resume`、`resume_start`、`retrying`、`retry_attempt`、`retry_cleared`、`retry_failed` 等事件。
- `E:\Coding\AI\j-gui\src-tauri\src\agent_engine_events.rs:184-193`：Rust 侧对 `chunk`、`cancelled`、`retrying`、`compacting`、`compacted` 直接返回空事件。
- `E:\Coding\AI\Proma\apps\electron\src\main\lib\agent-orchestrator.ts:1488-1556`、`1746-1755`、`1878-1899`：Proma 已经把 `model_resolved`、重试状态、等待 auto-resume、resume_start 等事件发进前端事件流。

支撑结论：`j-gui` 不是完全没准备，而是存在“前端事件模型已准备，后端编排还没兑现”的半闭环状态。

### 4. Proma 的运行时探测模型比 j-gui 现在更完整

- `E:\Coding\AI\Proma\apps\electron\src\main\lib\runtime-init.ts:39-119`：初始化流程同时覆盖 shell env、Node、Bun、Git，以及 Windows 下的 Git Bash / WSL 探测与推荐策略。
- 对照 `E:\Coding\AI\j-gui\src-tauri\src\commands\settings_environment.rs:48-90`：`j-gui` 当前环境检查只回传 Node 和 Git 的安装/版本状态。
- 对照 `E:\Coding\AI\j-gui\src\lib\ipc.ts:155-156` 与 `src\atoms\environment.ts:72-84`：前端已经有 `runtimeStatus` 消费面，说明后端补充更丰富运行时结构是有落点的。

支撑结论：不是要照搬 Electron 检测实现，而是值得把“Windows Agent 运行前需要知道 shell 能力”这个后端模型迁成 Tauri/Rust 版本。

### 5. Proma 的磁盘管理模型适合迁成 j-gui 的设置能力

- `E:\Coding\AI\Proma\apps\electron\src\main\lib\storage-service.ts:126-156`：单独统计 Agent session JSONL，并识别 orphan session 文件。
- `E:\Coding\AI\Proma\apps\electron\src\main\lib\storage-service.ts:159-234`：单独统计 SDK config / file-history，并识别 orphan SDK 数据。
- `E:\Coding\AI\Proma\apps\electron\src\main\lib\storage-service.ts:236-260`：单独统计 workspace 目录，并把 `workspace-files` / `skills` / `.claude-plugin` 等元目录和 session 目录区分开。
- 对照 `E:\Coding\AI\j-gui\src-tauri\src\agent_session.rs:93-107`、`src-tauri\src\commands\files.rs:10-38`、`src-tauri\src\commands\settings.rs:78-138`：`j-gui` 已经有 agent sessions、attachments、archiveAfterDays 等分散存储概念，但还没有统一的磁盘巡检后端。

支撑结论：这块适合迁的是“分类统计 + orphan 检测 + 清理接口”的模型，不是 Proma 的 Electron 设置面板本身。

### 6. 当前 roadmap 已经明确承认：j-gui 现阶段的“恢复”与“继续工作”边界是收窄版

- `E:\Coding\AI\j-gui\.codestable\features\2026-05-12-agent-runtime-stability-recovery\agent-runtime-stability-recovery-design.md:31-35`：这项只收口按会话建模与状态恢复，明确**不在当时引入真正的 runtime resume 引擎**。
- `E:\Coding\AI\j-gui\.codestable\features\2026-05-12-agent-runtime-stability-recovery\agent-runtime-stability-recovery-design.md:48-49`：明确**不在该 feature 里实现真正的 SDK session resume / hidden context restore，也不重做 retry UI**。
- `E:\Coding\AI\j-gui\.codestable\features\2026-05-12-agent-history-replay-closure\agent-history-replay-closure-design.md:31-35`：这项只保证 replay/fork/rewind 后“还能继续使用”，并允许隐藏上下文恢复不完整。
- `E:\Coding\AI\j-gui\.codestable\features\2026-05-12-agent-history-replay-closure\agent-history-replay-closure-design.md:48-49`：明确**不补文件级 checkpoint / 真正文件系统 rewind**。

支撑结论：当前 `j-gui` Agent 之所以“不够完整”，并不全是遗漏，也有一部分是此前 roadmap 有意收窄范围后的结果。

### 7. Workspace / MCP / Skills 整体实现不该直接回迁

- `E:\Coding\AI\Proma\apps\electron\src\main\lib\agent-workspace-manager.ts:1-116`：Proma 自己维护工作区索引、目录、默认 skills、版本迁移。
- 对照 `E:\Coding\AI\j-gui\src-tauri\src\commands\governance_mcp.rs:9-94`：`j-gui` 的 workspace capabilities 是从 `GovernanceKernel` 读取技能和 MCP 配置后拼出来的。
- 对照 `E:\Coding\AI\j-gui\src-tauri\src\kernel\adapter_governance.rs:47-235`：`j-gui` 已把 hooks、skills、workspace MCP 读写绑定到 `JcliAdapter` / `agent_config` / workspace 配置路径。

支撑结论：Proma 这套更像“自管工作区平台”；`j-gui` 当前边界是“GUI 管理 j-cli 生态配置”。整体替换会冲掉既有 decouple 方向。

## 细节展开

### 1. 当前 j-gui Agent 完整度矩阵

| 能力 | 当前状态 | 证据 | 结论 |
|---|---|---|---|
| 会话级 runtime 路由 | 已闭环 | `commands/agent.rs:27-61, 228-296, 500-590` | 已有正确性基础 |
| replay / fork / rewind / workspace move | 已闭环但边界收窄 | `agent_session.rs:505-582` | 能用，但不等于完整恢复 |
| CLI / JAgent 双后端入口 | 已存在 | `agent_engine.rs:57-104, 212-262` | 具备双后端骨架 |
| 权限 / AskUser / Plan 中断 | 已闭环 | `agent_engine.rs:324-353`、`useGlobalAgentListeners.ts:464-539` | 基础交互已通 |
| 自动重试状态机 | 前端预留，后端缺失 | `useGlobalAgentListeners.ts:98-120` vs `agent_engine_events.rs:190-193` | 未完整 |
| invalid resume / thinking signature 自动恢复 | 缺失 | Proma 有，j-gui 当前无对应后端逻辑 | 未完整 |
| hidden context restore | 明确未做 | `agent-runtime-stability-recovery-design.md:48-49` | 未做且已知 |
| 文件快照 rewind | 明确未做 | `commands/agent.rs:585-588` | 未做且已知 |
| SDK message 防膨胀 | 缺失 | `agent_session.rs:208-228` | 未完整 |
| 环境探测 / shell 推荐 | 部分 | `settings_environment.rs:48-90` | 信息过薄 |
| 磁盘治理 / orphan 清理 | 缺失 | 当前无统一后端入口 | 未完整 |

结论：`j-gui` 当前 Agent 可以称为“基础工作台闭环已完成”，但不能称为“Proma 级编排已完整追平”。

### 2. Proma 编排能力拆分

从 `AgentOrchestrator` 里真正值得迁的，不是宿主结构，而是下面这些职责：

| 编排能力 | Proma 证据 | Rust 迁移建议 |
|---|---|---|
| SDK env 构建与环境隔离 | `agent-orchestrator.ts:484-513` | 抽到 `src-tauri/src/agent_sdk_env.rs` |
| 无效 resume / thinking signature fallback | `agent-orchestrator.ts:768-819, 1685-1713, 2019-2040` | 抽到 `src-tauri/src/agent_runtime_recovery.rs` |
| 自动重试状态机 | `agent-orchestrator.ts:1499-1560, 1746-1755, 1878-1883, 2133-2184` | 抽到 `src-tauri/src/agent_retry.rs` |
| model / retry / waiting_resume / resume_start 事件发射 | 同上 | 在 `agent_engine.rs` + `agent_engine_events.rs` 扩展 canonical 事件 |
| 队友结果等待与 auto-resume | `agent-orchestrator.ts:1888-1955` | 抽到 `src-tauri/src/agent_team_resume.rs`，首版可只保留接口骨架 |
| 超大 SDK 消息截断 | `agent-session-manager.ts:214-270` | 抽到 `src-tauri/src/agent_storage_guard.rs` |
| 存储统计与 orphan 清理 | `storage-service.ts:126-260` | 抽到 `src-tauri/src/commands/settings_storage.rs` + helper |
| Windows shell 推荐与 runtime cache | `runtime-init.ts:39-119` | 扩展 `settings_environment.rs`，必要时拆 `runtime_status.rs` |

### 3. Rust 迁移清单

#### Phase 1：先补“已有前端预留、后端未兑现”的编排事件

目标：把 `j-gui` 从“前端等事件，后端没发”修到“状态语义前后端一致”。

1. 在 `src-tauri/src/agent_engine.rs` 外层增加统一的编排事件发射 helper。
2. 在 `src-tauri/src/agent_engine_events.rs` 不再直接丢弃 `retrying/cancelled/compacting`，至少保留可观察事件映射。
3. 为 `model_resolved`、`retry`、`waiting_resume`、`resume_start` 定义 Rust 侧统一事件结构，和前端 `payloadToLegacyEvents()` 口径对齐。
4. 为这些事件补 Rust 单测和前端 IPC 协议测试。

建议落点：

- `src-tauri/src/agent_engine.rs`
- `src-tauri/src/agent_engine_events.rs`
- `src/lib/ipc-stream-protocol.ts`
- `src/__tests__/ipc.test.ts`
- `src-tauri/src/tests/agent_engine.rs`

#### Phase 2：补运行时恢复状态机

目标：让 CLI backend 在失败后具备 Proma 级别的最小恢复能力，而不是失败即停。

1. 新建 `src-tauri/src/agent_runtime_recovery.rs`
2. 收口两类恢复判定：
   - resume session 无效
   - thinking signature / 跨模型 resume 不兼容
3. 新建 `src-tauri/src/agent_retry.rs`
4. 定义可重试错误分类：
   - HTTP 429
   - 5xx
   - 明确网络抖动
   - 可识别的 SDK session 恢复错误
5. 在 `AgentEngine::start` 的 CLI 事件主循环中接入重试/恢复状态机。
6. 把恢复结果同步写回 session meta，例如 `sdk_session_id` 清空、`resume_at_message_uuid` 调整、`stopped_by_user` 保持一致。

建议落点：

- `src-tauri/src/agent_runtime_recovery.rs`
- `src-tauri/src/agent_retry.rs`
- `src-tauri/src/agent_engine.rs`
- `src-tauri/src/agent_session.rs`
- `src-tauri/src/tests/agent_engine.rs`

#### Phase 3：补 continue boundary 的存储与文件恢复边界

目标：把当前“timeline 级 rewind”推进到“有明确文件恢复语义”的可维护状态。

1. 保持当前 `meta.json + transcript.jsonl` 存储真相不变。
2. 新建 `src-tauri/src/agent_storage_guard.rs`，给 transcript 写入加体积阈值与截断策略。
3. 为 `rewind_session` 引入真实的 file snapshot 能力前，先定义 Rust 侧 `FileRewindResult` 协议，而不是继续在 command 层写死 `canRewind: false`。
4. 如果暂时不做快照恢复，也要把“为什么不能恢复”的原因做成结构化错误，而不是临时字符串。

建议落点：

- `src-tauri/src/agent_storage_guard.rs`
- `src-tauri/src/agent_session.rs`
- `src-tauri/src/commands/agent.rs`
- `src-tauri/src/tests/agent_engine.rs`

#### Phase 4：补环境探测与磁盘治理

目标：把“能不能稳定跑 Agent”从隐性经验变成设置页里的真实后端能力。

1. 扩展 `settings_environment.rs`：
   - Git Bash 检测
   - WSL 检测
   - 推荐 shell
   - runtime cache / refresh
2. 新建 `src-tauri/src/commands/settings_storage.rs`
3. 补存储分类统计：
   - agent sessions
   - sdk config
   - workspaces
   - attachments
   - temp files
4. 补 orphan 检测与显式清理 command。

建议落点：

- `src-tauri/src/commands/settings_environment.rs`
- `src-tauri/src/commands/settings_storage.rs`
- `src-tauri/src/lib.rs`
- 前端对应 settings IPC 与状态 atom

### 4. 迁移顺序建议

正确顺序不是“先把 JAgent 切主”，而是：

1. 事件语义补齐
2. CLI backend 恢复状态机补齐
3. transcript / rewind 防线补齐
4. 环境探测与磁盘治理补齐
5. 最后再评估 `agent-engine-jagent` 是否值得推进到更深层 parity

原因：如果现在直接推进 `jagent`，只会把“恢复能力不足、事件语义不全、继续工作边界模糊”从 CLI backend 复制到第二条 backend 上。

### 5. 明确不建议的迁移方式

- 不把 `Proma` 的 `AgentOrchestrator` 直接翻译成一个 1:1 的 `agent_orchestrator.rs`
- 不把 workspace/skills/MCP 的宿主管理整体从 `GovernanceKernel` 拖回 Agent runtime
- 不在没有补齐恢复状态机前，先宣称 `JAgent` 已经达到可替代 CLI 的成熟度
- 不把前端已经预留的 retry/resume 事件继续当成“以后再说”的无害空壳

## 未决问题

1. `j-gui` 当前 CLI backend 是否还能稳定暴露足够错误细节，让 Rust 侧可靠区分“可自动恢复”和“应立即失败”；这决定重试状态机能做到多深。
2. file snapshot rewind 是直接接 `Claude CLI` / SDK 现有 checkpoint 能力，还是走 `j_cli`/`j-agent` 侧统一快照抽象；这会影响 Phase 3 的落点。
3. `agent-engine-jagent` 后续如果继续推进，是要先做到“只补 parity”，还是直接争取“共享同一套恢复状态机”；这会影响 Phase 2 和 Phase F 的衔接方式。
4. 存储治理里哪些目录属于 `j-gui` 自管，哪些属于 `j_cli` 共管，需要在真正实现清理命令前再做一次边界确认。

## 后续建议

如果要继续做，最合适的下一步不是直接改 `JAgent`，而是先按本清单开一个小范围 feature，把 **Phase 1 + Phase 2 的 CLI backend 恢复状态机** 落成真实 Rust 实现，再回来看 `agent-engine-jagent` 的 go/no-go。

## 相关文档

- `E:\Coding\AI\j-gui\.codestable\compound\2026-05-08-explore-j-cli-agent-coupling.md`
- `E:\Coding\AI\j-gui\.codestable\compound\2026-05-10-decision-jgui-jcli-decouple.md`
