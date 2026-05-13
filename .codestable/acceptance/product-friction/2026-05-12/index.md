---
doc_type: acceptance-index
slug: product-friction-audit
acceptance_date: 2026-05-12
status: completed
---

# Product Friction 审计（2026-05-12）

> 验收日期：2026-05-12

## 1. 本轮范围

本轮收口的是 `product-friction-audit`：

- 不修改产品代码
- 只把当前已可复用的行为证据、现有 parity 证据、历史回归审计和明确的用户体验反馈整理成结构化摩擦台账
- 为 Phase E 后续 5 条体验硬化项提供唯一事实输入

## 2. 证据来源

本轮使用的事实来源：

1. `.codestable/acceptance/proma-parity/2026-05-12/`
2. `.codestable/audits/2026-05-09-post-parity-regression/index.md`
3. `.codestable/compound/2026-05-11-explore-capability-closure-gap-vs-proma.md`
4. 已完成 feature 的 acceptance：
   - `agent-history-replay-closure`
   - `agent-runtime-stability-recovery`
   - `search-content-closure`
   - `runtime-observability-gates`
   - `toolsettings-runtime-closure`
5. 当前 roadmap 更新时的明确体验反馈：
   - “很多细节小地方 UI 问题，功能问题很大”

## 3. 区域总表

| 区域 | 结论 | 证据文件 | 主要去向 |
|---|---|---|---|
| Chat | 有主路径体验摩擦 | `chat-findings.md` | `core-workflow-ux-hardening` |
| Agent | 有高优先级工作台摩擦 | `agent-findings.md` | `agent-workbench-polish` / `dogfooding-blocker-burn-down` |
| Search | 有可用性细节摩擦 | `search-findings.md` | `core-workflow-ux-hardening` / `visual-layout-polish` |
| Settings | 有可理解性摩擦 | `settings-findings.md` | `settings-experience-hardening` |
| Tabs | 有主路径交互摩擦 | `tabs-findings.md` | `core-workflow-ux-hardening` |
| File Context | 有阻塞型功能摩擦 | `file-context-findings.md` | `agent-workbench-polish` / `dogfooding-blocker-burn-down` |
| Layout | 有视觉与布局摩擦 | `layout-findings.md` | `visual-layout-polish` |

## 4. 分级摘要

| 严重度 | 数量 | 说明 |
|---|---:|---|
| `P0` | 3 | 直接阻断主路径或迫使用户退回外部终端/手工补救 |
| `P1` | 8 | 高频交互或状态反馈问题，明显降低日常可用性 |
| `P2` | 7 | 不阻断任务，但会持续拉低体验可信度 |

## 5. 最高优先级 finding

1. Agent 工作台缺少可理解/可操作的无回应与停止路径，当前仍可能迫使用户关 tab 或退回外部终端
2. 单工作区文件上下文仍缺目录添加与文件 mention，Agent 日常开发链路不完整
3. Tabs 的无 tab 态和关闭行为仍有体验债，干扰多任务工作流

## 6. 下游约束

- `core-workflow-ux-hardening` 只能消费 `chat` / `search` / `tabs` 中的 P0/P1 finding
- `settings-experience-hardening` 只能消费 `settings` finding
- `agent-workbench-polish` 只能消费 `agent` / `file-context` finding
- `visual-layout-polish` 只能消费 `kind=visual-layout | ui-detail` 且带视觉证据的 finding
- `dogfooding-blocker-burn-down` 只能消费带 `forcedFallback` 的阻塞型 finding

## 7. 结论

- `product-friction-audit` 已完成最小闭环：
  - 七个区域都有审计结论
  - P0/P1/P2 finding 已分级
  - 每条高优先级 finding 都已映射到后续 roadmap item
- 本轮仍缺真实截图/录屏资产；当前行为证据以现有 acceptance、历史审计、parity 记录和明确用户反馈为主
- 后续若需要更强视觉证据，应在 `visual-layout-polish` 或具体实现项里补
