---
doc_type: audit-index
audit: 2026-05-12-closure-roadmap-audit
scope: 当前前后端闭环与 active roadmap 完成条件审计，聚焦 IPC/command 对齐、Agent 工作区链路、MCP 测试链路与 roadmap 真相
created: 2026-05-12
status: active
total_findings: 4
---

# closure-roadmap-audit 审计报告

## 范围

本次只扫“能不能宣称当前前后端已闭环、roadmap 是否已经能完成”这条主线，重点核对：

- `src/lib/ipc.ts` 暴露的前端接口
- `src-tauri/src/lib.rs` 实际注册的 Tauri command
- Agent 工作区 / MCP 测试 / 工作区能力读取等高价值 UI 路径
- active roadmap：`.codestable/roadmap/j-gui-v1/`

## 总评

当前代码不能判定为“前后端已闭环”，也不能判定为“roadmap 只差最后验收”。主要问题不是页面缺失，而是仍存在若干高价值链路只有前端接口或 fallback，没有对应后端 command；与此同时，active roadmap 自己也把协议统一、Agent 历史回放、运行时恢复、ToolSettings runtime 闭环、内容搜索闭环标成 `in-progress` / `planned`。  
因此，现阶段更准确的结论是：Chat 主链路基本闭环，但 Agent 工作台、治理子链路和 roadmap 完成口径仍未收口。

## 发现清单

| # | 性质 | 严重度 | 置信度 | 标题 | 文件 |
|---|---|---|---|---|---|
| 1 | bug | P0 | high | Agent 工作区关键操作调用了未注册 command | [finding-01.md](finding-01.md) |
| 2 | arch-drift | P0 | high | MCP 测试入口在 UI 可见，但测试本身被用例确认后端不存在 | [finding-02.md](finding-02.md) |
| 3 | arch-drift | P1 | high | active roadmap 明确仍有闭环主线未完成，当前不能宣称“只差收口” | [finding-03.md](finding-03.md) |
| 4 | maintainability | P1 | high | `ipc.ts` 持续保留大量未注册 command 包装，放大“看起来有能力”的假象 | [finding-04.md](finding-04.md) |

## 按维度分布

| 性质 | P0 | P1 | P2 | 合计 |
|---|---|---|---|---|
| bug | 1 | 0 | 0 | 1 |
| security | 0 | 0 | 0 | 0 |
| performance | 0 | 0 | 0 | 0 |
| maintainability | 0 | 1 | 0 | 1 |
| arch-drift | 1 | 1 | 0 | 2 |
| **合计** | **2** | **2** | **0** | **4** |

## 下一步建议

- `P0 立刻修`：先开 `cs-issue` 处理 Agent 工作区 command 缺口、MCP 测试入口假闭环。
- `P1 本迭代修`：把 `stream-protocol-unify`、`toolsettings-runtime-closure`、`search-content-closure` 与代码现状重新对齐，不再把旧 `done` 口径当完成证明。
- `P1 文档收口`：后续 roadmap / acceptance / architecture 统一只以 `j-gui-v1` 为主线，并把“前端接口存在但后端未注册”的能力从完成态降级。
