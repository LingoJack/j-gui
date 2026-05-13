---
doc_type: audit-finding
date: 2026-05-13
severity: P2
category: arch-drift
confidence: high
file: scripts/check_lint.sh
---

# Finding-05: 计划中的并行执行未实现

## 证据

脚本注释中多处标注"可并行"（C 组 header："测试（前端测试、Rust 测试，可并行）"），但所有检查段实际上完全串行执行。

计划文件 `mighty-booping-pebble.md` 阶段四明确写了：
> 将独立的检查段用 `&` 后台执行 + `wait` 汇总：
> A、B、C、D 四组可并行执行。

实际代码中无 `&`、`wait`、subshell 或任何并行机制。

## 影响

脚本总耗时 = A + B + C + D 组串行时间。对于大型项目，cargo clippy + cargo test + TypeScript + ESLint 全部串行可能超过 10 分钟。并行后可缩短到最慢一组的耗时。

## 建议

此为后续优化项，不影响正确性。实现时需注意：
- 临时文件冲突（每组用不同前缀）
- 计数器需要原子操作或合并
- GHA 注解输出顺序需排序
