---
doc_type: audit-finding
slug: desktop-shell-platform-polish-order-mismatch
date: 2026-05-13
severity: P1
category: arch-drift
confidence: high
suggested_action: cs-roadmap
---

# Finding 01: `desktop-shell-platform-polish` 的依赖和推荐顺序互相矛盾

## 结论

roadmap 正文把 `desktop-shell-platform-polish` 写成当前已直接解锁、且应早于 `visual-layout-polish` 推进，但 `items.yaml` 又把它显式声明为依赖 `visual-layout-polish`。两者不能同时为真。

## 证据

- `E:\Coding\AI\j-gui\.codestable\roadmap\j-gui-v1\j-gui-v1-items.yaml:347-353`
  - `desktop-shell-platform-polish` 的 `depends_on` 为 `[product-friction-audit, visual-layout-polish]`
- `E:\Coding\AI\j-gui\.codestable\roadmap\j-gui-v1\j-gui-v1-roadmap.md:438-448`
  - “`product-friction-audit` 已完成；它的直接下游是”里直接列出了 `desktop-shell-platform-polish`
- `E:\Coding\AI\j-gui\.codestable\roadmap\j-gui-v1\j-gui-v1-roadmap.md:516-527`
  - `10.3 下一步明确要做` 把 `desktop-shell-platform-polish` 排在第 3 步
  - `visual-layout-polish` 却排在第 8 步
- `E:\Coding\AI\j-gui\.codestable\roadmap\j-gui-v1\j-gui-v1-roadmap.md:576-585`
  - `10.6 推荐执行顺序` 也把 `desktop-shell-platform-polish` 排在 `visual-layout-polish` 前面

## 影响

后续如果严格按 `items.yaml` 起 feature，那么 `desktop-shell-platform-polish` 现在还不该算“直接解锁”；如果按正文顺序执行，则 `depends_on` 又会被违反。这个漂移会让排期、解锁关系和 feature-design 的起单判断不一致。

## 建议

二选一并统一：

1. 如果桌面壳层工作不需要等待视觉布局打磨，就把 `items.yaml` 里的 `visual-layout-polish` 依赖去掉。
2. 如果确实要等布局基线收口后再做窗口壳层，就把 roadmap 正文的“当前解锁关系”和推荐顺序改回与依赖图一致。
