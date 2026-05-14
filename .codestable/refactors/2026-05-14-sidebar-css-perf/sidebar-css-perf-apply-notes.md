---
doc_type: refactor-apply-notes
refactor: 2026-05-14-sidebar-css-perf
---

# sidebar-css-perf apply notes

## 步骤 1: 拆分左侧栏壳层与展开内容
- 完成时间: 2026-05-14
- 改动文件:
  - `src/components/app-shell/LeftSidebar.tsx`
  - `src/__tests__/left-sidebar-selection-actions.test.tsx`
- 验证结果:
  - `bunx tsc --noEmit` 通过
  - `bun run test src/__tests__/left-sidebar-selection-actions.test.tsx` 通过
  - `bun run test src/__tests__/app-shell-layout.test.tsx` 通过
  - `bun run test src/__tests__/global-shortcuts.test.tsx` 通过
- 偏离:
  - 原设计把“重内容延后卸载”作为统一方向；实际验证后调整为“重内容保持挂载，但从开关状态重渲染、焦点、可访问树和点击命中链路隔离”。这样避免打开时重新挂载文件树/会话列表造成第二次卡顿。
  - 视觉动画不再使用外层 `width` 过渡；左侧栏内部用裁剪和透明度呈现展开/收起，外层布局只在展开开始或收起结束做一次宽度切换。

## 步骤 2: 隔离右侧栏布局动画链路
- 完成时间: 2026-05-14
- 改动文件:
  - `src/components/app-shell/AppShell.tsx`
  - `src/components/agent/SidePanel.tsx`
  - `src/__tests__/app-shell-layout.test.tsx`
  - `src/__tests__/side-panel-chat-workspace.test.tsx`
- 验证结果:
  - `bunx tsc --noEmit` 通过
  - `bun run test src/__tests__/side-panel-chat-workspace.test.tsx` 通过
  - `bun run test src/__tests__/app-shell-layout.test.tsx` 通过
- 偏离:
  - 未按 checklist 的“关闭后卸载内容”执行。原因是用户反馈右侧栏打开后文件夹显示延迟，本轮选择保留内容挂载，避免把卡顿从点击阶段转移到文件树重新挂载阶段。
  - 右侧栏外层布局槽只负责开关边界，视觉动画改由 `SidePanel` 内部裁剪和透明度完成。

## 步骤 3: 清理隐藏层命中和验证
- 完成时间: 2026-05-14
- 改动文件:
  - `src/components/app-shell/LeftSidebar.tsx`
  - `src/components/agent/SidePanel.tsx`
  - `src/__tests__/side-panel-chat-workspace.test.tsx`
- 验证结果:
  - `bunx tsc --noEmit` 通过
  - `bun run test src/__tests__/global-shortcuts.test.tsx` 通过
  - `bun run test src/__tests__/left-sidebar-selection-actions.test.tsx src/__tests__/app-shell-layout.test.tsx src/__tests__/side-panel-chat-workspace.test.tsx` 通过
- 偏离:
  - 同步修正隐藏层的 `aria-hidden` / `inert`，避免透明面板留在焦点或点击路径中。
  - 移除侧栏动画容器上的整面 `titlebar-drag-region`，避免 Tauri 拖拽命中区域在宽度变化期间挡住普通点击。
