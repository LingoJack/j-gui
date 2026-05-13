---
doc_type: feature-acceptance
feature: 2026-05-12-core-workflow-ux-hardening
status: current
created: 2026-05-12
last_reviewed: 2026-05-12
roadmap: j-gui-v1
roadmap_item: core-workflow-ux-hardening
requirement: j-gui-ai-interaction
---

# core-workflow-ux-hardening 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-12
> 关联方案 doc：`.codestable/features/2026-05-12-core-workflow-ux-hardening/core-workflow-ux-hardening-design.md`

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `WorkflowHardeningBatch` 示例：实现阶段未新增新的 runtime 接口或协议字段；代码只消费既有 tab/chat/search 入口。

**名词层“现状 → 变化”逐项核对**

- [x] 第一批修复批次仍严格限定在 `pf-006`、`pf-001`、`pf-016`、`pf-004`
- [x] 没有把 Agent 工作台、Settings 或流式协议改动混入本 feature

**流程图核对**

- [x] `tabs/chat/search` 三类挂载点都已落到代码：`WelcomeView`/`ChatView`/`SearchDialog`

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] `pf-006`：关闭最后一个 tab 后不再自动复用最近会话或偷偷创建 draft，而是停留在真实空态 `WelcomeView`
- [x] `pf-001`：Chat 主路径新增显式“工具活动”面板，工具执行过程不再只藏在流式消息内部
- [x] `pf-016`：Chat 主路径新增常驻“迁移到 Agent”入口，且保留原有 assistant 消息 action 入口
- [x] `pf-004`：搜索结果新增更稳定的元信息展示，包括类型、更新时间、工作区和“已归档”文字标识

**明确不做逐项核对**

- [x] 未新增新的后端命令或流式协议
- [x] 未改动 Agent runtime、Settings 流程或其它 Phase E 条目

**关键决策落地**

- [x] 决策“允许真实无 tab 状态，而不是关闭后自动补位”已落到 `src/components/welcome/WelcomeView.tsx`
- [x] 决策“迁移入口不新增复杂编排，只增强可见性”已落到 `src/components/chat/MigrateToAgentButton.tsx` + `ChatView.tsx`

**编排层“现状 → 变化”逐项核对**

- [x] tabs：最后一个 tab 关闭后直接进入空态
- [x] chat：工具活动和迁移入口提升到输入区上方的主路径位置
- [x] search：标题命中和内容命中都补齐细节元信息与归档文案

**流程级约束核对**

- [x] Chat/Agent 状态隔离仍通过既有 `createChat` / `createAgent`、`openTab`、`appModeAtom` 维护，未引入跨模式共享状态
- [x] 所有改动都复用现有 IPC 和 atoms，没有引入新的 fallback 表面

**挂载点反向核对**

- [x] `src/components/chat/ChatView.tsx`：新增工具活动主路径面板和迁移到 Agent 按钮入口
- [x] `src/components/chat/MigrateToAgentButton.tsx`：在原图标入口基础上新增按钮形态，迁移逻辑未分叉
- [x] `src/components/app-shell/SearchDialog.tsx`：标题/内容结果都补元信息和“已归档”文案
- [x] `src/components/welcome/WelcomeView.tsx`：改成真实空态，不再自动创建或恢复会话

## 3. 验收场景核对

- [x] **A1**：本 feature 只覆盖 4 条 finding
  - 证据来源：代码 diff + checklist
  - 结果：通过

- [x] **A2**：关闭最后一个 tab 后显示真实空态
  - 证据来源：`src/__tests__/welcome-view.test.tsx`
  - 结果：通过

- [x] **A3**：Chat 工具活动或 Agent 迁移入口能在主路径直接看到
  - 证据来源：代码审查 + `bunx tsc --noEmit` + `bash scripts/check_lint.sh`
  - 结果：通过

- [x] **A4**：搜索结果包含归档项时展示明确状态和稳定细节
  - 证据来源：`src/__tests__/search-dialog.test.tsx`
  - 结果：通过

- [x] **A5**：未引入方案外新表面功能
  - 证据来源：代码审查
  - 结果：通过

**前端肉眼验证**

- [ ] 本轮未运行桌面 UI 做肉眼验收；当前证据是针对性前端测试、TypeScript 检查和 `bash scripts/check_lint.sh`。这项需后续补一次手工界面复验。

## 4. 术语一致性

- `核心工作流`、`主路径摩擦`、`修复批次` 在代码与文档中未新增冲突命名
- 未引入 design 外的新概念词

## 5. 架构归并

- [x] `architecture/frontend-chat-ui.md`：补入 Chat 主路径工具活动面板和显式迁移按钮的现状
- [x] `architecture/frontend-app-shell.md`：补入 WelcomeView 真实空态和 SearchDialog 元信息/归档文案的现状

## 6. requirement 回写

- [x] `requirements/j-gui-ai-interaction.md` 未变，无需更新
  - 原因：本次只提升主路径可见性和空态/搜索细节，不改变用户能力边界

## 7. roadmap 回写

- [x] 已将 `j-gui-v1-items.yaml` 中 `core-workflow-ux-hardening` 从 `in-progress` 翻为 `done`
- [x] 已同步 `j-gui-v1-roadmap.md` 中对应状态与统计数字

## 8. attention.md 候选盘点

- [x] 本 feature 未暴露需要补入 attention.md 的新项目级约束

## 9. 遗留

- 后续优化点：
  - `settings-experience-hardening`
  - `agent-workbench-polish`
  - `visual-layout-polish`
- 已知限制：
  - 本轮未做桌面 UI 肉眼验收
  - `pf-001` 和 `pf-016` 当前是主路径露出增强，不包含新的复杂编排
- 实现阶段顺手发现：
  - 无
