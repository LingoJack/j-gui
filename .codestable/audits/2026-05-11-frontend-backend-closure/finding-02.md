---
doc_type: audit-finding
audit: 2026-05-11-frontend-backend-closure
finding_id: "arch-drift-02"
nature: arch-drift
severity: P1
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 02：Agent 历史回放/迁移相关 IPC 已暴露，但后端命令没有闭环

## 速答

前端 IPC 和共享类型已经把 `get_agent_session_sdk_messages`、`fork_agent_session`、`rewind_session`、`move_agent_session_to_workspace` 等能力当成现成接口使用，但当前 Tauri 命令表和 `agent.rs` 实现里并没有对应闭环，只能静默 fallback 或完全不存在。

## 关键证据

- `src/lib/ipc.ts:357-370` — 前端暴露 `getAgentSessionSDKMessages`、`moveAgentSessionToWorkspace`、`forkAgentSession`、`rewindSession`，全部走真实 invoke 名称。
- `src/lib/ipc.ts:363` — `toggleManualWorkingAgentSession` 甚至已经在代码里直接标注 “backend command not yet registered”。
- `packages/shared/src/types/agent.ts:633-649` — 共享类型已经把 Agent 消息搜索结果规范化。
- `packages/shared/src/types/agent.ts` 中的会话管理常量还定义了 `GET_SDK_MESSAGES`、`MOVE_SESSION_TO_WORKSPACE`、`FORK_SESSION`、`REWIND_SESSION`，说明协议层已把这些能力当成正式接口。
- `src-tauri/src/commands/agent.rs:145-163` — 当前只实现了 `create/list/get/delete` 这组基础会话命令。
- `src-tauri/src/lib.rs:18-32` — 注册表里没有 `get_agent_session_sdk_messages`、`move_agent_session_to_workspace`、`fork_agent_session`、`rewind_session`、`toggle_manual_working_agent_session`。

## 影响

这会把“Agent 会话工作台已经有历史回放/迁移能力”的产品表述变成伪闭环。前端可以继续堆对应按钮和交互，但一旦真正调用，只会变成空数组、空结果或无动作；更糟的是，调用方未必能区分“真的没有数据”和“命令根本不存在”。

## 修复方向

先统一真相：要么把这些能力补到后端并注册，要么在前端和共享协议里降级为未支持，避免继续以“正式接口”身份存在。

## 建议动作

`cs-issue`，因为这是能力闭环与命令表不一致造成的明确产品缺口。
