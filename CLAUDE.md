# CLAUDE.md

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
| 前端    | React 19 + TypeScript + Vite + Tailwind v4 + Jotai + shadcn/ui       |
| AI 后端 | j-cli（Rust crate path dependency `j-cli = { path = "../../j" }`） |
| 包管理  | **bun**（非 npm/yarn/pnpm）                                    |
| IPC     | Tauri Commands (`invoke`) + Channels（流式）+ Events（全局通知）   |

## 项目结构

```
src/                    React 前端（atoms/ + components/ + lib/）
src-tauri/              Rust 后端（commands/ + chat_engine.rs）
.codestable/            CodeStable 工作流产物
```

## 关键约束

- **启动开发环境**：`bun run tauri dev`（非 `cargo tauri dev` — CLI 未安装，用 bun 自带的 `@tauri-apps/cli`）
- **Rust 检查**：`cargo check`（**零警告零错误**，`#![deny(warnings)]`）+ `cargo fmt` + `cargo clippy -- -D warnings`
- **TypeScript 检查**：`bunx tsc --noEmit`
- **测试（TDD 强制）**：`bun run test` + `cargo test` — 前端测试必须通过 vitest（`bun test` 不支持 jsdom，组件测试会失败）。实现前先写测试，任何新功能/修复必须有对应测试覆盖
- **j-cli 源码**：`E:\Coding\AI\jcli`，j-gui 通过相对路径依赖 `j-cli = { path = "../../jcli" }`
- **j-cli 数据目录**：`~/.jdata/`（由 `j_cli::constants` 定义）
- **Agent 配置路径**：`~/.jdata/agent/data/agent_config.json`
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
- **Git 排除**：`.codestable/` `.claude/` 不提交

### 任务完成验证（强制）

**每个子代理任务/手动改动完成后，必须跑全量检查，不通过不算完成：**

| 检查项 | 命令 | 要求 |
|--------|------|------|
| 前端测试 | `bun run test` | 全部通过，零失败 |
| Rust 测试 | `cargo test --manifest-path src-tauri/Cargo.toml` | 全部通过，零失败 |
| 前端类型检查 | `bunx tsc --noEmit` | 零错误（存量错误例外，但不新增） |
| Rust 编译检查 | `cargo check --manifest-path src-tauri/Cargo.toml` | 零新告警 |
| Rust 格式 | `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | 格式正确 |
| Rust Lint | `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` | 零告警 |

**这些检查在子代理实现报告中必须逐项汇报，主控 agent 在标记任务完成前必须独立验证。**

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
