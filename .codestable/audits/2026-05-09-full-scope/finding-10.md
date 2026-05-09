---
doc_type: audit-finding
audit: 2026-05-09-full-scope
finding_id: "performance-10"
nature: performance
severity: P2
confidence: medium
suggested_action: cs-refactor
status: open
---

# Finding 10：get_messages 全量读取 transcript，无分页

## 速答

Chat 和 Agent 的会话加载都是全量读取 transcript 文件，没有分页/懒加载机制。对于长会话（数千条消息），切换会话时的加载时间和内存占用线性增长。

## 关键证据

- `src-tauri/src/chat_engine.rs:149-163` — `get_messages` 调用 `load_session(session_id)` 加载全部消息，全部映射为 `MessageInfo` 数组返回
- `src-tauri/src/agent_session.rs:225-231` — `get_agent_session` 调用 `read_timeline(session_id)` 返回全部 `AgentTimelineItem`
- `src-tauri/src/agent_session.rs:118-128` — `read_timeline` 读取整个文件内容到 String

前端 `AppShell.tsx` 在切换到会话时调用这些函数，将全部消息加载到 Jotai atom 中。没有虚拟滚动或分页。

## 影响

对于 500+ 消息的会话，切换标签页时有可感知的加载延迟和内存峰值。当前用户量小、会话短，影响有限；随使用量增长会变明显。

## 修复方向

引入分页参数（offset/limit），前端先加载最近 N 条消息，滚动到顶部时加载更早的消息。

## 建议动作

`cs-refactor`，属于性能优化，不影响正确性。
