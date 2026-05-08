---
doc_type: decision
category: architecture
status: active
created: 2026-05-08
slug: agent-sdk-strategy
title: Agent 模式实现策略——Claude Agent SDK 优先，j-cli Agent 留口后补
---

# Agent 模式实现策略

## 背景

j-gui 需要 Agent 模式（工具调用、权限审批、任务管理），但面临两个选项：

1. **j-cli Agent Loop**：`MainAgentHandle::spawn()` + `ToolRegistry` — 与 j-cli TUI 深度耦合（`ChatApp` 53 字段、`StreamMsg` 含 UI 状态）
2. **Claude Agent SDK**：`@anthropic-ai/claude-agent-sdk` 的 CLI 模式 — Proma 已验证，成熟稳定

j-cli 侧解耦需要抽取 `j-agent` crate，工作量大且需改 j-cli 代码。

## 决定

**首版 Agent 模式使用 Claude Agent SDK（CLI 子进程方式），j-cli Agent Loop 预留接口后补。**

架构：

```
j-gui (Tauri)
├── ChatEngine（当前：纯 LLM 直调）
├── AgentEngine（新增：Claude Agent SDK CLI 子进程）
│   ├── 启动 claude CLI → 子进程
│   ├── streamInput() → 注入用户消息
│   ├── SDKMessage 流 → Channel<AgentEvent> → 前端
│   └── 权限回调 → 前端 PermissionBanner 响应
│
└── 预留 trait AgentBackend {
        fn query(input) → Stream<AgentEvent>
    }
    ├── ClaudeAgentBackend（本期实现）
    └── JcliAgentBackend（后期补，等 j-agent crate 就绪）
```

## 理由

- **Proma 验证**：`apps/electron/src/main/lib/adapters/claude-agent-adapter.ts` 展示了完整的 CLI 子进程 + streamInput + SDKMessage 流模式，生产环境已验证
- **零耦合**：SDK 以独立进程运行，不侵入 j-gui 的 Rust 编译链路
- **完整能力**：工具调用、权限审批、Plan Mode、后台任务、AskUserQuestion 全部内置
- **Provider 复用**：Claude Agent SDK 支持多种 provider（Anthropic/DeepSeek/Kimi），与当前 Provider 配置模型一致
- **j-cli 口子**：定义 `AgentBackend` trait，后续只需实现 `JcliAgentBackend` 即可切换

## 影响

- `ChatEngine` 保持不变（无工具 Chat 继续走 `call_llm_stream_async`）
- 新增 `AgentEngine` 模块管理 CLI 子进程生命周期
- Agent 模式下前端新增 `AgentView`——StreamEvent 替换 ChatEvent
- 权限交互：前端 `PermissionBanner` 接受 SDK 权限请求，用户确认/拒绝后回传给 CLI 进程
- 首版仅支持本地已安装 `claude` CLI 的环境

## 相关文档

- `2026-05-08-explore-j-cli-agent-coupling.md` — 为什么不用 j-cli Agent Loop
- `2026-05-08-decision-j-gui-chat-engine.md` — ChatEngine 设计
- `2026-05-08-decision-j-gui-ipc-dataflow.md` — Channel 流式协议（Agent 模式复用 Channel<AgentEvent>）
- Proma 参考：`apps/electron/src/main/lib/adapters/claude-agent-adapter.ts`
