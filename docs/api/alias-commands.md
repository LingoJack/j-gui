---
doc_type: lib-api-ref
entry: alias-commands
category: Tauri IPC
status: draft
source_files:
  - src-tauri/src/commands/alias.rs
  - src/lib/tauri.ts
summary: Alias 列表、设置和删除命令的 Tauri 参考。
last_reviewed: 2026-05-09
---

# alias-commands

## 概述

这组 API 负责读取和修改 `YamlConfig` 中的 alias 配置。它当前只覆盖四个 alias section：

- `path`
- `inner_url`
- `outer_url`
- `script`

Rust 侧通过 Tauri command 暴露，前端通过 `src/lib/tauri.ts` 的 wrapper 调用。

## API 参考

### `list_aliases`

Rust command: `list_aliases() -> Result<Vec<AliasEntry>, String>`

前端 wrapper: `listAliases(): Promise<AliasEntry[]>`

用途：

- 读取当前支持的 alias 列表，供设置页或治理页展示。

输出：

- `AliasEntry[]`

字段：

- `section`
- `name`
- `value`

要点：

- 只扫描固定的四个 section：`path`、`inner_url`、`outer_url`、`script`。
- 不存在的 section 会被跳过，不会出现在结果里。
- 返回前会按 `name` 升序排序，不按 section 分组排序。

### `set_alias`

Rust command: `set_alias(section: String, name: String, value: String) -> Result<(), String>`

前端 wrapper: `setAlias(section: string, name: string, value: string): Promise<void>`

用途：

- 写入或覆盖某个 alias。

输入：

- `section`：目标 section 名称
- `name`：alias 名
- `value`：alias 值

输出：

- 成功时返回 `()`
- 失败时返回底层配置写入错误

要点：

- 当前命令本身不校验 section 是否属于 `list_aliases` 那四个固定分组。
- 写入逻辑直接委托给 `YamlConfig::set_property()`。

### `remove_alias`

Rust command: `remove_alias(section: String, name: String) -> Result<(), String>`

前端 wrapper: `removeAlias(section: string, name: string): Promise<void>`

用途：

- 删除指定 alias。

输入：

- `section`
- `name`

输出：

- 成功时返回 `()`
- 失败时返回底层配置写入错误

要点：

- 删除逻辑直接委托给 `YamlConfig::remove_property()`。
- 当前命令不要求先通过 `list_aliases()` 确认存在。

## 相关类型

### `AliasEntry`

- `section: string`
- `name: string`
- `value: string`

这是前端 wrapper 暴露的完整别名项结构。

## 前端 wrapper 要点

- `listAliases()` 直接调用 `invoke("list_aliases")`
- `setAlias(section, name, value)` 直接把三个参数透传给 `set_alias`
- `removeAlias(section, name)` 直接把两个参数透传给 `remove_alias`

bridge 层没有额外转换、缓存或校验。

## 关键边界

- `list_aliases` 的 section 范围是硬编码的 4 个值，不会自动枚举任意 YAML section。
- `set_alias` / `remove_alias` 本身没有同样的白名单限制；调用方不应把“可列出”和“可写入”的边界混为一谈。
- 返回结果只按 `name` 排序，因此同名别名如果存在于不同 section，前端需要自己区分。

## 相关条目

- [src-tauri/src/commands/alias.rs](/E:/Coding/AI/j-gui/src-tauri/src/commands/alias.rs)
- [src/lib/tauri.ts](/E:/Coding/AI/j-gui/src/lib/tauri.ts)
- [config-commands](./config-commands.md)
