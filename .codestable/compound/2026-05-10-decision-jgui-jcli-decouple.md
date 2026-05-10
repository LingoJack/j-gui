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

**j-gui 不修改 jcli 源代码，但通过写入 jcli 数据目录（`~/.jdata/`）保持 CLI/GUI 数据同步。**

具体约束：

1. **j-gui 不修改 jcli 代码**——不扩展 `ModelProvider`、不添加字段、不改 jcli 源码文件
2. **j-gui 写入 jcli 数据目录**——Channel/Provider、Alias、Skills/Hooks/MCP 启停状态等通过 jcli 现有的存储 API 写入 `~/.jdata/`，保证 CLI 用户看到相同状态
3. **GUI 独有配置走自有存储**——窗口尺寸、主题偏好、UI 状态等纯 GUI 数据存 `~/.jgui/`
4. **数据同源**：jcli 数据目录是 Channel/Alias/Skills/Hooks/MCP 的唯一真实来源，j-gui 读写均通过此路径
5. **jcli crate 作为依赖方向不变**——j-gui 通过 path dependency 调用 jcli API，但仅调用公开接口

## 为什么选这个方案

- **解耦**：j-gui 前端 Channel 模型不再受 jcli 结构约束，可自由演进
- **互不干扰**：jcli 升级不影响 j-gui 的 Channel 数据，j-gui 的修改不影响 jcli 用户
- **单向依赖**：j-gui 依赖 jcli API，但 jcli 不感知 j-gui 的存在

## 耦合现状（2026-05-10 扫描）

- **22 个导入点**跨越 **10 个模块路径**，影响 **10/14 j-gui Rust 文件 (71%)**
- **无抽象层**：j-gui 直接导入 jcli 内部实现（`j_cli::command::chat::agent::api::call_llm_stream_async`、`j_cli::command::chat::infra::hook::types::HookEvent` 等）
- **最脆弱点**：`HookEvent` 13 变体全量枚举匹配 + `ModelProvider` 裸字段构造 × 2 处
- **path dependency 无 semver**：`j-cli = { path = "../../jcli" }`，jcli 任意改动立即触发 j-gui 编译错误
- **长期解决方案**：Phase E `kernel-trait-abstraction`（#30）——⭐ 提前到 #27 之前执行。先建 trait 抽象层，后续所有 feature 基于 trait 实现。每延迟一个 feature，解耦成本成倍增加。

### 实施路径（#30）

1. **定义 trait 族**（j-gui 侧）：`ChatKernel` / `ConfigKernel` / `GovernanceKernel` / `SessionKernel` / `SystemKernel`
2. **写适配器**：`JcliAdapter` 实现全部 trait，内部包装现有 jcli 调用（不改 jcli 代码）
3. **迁移调用点**：逐个替换 j-gui 模块中的直接 jcli 导入为 trait 方法调用
4. **退出标准**：`grep -r "j_cli::" src-tauri/src/` 仅剩 `adapters/` 目录下的适配器文件

## 考虑过的替代方案

1. **扩展 jcli ModelProvider**（原 #27 design 方案）→ 否决：修改 jcli 代码、双向耦合、跨仓库协调成本高
2. **j-gui 完全独立于 jcli**（通过 WS/HTTP 远程协议）→ 否决：当前阶段过度设计，首版用 crate 直接调用已足够

## 影响

- `#27 channel-model-unify` design 需重写：从"改 jcli"变为"j-gui 自建 Channel 存储 + 单向迁移 + 调用时映射"
- `#28 governance-bidirectional-sync` 需调整：从"双向同步"变为"j-gui 单向导入 jcli 源 + j-gui 自有存储写操作"
- j-gui `Channels` 模块不再调用 `j_cli::command::chat::storage::load_agent_config/save_agent_config`
- 新增文件：`~/.jgui/channels.json`（j-gui 的 Channel 数据存储）
- Chat/Agent Engine 需新增 `Channel → ModelProvider` 映射函数
