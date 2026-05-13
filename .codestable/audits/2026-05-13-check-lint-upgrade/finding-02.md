---
doc_type: audit-finding
date: 2026-05-13
severity: P1
category: bug
confidence: high
file: scripts/check_lint.sh
line: 353-356
---

# Finding-02: D3 awk 规则顺序破坏测试模块排除

## 证据

```awk
# check_lint.sh:353-356（D3 单函数行数检查的 awk）

/^[[:space:]]*#\[/ { pending_attr = 1; next }                          # 通配规则
/^[[:space:]]*#\[cfg\(test\)\]/ { pending_test_attr = 1; next }        # 特定规则
/^[[:space:]]*#\[tauri::command\]/ { pending_tauri_attr = 1; next }    # 特定规则
```

awk 规则按顺序匹配，匹配后 `next` 跳过后续规则。

当输入为 `#[cfg(test)]`：
1. 第 353 行通配规则 **先匹配** → `pending_attr = 1` → `next`
2. 第 355 行特定规则 **被跳过** → `pending_test_attr` 保持为 0
3. 后续 `mod tests { }` 无法触发测试模块检测
4. `in_test` 未设为 1 → 测试函数被当作业务函数检查行数

## 对比原脚本

原脚本 check 8 没有 `#\[` 通配规则，只有特定规则，因此工作正常。新脚本添加通配规则后打破了顺序。

## 影响

`#[cfg(test)] mod tests { ... }` 内的函数会被 D3 检查行数，产生误报 WARN。

## 建议修法

将特定规则移到通配规则 **之前**：

```awk
# 先匹配特定模式，再匹配通配模式
/^[[:space:]]*#\[cfg\(test\)\]/ { pending_test_attr = 1; next }
/^[[:space:]]*#\[tauri::command\]/ { pending_tauri_attr = 1; next }
/^[[:space:]]*#\[/ { pending_attr = 1; next }
```

或干脆删除通配规则（原脚本没有，新脚本添加它是为了处理什么场景？如果只是为了跳过属性行，`next` 已达成目的，`pending_attr` 后续只用了一次且在非函数行被重置）。