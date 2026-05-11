---
doc_type: lib-api-ref
entry: app-shell-components
category: React Components
status: draft
source_files:
  - src/main.tsx
  - src/components/app-shell/AppShell.tsx
  - src/components/app-shell/LeftSidebar.tsx
  - src/components/tabs/MainArea.tsx
  - src/components/app-shell/RightSidePanel.tsx
  - src/components/app-shell/SearchDialog.tsx
  - src/components/welcome/WelcomeView.tsx
summary: 工作台外壳、左侧栏、主区、右侧面板、全局搜索和空状态启动器的组件参考。
last_reviewed: 2026-05-11
---

# app-shell-components

## 概述

这组组件构成 j-gui 当前工作台外壳。以 2026-05-11 的当前实现快照来看，职责已经分成两层：

- `src/main.tsx` 负责全局初始化，例如 theme、Agent settings、通知、全局监听器和 tab 持久化恢复。
- `AppShell` 负责三栏布局装配。
- `MainArea` 负责主区的 tab 容器和设置浮窗挂载。
- `SearchDialog` 提供跨 Chat / Agent 的全局搜索。
- `WelcomeView` 不再是“纯欢迎页”，而是主区无 tab 时的空状态启动器。

当前涉及的核心组件：

- `AppShell`
- `LeftSidebar`
- `MainArea`
- `RightSidePanel`
- `SearchDialog`
- `WelcomeView`

## 组件参考

### `AppShell`

文件：`src/components/app-shell/AppShell.tsx`

职责：

- 提供工作台三栏布局。
- 根据当前模式和当前会话 ID 决定是否显示右侧面板。
- 通过 `AppShellProvider` 下发 shell 级上下文。

要点：

- 不再承担应用初始化、会话列表加载或消息回填，这些逻辑已前移到 `src/main.tsx` 和各自视图内部。
- 主区组件来自 `src/components/tabs/MainArea.tsx`，不是旧路径 `src/components/app-shell/MainArea.tsx`。

### `LeftSidebar`

文件：`src/components/app-shell/LeftSidebar.tsx`

职责：

- 承载模式切换、会话列表入口和侧栏交互。
- 与 tab / session 状态联动，但不是全局初始化入口。

说明：

- 该组件当前仍处于活跃开发区域，文档只保留稳定职责，不枚举易变的局部交互细节。

### `MainArea`

文件：`src/components/tabs/MainArea.tsx`

职责：

- 组合 `TabBar` 和当前 tab 内容区。
- 在无 tab 时渲染 `WelcomeView`。
- 在主区外层常驻挂载 `SettingsDialog`。

要点：

- 当前 `MainArea` 不直接创建默认 tab。
- 当 `tabs` 非空但 `activeTabId` 为空时，会做一次防御性回填，自动激活第一个 tab。

### `RightSidePanel`

文件：`src/components/app-shell/RightSidePanel.tsx`

职责：

- 根据当前模式渲染统一的 `SidePanel`。
- Agent 模式下向 `SidePanel` 传入 `sessionPath`。
- Chat 模式下也可以打开右侧面板，但 `sessionPath` 为空。

要点：

- 它不再是旧文档所述的“独立文件树浏览器”。
- 当前真正的面板能力由 `src/components/agent/SidePanel.tsx` 承担。

### `SearchDialog`

文件：`src/components/app-shell/SearchDialog.tsx`

职责：

- 提供跨 Chat / Agent 会话的全局搜索弹窗。
- 同时支持标题匹配和消息内容匹配。

关键行为：

- 标题匹配走前端即时过滤。
- 消息内容匹配经过 debounce 后调用 IPC 搜索。
- 支持 IME composition 保护、上下键导航、回车打开和 `Esc` 关闭。
- Agent 结果可附带工作区名称标签。

边界：

- 这是会话/消息搜索，不是工作区文件搜索。

### `WelcomeView`

文件：`src/components/welcome/WelcomeView.tsx`

职责：

- 在当前模式没有打开 tab 时负责“启动一个可用会话”。
- 优先复用已有非归档会话；没有可复用会话时再创建 draft 会话。

要点：

- 它不是旧版那种静态欢迎页。
- 用户通常会直接进入完整的 `ChatView` 或 `AgentView`，而不是停留在文案空页。
- Agent 模式下会等待 agent settings 就绪后再做初始化判断。

## 组件关系

```text
src/main.tsx
  -> App
     -> AppShell
        -> LeftSidebar
        -> MainArea
           -> TabBar
           -> WelcomeView | TabContent
           -> SettingsDialog
        -> RightSidePanel?
        -> SearchDialog
```

## 关键边界

- 应用初始化已经不在 `AppShell` 内部，查启动流程应先看 [src/main.tsx](/E:/Coding/AI/j-gui/src/main.tsx)。
- `RightSidePanel` 现在是 Chat / Agent 共用入口，不应再按“Agent 专属文件树”理解。
- `SearchDialog` 已经覆盖消息正文搜索，不再局限于 `title` / `id`。
- `WelcomeView` 当前承担的是会话启动逻辑，不是品牌欢迎展示页。

## 相关条目

- [src/main.tsx](/E:/Coding/AI/j-gui/src/main.tsx)
- [src/components/app-shell/AppShell.tsx](/E:/Coding/AI/j-gui/src/components/app-shell/AppShell.tsx)
- [src/components/app-shell/LeftSidebar.tsx](/E:/Coding/AI/j-gui/src/components/app-shell/LeftSidebar.tsx)
- [src/components/tabs/MainArea.tsx](/E:/Coding/AI/j-gui/src/components/tabs/MainArea.tsx)
- [src/components/app-shell/RightSidePanel.tsx](/E:/Coding/AI/j-gui/src/components/app-shell/RightSidePanel.tsx)
- [src/components/app-shell/SearchDialog.tsx](/E:/Coding/AI/j-gui/src/components/app-shell/SearchDialog.tsx)
- [src/components/welcome/WelcomeView.tsx](/E:/Coding/AI/j-gui/src/components/welcome/WelcomeView.tsx)
- [frontend-app-shell](/E:/Coding/AI/j-gui/.codestable/architecture/frontend-app-shell.md)
