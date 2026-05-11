---
doc_type: audit-finding
audit: 2026-05-12-closure-roadmap-audit
finding_id: "maintainability-04"
nature: maintainability
severity: P1
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 04：`ipc.ts` 保留大量未注册 command 包装，持续放大“看起来有能力”的假象

## 速答

`src/lib/ipc.ts` 已经不只是通信封装，而是混合了承诺能力、fallback、占位接口和未注册命令包装。这样会让页面实现误以为后端能力存在，也让 roadmap 很容易把“前端 API 在”误判成“产品闭环”。

## 关键证据

- `src/lib/ipc.ts:871-906` — 工作区更新、能力读取、MCP 测试、技能更新等一组接口全部以 `tryInvoke(...)` 暴露。
- `src/main.tsx:117-126` — 应用启动后直接依赖 `getWorkspaceCapabilities(...)` 读取能力变化。
- `src-tauri/src/lib.rs:17-114` — 注册表并没有对应的 `update_agent_workspace`、`reorder_agent_workspaces`、`get_workspace_capabilities`、`test_mcp_server`、`update_skill_from_source`。

## 影响

这类接口继续集中堆在 `ipc.ts` 会放大维护成本：前端实现者需要先猜“这个接口是真后端还是 fallback”，审计和 roadmap 也更容易被伪闭环迷惑。

## 修复方向

把 `ipc.ts` 里的接口按“真实后端能力 / 明确 fallback / 预留未实现”分层，至少不要再让未注册 command 与正式能力同权暴露。

## 建议动作

`cs-refactor`，因为问题核心是封装层职责混杂和表达不清，适合在不改产品范围的前提下做结构收口。
