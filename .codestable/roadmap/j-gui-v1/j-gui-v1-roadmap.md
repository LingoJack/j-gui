---
doc_type: roadmap
slug: j-gui-v1
status: active
created: 2026-05-10
last_reviewed: 2026-05-11
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

但 2026-05-11 的三份 explore 也说明了一个更关键的事实：

- 现在的主要问题不是“没做页面”，而是“少数高价值链路还没真正收口”
- 现在的主要风险不是“没有能力”，而是“roadmap / 文档 / UI / 后端契约对完成度的表述不一致”
- 现在距离 Proma 的差距已经不是“大量功能缺失”，而是“Agent 历史回放、搜索内容闭环、ToolSettings 子链路、协议真相和回归门禁”这些最后一层能力闭环

因此，这份 roadmap 不再沿用“有 UI 就算 done”的口径，而改为按**真实能力闭环**重排。

## 2. 目标与明确不做

### 本 roadmap 的目标

1. 把 `j-gui` 从“多数功能可见”推进到“关键能力闭环、低 Bug、可长期使用”
2. 在体验上追平 Proma 当前作为完整 App 的可信度
3. 在工程上争取超越 Proma 的部分，不靠堆更多表面功能，而靠：
   - 更少的伪闭环
   - 更清晰的协议真相
   - 更强的回归门禁
   - 真正可用于“自己开发自己”的工作流

### 这次 update 明确覆盖

- Chat / Agent 的前后端协议真相校准
- Agent 会话工作台闭环：历史回放、恢复、继续工作
- 搜索从标题搜索升级到真实内容搜索闭环
- Settings 中 ToolSettings / Chat Tools 的真实运行时闭环
- 低 Bug 所需的错误暴露、回归测试、验收证据和 dogfooding 门禁

### 明确不做

- 先扩更多 Proma 之外的新表面功能来掩盖核心闭环问题
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

## 5. 接口契约

### 5.1 Chat 请求契约必须闭环

当前前端已经组织出增强输入，但后端仍停在最小命令层。后续 feature-design 必须以统一请求体为硬约束：

```ts
type ChatSendRequest = {
  sessionId: string
  content: string
  systemMessage?: string | null
  thinkingEnabled?: boolean
  enabledToolIds?: string[]
  attachments?: FileAttachment[]
}
```

约束：

- 前端 `ChatView` 组织出的字段，后端要么真实消费，要么从 UI 上移除，不允许长期“组装但不生效”
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
- `get_tool_config`
- `set_tool_config`
- `validate_tool_config`（可选，但若没有则要有等价错误返回）

约束：

- ToolSettings 的每个开关都必须能映射到真实 runtime 行为
- 如果某项能力当前只有 UI，不允许再在 roadmap 中写成 done

### 5.6 低 Bug 的门禁必须体现在闭环验证上

后续 feature-design / acceptance 都必须至少覆盖：

- 端到端主链路验证，而不是只跑单元测试
- 关键断点的失败路径可见：协议错位、工具配置错误、session replay 失败、搜索空命中
- 回归检查要直接锚定当前三个高风险域：
  - Agent history replay
  - message-content search
  - ToolSettings runtime closure

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

### Phase E：P2 自我开发闭环与超越 Proma

11. `agent-engine-jagent`
   - 在闭环稳定后评估/推进 `j-agent` 原生后端，减少 CLI 兼容层复杂度
12. `dogfooding-self-development-loop`
   - 让 `j-gui` 能稳定承担“用自己开发自己”的日常工作流

“超越 Proma”的定义在这里不是更多页面，而是：

- 更少的闭环断点
- 更强的恢复能力
- 更可信的搜索与治理
- 更低的自使用摩擦

### Phase F：远期

13. `remote-mobile-access`
   - 继续保留为远期，不参与当前能力闭环判断

## 7. 排期与优先级

| 优先级 | 目标 | 说明 |
|---|---|---|
| `P0` | `stream-protocol-unify`、`agent-history-replay-closure`、`agent-runtime-stability-recovery` | 先把协议真相和 Agent 长期工作台收口 |
| `P1` | `governance-bidirectional-sync`、`toolsettings-runtime-closure`、`search-content-closure`、`runtime-observability-gates` | 解决最容易暴露伪闭环的入口 |
| `P1` | `proma-parity-evidence-pass`、`tdd-coverage` | 用证据和门禁收口，而不是再靠主观“done” |
| `P2` | `agent-engine-jagent`、`dogfooding-self-development-loop` | 在已闭环基础上追求更强 runtime 与自开发体验 |
| `P4` | `remote-mobile-access` | 远期保留，不影响当前 v1 闭环判断 |

## 8. 观察项

- `j-gui-desktop-app` 已是历史 roadmap；当前所有后续 feature 应以 `j-gui-v1` 为唯一活动规划入口
- 旧 roadmap 中的部分 `done` 本质上是“UI 已有”或“基线已搭”，不能再直接复用为当前状态证明
- 只要 `Agent history replay`、`message-content search`、`ToolSettings runtime closure` 任一未闭环，就不应声称已经达到“低 Bug 且可自己开发自己”的产品标准
- MCP 仍然保持 Agent runtime 边界，不回流到当前 Chat 主链路

## 9. 变更日志

- `2026-05-11`：基于 `project-current-state-audit`、`roadmap-implementation-truth-audit`、`capability-closure-gap-vs-proma` 三份 explore，重写 roadmap 目标、状态语义、主线分组与接口契约。主路线从“功能清单”切换为“能力闭环 + Proma 追平/超越”。
- `2026-05-10`：建立 `j-gui-v1` roadmap，承接旧的 `j-gui-desktop-app`。
