---
doc_type: audit-finding
slug: governance-and-prompt-hardening-dependency-inversion
date: 2026-05-13
severity: P1
category: arch-drift
confidence: high
suggested_action: cs-roadmap
---

# Finding 02: `agent-governance-surface-hardening` / `system-prompt-runtime-hardening` 的依赖方向与 roadmap 文字相反

## 结论

roadmap 正文把这两条写成应先推进、再把结果汇入 `settings-experience-hardening`；但 `items.yaml` 里它们自己反而依赖 `settings-experience-hardening`。这使得“谁是前置、谁是后续整合”完全反过来了。

## 证据

- `E:\Coding\AI\j-gui\.codestable\roadmap\j-gui-v1\j-gui-v1-items.yaml:363-377`
  - `agent-governance-surface-hardening.depends_on` 包含 `settings-experience-hardening`
  - `system-prompt-runtime-hardening.depends_on` 也包含 `settings-experience-hardening`
- `E:\Coding\AI\j-gui\.codestable\roadmap\j-gui-v1\j-gui-v1-roadmap.md:458-461`
  - 正文写的是“`agent-governance-surface-hardening` 与 `system-prompt-runtime-hardening` 收口后，设置区的后续硬化应继续汇入 `settings-experience-hardening`”
- `E:\Coding\AI\j-gui\.codestable\roadmap\j-gui-v1\j-gui-v1-roadmap.md:518-525`
  - `10.3 下一步明确要做` 把这两条排在第 5 步
  - `settings-experience-hardening` 被放到第 7 步
- `E:\Coding\AI\j-gui\.codestable\roadmap\j-gui-v1\j-gui-v1-roadmap.md:579-583`
  - `10.6 推荐执行顺序` 同样把这两条排在 `settings-experience-hardening` 前面

## 影响

这会让后续 roadmap 消费者无所适从：

- 按 `items.yaml` 起单，这两条现在还不能做；
- 按 roadmap 正文排期，它们却又应该先于 `settings-experience-hardening`。

这不是措辞小问题，而是依赖图方向已经反了。

## 建议

明确其中一种真实关系并统一全文件：

1. 如果这两条是“具体设置面真问题”的前置拆项，就应从 `depends_on` 中移除 `settings-experience-hardening`，反过来让 `settings-experience-hardening` 依赖它们。
2. 如果这两条只是设置体验大项里的子切片，那么正文的“先做它们，再汇入 settings”表述和推荐顺序都应回收，避免把同一件事写成前置主线。
