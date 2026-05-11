---
doc_type: lib-api-ref
entry: system-commands
category: Tauri IPC
status: draft
source_files:
  - src-tauri/src/commands/system.rs
  - src/lib/ipc.ts
summary: 版本读取、主题持久化与 theme-changed 事件桥接的 Tauri 参考。
last_reviewed: 2026-05-09
---

# system-commands

## 概述

这组 API 负责两类系统级能力：

- 读取当前应用版本
- 写入主题并向前端广播 `theme-changed`

Rust 侧通过 Tauri command 暴露，前端通过 `src/lib/ipc.ts` 的 wrapper 和事件订阅函数调用。

## API 参考

### `get_version`

Rust command: `get_version() -> Result<String, String>`

前端 wrapper: `getVersion(): Promise<string>`

用途：

- 读取当前应用版本字符串。

输出：

- 版本字符串，来自 `j_cli::constants::VERSION`

要点：

- 当前实现不做额外拼接或格式转换，直接返回底层常量值。

### `set_theme`

Rust command: `set_theme(app: tauri::AppHandle, theme: String) -> Result<(), String>`

前端 wrapper: `setTheme(theme: string): Promise<void>`

用途：

- 保存当前主题，并向前端广播主题变更事件。

输入：

- `theme`：主题字符串

输出：

- 成功时返回 `()`
- 失败时返回 `保存主题配置失败` 或事件发送错误

要点：

- 后端会先读取 agent config，再把 `theme` 通过 `ThemeName::parse(&theme)` 写回配置。
- 配置保存成功后，才会触发 `app.emit("theme-changed", &theme)`。
- 当前事件名固定为 `theme-changed`。

## 前端事件桥接

### `onThemeChanged(callback)`

签名：`onThemeChanged(callback: (theme: string) => void): Promise<UnlistenFn>`

用途：

- 订阅 `theme-changed` 事件。

要点：

- 底层用 `listen<string>("theme-changed", ...)` 订阅。
- 返回 `UnlistenFn`，调用方需要自己决定何时取消订阅。
- 这是事件监听，不会主动拉取当前主题值。

## 前端 wrapper 要点

- `getVersion()` 是对 `get_version` 的直接封装。
- `setTheme(theme)` 只透传主题字符串，不附带额外上下文。
- `onThemeChanged(callback)` 不走 `invoke`，而是走事件系统。

## 关键边界

- 主题字符串是否有效由 `ThemeName::parse()` 决定；前端 wrapper 本身不校验。
- `set_theme` 的成功不仅依赖配置写入，也依赖 Tauri 事件发射成功。
- `onThemeChanged()` 只反映变更事件，不保证订阅时立即收到当前主题快照。

## 相关条目

- [src-tauri/src/commands/system.rs](/E:/Coding/AI/j-gui/src-tauri/src/commands/system.rs)
- [src/lib/ipc.ts](/E:/Coding/AI/j-gui/src/lib/ipc.ts)
- [config-commands](./config-commands.md)
