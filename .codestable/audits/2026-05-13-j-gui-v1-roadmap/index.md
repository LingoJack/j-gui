---
doc_type: audit-index
slug: j-gui-v1-roadmap
date: 2026-05-13
status: active
scope: 审核 `.codestable/roadmap/j-gui-v1/` 当前 roadmap 文档与 `items.yaml` 的一致性，重点检查依赖图、阶段进度、推荐顺序与已知 explore 结论是否自洽
tags: [roadmap, audit, docs, dependency-graph]
---

# j-gui-v1 roadmap 审核

## 范围

- 主文档：`E:\Coding\AI\j-gui\.codestable\roadmap\j-gui-v1\j-gui-v1-roadmap.md`
- 机器状态源：`E:\Coding\AI\j-gui\.codestable\roadmap\j-gui-v1\j-gui-v1-items.yaml`

## 总评

当前 roadmap 的总体方向是对的，新增的 `src/` 领域化重组、Proma 后端吸收、Agent 后端切换和治理面增强也都和当前代码/探索结论一致。

但文档里有几处**执行依赖图和文字叙述打架**的问题：推荐顺序、当前解锁关系和 `items.yaml` 里的 `depends_on` 没完全对齐。这类问题不会马上让代码出错，但会直接误导后续 feature-design / 排期判断，因此应尽快修正。

## 发现矩阵

| ID | 严重度 | 性质 | 置信度 | 标题 | 建议动作 |
|---|---|---|---|---|---|
| 01 | P1 | arch-drift | high | `desktop-shell-platform-polish` 的依赖和推荐顺序互相矛盾 | `cs-roadmap update` |
| 02 | P1 | arch-drift | high | `agent-governance-surface-hardening` / `system-prompt-runtime-hardening` 的依赖方向与 roadmap 文字相反 | `cs-roadmap update` |
| 03 | P2 | maintainability | high | `dogfooding-blocker-burn-down` 被写成“直接解锁”，但依赖图要求先完成 `agent-workbench-polish` | `cs-roadmap update` |

## 下一步建议

1. 先修 Finding 01 和 Finding 02。这两条会直接影响推荐执行顺序和下游 feature 的起单时机。
2. 再修 Finding 03，把“当前解锁关系”的表述收紧到和 `depends_on` 完全一致。
3. 修完后重新校对 `9.3 当前解锁关系`、`10.3 下一步明确要做`、`10.6 推荐执行顺序` 和 `items.yaml`，避免再次出现一处改了、另一处没跟上的漂移。
