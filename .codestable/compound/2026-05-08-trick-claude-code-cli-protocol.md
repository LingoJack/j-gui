---
doc_type: trick
type: library
topic: Claude Code CLI 子进程通信协议
framework: claude-code
created: 2026-05-08
tags: [claude-code, subprocess, stdin-stdout, json-protocol, agent-sdk]
---

# Claude Code CLI 子进程通信协议

## 适用场景

需以非交互模式（headless）调用 Claude Code，通过 stdin/stdout JSON 行协议与子进程双向通信。

## 核心命令

```bash
claude -p \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --permission-mode bypassPermissions
```

### 关键 Flag

| Flag | 作用 | 缺失后果 |
|------|------|---------|
| `-p` / `--print` | 非交互模式（headless） | stdout 无 JSON 输出，CLI 进入 TUI |
| `--output-format stream-json` | 流式 JSON 输出（每行一个 JSON 对象） | 默认 text 模式仅输出最终结果文本 |
| `--verbose` | `stream-json` 模式的强制要求 | 不加会报错退出 |
| `--include-partial-messages` | 流式推送部分消息块 | 仅收到完整消息，无实时 streaming |
| `--permission-mode bypassPermissions` | 跳过工具权限审批 | CLI 会暂停等待 stdin 权限响应 |
| `--input-format stream-json` | stdin 接受流式 JSON 输入 | 默认 text 模式 |

## stdin 输入格式

用户消息：
```json
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Hello"}]}}
```

工具权限响应（approve）：
```json
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"xxx","content":"approved"}]}}
```

工具权限响应（deny）：
```json
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"xxx","content":"denied"}]}}
```

## stdout 输出格式

### Assistant 文本消息
```json
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"..."}]}}
```

### Assistant 工具调用
```json
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_xxx","name":"bash","input":{"command":"ls"}}]}}
```

### 用户消息回显（--replay-user-messages）
```json
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"..."}]}}
```

### 结果消息
```json
{"type":"result","subtype":"success","result":"...","total_cost_usd":0.01,"duration_ms":1234,"num_turns":5,"session_id":"..."}
```

## 已知坑

1. **`-p` 是必须的**——不加就是交互 TUI，stdout 不会有 JSON
2. **`--verbose` 和 `stream-json` 必须配对**——不加会直接报错退出
3. **权限模式**——`bypassPermissions` 可跳过审批流程，但失去工具控制能力；需要审批时用 `default` 或 `plan`，通过 `ToolUse` 事件的 `id` 字段构建 `tool_result` 响应
4. **进程生命周期**——关闭 stdin 不会立即杀掉进程；必须 `process.kill()` + `process.wait()`
5. **stderr** 输出运行日志，不与 stdout JSON 混淆

## 项目内代码锚点

- `src-tauri/src/agent_engine.rs:36` — CLI 子进程启动参数
- `src-tauri/src/agent_engine.rs:148-171` — stdout JSON 行解析 (`parse_sdk_line`)
- `src/components/agent/AgentView.tsx:29-110` — 前端 AgentEvent 分发

## 参考

- Claude Code CLI: `claude --help`
- Context7: `/anthropics/claude-code` (761 snippets)
- 迁移指南: `https://platform.claude.com/docs/en/agent-sdk/migration-guide`
