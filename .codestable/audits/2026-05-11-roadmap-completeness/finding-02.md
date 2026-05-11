---
doc_type: audit-finding
audit: 2026-05-11-roadmap-completeness
finding_id: "02"
severity: P1
category: bug
confidence: high
suggested_action: cs-issue
files: [src/lib/ipc.ts]
---

# Finding 02: tryInvoke 静默返回默认值，掩盖后端 IPC 失败

## 位置

`src/lib/ipc.ts:24-35`

## 证据

```typescript
// src/lib/ipc.ts:24-35
export async function tryInvoke<T>(cmd: string, args?: Record<string, unknown>, fallback?: T): Promise<T> {
  try {
    return await invoke<T>(cmd, args)
  } catch (err) {
    warnOnce(`IPC ${cmd} 失败:`, err)
    if (fallback !== undefined) return fallback
    throw err
  }
}
```

当 `fallback` 参数被提供时（约 50+ 个 IPC 函数使用此模式），任何后端错误都被静默吞没，返回一个"看起来正常"的默认值（`[]`、`{}`、`null`、`false`、`true`）。

## 影响

受影响的典型调用：
- `listChannels()` → 失败时返回 `[]`，用户看到空列表
- `getUserProfile()` → 失败时返回 `{}`，用户信息丢失
- `listMcpServers()` → 失败时返回 `[]`，MCP 配置看起来为空
- `listAliases()` → 失败时返回 `[]`

用户看到的是"空数据"，而实际原因是后端调用失败。唯一的信号是 `warnOnce`（仅在开发者控制台打印一次，普通用户看不到）。

## 根本问题

对于只读查询操作，返回空默认值是合理的降级策略。但当前所有使用 `tryInvoke` 的地方都采用同一模式，无法区分"查询结果确实为空"和"后端调用失败"。

## 建议

开 `cs-issue`：
1. 为 `tryInvoke` 增加一个可选的 `showToast` 参数，或创建一个新 wrapper `tryInvokeWithToast`
2. 对用户主动触发的写操作（save/delete/toggle），移除 fallback 让错误传播到调用方
3. 对后台只读查询，保留空默认值的降级策略
