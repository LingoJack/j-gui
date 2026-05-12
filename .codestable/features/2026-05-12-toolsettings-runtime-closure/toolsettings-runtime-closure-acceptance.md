# toolsettings-runtime-closure 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-12
> 关联方案 doc：`.codestable/features/2026-05-12-toolsettings-runtime-closure/toolsettings-runtime-closure-design.md`

## 1. 接口契约核对

- [x] `list_chat_tools / set_tool_enabled` 继续作为唯一后端工具真相；代码落点：`src/lib/ipc.ts`、`src-tauri/src/commands/governance.rs`
- [x] `ToolSettings` 与 `ToolSelectorPopover` 现已共用 `chatToolsAtom + getChatTools / updateChatToolState`，不再各自维护脱节状态
- [x] `sendMessage()` 不再把 `enabledToolIds` 塞进 `send_message` 请求，避免继续触发 `chat_engine.rs` 的 unsupported 字段判定
- [x] 流程图核对：`ToolSettings / ToolSelector -> list_chat_tools / set_tool_enabled -> GovernanceKernel` 仍成立；`ChatView -> enabledToolIds -> send_message` 这条伪闭环链路已拔除

## 2. 行为与决策核对

- [x] 需求摘要：ToolSettings 闭环的目标是“设置真相与 runtime 真相一致”，不是继续维持一个前端看起来能选、后端其实不消费的请求字段
- [x] 明确不做：本次未补自定义工具 CRUD、凭据编辑、工具连通性测试，也未扩展成逐条消息工具编排平台
- [x] 关键决策：Chat runtime 继续读取全局工具配置真相，而不是靠单次请求透传 `enabledToolIds`
- [x] 编排层变化：ToolSettings / ToolSelector 的启停状态仍由治理命令持久化；发送链路已不再伪装支持单次请求工具字段
- [x] 挂载点反向核对：实际收口点集中在 `ChatView`、`ipc.ts`、`ToolSettings`、`ToolSelectorPopover` 与 roadmap/design 列出的范围内，无清单外扩散
- [x] 拔除沙盘推演：若恢复 `enabledToolIds` 透传，当前后端仍会把非空字段判 unsupported，说明这次删除透传是闭环所必需的真实修正

## 3. 验收场景核对

- [x] **A1**：打开 ToolSettings
  - 证据来源：`src/components/settings/ToolSettings.tsx` 只保留已接通内置工具开关，并显式说明未接通能力
- [x] **A2**：在 ToolSettings 切换内置工具
  - 证据来源：`src/__tests__/tool-settings.test.tsx`
- [x] **A3**：在 ToolSelector 切换工具
  - 证据来源：`src/components/chat/ToolSelectorPopover.tsx` 与 `ToolSettings.tsx` 继续通过 `updateChatToolState -> getChatTools` 刷新同一套 atom 真相
- [x] **A4**：发送 Chat 消息时带工具选择
  - 证据来源：`src/__tests__/ipc.test.ts` 新增 `sendMessage no longer forwards enabledToolIds...`
- [x] **A5**：触发 unsupported surface
  - 证据来源：`ToolSettingsSupportNotice` 与 `unsupportedCommand()` 保持未接通入口显式隐藏/报错

前端验证说明：

- 本次没有新增视觉结构，只是收口请求口径并保留既有工具 UI；行为证据以 Vitest 回归测试与挂载点核对为主，未单独补浏览器截图。

## 4. 术语一致性

- 当前活动文档里把 ToolSettings 真相统一为“全局内置工具启停”，不再把 `enabledToolIds` 描述成现行 runtime 能力
- `chat-tools-ui` 与 `toolsettings-runtime-closure` 的边界已重新对齐：前者是 UI 基线，后者是 runtime 真闭环

## 5. 架构归并

- [x] `frontend-chat-ui.md` 已改成当前真相：`ChatSendInput` 不再把 `enabledToolIds` 当作实际发送参数，工具开关改为全局配置读取
- [x] `frontend-settings-ui.md` / `ToolSettings.tsx` 的当前支持面与 roadmap 叙述已一致，不再把隐藏能力写成现行能力

## 6. requirement 回写

- [x] `j-gui-ai-interaction` 已补当前真相：Chat 使用全局内置工具开关，不支持逐条消息单独编排工具
- [x] requirement 保持 `current`，`last_reviewed` 已更新为 `2026-05-12`

## 7. roadmap 回写

- [x] `toolsettings-runtime-closure` 已从 `planned` 翻为 `done`
- [x] `chat-tools-ui` 已随 runtime closure 收口从 `in-progress` 翻为 `done`
- [x] `j-gui-v1-roadmap.md` 的阶段数字、Checklist 和下一步顺序已同步
- [x] roadmap YAML 将与本次 feature 文档一起通过校验

## 8. attention.md 候选盘点

- 本 feature 未暴露需要补入 `attention.md` 的新环境/命令陷阱

## 9. 遗留

- 仍未接通的工具能力只有自定义工具、凭据编辑、连通性测试，这些继续保留在后续治理/功能项里，不再混入当前闭环
- `src-tauri/src/chat_engine.rs` 与 `src-tauri/src/tests/chat_engine.rs` 的体量 WARN 仍是存量问题，本次未做结构重组
