---
doc_type: audit-finding
audit: 2026-05-09-full-scope
finding_id: "security-06"
nature: security
severity: P1
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 06：API Key 明文传入子进程环境变量

## 速答

`AgentEngine::start` 将 API Key 从配置直接设置到子进程的环境变量中。在 Linux 上，`/proc/<pid>/environ` 对同用户进程可读；在 Windows 上，进程环境块也可通过 API 读取。API Key 以明文暴露给系统上所有同用户进程。

## 关键证据

- `src-tauri/src/agent_engine.rs:75-77` — `cmd.env("ANTHROPIC_API_KEY", &provider.api_key);`
- `src-tauri/src/agent_engine.rs:71-74` — 同样 `ANTHROPIC_BASE_URL` 也被传入（含路径信息但不含密钥）

API Key 在 `agent_config.json` 中以脱敏形式存储（`get_agent_config` 返回 `sk-xx...xxxx`），但 `agent_engine.rs` 使用的是 `load_agent_config()`（非脱敏版本，来自 j_cli 的 `chat::storage::load_agent_config`），读取的是完整 key。

## 影响

同系统上的其他进程可读取 Claude API Key。在多用户服务器或共享桌面环境上风险较高；个人单用户桌面风险较低，但任何有进程枚举权限的恶意软件均可提取。

## 修复方向

如果 Claude CLI 支持通过 stdin 或配置文件传递 API Key，改用这些方式替代环境变量。短期缓解：验证 Claude CLI 是否支持 `--api-key` 命令行参数。

## 建议动作

`cs-issue`，涉及凭据泄露。
