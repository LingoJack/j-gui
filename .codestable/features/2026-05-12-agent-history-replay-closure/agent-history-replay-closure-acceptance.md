# agent-history-replay-closure 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-12
> 关联方案 doc：`.codestable/features/2026-05-12-agent-history-replay-closure/agent-history-replay-closure-design.md`

## 1. 接口契约核对

- [x] `get_agent_session_sdk_messages` 已作为正式 Tauri 命令注册；代码落点：`src-tauri/src/commands/agent.rs`、`src-tauri/src/lib.rs`
- [x] `move_agent_session_to_workspace`、`fork_agent_session`、`rewind_session` 已作为正式 Tauri 命令注册；代码落点：`src-tauri/src/commands/agent.rs`、`src-tauri/src/lib.rs`
- [x] 前端 `ipc.ts` 已直接消费上述正式命令，不再把历史回放主链路建立在前端 fallback synthesis 上；代码落点：`src/lib/ipc.ts`
- [x] `AgentSessionMeta` 的核心字段已在 Rust 会话真相中落地，包括 `workspaceId`、`stoppedByUser`、`permissionMode`、`resumeAtMessageUuid`；代码落点：`src-tauri/src/agent_session.rs`

## 2. 行为与决策核对

- [x] 历史回放主链路由 `get_agent_session_sdk_messages -> timeline_to_sdk_messages(...)` 统一生成，不再以“前端自己拼 replay”作为主口径；代码落点：`src-tauri/src/commands/agent.rs`、`src-tauri/src/agent_session.rs`
- [x] `move_agent_session_to_workspace` 不只是改前端列表，而是更新会话 `workspace_id` 真相，再返回新的会话信息；代码落点：`src-tauri/src/commands/agent.rs`、`src-tauri/src/agent_session.rs`
- [x] `fork_agent_session` 会复制锚点前 timeline，并继承源会话的 `workspaceId / channelId / permissionMode`；代码落点：`src-tauri/src/agent_session.rs`
- [x] `rewind_session` 会真实截断 transcript，并把 `resumeAtMessageUuid` 写回会话 meta；代码落点：`src-tauri/src/agent_session.rs`
- [x] continue boundary 已按 design 收窄：本次保证“可见 timeline + 会话归属 + 继续发送”闭环，不声称已恢复底层 hidden context

## 3. 验收场景核对

- [x] **A1**：打开已有 Agent 会话时，历史回放失败会直接暴露后端错误，而不是前端伪造 fallback
  - 证据来源：`src/__tests__/ipc.test.ts` 中 `getAgentSessionSDKMessages surfaces backend replay failures instead of synthesizing fallback`
- [x] **A2**：会话列表能稳定带出前端长期消费的 meta 字段
  - 证据来源：`src-tauri/src/agent_session.rs` 的 `list_agent_sessions()` 字段映射
- [x] **A3**：迁移工作区会更新会话归属真相
  - 证据来源：`src-tauri/src/commands/agent.rs` 的 `move_agent_session_to_workspace` + `src-tauri/src/agent_session.rs` 的 `set_session_workspace`
- [x] **A4**：fork 会话会复制锚点前历史并保留关键来源信息
  - 证据来源：`src-tauri/src/agent_session.rs` 的 `fork_agent_session`
- [x] **A5**：rewind 会真实截断 timeline
  - 证据来源：`src-tauri/src/agent_session.rs` 的 `rewind_agent_session`
- [x] **A6**：rewind 后继续发送的前提字段已写回 meta，而不是停留在前端假状态
  - 证据来源：`src-tauri/src/agent_session.rs` 中 `resume_at_message_uuid` / `stopped_by_user` 更新逻辑
- [x] **A7**：命令已注册
  - 证据来源：`src-tauri/src/lib.rs`

前端验证说明：

- 本次没有新增新的 Agent 工作台 UI 组件；收口重点在 IPC 主链路与后端命令真相，因此以前端 IPC 行为测试 + Rust 命令/持久化代码核对作为主要验收证据。

## 4. 术语一致性

- `Session Meta`、`Timeline Truth`、`Replay Surface`、`Fork Snapshot`、`Rewind Anchor` 在 design、Rust 命令和前端 IPC 中已按同一套词义落地
- 当前文档没有再把 replay 主链路写成“前端 fallback 也算闭环”

## 5. Roadmap 收口结论

- [x] `agent-history-replay-closure` 的功能性实现已完成，当前剩余动作是与 `agent-runtime-stability-recovery` 一起做联合复验后翻 roadmap 状态
- [x] 本 feature 没有越界声称“hidden context resume 已完成”

## 6. 验证记录

- [x] `bun run test` 通过
- [x] `cargo test` 通过
- [x] `bash scripts/check_lint.sh` 通过

## 7. 遗留

- 真正的 runtime resume / hidden context restore 不在本 feature 范围内，继续归 `agent-runtime-stability-recovery` 之后的更深层恢复工作处理
- `fileRewind` 当前仍明确返回不可用说明，不伪装成已经支持文件快照恢复
