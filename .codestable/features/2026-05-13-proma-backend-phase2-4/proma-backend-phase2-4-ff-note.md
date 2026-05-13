---
doc_type: feature-ff-note
feature: proma-backend-phase2-4
date: 2026-05-13
requirement:
tags: [agent, runtime, retry, storage, environment]
---

## 做了什么
把 `Proma backend refactor candidates` explore 里剩余的 Phase 2-4 落成了最小可用实现：CLI 首轮启动现在支持启动期自动恢复，Agent transcript 增加了落盘防膨胀防线，设置页后端补上了运行时环境探测和只读存储统计。

## 改了哪些
- `src-tauri/src/agent_engine.rs` / `src-tauri/src/commands/agent.rs` / `src/lib/ipc.ts` — 把首条 Agent 用户消息收口到 `start_agent`，补了 CLI 启动期 retry/recovery 监督器，并保持前后端事件语义一致。
- `src-tauri/src/agent_retry.rs` / `src-tauri/src/agent_runtime_recovery.rs` / `src-tauri/src/tests/agent_engine.rs` — 新增可重试错误分类、resume 降级判定和对应 Rust 回归测试。
- `src-tauri/src/agent_session.rs` / `src-tauri/src/commands/settings_environment.rs` / `src-tauri/src/commands/settings_storage.rs` / `src-tauri/src/tests/commands_agent.rs` / `src/__tests__/ipc.test.ts` — 补 transcript 目录防线、Windows Git Bash/WSL 探测、只读存储统计，以及相关前后端测试。

## 怎么验证的
跑过 `cargo test --manifest-path "src-tauri/Cargo.toml"`、`bun run test src/__tests__/ipc.test.ts`，以及全量门禁 `bash scripts/check_lint.sh`。最终 gate 结果为 `FAIL=0`，仅保留仓库现有的 ESLint 存量 `WARN`。

## 顺手发现
- `src/main.tsx` 与若干 logo 组件文件存在大量存量 ESLint 问题；本次未触碰，`check_lint.sh` 目前仍会把它们汇总为 `WARN`。
