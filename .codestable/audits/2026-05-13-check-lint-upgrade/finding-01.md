---
doc_type: audit-finding
date: 2026-05-13
severity: P1
category: bug
confidence: high
file: scripts/check_lint.sh
line: 36
---

# Finding-01: `--diff` 无 ref 参数时脚本崩溃

## 证据

```bash
# check_lint.sh:36
--diff)    DO_DIFF=true; DIFF_REF="${2:-HEAD}"; shift 2 ;;
```

当用户运行 `bash scripts/check_lint.sh --diff`（没有提供 ref 参数）：

1. `$1` = `"--diff"` 匹配 case
2. `${2:-HEAD}` 扩展为 `"HEAD"`（赋值给 DIFF_REF，正确）
3. `shift 2` 尝试移除两个位置参数，但只有 1 个（`--diff`）剩余
4. bash 报错 `shift: 2: shift count out of range`
5. `set -e`（第 9 行）导致脚本立即退出

## 影响

`--diff` 的默认行为（使用 HEAD）完全不可用。

## 建议修法

```bash
--diff)
    DO_DIFF=true
    if [[ $# -ge 2 && "$2" != --* ]]; then
        DIFF_REF="$2"; shift 2
    else
        DIFF_REF="HEAD"; shift
    fi
    ;;
```
