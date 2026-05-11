---
doc_type: audit-finding
audit: 2026-05-11-frontend-backend-closure
finding_id: "bug-01"
nature: bug
severity: P0
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 01：Agent 后端仍是全局单例，和前端按会话隔离的运行模型冲突

## 速答

前端已经按“每个 Agent 会话一条活跃通道”建模，但 Rust 后端仍只维护一个 `Option<AgentEngine>`。一旦同时存在多个 Agent 会话，消息发送、审批响应和停止操作都会落到当前全局实例，而不是调用方所属会话。

## 关键证据

- `src/lib/ipc.ts:372-377` — 前端维护 `Map<string, AgentRuntimeChannel>`，明确按 `sessionId` 区分活跃 Agent 通道。
- `src/lib/ipc.ts:405-443` — `sendAgentMessage` 会按会话首次启动对应通道，并把后续流式事件继续绑定到该 `sessionId`。
- `src-tauri/src/commands/agent.rs:12` — 后端全局状态是 `AgentState(pub Arc<Mutex<Option<AgentEngine>>>)`，只有一个 `AgentEngine` 槽位。
- `src-tauri/src/commands/agent.rs:119-141` — `start_agent` 每次启动都会直接 `*guard = Some(engine)`，覆盖此前实例。
- `src-tauri/src/commands/agent.rs:275-294` — `send_agent_message` 只取当前单例 `engine.send_message(&content)`，没有按 `session_id` 选择目标实例。
- `src-tauri/src/commands/agent.rs:165-185` — `respond_agent_interrupt` 也只对当前单例 `engine` 响应中断，没有会话级路由。
- `src-tauri/src/commands/agent.rs:296-302` — `stop_agent` 直接 `guard.take()` 关闭当前全局实例，同样不是按会话停止。

## 影响

这不是“暂时不能并发”的纯能力缺口，而是错误路由风险：用户在 A 会话里点批准，可能喂给了 B 会话当前运行的 Agent；或者打开第二个会话后，前端还保留着第一个会话的活跃通道，但后端实例已经被替换。只要 UI 允许多标签、多 Agent 会话并存，这个问题就会直接破坏正确性。

## 修复方向

把 Agent 后端状态改成按 `sessionId` 路由的实例表，或者明确退回到“全局只允许一个活跃 Agent 会话”并让前端同步收口，不要维持现在这种前后端模型分叉。

## 建议动作

`cs-issue`，因为这是明确的行为错误，不是结构优化。
