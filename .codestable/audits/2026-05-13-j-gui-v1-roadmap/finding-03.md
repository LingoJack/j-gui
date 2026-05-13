---
doc_type: audit-finding
slug: dogfooding-blocker-unlock-overstated
date: 2026-05-13
severity: P2
category: maintainability
confidence: high
suggested_action: cs-roadmap
---

# Finding 03: `dogfooding-blocker-burn-down` 被写成“直接解锁”，但依赖图要求先完成 `agent-workbench-polish`

## 结论

roadmap 在“当前解锁关系”里把 `dogfooding-blocker-burn-down` 直接挂到 `product-friction-audit` 和 `core-workflow-ux-hardening` 下面，但 `items.yaml` 里它还依赖 `agent-workbench-polish`。因此当前表述高估了它的真实可启动时机。

## 证据

- `E:\Coding\AI\j-gui\.codestable\roadmap\j-gui-v1\j-gui-v1-items.yaml:379-385`
  - `dogfooding-blocker-burn-down.depends_on` 为 `[product-friction-audit, core-workflow-ux-hardening, agent-workbench-polish]`
- `E:\Coding\AI\j-gui\.codestable\roadmap\j-gui-v1\j-gui-v1-roadmap.md:438-448`
  - 正文把它列成 `product-friction-audit` 的“直接下游”
- `E:\Coding\AI\j-gui\.codestable\roadmap\j-gui-v1\j-gui-v1-roadmap.md:449-457`
  - 正文也把它列成 `core-workflow-ux-hardening` 的“当前直接下游”

## 影响

这会让读者误以为只要完成审计和第一批核心工作流硬化，就可以立刻起 `dogfooding-blocker-burn-down`。但按当前依赖图，它至少还需要 `agent-workbench-polish` 先完成。

## 建议

把 `9.3 当前解锁关系` 改成“部分前置已完成，但尚待 `agent-workbench-polish`”，或者如果本意就是想让这条可以提前并行推进，就把 `items.yaml` 中对 `agent-workbench-polish` 的硬依赖收紧为说明性观察项，而不是阻塞性依赖。
