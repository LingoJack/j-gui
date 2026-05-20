# j-gui

j-gui 是 [j-cli](https://github.com/wuqie-xuanzhao/jcli) 的 Tauri 桌面 GUI，集成 AI Chat 和 Agent 能力。

## 快速开始

### 环境要求

- [GNU Make](https://www.gnu.org/software/make/) 4.3+
- [Bun](https://bun.sh/) 1.2+
- [Rust](https://www.rust-lang.org/) 1.93+
- [Git](https://git-scm.com/) 2.0+
- [Node.js](https://nodejs.org/) 18+ (Agent 模式需要)

### 开发

```bash
# 安装依赖并初始化 hooks
make setup

# 启动开发环境 (Vite + Tauri)
make dev

# 仅前端
make dev-frontend

# 默认门禁
make check-lint

# 测试
make test
```

### 构建

```bash
make build
```

## 技术栈

| 层      | 技术                                                                 |
| ------- | -------------------------------------------------------------------- |
| 桌面壳  | Tauri v2 (Rust)                                                      |
| 前端    | React 19 + TypeScript + Vite + Tailwind v4 + Jotai + shadcn/ui       |
| AI 后端 | j-cli (Rust crate path dependency)                                   |
| 包管理  | bun (由 Makefile 统一调度)                                           |
| IPC     | Tauri Commands + Channels (流式) + Events (全局通知)                 |

## 架构概述

```
src/                    React 前端 (atoms/ + components/ + lib/)
src-tauri/              Rust 后端 (commands/ + chat_engine.rs)
packages/
  @jgui/shared          共享类型、配置和工具函数
  @jgui/core            核心类型、存储和 Agent 逻辑
  @jgui/ui              共享 UI 组件和 Hooks
.codestable/            CodeStable 工程文档
```

### Kernel Traits

j-gui 通过抽象接口层接入不同的 AI 后端：

- **AgentBackend trait** — Agent 执行引擎，支持 Claude Agent SDK 和 j-agent crate 双实现
- **Provider trait** — Chat 供应商接口，支持 Anthropic、OpenAI 兼容格式等
- **流式 IPC** — 基于 Tauri `Channel<T>` 实现低延迟流式传输

### j-cli 集成

j-gui 将 j-cli 作为 Rust crate 以 `path` 依赖引入，直接调用其 constants、types 和核心逻辑。

## 开发者文档

更详细的工程文档位于 `.codestable/` 目录：

- `.codestable/architecture/` — 系统架构现状
- `.codestable/roadmap/` — 路线图与规划
- `.codestable/compound/` — 技术决策、经验沉淀
- `.codestable/requirements/` — 能力愿景

运行 `cs` 技能可探索完整的工作流指引。

## 致谢

前端 UI 基于 [Proma](https://github.com/ErlichLiu/Proma) (Apache-2.0) 重构。

- **Proma 原作者**: [ErlichLiu](https://github.com/ErlichLiu)
- **Proma 协议**: Apache-2.0

感谢 Proma 项目为 AI 桌面应用建立的高质量 UI/UX 参考基准。

## 协议

MIT
