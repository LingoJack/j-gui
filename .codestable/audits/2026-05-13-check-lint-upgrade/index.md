---
doc_type: audit-index
date: 2026-05-13
scope: check_lint.sh 重写 + eslint.config.js 新建 + package.json ESLint 接入
auditor: Claude Opus 4.7
status: active
---

# 审计：check_lint.sh 生产级升级

## 范围

| 文件 | 操作 |
|------|------|
| `scripts/check_lint.sh` | 687 行重写为 ~820 行（16 检查→20 检查，新增 ESLint/audit/lockfile/trap/增量模式/GHA 输出） |
| `eslint.config.js` | 新建，flat config 完整规则集 |
| `package.json` | 加 6 个 ESLint devDeps + `lint:eslint` script |

## 总评

整体改动方向正确，新增的 ESLint/audit/lockfile/trap/增量模式/GHA 输出填补了原脚本的主要缺口。**但存在 2 个 P1 级 bug**，一个是参数解析会在 `--diff` 无参数时崩溃，另一个是 D3 的 awk 规则顺序破坏了测试模块排除。此外有若干 P2 级细节问题。

## 发现清单

| # | 性质 | 严重度 | 置信度 | 文件:行号 | 摘要 | 建议动作 |
|---|------|--------|--------|-----------|------|----------|
| 01 | bug | P1 | high | check_lint.sh:36 | `--diff` 无 ref 参数时 `shift 2` 崩溃 | cs-issue |
| 02 | bug | P1 | high | check_lint.sh:353-356 | D3 awk `#[...]` 通配规则拦截了 `#[cfg(test)]`，测试函数不被排除 | cs-issue |
| 03 | bug | P2 | high | check_lint.sh:203 | `cargo audit` 用裸 `cargo` 而非 `$CARGO_BIN` | cs-issue |
| 04 | maintainability | P2 | high | check_lint.sh:576-584 | D5 unwrap 检测匹配原始行，`// .unwrap()` 误报 | cs-refactor |
| 05 | arch-drift | P2 | high | check_lint.sh:全文 | 计划中的并行执行未实现，全部串行 | cs-refactor |
| 06 | maintainability | P2 | medium | check_lint.sh:43 | `FIXED_CHECK_GROUPS=20` 实际应为 19 | cs-refactor |
| 07 | maintainability | P2 | medium | eslint.config.js:66-71 | 测试文件 override 未放宽 `no-unused-vars`，测试告警噪音 | cs-refactor |

## 下一步建议

- **P1 finding-01、02** 建议立刻修——一个导致脚本崩溃，一个导致误报（测试函数被当作业务函数检查行数）
- **P2** 可以后续处理，不影响当前使用
