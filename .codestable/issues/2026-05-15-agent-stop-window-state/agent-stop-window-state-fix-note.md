---
doc_type: issue-fix
slug: agent-stop-window-state
status: fixed
severity: high
tags:
  - agent
  - window-state
  - tauri
  - ipc
---

# agent-stop-window-state 修复记录

## 现象

- jcli Agent 执行“你好测试”后，界面一直显示 `Agent Running` 计时，无法自然收口。
- Windows 启动应用时，主窗口会恢复成一条很窄的横条，需要手动拉伸。

## 根因

- `src/lib/ipc.ts` 的 `stopAgent()` 在调用 `stop_agent` 后直接删除会话通道；当后端停止路径没有再返回 `done` 事件时，前端缺少统一的 `agent:stream-complete` 终态信号，流式状态可能残留为运行中。
- `tauri-plugin-window-state` 持久化了异常主窗口状态；本机实际状态文件中存在 `width=252`、`height=23`、`x/y=-32000`、`decorated=false` 的坏值，启动时被原样恢复。

## 修复

- 在 `stopAgent()` 中增加终态兜底：后端 stop 成功但当前通道仍未收到真实完成事件时，主动发出一次 `agent:stream-complete`，并带上 `stoppedByUser=true` 与 `resultSubtype='cancelled'`。
- 在 `src-tauri/src/lib.rs` 的 Windows 主窗口 setup 阶段增加状态校验；若检测到尺寸低于安全下限、位置落在隐藏坐标、或装饰状态异常，则先恢复到可见安全窗口，再应用自定义无边框设置。
- 顺带清理了本次闭环中暴露出的环境设置页类型与 lint 问题，保证仓库默认门禁通过。

## 验证

- `bun run test src/__tests__/ipc.test.ts`
- `bun run test src/__tests__/environment-settings.test.tsx src/__tests__/ipc.test.ts`
- `cargo test --manifest-path "src-tauri/Cargo.toml" malformed_window_state_requires_reset`
- `bash scripts/check_lint.sh`

## 额外说明

- `cargo audit` 仍有上游依赖 `lru -> ratatui -> j-cli` 的 `RUSTSEC-2026-0002` 警告，属于仓库既有可接受 WARN，不是本次引入。
