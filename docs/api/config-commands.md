---
doc_type: lib-api-ref
entry: config-commands
category: Tauri IPC
status: draft
source_files:
  - src-tauri/src/commands/config.rs
  - src/lib/tauri.ts
summary: Agent 配置、YamlConfig 与系统提示词读写的 Tauri 命令参考。
last_reviewed: 2026-05-09
---

# config-commands

## 概述

这组 API 负责三类配置读写：

- Agent provider 配置与当前 active provider
- `YamlConfig` 里的分段键值配置
- 系统提示词

Rust 侧通过 Tauri command 暴露，前端通过 `src/lib/tauri.ts` 的 wrapper 调用。

## API 参考

### `get_agent_config`

Rust command: `get_agent_config() -> Result<AgentConfigInfo, String>`

前端 wrapper: `getAgentConfig(): Promise<AgentConfigInfo>`

用途：
- 读取当前 Agent 配置，用于前端设置页展示。

输入：
- 无。

输出：
- `providers: ProviderInfo[]`
- `activeIndex: number`
- `theme: string`

字段：
- `ProviderInfo.name`
- `ProviderInfo.apiBase`
- `ProviderInfo.apiKey`
- `ProviderInfo.model`
- `ProviderInfo.supportsVision`

要点：
- 返回的 `apiKey` 不是原值，而是掩码后的显示值。
- 掩码规则只看字符串长度：
  - 长于 8 时保留前 4 位和后 4 位，中间替换为 `...`
  - 长于 2 时保留前 2 位和后 2 位，中间替换为 `...`
  - 其余情况直接变成 `...{原值}`
- `theme` 来自底层配置的 `to_str()` 结果，前端按字符串使用。

### `set_agent_config`

Rust command: `set_agent_config(config: AgentConfigInfo) -> Result<(), String>`

前端 wrapper: `setAgentConfig(config: AgentConfigInfo): Promise<void>`

用途：
- 保存 Agent 配置、provider 列表和 active provider。

输入：
- `config.providers`：provider 列表。
- `config.activeIndex`：当前激活的 provider 索引。
- `config.theme`：主题字符串，原样传回后端。

输出：
- 成功时返回 `()`
- 失败时返回 `String` 错误信息

要点：
- 如果传入的 `apiKey` 包含 `...`，后端会把它当作“被掩码的旧密钥”，并尝试保留同一位置旧 provider 的原始 `api_key`。
- 如果对应位置没有旧 provider，就会把传入的 `apiKey` 原样写回。
- `activeIndex` 只有在 provider 列表非空时才做越界检查；当索引不合法时返回 `无效的 provider 索引: ...`。
- 保存失败时返回 `保存配置失败`。

### `set_active_provider`

Rust command: `set_active_provider(index: usize) -> Result<(), String>`

前端 wrapper: `setActiveProvider(index: number): Promise<void>`

用途：
- 只切换当前激活的 provider，不改其他配置。

输入：
- `index`：provider 索引。

输出：
- 成功时返回 `()`
- 失败时返回 `String` 错误信息

要点：
- 索引必须小于当前 provider 数量，否则返回 `无效的 provider 索引: ...`。
- 保存失败时返回 `保存配置失败`。

### `get_config`

Rust command: `get_config() -> Result<YamlConfigInfo, String>`

前端 wrapper: `getConfig(): Promise<YamlConfigInfo>`

用途：
- 读取 `YamlConfig` 当前内容，供前端设置项展示和编辑。

输入：
- 无。

输出：
- `sections: Record<string, Record<string, string>>`

要点：
- 只返回 `j_cli::constants::ALL_SECTIONS` 中定义的 section。
- 只包含实际存在的 section；不存在的 section 不会出现在结果里。
- section 内部是普通字符串键值表。

### `set_config`

Rust command: `set_config(section: String, key: String, value: String) -> Result<(), String>`

前端 wrapper: `setConfig(section: string, key: string, value: string): Promise<void>`

用途：
- 写入或删除 `YamlConfig` 中的单个键值。

输入：
- `section`：section 名称。
- `key`：属性名。
- `value`：属性值。

输出：
- 成功时返回 `()`
- 失败时返回底层配置写入错误

要点：
- `value` 为空字符串时会删除该属性。
- `value` 非空时会写入该值。
- 这个命令只处理单个键值，不做额外校验或转换。

### `get_system_prompt`

Rust command: `get_system_prompt() -> Result<Option<String>, String>`

前端 wrapper: `getSystemPrompt(): Promise<string | null>`

用途：
- 读取当前系统提示词。

输入：
- 无。

输出：
- `Some(String)` 时前端得到字符串
- 没有保存内容时返回 `null`

### `set_system_prompt`

Rust command: `set_system_prompt(prompt: String) -> Result<(), String>`

前端 wrapper: `setSystemPrompt(prompt: string): Promise<void>`

用途：
- 保存系统提示词。

输入：
- `prompt`：提示词正文。

输出：
- 成功时返回 `()`
- 失败时返回 `保存系统提示词失败`

## 前端 wrapper 要点

- `getAgentConfig()` / `setAgentConfig(config)` / `setActiveProvider(index)` 对应 Agent 配置读写命令。
- `getConfig()` / `setConfig(section, key, value)` 对应 `YamlConfig` 读写命令。
- `getSystemPrompt()` / `setSystemPrompt(prompt)` 对应系统提示词读写命令。
- wrapper 里没有额外的数据转换，主要是把参数按 `invoke` 所需的对象形状传给后端。

## 关键边界

- `get_agent_config` 返回的是掩码后的 `apiKey`，前端不要把它当成真实密钥。
- `set_agent_config` 会把包含 `...` 的 `apiKey` 视为“保留旧值”的信号，这个判断是字符串包含关系，不是结构化标记。
- `set_active_provider` 和 `set_agent_config` 都会对 provider 索引做边界检查，但错误触发条件不同。
- `get_config` 只收集 `ALL_SECTIONS` 里的 section，不会枚举任意未知 section。
- `set_config` 用空字符串表示删除，不表示“写入空值”。
- `get_system_prompt` 的返回值是可空字符串，不要强制当成必有值。

## 相关条目

- [src-tauri/src/commands/config.rs](/E:/Coding/AI/j-gui/src-tauri/src/commands/config.rs)
- [src/lib/tauri.ts](/E:/Coding/AI/j-gui/src/lib/tauri.ts)
