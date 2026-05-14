---
name: sidebar-toggle-performance
description: 左右侧边栏开关节奏卡顿的性能瓶颈分析
doc_type: explore
type: question
status: outdated
superseded-by: 2026-05-14-explore-sidebar-performance-v2
confidence: high
created: 2026-05-13
updated: 2026-05-14
---

# 速答

左右侧边栏开关卡顿的**主要瓶颈是组件级 re-render 范围过大**，而非 CSS 动画本身：

1. **LeftSidebar 是 1447 行的 mega-component**，订阅 40+ atoms，toggle 时整个组件重跑一遍（包括 15+ useMemo 依赖检查）。组件未包裹 `React.memo`。
2. **Right SidePanel 订阅整个 `Map<string, boolean>`**，toggle 任一 session 的面板都会 re-render 所有 SidePanel 实例。已有专门设计的 derived atom 未被使用。
3. **AppShell 也订阅了同一个 Map**，toggle 右面板时 AppShell re-render，连带 re-render LeftSidebar。
4. **LeftSidebar 折叠时 expanded view 仍挂载在 DOM**，所有 effects 和 atom 订阅继续活跃，SessionListItems（952 行）也在后台跑。
5. **`atomWithStorage` 同步写 localStorage**，每次 toggle 左侧栏都有一次同步 IO。

CSS transition 本身只有 200-300ms，性能正常。卡顿体感来自**Jotai atom 变更触发的组件树大面积 re-render**。

```mermaid
flowchart TD
    subgraph "左侧栏 toggle 流程"
        A1[用户点击/Cmd+B] --> B1[setSidebarCollapsed]
        B1 --> C1[atomWithStorage 更新]
        C1 --> D1[同步写 localStorage]
        C1 --> E1[Jotai 触发订阅者]
        E1 --> F1[LeftSidebar re-render<br/>40+ atom hooks<br/>15+ useMemo 检查]
        F1 --> G1[CSS width transition<br/>200ms]
    end

    subgraph "右侧栏 toggle 流程"
        A2[用户点击] --> B2[setIsOpen]
        B2 --> C2[new Map 复制<br/>O(n) sessions]
        C2 --> D2[agentSidePanelOpenMapAtom 更新]
        D2 --> E2[Jotai 触发订阅者]
        E2 --> F2[SidePanel re-render<br/>订阅整个 Map]
        E2 --> F2b[AppShell re-render<br/>订阅整个 Map]
        F2b --> G2b[LeftSidebar 被连带 re-render<br/>无 props 无法 bail out]
        F2 --> G2[CSS width/opacity transition<br/>300ms]
    end
```

---

# 关键证据

## 1. LeftSidebar mega-component 未 memo，订阅 40+ atoms

**文件:** `src/components/app-shell/LeftSidebar.tsx:1-1447`

整个组件 1447 行，直接在 AppShell 中渲染（无 props）：
```tsx
// AppShell.tsx:72
<LeftSidebar />
```

订阅的 atoms（lines 134-286）包括但不限于：
- `sidebarCollapsedAtom`
- `tabsAtom`, `activeTabIdAtom`
- `appModeAtom`
- `currentAgentSessionIdAtom`, `currentConversationIdAtom`
- `agentSessionsAtom`, `conversationsAtom`
- `archivedConversationsAtom`, `archivedAgentSessionsAtom`
- `workspaceCapabilitiesAtom`
- `searchQueryAtom`, `searchResultsAtom`
- `workspaceListHeightAtom`, `agentSidebarTopHeightAtom`
- `sidebarViewModeAtom`
- ...共 40+ 个

当 `sidebarCollapsedAtom` 变化时，整个组件函数体重跑。虽 `useMemo` 结果缓存（依赖未变），但 40+ hook 调用 + 15+ 依赖检查仍要执行。

**支撑结论:** 左侧栏 toggle 触发不必要的全组件 re-render。

---

## 2. Right SidePanel 订阅整个 Map，而非 session-local derived atom

**文件:** `src/components/agent/SidePanel.tsx:51`

```tsx
const sidePanelOpenMap = useAtomValue(agentSidePanelOpenMapAtom)
```

订阅整个 `Map<string, boolean>`，任一 session toggle 都触发本组件 re-render。

**已有但未使用的 derived atom:** `src/atoms/agent-atoms.ts:368-372`

```tsx
export const currentSessionSidePanelOpenAtom = atom((get) => {
  const sessionId = get(currentAgentSessionIdAtom)
  const map = get(agentSidePanelOpenMapAtom)
  return map.get(sessionId) ?? true
})
```

这个 derived atom 专门设计为只订阅当前 session 的值，避免全 Map 订阅。但 SidePanel 未使用。

**支撑结论:** 右侧栏 toggle 触发跨 session 的级联 re-render。

---

## 3. AppShell 也订阅同一个 Map，连带 re-render LeftSidebar

**文件:** `src/components/app-shell/AppShell.tsx:27-56`

```tsx
const sidePanelOpenMap = useAtomValue(agentSidePanelOpenMapAtom)
const currentSessionId = useAtomValue(currentAgentSessionIdAtom)
// ...
const isPanelOpen = sidePanelOpenMap.get(currentSessionId) ?? true
```

AppShell 订阅 `agentSidePanelOpenMapAtom`。当 Map 变化时 AppShell re-render。

AppShell children（LeftSidebar, MainArea）无 props：
```tsx
// AppShell.tsx:72-79
<LeftSidebar />
<MainArea />
```

React reconciliation 下，无 props 的子组件无法 bail out（父组件 re-render 时子组件跟着 re-render，除非包裹 `React.memo`）。

**支撑结论:** 右侧栏 toggle 触发 AppShell + LeftSidebar 级联 re-render。

---

## 4. LeftSidebar 折叠态下 expanded view 仍挂载

**文件:** `src/components/app-shell/LeftSidebar.tsx:1164-1240`

外层容器通过 CSS width transition 切换（200ms）。内部两套 view 通过 `hidden/flex` 切换：

```tsx
// 折叠态 view (line 1172-1234)
<div className={sidebarCollapsed ? 'flex' : 'hidden'} ...>
  {/* 折叠态内容 */}
</div>

// 展开态 view (line 1236-1439)
<div className={sidebarCollapsed ? 'hidden' : 'flex'} ...>
  {/* SessionListItems, ModeSwitcher, 搜索按钮等 */}
</div>
```

两套 view **同时在 DOM 中**，只是 `display` 切换。展开态折叠时：
- SessionListItems（952 行）仍在后台渲染
- 所有 effects 继续运行
- 所有 atom 订阅保持活跃

**支撑结论:** 折叠态下展开组件仍占内存和执行时间。

---

## 5. setIsOpen 每次复制整个 Map

**文件:** `src/components/agent/SidePanel.tsx:79-86`

```tsx
const setIsOpen = React.useCallback((value: boolean | ((prev: boolean) => boolean)) => {
  setSidePanelOpenMap((prev) => {
    const map = new Map(prev)  // <-- 复制整个 Map
    const current = map.get(sessionId) ?? true
    map.set(sessionId, typeof value === 'function' ? value(current) : value)
    return map
  })
}, [sessionId, setSidePanelOpenMap])
```

每次 toggle 创建 `new Map(prev)`，O(n) 复制所有 sessions 状态。sessions 数量少时不明显，多 sessions 时可能有体感。

**支撑结论:** 右侧栏 toggle 有额外 O(n) 内存分配开销。

---

## 6. atomWithStorage 同步写 localStorage

**文件:** `src/atoms/tab-atoms.ts:64-68`

```tsx
export const sidebarCollapsedAtom = atomWithStorage<boolean>(
  'jgui-sidebar-collapsed',
  false
)
```

`atomWithStorage` 每次 atom 变化时同步写入 localStorage。左侧栏 toggle 触发一次同步 IO。

**支撑结论:** 左侧栏 toggle 有同步 localStorage 写入（虽单次开销小，但叠加 re-render 成额外负担）。

---

# 涉及文件清单

| 文件 | 行号 | 角色 |
|------|------|------|
| `src/components/app-shell/LeftSidebar.tsx` | 1-1447 | 左侧栏 mega-component |
| `src/components/app-shell/AppShell.tsx` | 27-79 | 布局容器，订阅 sidePanelOpenMap |
| `src/components/agent/SidePanel.tsx` | 51, 79-86 | 右侧栏，订阅整个 Map |
| `src/atoms/tab-atoms.ts` | 64-68 | sidebarCollapsedAtom + atomWithStorage |
| `src/atoms/agent-atoms.ts` | 363-372 | agentSidePanelOpenMapAtom + derived atom |
| `src/components/app-shell/SessionListItems.tsx` | ~952 | Session 列表，折叠态仍渲染 |

---

# 后续建议

这份 explore 证据链已建立。如果要推进优化，建议：

1. **优先修复 SidePanel 订阅问题**（改用 `currentSessionSidePanelOpenAtom`）——改动小、收益明确
2. **LeftSidebar 拆分或 memo 化**——需评估拆分策略，mega-component 改动面较大
3. **AppShell 精简订阅**——考虑只订阅 `currentSessionSidePanelOpenAtom` 而非整个 Map
4. **折叠态下卸载展开 view**——需权衡重新挂载开销 vs 持续订阅开销

是否需要基于这份探索进入方案设计阶段？