---
doc_type: feature-design
feature: 2026-05-10-agent-engine-jagent
status: approved
summary: AgentEngine 从 CLI 子进程升级为直接调用 jcli agent_loop——通过 ChatKernel trait 集成 run_main_agent_loop，去掉子进程开销，原生 Rust 控制流。
tags: [agent, jcli, kernel, engine]
roadmap: j-gui-v1
roadmap_item: agent-engine-jagent
---

# agent-engine-jagent — jcli agent_loop 直连

## 1. 决策

- **不创建新 crate**——jcli 的 agent 能力在 `agent_loop.rs` 模块中
- **通过 ChatKernel 扩展**——新增 `run_agent_loop` 方法
- **保留 CLI 路径**——新旧切换通过 `AgentBackend` trait（已预留）

## 2. 改动

### ChatKernel 新增方法
```rust
async fn run_agent_loop(&self, params: KernelAgentParams) -> Result<(), KernelError>;
```

### JcliAdapter 实现
调用 `j_cli::command::chat::agent::agent_loop::run_main_agent_loop(params)`

### AgentEngine 改造
- 移除 `std::process::Child` 管理
- 新 `JAgentBackend` 实现 `AgentBackend` trait
- Channel 桥接：mpsc ↔ Tauri Channel

## 3. 步骤

| Step | 内容 | 退出 |
|------|------|------|
| 1 | ChatKernel + KernelAgentParams | cargo check |
| 2 | JcliAdapter::run_agent_loop | cargo test |
| 3 | JAgentBackend + AgentEngine 改造 | cargo test |
| 4 | 端到端 Agent 流式对话 | 手动验收 |

## 4. 不扩散
- 不修改 jcli 代码
- ChatKernel 保持 ?Send
