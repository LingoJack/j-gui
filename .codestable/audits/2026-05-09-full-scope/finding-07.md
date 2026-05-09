---
doc_type: audit-finding
audit: 2026-05-09-full-scope
finding_id: "security-07"
nature: security
severity: P1
confidence: medium
suggested_action: cs-issue
status: open
---

# Finding 07：home_dir() 回退到 "." 可能导致会话数据写入意外位置

## 速答

`agent_session::home_dir()` 在 `USERPROFILE` 和 `HOME` 均未设置时回退到 `PathBuf::from(".")`。这会导致会话数据（含对话内容、tool 调用记录）写入进程当前工作目录而非用户主目录。

## 关键证据

- `src-tauri/src/agent_session.rs:49-54` — `home_dir()` 函数链式回退到 `PathBuf::from(".")`
- `src-tauri/src/agent_session.rs:56-58` — `agent_sessions_dir()` 基于 `home_dir()` 构建路径

对比 `chat_engine.rs` 使用的是 j_cli 的 `SessionPaths::new()`（内部通过 `constants::data_dir()` 确定路径），有更规范的路径解析逻辑。agent_session 模块重复实现了路径解析且回退策略较脆弱。

## 影响

在异常环境（容器、CI、服务进程）中 `USERPROFILE`/`HOME` 可能未设置。此时 Agent 会话数据会写入进程 CWD（可能是项目目录、系统目录等不可预期的位置）。如果 CWD 恰好是 git 仓库，transcript.jsonl 可能被意外提交。

## 修复方向

复用 j_cli 的 `constants::data_dir()` 而非重复实现 `home_dir()`，或直接使用 j_cli 的存储层。

## 建议动作

`cs-issue`，涉及数据安全和路径安全。
