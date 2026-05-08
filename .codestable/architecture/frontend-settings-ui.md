---
doc_type: architecture
slug: frontend-settings-ui
scope: j-gui 前端设置界面——SettingsDialog + Provider 配置管理
summary: SettingsDialog 是模态对话框，标签式（模型/通用），模型 tab 提供 Provider 增删改 + 激活选择，通过 Tauri 命令读写 j_cli 的 agent_config.json
status: current
last_reviewed: 2026-05-08
tags: [frontend, settings, config, provider]
depends_on: []
implements: [j-gui-personalization]
---

# Settings UI — 前端设置界面

## 1. 定位与受众

SettingsDialog 管理 j-gui 的应用配置。当前仅"模型"tab 完成——Provider 的增删改和激活选择。配置持久化到 j_cli 的 `~/.jdata/agent/data/agent_config.json`，与 j-cli 共享。

**受众**：feature-design（了解设置模块边界）、新人上手（理解配置读写流程）。

## 2. 结构与交互

```
SettingsDialog (模态)
├── Header — "设置" + 关闭按钮
├── Tabs — 模型 | 通用
│   ├── [模型 tab] (当前实现)
│   │   ├── Provider 卡片 × N
│   │   │   ├── ○ 激活单选按钮       → setActiveIndex
│   │   │   ├── name 输入框
│   │   │   ├── apiBase + model 输入
│   │   │   ├── apiKey 输入 (password)
│   │   │   └── 🗑 删除按钮
│   │   └── + 添加提供方 按钮
│   └── [通用 tab] (占位)
└── Footer — 配置文件路径提示 + 取消/保存

数据流：
  打开 → getAgentConfig() → 加载到本地 draft
  编辑 → 修改 draft（不立即持久化）
  保存 → setAgentConfig({providers: draft, activeIndex})
  取消 → 丢弃 draft
```

### 组件文件

| 文件 | 职责 | 行数 |
|------|------|------|
| `src/components/settings/SettingsDialog.tsx` | 完整设置对话框 | 208 |

## 3. 数据与状态

### ProviderInfo

```typescript
// atoms/config.ts:4-11
interface ProviderInfo {
  name: string;           // 显示名称 "GPT-4o"
  apiBase: string;        // "https://api.openai.com/v1"
  apiKey: string;         // 脱敏后 "sk-...xxxx"
  model: string;          // "gpt-4o"
  supportsVision: boolean;
}
```

### 前后端数据流

```
前端                         后端
  │                            │
  │── get_agent_config() ────►│  commands/config.rs:32
  │◄── AgentConfigInfo ────────│  (apiKey 脱敏: sk-xx...xx)
  │                            │
  │  [用户编辑 draft]           │
  │                            │
  │── set_agent_config() ────►│  commands/config.rs:52
  │   {providers, activeIndex} │  (检测 "..." 则保留原 key)
  │                            │  → save_agent_config()
  │                            │  → ~/.jdata/agent/data/agent_config.json
  │                            │
  │── set_active_provider(n)─►│  commands/config.rs:79
  │                            │  (ChatHeader 模型选择器直接调用)
```

### 脱敏机制

- `get_agent_config` 返回 `sk-xx...xxxx` 格式 (`config.rs:38-42`)
- `set_agent_config` 检测 value 含 `...` 则保留原 key (`config.rs:58-62`)
- 用户输入不含 `...` 的新 key 时才会覆盖

## 4. 关键决策

- **本地 draft 模式**：编辑不直接写后端——用户必须点"保存"才持久化。避免每次按键都写磁盘
- **脱敏 + 保留原值**：防止未修改的 API Key 被空值覆盖，也防止完整 key 泄露到前端状态树
- **激活独立命令**：`set_active_provider` 单独一个命令——ChatHeader 的模型选择器直接调用，不走 SettingsDialog 的保存流程
- **配置与 j-cli 共享**：读写同一个 `agent_config.json`，j-cli 终端和 j-gui GUI 看到的 Provider 列表一致

## 5. 代码锚点

| 想看什么 | 从哪看 |
|----------|--------|
| SettingsDialog 完整逻辑 | `src/components/settings/SettingsDialog.tsx:1-208` |
| Provider 列表渲染 | `src/components/settings/SettingsDialog.tsx:80-130` |
| 脱敏逻辑（后端） | `src-tauri/src/commands/config.rs:32-49` |
| 保存 + 脱敏兼容（后端） | `src-tauri/src/commands/config.rs:52-75` |
| 激活切换（后端） | `src-tauri/src/commands/config.rs:79-89` |
| Config atoms | `src/atoms/config.ts:1-23` |
| IPC 封装 | `src/lib/tauri.ts:53-75` |

## 6. 已知约束

- **通用 tab 占位**：仅显示"即将推出"
- **无别名 tab**：`backend-alias-commands` 未实现，前端无对应 UI
- **无外观 tab**：主题/字体设置未实现
- **无 Provider 验证**：保存时不做 API 连通性测试

## 7. 相关文档

- `compound/2026-05-08-decision-j-gui-frontend-stack.md` — 前端技术栈
- `compound/2026-05-08-decision-j-gui-ui-architecture.md` — UI 整体架构
- `requirements/j-gui-personalization.md` — 承载的能力需求
