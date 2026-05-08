---
doc_type: audit-finding
audit: phase-abc-review
id: F-03
nature: maintainability
severity: P2
confidence: low
recommendation: cs-refactor
---

# F-03: executeCloseTab 无流式保护，依赖调用方检查

## 位置

`src/components/app-shell/MainArea.tsx:113-143` (executeCloseTab), `145-155` (handleCloseTab)

## 证据

```typescript
const handleCloseTab = (tabId: string) => {
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return;
  if (isStreaming(tab)) {
    setCloseConfirmTabId(tabId);  // Gate: only caller enforces streaming check
    return;
  }
  void executeCloseTab(tabId);
};
```

`executeCloseTab` 本身无任何流式检查——它无条件关闭标签并调用 `stopAgent()`。当前所有调用路径都先检查了流式状态，但函数签名不表达这个前置条件。如果未来新增调用路径忘记检查，会在流式传输中直接 kill Agent。

## 影响

- 当前无问题——两条调用路径（handleCloseTab + confirm 对话框）都正确检查了
- 防御性缺口——函数自身的契约没有自保护

## 修复建议

在 `executeCloseTab` 开头加入断言或检查：
```typescript
const executeCloseTab = async (tabId: string) => {
  const tab = tabs.find((item) => item.id === tabId);
  if (!tab) return;
  // 防御：流式中的 agent tab 应先确认
  if (tab.type === "agent" && agentStreaming) {
    console.warn("[MainArea] executeCloseTab called on streaming agent tab without confirm");
  }
  // ...
```
