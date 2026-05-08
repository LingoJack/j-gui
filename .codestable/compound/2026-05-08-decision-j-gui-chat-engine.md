---
doc_type: decision
category: architecture
status: active
created: 2026-05-08
slug: j-gui-chat-engine
title: j-gui Chat Engine 封装层设计
---

# j-gui Chat Engine 封装层设计

## 背景

j-cli 的 `command::chat::app` 模块提供 Agent 循环、会话管理、工具执行等核心能力。Tauri 后端不能直接把这些内部模块暴露给前端——需要一层封装把 j-cli 领域概念映射为 Tauri 命令和事件。

## 决定

在 `src-tauri/src/chat_engine.rs` 中创建 `ChatEngine` 结构体，封装 j-cli 的 Chat/Agent 能力，作为 Tauri 命令和 j-cli 之间的唯一中介。

核心接口：

```rust
pub struct ChatEngine {
    agent_config: AgentConfig,
    session_manager: SessionManager,
}

impl ChatEngine {
    pub fn new(data_dir: &Path) -> Self;
    pub async fn send_message(&mut self, session_id: &str, content: &str, on_event: Channel<ChatEvent>) -> Result<()>;
    pub fn list_sessions(&self) -> Vec<SessionInfo>;
    pub fn create_session(&mut self) -> String;
    pub fn switch_session(&mut self, id: &str) -> Result<()>;
    pub fn delete_session(&mut self, id: &str) -> Result<()>;
}
```

Tauri 命令层（`commands/`）只做参数解析和权限检查，业务逻辑全部委托给 `ChatEngine`。

## 理由

- 单一中介点：所有 j-cli 调用经过一个入口，方便加日志、错误转换、状态追踪
- 命令层薄：Tauri `#[command]` 只处理 serde 和权限，业务逻辑不散落在命令函数里
- 可测试：`ChatEngine` 通过 `Channel<ChatEvent>` 参数解耦，不依赖 Tauri AppHandle/Window，可独立单测
- 流式推送通过 `Channel` 参数传递，生命周期绑定到单次 `send_message` 调用，不持有全局状态

## 影响

- `src-tauri/src/chat_engine.rs` 成为后端最核心模块
- `commands/chat.rs` 依赖 `ChatEngine`，通过 Tauri State 注入
- j-cli 的 Agent 循环需适配为 async（或 spawn_blocking）
- 取消通过 drop Channel 实现——`send_message` 中轮询 `channel.is_closed()` 或在 component unmount 时让 Channel 被 GC 回收
- 会话并发：每个 `send_message` 调用传入独立的 Channel，天然支持多会话并发（各开各的 Channel）

## 相关文档

- `2026-05-08-decision-j-gui-rust-integration.md` — j-cli 依赖方式
- `2026-05-08-decision-j-gui-ipc-dataflow.md` — 事件推送路径
- `2026-05-08-explore-j-cli-agent-coupling.md` — j-cli Agent 与 TUI 的耦合分析（Agent 模式阻塞原因）
