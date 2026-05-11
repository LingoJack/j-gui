---
doc_type: lib-api-ref
entry: governance-commands
category: Tauri IPC
status: draft
source_files:
  - src-tauri/src/commands/governance.rs
  - src/lib/ipc.ts
summary: Skills、hooks 与 MCP 配置的 Tauri 命令参考。
last_reviewed: 2026-05-09
---

# governance-commands

## 概述

这组 API 负责治理相关数据的读取和持久化：

- Skills 列表
- Hooks 列表
- MCP server 配置

Rust 侧通过 Tauri command 暴露，前端通过 `src/lib/ipc.ts` 的 wrapper 调用。

## API 参考

### `list_skills`

Rust command: `list_skills() -> Result<Vec<SkillInfo>, String>`

前端 wrapper: `listSkills(): Promise<SkillInfo[]>`

用途：
- 读取所有可用 skills，用于前端治理页展示。

输入：
- 无。

输出：
- `SkillInfo[]`

字段：
- `name`
- `description`
- `source`
- `dirPath`

要点：
- `source` 只来自两类值：`user` 或 `project`。
- `dirPath` 是技能目录路径的字符串形式。

### `list_hooks`

Rust command: `list_hooks() -> Result<Vec<HookInfo>, String>`

前端 wrapper: `listHooks(): Promise<HookInfo[]>`

用途：
- 读取当前已加载的 hooks 列表。

输入：
- 无。

输出：
- `HookInfo[]`

字段：
- `name`
- `event`
- `source`
- `hookType`
- `label`
- `timeout`
- `onError`
- `uniqueId`

要点：
- `event` 是后端把 `HookEvent` 映射成字符串后的结果，当前代码里能输出的值只有：
  - `PreSendMessage`
  - `PostSendMessage`
  - `PreLlmRequest`
  - `PostLlmResponse`
  - `PreToolExecution`
  - `PostToolExecution`
  - `PostToolExecutionFailure`
  - `Stop`
  - `PreMicroCompact`
  - `PostMicroCompact`
  - `PreAutoCompact`
  - `PostAutoCompact`
  - `SessionStart`
  - `SessionEnd`
- `source` 和 `hookType` 直接来自底层类型的 `to_string()`，前端应按普通字符串处理。
- `onError` 只在底层存在值时返回，且当前映射只有 `skip` 和 `stop`。

### `list_mcp_servers`

Rust command: `list_mcp_servers() -> Result<Vec<McpServerConfig>, String>`

前端 wrapper: `listMcpServers(): Promise<McpServerConfig[]>`

用途：
- 读取 MCP server 配置文件。

输入：
- 无。

输出：
- `McpServerConfig[]`

字段：
- `name`
- `transport`
- `command`
- `args`
- `url`
- `env`
- `disabled`

要点：
- 配置文件位置是 `~/.jdata/agent/mcp_config.json`。
- 文件不存在时返回空数组。
- 顶层必须是数组，否则返回 `MCP 配置格式错误: 顶层必须是数组`。
- 读取或解析失败会返回对应错误信息。

### `save_mcp_servers`

Rust command: `save_mcp_servers(servers: Vec<McpServerConfig>) -> Result<(), String>`

前端 wrapper: `saveMcpServers(servers: McpServerConfig[]): Promise<void>`

用途：
- 保存 MCP server 配置。

输入：
- `servers`：要写入的 server 列表。

输出：
- 成功时返回 `()`
- 失败时返回 `String` 错误信息

要点：
- 会先确保 `~/.jdata/agent/` 目录存在。
- 如果已有配置文件，会先读取并校验顶层数组格式。
- 保存时按 `name` 作为合并键：
  - 同名条目会用新传入的数据覆盖已知字段
  - 旧对象里存在但 payload 没有的额外字段会被保留
- 最终写出的内容是 pretty JSON。
- 如果已有配置文件不是数组，会直接报错，不会继续写。

## 前端 wrapper 要点

- `listSkills()`、`listHooks()`、`listMcpServers()` 都是只读查询。
- `saveMcpServers(servers)` 直接把数组传给后端，没有额外格式转换。
- wrapper 的字段名和 Rust 侧的 `camelCase` 序列化保持一致，比如 `dirPath`、`hookType`、`uniqueId`。

## 关键边界

- `list_skills` 和 `list_hooks` 都只负责当前加载结果，不做额外过滤。
- `list_hooks` 的 `event` 不要自行扩展成未在源码里出现的枚举值。
- `list_mcp_servers` 读取的是单个 JSON 文件，不是目录扫描。
- `save_mcp_servers` 是按 `name` 做合并，不是按顺序做补丁。
- `save_mcp_servers` 只会输出传入的 server 列表；不在入参里的已有条目不会保留。

## 相关条目

- [src-tauri/src/commands/governance.rs](/E:/Coding/AI/j-gui/src-tauri/src/commands/governance.rs)
- [src/lib/ipc.ts](/E:/Coding/AI/j-gui/src/lib/ipc.ts)
