---
name: sidebar-performance-deferral
description: sidebar-performance-hardening roadmap item deferred pending deeper research on animation-preserving optimization approach
metadata:
  type: project
---

## sidebar-performance-hardening 搁置背景

**状态**：roadmap 条目从 `done` 回退为 `in-progress`（搁置）

**原因**：2026-05-15 代码验证发现核心实现不在当前代码中：
- roadmap 声称 LeftSidebar 在 width transition 结束后再挂载 SessionListItems
- 实际代码中 LeftSidebar.tsx 直接无条件渲染展开内容，无 `onTransitionEnd` 或延迟挂载逻辑
- 超时兜底、快速反向取消均未找到

**用户确认**：实际尝试过多种方案但难以在不丢失动画细节的前提下优化，需要更深入调研

**决策**：先完成其他 Phase E 条目，待有时间深入研究后再回来处理

**不影响下游**：当前搁置不阻塞其他 Phase E 条目推进

**相关 roadmap**：j-gui-v1 Phase E P0/P1 产品体验硬化