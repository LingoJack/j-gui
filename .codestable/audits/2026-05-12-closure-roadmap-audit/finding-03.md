---
doc_type: audit-finding
audit: 2026-05-12-closure-roadmap-audit
finding_id: "arch-drift-03"
nature: arch-drift
severity: P1
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 03：active roadmap 明确仍有闭环主线未完成，当前不能宣称“只差收口”

## 速答

当前活动 roadmap `j-gui-v1` 自己已经把协议统一、Agent 历史回放、运行时恢复、治理双向同步、ToolSettings runtime 闭环、内容搜索闭环列为 `in-progress` 或 `planned`，因此不能再把项目表述成“前后端基本都闭环了，只差最后完成 roadmap”。

## 关键证据

- `.codestable/roadmap/j-gui-v1/j-gui-v1-roadmap.md:15-21` — 文档明确指出当前主要问题是“少数高价值链路还没真正收口”。
- `.codestable/roadmap/j-gui-v1/j-gui-v1-items.yaml:200-206` — `stream-protocol-unify` 状态为 `in-progress`。
- `.codestable/roadmap/j-gui-v1/j-gui-v1-items.yaml:208-214` — `agent-history-replay-closure` 状态为 `planned`。
- `.codestable/roadmap/j-gui-v1/j-gui-v1-items.yaml:216-222` — `agent-runtime-stability-recovery` 状态为 `planned`。
- `.codestable/roadmap/j-gui-v1/j-gui-v1-items.yaml:225-231` — `governance-bidirectional-sync` 状态为 `in-progress`。
- `.codestable/roadmap/j-gui-v1/j-gui-v1-items.yaml:241-247` — `toolsettings-runtime-closure` 状态为 `planned`。
- `.codestable/roadmap/j-gui-v1/j-gui-v1-items.yaml:249-250` — `search-content-closure` 仍在规划阶段起点。

## 影响

如果继续按“接近完成”推进，会把剩余工作误判成只是验收或润色，导致真正的高风险闭环问题继续留在产品主链路上。

## 修复方向

后续所有“是否能完成 roadmap”的判断都应基于 `j-gui-v1` 的状态语义，而不是继续复用旧 roadmap 或旧 parity `done` 的乐观口径。

## 建议动作

`cs-issue`，因为这是项目状态真相与对外口径的偏差，需要先校准，再决定实现顺序。
