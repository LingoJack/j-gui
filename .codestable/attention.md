# Attention

本文件是 CodeStable 技能启动必读的项目注意事项入口。所有 CodeStable 子技能开始工作前必须读取它。

## 项目碎片知识

<!-- cs-note managed: 用 cs-note 维护，新条目按下面分节追加 -->

### 编译与构建

- 前端包管理用 **bun**（非 npm/yarn/pnpm）
- Rust 代码（`src-tauri/`）必须通过 `cargo fmt` 格式化 + `cargo clippy -- -D warnings` 零告警
- 前端 TypeScript 检查：`bunx tsc --noEmit`

### 运行与本地起服务

- 启动开发环境：`bun run tauri dev`（不是 `cargo tauri dev`——cargo-tauri CLI 未安装，用 bun 自带的 `@tauri-apps/cli`）

### 路径与目录约定

- j-cli 源码位于 `E:\Coding\AI\j`，j-gui 通过 `j-cli = { path = "../../j" }` 依赖
- j-cli 的数据目录为 `~/.jdata/`（由 `j_cli::constants` 定义）
- j-cli 的 agent 配置位于 `~/.jdata/agent/data/agent_config.json`

### 其他

- Rust 编码规约详见 `compound/2026-05-08-decision-rust-coding-conventions.md`
