---
doc_type: audit-finding
audit: phase-abc-review
id: F-04
nature: bug
severity: P2
confidence: medium
recommendation: cs-issue
---

# F-04: 搜索只显示当前模式的会话，无法跨模式查找

## 位置

`src/components/app-shell/AppShell.tsx:138-144`, `src/components/app-shell/SearchDialog.tsx:9-10`

## 证据

```typescript
// AppShell.tsx — sessionType 绑定到当前 activeTab
<SearchDialog sessionType={activeTab?.type ?? "chat"} ... />

// SearchDialog.tsx — onSelect 签名只传 id + 单一 type
onSelect: (id: string, type: "chat" | "agent") => void | Promise<void>;
```

SearchDialog 接收一个 `sessionType` prop，搜索时只显示该类型的会话。在 Chat 模式下打开搜索只能看到 Chat 会话，Agent 模式下只能看到 Agent 会话。

## 影响

- 用户无法从一个模式搜索到另一个模式的会话
- 与 Proma 的 cross-mode 搜索（Chat+Agent 同时返回，图标区分）有差距

## 修复建议

SearchDialog 应同时加载 Chat 和 Agent 会话列表，用图标/颜色区分类型，onSelect 传对应的 mode。这需要改动 AppShell 传入两组 sessions 并合并展示。
