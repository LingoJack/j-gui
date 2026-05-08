---
doc_type: audit-finding
audit: phase-abc-review
id: F-01
nature: maintainability
severity: P1
confidence: high
recommendation: cs-refactor
---

# F-01: timelineToMessages mutates last.content in-place

## 位置

`src/atoms/sessions.ts:48-49`

## 证据

```typescript
case "assistant_content": {
  const content = item.content || "";
  const last = messages[messages.length - 1];
  if (last && last.role === "assistant" && !last.toolCall) {
    last.content += content;  // ⚠️ mutates object in place
  } else {
    messages.push({ ...base, role: "assistant" as const, content });
  }
  break;
}
```

`last` 是 `messages` 数组元素的引用，`last.content += content` 直接修改了数组内对象。虽然调用方使用全新数组（`const messages: Message[] = []`），不影响 Jotai 状态，但这种内联修改模式**隐蔽且不安全**——如果未来某处持有 `messages` 中元素的引用，会观察到非预期的对象变异。

## 影响

- 当前功能正确，但代码意图不清晰——读者需要仔细追踪才能确认没有副作用
- 未来重构（如引入 per-tab 消息缓存共享元素引用）时会触发隐蔽 bug

## 修复建议

```typescript
if (last && last.role === "assistant" && !last.toolCall) {
  messages[messages.length - 1] = { ...last, content: last.content + content };
}
```
