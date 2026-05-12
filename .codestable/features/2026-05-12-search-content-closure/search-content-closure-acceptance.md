# search-content-closure 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-12
> 关联方案 doc：`.codestable/features/2026-05-12-search-content-closure/search-content-closure-design.md`

## 1. 接口契约核对

- [x] `MessageSearchResult`：Rust 侧新增字段与前端既有 `packages/shared/src/types/chat.ts` 对齐；代码落点：`src-tauri/src/chat_engine_payloads.rs`
- [x] `search_conversation_messages(query)`：已在 `src-tauri/src/commands/chat.rs` 落地，并注册到 `src-tauri/src/lib.rs`
- [x] Search result 仍保留 `messageId`、`snippet`、`matchStart`、`matchLength`，未退化成会话级弱结果
- [x] 流程图核对：`SearchDialog -> ipc.searchConversationMessages -> Tauri command -> ChatEngine -> openSession(messageId)` 的节点都在代码中有实际落点

## 2. 行为与决策核对

- [x] 需求摘要：Chat 内容搜索从前端 fallback 收口为正式后端命令；代码体现：`src/lib/ipc.ts` 直接调用 `invoke('search_conversation_messages')`
- [x] 明确不做：本次未扩展到跨工作区、文件内容、ToolSettings 或归档视图
- [x] 关键决策：不重写 SearchDialog UI，只收口后端真相；代码体现：`src/components/app-shell/SearchDialog.tsx` 未改协议结构
- [x] 编排层变化：Agent 继续走既有后端命令；Chat 侧补齐正式命令，双侧不再一真一假
- [x] 挂载点反向核对：实际改动集中在 design 第 2.3 节列出的 5 个挂载点内，无清单外能力扩散
- [x] 拔除沙盘推演：去掉 `search_conversation_messages` 注册后，Chat 内容搜索主链路会直接失效，说明该命令已成为真实挂载点

## 3. 验收场景核对

- [x] **A1**：Chat 内容搜索通过正式后端命令返回
  - 证据来源：`src/__tests__/ipc.test.ts` 新增 `searchConversationMessages uses the backend command as the only content-search source`
- [x] **A2**：Chat 结果继续带消息锚点
  - 证据来源：Rust 测试 `search_messages_returns_anchor_and_snippet_from_backend_truth` + `SearchDialog` 既有 `openSession(..., { messageId })`
- [x] **A3**：Agent 内容搜索未回退
  - 证据来源：未改 `search_agent_session_messages` 路径；全量测试通过
- [x] **A4**：requirement / roadmap / acceptance 文档已移除“内容搜索排除”旧表述
  - 证据来源：本次文档回写
- [x] **A5**：命令注册完成
  - 证据来源：`src-tauri/src/lib.rs`

前端验证说明：

- 本次没有新增 UI 布局或交互分支，前端改动只在 IPC 主链路；因此以 Vitest 行为测试 + 既有 SearchDialog 锚点链路代码核对作为行为证据，不额外生成浏览器截图。

## 4. 术语一致性

- `Content Search` / `messageId` / `snippet` / `matchStart` / `matchLength` 在 design、Rust、TS 和 requirement 中已对齐
- grep 未发现活动文档里继续把当前能力写成“只搜标题”的新旧并存冲突

## 5. 架构归并

- [x] `frontend-app-shell.md`：已补“Chat 侧走正式 `search_conversation_messages`，Agent 侧走正式 `search_agent_session_messages`”
- [x] 本次没有新增新的跨模块实体或 UI 模块，不需要改更多 architecture 子文档

## 6. requirement 回写

- [x] `j-gui-session-management` 已更新为当前真相：顶部搜索同时支持标题和消息内容，并可打开到消息锚点
- [x] requirement 保持 `current`，`last_reviewed` 已更新为 `2026-05-12`

## 7. roadmap 回写

- [x] `j-gui-v1-items.yaml` 对应条目已从 `planned` → `in-progress` → `done`
- [x] `feature` 已填 `2026-05-12-search-content-closure`
- [x] `j-gui-v1-roadmap.md` 已补观察项与变更日志
- [x] roadmap YAML 已通过 `validate-yaml.py`

## 8. attention.md 候选盘点

- 本 feature 未暴露需要补入 `attention.md` 的新环境/命令陷阱

## 9. 遗留

- 当前遗留不在“命令是否存在”，而在搜索排序、性能、归档视图和更强的搜索体验；这些保持在 roadmap 的后续条目中处理
- `src-tauri/src/chat_engine.rs` 与 `src-tauri/src/tests/chat_engine.rs` 的单文件行数 WARN 为现存体量告警，本次未额外做结构重组
