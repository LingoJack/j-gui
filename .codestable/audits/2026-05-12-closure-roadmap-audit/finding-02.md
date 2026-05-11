---
doc_type: audit-finding
audit: 2026-05-12-closure-roadmap-audit
finding_id: "arch-drift-02"
nature: arch-drift
severity: P0
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 02：MCP 测试入口在 UI 可见，但测试本身被用例确认后端不存在

## 速答

Settings 里的 MCP “测试连接”入口不是完整闭环：表单会真实调用 `test_mcp_server`，但仓库测试已经明确断言该 command 在后端不可用。

## 关键证据

- `src/components/settings/McpServerForm.tsx:172-178` — 表单点击测试后直接执行 `ipc.testMcpServer(serverName, entry)`，并把结果回显到 UI。
- `src/lib/ipc.ts:891-892` — `testMcpServer` 调用 `tryInvoke('test_mcp_server', { name, entry })`，没有 fallback 成功值。
- `src/__tests__/ipc.test.ts:84-87` — 用例明确断言 `ipc.testMcpServer(...)` 应抛出 `"Tauri command 'test_mcp_server' not available"`。
- `src-tauri/src/lib.rs:17-114` — 注册表中没有 `test_mcp_server`。

## 影响

这不是普通的“还没优化好”，而是 UI 明示存在测试能力，但代码自己承认后端不存在。对用户来说，这会把 MCP 配置台变成半闭环入口，也会误导 roadmap 对治理能力的完成判断。

## 修复方向

要么补出真实的 `test_mcp_server` 后端能力并纳入注册表，要么在 UI 和文档中显式降级，不再把它作为已存在的工作流入口。

## 建议动作

`cs-issue`，因为这里是用户可触达的伪能力，不应继续停留在“测试会抛 not available”的状态。
