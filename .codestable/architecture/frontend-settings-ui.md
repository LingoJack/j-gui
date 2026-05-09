---
doc_type: architecture
slug: frontend-settings-ui
scope: j-gui 前端设置界面——SettingsDialog + Provider 配置管理
summary: SettingsDialog 是六标签模态对话框，统一承载 models/general/aliases/skills/hooks/mcp 设置与治理入口，其中 models tab 通过 Tauri 命令读写 j_cli 的 agent_config.json
status: current
last_reviewed: 2026-05-09
tags: [frontend, settings, config, provider]
depends_on: []
implements: [j-gui-personalization]
---

# Settings UI — 前端设置界面

## 1. 定位与受众

SettingsDialog 管理 j-gui 当前可见的设置与治理入口。它已经是一个六标签对话框：`models / general / aliases / skills / hooks / mcp`，同时承载 provider 配置、通用偏好、alias 管理，以及 Agent 侧 Skills/Hooks/MCP 的可见性与部分治理操作。

**受众**：feature-design（了解设置模块边界）、新人上手（理解配置读写流程）。

## 2. 结构与交互

```
SettingsDialog (模态)
├── Header — "设置" + 关闭按钮
├── LeftNav — 模型 | 通用 | 别名 | Skills | Hooks | MCP
│   ├── [模型 tab]
│   │   ├── Provider 卡片 × N
│   │   │   ├── ○ 激活单选按钮       → setActiveIndex
│   │   │   ├── name 输入框
│   │   │   ├── apiBase + model 输入
│   │   │   ├── apiKey 输入 (password)
│   │   │   └── 🗑 删除按钮
│   │   └── + 添加提供方 按钮
│   ├── [通用 tab]
│   │   ├── 版本信息（只读）
│   │   ├── 搜索引擎
│   │   ├── 日志模式
│   │   ├── 主题
│   │   └── 字体大小
│   ├── [别名 tab]
│   │   ├── section/name/value 添加表单
│   │   └── alias 列表 + 删除
│   ├── [Skills tab] → listSkills()
│   ├── [Hooks tab]  → listHooks()
│   └── [MCP tab]    → listMcpServers() + toggle/remove
└── Footer — 配置目录提示 + 取消 + （仅 models tab 有）保存

数据流：
  打开 → 并行加载 models/general/aliases
  models 编辑 → 修改本地 draft（离开前提示未保存）
  general 编辑 → onBlur / onChange 立即写回
  aliases 编辑 → setAlias/removeAlias 后刷新列表
  mcp 开关/删除 → saveMcpServers() 立即写回
```

### 组件文件

| 文件 | 职责 | 行数 |
|------|------|------|
| `src/components/settings/SettingsDialog.tsx` | 完整设置对话框与六标签编排 | 483 |
| `src/components/settings/SkillsTab.tsx` | Skills 列表 | 53 |
| `src/components/settings/HooksTab.tsx` | Hooks 列表 | 84 |
| `src/components/settings/McpTab.tsx` | MCP 列表与启停/删除 | 77 |

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

### 前端本地状态

| 状态 | 文件 | 用途 |
|------|------|------|
| `tab` | `src/components/settings/SettingsDialog.tsx` | 当前左侧标签 |
| `draft` / `activeIndex` / `dirty` | `src/components/settings/SettingsDialog.tsx` | models tab 的本地草稿与未保存标志 |
| `generalConfig` | `src/components/settings/SettingsDialog.tsx` | 通用配置快照 |
| `aliases` / `aliasDraft` / `aliasDirty` | `src/components/settings/SettingsDialog.tsx` | alias 列表与添加表单 |
| `skills` / `loading` | `src/components/settings/SkillsTab.tsx` | Skills 列表加载状态 |
| `hooks` / `loading` | `src/components/settings/HooksTab.tsx` | Hooks 列表加载状态 |
| `servers` / `loading` | `src/components/settings/McpTab.tsx` | MCP 服务列表加载状态 |

### 六个标签的职责边界

- `models`：Provider 增删改、active provider 切换、本地 draft 保存
- `general`：版本信息查看、搜索引擎、日志模式、主题、字体大小
- `aliases`：路径/内外网 URL/脚本别名添加与删除
- `skills`：已加载技能清单展示
- `hooks`：已加载 hooks 清单展示和事件标签翻译
- `mcp`：MCP server 启用/禁用、删除与只读连接信息显示

## 4. 关键决策

- **本地 draft 模式**：编辑不直接写后端——用户必须点"保存"才持久化。避免每次按键都写磁盘
- **脱敏 + 保留原值**：防止未修改的 API Key 被空值覆盖，也防止完整 key 泄露到前端状态树
- **激活独立命令**：`set_active_provider` 单独一个命令——ChatHeader 的模型选择器直接调用，不走 SettingsDialog 的保存流程
- **配置与 j-cli 共享**：读写同一个 `agent_config.json`，j-cli 终端和 j-gui GUI 看到的 Provider 列表一致
- **保存语义分层**：models 走显式保存；general/aliases/mcp 大多是即时写回；skills/hooks 当前只读
- **Agent 治理收口在设置内**：Skills、Hooks、MCP 不再是纯概念占位，而是放在同一设置入口暴露当前 Agent 运行态

## 5. 代码锚点

| 想看什么 | 从哪看 |
|----------|--------|
| SettingsDialog 完整逻辑 | `src/components/settings/SettingsDialog.tsx:1-483` |
| tab 定义与切换 | `src/components/settings/SettingsDialog.tsx:17-26,80-91,183-195` |
| 打开时加载 models/general/aliases | `src/components/settings/SettingsDialog.tsx:52-76` |
| models tab 渲染与保存 | `src/components/settings/SettingsDialog.tsx:93-123,197-287,469-476` |
| general tab 渲染 | `src/components/settings/SettingsDialog.tsx:289-375` |
| aliases tab 渲染 | `src/components/settings/SettingsDialog.tsx:377-444` |
| SkillsTab | `src/components/settings/SkillsTab.tsx:7-53` |
| HooksTab | `src/components/settings/HooksTab.tsx:7-84` |
| McpTab | `src/components/settings/McpTab.tsx:9-77` |
| 脱敏逻辑（后端） | `src-tauri/src/commands/config.rs:32-49` |
| 保存 + 脱敏兼容（后端） | `src-tauri/src/commands/config.rs:52-75` |
| 激活切换（后端） | `src-tauri/src/commands/config.rs:79-89` |
| Config atoms | `src/atoms/config.ts:1-23` |
| IPC 封装 | `src/lib/tauri.ts` |

## 6. 已知约束

- **保存模型与其余标签的语义不统一**：当前只有 models tab 有显式保存和离开确认，其它 tab 以即时写回为主
- **Skills/Hooks 仍是只读**：能看到已加载项，但不能在 UI 内新增、编辑或重载
- **MCP 治理仍不完整**：当前仅支持启用/禁用与删除，不支持在 UI 内新增或编辑 server
- **字体大小未持久化**：字体大小通过 `document.documentElement.style.fontSize` 直接改 DOM，刷新后不会从配置恢复
- **模型保存不做连通性校验**：保存 provider 时不会测试 API Base、Key 或模型是否可用

## 7. 变更日志

- `2026-05-09`：同步六标签结构、通用/别名/Skills/Hooks/MCP 真实实现、即时写回语义和剩余边界，移除“只有 models tab 实现”的过时描述。

## 8. 相关文档

- `compound/2026-05-08-decision-j-gui-frontend-stack.md` — 前端技术栈
- `compound/2026-05-08-decision-j-gui-ui-architecture.md` — UI 整体架构
- `docs/api/settings-components.md` — 设置组件参考层
- `requirements/j-gui-personalization.md` — 承载的能力需求
