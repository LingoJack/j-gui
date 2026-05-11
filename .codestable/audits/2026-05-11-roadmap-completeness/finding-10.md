---
doc_type: audit-finding
audit: 2026-05-11-roadmap-completeness
finding_id: "10"
severity: P2
category: maintainability
confidence: high
suggested_action: cs-refactor
files: [src-tauri/src/agent_engine.rs, src-tauri/src/kernel/adapter.rs]
---

# Finding 10: 长函数 — 2 处超过 100 行

## 1. AgentEngine::start() — ~170 行

`src-tauri/src/agent_engine.rs:67-236`

函数包含两组在逻辑上不同的操作：
- 子进程设置（环境变量、参数构建、spawn）— 第 67-106 行
- 一个内联的 104 行闭包（第 107-211 行），处理完整 stdout 解析循环

stdout 解析闭包不应内联——它包含事件解析、工具调用路由、timeline 写入和 channel 发送。

**建议**：提取 stdout 线程闭包为私有方法 `fn spawn_stdout_reader(...)`。

## 2. JcliAdapter::run_agent_loop() — ~141 行

`src-tauri/src/kernel/adapter.rs:432-572`

单函数中执行 9 个逻辑步骤：基础设施设置 → 工具注册表构建 → 共享状态构建 → agent loop 启动 → bridge 线程 spawn。

**建议**：拆分为私有辅助方法 `build_agent_shared_state()`、`build_tool_registry()`、`spawn_bridge_thread()`。

## 建议

开 `cs-refactor`：拆分这两处长函数，不改变行为，仅做结构提取。
