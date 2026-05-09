# j-gui

j-gui 是 j-cli 的 Tauri 桌面客户端，集成 AI Chat 和 Agent 能力。前端 UI 基于 [Proma](https://github.com/ErlichLiu/Proma) (Apache-2.0) 重构。

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Tauri v2 (Rust) |
| 前端 | React 19 + TypeScript + Vite + Tailwind v3 + Jotai + Radix UI |
| AI 后端 | j-cli (Rust crate) |
| 包管理 | bun |

## 快速开始

### 环境要求

- [Bun](https://bun.sh/) 1.2+
- [Rust](https://www.rust-lang.org/) 1.93+
- [Git](https://git-scm.com/) 2.0+
- [Node.js](https://nodejs.org/) 18+ (Agent 模式需要)

### 开发

```bash
# 安装依赖
bun install

# 启动开发环境 (Vite + Tauri)
bun run tauri dev

# 仅前端
bun run dev

# Rust 检查
cd src-tauri && cargo check
```

### 构建

```bash
bun run tauri build
```

## 项目结构

```
src/                    React 前端 (Proma UI 重构)
src-tauri/              Rust 后端 (j-cli 集成)
packages/               @proma/* 共享包 (类型/核心/UI)
.codestable/            CodeStable 工程文档
```

## 致谢

本项目前端 UI 基于 [Proma](https://github.com/ErlichLiu/Proma) 重构，Proma 是一款出色的开源 AI 桌面应用。

- **Proma 原作者**: [ErlichLiu](https://github.com/ErlichLiu)
- **Proma 协议**: Apache-2.0

感谢 Proma 项目为 AI 桌面应用建立的高质量 UI/UX 参考基准。

## 协议

MIT
