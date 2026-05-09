---
doc_type: audit-finding
audit: 2026-05-09-full-scope
finding_id: "maintainability-12"
nature: maintainability
severity: P1
confidence: medium
suggested_action: cs-refactor
status: open
---

# Finding 12：AgentView.tsx 497 行，职责过多

## 速答

`AgentView` 组件混合了：引擎生命周期管理（start/stop/runId）、Channel 事件分发（6 种 event 类型）、interrupt 键盘处理、session 创建、权限模式切换、draft 持久化、UI 渲染。497 行单一组件超出 80 行阈值 6 倍。

## 关键证据

- `src/components/agent/AgentView.tsx:1-497` — 497 行，包含 8 个 useEffect、6 个 useCallback
- `startEngine` callback（lines 181-331）本身 ~150 行，包含 Channel 事件处理 switch（6 个 case）
- 引擎生命周期通过 5 个 ref（`engineStartedRef`、`engineRunIdRef`、`boundSessionIdRef`、`ownerTabIdRef`、`streamingRef`）管理，状态机隐含在分散的条件判断中

引擎启动失败的错误处理（lines 358-386）与正常发送流程（lines 388-408）耦合在同一 `handleSend` 中。

## 影响

修改任何单一功能（如添加新 event 类型、改动引擎生命周期）需要在 497 行中定位位置，且容易引入 ref 状态不一致的 bug。测试困难——当前无 AgentView 的单元测试。

## 修复方向

抽出 `useAgentEngine` hook（管理 start/stop/runId/生命周期），抽出 `AgentChannelHandler`（事件分发逻辑），将 UI 组件瘦身到 ~150 行。

## 建议动作

`cs-refactor`，行为不变的结构优化。
