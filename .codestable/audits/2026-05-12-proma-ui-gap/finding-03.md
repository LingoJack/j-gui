---
doc_type: audit-finding
slug: proma-ui-gap-03
severity: P2
category: maintainability
confidence: medium
recommended_action: cs-refactor
---

# Finding 03

## 标题

欢迎空态只有轻提示和单按钮，缺少 Proma 式中心卡片与任务导向

## 证据

- 当前空态主体只有问候语、随机 tip、模式切换：`src/components/welcome/WelcomeEmptyState.tsx:54-97`
- 主操作按钮被拆在 `WelcomeView` 外层单独放置，整体没有形成一个完整的中心工作台卡片：`src/components/welcome/WelcomeView.tsx:30-44`
- 这会在三栏 shell 中留下大面积空白，与你给的图 1 的“粗糙”和“太空”观感一致。

## 为什么是问题

这条不是功能错误，而是结构表达太弱。Proma 的观感之所以更像产品，不只是控件更多，而是欢迎区会把“当前模式、下一步动作、路径提示”收束成一个完整的中心块。现在 j-gui 的空态把这些信息拆散了。

## 建议

保留“关闭最后一个 tab 不自动重建 draft”的当前产品方向，但把欢迎区改成更完整的中心卡片：统一承载问候、模式、主动作和少量任务导向提示，减少空白感。
