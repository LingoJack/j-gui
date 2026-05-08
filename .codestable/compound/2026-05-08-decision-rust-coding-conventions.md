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

## 1. 工具与格式 (Tools & Format)

- 代码必须通过 `cargo fmt --check` 格式化检查。
- 代码必须通过 `cargo clippy -- -D warnings` 检查且无告警（CI 门禁）。Clippy 配置可在 `Cargo.toml` 的 `[lints.clippy]` 节持久化：
  ```toml
  [lints.clippy]
  # 例如：enum_glob_use = "deny"
  ```
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

## 2. 内存与性能 (Memory & Performance)

- 避免非必要的 `.clone()`，优先考虑所有权转移或借用。
- 接口参数优先使用切片（`&str`, `&[T]`）而非包装类型（`String`, `Vec`）。
- 优先使用迭代器（Iterator）处理集合，利用其特性减少手动边界检查。
- 集合类型在已知大小时使用 `with_capacity` 预分配内存，减少重分配开销。

## 3. 错误处理 (Error Handling)

- 非 test 代码应避免 `unwrap()` 和 `expect()`；仅在逻辑确信不会失败时使用（如 `Mutex::lock().unwrap()`）并辅以注释说明安全性。
- 使用 `?` 操作符进行错误传播，避免深层嵌套的 `match` 或 `if let`。
- 错误类型推荐手写 enum + `impl std::error::Error` + `From` 转换；`thiserror` 为依赖但非强制。

## 4. 类型设计与 Trait (Type Design)

- 类型定义与对应的 `impl` 块应在同一文件中物理相邻。
- 优先为结构体派生常用 Trait：`Debug`, `Default`, `PartialEq`。
- 构造函数惯例命名为 `pub fn new(...) -> Self`；若无参数，应同时实现 `Default` Trait。
- 字段可见性遵循最小化原则；跨模块暴露的内部字段考虑 `pub(crate)`，模块内私有不加 `pub`。

## 5. 模式匹配 (Pattern Matching)

- 显式处理所有枚举分支，避免过度依赖 `_ => ...`。
- 利用组合子（`.map()`, `.and_then()`, `.ok_or()`）简化 `Option` 和 `Result` 的链式处理。
- 简单分支判断使用 `if let` 或 `let else`。

## 6. 模块组织与路径引用 (Module & Pathing)

- **路径简化原则**：禁止在逻辑代码中频繁出现长路径引用（如 `a::b::c::Type`）。
  - 结构体/枚举：通过 `use a::b::c::Type;` 导入，直接使用 `Type`。
  - 导入冲突：若有同名类型，使用 `use ... as ...` 别名，或仅导入至上一级（如 `use std::fmt;` 然后使用 `fmt::Result`）。
- **弃用 mod.rs**：采用 `name.rs` + `name/` 子目录的文件组织方式。
- **语义化分文件**：避免在单一文件中堆叠不相关功能，按职责拆分（如 `time.rs`、`path_utils.rs`）。

## 7. 函数与逻辑 (Logic & Functions)

- 遵循"单一职责原则"：一个函数只做一件事。
- 当函数嵌套过深或逻辑分支过多时，应提取私有辅助函数。
- 函数参数超过 4 个时，考虑封装为 `Config` 结构体或使用 Builder 模式。
- 魔法值必须提取为关联常量（`impl` 块内）或模块级 `const`。

## 8. 文档与安全 (Docs & Safety)

- 公共 API 和核心类型必须有 `///` 文档注释。
- 公共函数按需包含标准化文档节（[C-QUESTION-MARK](https://rust-lang.github.io/api-guidelines/documentation.html)）：

  ```rust
  /// # Errors
  /// Returns an error if ...
  /// # Panics
  /// Panics if ...
  /// # Safety
  /// Caller must ensure ...
  ```

- 使用 `unsafe` 块时，必须在上方标注 `// SAFETY:` 注释，解释其安全性前提。

## 背景

从 jcli（CLI/TUI 项目）已有的 Rust 编码规约迁移至 j-gui（Tauri 桌面应用）。原 9 条规约中第 9 条"TUI 输出规范"与本项目无关已删除，其余 8 条为通用 Rust 最佳实践，直接继承。

归档时参照 [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/) 对命名规范（§1）和文档注释（§8）做了官方标准补充。

## 影响

- `src-tauri/` 下所有 Rust 代码受本规约约束。
- CI 中应配置 `cargo fmt --check` 和 `cargo clippy -- -D warnings` 作为门禁。
- 代码 review 以本规约为基准。
