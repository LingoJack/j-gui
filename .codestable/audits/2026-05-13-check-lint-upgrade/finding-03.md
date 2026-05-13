---
doc_type: audit-finding
date: 2026-05-13
severity: P2
category: bug
confidence: high
file: scripts/check_lint.sh
line: 203
---

# Finding-03: `cargo audit` 用裸 `cargo` 而非 `$CARGO_BIN`

## 证据

```bash
# check_lint.sh:203
if cargo audit >"$audit_log" 2>&1; then
```

脚本开头的 `resolve_bin` 机制处理了 WSL/cygpath 跨平台路径问题，解析出 `CARGO_BIN`。但 `cargo audit` 直接调用 PATH 中的 `cargo`，跳过了 `resolve_bin` 的路径解析。

如果系统有多个 cargo 安装（如 WL 和 Windows 原生），可能解析出不同版本。

## 建议修法

```bash
if "$CARGO_BIN" audit >"$audit_log" 2>&1; then
```

同时检测命令应改为 `"$CARGO_BIN" audit --version` 或 `command -v cargo-audit`（`cargo-audit` 是独立二进制，不经过 `$CARGO_BIN`，但命名暗示通过 cargo 调用）。
