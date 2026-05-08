---
doc_type: requirement
slug: j-gui-personalization
pitch: 选模型、换主题、管别名，把 j-gui 调成自己顺手的样子
status: current
last_reviewed: 2026-05-08
implemented_by: [commands/config]
tags: [configuration, theme, alias]
---

# 配置与个性化

## 用户故事

- 作为一个白天写代码晚上也写代码的人，我希望一键切暗色主题，不用盯着白底界面到眼睛疼。
- 作为一个在不同模型间切换的人，我希望在聊天界面顶部就能换模型，而不是去改配置文件。
- 作为一个给常用命令起了别名的人，我希望在 GUI 里管理它们——添加、修改、删除——不用去终端里跑命令。

## 为什么需要

j-cli 的配置都在 YAML 和 JSON 文件里，改个模型或别名要开编辑器对着文档改。桌面端可以把这些操作做成表单和开关，改完即时生效。主题切换是桌面应用的基本预期——用户打开第一眼看到亮色界面而系统是暗色，第一印象就坏了。

## 怎么解决

设置对话框分标签页组织：通用（主题、语言）、模型（provider、model 选择）、别名（列表 + 添加/编辑/删除）。配置修改通过 Tauri 命令同步到 j-cli 的数据目录，两边保持一致。主题切换即时生效，通过 CSS 变量驱动全局配色。

## 边界

- 不修改 j-cli 的配置格式——读写的还是同一个 `config.yaml` 和 `agent_config.json`。
- 不提供多 profile 切换（如 work/home 两套配置）。
- 不管理 API key 的加密存储——key 仍由 j-cli 管理。
- 主题只有暗/亮两套，不提供自定义配色。
