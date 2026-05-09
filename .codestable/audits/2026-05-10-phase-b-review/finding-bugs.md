---
doc_type: audit-finding
audit: phase-b-review
dimension: bug
date: 2026-05-10
---

# Bug 隐患 — 8 项

## B1: TOCTOU race in all system prompt modification commands

- **严重度**: P1 · **置信度**: high · **文件**: settings.rs:679-755
- **建议动作**: cs-issue

**证据**: 所有 system prompt 修改命令遵循相同模式：
```rust
let mut config = load_system_prompts_config();  // 无锁读取
// ... 修改 config ...
save_system_prompts_config(&config)?;            // 仅在写入时加锁
```
在步骤 (1) 和 (3) 之间 `SYSTEM_PROMPT_LOCK` 未持有，并发线程可在此窗口读取修改前数据，写入时覆盖第一个线程的修改。锁应加在读取前而非写入前。影响全部 5 条命令。

---

## B2: save_system_prompts_config force-acquires poisoned mutex

- **严重度**: P1 · **置信度**: high · **文件**: settings.rs:626-629
- **建议动作**: cs-issue

**证据**:
```rust
let _lock = SYSTEM_PROMPT_LOCK.lock().unwrap_or_else(|e| e.into_inner());
```
对比 governance.rs 的正确模式：
```rust
let _lock = MCP_CONFIG_LOCK.lock().map_err(|e| format!("锁定失败: {}", e))?;
```
强制获取 poisoned mutex 绕过 Rust 并发安全保证，可能在损坏数据上操作。

---

## B3: Corrupted prompts config silently returns defaults without healing

- **严重度**: P2 · **置信度**: medium · **文件**: settings.rs:603-615
- **建议动作**: cs-issue

**证据**:
```rust
.unwrap_or_else(create_default_system_prompt_config)  // 返回默认值但不写回磁盘
```
文件存在但损坏时，每次调用都静默返回默认值，损坏永不修复。`else` 分支的 `let _ = save_system_prompts_config_inner(&config)` 也吞掉写入错误。

---

## B4: load_settings reads without lock while update_settings writes

- **严重度**: P2 · **置信度**: medium · **文件**: settings.rs:152-368
- **建议动作**: cs-issue

load_settings() 和 save_settings() 零同步——无 mutex、无原子重命名。Tauri 命令在线程池上并发执行，读-写冲突和写-写覆盖均可能发生。对比 governance.rs 中 save_mcp_servers 使用 MCP_CONFIG_LOCK，settings 完全裸奔。

---

## B5: settings_dir() fallback writes to CWD

- **严重度**: P2 · **置信度**: high · **文件**: settings.rs:5-7
- **建议动作**: cs-issue

```rust
fn settings_dir() -> PathBuf {
    dirs_next().unwrap_or_else(|| PathBuf::from("."))
}
```
APPDATA 和 HOME 均未设置时回退到 CWD，所有配置文件写入进程工作目录，不可控且不持久。files.rs 同样问题。

---

## F1: Race condition in loadOtherWorkspaces on rapid dialog toggle

- **严重度**: P1 · **置信度**: high · **文件**: AgentSettings.tsx:228-230
- **建议动作**: cs-issue

```tsx
React.useEffect(() => {
    if (showImportDialog) void loadOtherWorkspaces()
}, [showImportDialog, loadOtherWorkspaces])
```
无清理或中止机制。快速开关导入对话框时，两次 fetch 竞态——第二次 fetch 先完成设值，之后第一次的 stale fetch 完成覆盖。需加 generation counter 或 abort controller。

---

## F2: Debounce timeout not cleaned up on PromptSettings unmount

- **严重度**: P2 · **置信度**: high · **文件**: PromptSettings.tsx:115-132
- **建议动作**: cs-issue

```tsx
debounceRef.current = setTimeout(async () => {
    await ipc.updateSystemPrompt(id, input)
    setConfig((prev) => ({ ... }))
}, DEBOUNCE_DELAY)
```
组件无 useEffect cleanup 清除 debounceRef。用户编辑后在 500ms 内离开页面，timeout 在卸载后触发，调用 setConfig 和 IPC。对比 HooksSettings.tsx 使用 cancelled flag 的正确模式。

---

## F3: IPC fallback shape mismatch for getWorkspaceMcpConfig

- **严重度**: P2 · **置信度**: medium · **文件**: ipc.ts:347-348
- **建议动作**: cs-issue

```tsx
tryInvoke('get_workspace_mcp_config', { workspaceSlug }, { mcpServers: [] })
// fallback: { mcpServers: [] }
// expected: { servers: Record<string, McpServerEntry> }
```
Fallback 返回 `{ mcpServers: [] }` 但消费者期望 `{ servers: Record<...> }`，导致 `mcpConfig.servers` 为 undefined，被 `?? {}` 守卫掩盖。
