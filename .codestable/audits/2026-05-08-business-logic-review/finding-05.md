---
doc_type: audit-finding
audit: business-logic-review
id: F-05
nature: security
severity: P2
confidence: low
recommendation: cs-issue
---

# F-05: API key 掩码逻辑对短 key 错误覆盖

## 位置

`src-tauri/src/commands/config.rs:34-41` (掩码) + `config.rs:64-74` (反掩码)

## 证据

**掩码端** (`get_agent_config`):
```rust
// config.rs:34-41
let masked_key = if p.api_key.len() > 8 {
    format!("{}...{}", &p.api_key[..4], &p.api_key[p.api_key.len() - 4..])
} else {
    "****".to_string()  // ≤8 字符: 掩码为 "****"
};
```

**反掩码端** (`set_agent_config`):
```rust
// config.rs:64-74
let api_key = if p.api_key.contains("...") {
    old_providers.get(i).map(|old| old.api_key.clone()).unwrap_or(p.api_key.clone())
} else {
    p.api_key.clone()  // "****" 不包含 "..."，走这里 → 真实 key 被覆盖为 "****"
};
```

## 影响

- 若某提供方的 API key ≤8 字符（极少见但并非不可能——某些内部/测试 key），保存配置时真实 key 被替换为 "****"
- 掩码检测仅基于 `"..."` 字符串包含，对 `"****"` 无防护

## 修复建议

统一掩码方案：不通过内容模式判断，而是在 struct 中增加 `masked: bool` 字段，或始终对 <8 字符 key 也用 `...` 格式掩码。

## 修复记录 (2026-05-08)

**已实施**：所有长度段的 key 掩码均包含 `"..."`（`config.rs:34-48`）：
- `> 8 chars`: `{first4}...{last4}` (不变)
- `3-8 chars`: `{first2}...{last2}` (新)
- `≤2 chars`: `...{full}` (新)

反掩码端的 `p.api_key.contains("...")` 检测逻辑不变，现可正确覆盖所有长度。

**验证**：cargo clippy -D warnings 0 error ✅
