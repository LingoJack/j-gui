---
doc_type: audit-finding
audit: 2026-05-09-post-parity-regression
finding_id: "bug-03"
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 03：最后 tab 关闭后自动创建新 tab，无 tab 状态永远不可达

## 速答

`MainArea.tsx:120-134` 的 `executeCloseTab` 在关闭最后一个 tab 后，自动创建一个新的 Chat tab 并激活。这导致：

1. 用户无法看到空态欢迎页（当 `hasProviders` 为 true 时）
2. 无法通过关闭所有 tab 来"重置"工作区
3. 用户试图关掉最后一个 tab 时，新的 tab 立即出现，产生"关不完"的体验

## 关键证据

- `MainArea.tsx:120-143` — `executeCloseTab` 中 `if (remaining.length === 0) { ... 创建新 tab; return [newTab]; }`
- `MainArea.tsx:169-193` — `tabs.length === 0` 的空态分支实际不可达（除非初始状态或手动重置 atoms）
- `MainArea.tsx:39-51` — 挂载时 `tabs.length === 0` 也自动创建默认 tab

## 影响

用户无法看到欢迎页/空态，无法通过关 tab 清空工作区。"关 tab"对最后一个 tab 实际是"刷新 tab"。

## 修复方向

1. 移除 `executeCloseTab` 中 `remaining.length === 0` 时的自动创建逻辑
2. `tabs.length === 0` 时显示空态（已实现但不可达，做对即可）
3. 挂载时默认 tab 创建逻辑保持（空态已经有新建入口）
