---
doc_type: audit-finding
audit: 2026-05-11-roadmap-completeness
finding_id: "14"
severity: P2
category: performance
confidence: medium
suggested_action: cs-refactor
files: [src/components/settings/ChannelForm.tsx]
---

# Finding 14: ChannelForm auto-save effect 依赖数组导致每次按键都触发

## 位置

`src/components/settings/ChannelForm.tsx:233-236`

## 证据

```typescript
useEffect(() => {
  if (!isEdit) return
  scheduleAutoSave()
}, [models, name, provider, baseUrl, apiKey, enabled, scheduleAutoSave])
```

此 effect 对 `models`、`name`、`provider`、`baseUrl`、`apiKey`、`enabled` 有显式依赖——意味着每次按键（name、baseUrl、apiKey）和每次状态变化（models、provider、enabled）都会触发 effect。

每次触发执行 `clearTimeout` + `scheduleAutoSave`（重新注册 debounce 定时器）。debounce 定时器本身防止了重复保存，但 effect 的清理/重新注册在每个 React 渲染周期都发生。

## 分析

`scheduleAutoSave` 从闭包中读取当前字段值，因此本只需要 `[scheduleAutoSave]` 作为依赖。当前的多字段依赖是冗余的——不会导致功能错误，但造成不必要的 effect 重复执行。

## 建议

开 `cs-refactor`：将依赖数组简化为 `[scheduleAutoSave]`。`scheduleAutoSave` 的 `useCallback` 已有 `[isEdit, doAutoSave]` 依赖，足够触发重新注册。
