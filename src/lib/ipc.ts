/**
 * Tauri IPC 模块
 *
 * 所有前端→后端的通信都通过这里。
 * 只有明确允许降级的入口才保留 fallback；治理真相相关入口必须暴露真实失败。
 * 不使用任何 Electron API — 纯 Tauri 实现。
 */

import { invoke, Channel } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { AppSettings, UserProfile, ThemeMode, ThemeStyle } from '@/types'
import { decodeAgentStreamEvent, decodeChatStreamEvent } from '@/lib/ipc-stream-protocol'
import { CHAT_IPC_CHANNELS } from '@jgui/shared'
import type { ChatRequestInput } from '@jgui/shared'
import type {
  AgentSendInput,
  AgentStreamCompletePayload,
  MessageSearchResult,
  AgentMessageSearchResult,
  SDKMessage,
  ChatToolInfo,
  AgentBackendMode,
} from '@jgui/shared'

// ============================================================
// 工具函数
// ============================================================

const warned = new Set<string>()
function warnOnce(name: string, userVisible?: boolean): void {
  if (!warned.has(name)) {
    warned.add(name)
    const msg = `[j-gui ipc] command failed: ${name} — using fallback`
    if (userVisible) {
      console.error(msg)
    } else {
      console.warn(msg)
    }
  }
}

function extractInvokeErrorMessage(error: unknown): string {
  const UNKNOWN_ERROR = 'Unknown error'

  const visit = (value: unknown, seen: Set<unknown>): string | null => {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      return trimmed.length > 0 ? trimmed : null
    }
    if (!value || typeof value !== 'object') return null
    if (seen.has(value)) return null
    seen.add(value)

    const record = value as Record<string, unknown>
    const priorityKeys = ['cause', 'error', 'details', 'message']
    for (const key of priorityKeys) {
      const nested = visit(record[key], seen)
      if (nested && nested !== UNKNOWN_ERROR) {
        return nested
      }
    }

    const fallbackMessage = visit(record.message, seen)
    if (fallbackMessage) return fallbackMessage

    for (const nested of Object.values(record)) {
      const resolved = visit(nested, seen)
      if (resolved && resolved !== UNKNOWN_ERROR) {
        return resolved
      }
    }

    return null
  }

  return visit(error, new Set()) ?? (error instanceof Error ? error.message : String(error))
}

async function tryInvoke<T>(cmd: string, args?: unknown, fallback?: T, opts?: { userVisible?: boolean }): Promise<T> {
  try {
    return await invoke<T>(cmd, args as any)
  } catch (err) {
    if (fallback !== undefined) {
      warnOnce(cmd, opts?.userVisible)
      return fallback
    }
    console.error(`[tryInvoke] Tauri command '${cmd}' failed:`, err)
    const message = extractInvokeErrorMessage(err)
    throw new Error(message || `Tauri command '${cmd}' not available`)
  }
}

function unsupportedCommand(name: string): never {
  throw new Error(`Tauri command '${name}' is not implemented in j-gui backend`)
}

function unsupportedSubscription(name: string): never {
  throw new Error(`Tauri event '${name}' is not implemented in j-gui backend`)
}

function emitCapabilitiesChanged(): void {
  emit('workspace:capabilities-changed')
}

function emitWorkspaceFilesChanged(): void {
  emit('workspace:files-changed')
}

function listenToTauriEvent<T>(eventName: string, mapPayload?: (payload: unknown) => T): (callback: (payload: T) => void) => (() => void) {
  return (callback) => {
    let active = true
    let unlisten: (() => void) | null = null

    listen(eventName, (event) => {
      if (!active) return
      const payload = mapPayload ? mapPayload(event.payload) : event.payload as T
      callback(payload)
    }).then((cleanup) => {
      if (active) {
        unlisten = cleanup
      } else {
        cleanup()
      }
    }).catch((error) => {
      console.error(`[j-gui ipc] failed to listen event '${eventName}':`, error)
    })

    return () => {
      active = false
      unlisten?.()
    }
  }
}

// 内部事件总线（例如后端推送的流式事件）
type Handler = (...args: any[]) => void
const bus = new Map<string, Set<Handler>>()
function emit(name: string, ...args: any[]): void { bus.get(name)?.forEach(h => h(...args)) }
function onEvt(name: string, cb: Handler): () => void {
  if (!bus.has(name)) bus.set(name, new Set())
  bus.get(name)!.add(cb)
  return () => { bus.get(name)?.delete(cb) }
}

// ============================================================
// 运行时
// ============================================================

export const getRuntimeStatus = () => tryInvoke('get_runtime_status', undefined, null)
export const reinitRuntime = () => tryInvoke('reinit_runtime', undefined, null)

export interface KernelInfo {
  crateVersion: string
  appVersion: string
  localCliVersion: string | null
  localCliInstalled: boolean
}
export const getKernelInfo = () => tryInvoke<KernelInfo>('get_kernel_info', undefined, {
  crateVersion: '0.0.0',
  appVersion: '0.0.0',
  localCliVersion: null,
  localCliInstalled: false,
})

export interface AppUpdateInfo {
  current: string
  latest: string | null
  downloadUrl: string | null
  updateAvailable: boolean
}

export interface ConnectionTestResult {
  success: boolean
  message: string
}

export const checkAppUpdate = () => invoke<AppUpdateInfo>('check_app_update')

// ============================================================
// 设置
// ============================================================

let settingsCache: AppSettings | null = null
let settingsInFlight: Promise<AppSettings> | null = null
let agentSessionsInFlight: Promise<any[]> | null = null

export async function getSettings(): Promise<AppSettings> {
  if (settingsCache) return settingsCache
  if (settingsInFlight) return settingsInFlight
  settingsInFlight = (async () => {
    try {
      settingsCache = await invoke<AppSettings>('get_settings')
      return settingsCache!
    } catch {
      settingsCache = {
        themeMode: 'dark' as ThemeMode,
        themeStyle: 'default' as ThemeStyle,
        onboardingCompleted: true,
        agentChannelIds: [],
        agentBackendMode: 'claude-sdk' as AgentBackendMode,
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
    } finally {
      settingsInFlight = null
    }
  })()
  return settingsInFlight
}

export async function updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
  try {
    settingsCache = await invoke<AppSettings>('update_settings', { updates })
    settingsInFlight = null
    return settingsCache!
  } catch {
    settingsCache = { ...settingsCache!, ...updates }
    settingsInFlight = null
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

export const onThemeSettingsChanged = listenToTauriEvent<{ themeMode: ThemeMode; themeStyle?: ThemeStyle }>(
  'theme-changed',
  (payload) => {
    if (payload && typeof payload === 'object') {
      const themeMode = (payload as { themeMode?: unknown }).themeMode
      const themeStyle = (payload as { themeStyle?: unknown }).themeStyle
      return {
        themeMode:
          themeMode === 'light' || themeMode === 'dark' || themeMode === 'system' || themeMode === 'special'
            ? themeMode
            : 'dark',
        themeStyle:
          themeStyle === 'default' ||
          themeStyle === 'ocean-light' ||
          themeStyle === 'ocean-dark' ||
          themeStyle === 'forest-light' ||
          themeStyle === 'forest-dark' ||
          themeStyle === 'slate-light' ||
          themeStyle === 'slate-dark'
            ? themeStyle
            : undefined,
      }
    }
    const themeValue = typeof payload === 'string' ? payload : ''
    if (themeValue === 'light' || themeValue === 'dark' || themeValue === 'system' || themeValue === 'special') {
      return { themeMode: themeValue }
    }
    return { themeMode: 'dark' }
  },
)

// ============================================================
// 渠道管理
// ============================================================

/** 列出所有已配置渠道（包含启用状态和模型列表） */
export async function listChannels(): Promise<any[]> { try { return await invoke<any[]>('list_channels') } catch { warnOnce('list_channels'); return [] } }
/** 创建新渠道，并返回创建后的渠道元数据 */
export async function createChannel(input: any): Promise<{id: string, name: string}> { return invoke<any>('create_channel', { input }) }
export async function updateChannel(id: string, input: any) { return invoke<any>('update_channel', { id, input }) }
export async function deleteChannel(id: string) { return invoke('delete_channel', { id }) }
export const decryptApiKey = (channelId: string) =>
  tryInvoke<string>('decrypt_api_key', { channelId }, '')
export async function testChannelDirect(input: any) { try { return await invoke<any>('test_channel_direct', { input }) } catch { return { success: false, message: '连接失败' } } }
export async function testSavedChannel(id: string, input?: any) { try { return await invoke<any>('test_saved_channel', { id, input }) } catch { return { success: false, message: '连接失败' } } }
export async function fetchModels(input: any) { try { return await invoke<any>('fetch_models', { apiBase: input.apiBase || input.baseUrl, apiKey: input.apiKey }) } catch { return { success: false, message: '获取模型列表失败', models: [] } } }

// ============================================================
// 对话 - 映射到 Rust chat 命令（j-cli 后端）
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
export const updateConversationTitle = (id: string, title: string) => tryInvoke<any>('update_conversation_title', { id, title })
export const updateConversationModel = (id: string, modelId: string, channelId: string) =>
  tryInvoke<any>('update_conversation_model', { id, modelId, channelId })
export const deleteConversation = (id: string) => tryInvoke('delete_session', { sessionId: id })
export const togglePinConversation = (id: string) => tryInvoke<any>('toggle_pin_conversation', { sessionId: id })
export const toggleArchiveConversation = (id: string) => tryInvoke<any>('toggle_archive_conversation', { sessionId: id })
type TimelineItem = {
  id: string
  kind: string
  content?: string | null
  toolCall?: {
    toolId: string
    toolName: string
    toolInput: string
    toolOutput?: string | null
  } | null
  createdAt?: number
}

function safeParseJsonObject(input: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(input)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function buildChatRenderMessageId(message: any, index: number): string {
  return typeof message?.id === 'string' && message.id.length > 0
    ? message.id
    : `chat-index-${index}`
}

function timelineToSdkMessages(timeline: TimelineItem[], sessionId: string): SDKMessage[] {
  const messages: SDKMessage[] = []

  for (const item of timeline) {
    const createdAt = item.createdAt ?? Date.now()
    if (item.kind === 'user_message' && item.content) {
      messages.push({
        type: 'user',
        session_id: sessionId,
        uuid: item.id,
        parent_tool_use_id: null,
        message: {
          content: [{ type: 'text', text: item.content }],
        },
        _createdAt: createdAt,
      } as SDKMessage)
      continue
    }

    if (item.kind === 'assistant_content' && item.content) {
      messages.push({
        type: 'assistant',
        session_id: sessionId,
        uuid: item.id,
        parent_tool_use_id: null,
        message: {
          content: [{ type: 'text', text: item.content }],
        },
        _createdAt: createdAt,
      } as SDKMessage)
      continue
    }

    if (item.kind === 'tool_call' && item.toolCall) {
      messages.push({
        type: 'assistant',
        session_id: sessionId,
        uuid: item.id,
        parent_tool_use_id: null,
        message: {
          content: [{
            type: 'tool_use',
            id: item.toolCall.toolId,
            name: item.toolCall.toolName,
            input: safeParseJsonObject(item.toolCall.toolInput),
          }],
        },
        _createdAt: createdAt,
      } as SDKMessage)

      if (item.toolCall.toolOutput) {
        messages.push({
          type: 'user',
          session_id: sessionId,
          uuid: `${item.id}-result`,
          parent_tool_use_id: null,
          message: {
            content: [{
              type: 'tool_result',
              tool_use_id: item.toolCall.toolId,
              content: item.toolCall.toolOutput,
            }],
          },
          _createdAt: createdAt,
        } as SDKMessage)
      }
    }
  }

  return messages
}

export async function searchConversationMessages(query: string): Promise<MessageSearchResult[]> {
  return await invoke<MessageSearchResult[]>('search_conversation_messages', { query })
}
export const generateTitle = (input: any) => tryInvoke<string>('generate_title', { input }, null)
export const createWelcomeConversation = () => tryInvoke<any>('create_welcome_conversation', undefined, null)
// 已移除：j-gui v1 不支持 tutorial

// ============================================================
// Chat 消息 - 通过 j-cli 使用 Tauri Channel 流式传输
// ============================================================

export async function sendMessage(input: any): Promise<void> {
  let sawStreamError = false
  const request: ChatRequestInput = {
    sessionId: input.sessionId || input.conversationId || '',
    content: input.content || input.userMessage || input.message || '',
    channelId: input.channelId,
    modelId: input.modelId,
    systemMessage: input.systemMessage ?? null,
    contextLength: input.contextLength !== 'infinite' ? input.contextLength : undefined,
    contextDividers: Array.isArray(input.contextDividers) && input.contextDividers.length > 0
      ? input.contextDividers
      : undefined,
    attachments: Array.isArray(input.attachments) && input.attachments.length > 0
      ? input.attachments
      : undefined,
    thinkingEnabled:
      typeof input.thinkingEnabled === 'boolean' ? input.thinkingEnabled : undefined,
    protocolHint: input.protocolHint && input.protocolHint !== 'auto'
      ? input.protocolHint
      : undefined,
  }
  const channel = new Channel<any>()
  channel.onmessage = (event: any) => {
    const decoded = decodeChatStreamEvent(event, input.conversationId || input.sessionId)
    if (decoded?.kind === 'chunk') {
      emit(CHAT_IPC_CHANNELS.STREAM_CHUNK, {
        conversationId: decoded.conversationId,
        delta: decoded.delta,
        index: decoded.index,
      })
    } else if (decoded?.kind === 'reasoning') {
      emit(CHAT_IPC_CHANNELS.STREAM_REASONING, {
        conversationId: decoded.conversationId,
        delta: decoded.delta,
        index: decoded.index,
      })
    } else if (decoded?.kind === 'complete') {
      emit(CHAT_IPC_CHANNELS.STREAM_COMPLETE, { conversationId: decoded.conversationId, totalTokens: decoded.totalTokens })
    } else if (decoded?.kind === 'error') {
      sawStreamError = true
      emit(CHAT_IPC_CHANNELS.STREAM_ERROR, { conversationId: decoded.conversationId, error: decoded.error })
    }
  }
  try {
    await invoke('send_message', {
      request,
      onEvent: channel,
    })
  } catch (e: any) {
    if (!sawStreamError) {
      emit(CHAT_IPC_CHANNELS.STREAM_ERROR, {
        conversationId: input.conversationId || input.sessionId,
        error: extractInvokeErrorMessage(e),
      })
    }
  }
}

export async function stopGeneration(sessionId: string) { try { await invoke('stop_generation', { sessionId }) } catch { warnOnce('stop_generation') } }
export const deleteMessage = (conversationId: string, pairIndex: number) =>
  tryInvoke<void>('delete_message', { sessionId: conversationId, pairIndex })
export const truncateMessagesFrom = (conversationId: string, messageId: string, preserveFirstMessageAttachments?: boolean) =>
  tryInvoke<any[]>('truncate_messages_from', { input: { conversationId, messageId, preserveFirstMessageAttachments } })
export const updateContextDividers = (conversationId: string, dividers: string[]) =>
  tryInvoke<any>('update_context_dividers', { conversationId, dividers })

// ============================================================
// 流式事件（Chat）
// ============================================================

export const onStreamChunk = (cb: Handler) => onEvt(CHAT_IPC_CHANNELS.STREAM_CHUNK, cb)
export const onStreamReasoning = (cb: Handler) => onEvt(CHAT_IPC_CHANNELS.STREAM_REASONING, cb)
export const onStreamComplete = (cb: Handler) => onEvt(CHAT_IPC_CHANNELS.STREAM_COMPLETE, cb)
export const onStreamError = (cb: Handler) => onEvt(CHAT_IPC_CHANNELS.STREAM_ERROR, cb)
export const onStreamToolActivity = (cb: Handler) => onEvt(CHAT_IPC_CHANNELS.STREAM_TOOL_ACTIVITY, cb)

// ============================================================
// Agent 会话
// ============================================================

export async function listAgentSessions(): Promise<any[]> {
  if (agentSessionsInFlight) return agentSessionsInFlight
  agentSessionsInFlight = tryInvoke<any[]>('list_agent_sessions', undefined, [])
    .finally(() => {
      agentSessionsInFlight = null
    })
  return agentSessionsInFlight
}
export async function createAgentSession(title?: string, channelId?: string, workspaceId?: string): Promise<any> {
  return tryInvoke<any>('create_agent_session', {
    input: {
      title,
      channelId,
      workspaceId,
    },
  })
}
export async function getAgentSessionSDKMessages(id: string): Promise<SDKMessage[]> {
  return invoke<SDKMessage[]>('get_agent_session_sdk_messages', { id })
}
export async function updateAgentSessionTitle(id: string, title: string) { return invoke<any>('update_agent_session_title', { sessionId: id, title }) }
export const deleteAgentSession = (id: string) => tryInvoke('delete_agent_session', { id })
export const migrateChatToAgent = (conversationId: string, agentSessionId: string) =>
  tryInvoke('migrate_chat_to_agent', { conversationId, agentSessionId })
export const togglePinAgentSession = (id: string) => tryInvoke<any>('toggle_pin_agent_session', { sessionId: id })
export const toggleManualWorkingAgentSession = (id: string) =>
  tryInvoke<any>('toggle_manual_working_agent_session', { sessionId: id })
export const toggleArchiveAgentSession = (id: string) => tryInvoke<any>('toggle_archive_agent_session', { sessionId: id })
export async function searchAgentSessionMessages(query: string): Promise<AgentMessageSearchResult[]> {
  return await invoke<AgentMessageSearchResult[]>('search_agent_session_messages', { query })
}
export const moveAgentSessionToWorkspace = (input: any) =>
  tryInvoke<any>('move_agent_session_to_workspace', { input })
export const forkAgentSession = (input: any) => tryInvoke<any>('fork_agent_session', { input })
export const rewindSession = (input: any) => tryInvoke<any>('rewind_session', { input })
export async function generateAgentTitle(sessionId: string) { try { return await invoke<string>('generate_agent_title', { sessionId }) } catch { return null } }
// Agent 活跃通道 - 每个会话一个
type AgentRuntimeChannel = Channel<any> & {
  __agentRunState?: AgentRunState
}

const agentChannels = new Map<string, AgentRuntimeChannel>()
let nextAgentRunId = 1
type AgentRunState = {
  runId: number
  startedAt?: number
  stoppedByUser: boolean
}

function buildAgentStartRequest(input: AgentSendInput): {
  sessionId: string
  channelId: string
  modelId?: string
  permissionModeOverride?: string
  useJagent?: boolean
  userMessage?: string
} {
  const useJagent = input.backendMode === 'jagent'
  return {
    sessionId: input.sessionId,
    channelId: input.channelId,
    modelId: input.modelId,
    permissionModeOverride: input.permissionModeOverride,
    useJagent,
    userMessage: useJagent ? input.userMessage : undefined,
  }
}

function buildAgentMessageRequest(input: AgentSendInput): {
  sessionId: string
  userMessage: string
} {
  return {
    sessionId: input.sessionId,
    userMessage: input.userMessage,
  }
}

export async function sendAgentMessage(input: AgentSendInput): Promise<void> {
  const sessionId = input.sessionId
  const content = input.userMessage
  const permissionMode = input.permissionModeOverride || 'bypassPermissions'
  const backendMode = input.backendMode ?? 'claude-sdk'
  let startedRuntime = false
  const runState: AgentRunState = {
    runId: nextAgentRunId++,
    startedAt: input.startedAt,
    stoppedByUser: false,
  }

  // 如果当前会话没有活跃通道，则先启动 agent
  if (!agentChannels.has(sessionId)) {
    const channel = new Channel<any>() as AgentRuntimeChannel
    channel.__agentRunState = runState
    agentChannels.set(sessionId, channel)

    channel.onmessage = (event: any) => {
      const decoded = decodeAgentStreamEvent(event, sessionId)
      if (decoded?.kind === 'payload') {
        emit('agent:stream-event', { sessionId, payload: decoded.payload })
      } else if (decoded?.kind === 'complete') {
        const activeRun = channel.__agentRunState
        const payload: AgentStreamCompletePayload = {
          sessionId,
          startedAt: activeRun?.startedAt,
          stoppedByUser: activeRun?.stoppedByUser,
          resultSubtype: decoded.resultSubtype,
        }
        emit('agent:stream-complete', payload)
        const currentChannel = agentChannels.get(sessionId)
        if (currentChannel === channel) {
          agentChannels.delete(sessionId)
        }
      } else if (decoded?.kind === 'error') {
        emit('agent:stream-error', { sessionId, error: decoded.error })
        const currentChannel = agentChannels.get(sessionId)
        if (currentChannel === channel) {
          agentChannels.delete(sessionId)
        }
      }
    }

    try {
      await invoke('start_agent', {
        input: buildAgentStartRequest({
          ...input,
          backendMode,
          permissionModeOverride: permissionMode,
        }),
        onEvent: channel,
      })
      startedRuntime = true
    } catch (e: any) {
      const currentChannel = agentChannels.get(sessionId)
      if (currentChannel === channel) {
        agentChannels.delete(sessionId)
      }
      emit('agent:stream-error', { sessionId, error: e?.message || String(e) })
      return
    }
  }

  const channel = agentChannels.get(sessionId)
  if (!channel) {
    emit('agent:stream-error', { sessionId, error: `Agent 未启动: ${sessionId}` })
    return
  }

  if (backendMode === 'jagent' && startedRuntime) {
    return
  }

  // 将实际消息发送给正在运行的 agent
  try {
    await invoke('send_agent_message', {
      input: buildAgentMessageRequest({
        ...input,
        userMessage: content,
      }),
    })
  } catch (e: any) {
    emit('agent:stream-error', { sessionId, error: e?.message || String(e) })
  }
}

export async function stopAgent(sessionId: string): Promise<void> {
  const channel = agentChannels.get(sessionId)
  if (channel?.__agentRunState) {
    channel.__agentRunState.stoppedByUser = true
  }
  await invoke('stop_agent', { sessionId })
  agentChannels.delete(sessionId)
}

// ============================================================
// Agent 流式事件
// ============================================================

export const onAgentStreamEvent = (cb: Handler) => onEvt('agent:stream-event', cb)
export const onAgentStreamComplete = (cb: Handler) => onEvt('agent:stream-complete', cb)
export const onAgentStreamError = (cb: Handler) => onEvt('agent:stream-error', cb)
export const onAgentTitleUpdated = (cb: Handler) => onEvt('agent:title-updated', cb)

// ============================================================
// Agent 权限
// ============================================================

export async function respondPermission(response: any) {
  return invoke('respond_agent_interrupt', {
    input: {
      sessionId: response.sessionId,
      interruptId: response.requestId,
      kind: 'permission',
      response: {
        allowed: response.behavior === 'allow',
        alwaysAllow: !!response.alwaysAllow,
      },
    },
  })
}
export async function respondAskUser(response: any) {
  const answers = Array.isArray(response.answers)
    ? response.answers
    : Object.entries(response.answers ?? {})
        .filter((entry) => typeof entry[1] === 'string' && entry[1].trim().length > 0)
        .map(([questionId, value]) => ({
          questionId,
          selectedOptions: [value as string],
        }))
  return invoke('respond_agent_interrupt', {
    input: {
      sessionId: response.sessionId,
      interruptId: response.requestId,
      kind: 'ask_user',
      response: {
        answers,
      },
    },
  })
}
export const respondExitPlanMode = (response: any) => {
  const decision = response.action === 'approve_auto'
    ? 'approve_and_run'
    : response.action === 'approve_edit'
      ? 'approve_with_permissions'
      : 'reject'
  return tryInvoke('respond_agent_interrupt', {
    input: {
      sessionId: response.sessionId,
      interruptId: response.requestId,
      kind: 'plan',
      response: {
        decision,
        feedback: response.feedback,
      },
    },
  })
}
export const updateSessionPermissionMode = (sessionId: string, mode: string) =>
  tryInvoke('update_session_permission_mode', { sessionId, mode })

export const onPermissionRequest = (cb: Handler) => onEvt('agent:permission-request', cb)
export const onAskUserRequest = (cb: Handler) => onEvt('agent:ask-user-request', cb)
export const onExitPlanModeRequest = (cb: Handler) => onEvt('agent:exit-plan-mode', cb)

// ============================================================
// Agent 工作区
// ============================================================

export const listAgentWorkspaces = () => tryInvoke<any[]>('list_agent_workspaces', undefined, [])
export const createAgentWorkspace = (name: string) => tryInvoke<any>('create_agent_workspace', { name })
export const updateAgentWorkspace = (id: string, updates: { name: string }) =>
  tryInvoke<any>('update_agent_workspace', { id, updates })
export const deleteAgentWorkspace = (id: string) => tryInvoke('delete_agent_workspace', { id })
export const reorderAgentWorkspaces = (orderedIds: string[]) =>
  tryInvoke<any[]>('reorder_agent_workspaces', { orderedIds }, [])

// ============================================================
// 工作区能力（MCP + 技能）
// ============================================================

/** 从 ~/.jdata/agent/mcp_config.json 列出 j-cli MCP 服务器（只读数据源） */
export const listMcpServers = () =>
  tryInvoke<Array<{ name: string; transport: string; command?: string; args?: string[]; url?: string; env?: Record<string, string>; disabled: boolean }>>('list_mcp_servers')

export const getWorkspaceCapabilities = (workspaceSlug: string) =>
  tryInvoke<any>('get_workspace_capabilities', { workspaceSlug })
export const getWorkspaceMcpConfig = (workspaceSlug: string) =>
  tryInvoke<any>('get_workspace_mcp_config', { workspaceSlug })
export const saveWorkspaceMcpConfig = async (workspaceSlug: string, config: any) => {
  await tryInvoke('save_workspace_mcp_config', { workspaceSlug, config })
  emitCapabilitiesChanged()
}
export const testMcpServer = (name: string, entry: any) =>
  tryInvoke<ConnectionTestResult>('test_mcp_server', { name, entry })
export const getWorkspaceSkills = (workspaceSlug: string) =>
  tryInvoke<any[]>('get_workspace_skills', { workspaceSlug })
export const getWorkspaceSkillsDir = (workspaceSlug: string) =>
  tryInvoke<string>('get_workspace_skills_dir', { workspaceSlug })
export const deleteWorkspaceSkill = async (workspaceSlug: string, skillSlug: string) => {
  await tryInvoke('delete_workspace_skill', { workspaceSlug, skillSlug })
  emitCapabilitiesChanged()
  emitWorkspaceFilesChanged()
}
export const toggleWorkspaceSkill = async (workspaceSlug: string, skillSlug: string, enabled: boolean) => {
  await tryInvoke('toggle_workspace_skill', { workspaceSlug, skillSlug, enabled })
  emitCapabilitiesChanged()
}
export const getOtherWorkspaceSkills = (currentSlug: string) =>
  tryInvoke<any[]>('get_other_workspace_skills', { currentSlug })
export const importSkillFromWorkspace = async (targetSlug: string, sourceSlug: string, skillSlug: string) => {
  await tryInvoke<void>('import_skill_from_workspace', { targetSlug, sourceSlug, skillSlug })
  emitCapabilitiesChanged()
  emitWorkspaceFilesChanged()
}
export const readSkillContent = (workspaceSlug: string, skillSlug: string) =>
  tryInvoke<string>('read_skill_content', { workspaceSlug, skillSlug })
export const writeSkillContent = async (workspaceSlug: string, skillSlug: string, content: string) => {
  await tryInvoke('write_skill_content', { workspaceSlug, skillSlug, content })
  emitCapabilitiesChanged()
  emitWorkspaceFilesChanged()
}

// ============================================================
// 事件
// ============================================================

export const onCapabilitiesChanged = (cb: Handler) => onEvt('workspace:capabilities-changed', cb)
export const onWorkspaceFilesChanged = (cb: Handler) => onEvt('workspace:files-changed', cb)

// ============================================================
// 后台任务
// ============================================================

export const getTaskOutput = (input: any) =>
  tryInvoke<any>('get_task_output', { input }, { output: '' })
export const stopTask = (input: any) => tryInvoke('stop_task', { input })

// ============================================================
// 附件
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
// 用户档案
// ============================================================

export const getUserProfile = () => tryInvoke<UserProfile>('get_user_profile', undefined, { userName: 'User', avatar: '🧑‍💻' })
export const updateUserProfile = (updates: Partial<UserProfile>) =>
  tryInvoke<UserProfile>('update_user_profile', { updates }, { userName: 'User', avatar: '🧑‍💻' })

// ============================================================
// 在线状态
// ============================================================

export const getOnlineStatus = () => Promise.resolve(navigator.onLine)
// 已移除：j-gui v1 不支持 updater

// ============================================================
// 系统提示词
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
// Chat 工具
// ============================================================

function toChatToolInfo(tool: { name: string; description: string; enabled: boolean }): ChatToolInfo {
  const iconByName: Record<string, string> = {
    Bash: 'Terminal',
    Read: 'FileText',
    Write: 'Pencil',
    Edit: 'Pencil',
    Glob: 'FolderSearch',
    Grep: 'Search',
    WebFetch: 'Globe',
    WebSearch: 'Globe',
    Browser: 'Monitor',
    Ask: 'MessageSquare',
    TaskOutput: 'ScrollText',
    Task: 'ListTodo',
    TodoWrite: 'ListTodo',
    TodoRead: 'ListTodo',
    Compact: 'Package2',
    RegisterHook: 'Plug',
    EnterPlanMode: 'Map',
    ExitPlanMode: 'Map',
    EnterWorktree: 'FolderGit2',
    ExitWorktree: 'FolderGit2',
    LoadSkill: 'Sparkles',
  }

  return {
    meta: {
      id: tool.name,
      name: tool.name,
      description: tool.description,
      params: [],
      icon: iconByName[tool.name],
      category: 'builtin',
      executorType: 'builtin',
    },
    enabled: tool.enabled,
    available: true,
  }
}

export const getChatTools = async (): Promise<ChatToolInfo[]> =>
  (await listChatTools()).map(toChatToolInfo)

/** 列出内置 chat 工具及其启用状态（来自 AgentConfig.disabled_tools） */
export const listChatTools = () =>
  invoke<Array<{ name: string; description: string; enabled: boolean }>>('list_chat_tools')

/** 列出来自 j-cli 的技能（包含 user 与 project 来源） */
export const listSkills = () =>
  invoke<Array<{ name: string; description: string; source: string; dirPath: string }>>('list_skills')

/** 扫描全局技能目录（~/.claude/agents/skills/ 与 ~/.agent/skills/） */
export const scanGlobalSkills = () =>
  invoke<Array<{ name: string; description: string; source: string; dirPath: string }>>('scan_global_skills')

/** 将 skill 从源目录复制到当前工作区 */
export const copySkillToWorkspace = async (sourceDir: string, workspaceSlug: string, skillSlug: string) => {
  await invoke<void>('copy_skill_to_workspace', { sourceDir, workspaceSlug, skillSlug })
  emitCapabilitiesChanged()
  emitWorkspaceFilesChanged()
}

/** 按名称启用或禁用内置 chat 工具 */
export const setToolEnabled = (name: string, enabled: boolean) =>
  invoke<void>('set_tool_enabled', { name, enabled })
export const onCustomToolChanged = (_callback: Handler): (() => void) =>
  unsupportedSubscription('customToolChanged')
export const updateChatToolState = (id: string, state: { enabled?: boolean }) => {
  if (typeof state?.enabled !== 'boolean') {
    throw new Error('updateChatToolState currently only supports toggling enabled')
  }
  return setToolEnabled(id, state.enabled)
}
export const addCustomTool = (_meta: any) => unsupportedCommand('add_custom_tool')
export const removeCustomTool = (_id: string) => unsupportedCommand('remove_custom_tool')
export const deleteCustomChatTool = (_id: string) => unsupportedCommand('delete_custom_chat_tool')
export const getChatToolCredentials = (_id: string) => unsupportedCommand('get_chat_tool_credentials')
export const updateChatToolCredentials = (_id: string, _creds: any) =>
  unsupportedCommand('update_chat_tool_credentials')
export const testChatTool = (_id: string, _creds: any) => unsupportedCommand('test_chat_tool')

// ============================================================
// Agent 文件
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

// 文件浏览器操作
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
export const openFolderDialog = () =>
  tryInvoke<any>('open_folder_dialog', undefined, { canceled: true, filePaths: [], path: undefined })
export const getWorkspaceDirectories = (workspaceSlug: string) =>
  tryInvoke<string[]>('get_workspace_directories', { workspaceSlug }, [])
export const getWorkspaceFilesPath = (workspaceSlug: string) =>
  tryInvoke<string>('get_workspace_files_path', { workspaceSlug }, '')
export const getAgentSessionPath = (sessionId: string) =>
  tryInvoke<string>('get_agent_session_path', { sessionId }, '')
export const getPathForFile = (file: File) => URL.createObjectURL(file)
export const checkPathsType = (paths: string[]) => tryInvoke<any>('check_paths_type', { paths }, {})
export const getFilePath = (file: File) => URL.createObjectURL(file)

// ============================================================
// 记忆
// ============================================================

export const getMemoryConfig = () => tryInvoke<any>('get_memory_config', undefined, { enabled: false, memories: [] })
export const saveMemoryConfig = (config: any) => tryInvoke('save_memory_config', { config })
export const setMemoryConfig = (config: any) => tryInvoke('set_memory_config', { config })

// ============================================================
// Agent 团队
// ============================================================

export const getAgentTeamData = () => tryInvoke<any>('get_agent_team_data', undefined, null)

// 已移除：j-gui v1 不支持 installer 与 proxy

// ============================================================
// Hook 配置
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

export const listHooks = () => tryInvoke<HookInfo[]>('list_hooks')

export const toggleHook = (uniqueId: string, enabled: boolean) =>
  tryInvoke('toggle_hook', { uniqueId, enabled })

// ============================================================
// Yaml 配置
// ============================================================

export const getConfig = () => tryInvoke<{ sections: Record<string, Record<string, string>> }>('get_config', undefined, { sections: {} })
export const setConfig = (section: string, key: string, value: string) => tryInvoke('set_config', { section, key, value })

// ============================================================
// 别名
// ============================================================

export const listAliases = () => tryInvoke<Array<{ section: string; name: string; value: string }>>('list_aliases', undefined, [])
export const setAlias = (section: string, name: string, value: string) => tryInvoke('set_alias', { section, name, value })
export const removeAlias = (section: string, name: string) => tryInvoke('remove_alias', { section, name })

// 已移除：j-gui v1 不支持 quick_task
// 已移除：j-gui v1 不支持 feishu

// 已移除：j-gui v1 不支持 dingtalk

// 已移除：j-gui v1 不支持 voice_dictation

// 已移除：j-gui v1 不支持 migration

// ============================================================
// 杂项
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

// 已移除：托盘事件重复项（onTrayCreateSession/onTrayOpenAgentSession 已在上方定义）

// ============================================================
// 导出 emit/onEvt 供流式事件使用（由 Rust 后端通过 Tauri events 调用）
// ============================================================

export { emit, onEvt }
