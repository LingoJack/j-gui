# tdd-coverage 验收报告

## 范围

- [x] 只覆盖 roadmap Phase D 条目 `tdd-coverage`
- [x] 只收口当前最薄弱、最值钱的命令层测试面
- [x] 不把本项夸大成“全仓测试补平”或“覆盖率工程完成”

> 关联方案 doc：`.codestable/features/2026-05-12-tdd-coverage/tdd-coverage-design.md`

## 本轮翻正的真相

`2026-05-10` 的 backend coverage explore 作为当时快照有价值，但到 `2026-05-12` 已经部分过时：

- `alias.rs` 不再是零测试，已有基础排序、字段映射和 kernel 错误传播测试
- `config.rs` 不再是零测试，已有 `_impl` 层字段映射、脱敏回填和错误传播测试
- `system.rs` 不再是零测试，已有 `get_version_impl` / `set_theme_impl` 委托测试

所以本项的真实目标不再是“把旧 explore 里列的零测试文件全部补平”，而是：

1. 把旧口径正式翻成当前真相
2. 对当前仍明显偏薄的 `chat.rs` 命令层补最小高价值锚点

## 本轮新增回归锚点

### 1. Chat 会话生命周期

新增 `src-tauri/src/commands/chat.rs` 测试：

- `test_session_lifecycle_round_trip`

覆盖点：

- `create_session()` 创建的会话能被 `list_sessions()` 看到
- 新会话 `get_messages()` 初始为空
- `delete_session()` 后该会话从列表中消失

这组测试的价值不在“功能难”，而在于它为最常见命令层生命周期留下一条默认门禁里的回归锚点。

### 2. stop-generation 命令态状态

新增 `src-tauri/src/commands/chat.rs` 测试：

- `test_stop_generation_marks_and_clears_session_state`
- `test_stop_generation_rejects_invalid_session_id`

覆盖点：

- `stop_generation()` 会把 session 记入命令层停止状态
- `is_session_stopped()` 能观察到该状态
- `clear_stopped_session()` 能清理该状态
- 非法 session id 不会被静默接受

这组测试补的是**命令层局部状态语义**。这类状态如果没有单测，容易在后续整理或重构时悄悄漂掉，而当前默认门禁未必能从更高层及时发现。

## 仍未覆盖的范围

本轮明确没有处理：

- `send_message` 流式链路的更重型后端命令测试
- 全仓所有命令文件的正常流/异常流矩阵补平
- 覆盖率数字统计或阈值门禁

因此 `tdd-coverage` 的 `done` 语义应理解为：

- 已建立“按当前真相持续收口”的 Phase D 基线
- 不是“仓库测试覆盖问题已经彻底解决”

## 验证

- [x] `python .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-12-tdd-coverage/tdd-coverage-checklist.yaml --yaml-only`
- [x] `bash scripts/check_lint.sh`

`check_lint.sh` 结果：

- 默认门禁通过
- 新增测试进入 `cargo test` 主路径并通过
- 仅保留仓库既有 WARN：
  - `src-tauri/src/chat_engine.rs` 文件偏长
  - `src-tauri/src/tests/chat_engine.rs` 文件偏长
  - `src-tauri/src/agent_session_replay.rs::timeline_to_sdk_messages` 函数偏长

这些 WARN 都不是本轮改动引入。

## 结论

- [x] `tdd-coverage` 本轮最小收口已完成
- [x] 旧 coverage 口径已按当前代码真相翻正
- [x] `chat.rs` 命令层新增了会话生命周期与 stop-generation 的高价值回归锚点
- [x] 默认门禁通过，未引入新的 FAIL/WARN

后续若继续推进测试覆盖，应以新的局部真相为输入继续做“持续收口”，而不是回到“零测试清单一次性补平”的旧叙事。
