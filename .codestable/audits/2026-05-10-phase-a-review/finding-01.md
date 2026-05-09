---
doc_type: audit-finding
finding_id: 01
title: "channels.rs: api_base 被错误遮蔽，渠道 URL 不可用"
severity: P0
nature: bug
confidence: high
suggested_action: cs-issue
---

## Evidence

`src-tauri/src/commands/channels.rs:95-103`
```rust
fn provider_to_channel_info(idx: usize, p: &ModelProvider) -> ChannelInfo {
    ChannelInfo {
        id: idx,
        name: p.name.clone(),
        provider: p.name.clone(),
        api_base: mask_api_key(&p.api_base),  // BUG: 遮蔽了 URL 而非 key
        models: vec![p.model.clone()],
    }
}
```

`mask_api_key` 将字符串遮蔽为 `前4...后4` 格式。对 API Base URL（如 `https://api.deepseek.com/v1`）执行遮蔽后得到 `http.../v1`，前端无法使用该 URL 发起请求。应遮蔽的是 `api_key` 字段，`api_base` 应明文传递。

同一函数中也存在字段语义问题：`api_base: mask_api_key(&p.api_base)` 应该是 `api_base: p.api_base.clone()` (明文)，需要新增 `api_key_masked` 字段返回遮蔽后的 key。

## Impact

渠道列表 UI 显示的 API 地址无法使用，DeepSeek 等渠道的连接测试/模型获取虽然底层调用正确，但前端展示的 URL 已损坏。用户无法确认当前配置的渠道地址。
