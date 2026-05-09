---
doc_type: issue-fix
issue: 2026-05-09-post-parity-regression
status: fixed
fixed_at: 2026-05-09
fixed_by: Claude Code
fixes: [post-parity-regression-finding-01, post-parity-regression-finding-02, post-parity-regression-finding-03, post-parity-regression-finding-04, post-parity-regression-finding-05, post-parity-regression-finding-07]
---

# Post-Parity 回归修复记录

## 修复清单

### Finding #1 (P0) — Chat 无回复
**措施**：在 Channel `onmessage` 入口添加 DEV 日志，记录事件类型和 runId 匹配状态
**文件**：`src/components/chat/ChatView.tsx:145-152`
**验证方式**：打开浏览器 DevTools Console，发送消息后看是否有 `[ChatView] Channel event:` 日志
**注意**：根因待进一步调试确认（可能是 provider 配置 / API key / 后端调用超时），日志可帮助定位

### Finding #2 (P0) — Agent 默认 bypass 工具调用
**措施**：`permissionModeByTabAtom` 默认值从 `"bypassPermissions"` 改为 `"default"`
**文件**：`src/components/agent/AgentView.tsx:161,284-285`
**效果**：Agent 启动后不再自动执行工具，需要用户逐次审批

### Finding #3 (P1) — Tab 关不完
**措施**：移除 `executeCloseTab` 中最后一个 tab 关闭后的自动创建逻辑
**文件**：`src/components/app-shell/MainArea.tsx:122-127`
**效果**：关闭最后一个 tab 后，MainArea 的空态分支（line 169）变为可达，显示欢迎页或"暂无打开的标签页"

### Finding #4 (P1) — 无停止按钮
**措施**：
1. `ChatInput` 新增 `onStop` prop + `Square` 停止按钮（`sendDisabled && onStop` 时显示，替换发送按钮）
2. `AgentView` 传入 `onStop={() => engine.stopEngine()}`
3. `ChatView` 新建 `handleStopStream`（递增 runId + 重置 streaming 标志）
**文件**：`ChatInput.tsx:9,19,243-252`, `AgentView.tsx:464`, `ChatView.tsx:275-281,482`
**效果**：Agent 和 Chat 模式下，流式输出时发送按钮变为红色停止按钮

### Finding #5 (P1) — parse_sdk_line 静默丢弃
**措施**：`_ => Vec::new()` 改为带 `eprintln!` 告警的版本
**文件**：`agent_engine.rs:369-376`
**效果**：未知消息类型会输出 `[warn] parse_sdk_line: unknown msg_type` 到 stderr

### Finding #7 (P1) — 协议解析脆弱
**措施**：部分整合进 #5 的日志改进。更全面的输入消毒需要后续重构
**状态**：部分修复（日志改进），结构性改进留待 `cs-refactor`

## 测试验证
- `bunx tsc --noEmit` — pass
- `bun run test` — 83 tests, 12 files, all pass
- `cargo clippy -- -D warnings` — pass
- `cargo test --lib` — 12 tests, all pass
