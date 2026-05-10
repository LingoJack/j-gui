---
doc_type: decision
slug: jgui-jcli-decouple
category: architecture
status: active
created: 2026-05-10
tags: [j-gui, jcli, decouple, channel, data-model, storage]
---

# j-gui 不修改 jcli，通过自有存储 + API 边界映射解耦

## 背景

j-gui 当前通过 path dependency 直接依赖 jcli crate，Channel 管理直接操作 jcli 的 `AgentConfig.providers`。这导致：

1. j-gui 的前端 `Channel` 类型必须适配 jcli 的 `ModelProvider` 结构，前端/后端数据模型不兼容
2. j-gui 的开发周期受 jcli 数据结构变更影响
3. jcli 由另一个仓库/团队维护，j-gui 不应在其代码中做改动

## 决定

**j-gui 拥有独立的 Channel 数据模型和存储，仅在调用 jcli API 时做单向映射。**

具体约束：

1. **j-gui 维护自有 `channels.json`**，存储在 `~/.jgui/`（Windows `%APPDATA%/j-gui/`），不复用 jcli 的 `agent_config.json`
2. **j-gui 不修改 jcli 代码**——不扩展 `ModelProvider`、不添加字段、不改 `load_agent_config`
3. **首次启动迁移**：从 jcli `agent_config.json` 单向读取已有 provider → 导入 j-gui 的 `channels.json`（一次性，jcli 源数据不删除）
4. **调用时映射**：Chat/Agent 需要 provider 时，j-gui 从 `Channel` 构造临时的 `ModelProvider` 传给 jcli
5. **Skills/MCP/Hooks 同理**：j-gui 读取 jcli 的现有数据作为"源 A"，j-gui 自有存储作为"源 B"，UI 展示时区分来源，写操作只写 j-gui 自有存储

## 为什么选这个方案

- **解耦**：j-gui 前端 Channel 模型不再受 jcli 结构约束，可自由演进
- **互不干扰**：jcli 升级不影响 j-gui 的 Channel 数据，j-gui 的修改不影响 jcli 用户
- **单向依赖**：j-gui 依赖 jcli API，但 jcli 不感知 j-gui 的存在

## 考虑过的替代方案

1. **扩展 jcli ModelProvider**（原 #27 design 方案）→ 否决：修改 jcli 代码、双向耦合、跨仓库协调成本高
2. **j-gui 完全独立于 jcli**（通过 WS/HTTP 远程协议）→ 否决：当前阶段过度设计，首版用 crate 直接调用已足够

## 影响

- `#27 channel-model-unify` design 需重写：从"改 jcli"变为"j-gui 自建 Channel 存储 + 单向迁移 + 调用时映射"
- `#28 governance-bidirectional-sync` 需调整：从"双向同步"变为"j-gui 单向导入 jcli 源 + j-gui 自有存储写操作"
- j-gui `Channels` 模块不再调用 `j_cli::command::chat::storage::load_agent_config/save_agent_config`
- 新增文件：`~/.jgui/channels.json`（j-gui 的 Channel 数据存储）
- Chat/Agent Engine 需新增 `Channel → ModelProvider` 映射函数
