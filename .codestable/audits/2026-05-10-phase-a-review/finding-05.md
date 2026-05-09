---
doc_type: audit-finding
finding_id: 05
title: "API Key 明文存储，未对齐 Proma 加密方案"
severity: P1
nature: arch-drift
confidence: high
suggested_action: cs-refactor
---

## Evidence

`src-tauri/src/commands/channels.rs:120-136` + `config.rs` 使用 j-cli 的 `ModelProvider.api_key` 直接读写明文 API key。

决策文档 `.codestable/compound/2026-05-08-decision-agent-sdk-strategy.md` 记录 Proma 使用 `safeStorage` AES-256-GCM 加密。当前 j-cli YAML config 以明文存储 key，不符合桌面应用安全实践。

## Impact

桌面端单用户场景下风险可控（~/.jdata/ 权限 700），但不符合行业最佳实践。后续如需多用户或跨平台同步，需先补齐加密层。
