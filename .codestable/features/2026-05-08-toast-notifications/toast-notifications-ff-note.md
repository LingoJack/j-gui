---
doc_type: feature-ff-note
feature: toast-notifications
date: 2026-05-08
tags: [frontend, toast, error-handling, ui]
---

## 做了什么
实现轻量 Toast 通知系统（纯 Jotai atom + Tailwind，零外部依赖）。统一替换 ChatView/LeftSidebar 中所有 `// silently fail` 的 catch 块，用户现在能看到 API 错误/网络超时/会话操作失败等提示。

## 改了哪些
- `src/atoms/toast.ts` — 新增 toastsAtom + registerToast + toast() 导出的全局调用
- `src/components/ui/Toast.tsx` — 新增 ToastContainer（fixed bottom-right, 4s 自动消失, error/success/info 三色）
- `src/components/app-shell/AppShell.tsx` — 挂载 ToastContainer
- `src/components/chat/ChatView.tsx` — error event + catch 块接入 toast()
- `src/components/app-shell/LeftSidebar.tsx` — 创建/切换/删除会话失败时 toast()

## 怎么验证的
tsc 零错误。
