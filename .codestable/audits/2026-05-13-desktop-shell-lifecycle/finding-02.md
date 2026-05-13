---
doc_type: audit-finding
date: 2026-05-13
severity: P1
category: arch-drift
confidence: high
file: src-tauri/src/lib.rs
line: 157
---

# Finding-02: 当前并没有真正的“关闭窗口保活到托盘”生命周期

## 证据

`src/components/app-shell/WindowControls.tsx:86-97` 的关闭按钮当前直接执行：

```ts
void appWindow.close()
```

而宿主侧 `src-tauri/src/lib.rs:157-180` 只注册了：

- `tauri_plugin_global_shortcut`
- `tauri_plugin_opener`
- `tauri_plugin_shell`
- `tauri_plugin_fs`
- `tauri_plugin_dialog`

没有看到：

- tray 插件接入
- `CloseRequested` 拦截
- 隐藏主窗口而非退出进程的宿主逻辑

`src-tauri/Cargo.toml:15-33` 依赖里也没有显式 tray 插件。

## 影响

- 当前 dev 客户端不能诚实地说“关闭窗口会收起到托盘并保活”。
- `Ctrl/Cmd+Shift+P` 缺少一个稳定的“从后台驻留态恢复主窗口”的目标状态。
- 如果用户以为关闭后还能唤回，实际行为很可能是直接结束当前前台主窗口生命周期。

## 建议动作

这是 `cs-feat` 级问题，不适合只修一处按钮点击。需要把关闭语义、托盘/Dock 入口、全局唤回动作一起设计并落地。
