---
doc_type: audit-finding
date: 2026-05-13
severity: P1
category: bug
confidence: high
file: src/components/settings/ShortcutSettings.tsx
line: 277
---

# Finding-01: `show-main-window` 真实存在，但快捷键管理页把它隐藏了

## 证据

`src/lib/shortcut-defaults.ts:52-62` 仍定义了：

- `id: "show-main-window"`
- `category: "global"`
- `global: true`
- `readonly: true`

但 `src/components/settings/ShortcutSettings.tsx:277-345` 只渲染：

```ts
const categoryOrder: ShortcutCategory[] = ['app', 'navigation', 'edit']
```

后续列表渲染完全依赖 `categoryOrder.map(...)`，所以 `global` 分类永远不会出现在 UI 中。

## 影响

- 用户会误以为 `Ctrl/Cmd+Shift+P` 被删了。
- “仅展示当前真实可用的快捷键”这句 UI 文案与代码事实不一致。
- 后续如果继续增加全局快捷键，也会继续被同一渲染缺口吞掉。

## 建议动作

走 `cs-issue`，把 `global` 分类纳入快捷键管理页的真实可见范围，并保持只读语义。
