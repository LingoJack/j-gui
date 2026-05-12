# Shell / Sidebar — Partial

## Proma 对照点

- 来源：`proma-parity-acceptance.md` 的“全局 Shell”
- 目标：主布局、左侧栏、会话分组、Agent 侧栏增强、右侧面板、窗口拖动区域

## j-gui 实现锚点

- [AppShell.tsx](/E:/Coding/AI/j-gui/src/components/app-shell/AppShell.tsx)
- [LeftSidebar.tsx](/E:/Coding/AI/j-gui/src/components/app-shell/LeftSidebar.tsx)
- [RightSidePanel.tsx](/E:/Coding/AI/j-gui/src/components/app-shell/RightSidePanel.tsx)
- [frontend-app-shell.md](/E:/Coding/AI/j-gui/.codestable/architecture/frontend-app-shell.md)

## 行为证据

- 当前为代码锚点 + parity 清单人工判定占位
- 需后续补截图/手动验收记录

## 当前判定

- `Partial`

## 说明

- 三栏布局、模式切换、会话分组和右侧面板主入口已存在
- 但 `proma-parity-acceptance.md` 仍把 Agent Working/pinned、未查看完成状态、工作区能力提示等判为 `Fail/Partial`
- 本轮不重写这个结论，只把它落成真实 evidence 记录
