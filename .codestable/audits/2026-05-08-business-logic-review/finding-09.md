---
doc_type: audit-finding
audit: business-logic-review
id: F-09
nature: maintainability
severity: P2
confidence: low
recommendation: cs-refactor
---

# F-09: ChatView 和 AgentView 同时挂载不按模式卸载

## 位置

`src/components/app-shell/MainArea.tsx:60-66`

## 证据

```tsx
// MainArea.tsx:60-66
<div className={cn("h-full", mode !== "chat" && "hidden")}>
  <ChatView />
</div>
<div className={cn("h-full", mode !== "agent" && "hidden")}>
  <AgentView />
</div>
```

两个 View 始终在 DOM 中，仅用 CSS `hidden` 切换可见性。ChatView 和 AgentView 各自在 `useEffect` 中加载配置、各自持有 Jotai atom 订阅。

## 影响

- 内存：两个 View 的 DOM + React 组件树 + atom 订阅同时存在
- AgentView 即使不可见也在后台持有 `engineStartedRef`，但其 Channel 已不活跃（可见性切换不触发 Channel 重建）
- 当前影响极小（两个组件都不重），但随功能增长会累积

## 修复建议

改为条件渲染：
```tsx
{mode === "chat" ? <ChatView /> : <AgentView />}
```

注意：条件卸载后组件 state 丢失。如需要保留 state，可用 `visibility: hidden` + `position: absolute` 代替 `display: none`。

## 修复记录 (2026-05-08)

**已实施**：`MainArea.tsx:61` 替换原两对 `<div className="hidden">` 包装为：
```tsx
{mode === "chat" ? <ChatView /> : <AgentView />}
```
当前场景下两个 View 不需要跨模式保留 state（切换模式 = 重置上下文）。

**验证**：bun run test 15 passed ✅ | tsc --noEmit 0 error ✅
