# CLAUDE.md

## 项目概述

j-gui 是一个基于 Tauri v2 的 AI 桌面应用，集成 Chat（多 Provider 对话）和 Agent（自主执行任务）双模式。后端 Rust Kernel 适配 j-cli crates.io 版本，前端使用 React 19 + Jotai 状态管理，通过 Tauri Commands + Channels 实现流式 IPC。

## CodeStable 工作流

本项目使用 CodeStable 工程工作流编排。`.codestable/` 下有完整的需求/架构/roadmap/feature/沉淀体系。动手前：

- **必读** `.codestable/attention.md` — 编译命令、路径约定、编码规约的常驻入口
- 搜 `.codestable/compound/` — 看有没有已拍板的 decision / 已踩坑的 learning / 已验证的 trick
- 看 `.codestable/roadmap/` — 当前 roadmap 状态，哪些做了哪些没做
- 不确定走哪个流程时触发 `/cs` 路由

CodeStable 工作流技能：`/cs-feat`（新功能）`/cs-issue`（修 bug）`/cs-arch`（架构文档）`/cs-req`（需求文档）`/cs-roadmap`（大需求拆解）`/cs-decide`（技术决策）`/cs-learn` / `/cs-trick`（沉淀）。

## 技术栈

| 层      | 技术                                                                 |
| ------- | -------------------------------------------------------------------- |
| 桌面壳  | Tauri v2 (Rust)                                                      |
| 前端    | React 19 + TypeScript + Vite 7 + Tailwind CSS 3 + Jotai + Radix UI/CVA（shadcn 风格组件） |
| AI Runtime | Rust Tauri Kernel（适配 j-cli crates.io 版本）+ bun workspace 内的 `@jgui/*` 包 |
| 包管理  | **bun workspaces**（非 npm/yarn/pnpm）                              |
| IPC     | Tauri Commands (`invoke`) + Channels（流式）+ Events（全局通知）   |

## IPC 通信架构

类型定义 → Rust Command → Tauri Bridge → 前端 `invoke`：

1. 共享类型：`@jgui/shared` 定义请求/响应类型与 IPC 常量
2. Rust Command：`src-tauri/src/commands/` 下按领域分文件（`chat.rs`、`agent.rs`、`channels.rs` 等），通过 `#[tauri::command]` 暴露
3. 前端调用：`src/lib/ipc.ts` 封装 `tryInvoke()`、`invoke()` 与 `Channel<T>` 订阅

添加新 IPC 时需同步修改：`@jgui/shared` 类型 → Rust command 函数 → `src/lib/ipc.ts` 封装。

流式链路：Chat / Agent 流式统一走 `Channel<T>`，并通过 `src/lib/ipc-stream-protocol.ts` 解码协议事件。

当前已接通的主要 IPC 领域：Settings、Channels、Conversations、Chat Messaging、Agent Sessions、Agent Permissions、Agent Workspaces、Files、Chat Tools、System Prompts、Hooks、Config、MCP。

补充边界：
- `src/lib/ipc.ts` 中仍有少量前端预留 / 兜底接口；只有 `src-tauri/src/lib.rs` 已注册的 command 才算正式后端能力
- 涉及 Runtime 状态或重初始化时，先核对 Tauri command 是否已注册，不要把前端 fallback 当成已落地功能

## 项目结构

```
packages/
  shared/               @jgui/shared (v0.1.19) — 共享类型、IPC 常量、权限规则（零运行时依赖）
  core/                 @jgui/core (v0.2.9) — AI Provider 适配器、代码高亮（Shiki）
  ui/                   @jgui/ui (v0.1.3) — 共享 UI 组件（CodeBlock、MermaidBlock、useSmoothStream）
src/                    React 前端（atoms/ + components/ + hooks/ + lib/）
src-tauri/              Rust 后端（commands/ + kernel/ + agent_engine.rs）
.codestable/            CodeStable 工作流产物
```

包依赖方向：`ui → core → shared`；前端 `src/` 可引用全部三个 workspace 包。

## 关键约束

- **启动开发环境**：`bun run tauri dev`（非 `cargo tauri dev` — CLI 未安装，用 bun 自带的 `@tauri-apps/cli`）
- **默认验收入口**：`bash scripts/check_lint.sh`。它是本仓库默认的合规检查入口，统一执行 `cargo fmt --check`、`cargo clippy -- -D warnings`、workspace 全量 TypeScript 检查、`bun run test`、`cargo test`，并补充 Rust 结构性约束扫描
- **测试（TDD 强制）**：实现前先写测试；任何新功能/修复必须有对应测试覆盖。前端测试必须走 `bun run test`（`bun test` 不走 vitest 配置，组件测试因缺 jsdom 会失败）
- **j-cli 依赖**：当前以 crates.io 版本依赖为准（见 `src-tauri/Cargo.toml`），不再默认使用本地源码路径依赖
- **j-cli 数据目录**：`~/.jdata/`（由 `j_cli::constants` 定义）
- **Agent 配置路径**：`~/.jdata/agent/data/agent_config.json`
- **本地数据边界**：
  - j-gui 与 j-cli 共享 `~/.jdata/` 下的 j-cli 数据（例如 Agent 配置、MCP 配置）
  - j-gui 自身的 GUI 设置与用户档案由本地 JSON 文件持久化
  - 修改数据路径相关逻辑时，先区分“j-cli 管理的数据”与“j-gui 自管的数据”
- **状态管理**（Jotai Atoms，高频入口，非穷尽清单）：
  - `app-mode.ts` / `active-view.ts`：应用模式与主视图切换
  - `tab-atoms.ts` / `draft-session-atoms.ts`：标签页与草稿会话管理
  - `chat-atoms.ts` / `chat-tool-atoms.ts`：Chat 会话、消息、流式状态、Chat Tool 状态
  - `agent-atoms.ts` / `working-atoms.ts`：Agent 会话、流式状态、权限请求、Working 区
  - `search-atoms.ts` / `shortcut-atoms.ts`：搜索面板与快捷键状态
  - `system-prompt-atoms.ts` / `settings-tab.ts`：System Prompt 与设置导航
  - `theme.ts` / `ui-preferences.ts` / `sidebar-atoms.ts` / `notifications.ts` / `environment.ts` / `user-profile.ts`：主题、界面偏好、侧边栏、通知、环境信息、用户档案
- **Agent 集成架构**：
  - 用户输入 → `src/lib/ipc.ts` (`sendAgentMessage`)
  - Tauri Command → `AgentEngine`
  - Claude CLI 子进程或 j-agent 适配层产出事件流
  - `Channel<T>` 推送到前端
  - `useGlobalAgentListeners`（全局 Hook）写入 Jotai atoms
  - React UI 更新
- **TypeScript 编码规约**（强制）：
  - 新增代码禁止引入 `any`；触达的存量 `any` 优先一并收敛为明确的 `interface` / 类型
  - 对象类型优先使用 `interface` 而非 `type`
  - 仅类型导入使用 `import type`
  - 路径别名统一使用 `@/` → `src/`
- **注释约束**（强制）：
  - 不删除原有注释；只有在注释与本次代码改动直接冲突、且必须同步修正时，才允许做最小化改动
  - 新增或改写的注释默认使用中文；`TODO`、`FIXME`、`NOTE` 标签可保留英文关键字，但正文仍用中文
  - 修改带注释的代码时，必须同时检查注释是否仍然为真；过期注释必须同步修正，不能放着误导后人
  - 临时注释必须带触发条件或保留原因，避免出现无期限悬空备注
  - 什么时候必须写注释：
    - 非直观的业务约束、协议约束、兼容性分支、历史包袱或外部系统耦合点
    - 容易误改的边界条件、状态机切换条件、持久化/流式/并发相关前提
    - `unsafe`、绕过类型系统、手工资源管理、跨线程/跨进程桥接
    - 公共 API、导出类型、会被别处复用的关键入口
    - 临时 workaround、保留旧行为、为修 bug 增加但表面上不明显的防线
  - 注释应该写什么：
    - 这段代码为什么存在、依赖什么前提、不能随便改哪里
    - 输入/输出中的关键约束、状态变化条件、失败后的影响范围
    - 与其他模块、协议、配置文件、上游系统之间的对应关系
    - 临时方案的触发条件、退出条件、后续应该清理到哪里
    - `pub` API 的 `///` 文档注释用中文写，说明职责、关键输入输出或边界，不写空话
    - `unsafe` 的 `// SAFETY:` 注释用中文写清为什么安全，不能只写“这里是安全的”
  - 哪些注释属于坏注释，禁止新增：
    - 逐行翻译代码的注释，例如“给变量赋值”“遍历数组”
    - 空话注释，例如“处理数据”“执行逻辑”“初始化内容”
    - 已经过期、与代码实际行为不一致、或者只描述旧实现的注释
    - 用来掩盖看不懂代码的注释；这类情况应先简化代码，再决定是否需要注释
    - 没有时间条件或清理条件的临时注释，例如“先这样”“后面再说”
    - 英文正文注释；除非引用协议字段、日志关键字、错误字面量或标准术语
- **Rust 编码规约**（强制，详见 `.codestable/compound/2026-05-08-decision-rust-coding-conventions.md`）：
  - `cargo fmt` + `cargo clippy -- -D warnings` 零告警
  - 命名：`PascalCase`（类型/Trait）、`snake_case`（函数/变量/模块）、`SCREAMING_SNAKE_CASE`（常量）
  - 禁止 `.clone()` 滥用，优先借用/所有权转移；接口参数优先 `&str`/`&[T]` 而非 `String`/`Vec`
  - 禁止 `unwrap()`/`expect()` 在库代码中使用；用 `?` 传播错误，应用层用 `anyhow`，库层用 `thiserror`
  - 类型与 `impl` 块物理相邻；派生 `Debug, Default, PartialEq`；构造用 `new() -> Self`
  - 显式处理枚举分支，禁止 `_ => ...` 通配；用 `.map()`/`.and_then()`/`.ok_or()` 链式处理
  - 禁止长路径引用（`a::b::c::Type`），用 `use` 导入；弃用 `mod.rs`，去 `utils` 化按功能归类
  - 函数单一职责，参数 >4 个封 `Config` 结构体；魔法值提取为 `const`
  - `pub` 成员须有 `///` 文档；`unsafe` 块须有 `// SAFETY:` 注释
- **流式 IPC**：Chat 流式必须用 `Channel<T>`（非 Tauri Events — Events 不适合低延迟高频场景）
- **Agent 模式**：Claude Agent SDK CLI 子进程 + j-agent crate 并行，预留 `AgentBackend` trait
- **Channel send 错误**：取消请求通过 Channel drop 实现
- **jcli 解耦**（强制，详见 `.codestable/compound/2026-05-10-decision-jgui-jcli-decouple.md`）：
  - j-gui **不修改 jcli 源代码**（jcli 由独立仓库/团队维护）
  - j-gui **写入 jcli 数据目录**（`~/.jdata/`）保持 CLI/GUI 数据同步
  - 所有 `j_cli::` 导入仅允许在 `kernel/adapter.rs` 中——其他模块通过 `ChatKernel` / `ConfigKernel` / `GovernanceKernel` trait 调用
  - 退出标准：`grep -r "j_cli::" src-tauri/src/` 仅命中 `kernel/adapter.rs`
- **jcli 升级应对**（详见 `.codestable/compound/2026-05-10-decision-jgui-jcli-decouple.md#jcli-升级应对`）：
  - jcli 小版本升级 → 更新 Cargo.toml → cargo check 通过（零改动）
  - jcli API 签名变化 → 仅修改 adapter 内部实现（trait 签名保持稳定）
  - jcli 新增功能 → trait 加方法（带默认 Unsupported 实现）→ adapter 实现 → 前端按需加 UI
  - trait 签名变更必须有 deprecation 周期
- **Git 提交文案**（强制）：
  - 默认遵循 Conventional Commits 的中文适配：`<type>(<scope>): <description>`
  - `type` 保持英文：`feat`、`fix`、`docs`、`refactor`、`perf`、`test`、`chore`、`ci`、`revert`
  - `scope` 和 `description` 默认使用中文；`scope` 写受影响模块，`description` 写明确动宾短语
  - 除约定保留的 `type` 外，subject 其余部分默认全部中文，不写英文短句式标题
  - `description` 控制在单行短句内，不写句号，不写“更新代码”“修复问题”“调整一下”这类空泛文案
  - 本地提交前执行一次 `bun run setup:git-hooks`，启用仓库内 `commit-msg` 校验
  - 文档或 CodeStable 产物优先用 `docs(...)`；涉及 `.codestable/` 的提交可用 `docs(codestable): ...`
  - 多主题改动在条件允许时优先拆分 commit；必须合并提交时，文案应覆盖这次提交的主闭环，不要罗列零碎细节
  - 涉及不兼容变更时，使用 `!` 或 `BREAKING CHANGE:` 明确标注
- **固定收尾工作流**（强制）：
  - 对 roadmap 条目做实现落地时，条目闭环后的固定顺序是：`git 提交 → 回写 roadmap → 明确下一步`
  - 回写 roadmap 至少包括：items 状态、roadmap 进度数字、当前解锁关系、推荐执行顺序、变更日志
  - “明确下一步”必须落到一个具体 roadmap item，默认直接承接当前推荐执行顺序的第一项，而不是给泛泛建议
  - 若该条目属于核心逻辑，还需先完成条目级审查与门禁验证，再进入上述固定收尾顺序
- **Git 排除**：`.claude/` 不提交；`.codestable/` 是否提交以当前任务指令为准，不要沿用旧结论擅自排除

### 任务完成验证（强制）

**每个子代理任务/手动改动完成后，必须先跑 `bash scripts/check_lint.sh`，不通过不算完成：**

| 结果类型 | 处理规则 |
|---------|----------|
| `FAIL` | 必须修复，不能标记完成 |
| `WARN`（由本次改动引入） | 必须处理，不能把新告警留给后续 |
| `WARN`（已确认是存量且与本次无关） | 可保留，但必须在汇报中点明 |

**脚本当前覆盖的硬门禁**：`cargo fmt --check`、`cargo clippy -- -D warnings`、root + `packages/core` + `packages/shared` + `packages/ui` 的 TypeScript 检查、`j_cli::` 单入口约束、`bun run test`、`cargo test`、`mod.rs` 禁用。

**脚本当前覆盖的告警约束**：Rust 单文件行数、函数行数、函数参数过多、非 test `unwrap/expect`、`super::super::` 过深引用、公共 API 缺 `///`、`unsafe` 缺 `// SAFETY:`。

**脚本外仍需单独遵守的约束**：`.codestable/` `.claude/` 不提交、注释不可擅删且新增注释默认中文、Chat/Agent 状态隔离、流式协议改动必须同时补前后端测试、以及需求本身要求的针对性测试/验证。

**这些检查在子代理实现报告中必须按“脚本结果 + 额外人工验证”汇报，主控 agent 在标记任务完成前必须独立验证。**

---

## 行为准则

以下规则偏向"谨慎"而非"速度"。琐碎任务可自行判断。

### 1. 动手前先想清楚

- 把你的假设明确说出来，不确定就问
- 有多种理解时把所有可能列出来——别擅自挑一个
- 有更简单的方案就说出来，必要时反驳我
- 哪里不清楚就停下来，指出困惑点然后问

### 2. 最小化原则

- 只写解决问题的最小代码，不要任何"以防万一"
- 不写需求里没要求的功能
- 不为一次性使用的代码做抽象
- 不加未要求的"灵活性"或"可配置性"
- 不为不可能发生的场景写 error handling
- 写了 200 行而 50 行就够 → 重写

自问："资深工程师会觉得这写得太复杂了吗？"如果是，请简化。

### 3. 外科手术式改动

修改现有代码时：

- 别"顺手改进"周边代码、注释或格式
- 别重构没坏的东西
- 配合现有代码风格，哪怕你不喜欢
- 看到无关的死代码——告诉我但别删
- 删掉因你改动而失去用途的 import / 变量 / 函数
- 不要删原本就存在的死代码，除非我让你删

判据：每一行改动都能追溯到需求。

### 4. 目标驱动执行

定义可验证的成功标准，循环到通过为止：

- "加个校验" → 写无效输入测试，让它们通过
- "修这个 bug" → 写能复现的测试，让它通过
- "重构 X" → 保证重构前后测试都通过

多步任务给简短计划：`1. [步骤] → 验证：[检查]  2. [步骤] → 验证：[检查]`

强成功标准让你能独立闭环；弱标准会让你不停回来问我。

### 5. 输出规则

- 不说废话、不捧用户、纯净输出
