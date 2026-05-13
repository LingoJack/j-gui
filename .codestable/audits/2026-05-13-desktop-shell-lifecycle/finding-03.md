---
doc_type: audit-finding
date: 2026-05-13
severity: P1
category: maintainability
confidence: high
file: src/lib/global-shortcut-manager.ts
line: 16
---

# Finding-03: 全局显示主界面快捷键只实现了“显示当前窗口”，没有接到完整桌面存在态

## 证据

`src/lib/global-shortcut-manager.ts:16-35` 当前恢复逻辑只有：

```ts
await window.unminimize();
await window.show();
await window.setFocus();
```

这说明它的模型是“已经有一个当前窗口对象，只需要把它拉回前台”。代码里没有：

- 关闭后转驻留态的前置保证
- 从驻留态恢复主窗口的专门生命周期入口
- 托盘/Dock 动作与该快捷键的统一恢复路径

`src/main.tsx:30,257` 和 `src/components/shortcuts/GlobalShortcuts.tsx:115-159` 证明这个快捷键确实接入了应用启动，但接入的是当前这条局部恢复逻辑，不是完整桌面壳层模型。

## 影响

- 这条快捷键当前更像“显示当前主窗口”，不是“显示主界面”。
- UI 名称、用户预期和宿主真实语义之间存在漂移。
- 后续一旦加入托盘保活，当前逻辑很可能还要再拆一次。

## 建议动作

跟随 `desktop-presence-lifecycle` 一并处理，把恢复动作抽成桌面生命周期薄层，而不是继续塞在快捷键管理器里。
