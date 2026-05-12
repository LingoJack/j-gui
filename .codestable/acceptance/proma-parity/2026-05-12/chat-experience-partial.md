# Chat Experience — Partial

## Proma 对照点

- 来源：`proma-parity-acceptance.md` 的“Chat”

## j-gui 实现锚点

- [ChatView.tsx](/E:/Coding/AI/j-gui/src/components/chat/ChatView.tsx)
- [ChatInput.tsx](/E:/Coding/AI/j-gui/src/components/chat/ChatInput.tsx)
- [ChatMessages.tsx](/E:/Coding/AI/j-gui/src/components/chat/ChatMessages.tsx)
- [runtime-observability-gates-acceptance.md](/E:/Coding/AI/j-gui/.codestable/features/2026-05-12-runtime-observability-gates/runtime-observability-gates-acceptance.md)

## 行为证据

- Search / ToolSettings 相关质量证据已由 `runtime-observability-gates` 提供
- 其余 UI 细节当前为 parity 清单人工判定占位

## 当前判定

- `Partial`

## 说明

- 输入区、Thinking、消息渲染主体都已存在
- 但 Chat 工具活动提示、Agent 推荐入口等在 parity 清单里仍是 `Fail`
