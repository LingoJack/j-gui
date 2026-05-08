---
doc_type: audit-finding
audit: business-logic-review
id: F-06
nature: security
severity: P2
confidence: medium
recommendation: cs-issue
---

# F-06: set_agent_config 缺失 activeIndex 越界校验

## 位置

`src-tauri/src/commands/config.rs:57-90` — `set_agent_config` 函数

## 证据

```rust
// config.rs:84
current.active_index = config.active_index;  // 无校验直接赋值
```

对比 `set_active_provider` 有校验：
```rust
// config.rs:95-101
if index >= config.providers.len() {
    return Err(format!("无效的 provider 索引: {}（共 {} 个提供方）", index, config.providers.len()));
}
config.active_index = index;
```

## 影响

- 前端 SettingsDialog 保存时若传了越界的 `activeIndex`，写入 config 文件成功
- 后续 `send_message` 中 `agent_config.providers.get(agent_config.active_index)` 返回 `None`，走 `ok_or("未配置模型提供方")` 错误路径——不会 panic，但错误提示不准确（实际"已配置但索引错误"）

## 修复建议

在 `set_agent_config` 中增加与 `set_active_provider` 一致的越界校验。

## 修复记录 (2026-05-08)

**已实施**：在 `config.rs:90-96` 的 `current.active_index = config.active_index` 前增加：
```rust
if config.active_index >= current.providers.len() && !current.providers.is_empty() {
    return Err(format!("无效的 provider 索引: {}（共 {} 个提供方）", ...));
}
```
允许 index 0 且 providers 为空的情况（默认状态）。

**验证**：cargo clippy -D warnings 0 error ✅
