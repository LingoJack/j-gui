---
doc_type: feature-design
feature: 2026-05-12-tdd-coverage
status: approved
summary: 把 Phase D 的测试收口从“测试数量不少”推进到“关键命令层和闭环断点有明确回归锚点”，优先补最薄弱且最容易回归的 chat 命令层与 kernel 错误传播路径。
tags: [tests, tdd, phase-d, coverage, chat, commands]
roadmap: j-gui-v1
roadmap_item: tdd-coverage
requirement: j-gui-session-management
depends_on: [runtime-observability-gates]
---

# tdd-coverage

## 0. 术语

| 术语 | 含义 |
|---|---|
| 高价值回归锚点 | 能直接挡住历史闭环倒退、命令层状态错位或 kernel 错误传播失真的测试 |
| 命令层薄封装测试 | 针对 `src-tauri/src/commands/*.rs` 中 `_impl` 或少量命令态逻辑的单元测试，不扩成全链路 E2E |
| 旧口径 | “仓库里测试已经很多，所以 Phase D 不急着补”的说法 |
| 持续收口项 | 不追求一次性补平所有缺口，而是每轮收掉最关键的一小批薄弱面 |

## 1. 决策与约束

### 1.1 核心决策

- 本 feature 不做“全仓覆盖率提升工程”，只补**当前最缺、最值钱、最容易误判已完成**的测试面。
- `runtime-observability-gates` 已经把 replay/search/toolsettings 三个高风险闭环拉进默认门禁；本 feature 的职责是继续把**命令层薄弱面**收紧，避免 roadmap 再拿“已有很多测试”当完成证明。
- 以最新代码真相为准，不继续沿用 2026-05-10 explore 中 `alias/config/system` “零测试”的旧结论：
  - `alias.rs` 已有完整基础测试
  - `config.rs` 已有较完整 `_impl` 测试
  - `system.rs` 已有基础 kernel 委托测试
  - 当前最薄弱的是 `chat.rs` 命令层，以及少量“命令态状态 + 错误传播”断点
- 本轮最小范围定为：
  - `chat.rs`：补会话生命周期与 `stop_generation` 状态语义测试
  - 文档/roadmap：把旧口径更新成当前真实的持续收口状态

### 1.2 硬约束

- 不引入新的测试框架；仍只用现有 Rust 单测 / Vitest / 默认 `check_lint.sh`
- 不为了测试去重构 `ChatEngine` 或命令层结构
- 不把这轮扩展成 `send_message` 流式 E2E；那需要更重的 runtime/Channel 测试基建，不适合本项最小闭环
- 不宣称“全仓命令层已补平”；本轮完成后，`tdd-coverage` 仍应保持“持续收口项”的真实语义

### 1.3 明确不做

- 不追求覆盖率数字
- 不补所有 `commands/*.rs` 的正常流/异常流组合
- 不改现有 parity 证据或 runtime gate 设计
- 不顺手重构长测试文件

## 2. 方案

### 2.1 现状

当前默认门禁已经能守住 replay/search/toolsettings 三个高风险闭环，但“命令层测试覆盖度”这件事仍存在两个问题：

1. 旧探索结论已部分过时，容易继续误导 roadmap 判断
2. `chat.rs` 作为最常用命令入口之一，仍只有 pin/archive 两个循环测试，缺：
   - 会话创建/列举/删除的最小生命周期锚点
   - `stop_generation` / `is_session_stopped` / `clear_stopped_session` 这组命令态状态语义锚点

这类缺口不是“没有测试就不能运行”，而是**一旦回归很容易绕过当前门禁**。

### 2.2 变化

本 feature 只新增两类输出：

1. `chat.rs` 命令层测试补强
2. `tdd-coverage` 自身的 feature/checklist/acceptance，把“旧口径过时”正式翻成当前真相

### 2.3 挂载点

| # | 挂载点 | 说明 |
|---|---|---|
| 1 | `src-tauri/src/commands/chat.rs` | 当前最薄弱的命令层测试面 |
| 2 | `.codestable/compound/2026-05-10-explore-backend-test-coverage.md` | 作为旧探索输入，但只允许部分继承，不能照抄零测试结论 |
| 3 | `.codestable/roadmap/j-gui-v1/j-gui-v1-items.yaml` | `tdd-coverage` 状态源 |
| 4 | `bash scripts/check_lint.sh` | 默认完成门禁 |

### 2.4 推进策略

| Step | 内容 | 退出信号 |
|---|---|---|
| 1 | 复核当前命令层测试真相，标出旧 explore 已过时的部分 | 当前薄弱点清单明确 |
| 2 | 补 `chat.rs` 的最小高价值命令层测试 | 会话生命周期和 stop-generation 状态有明确锚点 |
| 3 | 产出 acceptance，记录本轮收口、仍存缺口和旧口径修正 | `tdd-coverage-acceptance.md` 完成 |
| 4 | 跑 YAML 校验和默认门禁 | `validate-yaml.py` + `bash scripts/check_lint.sh` 通过 |

## 3. 验收契约

| # | 触发 | 期望结果 |
|---|---|---|
| A1 | 运行 `cargo test` | `chat.rs` 新增测试通过，且不依赖额外手工环境 |
| A2 | 调用 `stop_generation` 后查询命令态状态 | `is_session_stopped` 为真，清理后恢复为假 |
| A3 | 运行默认门禁 | `bash scripts/check_lint.sh` 通过 |
| A4 | 查看 acceptance | 能看见“哪些旧结论已过时、这轮补了什么、还没补什么” |

### 明确不做反向核对

- [ ] 不声称 `send_message` 全链路已被本 feature 覆盖
- [ ] 不声称全仓命令层测试缺口已清零
- [ ] 不把 2026-05-10 explore 直接当成当前真相复述

## 4. 对其他模块的影响

| 模块 | 影响 | 动作 |
|---|---|---|
| `src-tauri/src/commands/chat.rs` | 新增最小命令层回归测试 | 更新 |
| `.codestable/roadmap/j-gui-v1/j-gui-v1-items.yaml` | 记录 feature 绑定与状态 | 更新 |
| `.codestable/features/2026-05-12-tdd-coverage/` | 新增设计/清单/验收 | 新增 |
