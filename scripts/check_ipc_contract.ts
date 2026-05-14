const ipcTs = new URL('../src/lib/ipc.ts', import.meta.url)
const tauriLib = new URL('../src-tauri/src/lib.rs', import.meta.url)

const commandPattern = /(?:tryInvoke|invoke)\(\s*['"]([^'"]+)['"]/g
const registerPattern = /commands::[a-z_]+::([a-zA-Z0-9_]+)/g
const generateHandlerPattern = /tauri::generate_handler!\[([\s\S]*?)\]\s*\)/m

const allowedFrontendOnlyCommands = new Set([
  'reinit_runtime',
  'stop_task',
  'save_task_pending_files_state',
  'save_memory_config',
  'set_memory_config',
  'notify_tray_send_message',
  'notify_tray_new_agent_session',
  'migrate_chat_to_agent',
])

function collectMatches(source: string, pattern: RegExp): Set<string> {
  const results = new Set<string>()
  for (const match of source.matchAll(pattern)) {
    const value = match[1]
    if (value && !value.startsWith('plugin:')) {
      results.add(value)
    }
  }
  return results
}

function collectRegisteredCommands(source: string): Set<string> {
  const handlerMatch = source.match(generateHandlerPattern)
  if (!handlerMatch) {
    throw new Error('未找到 tauri::generate_handler! 注册块')
  }
  return collectMatches(handlerMatch[1], registerPattern)
}

const frontendCommands = collectMatches(await Bun.file(ipcTs).text(), commandPattern)
const registeredCommands = collectRegisteredCommands(await Bun.file(tauriLib).text())

const missing = [...frontendCommands]
  .filter((command) => !registeredCommands.has(command) && !allowedFrontendOnlyCommands.has(command))
  .sort()

if (missing.length === 0) {
  console.log(
    `IPC contract 校验通过：前端命令已完成注册，允许保留的前端占位命令 ${allowedFrontendOnlyCommands.size} 个。`,
  )
} else {
  console.error('IPC contract 校验失败：以下前端命令未在 Rust generate_handler 注册：')
  for (const command of missing) {
    console.error(`  - ${command}`)
  }
  throw new Error('IPC contract 校验失败')
}
