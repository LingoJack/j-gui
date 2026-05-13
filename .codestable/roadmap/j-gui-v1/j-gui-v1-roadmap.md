---
doc_type: roadmap
slug: j-gui-v1
status: active
created: 2026-05-10
last_reviewed: 2026-05-13
tags: [tauri, desktop, j-cli, chat, agent, proma, closure]
related_requirements:
  - j-gui-ai-interaction
  - j-gui-session-management
  - j-gui-personalization
related_architecture:
  - ARCHITECTURE
---

# j-gui v1 — 能力闭环与 Proma 追平/超越路线图

## 1. 背景

`j-gui` 当前已经不是脚手架，而是一个可运行的桌面 AI 工作台：Chat 主链路已闭环，Agent 主链路也已具备真实可用性，设置、搜索、三栏布局、多标签和工作区面板都已存在。

但 2026-05-11 的三份 explore 和 2026-05-12 的实际体验反馈也说明了一个更关键的事实：

- 现在的主要问题已经不只是“少数高价值链路还没真正收口”，还包括大量 UI 细节、交互摩擦、状态反馈和功能边界不顺
- 现在的主要风险不是“没有能力”，而是“roadmap / 文档 / UI / 后端契约对完成度的表述不一致”
- 现在距离“可信日常 App”的差距，不只在 Agent 历史回放、搜索内容闭环、ToolSettings 子链路、协议真相和回归门禁，也在真实运行时的产品摩擦和可用性细节

因此，这份 roadmap 不再沿用“有 UI 就算 done”的口径，也不再把“后端闭环 done”直接等同于“产品体验可信”；后续必须按**真实能力闭环 + 产品体验硬化**双口径推进。

## 2. 目标与明确不做

### 本 roadmap 的目标

1. 把 `j-gui` 从“多数功能可见”推进到“关键能力闭环、低 Bug、可长期使用”
2. 把当前“功能能跑但细节拙劣”的体验问题收口成可复现、可修复、可验收的产品硬化主线
3. 在工程上争取超越 Proma 的部分，不靠堆更多表面功能，而靠：
   - 更少的伪闭环
   - 更清晰的协议真相
   - 更强的回归门禁
   - 更少的日常使用摩擦
   - 真正可用于“自己开发自己”的工作流

### 这次 update 明确覆盖

- Chat / Agent 的前后端协议真相校准
- Agent 会话工作台闭环：历史回放、恢复、继续工作
- 搜索从标题搜索升级到真实内容搜索闭环
- Settings 中 ToolSettings / Chat Tools 的真实运行时闭环
- 低 Bug 所需的错误暴露、回归测试、验收证据和 dogfooding 门禁
- Chat / Agent / Search / Settings / 文件上下文 / 布局细节的产品摩擦审计与体验硬化
- 快捷键、侧边栏性能、桌面壳层图标与窗口控制这类“真实会绊住日常使用”的桌面级问题
- Agent 对话框里的后端切换语义、Skills / MCP / Hooks 的全局/工作区治理可见性，以及 System Prompt 的真实运行时语义
- 关于/更新与环境配置页面的运行时真相：`j-gui` / `j-cli` / 本地 `j` CLI / 本机 Claude Code CLI 版本、Node/Git/Bun、Git Bash/WSL/PowerShell、推荐 shell、失败原因、fallback 与重检入口
- `src/` 按领域收拢的重组设计与落地，而不是继续放任 `LeftSidebar` / `main.tsx` / Settings mega-surface 横向变胖
- Proma parity / 后端吸收项从 explore 结论推进到可执行主线：哪些能力值得迁、先迁哪层、哪些边界不能回退
- 为后续移动端做边界澄清：先保持桌面主线闭环，再决定共享 core、原生移动 UI 与 repo 目录演进

### 明确不做

- 先扩更多 Proma 之外的新表面功能来掩盖核心闭环问题
- 用远程访问、双后端或新 runtime 工作掩盖当前桌面主链路体验问题
- 把 MCP 扩到当前 Chat 主链路
- 多用户协作、云同步、多人工作区
- 移动端优先于桌面端闭环
- 在 GUI 内发明一套脱离 `j-cli` / Agent runtime 的平行治理模型

## 3. 状态语义

这份 roadmap 只允许按下面口径理解状态：

- `done`：代码已存在，且当前代码快照下已经能证明这条链路闭环，不只是 UI 存在
- `in-progress`：已有部分实现，但仍存在协议断点、回放缺口、后端未证实或验收未完成
- `planned`：需求已明确，但当前代码快照还不能证明关键实现已经成立
- `dropped`：明确不再作为独立条目推进，但历史理由保留

换句话说，**`done` 不再表示“做过”，而表示“现在仍然闭环”**。

## 4. 模块拆分

### 4.1 Runtime Contract Closure

- **职责**：统一 Chat / Agent 的请求、流式事件、中断回传和错误表面，消除前后端“字段都在、但不走同一协议”的状态。
- **为什么先做**：如果契约层不稳，后续的 Agent 回放、搜索、ToolSettings 都会继续建立在半闭环之上。

### 4.2 Agent Workbench Closure

- **职责**：把 Agent 从“当前会话可用”推进到“历史会话可信、可恢复、可继续工作”的长期工作台。
- **关键点**：历史回放、session replay、恢复后的状态一致性、超时/中断/重试可观测。

### 4.3 Chat / Search Closure

- **职责**：保持 Chat 已有闭环，同时把搜索能力从“标题入口存在”推进到“内容命中可定位、可打开、可复盘”。
- **关键点**：不要为了追平表面 UI 而继续容忍搜索后端只靠 fallback 包装。

### 4.4 Settings / Governance Closure

- **职责**：把 Settings 里最容易暴露伪闭环的子链路收口，尤其是 Chat Tools / ToolSettings。
- **边界**：Skills / Hooks / MCP 继续锚定当前 runtime 能力，不让 UI 先发明超前模型。

### 4.5 Quality / Evidence / Dogfooding

- **职责**：建立“极少 Bug”和“可以自己开发自己”所需的验证层。
- **关键点**：让 roadmap、验收、文档和真实代码重新同源，而不是互相漂移。

### 4.6 Product Experience Hardening

- **职责**：把“能跑但不好用”的体验问题转成可复现、可排序、可验收的修复队列。
- **关键点**：先用真实运行、截图/录屏、复现步骤建立问题事实，再按核心工作流、Settings、Agent 工作台、视觉布局分流修复；不允许用新增远程/后端能力掩盖桌面主链路体验问题。

### 4.7 Desktop Shell / Shortcut / Structure Prep

- **职责**：收口桌面壳层真问题，包括全局快捷键/缩放快捷键真相、侧边栏性能、应用图标与窗口控制；同时为未来移动端演进保留正确的工程边界。
- **关键点**：不把当前根应用直接硬拆成多 crate；先按领域拆 `src/` / `main.tsx` / mega-component，等移动端真正启动时再演进到 `apps/desktop` + `apps/mobile-*` 风格。

### 4.8 Proma Capability Absorption Prep

- **职责**：把 Proma explore 里已证实值得迁的后端编排能力，转成 `j-gui` Rust 侧的明确吸收顺序与落地边界。
- **关键点**：优先补 CLI backend 的恢复状态机、事件语义、存储防线、环境探测和磁盘治理；不把 Proma 的 Electron 宿主结构或 workspace/skills/MCP 自管平台整体搬回当前 runtime。

## 5. 接口契约

### 5.1 Chat 请求契约必须闭环

当前前端已经组织出增强输入，但后端仍停在最小命令层。后续 feature-design 必须以统一请求体为硬约束：

```ts
type ChatSendRequest = {
  sessionId: string
  content: string
  systemMessage?: string | null
  thinkingEnabled?: boolean
  attachments?: FileAttachment[]
}
```

约束：

- 前端 `ChatView` 组织出的字段，后端要么真实消费，要么从 UI 上移除，不允许长期“组装但不生效”
- 工具开关当前不再通过单次请求透传；现行真相是 `ToolSettings / ToolSelector -> list_chat_tools / set_tool_enabled -> 全局配置 -> Chat runtime`
- `send_message` 的输入口径必须与 `ipc.ts` 暴露口径一致
- 流式事件字段名必须前后端一致，不允许一端写 `content`、另一端按 `delta` 读
- Chat runtime 必须先做协议选路，再决定 endpoint；不同 `provider/base URL` 不能再一律硬打 `/chat/completions`
- `test_channel_input` 与真实 Chat 发送必须共享同一套协议解析逻辑，不允许“测试连接通过但真实聊天 404”
- 首批必须把 `openai-chat-completions`、`openai-responses`、`anthropic-messages` 作为明确受支持的协议族写进实现真相

### 5.2 Agent 中断必须只保留一条真协议

统一入口是：

```ts
respondAgentInterrupt({
  sessionId: string
  interruptId: string
  response: InterruptResponse
})
```

约束：

- `respond_permission` / `respond_ask_user` 只能作为兼容层临时存在，不能继续作为主口径写进新 feature
- 前端只允许围绕统一中断模型建 UI：`permission | ask_user | plan`
- 字段名必须统一，不能再出现前端传 `response`、后端收 `request` 这类错位

### 5.3 Agent 历史回放要以“长期工作台”口径设计

最小闭环不是“能 list session”，而是：

- `list_agent_sessions`
- `get_agent_session`
- `get_agent_session_sdk_messages` 或等价的真实 replay 数据源
- `fork_agent_session`
- `rewind_agent_session`
- `move_agent_session_workspace`

约束：

- 历史回放必须能恢复出用户真正能继续工作的视图，不是只把 meta 打开
- replay 数据源应优先对齐 SDK message / timeline 真相，而不是前端自己猜装
- 允许首版仍不恢复底层隐藏上下文，但必须明确告诉用户恢复边界

### 5.4 搜索必须支持内容命中锚点

搜索契约必须至少支持：

```ts
type SearchScope = "title" | "content"
type SearchMode = "chat" | "agent" | "all"

type SearchResult = {
  sessionId: string
  mode: SearchMode
  title: string
  updatedAt: number
  matchKind: SearchScope
  preview?: string
  messageAnchorId?: string
}
```

约束：

- 标题搜索和内容搜索都要有明确后端命令，不接受“前端 fallback + 后端未注册”作为闭环
- 打开结果时必须能落到正确会话与正确消息上下文

### 5.5 ToolSettings 必须从“配置页存在”升级到“运行时可证实”

最小契约：

- `list_chat_tools`
- `set_tool_enabled`
- ToolSettings / ToolSelector 共用同一套后端工具真相
- Chat 发送链路不能再透传后端未消费的 `enabledToolIds`
- 凭据编辑、自定义工具、连通性测试等未接通能力必须显式隐藏或标 unsupported

约束：

- ToolSettings 的每个开关都必须能映射到真实 runtime 行为
- 当前 roadmap 不再把工具配置 CRUD 当作本项最低完成标准；若未来要支持，需单独立项或补 design
- 如果某项能力当前只有 UI，不允许再在 roadmap 中写成 done

### 5.6 低 Bug 的门禁必须体现在闭环验证上

后续 feature-design / acceptance 都必须至少覆盖：

- 端到端主链路验证，而不是只跑单元测试
- 关键断点的失败路径可见：协议错位、工具配置错误、session replay 失败、搜索空命中
- 回归检查要直接锚定当前三个高风险域：
  - Agent history replay
  - message-content search
  - ToolSettings runtime closure

### 5.7 产品体验硬化必须以问题台账为输入

新增体验硬化 feature 的共同输入是产品摩擦台账，而不是抽象的“优化 UI”。台账条目必须至少包含：

```ts
type ProductFrictionFinding = {
  area: "chat" | "agent" | "search" | "settings" | "tabs" | "file-context" | "layout"
  severity: "P0" | "P1" | "P2"
  kind: "ui-detail" | "interaction" | "state-feedback" | "functional-break" | "visual-layout"
  reproduction: string[]
  expected: string
  actual: string
  evidence?: string
  targetRoadmapItem?: string
}
```

约束：

- 后续 `core-workflow-ux-hardening`、`settings-experience-hardening`、`agent-workbench-polish`、`visual-layout-polish` 必须消费这份台账，不允许凭空发明“看起来应该优化”的任务
- `P0/P1` 体验问题优先于 `agent-engine-jagent`、远程接入等增强项
- 每个修复项必须能回指至少一个复现步骤、截图/录屏或明确代码锚点
- 只处理当前桌面主链路的使用摩擦，不在硬化阶段新增大表面功能、换肤或重写设计系统
- 若某个体验问题本质是后端协议断点，应回到对应闭环 feature 或单独 issue，不在纯视觉打磨项里掩盖

## 6. 子 Feature 清单

### Phase A：基础底座与已证实闭环（已完成）

这些条目保留为历史事实，但不再承担“未来方向”角色：

- Channel 数据模型统一
- Kernel trait 抽象层
- Chat 主链路消息持久化
- 基础错误提示与边界处理
- Alias / YAML / System Prompt / Channel 管理等基础配置面
- 基础文件浏览与打包能力

### Phase B：P0 能力闭环

这一阶段决定 `j-gui` 是否能从“多数功能可见”升级为“真正可信的工作台”。

1. `stream-protocol-unify`
   - 统一 Chat / Agent 的事件字段、输入字段、中断响应口径
   - 收口 Chat runtime 的协议选路，让测试连接与真实发送同口径
   - 首批补齐 OpenAI Responses，终结固定 `/chat/completions` 的单一路径假设
   - 去掉旧协议长期并存状态
2. `agent-history-replay-closure`
   - 把 Agent 历史回放、fork、rewind、move 等工作台操作补到真实后端闭环
3. `agent-runtime-stability-recovery`
   - 收口超时、重试、中断、恢复后的状态一致性

### Phase C：P1 体验与治理闭环

这一阶段解决“看起来像完整能力，但一踩就露馅”的问题。

4. `governance-bidirectional-sync`
   - 把 workspace 级治理命令与真实持久化补齐
5. `toolsettings-runtime-closure`
   - ToolSettings / Chat Tools 从 UI 完成推进到 runtime 闭环
6. `search-content-closure`
   - 从标题搜索升级到消息内容搜索与命中锚点打开
7. `session-archive`
   - 在搜索与回放都可信后，再补会话归档与归档视图一致性

### Phase D：P1 质量与 Proma 证据收口

8. `runtime-observability-gates`
   - 给关键闭环加上错误暴露、回归测试、验收门禁
9. `proma-parity-evidence-pass`
   - 用真实截图、录屏、验收记录把“追平 Proma”从口头判断变成证据判断
10. `tdd-coverage`
   - 从“已有不少测试”升级到“能真正挡住高价值回归”

### Phase E：P0/P1 产品体验硬化

这一阶段承认当前主要风险已经从“有没有闭环”扩展到“闭环能不能被用户舒服、稳定、可理解地使用”。

11. `product-friction-audit`
   - 按 Chat / Agent / Search / Settings / Tabs / File Context / Layout 真实运行审计，输出带复现步骤和证据的摩擦台账
12. `core-workflow-ux-hardening`
   - 收口 Chat / Agent 日常主路径的输入、停止、重试、错误提示、滚动、焦点、快捷键和恢复体验
13. `settings-experience-hardening`
   - 让 Settings 中保存、失败、unsupported、凭据、工具状态和来源提示都能被用户理解
14. `agent-workbench-polish`
   - 打磨 timeline、权限请求、工具调用、文件上下文、停止/继续工作和历史恢复的可读性与可操作性
15. `visual-layout-polish`
   - 集中处理布局密度、溢出、按钮状态、滚动区域、文本截断、焦点态和响应式问题
16. `shortcut-system-hardening`
   - 把快捷键从“文案写了、局部好像能用”收口到“前后端都真实注册、不会落到浏览器默认行为、缩放快捷键可验证”
17. `sidebar-performance-hardening`
   - 继续按 explore 证据拆 LeftSidebar / SessionListItems / main 壳层订阅，解决展开收起仍然不够丝滑的结构性卡顿
18. `desktop-shell-platform-polish`
   - 应用图标切到 J logo，并按平台收口窗口控制：Windows 自定义最小化/最大化/关闭，macOS 保留系统红绿灯与 overlay/titlebar 能力
19. `agent-backend-switch-ux-hardening`
   - 把 Agent 输入区里的 `Claude SDK / JAgent` 明确收口为“直接切 Agent 后端模式”的交互，不再和模型供应商设置混成一件事
   - 同步补齐切换中的状态反馈、失败回滚、禁用态和当前模式说明，避免“按钮像 Provider，实际是 backend mode”的语义误导
20. `agent-governance-surface-hardening`
   - 着重增强 Skills / MCP / Hooks 外部工具治理面：全局/工作区来源可见性、导入与启停反馈、跨来源识别、Proma/Codex 风格的发现与管理体验
   - 保持 `GovernanceKernel` + `j-cli` 数据边界，不把 Proma 的自管工作区平台整体照搬回来
21. `system-prompt-runtime-hardening`
   - 把系统提示词从“列表 + 内置只读 + 一个增强开关”推进到真实可控：默认值可编辑/覆写、恢复默认、默认提示词本地化 truth、增强选项后端语义可证实
   - 不允许继续存在“界面能切，但用户不知道后端到底有没有消费”的提示词增强项
22. `about-update-surface-refresh`
   - 把 `关于/更新` 收口为稳定的产品信息页：`j-gui` 版本、内嵌 `j-cli` crate 版本、本地 `j` CLI、实际被 Agent 模式调用的本机 Claude Code CLI 版本、运行时、开源协议、项目地址、软件更新
   - 更新区只保留必要的检查/下载/状态提示，状态色改为中性而不是成功绿；不照搬 Proma 的版本历史/更新中心 UI
23. `environment-configuration-surface`
   - 单独提供 `环境配置` 页面：让用户显式选择 Shell（PowerShell / CMD / Git Bash / WSL），并展示当前可用性、fallback 规则、推荐 shell 与失败原因
   - Node 只按“安装方式/扩展工具链相关能力”展示，不再作为统一硬前提；需要明确区分 `j-gui` 本体、Claude Code CLI、npm 安装链路和 Shell tool 能力
24. `dogfooding-blocker-burn-down`
   - 优先清零真实使用中迫使用户退回外部终端或手工补救的高频阻塞

### Phase F：P2 自我开发闭环与超越 Proma

25. `proma-backend-capability-absorption`
   - 把现有 Proma 后端复盘落成 `j-gui` 的可执行吸收主线：事件语义补齐、CLI backend 恢复状态机、SDK transcript 防膨胀、环境探测与磁盘治理
   - 明确哪些能力只做 parity，哪些能力要先在 CLI backend 收口后再决定是否共享给 `JAgent`
26. `frontend-domain-reorganization`
   - 按 `shell / chat / agent / settings / bootstrap` 等领域收拢 `src/`，持续拆掉技术分桶与 mega-component，减少 `main.tsx` / `LeftSidebar` / `AgentSettings` 一类横切肥大入口
   - 明确这是“根桌面应用按领域组织”的演进，不是现在先做多 crate 硬拆；未来移动端立项后再演进到 `apps/desktop` + `apps/mobile-*`
27. `agent-engine-jagent`
   - 先把现有 `j-agent` 分支与当前 CLI 主路径的契约差异、缺口和 go/no-go 条件盘清
   - 这项不再默认等于“立即切主后端”，而是先产出是否值得推进、推进到哪一步的明确结论
28. `agent-backend-parity-hardening`
   - 如果继续保留双后端，必须把 backend mode、可观测性、错误暴露和回退边界做成可维护状态
   - 避免出现“设置里可以切，实际没有等价能力或失败后看不出来”的伪多后端
29. `dogfooding-self-development-loop`
   - 把“用自己开发自己”从口号收口成一组明确工作流：打开项目、发起 Chat/Agent、改文件、搜索回溯、恢复历史、继续工作、归档复盘
   - 每条链路都要有成功标准，不能只凭主观体感说“差不多能用了”
30. `remote-access-integration`
   - 复用 `j-cli` 已有的远程能力，把现成的 Web/LAN 远程访问链路接进 `j-gui`，而不是在 GUI 侧重新发明一套远程协议
   - 这项的重点是集成边界、桌面壳内入口、运行时状态与现有 Chat/Agent 工作台的一致性，不是重新设计远程栈

“超越 Proma”的定义在这里不是更多页面，而是：

- 更少的闭环断点
- 更强的恢复能力
- 更可信的搜索与治理
- 更低的自使用摩擦

### Phase G：远期

31. `mobile-remote-experience`
   - 远期才讨论把现有远程访问进一步产品化为更完整的移动端体验，而不是把“手机浏览器能连”直接表述成“移动端产品已成立”
   - 移动端当前优先级定义为“桌面端控制器”：先远程连接桌面端 GUI / Agent 工作台，再讨论更完整的移动交互产品化
   - 如果未来真的扩到 `iOS / Android / HarmonyOS` 原生客户端，优先方向是“共享 Rust core + 各平台原生 UI（SwiftUI / Compose / ArkUI）+ 绑定层”，而不是让当前桌面前端直接跨端硬复用
   - 只有在 `j-cli` 远程能力被 `j-gui` 稳定复用、且桌面主链路 dogfooding 已稳定后，才允许讨论移动端交互重做、认证、会话隔离与公网场景
   - 这项当前只保留边界，不展开实现清单，避免抢占 v1 收尾主线

## 7. 排期与优先级

| 优先级 | 目标 | 说明 |
|---|---|---|
| `P0` | `stream-protocol-unify`、`agent-history-replay-closure`、`agent-runtime-stability-recovery` | 先把协议真相和 Agent 长期工作台收口 |
| `P1` | `governance-bidirectional-sync`、`toolsettings-runtime-closure`、`search-content-closure`、`runtime-observability-gates` | 解决最容易暴露伪闭环的入口 |
| `P1` | `proma-parity-evidence-pass`、`tdd-coverage` | 用证据和门禁收口，而不是再靠主观“done” |
| `P0/P1` | `product-friction-audit`、`core-workflow-ux-hardening`、`settings-experience-hardening`、`agent-workbench-polish`、`visual-layout-polish`、`shortcut-system-hardening`、`sidebar-performance-hardening`、`desktop-shell-platform-polish`、`agent-backend-switch-ux-hardening`、`agent-governance-surface-hardening`、`system-prompt-runtime-hardening`、`about-update-surface-refresh`、`environment-configuration-surface`、`dogfooding-blocker-burn-down` | 先把真实桌面使用体验从“能跑但拙劣”推进到可日常稳定使用，并把 Agent/Settings/运行时环境面的高频误导收口成可信交互 |
| `P2` | `proma-backend-capability-absorption`、`frontend-domain-reorganization`、`agent-engine-jagent`、`agent-backend-parity-hardening`、`dogfooding-self-development-loop`、`remote-access-integration` | 在体验主链路稳定后，再推进后端能力吸收、桌面前端重组、自开发链路和现成远程能力集成 |
| `P4` | `mobile-remote-experience` | 远期保留，不影响当前 v1 闭环判断 |

## 8. 观察项

- `j-gui-desktop-app` 已是历史 roadmap；当前所有后续 feature 应以 `j-gui-v1` 为唯一活动规划入口
- 旧 roadmap 中的部分 `done` 本质上是“UI 已有”或“基线已搭”，不能再直接复用为当前状态证明
- 只要 `Agent history replay`、`message-content search`、`ToolSettings runtime closure` 任一未闭环，就不应声称已经达到“低 Bug 且可自己开发自己”的产品标准
- MCP 仍然保持 Agent runtime 边界，不回流到当前 Chat 主链路
- `search-content-closure` 在 2026-05-12 已进入 feature 落地：Chat 内容搜索正式补上 `search_conversation_messages` 后端命令，后续重点转向验收证据与排序/体验细节，而不再是“命令是否存在”
- `proma-parity-evidence-pass` 完成的是证据框架和真实结论口径，不代表所有体验项已经 Pass；多数区域仍需通过产品摩擦审计继续落地
- `product-friction-audit` 是体验硬化阶段的事实入口；没有复现步骤或证据的“优化 UI”不应直接进入实现
- `core-workflow-ux-hardening` / `settings-experience-hardening` / `agent-workbench-polish` / `visual-layout-polish` 必须消费摩擦台账，不允许把用户没实际踩到的问题包装成硬化任务
- 当前快捷键系统的真问题已经暴露：渲染进程有 `keydown` 注册表，但“显示主窗口”类全局快捷键没有看到已落地的主进程注册；`Ctrl+Shift+P` 落到 Windows 打印页面、`Ctrl++ / Ctrl+- / Ctrl+0` 只存在于提示文案中，都应按真实 bug 进入体验硬化而不是继续按“已支持快捷键”表述
- 左侧边栏卡顿目前仍应视为结构性问题，不是单纯动画曲线问题：`LeftSidebar` / `SessionListItems` 体量、atom 订阅面、折叠展开重渲染范围仍需继续收口
- `desktop-shell-platform-polish` 只处理桌面壳层真问题，不应把 macOS 无法在 Windows 上本机验证的效果包装成“已验证没问题”
- `dogfooding-blocker-burn-down` 提前到体验硬化阶段，优先处理真实使用中迫使用户退回终端或手工补救的阻塞
- Agent 输入区里的 `Claude SDK / JAgent` 当前本质是 `agentBackendMode` 切换，但用户侧语义仍容易误读成“模型供应商设置”；因此它应作为独立的 backend-switch UX 问题处理，而不是继续埋在模型设置文案里
- 当前 `AgentSettings` 虽已有 `scanGlobalSkills()`、`listSkills()`、`listMcpServers()` 等入口，但全局/工作区来源提示、Proma/Codex 式 discoverability、错误反馈和 Hooks 管理仍偏弱，不应再按“全局 Skills/MCP/Hooks 已完整可见”表述
- 当前 `PromptSettings` 的 builtin prompt 仍是只读，增强选项只有 `appendDateTimeAndUserName` 开关与静态文案；“默认提示词可编辑/恢复默认/中文默认值/后端真实消费”都还没闭环
- 当前 `AboutSettings` 仍只有版本、内嵌 j-cli、本地 CLI 和一次更新检查；但当前 Agent 后端实际还依赖本机可执行的 Claude Code CLI，这个版本真相尚未暴露
- Rust 侧已经有 Node/Git/Bun、Git Bash/WSL、recommended shell、失败原因这类运行时探测基础；更合适的方向是把 `关于/更新` 与 `环境配置` 分页：前者负责产品/版本/更新，后者负责运行时与 Shell 真相
- 当前口径不应继续把 Node 写成统一硬前提：对 `j-gui` 当前 Claude Code Agent 模式，真正必需的是本机可运行的 Claude Code CLI；Node 只在 npm 安装 Claude Code 或某些扩展工具链时需要
- Windows Shell 口径也应更新：PowerShell 是 Claude Code 官方支持路径之一，Git Bash / WSL 更适合作为推荐/增强项与可选 fallback，而不是唯一受支持路径
- 关于页当前“已是最新”用成功绿过强，更适合改成类似 Proma 的中性状态色，避免把静态状态文案渲染成操作成功提示
- `src/` 当前仍偏技术分桶，且 `LeftSidebar`、`main.tsx`、`AgentSettings` 等 mega-surface 还在持续承压；“领域化重组设计与落地”应视为明确未完成项，而不是隐含在侧栏性能修复里
- `proma-backend-refactor-candidates` explore 已给出明确的可迁能力与禁搬边界；在这批 Rust 编排能力落地前，不应把更深的 `jagent` parity 误判为已具备现实前提
- `agent-engine-jagent` 的前置判断不是“仓库里已经有 `AgentBackend::JAgent` 分支”，而是“当前分支是否已达到可替代或可长期并存的真实契约完整度”；仅有分支或设置项不算完成前提
- `dogfooding-self-development-loop` 必须以真实日常工作流矩阵为准，而不是以单条 happy path 演示为准；如果产品摩擦阶段仍有 P0/P1 阻塞，就不应提前声称自开发闭环稳定
- `j-cli` 已有远程访问基础能力：`src/command/chat/remote/`、嵌入式 `remote.html`、二维码启动与局域网 Web 连接已存在；`j-gui` 的近阶段任务应是复用与集成，而不是重新发明远程协议
- `mobile-remote-experience` 在本 roadmap 中只保留边界：不在当前周期承诺账号体系、云同步、多人协作，也不把“手机浏览器可连”表述成“移动端产品已成立”
- 如果未来真的进入原生移动端，不建议现在先把当前仓库按“多 crate”硬拆；更合适的方向是先把根应用按领域收拢，随后在移动端立项时演进到 `apps/desktop`、`apps/mobile-ios`、`apps/mobile-android`、`apps/mobile-harmony` + `packages/*` 共享层
- 外部移动端草图可作为需求输入，但像图片里那种 Mermaid 语法未通过的草图不能直接当 roadmap 证据；正式落档前必须先改成可解析版本或改写为正文结构说明

## 9. 当前进度

### 9.1 总体数字

- roadmap 总条目：`56`
- 已完成：`39 / 56`（`69.6%`）
- 进行中：`0 / 56`
- 已规划未开始：`18 / 56`
- 最小闭环项（`minimal_loop: true`）：`5 / 5` 已完成

### 9.2 分阶段进度

| Phase | 条目数 | done | in-progress | planned | 说明 |
|---|---:|---:|---:|---:|---|
| A 基础底座与已证实闭环 | 24 | 24 | 0 | 0 | 基础底座已清空，后续不再作为主要阻塞 |
| B P0 能力闭环 | 3 | 3 | 0 | 0 | P0 主链路已收口，后续不再把 Agent 长期工作台列为 v1 的未完成阻塞 |
| C P1 体验与治理闭环 | 5 | 5 | 0 | 0 | Phase C 已整体收尾，治理真相与此前已完成项都已翻正 |
| D P1 质量与证据收口 | 3 | 3 | 0 | 0 | Phase D 已完成；质量门禁、Proma 证据骨架与 TDD 收口基线都已翻正 |
| E P0/P1 产品体验硬化 | 14 | 4 | 0 | 10 | `product-friction-audit`、`core-workflow-ux-hardening`、`shortcut-system-hardening` 与 `sidebar-performance-hardening` 已完成；后续继续按台账推进桌面壳层、Agent 后端切换、外部工具治理、提示词运行时、关于/更新页、环境配置页、设置区、Agent 工作台与视觉布局 |
| F P2 自我开发闭环 | 6 | 0 | 0 | 6 | 先做 Proma 后端能力吸收与 `src/` 领域化重组，再评估 `jagent` 深化、双后端收口、自开发和远程接入 |
| G 远期 | 1 | 0 | 0 | 1 | 不进入当前 v1 完成度判断 |

### 9.3 当前解锁关系

- `runtime-observability-gates`、`proma-parity-evidence-pass`、`tdd-coverage` 完成后，Phase D 已整体收口
- 当前已直接解锁的下游主线是：
  - `product-friction-audit`
- `product-friction-audit` 已完成；它的直接下游是：
  - `sidebar-performance-hardening`
  - `desktop-shell-platform-polish`
  - `agent-backend-switch-ux-hardening`
  - `agent-governance-surface-hardening`
  - `system-prompt-runtime-hardening`
  - `about-update-surface-refresh`
  - `environment-configuration-surface`
  - `settings-experience-hardening`
  - `agent-workbench-polish`
  - `visual-layout-polish`
  - `dogfooding-blocker-burn-down`
- `core-workflow-ux-hardening` 已完成第一批主路径硬化；当前直接下游是：
  - `sidebar-performance-hardening`
  - `desktop-shell-platform-polish`
  - `agent-backend-switch-ux-hardening`
  - `dogfooding-blocker-burn-down`
- `shortcut-system-hardening` 已完成；它进一步翻正了：
  - 全局显示主窗口快捷键
  - 缩放快捷键
  - 快捷键相关 Tauri ACL 与键位回归测试
  后续直接下游继续是：
  - `desktop-shell-platform-polish`
- `sidebar-performance-hardening` 已完成；它进一步翻正了：
  - LeftSidebar 重新展开时的大列表挂载节奏
  - 快速展开后再收起时的迟到挂载取消
  - Agent 折叠启动后首次展开的上区分栏高度初始化
  后续直接下游继续是：
  - `desktop-shell-platform-polish`
- `agent-governance-surface-hardening`、`system-prompt-runtime-hardening`、`about-update-surface-refresh` 与 `environment-configuration-surface` 收口后，设置区的后续硬化应继续汇入：
  - `settings-experience-hardening`
- `sidebar-performance-hardening`、`desktop-shell-platform-polish` 与设置/治理关键面收口后，再继续推进：
  - `frontend-domain-reorganization`
- `proma-backend-capability-absorption` 完成后，再继续推进：
  - `agent-engine-jagent`
  - `agent-backend-parity-hardening`
  - `dogfooding-self-development-loop`
  - `remote-access-integration`
- `agent-engine-jagent` 仍保持独立评估项；它应建立在 Proma 吸收项和当前体验主链路都已收口的前提上，而不是抢占这些前置工作

### 9.4 收尾视角进度

- Phase B（P0）已完成收尾
  - `stream-protocol-unify`：已完成并已作为当前真相基线
  - `agent-history-replay-closure`：acceptance 已补，联合复验通过，roadmap 已翻 `done`
  - `agent-runtime-stability-recovery`：acceptance 已补，联合复验通过，roadmap 已翻 `done`
- Phase C（P1）已完成收尾
  - `search-content-closure`：已完成
  - `governance-bidirectional-sync`：已完成；治理边界、共享 disabled_skills 真相、默认门禁与串行持久化 round-trip 验证均已补齐
  - `chat-tools-ui`：已随 ToolSettings runtime closure 一并完成
  - `toolsettings-runtime-closure`：已完成，`enabledToolIds` 伪闭环字段已从 Chat 发送链路移除
  - `session-archive`：已在 replay / search 可信前提下完成并翻正 roadmap

## 10. 给人看的 Checklist

下面这份 checklist 是给人看的推进清单；`j-gui-v1-items.yaml` 继续只承担机器状态源。

### 10.1 已完成

- [x] `stream-protocol-unify`
  - Chat / Agent 主协议口径已统一到当前代码真相
  - Chat runtime 协议选路已收口，不再只靠单一路径假设
- [x] `search-content-closure`
  - Chat 内容搜索已有正式后端命令
  - SearchDialog 结果能继续按 `messageId` 打开到目标消息
  - requirement / roadmap / acceptance 已同步到当前真相
- [x] `chat-tools-ui`
  - ToolSettings / ToolSelector 已作为统一工具入口保留
  - 不再依赖单次请求工具字段假装 runtime 可用
- [x] `toolsettings-runtime-closure`
  - ToolSettings / ToolSelector 与 Chat runtime 的工具口径已统一
  - `enabledToolIds` 已退出当前发送链路，不再触发 unsupported 断点
- [x] `session-archive`
  - Chat / Agent 归档都已接通正式后端命令
  - archived 视图、搜索结果与打开链路保持一致
- [x] `shortcut-system-hardening`
  - `Ctrl/Cmd+Shift+P` 已接通全局显示主窗口，不再落到浏览器/系统默认打印
  - `Ctrl/Cmd + + / - / 0` 已接通真实 webview 缩放
  - Tauri ACL 与 capability 回归测试已显式补齐，不再依赖默认权限误判
- [x] `sidebar-performance-hardening`
  - LeftSidebar 改为在 width transition 结束后再挂载 SessionListItems，并保留超时兜底
  - 快速展开后再收起不会出现迟到挂载
  - Agent 折叠启动后首次展开时，上区分栏高度会正确初始化

### 10.2 当前正在推进

- 无
- Phase E 已完成事实输入阶段、第一批核心工作流硬化，以及 `shortcut-system-hardening` / `sidebar-performance-hardening`；下一步进入桌面壳层、设置区、Agent 工作台与视觉布局硬化

### 10.3 下一步明确要做

1. 先推进 `desktop-shell-platform-polish`
   - 图标切到 J logo，并按平台收口窗口控制方案
2. 推进 `agent-backend-switch-ux-hardening`
   - 让 Agent 输入区里的 `Claude SDK / JAgent` 变成直接、可感知、可回滚的后端切换入口
3. 推进 `about-update-surface-refresh`
   - 补产品信息与版本真相：`j-gui` / `j-cli` / 本地 `j` CLI / 本机 Claude Code CLI 版本，以及更中性的更新状态表达
4. 推进 `environment-configuration-surface`
   - 单独提供 Shell 选择、fallback、推荐 shell、Node/Git/Bun/Git Bash/WSL 状态与失败原因
5. 推进 `agent-governance-surface-hardening` 和 `system-prompt-runtime-hardening`
   - 分别收口全局/工作区 Skills / MCP / Hooks 治理面，以及系统提示词默认值/恢复默认/增强选项的运行时真相
6. 按当前收口后的界面与领域边界，推进 `frontend-domain-reorganization`
   - 把 `src/` 从技术分桶收拢到桌面主应用的领域组织
7. 按台账推进 `settings-experience-hardening` 和 `agent-workbench-polish`
   - 分别收设置区可理解性与 Agent 工作台可操作性
8. 按台账推进 `visual-layout-polish`
   - 只处理已证实的布局/视觉/溢出/焦点问题，不做全局换肤
9. 提前推进 `dogfooding-blocker-burn-down`
   - 清掉真实使用中迫使用户退回外部终端或手工补救的阻塞
10. 在上述桌面主链路稳定后，再推进 `proma-backend-capability-absorption`
    - 先把 CLI backend 的恢复状态机、事件语义、存储防线、环境探测和磁盘治理补成真实 Rust 能力
11. 最后再回到 `agent-engine-jagent`、`agent-backend-parity-hardening`、`dogfooding-self-development-loop` 和 `remote-access-integration`

### 10.4 Phase B 最后收尾 Checklist

这部分已完成，不再作为后续阻塞。

- [x] `agent-history-replay-closure` acceptance 已补
- [x] `agent-runtime-stability-recovery` acceptance 已补
- [x] Phase B 联合复验已完成
  - `bun run test src/__tests__/ipc.test.ts`
  - `bash scripts/check_lint.sh`
- [x] `agent-history-replay-closure` 与 `agent-runtime-stability-recovery` 已翻 `done`

Phase B 收尾完成的数字目标：

- P0 已达到 `3 / 3 done`
- roadmap 总完成数在当时已完成 Phase B 翻正；当前总数以后文总体进度为准
- `minimal_loop` 已达到 `5 / 5`

### 10.5 Phase C 最后收尾 Checklist

Phase C 收尾已完成。

- [x] `governance-bidirectional-sync` 已收窄成这轮真正要交付的治理范围
  - 只覆盖 Skills / Hooks / MCP / workspace 的真实持久化链路
  - `toolsettings-runtime-closure` 已明确拆出
- [x] `toolsettings-runtime-closure` 已完成并补 acceptance
  - 最小闭环已覆盖工具列表、启停、可用性与发送链路口径
  - `chat-tools-ui` 已随之翻为实际完成
- [x] `session-archive` 已在 replay 与搜索稳定后收口
  - Chat / Agent 归档、归档视图与搜索结果不再分裂
- [x] `governance-bidirectional-sync` 已完成最终持久化验证并翻正
  - Skills 启停的共享 `disabled_skills` 边界已写明，不再按“每个 workspace 各有一份禁用表”误判
  - 工作区 Skill 内容、workspace MCP、hook disabled 与 CC SDK 导入均已有真实磁盘 round-trip 测试
  - 这组持久化测试当前通过串行 `ignored` 命令执行；是否并入默认门禁，转入 `runtime-observability-gates`
  - `search-content-closure`、`toolsettings-runtime-closure`、`session-archive` 已完成，可作为闭环证据点

Phase C 当前判断：

- 已完成：`search-content-closure`、`governance-bidirectional-sync`、`chat-tools-ui`、`toolsettings-runtime-closure`、`session-archive`
- Phase C 已达到 `5 / 5 done`

### 10.6 推荐执行顺序

1. `desktop-shell-platform-polish`
2. `agent-backend-switch-ux-hardening`
3. `about-update-surface-refresh`
4. `environment-configuration-surface`
5. `agent-governance-surface-hardening`
6. `system-prompt-runtime-hardening`
7. `frontend-domain-reorganization`
8. `settings-experience-hardening` + `agent-workbench-polish`
9. `visual-layout-polish`
10. `dogfooding-blocker-burn-down`
11. `proma-backend-capability-absorption`
12. `agent-engine-jagent`
13. `agent-backend-parity-hardening`
14. `dogfooding-self-development-loop`
15. `remote-access-integration`

## 11. 变更日志

- `2026-05-11`：基于 `project-current-state-audit`、`roadmap-implementation-truth-audit`、`capability-closure-gap-vs-proma` 三份 explore，重写 roadmap 目标、状态语义、主线分组与接口契约。主路线从“功能清单”切换为“能力闭环 + Proma 追平/超越”。
- `2026-05-10`：建立 `j-gui-v1` roadmap，承接旧的 `j-gui-desktop-app`。
- `2026-05-12`：`search-content-closure` 按 feature 流程启动并补上 Chat 正式内容搜索命令，同步修正 requirement / acceptance 对“内容搜索排除”的旧表述。
- `2026-05-12`：`toolsettings-runtime-closure` 完成，Chat 发送链路不再透传 `enabledToolIds`，ToolSettings / ToolSelector 与 runtime 真相统一。
- `2026-05-12`：`session-archive` 补齐 feature 文档与验收，并把已实现的 Chat / Agent 归档能力从 roadmap `planned` 翻为 `done`。
- `2026-05-12`：补充 Phase B / C 的收尾视角进度、最后收尾 checklist 与翻状态前门槛，避免继续按“实现差不多”推进。
- `2026-05-12`：Phase B 完成 acceptance + 联合复验并翻 `done`；同时把 `governance-bidirectional-sync` 缩口为治理真相项，并为 `toolsettings-runtime-closure` 补独立设计输入。
- `2026-05-12`：`governance-bidirectional-sync` 补齐持久化 round-trip 测试，明确共享 `disabled_skills` 边界，并在默认门禁 + 串行 ignored 验收通过后正式翻 `done`，使 Phase C 达到 `5 / 5 done`。
- `2026-05-12`：完成 `runtime-observability-gates`、`proma-parity-evidence-pass`、`tdd-coverage`，使 Phase D 达到 `3 / 3 done`；其中 `tdd-coverage` 按当前代码真相翻正旧 coverage 口径，并补上 `chat.rs` 的会话生命周期与 stop-generation 状态锚点。
- `2026-05-12`：扩充后端演进与远期规划粒度：把原先两个方向词拆成“j-agent 评估/双后端收口/自开发 workflow matrix/阻塞清零/远程集成”等可执行主线；远期移动体验仅补边界与前提，不提前展开实现清单。
- `2026-05-12`：基于 `E:\Coding\AI\jcli` 当前代码与文档核对远程能力真相：`j-cli` 已具备 `j chat --remote` 的 Web/LAN 远程访问能力，因此把近阶段规划从“remote-mobile-access”改成“remote-access-integration”，并把真正远期收窄为 `mobile-remote-experience`。
- `2026-05-12`：基于实际体验反馈新增 Phase E“产品体验硬化”，把 `product-friction-audit` 作为当前 in-progress 事实入口，并将核心工作流、Settings、Agent 工作台、视觉布局和 dogfooding 阻塞清零前置到后端演进与远程接入之前。
- `2026-05-12`：完成 `product-friction-audit`，在 `.codestable/acceptance/product-friction/2026-05-12/` 输出七个区域的摩擦台账、P0/P1/P2 分级与后续 roadmap 映射；Phase E 从“事实输入阶段”切换到“分区硬化实现阶段”。
- `2026-05-12`：完成 `core-workflow-ux-hardening` 第一批主路径硬化，收口 `pf-006`、`pf-001`、`pf-016`、`pf-004` 四条 finding，并把 Phase E 从“仅有台账”推进到“已落地首批实现”。
- `2026-05-13`：把当前真实未收口的桌面问题正式并入 Phase E：新增 `shortcut-system-hardening`、`sidebar-performance-hardening`、`desktop-shell-platform-polish` 三条主线，明确全局快捷键/缩放快捷键真 bug、左侧边栏结构性卡顿、J logo 与平台化窗口控制都属于当前体验硬化范围，而不是“以后再看”的零散问题。
- `2026-05-13`：收紧远期移动端边界：移动端当前只定义为远程控制桌面主链路的后续方向；若未来扩到 `iOS / Android / HarmonyOS` 原生客户端，优先采用“共享 Rust core + 各平台原生 UI + 绑定层”，并在立项时把仓库演进到 `apps/desktop` + `apps/mobile-*` 风格，而不是现在先做多 crate 硬拆。
- `2026-05-13`：把本轮新增证据纳入 roadmap：补入 `agent-backend-switch-ux-hardening`、`agent-governance-surface-hardening`、`system-prompt-runtime-hardening`、`frontend-domain-reorganization`、`proma-backend-capability-absorption` 五条主线，明确 Agent 后端切换误导、全局 Skills/MCP/Hooks 治理偏弱、System Prompt 运行时语义未收口、`src/` 领域化重组缺位、Proma 后端吸收项尚未进入执行主线，都属于当前真实未完成范围。
- `2026-05-13`：基于 About/Update 当前实现与现有环境探测后端，新增 `about-runtime-observability-hardening`，把“关于/更新”从薄版本页升级为运行时/环境可观测面；同时按 roadmap audit 修正依赖图与推荐顺序的三处漂移：`desktop-shell-platform-polish` 不再被正文提前却依赖 `visual-layout-polish`，`agent-governance-surface-hardening` / `system-prompt-runtime-hardening` 改为作为 `settings-experience-hardening` 的前置输入，`dogfooding-blocker-burn-down` 的解锁关系与依赖图重新对齐。
- `2026-05-13`：继续细化 About/Environment 方向，避免遗漏最新澄清：将原 `about-runtime-observability-hardening` 拆成 `about-update-surface-refresh` 与 `environment-configuration-surface` 两条主线，明确需要暴露“本机 Claude Code CLI 版本 = 当前 Claude Code Agent 模式实际后端版本”、Node 不是统一硬依赖而是 npm 安装/扩展工具链相关项、PowerShell 为官方支持 Shell 之一、Git Bash / WSL 为推荐/增强与 fallback 选项，同时把“已是最新”的视觉状态收口为更中性的产品表达。
- `2026-05-13`：完成 `shortcut-system-hardening`，把 `Ctrl/Cmd+Shift+P` 与 `Ctrl/Cmd + + / - / 0` 从提示文案/默认行为回退修成真实能力；同时显式补齐 Tauri global-shortcut/window/webview ACL，增加 capability 回归测试，并将 Phase E 进度与下一步顺序更新为以 `sidebar-performance-hardening` 为首。
- `2026-05-13`：完成 `sidebar-performance-hardening` 的当前最小闭环：LeftSidebar 重新展开时改为跟随 width transition 结束后再挂载 SessionListItems，并保留超时兜底；同时补上快速展开后再收起的迟到挂载取消、Agent 折叠启动后首次展开的分栏高度初始化防回退，以及对应回归测试。下一步顺序更新为先做 `desktop-shell-platform-polish`。
