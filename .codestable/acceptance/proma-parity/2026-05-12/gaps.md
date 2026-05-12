# Parity Gaps（2026-05-12）

## 仍未追平的主要缺口

基于当前 `proma-parity-acceptance.md`，本轮 evidence pass 之后仍保留的主要 gap：

1. Shell / Sidebar
   - Agent Working / pinned 区域
   - 未查看完成状态
   - 工作区能力提示细节
2. Tabs Workspace
   - hover 预览
   - 拖拽重排体验
3. Chat Experience
   - Chat 工具活动提示和工具块渲染仍未判 Pass
   - Agent 推荐入口仍未判 Pass
4. Agent Experience
   - slash runtime 选择
   - Permission / AskUser / ExitPlanMode parity UI
   - Context 用量
   - 无回应处理
   - 单工作区文件上下文
5. Search Navigation
   - 归档标识
6. Settings Console
   - Chat 工具 parity
   - Dialog/导航/脏状态保护等细节
7. File Context
   - 目录添加
   - 文件 mention

## 输入层缺口

1. `j-gui-proma-parity.md` requirement 缺失
2. `proma-parity-implementation-spec.md` 缺失
3. `proma-parity-matrix.yaml` 缺失
4. 旧 `2026-05-09` evidence index 结论与当前 parity reference 明显冲突，需要视为过期快照

## 后续建议

- 继续保持这轮 evidence 结论真实，不把 `Partial / Fail` 提前翻成 `Pass`
- 若继续推进 parity 功能，建议优先从 `Agent Experience` 和 `File Context` 的 Fail 项入手
