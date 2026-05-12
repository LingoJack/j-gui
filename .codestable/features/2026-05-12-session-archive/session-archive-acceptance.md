# session-archive 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-12
> 关联方案 doc：`.codestable/features/2026-05-12-session-archive/session-archive-design.md`

## 1. 接口契约核对

- [x] Chat 归档命令：`toggle_archive_conversation` 已在 `src/lib/ipc.ts`、`src-tauri/src/commands/chat.rs`、`src-tauri/src/lib.rs` 接通
- [x] Agent 归档命令：`toggle_archive_agent_session` 已在 `src/lib/ipc.ts`、`src-tauri/src/commands/agent.rs`、`src-tauri/src/lib.rs` 接通
- [x] 侧边栏归档视图使用 `archived` 真值过滤，而不是前端本地假状态；代码落点：`src/components/app-shell/LeftSidebar.tsx`
- [x] SearchDialog 标题/内容结果都保留 `archived` 字段，并能继续打开目标会话

## 2. 行为与决策核对

- [x] 需求摘要：归档现在是“软隐藏但仍可搜索/打开”的真实能力，不是删除或前端视觉假动作
- [x] 明确不做：本次未补自动批量归档、独立归档中心页面或删除恢复
- [x] 关键决策：只有在搜索与回放可信后才把归档翻成 done；当前两个前置条件已经满足
- [x] 编排层核对：归档状态从后端元数据持久化，统一驱动侧边栏 active/archived 视图与搜索展示
- [x] 挂载点反向核对：归档相关改动与证据集中在 design 第 2.3 节列出的侧边栏、搜索、IPC 与后端持久化挂载点内
- [x] 拔除沙盘推演：若移除后端归档命令，当前侧边栏切换与搜索归档标记都无法保持真实一致，说明归档已不再是伪闭环

## 3. 验收场景核对

- [x] **A1**：归档 Chat 会话
  - 证据来源：`src/components/app-shell/LeftSidebar.tsx` 的 `handleToggleArchiveConversation`
- [x] **A2**：归档 Agent 会话
  - 证据来源：`src/components/app-shell/LeftSidebar.tsx` 的 `handleToggleArchiveAgentSession`
- [x] **A3**：从搜索结果打开已归档项
  - 证据来源：`src/components/app-shell/SearchDialog.tsx` 保留 `archived` 标记并保留内容命中的 `messageId` 打开能力；对应回归：`src/__tests__/search-dialog.test.tsx`
- [x] **A4**：取消归档
  - 证据来源：Chat Rust 测试 `test_toggle_archive_cycle` + Agent 元数据切换实现 `toggle_archive_agent_session`
- [x] **A5**：代码与 roadmap 对齐
  - 证据来源：本次 `j-gui-v1-items.yaml` / `j-gui-v1-roadmap.md` 回写

前端验证说明：

- 本次主要是对既有归档能力做 feature 文档与 roadmap 收口，没有新增布局；行为证据以现有代码挂载点和后端/IPC 测试为主，未单独追加浏览器截图。

## 4. 术语一致性

- 活动文档与代码已统一使用 `archived`、`active view`、`archived view` 这组现行概念
- roadmap 不再把“归档能力是否存在”与“归档后体验是否可信”混写成同一个未实现问题

## 5. 架构归并

- [x] `j-gui-session-management` 已补归档能力到当前真相描述
- [x] `frontend-app-shell.md` 现有对归档视图、归档结果与过滤逻辑的描述已能承载当前能力，无需额外新增子文档

## 6. requirement 回写

- [x] `j-gui-session-management` 已更新用户故事与解决方案，明确支持归档/取消归档与归档结果搜索
- [x] requirement 保持 `current`，`last_reviewed` 维持 `2026-05-12`

## 7. roadmap 回写

- [x] `session-archive` 已从 `planned` 翻为 `done`
- [x] `feature` 已填写 `2026-05-12-session-archive`
- [x] `j-gui-v1-roadmap.md` 的进度数字、Checklist 与下一步已同步
- [x] roadmap YAML 将与本次 feature 文档一起通过校验

## 8. attention.md 候选盘点

- 本 feature 未暴露需要补入 `attention.md` 的新环境/命令陷阱

## 9. 遗留

- 当前遗留不在“有没有归档”，而在后续是否需要自动归档策略或更强的归档管理 UI；这些仍属于后续需求，不混入本项闭环
- 归档相关 UI 行为本轮未新增浏览器肉眼验证证据，如后续做 Proma 对标截图可一起补齐
