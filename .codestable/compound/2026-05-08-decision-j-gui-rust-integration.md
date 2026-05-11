---
doc_type: decision
category: architecture
status: active
created: 2026-05-08
slug: j-gui-rust-integration
title: j-gui 后端集成方案——Rust 库依赖而非 WS remote 协议
---

# j-gui 后端集成方案

## 背景

j-gui 需要调用 j-cli 的 AI Chat/Agent 能力（配置、Agent 循环、15+ 内置工具、会话存储等）。j-cli 提供了两种集成方式：

1. **WS remote 协议**：`j ai --remote` 启动 WebSocket 服务，外部进程通过 WS 调用
2. **Rust 库依赖**：`src/lib.rs` 已导出公共模块，可直接作为 crate 依赖

## 决定

Tauri 后端以 **Rust crate 依赖** 方式集成 j-cli，当前以 crates.io 版本依赖为准，**不复用** WS remote 协议。

## 理由

- Tauri 后端是 Rust，天然支持 crate 依赖，无需序列化开销
- 无需进程管理、网络 IPC、连接生命周期处理
- 可访问 j-cli 全部能力而无 WS 协议的间接层
- 流式响应可直接走 Tauri EventEmitter，无需 WS → Tauri 二次转发

## 考虑过的替代方案

- **WS remote 协议**：被拒绝。引入额外进程管理复杂度、连接生命周期问题、双重序列化开销。WS remote 协议适合非 Rust 客户端或远程场景，本场景两者皆不成立。

## 影响

- `src-tauri/Cargo.toml` 需添加 `j-cli` crate 依赖
- 后端代码可直接 `use j_cli::...` 访问所有公共模块
- j-cli 的编译时间进入 j-gui 构建链路
- j-cli 的 API 变更直接影响 j-gui 编译

## 相关文档

- 上游项目：`j-cli` crate / 独立 j-cli 仓库
- `2026-05-08-decision-j-gui-ipc-dataflow.md` — 集成方式决定了 IPC 协议选型
- `2026-05-08-decision-j-gui-chat-engine.md` — ChatEngine 直接依赖 j_cli crate
