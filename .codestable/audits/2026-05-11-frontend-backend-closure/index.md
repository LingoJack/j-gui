---
doc_type: audit-index
audit: 2026-05-11-frontend-backend-closure
scope: Chat/Agent 协议、Agent 会话回放、搜索打开链路、ToolSettings/治理设置的前后端闭环审计
created: 2026-05-11
status: active
total_findings: 4
---

# frontend-backend-closure 审计报告

## 范围

本次只扫描和“前后端是否闭环”直接相关的主链路：

- `src/lib/ipc.ts`
- `src/components/app-shell/SearchDialog.tsx`
- `src/hooks/useOpenSession.ts`
- `src/components/settings/ToolSettings.tsx`
- `src/components/settings/use-tool-credentials.ts`
- `src-tauri/src/commands/agent.rs`
- `src-tauri/src/commands/governance.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/agent_session.rs`
- `packages/shared/src/types/chat.ts`
- `packages/shared/src/types/agent.ts`

## 总评

共发现 4 条问题，集中在两类：一类是“前端已经按完整能力建好了入口，但后端命令或运行时模型没有跟上”，另一类是“类型里保留了正确信息，但 UI 打开链路没有真正消费”。最严重的是 Agent 运行时仍是全局单例，而前端已经按“每会话独立活跃 Agent”来组织状态，这会直接破坏多会话场景下的正确性。其余问题主要表现为静默 fallback，把“没闭环”伪装成“空结果/默认成功”。

## 发现清单

| # | 性质 | 严重度 | 置信度 | 标题 | 文件 |
|---|---|---|---|---|---|
| 1 | bug | P0 | high | Agent 后端仍是全局单例，和前端按会话隔离的运行模型冲突 | [finding-01.md](finding-01.md) |
| 2 | arch-drift | P1 | high | Agent 历史回放/迁移相关 IPC 已暴露，但后端命令没有闭环 | [finding-02.md](finding-02.md) |
| 3 | bug | P1 | high | 内容搜索结果只会打开会话，不能定位到命中的消息 | [finding-03.md](finding-03.md) |
| 4 | arch-drift | P1 | high | ToolSettings 的凭据、测试和自定义工具链路大面积依赖未注册命令 | [finding-04.md](finding-04.md) |

## 按维度分布

| 性质 | P0 | P1 | P2 | 合计 |
|---|---|---|---|---|
| bug | 1 | 1 | 0 | 2 |
| security | 0 | 0 | 0 | 0 |
| performance | 0 | 0 | 0 | 0 |
| maintainability | 0 | 0 | 0 | 0 |
| arch-drift | 0 | 2 | 0 | 2 |
| **合计** | **1** | **3** | **0** | **4** |

## 下一步建议

- **P0 立刻修**：`finding-01`，建议直接开 `cs-issue`，因为它会把 Agent 多会话场景的消息发送、中断响应和停止行为都绑到同一个后端实例上。
- **P1 本迭代修**：`finding-02`、`finding-03`、`finding-04`。这三条都属于“看起来有入口，但关键链路没真正打通”，继续堆 UI 会放大误导。
- **P2 有空再看**：本次范围内没有值得单列的 P2。
