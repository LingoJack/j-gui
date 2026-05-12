# runtime-observability-gates 验收报告

> 阶段：阶段 3（质量门禁收口）
> 验收日期：2026-05-12
> 关联方案 doc：`.codestable/features/2026-05-12-runtime-observability-gates/runtime-observability-gates-design.md`

## 1. 范围结论

- [x] 本项只覆盖 roadmap Phase D 首个条目 `runtime-observability-gates`
- [x] 本项只覆盖三个高风险域：
  - Agent history replay
  - message-content search
  - ToolSettings runtime closure
- [x] 未扩大到 Proma parity 最终判定
- [x] 未扩大到全仓命令层测试补平

## 2. Step 1 盘点结论

当前差距不在“完全没有测试”，而在“默认门禁没有把高风险闭环锚点显式声明为 Phase D 质量门”。

盘点结果：

| 域 | 默认门禁已有自动化锚点 | 失败显式化 | 当前缺口 |
|---|---|---|---|
| Agent history replay | `src/__tests__/ipc.test.ts` + `src-tauri/src/tests/commands_agent.rs` | 已显式抛错，不再 fallback synthesis | 缺显式的 Phase D gate 定义 |
| message-content search | `src/__tests__/ipc.test.ts` + `src/__tests__/search-dialog.test.tsx` | 已有搜索错误态与单侧失败保留健康结果 | 缺显式的 Phase D gate 定义 |
| ToolSettings runtime | `src/__tests__/ipc.test.ts` + `src/__tests__/tool-settings.test.tsx` | 已有 toggle 错误提示与 unsupported surface | 缺显式的 Phase D gate 定义 |

## 3. 默认门禁收口

- [x] `scripts/check_lint.sh` 已新增 `Phase D 关键闭环门` 检查段
- [x] 默认门禁现在会显式检查以下回归锚点是否仍存在：
  - replay：`getAgentSessionSDKMessages surfaces backend replay failures instead of synthesizing fallback`
  - search：`shows explicit content-search error instead of empty results when backend search fails`
  - toolsettings：`sendMessage no longer forwards enabledToolIds that backend does not consume`
  - replay Rust：`ensure_runtime_idle_rejects_running_session` + `resolve_cli_resume_state_uses_source_session_for_forks`

结论：

- [x] 三个高风险域的关键锚点均已被默认门禁显式覆盖

## 4. Failure Surface 核对

### 4.1 Agent history replay

- [x] 前端 IPC 在 replay 后端失败时直接抛错，不再合成 fallback
  - 证据：`src/__tests__/ipc.test.ts`
- [x] Rust 侧 replay/fork/rewind/resume 边界有回归锚点
  - 证据：`src-tauri/src/tests/commands_agent.rs`

### 4.2 message-content search

- [x] Chat 内容搜索只走正式后端命令
  - 证据：`src/__tests__/ipc.test.ts`
- [x] SearchDialog 在后端失败时显示显式错误，并保留健康侧结果
  - 证据：`src/__tests__/search-dialog.test.tsx`

### 4.3 ToolSettings runtime

- [x] ToolSettings toggle 失败时有错误提示
  - 证据：`src/__tests__/tool-settings.test.tsx`
- [x] Chat 发送链路不再透传 `enabledToolIds`
  - 证据：`src/__tests__/ipc.test.ts`

## 5. Evidence Pack 结论

本 feature 已整理出可被后续 `proma-parity-evidence-pass` 直接复用的三类证据：

- [x] 代码锚点：测试名称 + 脚本门禁入口
- [x] 自动化证据：`bun run test` / `cargo test` / `bash scripts/check_lint.sh`
- [x] 质量口径：Closure Gate / Failure Surface / Default Gate 的统一判断

当前仍未在本 feature 内补的内容：

- [ ] Proma 对标截图/录屏
- [ ] 逐屏 parity 行为结论

这些保留给 `proma-parity-evidence-pass`。

## 6. 验证记录

- [x] `python .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-12-runtime-observability-gates/runtime-observability-gates-checklist.yaml --yaml-only`
- [x] `python .codestable/tools/validate-yaml.py --file .codestable/roadmap/j-gui-v1/j-gui-v1-items.yaml`
- [x] `bash scripts/check_lint.sh`

## 7. 当前结论

- `runtime-observability-gates` 的第一轮收口已完成：
  - 盘点结论明确
  - 默认门禁已显式绑定三域关键锚点
  - acceptance 已把质量证据整理成下游可复用输入
- 下一步应进入：
  - `proma-parity-evidence-pass`
  - 或者更大范围的 `tdd-coverage`
