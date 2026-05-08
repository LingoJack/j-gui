---
doc_type: architecture
slug: ARCHITECTURE
scope: j-gui 系统架构总入口
summary: Tauri v2 + React + TypeScript 桌面应用，前端 Vite 构建，后端 Rust/Tauri 命令式 IPC
status: current
last_reviewed: 2026-05-08
tags: [tauri, react, desktop]
depends_on: []
implements: []
---
# j-gui 架构总入口

> 状态：骨架阶段（Tauri 脚手架已搭建，业务代码待开发）
> 最后更新：2026-05-08

## 1. 定位与受众

j-gui 是 Tauri v2 桌面应用。前端 React + TypeScript (Vite)，后端 Rust (Tauri)。当前处于项目初始化阶段，仅有 Tauri 官方脚手架代码。

**受众**：feature-design（了解模块边界）、issue-analyze（定位代码）、新人上手（理解项目结构）。

## 2. 结构与交互

### 2.1 进程边界

```
┌──────────────────────┐     Tauri IPC       ┌──────────────────────┐
│   Frontend (WebView) │◄──────────────────►│   Backend (Rust)      │
│   src/               │  invoke() + events  │   src-tauri/src/      │
│   React + Vite       │                     │   Tauri commands      │
└──────────────────────┘                     └──────────────────────┘
```

- 前端通过 `@tauri-apps/api/core` 的 `invoke()` 调用后端命令 (`src/App.tsx:3`, `src/App.tsx:10-12`)
- 后端通过 `#[tauri::command]` 宏暴露命令 (`src-tauri/src/lib.rs:2-5`)
- 构建时 Vite 产出到 `../dist`，Tauri 内嵌为 WebView (`src-tauri/tauri.conf.json:10`)

### 2.2 前端 (src/)

| 文件         | 职责                             | 关键入口             |
| ------------ | -------------------------------- | -------------------- |
| `main.tsx` | React 挂载入口，渲染 `<App />` | `src/main.tsx:5-9` |
| `App.tsx`  | 根组件，当前仅含 greet 演示      | `src/App.tsx:6-51` |
| `App.css`  | 全局样式                         | `src/App.css`      |

技术栈：React 19 + TypeScript 5.8 + Vite 7 (`package.json:13-25`)

### 2.3 后端 (src-tauri/)

| 文件                | 职责                          | 关键入口                      |
| ------------------- | ----------------------------- | ----------------------------- |
| `main.rs`         | 二进制入口，调用 lib crate    | `src-tauri/src/main.rs:4-6` |
| `lib.rs`          | Tauri Builder 配置 + 命令注册 | `src-tauri/src/lib.rs:8-14` |
| `Cargo.toml`      | 依赖声明                      | `src-tauri/Cargo.toml`      |
| `tauri.conf.json` | Tauri 窗口/构建/安全配置      | `src-tauri/tauri.conf.json` |

当前依赖：`tauri` v2, `tauri-plugin-opener` v2, `serde` + `serde_json` (`src-tauri/Cargo.toml:17-20`)

Crate 结构：

- bin crate (`main.rs`) → 调用 `tauri_app_lib::run()`
- lib crate (`lib.rs`) → `tauri::Builder` 组装，当前仅注册 `greet` 命令和 `opener` 插件

### 2.4 构建流水线

```
bun dev (Vite HMR) ─── 前端开发服务器 :1420
cargo tauri dev ─────── 同时启动前端 + Rust 后端
cargo tauri build ───── tsc + vite build → dist/ → Tauri bundle
```

开发命令定义在 `package.json:7-11`，Tauri 配置在 `src-tauri/tauri.conf.json:7-11`

## 3. 数据与状态

当前无持久化状态。前端状态仅 React `useState` 管理的 greet 演示 (`src/App.tsx:7-8`)。

## 4. 关键决策

- **Rust 编码规约**：继承自 jcli。详见 `compound/2026-05-08-decision-rust-coding-conventions.md`
- **后端集成方案**：Rust crate 依赖 j_cli（path dep），不用 WS remote。详见 `compound/2026-05-08-decision-j-gui-rust-integration.md`
- **前后端数据流**：Tauri Commands（请求）+ Channels（流式推送）+ Events（全局通知）。详见 `compound/2026-05-08-decision-j-gui-ipc-dataflow.md`
- **Chat Engine 封装**：`ChatEngine` 结构体作为 j-cli 和 Tauri 命令之间的唯一中介。详见 `compound/2026-05-08-decision-j-gui-chat-engine.md`
- **前端 UI 架构**：三栏布局 + 标签页主区域，模仿 Proma。详见 `compound/2026-05-08-decision-j-gui-ui-architecture.md`
- **前端技术栈**：React 19 + Tailwind v4 + Jotai + shadcn/ui + Shiki。详见 `compound/2026-05-08-decision-j-gui-frontend-stack.md`

## 5. 代码锚点

| 想看什么            | 从哪看                               |
| ------------------- | ------------------------------------ |
| Tauri 命令定义      | `src-tauri/src/lib.rs:2-5` (greet) |
| Tauri Builder 组装  | `src-tauri/src/lib.rs:8-14` (run)  |
| 前端 IPC 调用示例   | `src/App.tsx:10-12` (invoke greet) |
| React 挂载          | `src/main.tsx:5-9`                 |
| Tauri 窗口/构建配置 | `src-tauri/tauri.conf.json`        |
| 前端依赖            | `package.json:13-25`               |
| Rust 依赖           | `src-tauri/Cargo.toml:17-20`       |

## 6. 已知约束 / 边界情况

- 前端包管理用 **bun**（非 npm/yarn/pnpm）(`.codestable/attention.md:11`)
- Rust 代码必须通过 `cargo fmt --check` + `cargo clippy -- -D warnings` (`compound/2026-05-08-decision-rust-coding-conventions.md`)
- `tauri.conf.json` 中 `identifier` 已设为 `com.j-gui.app` (`src-tauri/tauri.conf.json:5`)

## 7. 相关文档

- `compound/2026-05-08-decision-rust-coding-conventions.md` — Rust 编码规约
- `.codestable/attention.md` — 项目注意事项
