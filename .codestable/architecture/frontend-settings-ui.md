---
doc_type: architecture
slug: frontend-settings-ui
scope: j-gui 前端设置界面——SettingsDialog + SettingsPanel + 10 标签页体系
summary: SettingsDialog 是 Radix Dialog 模态浮窗，由 SettingsPanel 编排 10 个标签页（通用/模型配置/提示词管理/别名管理/Hooks/YAML 配置/Agent 配置/Chat 工具/外观/关于）。每个标签页独立组件，共享一套设置原语（primitives）库。通道配置（ChannelForm）支持创建/编辑/auto-save/测试连接/从供应商拉取模型。MCP 服务器要求测试成功后才能启用。
status: current
last_reviewed: 2026-05-10
tags: [frontend, settings, config, channel, provider]
depends_on: []
implements: [j-gui-personalization]
---

# Settings UI — 前端设置界面

## 1. 定位与受众

SettingsDialog 是 j-gui 的设置浮窗，聚合全部用户可配置项：模型渠道管理、通用偏好、系统提示词、Agent 工作区（Skills/MCP/内置工具）、Chat 工具凭据、外观主题、关于与环境检测。

**架构分层**：

```
SettingsDialog (Radix Dialog shell)
  └── SettingsPanel (编排 + 左导航 + 内容区)
        ├── GeneralSettings     — 用户档案 + 通知 + 归档 + 消息置顶
        ├── ChannelSettings     — 渠道 CRUD + Agent 供应商开关
        │     └── ChannelForm   — 创建/编辑表单 (auto-save + 测试连接 + 拉取模型)
        ├── PromptSettings      — 系统提示词 CRUD + 追加设置
        ├── AliasSettings       — 别名管理 (path/inner_url/outer_url/script)
        ├── HooksSettings       — Hooks 列表查看 (按事件分组)
        ├── YamlConfigSettings  — 全局 YamlConfig 编辑器
        ├── AgentSettings       — Agent 工作区: Skills / MCP / 内置工具
        │     └── McpServerForm — MCP 创建/编辑表单 (测试-启用 严格模式)
        ├── ToolSettings        — 联网搜索 / Nano Banana / 自定义工具
        ├── AppearanceSettings  — 主题模式 + 特殊风格
        └── AboutSettings       — 版本 + 环境检测
```

**受众**：feature-design（了解设置模块边界）、新人上手（理解配置读写流程）。

## 2. 结构与交互

### 2.1 整体布局

```
SettingsDialog (模态, 85vw × 85vh)
  └── SettingsPanel
        ├── Header — 当前标签名 + X 关闭按钮
        ├── LeftNav (160px)
        │     ├── 通用设置     (Settings icon)
        │     ├── 模型配置     (Radio icon)
        │     ├── 提示词管理   (BookOpen icon)
        │     ├── 别名管理     (Link icon)
        │     ├── 钩子管理     (Webhook icon)
        │     ├── YAML 配置    (FileCode icon)
        │     ├── Agent 配置   (Plug icon)          [Agent mode only]
        │     ├── Chat 工具    (Wrench icon)
        │     ├── 外观设置     (Palette icon)
        │     └── 关于         (Info icon)          [红点标记有更新]
        └── ScrollArea (content)
              └── <active tab component>
```

- 左导航仅在 `channels` 标签有 dirty 状态时拦截切换：弹出 AlertDialog 确认
- 关闭时同样检查 dirty 状态，通过 `channelFormDirtyAtom` 实现

### 2.2 标签页详情

#### 通用设置 (GeneralSettings)
- **用户档案区块**：头像（emoji 选择器 + 图片上传）、用户名（内联编辑）
- **通用设置区块**：语言（只读展示简体中文）、桌面通知（Switch）、通知提示音（Switch）、任务完成/权限审批/计划审批音效选择器（Select + 试听按钮）、自动归档（Select: 禁用/7/14/30/60天）、消息悬浮置顶条（Switch）
- **数据流**：用户档案走 `ipc.updateUserProfile()`（`src/lib/ipc.ts`）；通知/声音走 `@/atoms/notifications`；归档走 `ipc.getSettings() / ipc.updateSettings()`

#### 模型配置 (ChannelSettings)
- **区块一 — 模型配置**：渠道列表（logo + 名称 + 供应商 + 启用模型数 + 编辑/删除/开关） + 添加配置按钮
- **区块二 — Agent 供应商**：从已启用的 Anthropic 兼容渠道（Anthropic / DeepSeek / Kimi）中选择多个作为 Agent 供应商
- 创建/编辑时切换到 ChannelForm 子视图（替代列表）
- **删除确认**：AlertDialog 弹窗确认
- **数据流**：`ipc.listChannels() / ipc.createChannel() / ipc.updateChannel() / ipc.deleteChannel()`

#### 模型配置表单 (ChannelForm)
- 完整表单：名称、供应商类型、Base URL、API Key（密码显隐）、启用开关
- **模型管理**：已启用模型列表（置顶）、可用模型搜索过滤、从供应商拉取模型列表
- **连接测试**：直接使用表单当前值测试，不依赖保存
- **Auto-save（编辑模式）**：600ms 防抖，字段变化自动调用 `ipc.updateChannel()`
- **新建模式**：手动点击"创建"按钮，支持退出拦截弹窗
- **dirty 同步**：通过 `channelFormDirtyAtom` 通知 SettingsPanel 拦截导航
- **API Key 解密**：编辑模式下通过 `ipc.decryptApiKey(channel.id)` 加载明文

#### 提示词管理 (PromptSettings)
- **提示词列表**：显示所有系统提示词（内置 + 自定义），hover 时显示设为默认/删除按钮
- **编辑区**：选中后下方显示名称 + 内容编辑器（内置只读）
- **防抖自动保存**：500ms 防抖，通过 `ipc.updateSystemPrompt()`
- **增强选项**：追加日期时间和用户名开关
- **数据流**：`ipc.getSystemPromptConfig() / ipc.createSystemPrompt() / ipc.updateSystemPrompt() / ipc.deleteSystemPrompt() / ipc.setDefaultPrompt()`

#### 别名管理 (AliasSettings)
- **分区展示**：按 section 分组展示别名（path / inner_url / outer_url / script），每组以独立表单列出
- **操作**：支持 inline 添加（输入名称 + 值）和删除（确认后删除）
- **数据流**：`ipc.listAliases() / ipc.saveAliases() / ipc.deleteAlias()`

#### 钩子管理 (HooksSettings)
- **只读列表**：以 HookEvent 分组展示所有已注册钩子（名称、类型、超时、onError 策略）
- **展示信息**：每个 hook 展示 label、hookType、timeout（可选）、onError（skip/stop）
- **数据流**：`ipc.listHooks()`（复用 governance `list_hooks` 命令）

#### YAML 配置 (YamlConfigSettings)
- **全局配置编辑**：动态展示 backend `get_config` 返回的所有 section
- **操作**：键值内联编辑、新增键值对（section 内添加）、删除键
- **数据流**：`ipc.getConfig() / ipc.updateConfig()`

#### Agent 配置 (AgentSettings)
- 三子标签（内嵌 Tabs）：Skills / MCP / 内置工具
- **无工作区时**：提示"请先在 Agent 模式下选择或创建一个工作区"
- **Skills**：
  - Master-Detail 视图：左侧按前缀分组的 Skill 列表（可展开折叠）+ 右侧详情面板
  - Detail 面板：元数据编辑（名称/描述内联编辑）+ 说明内容编辑（Markdown 编辑/预览）
  - 操作：删除、拖拽开关、从其他工作区导入、打开目录、同步更新（`hasUpdate` 标记）
  - 通过 Agent 聊天的 AI 配置入口按钮
- **MCP**：
  - MCP 服务器列表（名称 + 类型标签 + 编辑/删除/开关）
  - 通过 Agent 聊天的 AI 配置入口按钮
  - 添加/编辑切换到 McpServerForm
- **内置工具**：只读展示 memory / nano-banana / web-search 的状态，提供跳转到 ToolSettings 的按钮
- **数据流**：`ipc.getWorkspaceMcpConfig() / ipc.getWorkspaceSkills() / ipc.toggleWorkspaceSkill() / ipc.saveWorkspaceMcpConfig() / ipc.importSkillFromWorkspace()`

#### MCP 服务器表单 (McpServerForm)
- 支持三种传输类型：stdio（command/args/env/timeout）、HTTP（url/headers）、SSE（url/headers）
- **严格启用策略**：必须测试连接成功后才能启用，配置变更时自动禁用开关并清空测试结果
- **内置 MCP 引导**：MemOS Cloud 内置服务器的配置提示
- **数据流**：`ipc.testMcpServer() / ipc.getWorkspaceMcpConfig() / ipc.saveWorkspaceMcpConfig()`

#### Chat 工具 (ToolSettings)
- **联网搜索（Tavily）**：API Key 输入（blur 自动保存）、开关、测试连接、引导说明
- **Nano Banana（Gemini 生图）**：API Key / Base URL / Model 输入（blur 自动保存）、开关、测试连接、引导说明
- **自定义工具**：展示 `category === 'custom'` 的工具列表，支持开关和删除
- **数据流**：`ipc.getChatTools() / ipc.getChatToolCredentials() / ipc.updateChatToolCredentials() / ipc.updateChatToolState() / ipc.testChatTool()`

#### 外观设置 (AppearanceSettings)
- **主题模式**：SegmentedControl（浅色/深色/跟随系统/特殊风格）
- **特殊风格**：6 种预设（云朵舞者/晴空碧海/森息晨光/苍穹暮色/森息夜语/莫兰迪夜），带交叠圆形预览
- **界面缩放**：只读提示快捷键操作
- **数据流**：`@/atoms/theme` 的 themeModeAtom / themeStyleAtom，通过 `applyThemeToDOM()` 即时影响 DOM

#### 关于 (AboutSettings)
- **版本信息**：`__APP_VERSION__` 编译常量 + Tauri v2 + React + j-cli 运行时
- **环境检测**：Node.js / Git 版本检测，可重新检查。缺失时显示警告
- **数据流**：`ipc.getSettings() / ipc.checkEnvironment()`

### 2.3 SettingsPanel 导航拦截

SettingsPanel 实现了两处脏数据拦截：

1. 侧边栏标签切换时：如果 channels tab 表单 dirty，弹出 AlertDialog 询问"放弃未保存的更改"
2. 关闭设置（点击 X / Cmd+W）时：同上检查，通过 `settingsCloseRequestedAtom` 接收外部关闭请求

```typescript
// src/components/settings/SettingsPanel.tsx:99-111
const handleTabChange = (tabId: SettingsTab) => {
  if (activeTab === 'channels' && channelFormDirty) {
    setPendingAction({ type: 'tab', tabId })
    return
  }
  setActiveTab(tabId)
}
```

### 2.4 Agent 模式条件渲染

Agent 相关标签（agent / tools）始终显示在导航中，但 AgentSettings 内容在无工作区时展示空状态引导（`src/components/settings/AgentSettings.tsx:192-199`）。

## 3. 数据与状态

### 3.1 核心数据类型

```typescript
// @proma/shared 定义
interface Channel {
  id: string
  name: string
  provider: ProviderType        // 'anthropic' | 'openai' | 'deepseek' | ...
  baseUrl: string
  models: ChannelModel[]
  enabled: boolean
}

interface ChannelModel {
  id: string                    // 模型 ID "claude-opus-4-6"
  name: string                  // 显示名称
  enabled: boolean
}

interface SystemPrompt {
  id: string
  name: string
  content: string
  isBuiltin: boolean
}

interface McpServerEntry {
  type: 'stdio' | 'http' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  enabled: boolean
  isBuiltin?: boolean
  timeout?: number
  lastTestResult?: { success: boolean; message: string; timestamp: number }
}

interface SkillMeta {
  slug: string
  name: string
  description?: string
  enabled: boolean
  version?: string
  hasUpdate?: boolean
  importSource?: { sourceWorkspaceName: string }
}
```

### 3.2 数据层路由

```
前端组件 → lib/ipc.ts (统一IPC封装) → invoke Tauri Command → Rust 后端 → 存储
前端组件 → Jotai atoms ←→ lib/ipc.ts (读时加载，写时即保存)
```

每个标签页独立加载所需数据，无全局 Config 快照（旧架构的 `ProviderInfo` / `agent_config.json` 已废弃）。

### 3.3 Jotai Atoms

| Atom | 文件 | 用途 |
|------|------|------|
| `settingsTabAtom` | `src/atoms/settings-tab.ts:17` | 当前激活标签（默认 channels） |
| `settingsOpenAtom` | `src/atoms/settings-tab.ts:20` | 设置浮窗开关 |
| `channelFormDirtyAtom` | `src/atoms/settings-tab.ts:23` | 渠道表单脏状态（拦截导航） |
| `settingsCloseRequestedAtom` | `src/atoms/settings-tab.ts:26` | 外部关闭请求（Cmd+W） |
| `chatToolsAtom` | `@/atoms/chat-tool-atoms` | 全局 Chat 工具列表（AgentSettings 内置工具区使用） |
| `themeModeAtom` / `themeStyleAtom` | `@/atoms/theme` | 主题模式 / 特殊风格 |
| `userProfileAtom` | `@/atoms/user-profile` | 用户头像/用户名 |
| `notificationsEnabledAtom` / `notificationSoundsAtom` | `@/atoms/notifications` | 通知/声音设置 |
| `channelsAtom` | `@/atoms/chat-atoms` | 渠道列表全局缓存 |
| `promptConfigAtom` | `@/atoms/system-prompt-atoms` | 系统提示词配置 |
| `agentChannelIdAtom` / `agentChannelIdsAtom` | `@/atoms/agent-atoms` | Agent 渠道选择与多供应商 |

### 3.4 保存语义一览

| 标签页 | 保存策略 |
|--------|----------|
| GeneralSettings | 即时写回（blur / immediate） |
| ChannelSettings (list) | 即时写回（toggle） |
| ChannelForm (edit) | auto-save 600ms 防抖 |
| ChannelForm (create) | 手动点"创建"按钮 |
| PromptSettings | auto-save 500ms 防抖 |
| AgentSettings | 即时写回（toggle）+ 手动保存（表单提交） |
| McpServerForm | 手动提交（带测试-启用校验） |
| ToolSettings | blur 即时保存（凭据）+ 即时（toggle） |
| AppearanceSettings | 即时应用 + 持久化 |

## 4. 组件目录结构

```
src/components/settings/
├── index.ts                          # 模块导出索引
├── SettingsDialog.tsx                # ~68 行 — Radix Dialog 壳
├── SettingsPanel.tsx                 # ~171 行 — 面板编排 + 左导航
├── GeneralSettings.tsx               # ~375 行 — 通用设置
├── ChannelSettings.tsx               # ~352 行 — 模型配置
├── ChannelForm.tsx                   # ~752 行 — 渠道编辑表单
├── PromptSettings.tsx                # ~322 行 — 系统提示词管理
├── AliasSettings.tsx                 # ~286 行 — 别名管理
├── HooksSettings.tsx                 # ~142 行 — 钩子管理（只读列表）
├── YamlConfigSettings.tsx            # ~463 行 — 全局 YamlConfig 编辑器
├── AgentSettings.tsx                 # ~1485 行 — Agent 配置 (Skills/MCP/内置工具)
├── McpServerForm.tsx                 # ~438 行 — MCP 服务器表单
├── ToolSettings.tsx                  # ~560 行 — Chat 工具配置
├── AppearanceSettings.tsx            # ~215 行 — 外观设置
├── AboutSettings.tsx                 # ~89 行 — 关于
└── primitives/
    ├── index.ts                      # 导出索引
    ├── SettingsUIConstants.ts        # 样式 token 常量
    ├── SettingsCard.tsx              # 卡片容器（自动分隔线）
    ├── SettingsRow.tsx               # 标签+控件行布局
    ├── SettingsSection.tsx           # 区块分组（标题+描述+操作插槽）
    ├── SettingsToggle.tsx            # Switch 封装
    ├── SettingsInput.tsx             # Input 封装
    ├── SettingsTextarea.tsx          # Textarea 封装
    ├── SettingsSecretInput.tsx       # 密码输入（内置显隐切换）
    ├── SettingsSelect.tsx            # Select 下拉封装
    └── SettingsSegmentedControl.tsx  # 分段选择器
```

## 5. 关键决策

- **组件提取 + 原语库**：每个标签页独立组件，公共布局/控件抽到 `primitives/` 统一复用。避免 SettingsDialog 膨胀（旧架构 483 行 → SettingsPanel 目前 171 行）
- **auto-save + 防抖**：编辑模式下的表单变更不立即写磁盘，而是在字段变化后启动防抖定时器，避免每次按键都触发 IPC。防抖时间统一 500-600ms
- **表单 dirty 导航拦截**：`channelFormDirtyAtom` 全局标志位，SettingsPanel 监测后弹出"放弃未保存更改"确认对话框，防止意外丢失编辑内容
- **MCP 测试-启用严格模式**：添加/编辑 MCP 服务器时必须先测试连接成功，才能启用开关。配置变更时自动禁用开关并清空旧测试结果。此策略防止无效配置上线
- **API Key 解密隔离**：渠道编辑模式下，API Key 通过 `ipc.decryptApiKey()` 单独请求解密，避免明文 Key 在列表接口中传输
- **Blur 即时保存凭据**：ToolSettings 的 API Key/URL 等凭据在 blur 事件中触发保存，平衡实时性和性能
- **Agent 配置与 Chat 工具分离**：AgentSettings 管理工作区级配置（Skills/MCP），ToolSettings 管理全局 Chat 工具凭据（Tavily/Nano Banana）。AgentSettings 内置工具区只是一个只读状态展示，需跳转到 ToolSettings 进行配置
- **从供应商拉取模型**：ChannelForm 支持点击按钮从供应商 API 拉取可用模型列表，合并到当前模型列表中（新模型默认不勾选）
- **特殊风格主题**：6 种预设配色的双层视觉风格，通过 `applyThemeToDOM()` 即时应用 CSS 变量到 DOM
- **SettingsTab 类型联盟**：`'general' | 'channels' | 'appearance' | 'about' | 'agent' | 'prompts' | 'tools' | 'alias' | 'hooks' | 'yaml'`，settingsTabAtom 默认值为 'channels'

## 6. 代码锚点

### 6.1 当前架构

| 想看什么 | 从哪看 |
|----------|--------|
| SettingsDialog 壳 | `src/components/settings/SettingsDialog.tsx:44-68` |
| SettingsPanel 编排 | `src/components/settings/SettingsPanel.tsx:80-162` |
| tab 定义与切换 | `src/components/settings/SettingsPanel.tsx:32-44,63-76,99-103` |
| 导航拦截（dirty） | `src/components/settings/SettingsPanel.tsx:87-111,148-159` |
| Agent 条件渲染 | `src/components/settings/AgentSettings.tsx:192-199` |
| 通用设置 | `src/components/settings/GeneralSettings.tsx:59-327` |
| 模型配置列表 | `src/components/settings/ChannelSettings.tsx:36-265` |
| 模型配置表单 | `src/components/settings/ChannelForm.tsx:130-751` |
| 提示词管理 | `src/components/settings/PromptSettings.tsx:32-240` |
| Agent 配置（Skills/MCP/内置工具） | `src/components/settings/AgentSettings.tsx:123-583` |
| Skills Master-Detail | `src/components/settings/AgentSettings.tsx:630-958` |
| MCP 表单 | `src/components/settings/McpServerForm.tsx:75-438` |
| Chat 工具配置 | `src/components/settings/ToolSettings.tsx:466-479` |
| 联网搜索配置 | `src/components/settings/ToolSettings.tsx:29-194` |
| Nano Banana 配置 | `src/components/settings/ToolSettings.tsx:196-389` |
| 外观设置 | `src/components/settings/AppearanceSettings.tsx:101-169` |
| 关于页面 | `src/components/settings/AboutSettings.tsx:74-88` |
| Settings atoms | `src/atoms/settings-tab.ts:1-27` |
| 设置原语 — 卡片 | `src/components/settings/primitives/SettingsCard.tsx:22-43` |
| 设置原语 — 行 | `src/components/settings/primitives/SettingsRow.tsx:25-44` |
| 设置原语 — 区块 | `src/components/settings/primitives/SettingsSection.tsx:22-42` |
| 设置原语 — 开关 | `src/components/settings/primitives/SettingsToggle.tsx:26-48` |
| 设置原语 — 输入 | `src/components/settings/primitives/SettingsInput.tsx:36-71` |
| 设置原语 — 密码输入 | `src/components/settings/primitives/SettingsSecretInput.tsx:30-70` |
| 设置原语 — 选择 | `src/components/settings/primitives/SettingsSelect.tsx:42-73` |
| 设置原语 — 分段选择 | `src/components/settings/primitives/SettingsSegmentedControl.tsx:33-70` |
| 设置原语 — 样式常量 | `src/components/settings/primitives/SettingsUIConstants.ts:1-28` |

### 6.2 旧架构（已删除/重写，供考古）

| 旧文件/组件 | 状态 |
|-------------|------|
| `ModelsTab.tsx` | 删除，功能由 `ChannelSettings + ChannelForm` 替代 |
| `GeneralTab.tsx` | 删除，由 `GeneralSettings` 替代（架构完全不同） |
| `AliasTab.tsx` | 删除，别名功能整体移除 |
| `ToolsTab.tsx` | 删除，由 `ToolSettings` 替代 |
| `SkillsTab.tsx` | 删除，由 `AgentSettings` 的 Skills 子标签替代 |
| `HooksTab.tsx` | 删除，hooks 功能整体移除 |
| `McpTab.tsx` | 删除，由 `AgentSettings` 的 MCP 子标签 + `McpServerForm` 替代 |
| `atoms/config.ts` | 删除，`ProviderInfo` 类型废弃 |
| `atoms/sessions.ts` | 删除 |
| `atoms/sidebar.ts` | 删除 |
| `atoms/tabs.ts` | 删除 |
| `atoms/toast.ts` | 删除 |

## 7. 已知约束

- **SettingsPanel 与 SettingsDialog 职责分离不彻底**：`SettingsDialog.tsx` 只有 68 行，但 `SettingsPanel.tsx` 承担了编排 + 导航拦截双重职责
- **AgentSettings 体量过大**：~1485 行，是最大的标签页，内部包含三个子标签（Skills / MCP / 内置工具）且 Skills 子标签包含 Master-Detail 视图。如 Skills 列表进一步膨胀应考虑拆出独立文件
- **Skills 不支持拖拽排序**：当前只支持 toggle 启用/禁用，不支持拖拽调整 Skill 优先级
- **MCP 不支持 inline 编辑**：MCP 服务器编辑必须在 McpServerForm 全屏表单中进行，不支持列表行内编辑
- **提示词防抖可能丢失编辑**：如果用户在 500ms 防抖窗口内连续编辑，只有最后一次会保存成功。极端情况（用户编辑后立即关闭页面）仍可能丢编辑
- **搜索凭据存明文**：Tavily / Nano Banana 的 API Key 通过 `ipc.updateChatToolCredentials()` 传递，后端存储是否加密取决于 Rust 端实现
- **字体大小不可配置**：外观设置中字体大小通过浏览器原生缩放（⌘+ / ⌘-）控制，不在设置 UI 中提供滑块
- **About 更新标记需要原子联动**：`hasUpdateAtom` 通过 `about` 标签的红点标记展示，如果 updater 模块未初始化可能不显示
- **Agent 模式依赖工作区**：没有工作区时 Agent 配置页无法展示任何内容，但入口始终可见

## 8. 变更日志

- `2026-05-10`：全面重写。从旧的 6 标签架构（models/general/aliases/skills/hooks/mcp）升级为 10 标签架构（general/channels/prompts/alias/hooks/yaml/agent/tools/appearance/about）。旧配置文件 `atoms/config.ts` 废弃，改为 Channel + @proma/shared 类型体系。新增 primitives 原语库（10 个组件）、ChannelForm 表单（auto-save/test/fetch-models）、McpServerForm（测试-启用严格模式）、ToolSettings 工具凭据管理。SettingsDialog 简化为壳组件，编排移至 SettingsPanel。导航拦截 + dirty 检测取代旧架构的本地 draft 模式。
- `2026-05-09`：同步六标签结构、通用/别名/Skills/Hooks/MCP 真实实现、即时写回语义和剩余边界，移除"只有 models tab 实现"的过时描述。（此版本描述的内容已被 05-10 全面重写覆盖）

## 9. 相关文档

- `compound/2026-05-08-decision-j-gui-frontend-stack.md` — 前端技术栈
- `compound/2026-05-08-decision-j-gui-ui-architecture.md` — UI 整体架构
- `compound/2026-05-08-decision-rust-coding-conventions.md` — Rust 编码规约
