---
doc_type: audit-finding
audit: 2026-05-11-frontend-backend-closure
finding_id: "arch-drift-04"
nature: arch-drift
severity: P1
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 04：ToolSettings 的凭据、测试和自定义工具链路大面积依赖未注册命令

## 速答

当前真正闭环的只有“内置工具启停”这条窄链路；ToolSettings 里其余大量操作，例如读取工具元数据、读写凭据、测试连接、自定义工具状态更新/删除，都依赖没有在后端注册的命令，并通过 `tryInvoke(..., fallback)` 静默退化。

## 关键证据

- `src/components/settings/ToolSettings.tsx:29-61` — `BuiltinToolsSection` 只使用 `list_chat_tools / set_tool_enabled`，这是当前唯一看起来真实对齐后端的部分。
- `src/components/settings/ToolSettings.tsx:125-177` — `WebSearchSettings` 依赖 `getChatTools`、`getChatToolCredentials`、`updateChatToolCredentials`、`testChatTool`。
- `src/components/settings/use-tool-credentials.ts:23-49` — 通用 hook 依赖 `getChatTools`、`updateChatToolState`、`testChatTool`。
- `src/lib/ipc.ts:668-700` — 上述入口对应的 IPC 命令分别是 `get_chat_tools`、`update_chat_tool_state`、`get_chat_tool_credentials`、`update_chat_tool_credentials`、`test_chat_tool`、`delete_custom_chat_tool`；其中不少还带 fallback，错误会被吞成默认值。
- `src-tauri/src/commands/governance.rs:141-167` — 当前后端只实现了 `list_chat_tools` 和 `set_tool_enabled`。
- `src-tauri/src/lib.rs:88-108` — 注册表里也只注册了 `list_chat_tools` / `set_tool_enabled`，没有注册 `get_chat_tools`、`update_chat_tool_state`、`get_chat_tool_credentials`、`update_chat_tool_credentials`、`test_chat_tool`、`delete_custom_chat_tool`。

## 影响

这会让 ToolSettings 出现典型伪闭环：页面能打开，输入框能编辑，按钮能点，但读取到的可能只是 fallback 空对象，测试结果可能永远是本地默认值，保存失败也未必会变成显式错误。用户很难判断“这个工具真的配置成功了吗”。

## 修复方向

先把 ToolSettings 缩回到真实后端能力，或者把元数据/凭据/测试命令完整补齐；不要继续让 fallback 默认值承担“配置成功”的角色。

## 建议动作

`cs-issue`，因为这是设置页和运行时真相不一致的闭环问题，不是单纯重构。
