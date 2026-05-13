---
doc_type: audit-index
date: 2026-05-13
scope: 桌面壳层主窗口生命周期、全局显示主界面快捷键、左侧拖拽区、顶部窗口控制整合
auditor: Codex GPT-5
status: active
---

# 审计：desktop shell lifecycle

## 范围

| 文件 | 关注点 |
|---|---|
| `src/lib/shortcut-defaults.ts` | `show-main-window` 是否仍存在于真实快捷键定义 |
| `src/components/settings/ShortcutSettings.tsx` | 快捷键管理页是否展示全局快捷键 |
| `src/lib/global-shortcut-manager.ts` | 全局显示主界面快捷键实际注册和恢复动作 |
| `src/components/shortcuts/GlobalShortcuts.tsx` / `src/main.tsx` | 全局快捷键是否在应用启动时接入 |
| `src-tauri/src/lib.rs` / `src-tauri/Cargo.toml` | 主窗口关闭语义、托盘驻留能力、宿主侧生命周期 |
| `src/components/app-shell/AppShell.tsx` / `WindowControls.tsx` / `TabBar.tsx` / `LeftSidebar.tsx` / `SidePanel.tsx` | 拖拽区与窗口按钮的布局整合 |

## 总评

当前桌面壳层已经具备自定义窗口按钮和全局快捷键注册的局部能力，但**主窗口生命周期并没有真正闭环**。`Ctrl/Cmd+Shift+P`、关闭窗口、托盘驻留、快捷键管理可见性、拖拽区和按钮壳层整合现在仍是割裂的几段实现，不应对外表述为“桌面存在态已完成”。

## 发现清单

| # | 性质 | 严重度 | 置信度 | 文件:行号 | 摘要 | 建议动作 |
|---|---|---|---|---|---|---|
| 01 | bug | P1 | high | `src/components/settings/ShortcutSettings.tsx:277-345` | `show-main-window` 仍在默认表里，但快捷键设置页根本不渲染 `global` 分类 | cs-issue |
| 02 | arch-drift | P1 | high | `src-tauri/src/lib.rs:157-180`, `src-tauri/Cargo.toml:15-33`, `src/components/app-shell/WindowControls.tsx:86-97` | 当前没有真实的关闭保活 / 托盘驻留生命周期；关闭按钮仍直接 `window.close()` | cs-feat |
| 03 | maintainability | P1 | high | `src/lib/global-shortcut-manager.ts:16-35` | `Ctrl/Cmd+Shift+P` 只做“显示当前窗口”，没有接入隐藏后恢复的桌面存在态模型 | cs-feat |
| 04 | UX | P2 | high | `src/components/app-shell/LeftSidebar.tsx:97-114`, `src/styles/globals.css:572-575` | 左侧边栏主体几乎都是 `titlebar-no-drag` 交互块，没有明确、连续的可拖拽表面 | cs-refactor |
| 05 | UX | P2 | high | `src/components/app-shell/WindowControls.tsx:60-99`, `src/components/tabs/TabBar.tsx:220-230`, `src/components/agent/SidePanel.tsx:341-365` | 右上角按钮是悬浮块，TabBar 只是预留空位，右侧文件面板又自成一层，导致视觉割裂 | cs-refactor |

## 下一步建议

- 先按 `.codestable/features/2026-05-13-desktop-presence-lifecycle/desktop-presence-lifecycle-design.md` 收口桌面生命周期真相，再实现。
- 第一优先级应是 P1-01 和 P1-02：先让快捷键“真实可见”，再把“关闭窗口后的存活语义”做成真实宿主能力。
- 左侧拖拽区和右上角按钮壳层整合属于同一桌面壳层体验问题，但应跟随生命周期方案一起落，不建议单独热修成视觉补丁。
