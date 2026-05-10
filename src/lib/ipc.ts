/**
 * Tauri IPC 模块
 *
 * 所有前端→后端的通信都通过这里。
 * 每个函数封装 Tauri invoke()，Rust 命令未实现时有 fallback 桩。
 * 不使用任何 Electron API — 纯 Tauri 实现。
 */

import { invoke, Channel } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { AppSettings, UserProfile, ThemeMode, ThemeStyle } from '@/types'

// ============================================================
// Utils
// ============================================================

const warned = new Set<string>()
function warnOnce(name: string): void {
  if (!warned.has(name)) {
    warned.add(name)
    console.warn(`[j-gui ipc] Tauri command not implemented: ${name} — using fallback`)
  }
}

async function tryInvoke<T>(cmd: string, args?: unknown, fallback?: T): Promise<T> {
  try {
    return await invoke<T>(cmd, args as any)
  } catch {
    if (fallback !== undefined) {
      warnOnce(cmd)
      return fallback
    }
    throw new Error(`Tauri command '${cmd}' not available`)
  }
}

function stubEvent(name: string) {
  return (callback: (...args: any[]) => void): (() => void) => {
    warnOnce(`event:${name}`)
    return () => {}
  }
}

// Event bus for internal events (e.g. stream events that backend pushes)
type Handler = (...args: any[]) => void
const bus = new Map<string, Set<Handler>>()
function emit(name: string, ...args: any[]): void { bus.get(name)?.forEach(h => h(...args)) }
function onEvt(name: string, cb: Handler): () => void {
  if (!bus.has(name)) bus.set(name, new Set())
  bus.get(name)!.add(cb)
  return () => { bus.get(name)?.delete(cb) }
}

// ============================================================
// Runtime
// ============================================================

export const getRuntimeStatus = () => tryInvoke('get_runtime_status', undefined, null)
export const reinitRuntime = () => tryInvoke('reinit_runtime', undefined, null)

// ============================================================
// Settings
// ============================================================

let settingsCache: AppSettings | null = null

export async function getSettings(): Promise<AppSettings> {
  if (settingsCache) return settingsCache
  try {
    settingsCache = await invoke<AppSettings>('get_settings')
    return settingsCache!
  } catch {
    settingsCache = {
      themeMode: 'dark' as ThemeMode,
      themeStyle: 'default' as ThemeStyle,
      onboardingCompleted: true,
      agentChannelIds: [],
      agentWorkspaceId: null,
      notificationsEnabled: true,
      notificationSoundEnabled: false,
      tutorialBannerDismissed: false,
      archiveAfterDays: 7,
      sendWithCmdEnter: false,
      stickyUserMessageEnabled: true,
    }
    warnOnce('get_settings')
    return settingsCache
  }
}

export async function updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
  try {
    settingsCache = await invoke<AppSettings>('update_settings', { updates })
    return settingsCache!
  } catch {
    settingsCache = { ...settingsCache!, ...updates }
    warnOnce('update_settings')
    return settingsCache
  }
}

export function updateSettingsSync(updates: Partial<AppSettings>): boolean {
  settingsCache = { ...settingsCache!, ...updates }
  return true
}

export const getSystemTheme = () => Promise.resolve(window.matchMedia('(prefers-color-scheme: dark)').matches)

export function onSystemThemeChanged(callback: (isDark: boolean) => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (e: MediaQueryListEvent) => callback(e.matches)
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}

export const onThemeSettingsChanged = stubEvent('themeSettingsChanged')

// ============================================================
// Channel Management
// ============================================================

export async function listChannels() { try { return await invoke<any[]>('list_channels') } catch { warnOnce('list_channels'); return [] } }
export async function createChannel(input: any) { return invoke<any>('create_channel', { input }) }
export async function updateChannel(id: string, input: any) { return invoke<any>('update_channel', { id, input }) }
export async function deleteChannel(id: string) { return invoke('delete_channel', { id }) }
export const decryptApiKey = (channelId: string) => tryInvoke<string>('decrypt_api_key', { channelId }, '')
export async function testChannelDirect(input: any) { try { return await invoke<any>('test_channel_direct', { input }) } catch { return { success: false, message: '连接失败' } } }
export async function fetchModels(input: any) { try { return await invoke<any>('fetch_models', { input }) } catch { return { success: false, message: '获取模型列表失败', models: [] } } }

// ============================================================
// Conversations — mapped to Rust chat commands (j-cli backend)
// ============================================================

export async function listConversations(): Promise<any[]> {
  try { return await invoke<any[]>('list_sessions') }
  catch { warnOnce('list_sessions'); return [] }
}

export async function createConversation(title?: string, _modelId?: string, _channelId?: string): Promise<any> {
  try {
    const id = await invoke<string>('create_session')
    return { id, title: title || '新对话', messageCount: 0, updatedAt: Date.now() }
  } catch { warnOnce('create_session'); throw new Error('Failed to create conversation') }
}

export async function getConversationMessages(id: string): Promise<any[]> {
  try { return await invoke<any[]>('get_session_messages', { sessionId: id }) }
  catch { warnOnce('get_session_messages'); return [] }
}
export async function getRecentMessages(id: string, limit: number): Promise<{ messages: any[]; hasMore: boolean }> {
  try {
    const raw = await invoke<any[]>('get_session_messages', { sessionId: id })
    const msgs = Array.isArray(raw) ? raw : []
    return { messages: msgs.slice(-limit), hasMore: msgs.length > limit }
  } catch { warnOnce('get_session_messages'); return { messages: [], hasMore: false } }
}
export async function updateConversationTitle(id: string, title: string) { return invoke<any>('update_conversation_title', { id, title }) }
export const updateConversationModel = (id: string, modelId: string, channelId: string) =>
  tryInvoke<any>('update_conversation_model', { id, modelId, channelId })
export const deleteConversation = (id: string) => tryInvoke('delete_session', { sessionId: id })
export const togglePinConversation = (id: string) => tryInvoke<any>('toggle_pin_conversation', { id })
export const toggleArchiveConversation = (id: string) => tryInvoke<any>('toggle_archive_conversation', { id })
export const searchConversationMessages = (query: string) => tryInvoke<any[]>('search_conversation_messages', { query }, [])
export const generateTitle = (input: any) => tryInvoke<string>('generate_title', { input }, null)
export const createWelcomeConversation = () => tryInvoke<any>('create_welcome_conversation', undefined, null)
export const getTutorialContent = () => tryInvoke<string>('get_tutorial_content', undefined, null)

// ============================================================
// Chat Messaging — Tauri Channel streaming via j-cli
// ============================================================

export async function sendMessage(input: any): Promise<void> {
  const channel = new Channel<any>()
  channel.onmessage = (event: any) => {
    if (event?.event === 'chunk' || event?.Chunk) {
      const data = event.Chunk || event.data
      emit('stream:chunk', { conversationId: input.conversationId || input.sessionId, content: data?.content || event?.content, index: data?.index })
    } else if (event?.event === 'done' || event?.Done) {
      emit('stream:complete', { conversationId: input.conversationId || input.sessionId, totalTokens: event?.Done?.total_tokens || event?.totalTokens })
    } else if (event?.event === 'error' || event?.Error) {
      emit('stream:error', { conversationId: input.conversationId || input.sessionId, error: event?.Error?.message || event?.message || 'Unknown error' })
    } else if (typeof event === 'string') {
      emit('stream:chunk', { conversationId: input.conversationId || input.sessionId, content: event, index: 0 })
    }
  }
  try {
    await invoke('send_message', {
      sessionId: input.conversationId || input.sessionId || '',
      content: input.content || input.message || '',
      onEvent: channel,
    })
  } catch (e: any) {
    emit('stream:error', { conversationId: input.conversationId || input.sessionId, error: e?.message || String(e) })
  }
}

export async function stopGeneration(sessionId: string) { try { await invoke('stop_generation', { sessionId }) } catch { warnOnce('stop_generation') } }
export const deleteMessage = (conversationId: string, messageId: string) =>
  tryInvoke<any[]>('delete_message', { conversationId, messageId }, [])
export const truncateMessagesFrom = (conversationId: string, messageId: string, preserveFirstMessageAttachments?: boolean) =>
  tryInvoke<any[]>('truncate_messages_from', { conversationId, messageId, preserveFirstMessageAttachments }, [])
export const updateContextDividers = (conversationId: string, dividers: string[]) =>
  tryInvoke<any>('update_context_dividers', { conversationId, dividers })

// ============================================================
// Stream Events (Chat)
// ============================================================

export const onStreamChunk = (cb: Handler) => onEvt('stream:chunk', cb)
export const onStreamReasoning = (cb: Handler) => onEvt('stream:reasoning', cb)
export const onStreamComplete = (cb: Handler) => onEvt('stream:complete', cb)
export const onStreamError = (cb: Handler) => onEvt('stream:error', cb)
export const onStreamToolActivity = (cb: Handler) => onEvt('stream:tool-activity', cb)

// ============================================================
// Agent Sessions
// ============================================================

export const listAgentSessions = () => tryInvoke<any[]>('list_agent_sessions', undefined, [])
export const createAgentSession = (title?: string, channelId?: string, workspaceId?: string) =>
  tryInvoke<any>('create_agent_session', { title, channelId, workspaceId })
export const getAgentSessionSDKMessages = (id: string) => tryInvoke<any[]>('get_agent_session_sdk_messages', { id }, [])
export async function updateAgentSessionTitle(id: string, title: string) { return invoke<any>('update_agent_session_title', { id, title }) }
export const deleteAgentSession = (id: string) => tryInvoke('delete_agent_session', { id })
export const migrateChatToAgent = (conversationId: string, agentSessionId: string) =>
  tryInvoke('migrate_chat_to_agent', { conversationId, agentSessionId })
export const togglePinAgentSession = (id: string) => tryInvoke<any>('toggle_pin_agent_session', { id })
export const toggleManualWorkingAgentSession = (id: string) => tryInvoke<any>('toggle_manual_working_agent_session', { id })
export const toggleArchiveAgentSession = (id: string) => tryInvoke<any>('toggle_archive_agent_session', { id })
export const searchAgentSessionMessages = (query: string) =>
  tryInvoke<any[]>('search_agent_session_messages', { query }, [])
export const moveAgentSessionToWorkspace = (input: any) =>
  tryInvoke<any>('move_agent_session_to_workspace', { input })
export const forkAgentSession = (input: any) => tryInvoke<any>('fork_agent_session', { input })
export const rewindSession = (input: any) => tryInvoke<any>('rewind_session', { input })
export async function generateAgentTitle(input: any) { try { return await invoke<string>('generate_agent_title', { input }) } catch { return null } }
// Agent active channels — one per session
const agentChannels = new Map<string, Channel<any>>()

export async function sendAgentMessage(input: any): Promise<void> {
  const sessionId = input.sessionId || input.conversationId
  const content = input.content || input.message || ''
  const permissionMode = input.permissionMode || 'bypassPermissions'

  // If no active channel for this session, start the agent first
  if (!agentChannels.has(sessionId)) {
    const channel = new Channel<any>()
    agentChannels.set(sessionId, channel)

    channel.onmessage = (event: any) => {
      // Route Claude CLI events to EventBus
      if (event?.AssistantContent || event?.assistantContent) {
        const data = event.AssistantContent || event.assistantContent
        emit('agent:stream-event', { sessionId, kind: 'text', text: data?.text || event?.text, content: data?.text || event?.text })
      } else if (event?.ToolUse || event?.toolUse) {
        const data = event.ToolUse || event.toolUse
        emit('agent:stream-event', { sessionId, kind: 'tool_use', toolId: data?.tool_id, toolName: data?.tool_name, toolInput: data?.tool_input })
      } else if (event?.Interrupt || event?.interrupt) {
        const data = event.Interrupt || event.interrupt
        emit('agent:stream-event', { sessionId, kind: 'interrupt', interruptId: data?.interrupt_id, interruptKind: data?.kind, toolName: data?.tool_name, toolInput: data?.tool_input })
      } else if (event?.ToolResult || event?.toolResult) {
        const data = event.ToolResult || event.toolResult
        emit('agent:stream-event', { sessionId, kind: 'tool_result', toolId: data?.tool_id, content: data?.content })
      } else if (event?.Done || event?.done) {
        const data = event.Done || event.done
        emit('agent:stream-complete', { sessionId, totalTokens: data?.total_tokens })
        agentChannels.delete(sessionId)
      } else if (event?.Error || event?.error) {
        const data = event.Error || event.error
        emit('agent:stream-error', { sessionId, error: data?.message || JSON.stringify(data) })
        agentChannels.delete(sessionId)
      } else if (typeof event === 'object' && event !== null) {
        // Passthrough unknown events
        emit('agent:stream-event', { sessionId, ...event })
      }
    }

    try {
      await invoke('start_agent', { sessionId, permissionMode, onEvent: channel })
    } catch (e: any) {
      agentChannels.delete(sessionId)
      emit('agent:stream-error', { sessionId, error: e?.message || String(e) })
      return
    }
  }

  // Send the actual message to the running agent
  try {
    await invoke('send_agent_message', { sessionId, content })
  } catch (e: any) {
    emit('agent:stream-error', { sessionId, error: e?.message || String(e) })
  }
}

export async function stopAgent(sessionId: string): Promise<void> {
  try { await invoke('stop_agent', { sessionId }) } catch { /* ignore */ }
  agentChannels.delete(sessionId)
}

export const queueAgentMessage = (input: any) => tryInvoke<string>('queue_agent_message', { input }, '')

// ============================================================
// Agent Stream Events
// ============================================================

export const onAgentStreamEvent = (cb: Handler) => onEvt('agent:stream-event', cb)
export const onAgentStreamComplete = (cb: Handler) => onEvt('agent:stream-complete', cb)
export const onAgentStreamError = (cb: Handler) => onEvt('agent:stream-error', cb)
export const onAgentTitleUpdated = (cb: Handler) => onEvt('agent:title-updated', cb)

// ============================================================
// Agent Permissions
// ============================================================

export async function respondPermission(response: any) { return invoke('respond_permission', { response }) }
export async function respondAskUser(response: any) { return invoke('respond_ask_user', { response }) }
export const respondExitPlanMode = (response: any) => tryInvoke('respond_exit_plan_mode', { response })
export const updateSessionPermissionMode = (sessionId: string, mode: string) =>
  tryInvoke('update_session_permission_mode', { sessionId, mode })

export const onPermissionRequest = (cb: Handler) => onEvt('agent:permission-request', cb)
export const onAskUserRequest = (cb: Handler) => onEvt('agent:ask-user-request', cb)
export const onExitPlanModeRequest = (cb: Handler) => onEvt('agent:exit-plan-mode', cb)

// ============================================================
// Agent Workspaces
// ============================================================

export const listAgentWorkspaces = () => tryInvoke<any[]>('list_agent_workspaces', undefined, [])
export const createAgentWorkspace = (name: string) => tryInvoke<any>('create_agent_workspace', { name })
export const updateAgentWorkspace = (id: string, updates: { name: string }) =>
  tryInvoke<any>('update_agent_workspace', { id, updates })
export const deleteAgentWorkspace = (id: string) => tryInvoke('delete_agent_workspace', { id })
export const reorderAgentWorkspaces = (orderedIds: string[]) =>
  tryInvoke<any[]>('reorder_agent_workspaces', { orderedIds }, [])

// ============================================================
// Workspace Capabilities (MCP + Skills)
// ============================================================

/** List j-cli MCP servers from ~/.jdata/agent/mcp_config.json (read-only source) */
export const listMcpServers = () =>
  tryInvoke<Array<{ name: string; transport: string; command?: string; args?: string[]; url?: string; env?: Record<string, string>; disabled: boolean }>>('list_mcp_servers', undefined, [])

export const getWorkspaceCapabilities = (workspaceSlug: string) =>
  tryInvoke<any>('get_workspace_capabilities', { workspaceSlug }, { mcpServers: [], skills: [] })
export const getWorkspaceMcpConfig = (workspaceSlug: string) =>
  tryInvoke<any>('get_workspace_mcp_config', { workspaceSlug }, { servers: {} })
export const saveWorkspaceMcpConfig = (workspaceSlug: string, config: any) =>
  tryInvoke('save_workspace_mcp_config', { workspaceSlug, config })
export const testMcpServer = (name: string, entry: any) =>
  tryInvoke('test_mcp_server', { name, entry }, { success: false, message: 'Not implemented' })
export const getWorkspaceSkills = (workspaceSlug: string) =>
  tryInvoke<any[]>('get_workspace_skills', { workspaceSlug }, [])
export const getWorkspaceSkillsDir = (workspaceSlug: string) =>
  tryInvoke<string>('get_workspace_skills_dir', { workspaceSlug }, '')
export const deleteWorkspaceSkill = (workspaceSlug: string, skillSlug: string) =>
  tryInvoke('delete_workspace_skill', { workspaceSlug, skillSlug })
export const toggleWorkspaceSkill = (workspaceSlug: string, skillSlug: string, enabled: boolean) =>
  tryInvoke('toggle_workspace_skill', { workspaceSlug, skillSlug, enabled })
export const getOtherWorkspaceSkills = (currentSlug: string) =>
  tryInvoke<any[]>('get_other_workspace_skills', { currentSlug }, [])
export const importSkillFromWorkspace = (targetSlug: string, sourceSlug: string, skillSlug: string) =>
  tryInvoke<any>('import_skill_from_workspace', { targetSlug, sourceSlug, skillSlug })
export const updateSkillFromSource = (targetSlug: string, skillSlug: string) =>
  tryInvoke<any>('update_skill_from_source', { targetSlug, skillSlug })
export const readSkillContent = (workspaceSlug: string, skillSlug: string) =>
  tryInvoke<string>('read_skill_content', { workspaceSlug, skillSlug }, '')
export const writeSkillContent = (workspaceSlug: string, skillSlug: string, content: string) =>
  tryInvoke('write_skill_content', { workspaceSlug, skillSlug, content })

// ============================================================
// Events
// ============================================================

export const onCapabilitiesChanged = (cb: Handler) => onEvt('workspace:capabilities-changed', cb)
export const onWorkspaceFilesChanged = (cb: Handler) => onEvt('workspace:files-changed', cb)

// ============================================================
// Background Tasks
// ============================================================

export const getTaskOutput = (input: any) =>
  tryInvoke<any>('get_task_output', { input }, { output: '' })
export const stopTask = (input: any) => tryInvoke('stop_task', { input })

// ============================================================
// Attachments
// ============================================================

export const saveAttachment = (input: any) =>
  tryInvoke<any>('save_attachment', { input }, { localPath: '', fileName: '' })
export const readAttachment = (localPath: string) => tryInvoke<string>('read_attachment', { localPath }, '')
export const saveImageAs = (localPath: string, defaultFilename: string) =>
  tryInvoke<boolean>('save_image_as', { localPath, defaultFilename }, false)
export const saveResourceFileAs = (resourceRelativePath: string, defaultFilename: string) =>
  tryInvoke<boolean>('save_resource_file_as', { resourceRelativePath, defaultFilename }, false)
export const deleteAttachment = (localPath: string) => tryInvoke('delete_attachment', { localPath })
export const openFileDialog = () => tryInvoke<any>('open_file_dialog', undefined, { canceled: true, filePaths: [] })
export const extractAttachmentText = (localPath: string) =>
  tryInvoke<string>('extract_attachment_text', { localPath }, '')

// ============================================================
// User Profile
// ============================================================

export const getUserProfile = () => tryInvoke<UserProfile>('get_user_profile', undefined, { userName: 'User', avatar: '🧑‍💻' })
export const updateUserProfile = (updates: Partial<UserProfile>) =>
  tryInvoke<UserProfile>('update_user_profile', { updates }, { userName: 'User', avatar: '🧑‍💻' })

// ============================================================
// Online / Updater
// ============================================================

export const getOnlineStatus = () => Promise.resolve(navigator.onLine)
export const checkForUpdates = () => tryInvoke('check_for_updates')
export const getUpdaterStatus = () => tryInvoke<any>('get_updater_status', undefined, { status: 'idle' })
export const onUpdaterStatusChanged = stubEvent('updaterStatusChanged')

// Proma updater sub-object compat
export const updater = {
  checkForUpdates: () => tryInvoke('check_for_updates'),
  getStatus: () => tryInvoke<any>('get_updater_status', undefined, { status: 'idle' }),
  onStatusChanged: stubEvent('updaterStatusChanged'),
}

// ============================================================
// System Prompts
// ============================================================

export const getSystemPrompts = () => tryInvoke<any[]>('get_system_prompts', undefined, [])
export const getSystemPromptConfig = () => tryInvoke<any>('get_system_prompt_config', undefined, {
  prompts: [{ id: 'builtin-default', name: '默认', content: '' }],
  defaultPromptId: 'builtin-default',
  appendDateTimeAndUserName: true,
})
export const createSystemPrompt = (input: any) => tryInvoke<any>('create_system_prompt', { input })
export const updateSystemPrompt = (id: string, input: any) => tryInvoke<any>('update_system_prompt', { id, input })
export const deleteSystemPrompt = (id: string) => tryInvoke('delete_system_prompt', { id })
export const setDefaultPrompt = (prompt_id: string) => tryInvoke('set_default_prompt', { prompt_id })
export const updateAppendSetting = (enabled: boolean) => tryInvoke('update_append_setting', { append_date_time_and_user_name: enabled })

// ============================================================
// Chat Tools
// ============================================================

export const getChatTools = () => tryInvoke<any[]>('get_chat_tools', undefined, [])

/** List built-in chat tools with enabled/disabled state (from AgentConfig.disabled_tools) */
export const listChatTools = () =>
  invoke<Array<{ name: string; description: string; enabled: boolean }>>('list_chat_tools')

/** List skills from j-cli (both user and project sources) */
export const listSkills = () =>
  invoke<Array<{ name: string; description: string; source: string; dirPath: string }>>('list_skills')

/** Scan global skills directories (~/.claude/agents/skills/ and ~/.agent/skills/) */
export const scanGlobalSkills = () =>
  invoke<Array<{ name: string; description: string; source: string; dirPath: string }>>('scan_global_skills')

/** Copy a skill from a source directory to a workspace */
export const copySkillToWorkspace = (sourceDir: string, workspaceSlug: string, skillSlug: string) =>
  invoke<void>('copy_skill_to_workspace', { sourceDir, workspaceSlug, skillSlug })

/** Enable or disable a built-in chat tool by name */
export const setToolEnabled = (name: string, enabled: boolean) =>
  invoke<void>('set_tool_enabled', { name, enabled })
export const onCustomToolChanged = stubEvent('customToolChanged')
export const updateChatToolState = (id: string, state: any) =>
  tryInvoke('update_chat_tool_state', { id, state })
export const addCustomTool = (meta: any) => tryInvoke<any>('add_custom_tool', { meta })
export const removeCustomTool = (id: string) => tryInvoke('remove_custom_tool', { id })
export const deleteCustomChatTool = (id: string) => tryInvoke('delete_custom_chat_tool', { id })
export const getChatToolCredentials = (id: string) =>
  tryInvoke<any>('get_chat_tool_credentials', { id }, {})
export const updateChatToolCredentials = (id: string, creds: any) =>
  tryInvoke('update_chat_tool_credentials', { id, creds })
export const testChatTool = (id: string, creds: any) =>
  tryInvoke('test_chat_tool', { id, creds }, { success: false, message: 'Not implemented' })

// ============================================================
// Agent Files
// ============================================================

export const saveAgentWorkspaceFiles = (input: any) => tryInvoke<any[]>('save_agent_workspace_files', { input }, [])
export const saveAgentSessionFiles = (input: any) => tryInvoke<any[]>('save_agent_session_files', { input }, [])
export const saveFilesToAgentSession = (input: any) => tryInvoke<any[]>('save_files_to_agent_session', { input }, [])
export const saveFilesToWorkspaceFiles = (input: any) => tryInvoke<any[]>('save_files_to_workspace_files', { input }, [])
export const attachAgentDirectory = (input: any) => tryInvoke<any[]>('attach_agent_directory', { input }, [])
export const attachDirectory = (input: any) => tryInvoke<any[]>('attach_directory', { input }, [])
export const attachWorkspaceDirectory = (input: any) => tryInvoke<any[]>('attach_workspace_directory', { input }, [])
export const detachDirectory = (sessionId: string, dirPath: string) =>
  tryInvoke('detach_directory', { sessionId, dirPath })
export const detachWorkspaceDirectory = (workspaceSlug: string, dirPath: string) =>
  tryInvoke('detach_workspace_directory', { workspaceSlug, dirPath })
export const listAttachedDirectory = (params: any) => tryInvoke<any[]>('list_attached_directory', params, [])
export const getAgentWorkspaceFiles = (workspaceSlug: string) => tryInvoke<any[]>('get_agent_workspace_files', { workspaceSlug }, [])
export const getAgentSessionFiles = (sessionId: string) => tryInvoke<any[]>('get_agent_session_files', { sessionId }, [])
export const searchAgentWorkspaceFiles = (workspaceSlug: string, query: string) =>
  tryInvoke<any[]>('search_agent_workspace_files', { workspaceSlug, query }, [])
export const searchWorkspaceFiles = (params: any) => tryInvoke<any[]>('search_workspace_files', params, [])
export const readAgentFile = (filePath: string) => tryInvoke<string>('read_agent_file', { filePath }, '')

// File browser ops
export const listDirectory = (dirPath: string) => tryInvoke<any[]>('list_directory', { dirPath }, [])
export const moveFile = (src: string, dest: string) => tryInvoke('move_file', { src, dest })
export const deleteFile = (filePath: string) => tryInvoke('delete_file', { filePath })
export const renameFile = (oldPath: string, newPath: string) => tryInvoke('rename_file', { oldPath, newPath })
export const renameAttachedFile = (params: any) => tryInvoke('rename_attached_file', params)
export const moveAttachedFile = (params: any) => tryInvoke('move_attached_file', params)
export const openFile = (filePath: string) => tryInvoke('open_file', { filePath })
export const openAttachedFile = (filePath: string) => tryInvoke('open_attached_file', { filePath })
export const readAttachedFile = (filePath: string) => tryInvoke<string>('read_attached_file', { filePath }, '')
export const previewFile = (filePath: string) => tryInvoke('preview_file', { filePath })
export const showInFolder = (filePath: string) => tryInvoke('show_in_folder', { filePath })
export const showAttachedInFolder = (filePath: string) => tryInvoke('show_attached_in_folder', { filePath })
export const openFolderDialog = () => tryInvoke<any>('open_folder_dialog', undefined, { canceled: true, filePaths: [] })
export const getWorkspaceDirectories = () => tryInvoke<string[]>('get_workspace_directories', undefined, [])
export const getWorkspaceFilesPath = (workspaceSlug: string) =>
  tryInvoke<string>('get_workspace_files_path', { workspaceSlug }, '')
export const getAgentSessionPath = (sessionId: string) =>
  tryInvoke<string>('get_agent_session_path', { sessionId }, '')
export const getPathForFile = (file: File) => URL.createObjectURL(file)
export const checkPathsType = (paths: string[]) => tryInvoke<any>('check_paths_type', { paths }, {})
export const getFilePath = (file: File) => URL.createObjectURL(file)

// ============================================================
// Memory
// ============================================================

export const getMemoryConfig = () => tryInvoke<any>('get_memory_config', undefined, { enabled: false, memories: [] })
export const saveMemoryConfig = (config: any) => tryInvoke('save_memory_config', { config })
export const setMemoryConfig = (config: any) => tryInvoke('set_memory_config', { config })
export const testMemoryConnection = (config: any) =>
  tryInvoke('test_memory_connection', { config }, { success: false, message: 'Not implemented' })

// ============================================================
// Agent Team
// ============================================================

export const getAgentTeamData = () => tryInvoke<any>('get_agent_team_data', undefined, null)

// ============================================================
// Environment & Installer
// ============================================================

export const checkEnvironment = () =>
  tryInvoke<any>('check_environment', undefined, { bunInstalled: true, gitInstalled: true })
export const fetchInstallerManifest = () => tryInvoke<any>('fetch_installer_manifest', undefined, { packages: [] })
export const downloadInstaller = (req: any) => tryInvoke<any>('download_installer', { req }, { success: false })
export const cancelInstallerDownload = (key: string) =>
  tryInvoke<boolean>('cancel_installer_download', { key }, false)
export const launchInstaller = (filePath: string) => tryInvoke('launch_installer', { filePath })
export const onInstallerProgress = stubEvent('installerProgress')

// ============================================================
// Proxy
// ============================================================

export const getProxySettings = () =>
  tryInvoke<any>('get_proxy_settings', undefined, { enabled: false, proxyUrl: '' })
export const updateProxySettings = (config: any) => tryInvoke('update_proxy_settings', { config })
export const detectSystemProxy = () => tryInvoke<any>('detect_system_proxy', undefined, { detected: false })

// ============================================================
// Hooks
// ============================================================

export interface HookInfo {
  name: string | null
  event: string
  source: string
  hookType: string
  label: string
  timeout: number | null
  onError: string | null
  uniqueId: string
  enabled: boolean
}

export const listHooks = () => tryInvoke<HookInfo[]>('list_hooks', undefined, [])

export const toggleHook = (uniqueId: string, enabled: boolean) =>
  tryInvoke('toggle_hook', { uniqueId, enabled })

// ============================================================
// Yaml Config
// ============================================================

export const getConfig = () => tryInvoke<{ sections: Record<string, Record<string, string>> }>('get_config', undefined, { sections: {} })
export const setConfig = (section: string, key: string, value: string) => tryInvoke('set_config', { section, key, value })

// ============================================================
// Aliases
// ============================================================

export const listAliases = () => tryInvoke<Array<{ section: string; name: string; value: string }>>('list_aliases', undefined, [])
export const setAlias = (section: string, name: string, value: string) => tryInvoke('set_alias', { section, name, value })
export const removeAlias = (section: string, name: string) => tryInvoke('remove_alias', { section, name })

// ============================================================
// Quick Tasks
// ============================================================

export const listQuickTasks = () => tryInvoke<any[]>('list_quick_tasks', undefined, [])
export const createQuickTask = (input: any) => tryInvoke<any>('create_quick_task', { input })
export const deleteQuickTask = (id: string) => tryInvoke('delete_quick_task', { id })
export const openInQuickTaskWindow = (data: any) => tryInvoke('open_in_quick_task_window', { data })
export const submitQuickTask = (input: any) => tryInvoke('submit_quick_task', { input })
export const hideQuickTask = () => tryInvoke('hide_quick_task')
export const reregisterGlobalShortcuts = () => tryInvoke('reregister_global_shortcuts')
export const getPendingRequestsSnapshot = () =>
  tryInvoke<any>('get_pending_requests_snapshot', undefined, { permissions: [], askUsers: [] })

export const onQuickTaskFocus = stubEvent('quickTaskFocus')
export const onQuickTaskOpenSession = stubEvent('quickTaskOpenSession')
export const onMenuCloseTab = stubEvent('menuCloseTab')
export const onTrayCreateSession = stubEvent('trayCreateSession')
export const onTrayOpenAgentSession = stubEvent('trayOpenAgentSession')

// ============================================================
// Feishu
// ============================================================

export const getFeishuStatus = () => tryInvoke<any>('get_feishu_status', undefined, { status: 'disconnected' })
export const getFeishuMultiStatus = () => tryInvoke<any>('get_feishu_multi_status', undefined, { bots: {} })
export const getFeishuConfig = () => tryInvoke<any>('get_feishu_config', undefined, {})
export const getFeishuMultiConfig = () => tryInvoke<any>('get_feishu_multi_config', undefined, {})
export const updateFeishuConfig = (input: any) => tryInvoke<any>('update_feishu_config', { input })
export const saveFeishuBotConfig = (input: any) => tryInvoke('save_feishu_bot_config', { input })
export const removeFeishuBot = (botId: string) => tryInvoke('remove_feishu_bot', { botId })
export const startFeishuBot = (botId: string) => tryInvoke('start_feishu_bot', { botId })
export const stopFeishuBot = (botId: string) => tryInvoke('stop_feishu_bot', { botId })
export const testFeishuConnection = (config: any) =>
  tryInvoke('test_feishu_connection', { config }, { success: false, message: 'Not implemented' })
export const reportFeishuPresence = (report: any) => tryInvoke('report_feishu_presence', { report })
export const triggerFeishuManualSync = () => tryInvoke('trigger_feishu_manual_sync')
export const getFeishuChatBindings = () => tryInvoke<any[]>('get_feishu_chat_bindings', undefined, [])
export const listFeishuBindings = () => tryInvoke<any[]>('list_feishu_bindings', undefined, [])
export const toggleFeishuNotifyMode = (conversationId: string, notifyMode?: string) =>
  tryInvoke('toggle_feishu_notify_mode', { conversationId, notifyMode })
export const setFeishuSessionNotify = (data: any) => tryInvoke('set_feishu_session_notify', { data })
export const createFeishuChatBinding = (conversationId: string) =>
  tryInvoke<any>('create_feishu_chat_binding', { conversationId })
export const deleteFeishuChatBinding = (bindingId: string) =>
  tryInvoke('delete_feishu_chat_binding', { bindingId })
export const updateFeishuChatBinding = (bindingId: string, data: any) =>
  tryInvoke<any>('update_feishu_chat_binding', { bindingId, data })
export const removeFeishuBinding = (bindingId: string) =>
  tryInvoke('remove_feishu_binding', { bindingId })
export const updateFeishuBinding = (input: any) => tryInvoke('update_feishu_binding', { input })
export const getDecryptedFeishuSecret = (botId: string) =>
  tryInvoke<string>('get_decrypted_feishu_secret', { botId }, '')
export const getDecryptedFeishuBotSecret = (botId: string) =>
  tryInvoke<string>('get_decrypted_feishu_bot_secret', { botId }, '')
export const onFeishuStatusChanged = stubEvent('feishuStatusChanged')
export const onFeishuNotificationSent = stubEvent('feishuNotificationSent')

// ============================================================
// DingTalk
// ============================================================

export const getDingTalkStatus = () => tryInvoke<any>('get_dingtalk_status', undefined, { status: 'disconnected' })
export const getDingTalkMultiStatus = () => tryInvoke<any>('get_dingtalk_multi_status', undefined, { bots: {} })
export const getDingTalkConfig = () => tryInvoke<any>('get_dingtalk_config', undefined, {})
export const getDingTalkMultiConfig = () => tryInvoke<any>('get_dingtalk_multi_config', undefined, {})
export const updateDingTalkConfig = (input: any) => tryInvoke<any>('update_dingtalk_config', { input })
export const saveDingTalkBotConfig = (input: any) => tryInvoke('save_dingtalk_bot_config', { input })
export const startDingTalkBot = (botId: string) => tryInvoke('start_dingtalk_bot', { botId })
export const stopDingTalkBot = (botId: string) => tryInvoke('stop_dingtalk_bot', { botId })
export const removeDingTalkBot = (botId: string) => tryInvoke('remove_dingtalk_bot', { botId })
export const testDingTalkConnection = (config: any) =>
  tryInvoke('test_dingtalk_connection', { config }, { success: false, message: 'Not implemented' })
export const triggerDingTalkManualSync = () => tryInvoke('trigger_dingtalk_manual_sync')
export const getDecryptedDingTalkSecret = (botId: string) =>
  tryInvoke<string>('get_decrypted_dingtalk_secret', { botId }, '')
export const getDecryptedDingTalkBotSecret = (botId: string) =>
  tryInvoke<string>('get_decrypted_dingtalk_bot_secret', { botId }, '')
export const onDingTalkStatusChanged = stubEvent('dingTalkStatusChanged')

// ============================================================
// WeChat
// ============================================================

export const getWeChatStatus = () => tryInvoke<any>('get_wechat_status', undefined, { status: 'disconnected' })
export const getWeChatConfig = () => tryInvoke<any>('get_wechat_config', undefined, {})
export const updateWeChatConfig = (config: any) => tryInvoke<any>('update_wechat_config', { config })
export const startWeChatBridge = () => tryInvoke('start_wechat_bridge')
export const stopWeChatBridge = () => tryInvoke('stop_wechat_bridge')
export const startWeChatLogin = () => tryInvoke('start_wechat_login')
export const logoutWeChat = () => tryInvoke('logout_wechat')
export const onWeChatStatusChanged = stubEvent('weChatStatusChanged')

// ============================================================
// Voice Dictation
// ============================================================

export const startVoiceDictation = (input: any) => tryInvoke('start_voice_dictation', { input })
export const stopVoiceDictation = (input: any) => tryInvoke('stop_voice_dictation', { input })
export const cancelVoiceDictation = () => tryInvoke('cancel_voice_dictation')
export const commitVoiceDictation = (input: any) =>
  tryInvoke<any>('commit_voice_dictation', { input }, { text: '' })
export const sendVoiceDictationAudio = (input: any) => tryInvoke('send_voice_dictation_audio', { input })
export const sendVoiceDictationAudioChunk = (input: any) => tryInvoke('send_voice_dictation_audio_chunk', { input })
export const resizeVoiceDictation = (input: any) => tryInvoke('resize_voice_dictation', { input })
export const resizeVoiceDictationWindow = (input: any) => tryInvoke('resize_voice_dictation_window', { input })
export const hideVoiceDictation = () => tryInvoke('hide_voice_dictation')
export const toggleVoiceDictation = () => tryInvoke('toggle_voice_dictation')
export const getVoiceDictationSettings = () =>
  tryInvoke<any>('get_voice_dictation_settings', undefined, { enabled: false })
export const updateVoiceDictationSettings = (input: any) =>
  tryInvoke('update_voice_dictation_settings', { input })
export const testVoiceDictationConnection = (settings: any) =>
  tryInvoke('test_voice_dictation_connection', { settings }, { success: false, message: 'Not implemented' })
export const getVoiceDictationMicPermission = () =>
  tryInvoke<string>('get_voice_dictation_mic_permission', undefined, 'denied')
export const checkMicrophonePermission = () =>
  tryInvoke<string>('check_microphone_permission', undefined, 'denied')
export const requestMicrophonePermission = () =>
  tryInvoke<string>('request_microphone_permission', undefined, 'denied')
export const onVoiceDictationStateChanged = stubEvent('voiceDictationStateChanged')
export const onVoiceDictationState = stubEvent('voiceDictationState')
export const onVoiceDictationTranscript = stubEvent('voiceDictationTranscript')
export const onVoiceDictationInsertText = stubEvent('voiceDictationInsertText')
export const onVoiceDictationShown = stubEvent('voiceDictationShown')
export const onVoiceDictationToggleStop = stubEvent('voiceDictationToggleStop')

// ============================================================
// Migration
// ============================================================

export const migrationExportV2 = () => tryInvoke<string>('migration_export_v2', undefined, '')
export const migrationOpenFileDialog = () =>
  tryInvoke<string>('migration_open_file_dialog', undefined, '')
export const migrationSaveFileDialog = (defaultName: string) =>
  tryInvoke<string>('migration_save_file_dialog', { defaultName }, '')
export const migrationParseImportFile = (filePath: string) =>
  tryInvoke<any>('migration_parse_import_file', { filePath }, null)
export const migrationConfirmImport = (data: any) => tryInvoke('migration_confirm_import', { data })
export const migrationGetShareExportPreview = () =>
  tryInvoke<any>('migration_get_share_export_preview', undefined, null)
export const onMigrationOpenImportFile = stubEvent('migrationOpenImportFile')

// ============================================================
// Misc
// ============================================================

export const openExternal = async (url: string) => {
  try { await invoke('plugin:shell|open', { path: url }) }
  catch { window.open(url, '_blank') }
}

export const setAppIcon = (variantId: string) => tryInvoke<boolean>('set_app_icon', { variantId }, false)
export const setDockBadgeCount = (count: number) => tryInvoke<boolean>('set_dock_badge_count', { count }, false)
export const notifyTraySendMessage = (data: any) => tryInvoke('notify_tray_send_message', { data })
export const notifyTrayNewAgentSession = (data: any) => tryInvoke('notify_tray_new_agent_session', { data })
export const listGitHubReleases = (opts: any) => tryInvoke<any[]>('list_github_releases', { opts }, [])
export const listReleases = (opts: any) => tryInvoke<any[]>('list_releases', { opts }, [])
export const getReleaseByTag = (tag: string) => tryInvoke<any>('get_release_by_tag', { tag })
export const saveTaskPendingFilesState = (sessionId: string, state: unknown) =>
  tryInvoke('save_task_pending_files_state', { sessionId, state })
export const getTaskPendingFilesState = (sessionId: string) =>
  tryInvoke<unknown>('get_task_pending_files_state', { sessionId }, null)

// ============================================================
// Tray events
// ============================================================

export const onTrayOpenAgentSessionEvt = stubEvent('trayOpenAgentSession')
export const onTrayCreateSessionEvt = stubEvent('trayCreateSession')

// ============================================================
// Export emit/onEvt for stream events (called by Rust backend via Tauri events)
// ============================================================

export { emit, onEvt }
