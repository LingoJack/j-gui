---
doc_type: audit-finding
date: 2026-05-13
severity: P2
category: maintainability
confidence: high
file: scripts/check_lint.sh
line: 576-584
---

# Finding-04: D5 unwrap 检测匹配原始行，注释中的 unwrap 会误报

## 证据

```awk
# check_lint.sh:576-584
/\.unwrap\(\)/ || /\.expect\(/ {
    # 白名单检查...
    printf "      %d: %s\n", NR, $0
}
```

D5 的 awk 脚本定义了 `preprocess_line()` 函数（第 530 行），用于 `brace_delta()` 中过滤注释和字符串。但 unwrap/expect 检测本身直接匹配 `$0`（原始行），未经过预处理。

因此以下代码会误报：
```rust
// handle.unwrap() 不安全，改用 ?
```

## 建议修法

在 unwrap 检测前加预处理过滤：

```awk
/\.unwrap\(\)/ || /\.expect\(/ {
    cleaned = preprocess_line($0)
    if (cleaned !~ /\.unwrap\(\)/ && cleaned !~ /\.expect\(/) next
    # 白名单检查...
}
```
