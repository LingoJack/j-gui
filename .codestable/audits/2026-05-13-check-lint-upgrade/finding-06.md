---
doc_type: audit-finding
date: 2026-05-13
severity: P2
category: maintainability
confidence: medium
file: scripts/check_lint.sh
line: 43
---

# Finding-06: FIXED_CHECK_GROUPS 计数错误

## 证据

```bash
FIXED_CHECK_GROUPS=20
```

实际检查段数：
- A1(fmt) + A2(clippy) + A3(audit) = 3
- B1(lockfile) + B2(typescript) + B3(eslint) = 3
- C1(frontend test) + C2(rust test) = 2
- D1-D10 = 10
- E(Phase D gates) = 1

总计 = 19，非 20。

## 影响

汇总行的"固定检查段"数字不准确。不影响功能。
