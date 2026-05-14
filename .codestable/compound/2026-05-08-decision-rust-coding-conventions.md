---
doc_type: decision
category: convention
status: active
created: 2026-05-08
slug: rust-coding-conventions
title: Rust 编码规约——从 jcli 继承适配至 j-gui
---

# Rust 编码规约

> 本规约从 jcli 项目继承，经适配后应用于 j-gui（Tauri 桌面应用）的 `src-tauri/` Rust 代码。

## 0. 规则分层

- **脚本硬门禁**：必须能被 `bash scripts/check_lint.sh` 或 Rust 官方工具直接验证；出现 `FAIL` 时不能算完成。
- **审查建议**：作为 review 的默认判断口径，目标是让代码保持简单、稳定、可维护；它们默认不要求全部自动化。
- 新增 Rust 约束时，若要写成“必须”，应优先同步补到 `scripts/check_lint.sh` 或 `clippy` 配置；否则应归入“审查建议”。

## 1. 脚本硬门禁与告警 (Gate Enforced)

- 代码必须通过 `cargo fmt --check` 格式化检查。
- 代码必须通过 `cargo clippy -- -D warnings` 检查且无告警（CI 门禁）。Clippy 配置可在 `Cargo.toml` 的 `[lints.clippy]` 节持久化：
  ```toml
  [lints.clippy]
  # 例如：enum_glob_use = "deny"
  ```
- 非 test 代码默认禁止 `unwrap()` / `expect()`；当前仅允许脚本白名单中的少数同步原语或线程回收场景，新增例外时必须先说明理由并同步更新门禁。
- 导出的 Rust API 项与 re-export 必须有 `///` 文档注释。
- 使用 `unsafe` 块时，必须在上方标注 `// SAFETY:` 注释，解释其安全性前提。
- 禁止使用 `mod.rs`；统一采用 `name.rs` + `name/` 子目录模式。
- 禁止 `super::super::` 这类深层相对路径，优先改成 `use` 导入。
- 单文件、单函数、函数参数数量超阈值目前属于脚本 `WARN`，默认视为需要解释或继续拆分的信号，不等同于 `FAIL` 级阻塞。

## 2. 审查建议 (Review Heuristics)

- 命名规范（RFC 430 / [Rust API Guidelines C-CASE](https://rust-lang.github.io/api-guidelines/naming.html)）：

  | 类别 | 约定 | 示例 |
  |------|------|------|
  | 类型 / Trait / Enum 变体 | `UpperCamelCase` | `MyStruct`, `MyTrait`, `VariantOne` |
  | 函数 / 方法 / 变量 / 模块 | `snake_case` | `process_data()`, `my_variable` |
  | 常量 / 静态变量 | `SCREAMING_SNAKE_CASE` | `MAX_SIZE`, `GLOBAL_CONFIG` |
  | 宏 | `snake_case!` | `my_macro!` |
  | 类型参数 | 简洁 `UpperCamelCase`，通常单字母 | `T` |
  | 生命周期 | 短 `lowercase`，通常单字母 | `'a`, `'de` |

  - 首字母缩写按单单词处理：`Uuid` 而非 `UUID`，`Stdin` 而非 `StdIn`；snake_case 中全小写：`is_xid_start`。
  - Crate 名禁止 `-rs` / `-rust` 后缀。

- 避免非必要的 `.clone()`，优先考虑所有权转移或借用。
- 接口参数优先使用切片（`&str`, `&[T]`）而非包装类型（`String`, `Vec`）。
- 优先使用迭代器（Iterator）处理集合，利用其特性减少手动边界检查。
- 集合类型在已知大小时使用 `with_capacity` 预分配内存，减少重分配开销。
- 使用 `?` 操作符进行错误传播，避免深层嵌套的 `match` 或 `if let`。
- 应用层错误聚合优先用 `anyhow`；需要定义领域错误类型时，优先用 `thiserror`，避免重复手写样板 `Display` / `Error` / `From`。

- 类型定义与对应的 `impl` 块应在同一文件中物理相邻。
- 优先为结构体派生常用 Trait：`Debug`, `Default`, `PartialEq`。
- 构造函数惯例命名为 `pub fn new(...) -> Self`；若无参数，应同时实现 `Default` Trait。
- 字段可见性遵循最小化原则；跨模块暴露的内部字段考虑 `pub(crate)`，模块内私有不加 `pub`。

- 显式处理所有枚举分支，避免过度依赖 `_ => ...`。
- 利用组合子（`.map()`, `.and_then()`, `.ok_or()`）简化 `Option` 和 `Result` 的链式处理。
- 简单分支判断使用 `if let` 或 `let else`。

- **路径简化原则**：禁止在逻辑代码中频繁出现长路径引用（如 `a::b::c::Type`）。
  - 结构体/枚举：通过 `use a::b::c::Type;` 导入，直接使用 `Type`。
  - 导入冲突：若有同名类型，使用 `use ... as ...` 别名，或仅导入至上一级（如 `use std::fmt;` 然后使用 `fmt::Result`）。
- **语义化分文件**：避免在单一文件中堆叠不相关功能，按职责拆分（如 `time.rs`、`path_utils.rs`）。

- 遵循"单一职责原则"：一个函数只做一件事。
- 当函数嵌套过深或逻辑分支过多时，应提取私有辅助函数。
- 函数参数超过 4 个时，考虑封装为 `Config` 结构体或使用 Builder 模式。
- 魔法值必须提取为关联常量（`impl` 块内）或模块级 `const`。
- 公共函数按需包含标准化文档节（[C-QUESTION-MARK](https://rust-lang.github.io/api-guidelines/documentation.html)）：

  ```rust
  /// # Errors
  /// Returns an error if ...
  /// # Panics
  /// Panics if ...
  /// # Safety
  /// Caller must ensure ...
  ```

## 背景

从 jcli（CLI/TUI 项目）已有的 Rust 编码规约迁移至 j-gui（Tauri 桌面应用）。原 9 条规约中第 9 条"TUI 输出规范"与本项目无关已删除，其余 8 条为通用 Rust 最佳实践，直接继承。

归档时参照 [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/) 对命名规范和文档注释做了官方标准补充。

## 影响

- `src-tauri/` 下所有 Rust 代码受本规约约束。
- `scripts/check_lint.sh` 是本仓库 Rust 约束的默认执行入口；文档中的“脚本硬门禁/脚本告警”应与脚本保持一致。
- 代码 review 以“脚本硬门禁 + 脚本告警 + 审查建议”三层口径进行，不再把未自动化的经验项表述为脚本硬约束。
