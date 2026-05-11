---
doc_type: audit-finding
audit: 2026-05-11-roadmap-completeness
finding_id: "15"
severity: P2
category: bug
confidence: high
suggested_action: cs-issue
files: [src/components/tabs/TabErrorBoundary.tsx]
---

# Finding 15: TabErrorBoundary 重新加载按钮无法真正恢复

## 位置

`src/components/tabs/TabErrorBoundary.tsx:48-54`

## 证据

```typescript
// 当前实现：重置 hasError 后重新渲染相同的子组件树
const handleReload = () => {
  setHasError(false)  // 这会触发重新渲染，子组件以相同 props 重新挂载
}
```

## 分析

React error boundary 的 `componentDidCatch` / `getDerivedStateFromError` 在重置 `hasError` 后，会重新渲染相同的子组件树。如果组件因**数据状态损坏**而崩溃（常见于 Jotai atom 状态异常），重新渲染后状态相同 → 组件再次崩溃 → Error Boundary 再次捕获 → 形成无限循环。

正确的恢复方式是强制子组件树完全重新挂载（不同 key），这会清空所有内部状态。

## 建议

开 `cs-issue`：修改为通过递增 key 强制 remount：
```typescript
const handleReload = () => {
  setRetryKey(k => k + 1)
  setHasError(false)
}
// 渲染时：<div key={retryKey}>{children}</div>
```
