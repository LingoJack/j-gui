---
doc_type: audit-finding
audit: 2026-05-09-full-scope
finding_id: "performance-11"
nature: performance
severity: P2
confidence: low
suggested_action: cs-refactor
status: open
---

# Finding 11：RightSidePanel toggleNode 每次全树重建

## 速答

`RightSidePanel` 的 `toggleNode` 通过递归 `setTree` 创建全新的树对象，即使只展开/折叠一个节点。对于深层嵌套目录（如 `node_modules` 未被忽略的情况），这会导致大量对象分配。

## 关键证据

- `src/components/app-shell/RightSidePanel.tsx:139-171` — `toggleNode` 调用 `setTree`，内部 `findAndToggle` 递归遍历整棵树创建新节点对象
- `src/components/app-shell/RightSidePanel.tsx:40-52` — `updateTreeNode` 同样递归全树重建

每次展开目录时：先调用 `loadDirEntries`（异步），完成后通过 `updateTreeNode` 更新树（递归重建）。目录切换（breadcrumb 导航）也会通过 `loadRoot` 重新加载整棵树。

## 影响

对于大多数实际使用场景（项目目录 < 100 文件），性能影响不可测。仅在极端场景（故意浏览根目录或大型 monorepo）下可能有可感知的 UI 卡顿。

## 修复方向

使用 `React.memo` 或 immutable update 库减少不必要的重渲染，但当前 React 的 reconciliation 已足够高效。真正优化在 Jotai atom 中管理树状态而非 `useState`。

## 建议动作

`cs-refactor`，低优先级优化。
