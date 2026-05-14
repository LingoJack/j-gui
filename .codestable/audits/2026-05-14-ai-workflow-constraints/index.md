---
doc_type: audit-index
date: 2026-05-14
scope: AI 约束系统 / 工作流门禁（AGENTS.md、CLAUDE.md、commit-msg、pre-push、check_lint、IPC 对账）
auditor: Codex GPT-5
status: active
---

# 审计：AI 约束系统 / 工作流门禁

## 范围

| 文件 | 关注点 |
|------|--------|
| `AGENTS.md` | 默认实施流程、审查触发条件、roadmap 闭环要求、提交拆分规范 |
| `CLAUDE.md` | 与 `AGENTS.md` 的镜像一致性 |
| `.githooks/commit-msg` | 中文 Conventional Commits 提交文案校验入口 |
| `.githooks/pre-push` | push 范围内提交文案校验 + 默认门禁执行 |
| `scripts/check_commit_message.sh` | 单提交 / 范围提交校验逻辑 |
| `scripts/check_lint.sh` | 默认合规门禁、IPC 对账接线 |
| `scripts/check_ipc_contract.ts` | 前端 invoke/tryInvoke 与 Rust `generate_handler!` 注册面对账 |

## 总评

本轮针对 AI 约束系统和工作流门禁的复审，**未发现新的 blocking findings**。此前已暴露的 3 类核心问题已经闭环：

1. IPC 注册面对账已收紧到真实 `tauri::generate_handler![...]` 注册块，不再误把普通 `use commands::...` 视为已注册命令。
2. `.py -> .ts` 迁移后的门禁入口已自洽，`check_lint.sh` 与仓库内真实脚本文件一致。
3. `pre-push` 已从“只看 `HEAD`”收敛为“校验本次 push 范围内的提交文案”，新分支首次推送分支也避免了把无关本地祖先误计入范围。

当前这套系统已经具备可提交状态。剩余风险主要是**允许保留的前端占位命令列表**需要后续继续随着后端落地逐步收缩，但它已被显式登记，不再是静默漂移。

## 发现清单

本次范围内未发现新的 P0 / P1 / P2 findings。

| 性质 | P0 | P1 | P2 |
|------|----|----|----|
| bug | 0 | 0 | 0 |
| security | 0 | 0 | 0 |
| performance | 0 | 0 | 0 |
| maintainability | 0 | 0 | 0 |
| arch-drift | 0 | 0 | 0 |

## 下一步建议

- 可以提交本轮 `mjs -> ts` 收口与审计记录。
- 后续若继续扩展这套门禁，优先维护 `scripts/check_ipc_contract.ts` 的 allowlist 收敛，而不是增加新的旁路豁免。
