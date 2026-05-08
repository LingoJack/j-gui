---
doc_type: feature-ff-note
feature: three-column-layout
date: 2026-05-08
tags: [frontend, ui, layout, app-shell]
---

## 做了什么
实现三栏布局骨架：左侧栏（280px/48px 可折叠，Chat/Agent 模式切换 + 会话列表占位）、主区域（标签页框架）、右侧面板（Agent 模式文件浏览器占位）。

## 改了哪些
- `src/atoms/app-mode.ts` — 新增 appModeAtom ('chat' | 'agent')
- `src/atoms/sidebar.ts` — 新增 sidebarOpenAtom, rightPanelOpenAtom
- `src/components/app-shell/AppShell.tsx` — 新增三栏 flex 布局容器
- `src/components/app-shell/LeftSidebar.tsx` — 新增可折叠左侧栏，含 ModeSwitch + 会话列表占位 + 版本号
- `src/components/app-shell/MainArea.tsx` — 新增标签页框架（TabBar + TabContent）
- `src/components/app-shell/RightSidePanel.tsx` — 新增右侧文件浏览器占位面板
- `src/App.tsx` — 替换 greet 页面为 AppShell
- `vite.config.ts` — 添加 @/ 路径 alias

## 怎么验证的
`bunx tsc --noEmit` 零错误；`bun run tauri dev` 启动成功，窗口显示三栏布局，侧栏可折叠，模式切换 + 标签页交互正常。
