# agent-runtime-stability-recovery 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-12
> 关联方案 doc：`.codestable/features/2026-05-12-agent-runtime-stability-recovery/agent-runtime-stability-recovery-design.md`

## 1. 接口契约核对

- [x] `AgentState` 已从单槽位升级为按 `sessionId` 维护的 runtime table；代码落点：`src-tauri/src/commands/agent.rs`
- [x] `respond_agent_interrupt` 与 `stop_agent` 已显式按 `sessionId` 路由；代码落点：`src-tauri/src/commands/agent.rs`、`src-tauri/src/commands/agent_compat.rs`
- [x] 前端 `agentChannels` 已按会话维护，不再用当前会话切换去隐式强停其他 Agent；代码落点：`src/lib/ipc.ts`
- [x] `respondAskUser / respondPermission / respondExitPlanMode` 已统一走 `respond_agent_interrupt` canonical path，并带 `sessionId`；证据落点：`src/__tests__/ipc.test.ts`

## 2. 行为与决策核对

- [x] 后端不再保留 `Option<AgentEngine>` 全局单例模型；当前真相为 `HashMap<String, AgentEngine>`；代码落点：`src-tauri/src/commands/agent.rs`
- [x] `send_agent_message`、`respond_agent_interrupt`、`stop_agent` 都会先按目标 `sessionId` 查 runtime slot，再执行对应动作；代码落点：`src-tauri/src/commands/agent.rs`
- [x] 前端首次向某会话发送消息时才创建该会话 channel；后续同会话复用，不影响其他会话；代码落点：`src/lib/ipc.ts`
- [x] `stop_agent(sessionId)` 只清理目标会话 slot，并把 `stoppedByUser` 写回持久化 meta；代码落点：`src-tauri/src/commands/agent.rs`
- [x] design 中明确收窄的恢复语义已保持一致：当前“恢复”指 runtime 状态与前后端一致，不声称已恢复 hidden context

## 3. 验收场景核对

- [x] **A1**：不同会话可以分别启动，不再共享一个全局 runtime 槽位
  - 证据来源：`src/__tests__/ipc.test.ts` 中双会话 `sendAgentMessage` 调用顺序校验
- [x] **A2**：interrupt 响应会带 `sessionId` 走统一路径
  - 证据来源：`src/__tests__/ipc.test.ts` 中 `respondAskUser preserves structured question ids on the canonical path`、`respondPermission includes session routing on the canonical path`、`respondExitPlanMode includes session routing on the canonical path`
- [x] **A3**：停止某个会话只影响该会话
  - 证据来源：`src/lib/ipc.ts` 的 `stopAgent(sessionId)` 实现与 `src-tauri/src/commands/agent.rs` 的 `stop_agent`
- [x] **A4**：完成、错误或用户停止后，slot 会被移除，后续可以继续使用该会话
  - 证据来源：`src/lib/ipc.ts` 中 per-session channel 清理逻辑 + `src-tauri/src/tests/commands_agent.rs` 的 runtime slot 测试
- [x] **A5**：grep 检查下，Rust 后端已不再保留 `Option<AgentEngine>` 单槽位模型
  - 证据来源：`src-tauri/src/commands/agent.rs`

前端验证说明：

- 本次没有新增 Agent 视图结构，只调整 runtime 路由真相与 channel 生命周期；因此主要验收证据为 IPC 行为测试、Rust slot 路由测试和全量门禁。

## 4. 术语一致性

- `Runtime Slot`、`Runtime Table`、`Interrupt Routing`、`Stop Routing`、`Recovery Surface` 在 design、Rust 命令和前端 IPC 中已对齐
- 当前文档没有再把“切换会话时自动强停其他 Agent”描述成正常行为

## 5. Roadmap 收口结论

- [x] `agent-runtime-stability-recovery` 的功能性实现已完成，当前剩余动作是与 `agent-history-replay-closure` 做 Phase B 联合复验并一起翻 roadmap 状态
- [x] 本 feature 没有越界声称“hidden context resume / 复杂并发调度 / 全局队列”已经完成

## 6. 验证记录

- [x] `bun run test` 通过
- [x] `cargo test` 通过
- [x] `bash scripts/check_lint.sh` 通过

## 7. 遗留

- `JAgent` 后端更深层的主动中断/直连能力仍属于后续演进问题，不在这次 runtime 路由收口内解决
- hidden context resume 依旧不在本 feature 范围内
