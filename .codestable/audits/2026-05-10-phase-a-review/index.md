---
doc_type: audit-index
audit_date: 2026-05-10
scope: "Phase A 新增 Rust 命令 + IPC 桥接 — bug 隐患 & arch-drift"
status: active
---

# Audit: Phase A 新代码 Review

## Scope

`src-tauri/src/commands/channels.rs`, `files.rs`, `agent.rs`(title/permissions), `chat.rs`(stop_generation), `src/lib/ipc.ts`(agent channel), `src-tauri/src/lib.rs`(registration). 6 文件，约 500 行新增代码。

维度: bug / arch-drift.

## Summary

4 个 bug (1 P0, 3 P1), 2 个 arch-drift (1 P1, 1 P2). 最严重: channels.rs 误将 `mask_api_key` 作用于 `api_base` 导致前端渠道列表显示被遮蔽的 URL; files.rs 存在路径穿越风险.

## Findings Matrix

| # | 标题 | 性质 | 严重度 | 置信度 | 动作 |
|---|---|---|---|---|---|
| 01 | channels.rs: api_base 被错误遮蔽 | bug | P0 | high | cs-issue |
| 02 | files.rs: save_attachment 路径穿越 | security | P1 | high | cs-issue |
| 03 | files.rs: read_attachment 任意文件读取 | security | P1 | high | cs-issue |
| 04 | channels.rs: provider 字段语义错误 | bug | P1 | high | cs-issue |
| 05 | API Key 明文存储 | arch-drift | P1 | high | cs-refactor |
| 06 | files.rs 同步 I/O | arch-drift | P2 | medium | cs-refactor |

## Priority

1. **P0-01** 立即修复: `api_base` 遮蔽导致渠道 UI 完全不可用
2. **P1-02/03** 尽快修复: 路径穿越安全风险
3. **P1-04** 下个迭代: provider 字段影响渠道类型判断
4. **P2-05/06** 技术债: 加密存储 + 异步 I/O
