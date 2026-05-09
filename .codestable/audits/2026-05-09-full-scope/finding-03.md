---
doc_type: audit-finding
audit: 2026-05-09-full-scope
finding_id: "bug-03"
nature: bug
severity: P1
confidence: medium
suggested_action: cs-issue
status: open
---

# Finding 03：agent_engine stdout 线程静默吞没 transcript 写入错误

## 速答

`agent_engine.rs` stdout 读取线程中对 `update_tool_call_result` 和 `append_timeline_item` 的调用结果用 `let _ =` 丢弃。磁盘满、权限变更等场景下写入失败不会产生任何日志或通知。

## 关键证据

- `src-tauri/src/agent_engine.rs:176-178` — `let _ = agent_session::update_tool_call_result(&sid, &tool_id, &content);`
- `src-tauri/src/agent_engine.rs:179-181` — `let _ = agent_session::append_timeline_item(&sid, &item);`

两处都是 `Result<(), String>` 返回，失败时错误被完全吞没。对比同文件中 channel send 失败有明确的 return 处理（line 173-174），而 transcript 写入失败无任何处理。

## 影响

磁盘满、权限变更、文件被外部删除等场景下，Agent 对话的 transcript 静默丢失，用户察觉不到——前端通过 Channel 事件正常显示，但刷新后历史消息不完整。触发概率低但影响大（数据丢失不可恢复）。

## 修复方向

至少 stderr 打印错误（`eprintln!`），或通过 Channel 发送 Error 事件通知前端。

## 建议动作

`cs-issue`，涉及静默数据丢失。
