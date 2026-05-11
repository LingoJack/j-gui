---
doc_type: audit-finding
audit: 2026-05-11-roadmap-completeness
finding_id: "03"
severity: P1
category: bug
confidence: medium
suggested_action: cs-refactor
files: [src/components/chat/ChatView.tsx, src/components/app-shell/LeftSidebar.tsx, src/components/agent/AgentView.tsx, src/main.tsx]
---

# Finding 03: 29+ 处 .catch(console.error) 无用户感知

## 位置

代表位置：
- `src/main.tsx:120,131,155,197`
- `src/components/chat/ChatView.tsx:175,430,552,561`
- `src/components/app-shell/LeftSidebar.tsx:302,365,369,373,380,381`
- `src/components/agent/AgentView.tsx:290,403,452`
- `src/components/chat/ModelSelector.tsx:106,197`
- `src/components/settings/PromptSettings.tsx:54`

## 证据

```typescript
// 典型模式
fetchModels(channelId).catch(console.error)
stopAgent(sessionId).catch(console.error)
updateConversationTitle(id, title).catch(console.error)
```

所有错误仅输出到浏览器开发者控制台，终端用户完全看不到。对于用户触发的操作（stop generation、load channels、update settings），错误发生后用户完全不知道操作失败了。

## 影响

与 Finding 02 形成复合效应：IPC 调用失败 → tryInvoke 返回默认值（用户看到空数据）→ catch 只打 console.error（用户无任何提示）。从用户视角看，"操作正常执行了，但结果显示空"，这是最差的 UX——让用户困惑而非明确告知失败。

## 建议

开 `cs-refactor`：
1. 创建一个 `logAndToast(context: string)` 辅助函数
2. 对用户触发的操作（stop、save、delete、update），使用 toast.error 通知用户
3. 对后台自动操作（list refresh、badge update），保留 console.error 即可
