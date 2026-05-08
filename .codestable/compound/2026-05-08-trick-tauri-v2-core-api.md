---
doc_type: trick
type: library
slug: tauri-v2-core-api
topic: Tauri v2 核心 API——Commands、State、Channels、Events
status: active
created: 2026-05-08
framework: tauri
language: rust, typescript
tags: [tauri-v2, commands, state, channels, events, ipc]
source: Context7 /websites/v2_tauri_app
---

# Tauri v2 核心 API 参考

> 所有 API 确认自 Tauri v2 官方文档（Context7: `/websites/v2_tauri_app`），避免凭 Tauri v1 经验猜测。

## 1. Commands（前端 → 后端）

### 1.1 基础 Command

```rust
// src-tauri/src/lib.rs
#[tauri::command]
fn my_command(message: String) {
    println!("from JS: {}", message);
}
```

```typescript
// 前端调用
import { invoke } from '@tauri-apps/api/core';
await invoke('my_command', { message: 'hello' });
```

### 1.2 带 Result 的 Command（推荐）

```rust
#[tauri::command]
fn login(user: String, password: String) -> Result<String, String> {
    if user == "tauri" && password == "tauri" {
        Ok("logged_in".to_string())
    } else {
        Err("invalid credentials".to_string())
    }
}
```

前端自动映射：`Ok` → Promise resolve / `Err` → Promise reject。

### 1.3 Async Command

```rust
#[tauri::command]
async fn my_async_command(value: String) -> String {
    some_async_function().await;
    value
}
```

**关键约束**：async command 不能接受借用参数（`&str`, `&[u8]`），必须用 owned 类型（`String`, `Vec<u8>`）。`Result` 是必须的。

### 1.4 Command 注入：State + AppHandle + Window

```rust
#[tauri::command]
async fn send_message(
    app_handle: tauri::AppHandle,         // 全局句柄
    window: tauri::Window,                 // 当前窗口
    state: tauri::State<'_, MyState>,      // 托管状态
    content: String,                       // 业务参数
) -> Result<(), String> {
    // ...
}
```

注入顺序无关，Tauri 自动识别。可注入的类型：`AppHandle`, `Window`, `State<T>`, `Channel<T>`。

## 2. State Management（托管状态）

### 2.1 注册 State

```rust
use std::sync::Mutex;

struct AppState {
    counter: u32,
}

fn main() {
    tauri::Builder::default()
        .manage(Mutex::new(AppState { counter: 0 }))  // 注册
        .run(tauri::generate_context!())
        .unwrap();
}
```

### 2.2 在 Command 中访问

```rust
#[tauri::command]
fn increase(state: tauri::State<'_, Mutex<AppState>>) -> u32 {
    let mut state = state.lock().unwrap();
    state.counter += 1;
    state.counter
}
```

### 2.3 在非 Command 上下文访问（通过 AppHandle）

```rust
use tauri::Manager;

fn on_event(app_handle: &AppHandle) {
    let state = app_handle.state::<Mutex<AppState>>();
    let mut state = state.lock().unwrap();
    // ...
}
```

**关键**：`AppHandle` 和 `Window` 都实现了 `Manager` trait，可以 `.state::<T>()` 获取托管状态。

## 3. Channels（流式推送 — 官方推荐）

> "Tauri channel is the recommended mechanism for streaming data from the backend to the frontend."
> "The event system is not suitable for low-latency or high-throughput scenarios."

### 3.1 Rust 端：定义 Channel 命令

```rust
use tauri::ipc::Channel;
use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
enum ChatEvent {
    Chunk { index: u32, content: String },
    ToolCall { tool_name: String, tool_input: String },
    ToolResult { tool_name: String, tool_output: String, success: bool },
    Done { total_tokens: u32 },
}

#[tauri::command]
async fn send_message(
    session_id: String,
    content: String,
    on_event: Channel<ChatEvent>,
) -> Result<(), String> {
    // 流式推送
    for (i, chunk) in chunks.iter().enumerate() {
        on_event.send(ChatEvent::Chunk {
            index: i as u32,
            content: chunk.clone(),
        }).map_err(|e| e.to_string())?;
    }
    on_event.send(ChatEvent::Done { total_tokens: 100 }).map_err(|e| e.to_string())?;
    Ok(())
}
```

### 3.2 前端：接收 Channel

```typescript
import { invoke, Channel } from '@tauri-apps/api/core';

type ChatEvent =
  | { event: 'chunk'; data: { index: number; content: string } }
  | { event: 'toolCall'; data: { toolName: string; toolInput: string } }
  | { event: 'toolResult'; data: { toolName: string; toolOutput: string; success: boolean } }
  | { event: 'done'; data: { totalTokens: number } };

const onEvent = new Channel<ChatEvent>();
onEvent.onmessage = (message) => {
  switch (message.event) {
    case 'chunk':
      appendToMessage(message.data.content);
      break;
    case 'done':
      finishStreaming();
      break;
  }
};

await invoke('send_message', {
  sessionId: 'abc',
  content: 'hello',
  onEvent,  // Channel 作为参数传入
});
```

### 3.3 Channel vs Events 对比

| | Channel | Events |
|---|---|---|
| 类型安全 | ✅ 泛型 `<T>` | ❌ 始终 JSON string |
| 顺序保证 | ✅ 有序 | ❌ 不保证 |
| 低延迟 | ✅ 优化 | ❌ 不适合 |
| 适用场景 | 流式数据（Chat、文件传输） | 全局通知（主题变更、窗口事件） |
| 生命周期 | Command 内 | 全局，跨 Command |
| Capabilities 控制 | ✅ 可细粒度控制 | ❌ 无 |

**结论**：Chat 流式用 Channel；全局通知（如 `theme-changed`）用 Events。

## 4. Events（全局通知 — 非流式场景）

### 4.1 Rust 端 emit

```rust
use tauri::Emitter;

#[tauri::command]
fn set_theme(app: tauri::AppHandle, theme: String) -> Result<(), String> {
    app.emit("theme-changed", theme).map_err(|e| e.to_string())?;
    Ok(())
}
```

### 4.2 前端 listen

```typescript
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen<string>('theme-changed', (event) => {
    console.log('theme:', event.payload);
});

// 组件卸载时取消监听
// unlisten();
```

**注意**：Events 的 payload 始终是 JSON，没有类型安全。

## 5. 已知约束 / 常见坑

- **lib.rs 的 command 不能标记 `pub`**——Tauri 的 glue code 生成有此限制
- **Async command 不能用 `&str`**——必须用 `String`，因为跨 await 借用不合法
- **State 的 Mutex 选择**：async command 用 `tokio::sync::Mutex`，sync command 用 `std::sync::Mutex`
- **Channel 在 command 返回时自动关闭**——前端 `onmessage` 不再收到新消息
- **Channel 的 send 可能失败**——需要处理 `Result`，通常映射为 `String` 错误

## 相关文档

- Tauri v2 官方文档：https://v2.tauri.app
- `2026-05-08-decision-j-gui-ipc-dataflow.md` — **需更新**：应改用 Channel 而非 emit 做流式推送
- `../../roadmap/j-gui-desktop-app/j-gui-desktop-app-roadmap.md` 第 4.2 节 — **需更新**：接口契约应改为 Channel 模式
