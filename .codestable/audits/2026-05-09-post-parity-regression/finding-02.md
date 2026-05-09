---
doc_type: audit-finding
audit: 2026-05-09-post-parity-regression
finding_id: "bug-02"
nature: bug
severity: P0
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 02：Agent 在被通知环境下自动使用 j-gui 项目目录执行工具调用

## 速答

`start_agent` 的 `permission_mode` 默认为 `"bypassPermissions"`。在这种模式下，Agent 启动后自动获得 j-gui 项目目录（`cwd` = `E:\Coding\AI\j-gui`）的完全文件系统访问权限，Claude CLI 会自发执行 Bash、Glob、Grep、Read 等工具调用——即使用户只问了与文件无关的问题。用户看到"一堆工具调用，没名称，显示 no matches"正是 Agent 在项目目录中搜索/执行的结果。

## 关键证据

- `AgentView.tsx:46` — `const [permissionMode, setPermissionMode] = useState("bypassPermissions");` — 默认 bypass，Agent 不等待审批直接执行工具
- `agent_engine.rs:66-78` — `cmd.args(&args)` + `cmd.env("ANTHROPIC_API_KEY", ...)` + `cmd.env("ANTHROPIC_BASE_URL", ...)` — 子进程继承了 j-gui 的 CWD
- `AgentView.tsx:363-366` — `if (!engine.engineStartedRef.current) { await startEngine(sessionId); }` — 用户发送任何消息都触发引擎启动
- `agent_engine.rs:291-307` — `build_claude_args` 默认 `--permission-mode bypassPermissions`

## 影响

Agent 回复用户问题之前，先执行了大量与问题无关的工具调用（读文件、搜代码、执行命令），消耗 token、拉长响应时间，且用户无法控制。权限审批不可跳过。

## 修复方向

1. 默认 `permissionMode` 改 `"default"` 而非 `"bypassPermissions"`
2. 首次启动或切换 session 时强制弹确认工作区路径
3. 允许用户停止 Agent 后清除已发出的工具调用（见 finding-04）
4. 在 AgentHeader 中展示当前工作区路径
