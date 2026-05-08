---
doc_type: decision
category: convention
status: active
created: 2026-05-08
slug: tdd-workflow
title: TDD 测试驱动开发流程
---

# TDD 测试驱动开发流程

## 背景

j-gui 项目此前无测试基础设施，所有功能通过手动验收验证。代码审查发现多处因缺乏测试覆盖而未被捕获的回归风险（如 provider 移除后 activeIndex 越界、permission bypass 使用空 toolId）。

## 决定

**所有新增和修改的代码必须遵循 TDD 流程：先写失败测试 → 实现 → 验证通过。**

## 测试分层

| 层 | 工具 | 覆盖目标 |
|---|------|---------|
| 单元测试 | vitest + @testing-library/react | 工具函数、Jotai atoms、React 组件 |
| 集成测试 | vitest + jsdom | IPC 模拟、端到端 UI 流程 |
| Rust 测试 | cargo test | ChatEngine、AgentEngine、Tauri 命令 |

## 工作流

### 新增功能
1. **Red** — 写一个描述预期行为的测试，运行确认失败
2. **Green** — 写最小实现让测试通过
3. **Refactor** — 清理代码，保持测试绿

### 修 Bug
1. **Red** — 写能复现 Bug 的测试
2. **Green** — 修复 Bug
3. **Refactor** — 确认无回归

### 验收标准
- `bun test` 全部通过
- `cargo test` 全部通过
- 新增代码的核心路径有测试覆盖

## 测试命令

```bash
# 前端测试
bun test              # 单次运行
bun run test:watch    # 持续监听

# Rust 测试
cargo test            # 运行全部
cargo test -p j-gui   # 仅本项目
```

## 文件约定

```
src/__tests__/
├── setup.ts           # 测试环境初始化
├── utils.test.ts      # 工具函数测试
├── atoms.test.ts      # 状态 atom 测试
├── components/        # 组件测试
│   └── ChatView.test.tsx
└── ipc/               # IPC 模拟测试
    └── tauri.test.ts

src-tauri/src/
└── tests/             # Rust 集成测试（暂未创建）
```

## 影响

- 新的 feature/ff-note 提交必须附相应测试
- 代码审查会检查关键路径的测试覆盖
- 不接受"以后补测试"——测试和实现同时提交

## 相关文档

- `2026-05-08-trick-tauri-v2-core-api.md` — Tauri IPC 测试模拟
- `shared-conventions.md` 第 4 节 — scoped-commit 提交范围
