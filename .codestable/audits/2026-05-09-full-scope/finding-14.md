---
doc_type: audit-finding
audit: 2026-05-09-full-scope
finding_id: "maintainability-14"
nature: maintainability
severity: P2
confidence: low
suggested_action: cs-refactor
status: open
---

# Finding 14：LeftSidebar.tsx 488 行混合会话 CRUD/固定/编辑/模式切换

## 速答

`LeftSidebar` 在一个组件中处理：Chat/Agent 模式切换、会话列表加载与 5 秒轮询、Pin/Unpin、inline 标题编辑、新建/切换/删除会话、折叠/展开状态。488 行超阈值 6 倍。

## 关键证据

- `src/components/app-shell/LeftSidebar.tsx:1-488` — 488 行
- `load` callback（lines 142-159）在 useEffect 中被每 5 秒调用（lines 161-165），同时是模式切换和删除后的回调
- `handleSwitchSession`（lines 189-223）包含会话消息加载 + tab 更新
- `handleDeleteSession`（lines 225-258）包含删除 + 回退处理 + 置顶清理 + tab 更新
- 会话编辑（`startEdit`/`commitEdit`/`cancelEdit`）通过 ref 和本地 state 管理

## 影响

修改侧边栏任何行为（如改轮询间隔、添加搜索过滤、支持拖拽排序）需要在 488 行中找到准确位置。但相比 AgentView 和 SettingsDialog，此组件的功能边界相对清晰（都是会话列表操作），拆分紧迫性较低。

## 修复方向

可选：抽出 `useSessionList(loadInterval)` hook，抽出 `SessionItem` 子组件（含 inline 编辑逻辑）。

## 建议动作

`cs-refactor`，低优先级，等下次需要改侧边栏功能时顺带重构。
