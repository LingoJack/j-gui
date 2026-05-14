# Attention

本文件是 CodeStable 技能启动必读的项目注意事项入口。所有 CodeStable 子技能开始工作前必须读取它。

## 项目碎片知识

<!-- cs-note managed: 用 cs-note 维护，新条目按下面分节追加 -->

### 编译与构建

- 前端包管理用 **bun**（非 npm/yarn/pnpm）
- 默认合规检查入口是 `bash scripts/check_lint.sh`；完成任务、交付子代理结果、或收尾前都先跑它
- 前端测试必须用 `bun run test`（即 vitest run）——`bun test` 不走 vitest 配置，组件测试因缺 jsdom 会失败
- GitHub Actions 默认工作流是 `.github/workflows/desktop-ci.yml`：Ubuntu 跑 `bash scripts/check_lint.sh`；Linux 上传 `deb/rpm/AppImage/snapshot tar.gz`，Windows 上传安装包 + portable zip，macOS 上传各架构 bundle；tag 推送会自动挂 GitHub Release 资产

### 运行与本地起服务

- 启动开发环境：`bun run tauri dev`（不是 `cargo tauri dev`——cargo-tauri CLI 未安装，用 bun 自带的 `@tauri-apps/cli`）

### 路径与目录约定

- j-gui 当前通过 crates.io 依赖 `j-cli` crate（见 `src-tauri/Cargo.toml`），不再默认使用本地源码路径依赖方式
- j-cli 的数据目录为 `~/.jdata/`（由 `j_cli::constants` 定义）
- j-cli 的 agent 配置位于 `~/.jdata/agent/data/agent_config.json`

### 其他

- Rust 编码规约详见 `compound/2026-05-08-decision-rust-coding-conventions.md`
- 注释规范以 `AGENTS.md` / `CLAUDE.md` 为准；这里不重复抄写，只有项目特有注释约定才追加到本文件
- **Agent API key 环境变量泄露风险**：Claude CLI 子进程的 `ANTHROPIC_API_KEY` 通过 `cmd.env()` 设置，当前用户下的其他进程可通过 `/proc/<pid>/environ`（Linux）或进程环境 API（Windows）读取该 key。已知 tradeoff = 《Claude CLI 的官方认证方式》，子进程生命周期短，单用户桌面场景可接受
- **Roadmap 进度报告**：每完成一个 roadmap item 并提交后，必须输出量化进度（已完成/总数、P0 完成数、当前解锁的下游项）
- **jcli 已知警告**：`jcli/src/command/chat/remote/bridge.rs` 有 `unused import: std::process::Child`，每次编译 j-gui 都会显示 `warning: j-cli (lib) generated 1 warning`——这是 jcli 仓库代码，j-gui 不能修，忽略即可
- **Cargo.lock 失效**：修改 `src-tauri/Cargo.toml` 中的 `j-cli` 版本或依赖来源后，若 cargo 报依赖解析错误，需删除 `src-tauri/Cargo.lock` 后重试 `cargo check`
- **Windows 路径引号**：`cargo test/clippy/check --manifest-path` 参数中的路径必须用双引号包裹，否则 PowerShell/Bash 混合环境下会解析失败（`error: manifest path '...' does not exist`）
