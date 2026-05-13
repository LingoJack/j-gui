---
doc_type: audit-index
slug: proma-ui-gap
date: 2026-05-12
status: active
scope: j-gui renderer UI against Proma baseline, focused on app-shell, empty state, settings, and shortcuts
---

# Proma UI 差距审计

## 范围

- `src/components/app-shell/`
- `src/components/welcome/`
- `src/components/settings/`
- `src/components/shortcuts/`
- Proma 基线：
  - `E:\Coding\AI\Proma\apps\electron\src\renderer\components\app-shell\AppShell.tsx`
  - `E:\Coding\AI\Proma\apps\electron\src\renderer\components\settings\SettingsPanel.tsx`
  - `E:\Coding\AI\Proma\apps\electron\src\renderer\components\settings\ShortcutSettings.tsx`

## 总评

当前 `j-gui` 的 UI 主体骨架已经在，但与 Proma 的差距主要集中在三类地方：

1. 布局状态判断不够硬，导致空态下仍可能泄漏右侧大面板。
2. 快捷键能力层已存在，设置入口却被删掉，形成“代码支持但界面缺席”的断裂。
3. 中央欢迎空态的信息密度和动作组织偏弱，容易形成“大块留白 + 低引导”的粗糙感。

## 发现矩阵

| ID | 标题 | 性质 | 严重度 | 置信度 | 建议动作 |
|---|---|---|---|---|---|
| 01 | 右侧面板显隐依赖会话原子而非真实 tab 状态，空态下会泄漏大面积空面板 | bug | P1 | high | cs-issue |
| 02 | 设置导航移除了快捷键管理，但底层配置和提示文案仍宣称可用 | arch-drift | P1 | high | cs-issue |
| 03 | 欢迎空态只有轻提示和单按钮，缺少 Proma 式中心卡片与任务导向 | maintainability | P2 | medium | cs-refactor |

## 优先级建议

- 先修 `01` 和 `02`。这两条都直接影响“界面是否像完整产品”。
- `03` 紧随其后处理。它不阻塞功能，但直接决定第一眼观感。
