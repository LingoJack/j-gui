---
doc_type: refactor-apply-notes
refactor: 2026-05-11-audit-fix
---

# audit-fix apply notes

## 步骤 1: 提取魔法值常量

- 完成时间: 2026-05-11
- 改动文件:
  - `src-tauri/src/agent_engine.rs` — +3 const (CLAUDE_GRACE_PERIOD_MS, LOG_LINE_TRUNCATE_SDK, LOG_LINE_TRUNCATE_UNKNOWN)
  - `src-tauri/src/commands/agent.rs` — +2 const (FALLBACK_TITLE_MAX_CHARS, GENERATED_TITLE_MAX_TOKENS)
  - `src-tauri/src/commands/channels.rs` — +2 const (FALLBACK_MODEL_ANTHROPIC, FALLBACK_MODEL_OPENAI)
  - `src-tauri/src/chat_engine.rs` — +1 const (TOKEN_COUNT_UNSUPPORTED)
- 验证结果: cargo test 151 passed, cargo clippy 0 new warnings
- 偏离: 无

## 步骤 2: 提取 stdout 解析闭包

- 完成时间: 2026-05-11
- 改动文件: `src-tauri/src/agent_engine.rs` — 闭包体 → `spawn_stdout_reader()` 方法
- 验证结果: cargo test agent_engine 19 passed, cargo clippy 0 new warnings
- 偏离: 无。闭包原 `move ||` 捕获的变量 (stdout, event_channel, mode, sid) 全部通过参数传入，签名清晰

## 步骤 3: 提取 bridge 线程

- 完成时间: 2026-05-11
- 改动文件: `src-tauri/src/kernel/adapter.rs` — bridge 线程体 → `spawn_bridge_thread()` 方法
- 验证结果: cargo test kernel::adapter 10 passed, cargo clippy 0 new warnings
- 偏离: design 原计划提取 `build_agent_shared_state()` 辅助方法，但 14 个 Arc/Mutex 字段的返回类型定义过重（按 design 风险提示"可降级为只提取 bridge 线程"）。已降级，仅提取 `spawn_bridge_thread()`，run_agent_loop 从 141 行减至 ~130 行

## 全量验证

- Rust: 151 tests, 0 failed
- Frontend: 54 tests (7 files), 0 failed
- cargo fmt --check: OK
- cargo clippy -- -D warnings: 0 new warnings
