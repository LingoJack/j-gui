---
doc_type: audit-finding
audit: 2026-05-12-closure-roadmap-audit
finding_id: "bug-01"
nature: bug
severity: P0
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 01：Agent 工作区关键操作调用了未注册 command

## 速答

Agent 工作区 / 文件上下文这条链路并未真正闭环：前端已经在会话和工作区层调用附加目录、打开目录、读取工作区能力等操作，但后端注册表里没有对应 command，运行时只能报错或走空 fallback。

## 关键证据

- `src/components/agent/SidePanel.tsx:106` — 会话级目录附加直接调用 `ipc.attachDirectory(...)`。
- `src/components/agent/SidePanel.tsx:116` — “附加文件夹”依赖 `ipc.openFolderDialog()`。
- `src/components/agent/SidePanel.tsx:137` — 移除目录依赖 `ipc.detachDirectory(...)`。
- `src/lib/ipc.ts:885` — `getWorkspaceCapabilities` 通过 `tryInvoke('get_workspace_capabilities', ...)` 读取工作区能力。
- `src/lib/ipc.ts:1065` — `attachDirectory` 调用 `attach_directory`。
- `src/lib/ipc.ts:1066` — `attachWorkspaceDirectory` 调用 `attach_workspace_directory`。
- `src/lib/ipc.ts:1067` — `detachDirectory` 调用 `detach_directory`。
- `src.lib/ipc.ts:1092` — `openFolderDialog` 调用 `open_folder_dialog`。
- `src-tauri/src/lib.rs:17-114` — 实际注册列表里没有 `get_workspace_capabilities`、`attach_directory`、`attach_workspace_directory`、`detach_directory`、`open_folder_dialog`。

## 影响

这会直接破坏 Agent 单工作区文件上下文、目录添加、工作区能力感知等核心体验。UI 可以展示入口，但真实操作无法由后端承接，用户会得到错误、空数据或静默退化。

## 修复方向

把这条链路收敛成一个真实后端契约：要么补齐 command 注册与实现，要么从 UI 移除仍未承接的入口，避免继续把半成品暴露成可用能力。

## 建议动作

`cs-issue`，因为这是明确的运行时断点，不是代码风格或结构优化问题。
