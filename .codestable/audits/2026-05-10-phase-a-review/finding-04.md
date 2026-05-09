---
doc_type: audit-finding
finding_id: 04
title: "channels.rs: provider 字段语义错误"
severity: P1
nature: bug
confidence: high
suggested_action: cs-issue
---

## Evidence

`src-tauri/src/commands/channels.rs:95-103`
```rust
fn provider_to_channel_info(idx: usize, p: &ModelProvider) -> ChannelInfo {
    ChannelInfo {
        provider: p.name.clone(),  // provider = name, 同义重复
```

`ChannelInfo.provider` 预期区分 AI 供应商类型 (openai/deepseek/anthropic/google)，但当前被设为 `name`（用户自定义名称如 "我的DeepSeek"）。前端依赖 `provider` 字段判断渠道兼容性（如 Agent 模式只允许 Anthropic 兼容渠道）、选择对应图标等。该字段应为从 `api_base` URL 推断或从 `CreateChannelInput` 传入的供应商标识。
