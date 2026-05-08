---
doc_type: decision
category: architecture
status: active
created: 2026-05-08
slug: j-gui-ipc-dataflow
title: j-gui 前后端数据流——Tauri Commands + Channels（流式）+ Events（全局通知）
---

# j-gui 前后端数据流

## 背景

Tauri v2 提供三种前后端通信机制：
- **Commands**（`invoke()`）：前端请求 → 后端响应，RPC 风格
- **Channels**（`Channel<T>`）：后端流式推送 → 前端，类型安全、有序、低延迟。官方推荐用于流式数据
- **Events**（`emit()` / `listen()`）：后端推送 → 前端全局订阅，JSON only，不保证顺序，不适合低延迟/高吞吐场景

j-gui 的 Chat/Agent 流式响应需要低延迟、有序、类型安全的推送——官方文档明确推荐 Channel 而非 Events。

> 依据：Context7 `/websites/v2_tauri_app` — "The event system is not suitable for low-latency or high-throughput scenarios; for streaming data, the channels section offers an optimized implementation."

## 决定

- **RPC 请求**：前端通过 `invoke()` 调用 Rust 命令（配置读写、别名管理、会话 CRUD）
- **流式推送**：使用 `Channel<T>` 作为 `send_message` 命令参数，Rust 端 `channel.send()` 推送，前端 `channel.onmessage` 接收（Chat 流式、Agent 工具调用结果）
- **全局通知**：仅非流式场景使用 Events（如 `theme-changed`），payload 保持简单

```
Frontend (React)             Tauri Backend (Rust)          j_cli 库
   │                              │                         │
   │── invoke('send_message',     │                         │
   │       {content, onEvent})───►│                         │
   │                              │── ChatEngine::send() ──►│
   │                              │    │                    │ agent_loop
   │◄── channel.onmessage ────────┤◄───┤                    │ streaming
   │    (ChatEvent::Chunk)        │    │                    │
   │◄── channel.onmessage ────────┤◄───┤                    │
   │    (ChatEvent::Done)         │    │                    │
```

## 理由

- **Tauri v2 官方推荐**：Channel 是流式数据的第一选择，Events 文档明确自陈不适合
- **类型安全**：`Channel<ChatEvent>` 在 Rust 和 TypeScript 两侧都是类型化的，Events 的 payload 始终是 JSON string
- **顺序保证**：Channel 保证有序送达，Events 不保证——流式文本块乱序会破坏 UI
- **生命周期匹配**：一个 `send_message` 调用对应一个 Channel，command 返回时自动关闭——天然防止事件泄漏
- Events 仍用于全局通知（主题切换等非流式场景），发挥其跨窗口广播优势

## 影响

- `send_message` 命令签名增加 `on_event: Channel<ChatEvent>` 参数
- 前端每次 `invoke('send_message')` 新建 `Channel` 实例，在 `onmessage` 中更新 Jotai atoms
- 不再需要 `cancel_stream` 命令——drop Channel 即可中断（或 command 内检查取消 token）
- 不再需要按 `session_id` 手动路由事件——每个 Channel 绑定到一次调用的闭包
- Events 仅用于 `theme-changed` 等全局通知

## 对比：旧方案（Events）vs 新方案（Channels）

| | Events（旧） | Channels（新） |
|---|---|---|
| 类型安全 | ❌ 始终 JSON string | ✅ 泛型 `<ChatEvent>` |
| 顺序保证 | ❌ 不保证 | ✅ 严格有序 |
| 低延迟 | ❌ 官方不推荐 | ✅ 官方优化 |
| 生命周期 | 全局，需手动 unlisten | 绑定到 command，自动回收 |
| 事件路由 | 需按 session_id 过滤 | 闭包天然绑定 |

## 相关文档

- `2026-05-08-decision-j-gui-rust-integration.md` — 后端集成方案
- `2026-05-08-decision-j-gui-chat-engine.md` — Chat Engine 封装（**待更新**：send_message 签名增加 Channel 参数）
- `2026-05-08-trick-tauri-v2-core-api.md` — Tauri v2 核心 API（Channel 详细用法）
- `2026-05-08-trick-jotai-event-integration.md` — Jotai + Tauri Channel 集成模式
