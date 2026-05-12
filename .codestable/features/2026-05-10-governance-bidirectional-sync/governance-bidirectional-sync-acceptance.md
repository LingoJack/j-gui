# governance-bidirectional-sync 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-12
> 关联方案 doc：`.codestable/features/2026-05-10-governance-bidirectional-sync/governance-bidirectional-sync-design.md`

## 1. 边界核对

- [x] 本项只覆盖 Skills / Hooks / MCP / workspace 治理真相，不再混入 ToolSettings runtime
- [x] 正式命令面已限定为 `list_skills`、`scan_global_skills`、`copy_skill_to_workspace`、`read_skill_content`、`write_skill_content`、`toggle_workspace_skill`、`delete_workspace_skill`、`get_workspace_skills`、`get_workspace_skills_dir`、`get_other_workspace_skills`、`import_skill_from_workspace`、`list_hooks`、`toggle_hook`、`list_mcp_servers`、`save_mcp_servers`、`get_workspace_mcp_config`、`save_workspace_mcp_config`、`import_cc_sdk_hooks`、`import_cc_sdk_mcp`
- [x] `src/lib/ipc.ts` 对治理入口不再伪造 fallback 成功；治理相关命令失败会向 UI 暴露真实错误

## 2. 代码真相核对

- [x] Tauri 注册面与治理命令面一致
  - 证据来源：`src-tauri/src/lib.rs`
- [x] `GovernanceKernel` / `adapter_governance.rs` 覆盖 Skills / Hooks / MCP / workspace 的真实读写路径
  - 证据来源：`src-tauri/src/kernel/governance.rs`、`src-tauri/src/kernel/adapter_governance.rs`
- [x] `get_workspace_capabilities` 现在按 `skill slug` 判断禁用状态，不再把展示名误当持久化键
  - 证据来源：`src-tauri/src/commands/governance_mcp.rs`
- [x] 工作区 Skills / MCP 写操作会触发前端能力刷新事件，避免 Settings 与侧栏能力视图长期停留在旧状态
  - 证据来源：`src/lib/ipc.ts`、`src/main.tsx`
- [x] Skills 启停真相已明确为“工作区目录 + 全局 `disabled_skills` 共享开关”
  - 证据来源：`src-tauri/src/kernel/governance.rs`、`.codestable/features/2026-05-08-skills-ui/skills-ui-design.md`

## 3. 验收场景核对

- [x] **A1**：Skills tab 编辑内容并保存
  - 证据来源：`write_skill_content` 直写工作区 `skills/<slug>/SKILL.md`；前端保存后会触发 `workspace:capabilities-changed` 与 `workspace:files-changed`
- [x] **A2**：Skills tab 启停切换
  - 证据来源：`toggle_workspace_skill` 写入共享 `agent_config.disabled_skills`；`get_workspace_capabilities` 读取同一持久化源，并按当前工作区 skill slug 反映启停状态
- [x] **A3**：MCP tab 添加/编辑/删除 server
  - 证据来源：`save_workspace_mcp_config` 持久化到工作区 `mcp.json`，并通过能力刷新事件同步 UI
- [x] **A4**：Hooks tab 切换启停
  - 证据来源：`toggle_hook` 写入 `agent_config.disabled_hooks`；`list_hooks` 使用同一配置源反推 enabled 状态
- [x] **A5**：导入 CC SDK 配置
  - 证据来源：`import_cc_sdk_hooks` / `import_cc_sdk_mcp` 已通过正式后端命令暴露，不再依赖前端拼装
- [x] **A6**：查看 ToolSettings
  - 证据来源：治理设计/roadmap/acceptance 已明确把 ToolSettings runtime 拆到独立 feature，不再作为本项完成标准

## 4. 自动化验证

- [x] `src/__tests__/ipc.test.ts`
  - 覆盖工作区治理写操作触发能力/文件刷新事件
- [x] `src-tauri/src/commands/governance_mcp.rs`
  - 新增针对 `disabled_skills` 与 `skill slug` 对齐的测试，防止工作区能力真相回退
- [x] `src-tauri/src/kernel/adapter_governance.rs`
  - 通过串行 `ignored` 测试覆盖工作区 Skill 内容读写、共享 `disabled_skills` 启停持久化、workspace MCP 配置落盘、`disabled_hooks` 持久化，以及 CC SDK hooks/MCP 导入读取

本次实际执行过的验证：

- [x] 默认仓库门禁：`bash scripts/check_lint.sh`
- [x] 额外串行持久化验收：

```bash
cargo test --manifest-path "src-tauri/Cargo.toml" governance_ -- --ignored --test-threads=1 --nocapture
```

结果：3 个治理持久化测试通过，覆盖 Skill 内容、共享 `disabled_skills`、workspace MCP、`disabled_hooks` 与 CC SDK 导入的真实磁盘 round-trip。

## 5. 当前结论

- `step-4 acceptance 范围拍定`：已完成
- `step-5 持久化验收`：已完成

当前判断：

- 本项的“完成标准是什么”已经翻正
- 代码真相与 roadmap 边界已对齐
- 默认门禁 + 额外串行持久化验收都已执行，证据足以把 roadmap item 从 `in-progress` 翻为 `done`

## 6. 额外说明

- 本次主要补的是可重复运行的真实磁盘 round-trip 测试，而不是依赖一次性的手点记录
- 其中环境敏感的治理持久化测试标记为 `ignored`，需要用 `cargo test --manifest-path "src-tauri/Cargo.toml" governance_ -- --ignored --test-threads=1 --nocapture` 串行执行，避免污染默认全量 Rust 测试
- 这也意味着治理持久化 round-trip 目前还没有并入默认 `cargo test` 主路径；后续若要把这块进一步收紧成“默认门禁即覆盖”，应放到 `runtime-observability-gates` 继续处理
- Skills 启停当前不是 per-workspace 独立开关表；当前真相是共享 `disabled_skills` + 工作区独立技能目录。这一边界已在 design / acceptance 中显式写明
- 本次不修改 jcli 代码，也不把 ToolSettings runtime 能力重新混回治理项
