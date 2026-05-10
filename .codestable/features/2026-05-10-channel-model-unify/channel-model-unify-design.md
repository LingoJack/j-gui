---
doc_type: feature-design
feature: 2026-05-10-channel-model-unify
status: approved
summary: 基于 #30 ConfigKernel trait 扩展 Channel 数据模型——agent_config.json 中 providers 升级为完整 Channel 结构（UUID/provider/models数组/enabled/时间戳），前端 IPC 对齐。j-gui 写入 jcli 数据目录，CLI/GUI 数据同步。
tags: [channel, data-model, kernel, backend, frontend]
roadmap: j-gui-v1
roadmap_item: channel-model-unify
requirement: null
depends_on: [kernel-trait-abstraction]
---

> **前置依赖**：`2026-05-10-kernel-trait-abstraction` (#30，已完成)。基于 `ConfigKernel` trait 实现。

# channel-model-unify — Channel 数据模型统一

## 0. 术语

| 术语 | 含义 |
|------|------|
| Channel | j-gui 完整渠道配置，存储在 jcli `agent_config.json` 的 `providers` 数组中 |
| ModelProvider | jcli 原有简单结构 `{name, api_base, api_key, model, supports_vision}` |
| KernelProvider | #30 定义的 DTO，adapter 内 KernelProvider ↔ ModelProvider 互转 |
| 格式升级 | `agent_config.json` 旧 providers → 新 Channel 格式，UUID + models 数组 + 时间戳 |

## 1. 决策与约束

### 1.1 核心约束

- **j-gui 不修改 jcli 代码**——扩展在 j-gui adapter 层完成
- **写入 jcli 数据目录**——`agent_config.json` 是 Channel 数据的唯一真实来源，CLI/GUI 共享
- **基于 ConfigKernel**——所有 Channel 操作通过 `ConfigKernel` trait，不直接调 jcli

### 1.2 明确不做

- 不修改 jcli `ModelProvider` 结构（jcli 继续用简化版读取）
- 不另建 channels.json（复用 agent_config.json，CLI 可见）
- 不改变前端 ChannelSettings/ChannelForm UI 组件逻辑
- API Key 加密仅 base64 混淆（jcli 调用需要明文）

## 2. 方案

### 2.1 名词层

**现状**（agent_config.json 中 providers 是简单数组）：

```json
{
  "providers": [
    { "name": "DeepSeek", "api_base": "https://...", "api_key": "sk-...", "model": "deepseek-v4-pro", "supports_vision": false }
  ],
  "active_index": 0
}
```

**现状**（前端 Channel 类型）：

```typescript
interface Channel {
  id: string; name: string; provider: ProviderType;
  baseUrl: string; apiKey: string; models: ChannelModel[];
  enabled: boolean; createdAt: number; updatedAt: number;
}
```

---

**变化**（agent_config.json 升级）：

```json
{
  "providers": [
    {
      "id": "uuid-v4",
      "name": "DeepSeek",
      "provider": "deepseek",
      "apiBase": "https://api.deepseek.com/anthropic",
      "apiKey": "c2st...base64...",
      "models": [{ "id": "deepseek-v4-pro", "name": "DeepSeek V4 Pro", "enabled": true }],
      "enabled": true,
      "supportsVision": false,
      "createdAt": 1715340000000,
      "updatedAt": 1715340000000
    }
  ],
  "active_index": 0,
  "version": 1
}
```

**KernelProvider 扩展**（#30 types.rs 已定义，需补字段）：

```rust
// kernel/types.rs — KernelProvider 扩展
pub struct KernelProvider {
    pub id: String,              // UUID v4 (NEW)
    pub name: String,
    pub provider: String,        // "anthropic"|"openai"|... (NEW，显式字段)
    pub api_base: String,
    pub api_key: String,
    pub models: Vec<KernelChannelModel>, // (NEW，替代单 model String)
    pub enabled: bool,           // (NEW)
    pub supports_vision: bool,
    pub created_at: u64,         // (NEW)
    pub updated_at: u64,         // (NEW)
}

pub struct KernelChannelModel {
    pub id: String,
    pub name: String,
    pub enabled: bool,
}
```

**ConfigKernel 新增方法**：

```rust
// kernel/config.rs — ConfigKernel trait 扩展
pub trait ConfigKernel: Send + Sync {
    // existing methods...
    fn create_channel(&self, input: KernelCreateChannelInput) -> Result<KernelProvider, KernelError>;
    fn update_channel(&self, id: &str, input: KernelUpdateChannelInput) -> Result<KernelProvider, KernelError>;
    fn delete_channel(&self, id: &str) -> Result<(), KernelError>;
}
```

### 2.2 编排层

```mermaid
flowchart TD
    A[前端 ChannelSettings] -->|invoke| B[commands/channels.rs]
    B -->|state.config()| C[ConfigKernel trait]
    C -->|delegate| D[JcliAdapter]
    D -->|load/save| E[agent_config.json]
    D -->|格式检测| F{旧格式?}
    F -->|是| G[迁移→新格式 UUID+models]
    F -->|否| H[直接读写]
```

**迁移逻辑**（adapter 内 `load_providers()` 升级）：

1. 读 `agent_config.json`
2. 检查首个 provider 是否有 `id` 字段（UUID 格式）
3. 无 → 生成 UUID、`model` 字符串转 `models[0]`、`provider` 从 `api_base` 推断、补时间戳 → 写回
4. 返回 `Vec<KernelProvider>`

### 2.3 挂载点

| # | 挂载点 | 说明 |
|---|--------|------|
| 1 | `kernel/types.rs` | KernelProvider 扩展 4 个字段 + KernelChannelModel 新增 |
| 2 | `kernel/config.rs` | ConfigKernel trait 新增 3 方法 |
| 3 | `kernel/adapter.rs` | JcliAdapter impl 新方法 + 迁移逻辑 + KernelProvider↔ModelProvider 映射升级 |
| 4 | `commands/channels.rs` | ChannelInfo 等类型对齐新结构（id: String, models: Vec） |
| 5 | 前端 `ipc.ts` + `ChannelSettings` | IPC 封装字段名对齐（baseUrl 问题已在之前修复） |

### 2.4 推进策略

| Step | 内容 | 退出信号 |
|------|------|---------|
| 1 | kernel/types.rs 扩展 KernelProvider + 新增 KernelChannelModel | cargo check 通过 |
| 2 | ConfigKernel trait 新增 create/update/delete_channel | cargo check 通过 |
| 3 | JcliAdapter 实现新方法 + 格式迁移 | cargo test 通过 |
| 4 | channels.rs 命令适配新 Channel 结构（id: String, models: Vec<ChannelModel>） | cargo test 通过 |
| 5 | 前端 IPC + ChannelSettings UI 对齐 | bun run test 通过 |
| 6 | 端到端验证 | 渠道创建→列表→选中→Chat 可用 |

### 2.5 结构健康度

- `kernel/types.rs` 扩展 4 字段 + 1 新 struct — 改动 ~20 行 ✅
- `kernel/config.rs` 新增 3 方法签名 — 改动 ~15 行 ✅
- `kernel/adapter.rs` 新增 impl + 迁移函数 — 改动 ~60 行 ✅
- 本次不做微重构

## 3. 验收契约

### 正常场景

| # | 触发 | 期望结果 |
|---|------|---------|
| A1 | 首次启动（旧格式 agent_config.json） | 自动迁移，生成 UUID + models 数组 + 时间戳 |
| A2 | 创建渠道（DeepSeek 预设） | 列表正确显示名称/URL/models，API Key base64 存储 |
| A3 | 编辑渠道 | 按 UUID 更新，apiKey 含 "..." 保留旧值 |
| A4 | 删除渠道 | 按 UUID 移除，active_index 自动调整 |
| A5 | 选中渠道 → Chat | ModelSelector 正确切换，消息发送成功 |

### 明确不做反向核对

- [ ] 不修改 jcli 代码
- [ ] 不另建 channels.json
- [ ] 不改变前端 UI 组件逻辑
- [ ] API Key 不引入密钥派生

## 4. 对其他模块的影响

| 模块 | 影响 | 动作 |
|------|------|------|
| `kernel/types.rs` | KernelProvider +4 字段，+KernelChannelModel | 扩展 |
| `kernel/config.rs` | ConfigKernel +3 方法 | 扩展 |
| `kernel/adapter.rs` | 迁移逻辑 + 新方法 impl | 扩展 |
| `commands/channels.rs` | id: usize→String, models 类型变化 | 适配 |
| `chat_engine.rs` | 从 KernelProvider.models[0].id 取 model | 适配 |
| 前端 `ipc.ts` | 字段名对齐 | 已修复（baseUrl→apiBase） |
