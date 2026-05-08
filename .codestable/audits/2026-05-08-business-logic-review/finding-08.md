---
doc_type: audit-finding
audit: business-logic-review
id: F-08
nature: maintainability
severity: P1
confidence: high
recommendation: cs-refactor
---

# F-08: 大量死代码 — ToolResult/PermissionRequest 事件路径完全不触发

## 位置

多处：

| 位置 | 死代码内容 |
|------|-----------|
| `agent_engine.rs:14` | `ToolResult { tool_id, content }` 枚举变体 |
| `agent_engine.rs:16` | `PermissionRequest { ... }` 枚举变体 |
| `agent_engine.rs:158-187` | `parse_sdk_line` — 无 "user" 类型解析（F-01 根因） |
| `commands/agent.rs:29-37` | `respond_agent_permission` 命令 |
| `AgentView.tsx:89-104` | `case "toolResult"` — 永不触发 |
| `AgentView.tsx:106-107` | `case "permissionRequest"` — 永不触发 |
| `src/lib/tauri.ts:136-137` | `ToolResult` / `PermissionRequest` TypeScript 类型变体 |
| `PermissionBanner.tsx` | 整个组件 — 无任何文件导入引用 |

## 证据

```bash
# 验证 PermissionBanner 无引用
grep -r "PermissionBanner" src/ --include="*.tsx" --include="*.ts"
# 结果: 仅在 PermissionBanner.tsx 自身的 export default 中定义，无 import
```

当前 CLI 参数使用 `--permission-mode bypassPermissions`——Claude Code **自动批准所有工具**，不经 stdin 发送权限请求，工具结果也不会以独立消息形式发送到 stdout。两条事件路径在整个协议流中不存在。

## 影响

- 代码体积膨胀——实现了完整但不可达的工具审批/结果流
- 新开发者阅读代码时被误导——以为这些路径会执行
- TypeScript 类型守卫需处理永假分支

## 修复建议

1. 明确策略：当前阶段是否展示工具调用结果？
   - **不展示** → 删除死代码，`#[allow(dead_code)]` 也可一并移除 `PermissionRequest` 变体
   - **要展示** → 切换 permission mode + 补齐 parse_sdk_line 解析（但会增加用户交互复杂度）
2. 无论哪种选择，`PermissionBanner.tsx` 当前无引用可安全删除，后续需要时从 git history 恢复

## 修复记录 (2026-05-08)

**已实施**：删除全部 PermissionRequest 相关死代码：

| 文件 | 改动 |
|------|------|
| `agent_engine.rs:10-29` | `AgentEvent` enum 移除 `PermissionRequest` 变体，移除 `#[allow(dead_code)]` |
| `agent_engine.rs:109-124` | 移除 `respond_permission()` 方法 |
| `commands/agent.rs:29-37` | 移除 `respond_agent_permission` 命令函数 |
| `lib.rs:17-20` | `invoke_handler` 移除 `respond_agent_permission` |
| `tauri.ts:133-138` | `AgentEvent` type 移除 `permissionRequest` 变体 |
| `tauri.ts:148-151` | 移除 `respondAgentPermission()` 函数 |
| `AgentView.tsx:4-9` | 移除 `respondAgentPermission` import |
| `AgentView.tsx:106-107` | 移除 `case "permissionRequest":` |
| `PermissionBanner.tsx` | **文件删除**（无引用） |

保留 `ToolResult` 事件 + `toolResult` case（F-01 修复后变为可达路径）。

**验证**：bun run test 15 passed ✅ | cargo test 7 passed ✅ | tsc --noEmit 0 error ✅ | clippy -D warnings 0 error ✅
