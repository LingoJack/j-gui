# Agent Experience — Partial

## Proma 对照点

- 来源：`proma-parity-acceptance.md` 的“Agent”

## j-gui 实现锚点

- [AgentView.tsx](/E:/Coding/AI/j-gui/src/components/agent/AgentView.tsx)
- [useAgentSendMessage.ts](/E:/Coding/AI/j-gui/src/components/agent/useAgentSendMessage.ts)
- [agent-history-replay-closure-acceptance.md](/E:/Coding/AI/j-gui/.codestable/features/2026-05-12-agent-history-replay-closure/agent-history-replay-closure-acceptance.md)
- [agent-runtime-stability-recovery-acceptance.md](/E:/Coding/AI/j-gui/.codestable/features/2026-05-12-agent-runtime-stability-recovery/agent-runtime-stability-recovery-acceptance.md)

## 行为证据

- replay/runtime 相关质量证据已由 Phase B / D feature acceptance 提供
- 其余 Agent UI parity 当前为 reference 清单人工判定占位

## 当前判定

- `Partial`

## 说明

- Agent 工作台基础链路、历史回放和 runtime 路由已闭环
- 但 slash runtime 选择、审批 UI、Context 用量、无回应处理、单工作区文件上下文等在 parity 清单里仍有大量 `Fail`
