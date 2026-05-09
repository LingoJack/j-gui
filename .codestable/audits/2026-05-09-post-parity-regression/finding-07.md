---
doc_type: audit-finding
audit: 2026-05-09-post-parity-regression
finding_id: "arch-drift-07"
nature: arch-drift
severity: P1
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 07：stream-json 协议解析过于脆弱，缺少输入消毒和错误隔离

## 速答

`agent_engine.rs` 中 `parse_sdk_line`/`parse_assistant_event`/`parse_user_event`/`parse_plan_event` 四个函数构成了 Claude CLI stream-json 协议的解析层。当前实现存在多个脆弱点：

1. 字段访问不做类型检查（`v["type"].as_str()`）
2. 缺失字段用 `unwrap_or("")` 静默接收
3. 对未知消息类型静默丢弃（见 finding-05）
4. 没有针对 CLI 输出格式变更的版本检测或预处理

## 关键证据

- `agent_engine.rs:341` — `v["type"].as_str().unwrap_or("")` — 空 type 不报错
- `agent_engine.rs:368` — `item["id"].as_str().unwrap_or("")` — 空 tool_id 导致前端显示空卡片
- `agent_engine.rs:369` — `item["name"].as_str().unwrap_or("")` — 空 tool_name 导致前端显示""
- `agent_engine.rs:397` — `item["tool_use_id"].as_str().unwrap_or("")` — 空 tool_use_id 丢失引用
- `agent_engine.rs:355` — `content.as_array()` 只处理 array，非 array 时静默跳过

## 影响

Claude CLI 版本更新或输出格式微调时，Agent 可能静默降级或产生空白 UI，用户难以排查。

## 修复方向

1. 对解析失败的关键字段（type/id/name）发出 Error 事件而非静默继续
2. 引入协议版本检测——在 stdout 的第一行检测 CLI 版本或输出格式声明
3. 为 `parse_assistant_event` 添加 content 类型未知时的回退显示
