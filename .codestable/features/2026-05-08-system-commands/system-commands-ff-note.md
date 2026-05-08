---
doc_type: feature-ff-note
feature: system-commands
date: 2026-05-08
tags: [backend, system, theme, version]
---

## 做了什么
新增 system 命令：get_version（显示 j-cli 版本号）、set_theme（暗/亮主题切换，通过 Tauri Event 广播）。ChatHeader 增加版本号标签 + 太阳/月亮主题切换按钮。AppShell 监听 themeAtom 自动切换 .dark CSS class。

## 改了哪些
- `src-tauri/src/commands/system.rs` — 新增 get_version / set_theme 命令
- `src-tauri/src/commands/mod.rs` — 注册 system 模块
- `src-tauri/src/lib.rs` — 注册 2 个 system 命令
- `src/atoms/theme.ts` — 新增 themeAtom
- `src/lib/tauri.ts` — 新增 getVersion() 绑定
- `src/components/chat/ChatView.tsx` — ChatHeader 增加版本标签 + 主题切换按钮
- `src/components/app-shell/AppShell.tsx` — useEffect 监听 themeAtom 切换 .dark class

## 怎么验证的
cargo check + tsc 零错误。
