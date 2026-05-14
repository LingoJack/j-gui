---
doc_type: refactor-scan
refactor: 2026-05-14-sidebar-css-perf
status: pending-user-selection
scope: LeftSidebar.tsx + AppShell.tsx + RightSidePanel.tsx + SidePanel.tsx（4 文件，~2700 行）
summary: 发现 4 条优化点：性能 3 / 结构 1；按风险：低 2 / 中 2
---

# sidebar-css-perf scan

## 总览

- 扫描范围：`src/components/app-shell/LeftSidebar.tsx`、`src/components/app-shell/AppShell.tsx`、`src/components/app-shell/RightSidePanel.tsx`、`src/components/agent/SidePanel.tsx`
- 发现 4 条优化点：性能 3 / 结构 1
- 按风险：低 2 / 中 2
- 审阅结论：有一半合理，一半不严谨
- 建议先做：#1
- 建议暂不推进：#2 #4
- 建议后做：#3（需先有实际性能证据）
- 前置检查 7 条全过：✓
  - 无行为改动 ✓
  - 有测试覆盖（app-shell-layout、left-sidebar-selection-actions、side-panel-chat-workspace）✓
  - 不跨模块 ✓
  - 非口味项 ✓
  - 非生成产物 ✓
  - 范围 ≤ 15 文件 ✓
  - 候选 ≥ 3 条 ✓

## 条目

### #1 把 LeftSidebar minWidth 加入 transition 消除展开跳变   ✓

- **位置**：`src/components/app-shell/LeftSidebar.tsx:1228-1237`
- **分类**：性能
- **现状**：`transition-property: width`（Tailwind `transition-[width]`），`minWidth` 在 inline style 中瞬变（48↔180）
```tsx
style={{
  width: sidebarCollapsed ? 48 : 280,
  minWidth: sidebarCollapsed ? 48 : 180,  // 不在 transition 范围内
  transitionDuration: '200ms',
}}
```
- **问题**：展开时 minWidth 从 48 瞬变到 180，CSS computed width = max(width, minWidth)，前 ~114ms width < 180 被 minWidth 钳住无视觉变化，体感为"一跳一停再匆匆收尾"。收起时 minWidth 48 不钳住递减 width，所以收起动画平滑。展开/收起体验不对称。
- **建议**：将 `transition-property` 改为 `transition-property: width, min-width`，使 minWidth 也参与 200ms 过渡。展开时 minWidth 从 48 平滑过渡到 180，不再瞬跳。
- **建议映射的方法**：M-L4-01（Memoization / 渲染优化——减少视觉跳变等效于减少无效渲染帧）
- **风险**：低。只改 CSS transition-property，不改 JS 逻辑。minWidth 过渡在所有现代浏览器中支持。
- **验证**：HUMAN（展开侧边栏目视确认无跳变，收起仍平滑）
- **范围**：约 2 行 / 1 文件
- **审阅补充**：这条是相对合理的低风险候选项。`LeftSidebar.tsx` 目前确实只有 `width` 在过渡，而 `minWidth` 直接跳变；如果展开时存在顿挫，这个修正值得先落地。

### #2 给侧边栏动画容器加 will-change 提示 GPU 合成优化   ✓

- **位置**：`src/components/app-shell/LeftSidebar.tsx:1231`、`src/components/agent/SidePanel.tsx:344`、`src/components/app-shell/AppShell.tsx:95`
- **分类**：性能
- **现状**：三个 sidebar 动画容器都用 layout-triggering 属性（`width`、`padding`）做 transition，无 `will-change` 提示
- **问题**：浏览器在动画首帧才创建合成层，导致首帧 layout + paint 开销无法分摊。shadow-xl（box-shadow）+ rounded-2xl（border-radius clip）+ gradient 背景在每帧 reflow 时都需重绘。
- **建议**：在三个动画容器上加 `will-change: width` / `will-change: padding`，让浏览器提前创建合成层。动画结束后移除 will-change（通过 onTransitionEnd 回调或 CSS `transition` 伪类自动管理）。
- **建议映射的方法**：M-L4-01（渲染优化——减少每帧 layout/paint 开销）
- **风险**：低。`will-change` 是纯提示性属性，不改渲染结果。过度使用会占用 GPU 内存，但这里只有 3 个元素且动画短暂。
- **验证**：HUMAN（快速连续 toggle 侧边栏，对比加 will-change 前后帧率）
- **范围**：约 6 行 / 3 文件
- **审阅补充**：这条论证不严谨，不建议按原文推进。`width` 和 `padding` 都是 layout 属性，`will-change` 不能把它们变成真正的“GPU 合成动画”，更多只是提前做准备；如果长期挂载还会增加内存占用。在 `LeftSidebar.tsx`、`AppShell.tsx`、`SidePanel.tsx` 这几处，没有 profiling 证据时不建议把它当成确定收益的优化。

### #3 把 Right SidePanel 关闭时卸载 FileBrowser 内容   ✓

- **位置**：`src/components/agent/SidePanel.tsx:341-356`
- **分类**：性能
- **现状**：面板关闭时只做 `w-0 opacity-0`，内层 `w-[320px]` 始终渲染，两个 FileBrowser + FileDropZone + AttachedDirTree 始终挂载
```tsx
<div className={cn('... overflow-hidden', isOpen ? 'w-[320px]' : 'w-0')}>
  <div className={cn('w-[320px] h-full ...', isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none')}>
    <FileBrowser ... />  {/* 始终挂载 */}
  </div>
</div>
```
- **问题**：FileBrowser 实例在面板关闭时仍运行 effects 和 atom 订阅，消耗内存和 CPU。任何 atom 更新都触发这些组件 re-render。对比 LeftSidebar 已有 `sessionListMounted` 延迟挂载策略。
- **建议**：关闭时卸载内层内容（类似 LeftSidebar 的 `sessionListMounted` 模式），打开时延迟一帧再挂载（避免和 width transition 抢同一帧）。用 `isOpen` 状态 + transitionEnd 回调控制挂载。
- **建议映射的方法**：M-L4-03（Lazy Loading——按需挂载）
- **风险**：中。改变了 DOM 挂载时机，需确认：1) 打开时 FileBrowser 数据不会丢失；2) 关闭时正在进行的 IPC 请求不会报错到已卸载组件；3) 快速开关不会出现闪烁。需人工目视验证。
- **验证**：HUMAN（打开右侧面板确认文件列表正常加载；关闭再打开确认数据不丢失；快速开关无闪烁）
- **范围**：约 20 行 / 1 文件
- **审阅补充**：方向基本成立，但不是“白捡性能”。关闭时内容确实仍然挂载，风险评估也基本合理；不过要不要做，取决于是否已经观察到右侧文件面板在空闲时存在明显订阅或渲染负担。没有实际卡顿证据的话，应排在 #1 后面，不建议优先做。

### #4 把 LeftSidebar flexShrink 瞬变改为过渡   ✗

- **位置**：`src/components/app-shell/LeftSidebar.tsx:1235`
- **分类**：结构
- **现状**：`flexShrink: sidebarCollapsed ? 0 : 1` 在 inline style 中瞬变
- **问题**：`flex-shrink` 不支持 CSS transition，展开/收起时 flex 容器对 LeftSidebar 的收缩行为瞬变，可能导致中间帧布局抖动。但实际测试中未观察到明显抖动（因为 width transition 期间 flex 容器按 width 值分配空间，flexShrink 只在 width 到达终值后才生效）。
- **建议**：改为在 width transition 结束后通过 JS 切换 flexShrink（类似 sessionListMounted 的延迟策略），避免过渡期间 flex 行为不确定。
- **建议映射的方法**：M-L2-01（Extract Function——把 flexShrink 切换逻辑提取到 transitionEnd 回调）
- **风险**：中。改变了 flexShrink 切换时机，需确认收起时侧边栏不会被 flex 容器挤压到比 48px 更窄。
- **验证**：HUMAN（收起侧边栏确认宽度稳定在 48px；展开确认中间帧无抖动）
- **范围**：约 10 行 / 1 文件
- **审阅补充**：这条不太值当，文档里标成 `✗` 是对的。`flex-shrink` 本身不能过渡；如果为了它额外引入一套 JS 时机控制，只会增加复杂度，实际收益很可疑，不建议推进。
