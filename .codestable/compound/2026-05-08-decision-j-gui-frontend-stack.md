---
doc_type: decision
category: tech-stack
status: active
created: 2026-05-08
slug: j-gui-frontend-stack
title: j-gui 前端技术栈选型
---

# j-gui 前端技术栈选型

## 背景

j-gui 前端需要一个完整的 UI 技术栈：框架、构建工具、样式方案、状态管理、Markdown 渲染、代码高亮。选型目标是跟随 Proma 当前远程版本的前端栈，作为 1:1 复刻基础，同时适配 Tauri 的 WebView 环境。

## 决定

| 层级 | 选择 | 版本 |
|------|------|------|
| 桌面框架 | Tauri | v2 |
| 前端框架 | React + TypeScript | 19 + 5.8 |
| 构建工具 | Vite | 7 |
| 样式方案 | Tailwind CSS + shadcn/ui | v4 |
| 状态管理 | Jotai | latest |
| Markdown 渲染 | react-markdown + rehype-highlight + remark-gfm | latest |
| 代码高亮 | Shiki | latest |

已具备（当前脚手架）：React 19, TypeScript 5.8, Vite 7, @tauri-apps/api v2 (`package.json:13-25`)

待安装：Tailwind CSS v4, Jotai, shadcn/ui, react-markdown, rehype-highlight, remark-gfm, Shiki

## 理由

- **React 19**：Tauri 官方推荐前端框架，生态成熟；也是 Proma 当前采用的基础框架
- **Vite 7**：Tauri v2 默认构建工具，HMR 快，与 React 集成好
- **Tailwind CSS v4**：原子化 CSS，与 shadcn/ui 组件库原生配合；也是 Proma 当前采用的样式体系
- **shadcn/ui**：无包依赖的组件库，复制源码到项目，可定制；也是 Proma 当前采用的组件做法
- **Jotai**：原子化状态管理，比 Zustand 更适合事件驱动的流式更新；也是 Proma 当前采用的状态管理
- **react-markdown**：React 原生 Markdown 渲染，支持插件扩展
- **Shiki**：服务端语法高亮，支持 TextMate 主题，与 VS Code 一致的高亮质量

## 考虑过的替代方案

- **Zustand**：被拒绝。Jotai 的原子模型更适合事件驱动的流式更新（每个 atom 独立订阅 Tauri 事件），Zustand 的单 store 模型在此场景下会导致不必要的重渲染。
- **CSS Modules / styled-components**：被拒绝。Tailwind + shadcn/ui 的组合在 Proma 项目中已验证，且 shadcn/ui 组件直接依赖 Tailwind。

## 影响

- 包管理使用 **bun**（替代 pnpm，更快的安装和运行速度）
- 构建产出由 Vite 管理，Tauri 通过 `frontendDist: ../dist` 引用
- shadcn/ui 组件复制到 `src/components/ui/`
- Jotai atoms 集中在 `src/atoms/` 目录

## 相关文档

- `2026-05-08-decision-j-gui-ui-architecture.md` — UI 组件架构
- `2026-05-08-decision-j-gui-ipc-dataflow.md` — 事件驱动的状态更新
