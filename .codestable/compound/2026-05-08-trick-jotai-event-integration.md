---
doc_type: trick
type: library
slug: jotai-event-integration
topic: Jotai 核心 API——atom 类型、onMount 订阅外部事件、与 Tauri Channel/Event 集成模式
status: active
created: 2026-05-08
framework: jotai
language: typescript
tags: [jotai, atom, onmount, event-integration, tauri]
source: Context7 /websites/jotai
---

# Jotai 核心 API + Tauri 事件集成

> 所有 API 确认自 Jotai 官方文档（Context7: `/websites/jotai`）。

## 1. Atom 四种创建方式

```typescript
import { atom } from 'jotai';

// 1. Primitive atom（基础状态）
const countAtom = atom(0);

// 2. Derived read-only atom（派生只读）
const doubleAtom = atom((get) => get(countAtom) * 2);

// 3. Derived read-write atom（派生读写）
const priceAtom = atom(
  (get) => get(baseAtom) * 2,           // read
  (get, set, newPrice: number) => {     // write
    set(baseAtom, newPrice / 2);
  }
);

// 4. Write-only atom（只写，用于触发副作用）
const incrementAtom = atom(null, (get, set) => {
  set(countAtom, get(countAtom) + 1);
});
```

## 2. onMount：订阅外部事件源

> 这是集成 Tauri Channel/Event 的**核心机制**。

### 2.1 基础 onMount

```typescript
const clockAtom = atom(new Date());

clockAtom.onMount = (setAtom) => {
  const interval = setInterval(() => {
    setAtom(new Date());
  }, 1000);

  // 返回清理函数
  return () => clearInterval(interval);
};
```

### 2.2 onMount 触发条件

```typescript
// ✅ 触发 onMount——这些 hook 订阅了 atom
useAtom(anAtom);
useAtomValue(anAtom);

// ❌ 不触发 onMount——这些不订阅 atom
useSetAtom(anAtom);
useAtomCallback(useCallback((get) => get(anAtom), []));
```

**关键**：`onMount` 在第一个订阅者出现时调用，最后一个订阅者消失时调用清理函数。这天然适合 React 组件生命周期。

## 3. Tauri 集成模式

### 3.1 模式 A：Channel 流式消息 Atom

适用于 Chat 流式响应——每个 `send_message` 调用产生一个新 Channel。

```typescript
import { atom } from 'jotai';
import { Channel, invoke } from '@tauri-apps/api/core';

// ===== atoms/messages.ts =====

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming: boolean;
}

// 当前会话的消息列表
export const messagesAtom = atom<Message[]>([]);

// 流式状态（独立 atom，不触发 messages 重渲染）
export const streamingAtom = atom<{ active: boolean; sessionId: string | null }>({
  active: false,
  sessionId: null,
});

// ===== atoms/chat-actions.ts =====
// Write-only atom：发送消息
export const sendMessageAtom = atom(
  null,
  async (get, set, content: string) => {
    const sessionId = get(currentSessionIdAtom);
    if (!sessionId) return;

    // 添加用户消息
    set(messagesAtom, (prev) => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      isStreaming: false,
    }]);

    // 添加空的 assistant 消息占位
    const assistantId = crypto.randomUUID();
    set(messagesAtom, (prev) => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    }]);

    set(streamingAtom, { active: true, sessionId });

    // 创建 Channel 接收流式响应
    const onEvent = new Channel<ChatEvent>();
    onEvent.onmessage = (msg) => {
      switch (msg.event) {
        case 'chunk':
          set(messagesAtom, (prev) => prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + msg.data.content }
              : m
          ));
          break;
        case 'done':
          set(messagesAtom, (prev) => prev.map((m) =>
            m.id === assistantId ? { ...m, isStreaming: false } : m
          ));
          set(streamingAtom, { active: false, sessionId: null });
          break;
      }
    };

    try {
      await invoke('send_message', {
        sessionId,
        content,
        onEvent,
      });
    } catch (e) {
      set(streamingAtom, { active: false, sessionId: null });
      // error handling...
    }
  }
);
```

### 3.2 模式 B：Event 全局通知 Atom

适用于主题变更、配置更新等全局通知。

```typescript
import { atom } from 'jotai';
import { listen } from '@tauri-apps/api/event';

// ===== atoms/theme.ts =====

export const themeAtom = atom<'dark' | 'light'>('dark');

// onMount 在组件首次 useAtom(themeAtom) 时触发
themeAtom.onMount = (setAtom) => {
  // 订阅 Tauri 全局事件
  const init = async () => {
    const unlisten = await listen<string>('theme-changed', (event) => {
      setAtom(event.payload as 'dark' | 'light');
    });

    // 返回清理函数——所有 useAtom(themeAtom) 的组件卸载后执行
    return () => {
      unlisten();
    };
  };

  const cleanup = init();
  return () => {
    cleanup.then((fn) => fn?.());
  };
};
```

### 3.3 模式 C：Async Atom + Suspense（初始化时加载数据）

```typescript
// ===== atoms/sessions.ts =====

const sessionsAsyncAtom = atom(async () => {
  const sessions = await invoke<SessionInfo[]>('list_sessions');
  return sessions;
});

// 使用时需要 Suspense
function SessionList() {
  return (
    <Suspense fallback={<Spinner />}>
      <SessionListInner />
    </Suspense>
  );
}

function SessionListInner() {
  const [sessions] = useAtom(sessionsAsyncAtom);
  // sessions 直接是 SessionInfo[]，不是 Promise
  return <>{sessions.map(s => <SessionItem key={s.id} {...s} />)}</>;
}
```

## 4. 已知约束 / 常见坑

- **onMount 在 Provider-less 模式下全局只触发一次**——没有 `<Provider>` 时，atom 在所有组件共享同一实例，`onMount` 只在第一个订阅者挂载时触发
- **Channel 生命周期短**——每次 `invoke` 新建 Channel，command 返回后自动关闭；不要在 Channel 外部持有引用
- **useSetAtom 不触发 onMount**——如果组件只用 `useSetAtom` 不读值，`onMount` 不会触发，事件监听不会启动
- **Async atom 需要 Suspense**——否则会抛 Promise 导致白屏
- **Atom 的 write 函数中可以 set 多个 atom**——适合批量更新场景，React 会合并渲染

## 相关文档

- Jotai 官方文档：https://jotai.org
- `trick-tauri-v2-core-api.md` — Tauri v2 核心 API
- `2026-05-08-decision-j-gui-ipc-dataflow.md` — **需更新**：应使用 Channel 而非 emit 做流式
- `2026-05-08-decision-j-gui-ui-architecture.md` — atom 清单
