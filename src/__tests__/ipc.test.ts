import { describe, it, expect, vi } from 'vitest'
import * as ipc from '@/lib/ipc'
import { CHAT_IPC_CHANNELS } from '@jgui/shared'
import { decodeChatStreamEvent, decodeAgentStreamEvent } from '@/lib/ipc-stream-protocol'

describe('IPC module — settings', () => {
  it('getSettings returns default settings when Tauri is unavailable', async () => {
    const settings = await ipc.getSettings()
    expect(settings).toBeDefined()
    expect(settings.themeMode).toBe('dark')
    expect(settings.onboardingCompleted).toBe(true)
  })

  it('updateSettings merges updates locally when Tauri is unavailable', async () => {
    const result = await ipc.updateSettings({ themeMode: 'light' })
    expect(result.themeMode).toBe('light')
  })

  it('getSettings after update returns cached value', async () => {
    const s = await ipc.getSettings()
    expect(s.themeMode).toBe('light')
  })
})

describe('IPC module — channels', () => {
  it('listChannels returns empty array as fallback', async () => {
    const channels = await ipc.listChannels()
    expect(Array.isArray(channels)).toBe(true)
  })

  it('testChannelDirect returns not-implemented fallback', async () => {
    const result = await ipc.testChannelDirect({ apiBase: '', apiKey: '' })
    expect(result).toHaveProperty('success')
  })

  it('updateChatToolState delegates enabled toggles to set_tool_enabled', async () => {
    await vi.resetModules()

    const invokeMock = vi.fn(async () => undefined)
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: invokeMock,
      Channel: class ChannelMock {},
    }))

    const freshIpc = await import('@/lib/ipc')
    await freshIpc.updateChatToolState('WebSearch', { enabled: true })

    expect(invokeMock).toHaveBeenCalledWith('set_tool_enabled', {
      name: 'WebSearch',
      enabled: true,
    })

    vi.doUnmock('@tauri-apps/api/core')
    await vi.resetModules()
  })

  it('updateChatToolState rejects unsupported state payloads', () => {
    expect(() => ipc.updateChatToolState('WebSearch', {})).toThrow(
      'updateChatToolState currently only supports toggling enabled'
    )
  })

  it('unsupported custom tool IPC entry points fail fast', async () => {
    await expect(async () => ipc.addCustomTool({ name: 'demo' })).rejects.toThrow(
      "Tauri command 'add_custom_tool' is not implemented in j-gui backend"
    )
    await expect(async () => ipc.removeCustomTool('demo')).rejects.toThrow(
      "Tauri command 'remove_custom_tool' is not implemented in j-gui backend"
    )
    await expect(async () => ipc.deleteCustomChatTool('demo')).rejects.toThrow(
      "Tauri command 'delete_custom_chat_tool' is not implemented in j-gui backend"
    )
    await expect(async () => ipc.getChatToolCredentials('demo')).rejects.toThrow(
      "Tauri command 'get_chat_tool_credentials' is not implemented in j-gui backend"
    )
    await expect(async () => ipc.updateChatToolCredentials('demo', {})).rejects.toThrow(
      "Tauri command 'update_chat_tool_credentials' is not implemented in j-gui backend"
    )
    await expect(async () => ipc.testChatTool('demo', {})).rejects.toThrow(
      "Tauri command 'test_chat_tool' is not implemented in j-gui backend"
    )
  })

  it('testMcpServer forwards to the backend command', async () => {
    await vi.resetModules()

    const invokeMock = vi.fn(async () => ({ success: true, message: 'ok' }))
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: invokeMock,
      Channel: class ChannelMock {},
    }))

    const freshIpc = await import('@/lib/ipc')
    const result = await freshIpc.testMcpServer('demo-mcp', { type: 'stdio', command: 'npx' })

    expect(result).toEqual({ success: true, message: 'ok' })
    expect(invokeMock).toHaveBeenCalledWith('test_mcp_server', {
      name: 'demo-mcp',
      entry: { type: 'stdio', command: 'npx' },
    })

    vi.doUnmock('@tauri-apps/api/core')
    await vi.resetModules()
  })

  it('testMemoryConnection fails fast when the backend command is unavailable', async () => {
    await expect(async () => ipc.testMemoryConnection({ provider: 'demo' })).rejects.toThrow(
      "Tauri command 'test_memory_connection' not available"
    )
  })

  it('getAgentSessionSDKMessages surfaces backend replay failures instead of synthesizing fallback', async () => {
    await vi.resetModules()

    const invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_agent_session_sdk_messages') {
        throw new Error("Tauri command 'get_agent_session_sdk_messages' not available")
      }
      return undefined
    })
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: invokeMock,
      Channel: class ChannelMock {},
    }))

    const freshIpc = await import('@/lib/ipc')
    await expect(freshIpc.getAgentSessionSDKMessages('agent-replay')).rejects.toThrow(
      "Tauri command 'get_agent_session_sdk_messages' not available"
    )

    vi.doUnmock('@tauri-apps/api/core')
    await vi.resetModules()
  })
})

describe('IPC stream protocol helpers', () => {
  it('decodeChatStreamEvent normalizes chunk and string events', () => {
    expect(decodeChatStreamEvent({ event: 'chunk', Chunk: { delta: 'hello', index: 3 } }, 'c1')).toEqual({
      kind: 'chunk',
      conversationId: 'c1',
      delta: 'hello',
      index: 3,
    })
    expect(decodeChatStreamEvent('plain text', 'c1')).toEqual({
      kind: 'chunk',
      conversationId: 'c1',
      delta: 'plain text',
      index: 0,
    })
  })

  it('decodeChatStreamEvent normalizes done and error events', () => {
    expect(decodeChatStreamEvent({ event: 'done', Done: { total_tokens: 42 } }, 'c1')).toEqual({
      kind: 'complete',
      conversationId: 'c1',
      totalTokens: 42,
    })
    expect(decodeChatStreamEvent({ event: 'error', Error: { message: 'boom' } }, 'c1')).toEqual({
      kind: 'error',
      conversationId: 'c1',
      error: 'boom',
    })
  })

  it('decodeAgentStreamEvent canonicalizes legacy assistant content and tool use events', () => {
    expect(decodeAgentStreamEvent({ AssistantContent: { text: 'answer' } }, 's1')).toEqual({
      kind: 'payload',
      sessionId: 's1',
      payload: {
        kind: 'sdk_message',
        message: {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'text',
                text: 'answer',
              },
            ],
          },
          parent_tool_use_id: null,
        },
      },
    })
    expect(decodeAgentStreamEvent({ ToolUse: { tool_id: 't1', tool_name: 'search', tool_input: { q: 'x' } } }, 's1')).toEqual({
      kind: 'payload',
      sessionId: 's1',
      payload: {
        kind: 'sdk_message',
        message: {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 't1',
                name: 'search',
                input: { q: 'x' },
              },
            ],
          },
          parent_tool_use_id: null,
        },
      },
    })
    expect(
      decodeAgentStreamEvent(
        { ToolUse: { tool_id: 't2', tool_name: 'search', tool_input: '{"q":"x"}' } },
        's1'
      )
    ).toEqual({
      kind: 'payload',
      sessionId: 's1',
      payload: {
        kind: 'sdk_message',
        message: {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 't2',
                name: 'search',
                input: { q: 'x' },
              },
            ],
          },
          parent_tool_use_id: null,
        },
      },
    })
    expect(
      decodeAgentStreamEvent(
        { event: 'assistantContent', data: { text: 'tagged answer' } },
        's1'
      )
    ).toEqual({
      kind: 'payload',
      sessionId: 's1',
      payload: {
        kind: 'sdk_message',
        message: {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'text',
                text: 'tagged answer',
              },
            ],
          },
          parent_tool_use_id: null,
        },
      },
    })
    expect(
      decodeAgentStreamEvent(
        { event: 'toolUse', data: { tool_id: 't3', tool_name: 'search', tool_input: '{"q":"y"}' } },
        's1'
      )
    ).toEqual({
      kind: 'payload',
      sessionId: 's1',
      payload: {
        kind: 'sdk_message',
        message: {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 't3',
                name: 'search',
                input: { q: 'y' },
              },
            ],
          },
          parent_tool_use_id: null,
        },
      },
    })
  })

  it('decodeAgentStreamEvent canonicalizes interrupt and plan events', () => {
    expect(decodeAgentStreamEvent({ Interrupt: { interrupt_id: 'i1', kind: 'permission', tool_name: 'search', tool_input: { q: 'x' } } }, 's1')).toEqual({
      kind: 'payload',
      sessionId: 's1',
      payload: {
        kind: 'jgui_event',
        event: {
          type: 'permission_request',
          request: {
            requestId: 'i1',
            sessionId: 's1',
            toolName: 'search',
            toolInput: { q: 'x' },
            description: 'search',
            dangerLevel: 'normal',
          },
        },
      },
    })
    expect(
      decodeAgentStreamEvent(
        {
          Interrupt: {
            interrupt_id: 'i-ask',
            kind: 'ask_user',
            tool_name: 'ask_user',
            tool_input:
              '{"questions":[{"id":"question-os","question":"Which OS?","options":[{"label":"Windows"},{"label":"Linux"}]}]}',
          },
        },
        's1'
      )
    ).toEqual({
      kind: 'payload',
      sessionId: 's1',
      payload: {
        kind: 'jgui_event',
        event: {
          type: 'ask_user_request',
          request: {
            requestId: 'i-ask',
            sessionId: 's1',
            questions: [
              {
                id: 'question-os',
                question: 'Which OS?',
                header: undefined,
                options: [
                  { label: 'Windows', description: undefined, preview: undefined },
                  { label: 'Linux', description: undefined, preview: undefined },
                ],
                multiSelect: false,
              },
            ],
            toolInput: {
              questions: [
                {
                  id: 'question-os',
                  question: 'Which OS?',
                  options: [{ label: 'Windows' }, { label: 'Linux' }],
                },
              ],
            },
          },
        },
      },
    })
    expect(
      decodeAgentStreamEvent(
        {
          event: 'interrupt',
          data: {
            interrupt_id: 'i-ask-2',
            kind: 'ask_user',
            tool_name: 'ask_user',
            tool_input: '{"questions":[{"id":"question-editor","question":"Use editor?","options":[{"label":"Yes"}]}]}',
          },
        },
        's1'
      )
    ).toEqual({
      kind: 'payload',
      sessionId: 's1',
      payload: {
        kind: 'jgui_event',
        event: {
          type: 'ask_user_request',
          request: {
            requestId: 'i-ask-2',
            sessionId: 's1',
            questions: [
              {
                id: 'question-editor',
                question: 'Use editor?',
                header: undefined,
                options: [{ label: 'Yes', description: undefined, preview: undefined }],
                multiSelect: false,
              },
            ],
            toolInput: {
              questions: [{ id: 'question-editor', question: 'Use editor?', options: [{ label: 'Yes' }] }],
            },
          },
        },
      },
    })
    expect(decodeAgentStreamEvent({ Interrupt: { interrupt_id: 'i2', kind: 'plan', tool_name: 'plan', tool_input: { plan_summary: 'do it' } } }, 's1')).toEqual({
      kind: 'payload',
      sessionId: 's1',
      payload: {
        kind: 'jgui_event',
        event: {
          type: 'exit_plan_mode_request',
          request: {
            requestId: 'i2',
            sessionId: 's1',
            toolInput: { plan_summary: 'do it' },
            allowedPrompts: [],
          },
        },
      },
    })
    expect(
      decodeAgentStreamEvent(
        {
          Interrupt: {
            interrupt_id: 'i3',
            kind: 'plan',
            tool_name: 'plan',
            tool_input: '{"plan_summary":"do it"}',
          },
        },
        's1'
      )
    ).toEqual({
      kind: 'payload',
      sessionId: 's1',
      payload: {
        kind: 'jgui_event',
        event: {
          type: 'exit_plan_mode_request',
          request: {
            requestId: 'i3',
            sessionId: 's1',
            toolInput: { plan_summary: 'do it' },
            allowedPrompts: [],
          },
        },
      },
    })
    expect(decodeAgentStreamEvent({ ToolResult: { tool_id: 't1', content: 'done' } }, 's1')).toEqual({
      kind: 'payload',
      sessionId: 's1',
      payload: {
        kind: 'sdk_message',
        message: {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 't1',
                content: 'done',
              },
            ],
          },
          parent_tool_use_id: null,
        },
      },
    })
    expect(decodeAgentStreamEvent({ event: 'toolResult', data: { tool_id: 't2', content: 'tagged-done' } }, 's1')).toEqual({
      kind: 'payload',
      sessionId: 's1',
      payload: {
        kind: 'sdk_message',
        message: {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 't2',
                content: 'tagged-done',
              },
            ],
          },
          parent_tool_use_id: null,
        },
      },
    })
  })

  it('decodeAgentStreamEvent normalizes done and error events', () => {
    expect(decodeAgentStreamEvent({ event: 'done', data: { total_tokens: 7 } }, 's1')).toEqual({
      kind: 'complete',
      sessionId: 's1',
      totalTokens: 7,
    })
    expect(decodeAgentStreamEvent({ Done: { total_tokens: 7 } }, 's1')).toEqual({
      kind: 'complete',
      sessionId: 's1',
      totalTokens: 7,
    })
    expect(decodeAgentStreamEvent({ Error: { message: 'agent boom' } }, 's1')).toEqual({
      kind: 'error',
      sessionId: 's1',
      error: 'agent boom',
    })
    expect(decodeAgentStreamEvent({ event: 'error', data: { message: 'tagged boom' } }, 's1')).toEqual({
      kind: 'error',
      sessionId: 's1',
      error: 'tagged boom',
    })
  })
})

describe('IPC module — conversations', () => {
  it('listConversations returns empty array as fallback', async () => {
    const convs = await ipc.listConversations()
    expect(Array.isArray(convs)).toBe(true)
  })

  it('createConversation throws when Tauri is unavailable', async () => {
    await expect(ipc.createConversation()).rejects.toThrow()
  })
})

describe('IPC module — agent', () => {
  it('listAgentSessions returns empty array as fallback', async () => {
    const sessions = await ipc.listAgentSessions()
    expect(Array.isArray(sessions)).toBe(true)
  })

  it('onAgentStreamEvent registers and returns cleanup', () => {
    const cb = vi.fn()
    const cleanup = ipc.onAgentStreamEvent(cb)
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  it('sendAgentMessage emits canonical agent stream payloads', async () => {
    await vi.resetModules()

    const channelInstances: Array<{ onmessage?: (event: unknown) => void }> = []
    const invokeMock = vi.fn(async (cmd: string, args: any) => {
      if (cmd === 'start_agent') {
        args.onEvent.onmessage?.({
          kind: 'sdk_message',
          message: {
            type: 'assistant',
            message: {
              content: [
                {
                  type: 'text',
                  text: 'answer',
                },
              ],
            },
            parent_tool_use_id: null,
          },
        })
      }
      return undefined
    })
    vi.doMock('@tauri-apps/api/core', () => {
      class ChannelMock {
        onmessage?: (event: unknown) => void
        constructor() {
          channelInstances.push(this)
        }
      }

      return {
        invoke: invokeMock,
        Channel: ChannelMock,
      }
    })

    const freshIpc = await import('@/lib/ipc')
    const streamEventCb = vi.fn()
    const cleanup = freshIpc.onAgentStreamEvent(streamEventCb)

    await freshIpc.sendAgentMessage({
      sessionId: 'agent-1',
      userMessage: 'hello',
      channelId: 'channel-a',
      modelId: 'model-a',
      workspaceId: 'workspace-a',
      additionalDirectories: ['E:/extra'],
      mentionedSkills: ['skill-a'],
      mentionedMcpServers: ['mcp-a'],
      permissionModeOverride: 'plan',
      startedAt: 123,
    })

    expect(channelInstances).toHaveLength(1)
    expect(streamEventCb).toHaveBeenCalledTimes(1)
    expect(streamEventCb).toHaveBeenCalledWith({
      sessionId: 'agent-1',
      payload: {
        kind: 'sdk_message',
        message: {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'text',
                text: 'answer',
              },
            ],
          },
          parent_tool_use_id: null,
        },
      },
    })
    expect(invokeMock).toHaveBeenCalledWith('start_agent', {
      input: {
        sessionId: 'agent-1',
        channelId: 'channel-a',
        modelId: 'model-a',
        permissionModeOverride: 'plan',
      },
      onEvent: channelInstances[0],
    })
    expect(invokeMock).toHaveBeenCalledWith('send_agent_message', {
      input: {
        sessionId: 'agent-1',
        userMessage: 'hello',
      },
    })

    cleanup()
    vi.doUnmock('@tauri-apps/api/core')
    await vi.resetModules()
  })

  it('sendAgentMessage fails gracefully without Tauri', async () => {
    await expect(
      ipc.sendAgentMessage({ sessionId: 'test', userMessage: 'hello', channelId: 'channel-a' })
    ).resolves.toBeUndefined()
  })

  it('sendAgentMessage emits an error event when agent startup is unavailable', async () => {
    const errorCb = vi.fn()
    const cleanup = ipc.onAgentStreamError(errorCb)

    await ipc.sendAgentMessage({
      sessionId: 'test-start-fail',
      userMessage: 'hello',
      channelId: 'channel-a',
    })

    expect(errorCb).toHaveBeenCalledTimes(1)
    expect(errorCb).toHaveBeenCalledWith({
      sessionId: 'test-start-fail',
      error: 'Tauri not available in test',
    })

    cleanup()
  })

  it('sendAgentMessage forwards complete payload metadata for stream teardown', async () => {
    await vi.resetModules()

    const channelInstances: Array<{ onmessage?: (event: unknown) => void }> = []
    vi.doMock('@tauri-apps/api/core', () => {
      class ChannelMock {
        onmessage?: (event: unknown) => void
        constructor() {
          channelInstances.push(this)
        }
      }

      return {
        invoke: vi.fn(async (cmd: string, args: any) => {
          if (cmd === 'start_agent') {
            return undefined
          }
          return undefined
        }),
        Channel: ChannelMock,
      }
    })

    const freshIpc = await import('@/lib/ipc')
    const completeCb = vi.fn()
    const cleanup = freshIpc.onAgentStreamComplete(completeCb)

    await freshIpc.sendAgentMessage({
      sessionId: 'agent-2',
      userMessage: 'continue',
      channelId: 'channel-b',
      startedAt: 456,
    })
    await freshIpc.stopAgent('agent-2')
    channelInstances[0]?.onmessage?.({
      event: 'done',
      data: { total_tokens: 11, result_subtype: 'error_max_turns' },
    })

    expect(completeCb).toHaveBeenCalledWith({
      sessionId: 'agent-2',
      startedAt: 456,
      stoppedByUser: true,
      resultSubtype: 'error_max_turns',
    })

    cleanup()
    vi.doUnmock('@tauri-apps/api/core')
    await vi.resetModules()
  })

  it('stopAgent keeps the runtime channel when backend stop fails', async () => {
    await vi.resetModules()

    const channelInstances: Array<{ onmessage?: (event: unknown) => void }> = []
    const invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'start_agent') return undefined
      if (cmd === 'send_agent_message') return undefined
      if (cmd === 'stop_agent') throw new Error('stop failed')
      return undefined
    })
    const completeCb = vi.fn()

    vi.doMock('@tauri-apps/api/core', () => {
      class ChannelMock {
        onmessage?: (event: unknown) => void
        constructor() {
          channelInstances.push(this)
        }
      }

      return {
        invoke: invokeMock,
        Channel: ChannelMock,
      }
    })

    const freshIpc = await import('@/lib/ipc')
    const cleanup = freshIpc.onAgentStreamComplete(completeCb)

    await freshIpc.sendAgentMessage({
      sessionId: 'agent-stop-fail',
      userMessage: 'first',
      channelId: 'channel-a',
      startedAt: 999,
    })

    await expect(freshIpc.stopAgent('agent-stop-fail')).rejects.toThrow('stop failed')

    channelInstances[0]?.onmessage?.({
      event: 'done',
      data: { total_tokens: 1, result_subtype: 'success' },
    })

    expect(completeCb).toHaveBeenCalledWith({
      sessionId: 'agent-stop-fail',
      startedAt: 999,
      stoppedByUser: true,
      resultSubtype: 'success',
    })

    cleanup()
    vi.doUnmock('@tauri-apps/api/core')
    await vi.resetModules()
  })

  it('sendAgentMessage keeps different session runtimes isolated without forced stop', async () => {
    await vi.resetModules()

    const invokeMock = vi.fn(async () => undefined)
    vi.doMock('@tauri-apps/api/core', () => {
      class ChannelMock {
        onmessage?: (event: unknown) => void
      }

      return {
        invoke: invokeMock,
        Channel: ChannelMock,
      }
    })

    const freshIpc = await import('@/lib/ipc')

    await freshIpc.sendAgentMessage({
      sessionId: 'agent-a',
      userMessage: 'first',
      channelId: 'channel-a',
    })
    await freshIpc.sendAgentMessage({
      sessionId: 'agent-b',
      userMessage: 'second',
      channelId: 'channel-b',
    })

    expect(invokeMock.mock.calls).toEqual([
      ['start_agent', expect.objectContaining({ input: expect.objectContaining({ sessionId: 'agent-a' }) })],
      ['send_agent_message', { input: { sessionId: 'agent-a', userMessage: 'first' } }],
      ['start_agent', expect.objectContaining({ input: expect.objectContaining({ sessionId: 'agent-b' }) })],
      ['send_agent_message', { input: { sessionId: 'agent-b', userMessage: 'second' } }],
    ])

    vi.doUnmock('@tauri-apps/api/core')
    await vi.resetModules()
  })

  it('respondAskUser preserves structured question ids on the canonical path', async () => {
    await vi.resetModules()

    const invokeMock = vi.fn(async () => undefined)
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: invokeMock,
      Channel: class ChannelMock {},
    }))

    const freshIpc = await import('@/lib/ipc')
    await freshIpc.respondAskUser({
      sessionId: 'agent-ask',
      requestId: 'ask-1',
      answers: [
        {
          questionId: 'question-os',
          selectedOptions: ['Windows'],
        },
      ],
    })

    expect(invokeMock).toHaveBeenCalledWith('respond_agent_interrupt', {
      input: {
        sessionId: 'agent-ask',
        interruptId: 'ask-1',
        kind: 'ask_user',
        response: {
          answers: [
            {
              questionId: 'question-os',
              selectedOptions: ['Windows'],
            },
          ],
        },
      },
    })
    
    vi.doUnmock('@tauri-apps/api/core')
    await vi.resetModules()
  })

  it('respondPermission includes session routing on the canonical path', async () => {
    await vi.resetModules()

    const invokeMock = vi.fn(async () => undefined)
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: invokeMock,
      Channel: class ChannelMock {},
    }))

    const freshIpc = await import('@/lib/ipc')
    await freshIpc.respondPermission({
      sessionId: 'agent-perm',
      requestId: 'perm-1',
      behavior: 'allow',
      alwaysAllow: true,
    })

    expect(invokeMock).toHaveBeenCalledWith('respond_agent_interrupt', {
      input: {
        sessionId: 'agent-perm',
        interruptId: 'perm-1',
        kind: 'permission',
        response: {
          allowed: true,
          alwaysAllow: true,
        },
      },
    })

    vi.doUnmock('@tauri-apps/api/core')
    await vi.resetModules()
  })

  it('respondExitPlanMode includes session routing on the canonical path', async () => {
    await vi.resetModules()

    const invokeMock = vi.fn(async () => undefined)
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: invokeMock,
      Channel: class ChannelMock {},
    }))

    const freshIpc = await import('@/lib/ipc')
    await freshIpc.respondExitPlanMode({
      sessionId: 'agent-plan',
      requestId: 'plan-1',
      action: 'approve_edit',
      feedback: 'please ask before edits',
    })

    expect(invokeMock).toHaveBeenCalledWith('respond_agent_interrupt', {
      input: {
        sessionId: 'agent-plan',
        interruptId: 'plan-1',
        kind: 'plan',
        response: {
          decision: 'approve_with_permissions',
          feedback: 'please ask before edits',
        },
      },
    })

    vi.doUnmock('@tauri-apps/api/core')
    await vi.resetModules()
  })
})

describe('IPC module — event subscriptions', () => {
  it('onCustomToolChanged fails fast because the backend event is not wired', () => {
    expect(() => ipc.onCustomToolChanged(vi.fn())).toThrow(
      "Tauri event 'customToolChanged' is not implemented in j-gui backend"
    )
  })

  it('onStreamChunk registers callback', () => {
    const cb = vi.fn()
    const cleanup = ipc.onStreamChunk(cb)
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  it('onStreamComplete registers callback', () => {
    const cb = vi.fn()
    const cleanup = ipc.onStreamComplete(cb)
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  it('onStreamError registers callback', () => {
    const cb = vi.fn()
    const cleanup = ipc.onStreamError(cb)
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  it('onStreamReasoning registers callback', () => {
    const cb = vi.fn()
    const cleanup = ipc.onStreamReasoning(cb)
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  it('chat stream wrappers use the chat:stream namespace internally', () => {
    const chunkCb = vi.fn()
    const reasoningCb = vi.fn()
    const completeCb = vi.fn()
    const errorCb = vi.fn()

    const cleanupChunk = ipc.onStreamChunk(chunkCb)
    const cleanupReasoning = ipc.onStreamReasoning(reasoningCb)
    const cleanupComplete = ipc.onStreamComplete(completeCb)
    const cleanupError = ipc.onStreamError(errorCb)

    ipc.emit(CHAT_IPC_CHANNELS.STREAM_CHUNK, { conversationId: 'c1', delta: 'hello', index: 0 })
    ipc.emit(CHAT_IPC_CHANNELS.STREAM_REASONING, { conversationId: 'c1', delta: 'thinking' })
    ipc.emit(CHAT_IPC_CHANNELS.STREAM_COMPLETE, { conversationId: 'c1', totalTokens: 7 })
    ipc.emit(CHAT_IPC_CHANNELS.STREAM_ERROR, { conversationId: 'c1', error: 'boom' })

    expect(chunkCb).toHaveBeenCalledTimes(1)
    expect(chunkCb).toHaveBeenCalledWith({ conversationId: 'c1', delta: 'hello', index: 0 })
    expect(reasoningCb).toHaveBeenCalledTimes(1)
    expect(reasoningCb).toHaveBeenCalledWith({ conversationId: 'c1', delta: 'thinking' })
    expect(completeCb).toHaveBeenCalledTimes(1)
    expect(completeCb).toHaveBeenCalledWith({ conversationId: 'c1', totalTokens: 7 })
    expect(errorCb).toHaveBeenCalledTimes(1)
    expect(errorCb).toHaveBeenCalledWith({ conversationId: 'c1', error: 'boom' })

    cleanupChunk()
    cleanupReasoning()
    cleanupComplete()
    cleanupError()
  })

  it('sendMessage emits reasoning deltas from the backend channel', async () => {
    await vi.resetModules()

    const channelInstances: Array<{ onmessage?: (event: unknown) => void }> = []
    vi.doMock('@tauri-apps/api/core', () => {
      class ChannelMock {
        onmessage?: (event: unknown) => void
        constructor() {
          channelInstances.push(this)
        }
      }

      return {
        invoke: vi.fn(async (cmd: string, args: any) => {
          if (cmd === 'send_message') {
            args.onEvent.onmessage?.({ event: 'reasoning', data: { delta: 'step-1', index: 0 } })
            args.onEvent.onmessage?.({ event: 'done', data: { total_tokens: 9 } })
          }
          return undefined
        }),
        Channel: ChannelMock,
      }
    })

    const freshIpc = await import('@/lib/ipc')
    const reasoningCb = vi.fn()
    const cleanupReasoning = freshIpc.onStreamReasoning(reasoningCb)

    await freshIpc.sendMessage({ sessionId: 'chat-1', content: 'hello', thinkingEnabled: true })

    expect(channelInstances).toHaveLength(1)
    expect(reasoningCb).toHaveBeenCalledTimes(1)
    expect(reasoningCb).toHaveBeenCalledWith({
      conversationId: 'chat-1',
      delta: 'step-1',
      index: 0,
    })

    cleanupReasoning()
    vi.doUnmock('@tauri-apps/api/core')
    await vi.resetModules()
  })

  it('sendMessage preserves explicit thinkingEnabled=false in the backend request', async () => {
    await vi.resetModules()

    const invokeMock = vi.fn(async () => undefined)
    vi.doMock('@tauri-apps/api/core', () => {
      class ChannelMock {
        onmessage?: (event: unknown) => void
      }

      return {
        invoke: invokeMock,
        Channel: ChannelMock,
      }
    })

    const freshIpc = await import('@/lib/ipc')
    await freshIpc.sendMessage({ sessionId: 'chat-1', content: 'hello', thinkingEnabled: false })

    expect(invokeMock).toHaveBeenCalledWith(
      'send_message',
      expect.objectContaining({
        request: expect.objectContaining({
          sessionId: 'chat-1',
          content: 'hello',
          thinkingEnabled: false,
        }),
      })
    )

    vi.doUnmock('@tauri-apps/api/core')
    await vi.resetModules()
  })

  it('sendMessage preserves finite contextLength in the backend request', async () => {
    await vi.resetModules()

    const invokeMock = vi.fn(async () => undefined)
    vi.doMock('@tauri-apps/api/core', () => {
      class ChannelMock {
        onmessage?: (event: unknown) => void
      }

      return {
        invoke: invokeMock,
        Channel: ChannelMock,
      }
    })

    const freshIpc = await import('@/lib/ipc')
    await freshIpc.sendMessage({ sessionId: 'chat-1', content: 'hello', contextLength: 5 })

    expect(invokeMock).toHaveBeenCalledWith(
      'send_message',
      expect.objectContaining({
        request: expect.objectContaining({
          sessionId: 'chat-1',
          content: 'hello',
          contextLength: 5,
        }),
      })
    )

    vi.doUnmock('@tauri-apps/api/core')
    await vi.resetModules()
  })

  it('sendMessage preserves image attachments in the backend request', async () => {
    await vi.resetModules()

    const invokeMock = vi.fn(async () => undefined)
    vi.doMock('@tauri-apps/api/core', () => {
      class ChannelMock {
        onmessage?: (event: unknown) => void
      }

      return {
        invoke: invokeMock,
        Channel: ChannelMock,
      }
    })

    const freshIpc = await import('@/lib/ipc')
    const attachments = [
      {
        id: 'att-1',
        filename: 'image.png',
        mediaType: 'image/png',
        localPath: '/tmp/image.png',
        size: 123,
      },
    ]
    await freshIpc.sendMessage({ sessionId: 'chat-1', content: 'hello', attachments })

    expect(invokeMock).toHaveBeenCalledWith(
      'send_message',
      expect.objectContaining({
        request: expect.objectContaining({
          sessionId: 'chat-1',
          content: 'hello',
          attachments,
        }),
      })
    )

    vi.doUnmock('@tauri-apps/api/core')
    await vi.resetModules()
  })

  it('sendMessage preserves explicit protocolHint in the backend request', async () => {
    await vi.resetModules()

    const invokeMock = vi.fn(async () => undefined)
    vi.doMock('@tauri-apps/api/core', () => {
      class ChannelMock {
        onmessage?: (event: unknown) => void
      }

      return {
        invoke: invokeMock,
        Channel: ChannelMock,
      }
    })

    const freshIpc = await import('@/lib/ipc')
    await freshIpc.sendMessage({
      sessionId: 'chat-1',
      content: 'hello',
      protocolHint: 'openai-responses',
    })

    expect(invokeMock).toHaveBeenCalledWith(
      'send_message',
      expect.objectContaining({
        request: expect.objectContaining({
          sessionId: 'chat-1',
          content: 'hello',
          protocolHint: 'openai-responses',
        }),
      })
    )

    vi.doUnmock('@tauri-apps/api/core')
    await vi.resetModules()
  })

  it('sendMessage emits stream error only once when backend also reports an error event', async () => {
    await vi.resetModules()

    const channelInstances: Array<{ onmessage?: (event: unknown) => void }> = []
    vi.doMock('@tauri-apps/api/core', () => {
      class ChannelMock {
        onmessage?: (event: unknown) => void
        constructor() {
          channelInstances.push(this)
        }
      }

      return {
        invoke: vi.fn(async (cmd: string, args: any) => {
          if (cmd === 'send_message') {
            args.onEvent.onmessage?.({ event: 'error', Error: { message: 'boom' } })
            throw new Error('boom')
          }
          return undefined
        }),
        Channel: ChannelMock,
      }
    })

    const freshIpc = await import('@/lib/ipc')
    const errorCb = vi.fn()
    const cleanupError = freshIpc.onStreamError(errorCb)

    await freshIpc.sendMessage({ sessionId: 'chat-1', content: 'hello' })

    expect(channelInstances).toHaveLength(1)
    expect(errorCb).toHaveBeenCalledTimes(1)
    expect(errorCb).toHaveBeenCalledWith({ conversationId: 'chat-1', error: 'boom' })

    cleanupError()
    vi.doUnmock('@tauri-apps/api/core')
    await vi.resetModules()
  })

  it('sendMessage unwraps tauri unknown errors to the real backend message', async () => {
    await vi.resetModules()

    vi.doMock('@tauri-apps/api/core', () => {
      class ChannelMock {
        onmessage?: (event: unknown) => void
      }

      return {
        invoke: vi.fn(async (cmd: string) => {
          if (cmd === 'send_message') {
            throw {
              message: 'Unknown error',
              cause: '不支持的请求字段: thinkingEnabled',
            }
          }
          return undefined
        }),
        Channel: ChannelMock,
      }
    })

    const freshIpc = await import('@/lib/ipc')
    const errorCb = vi.fn()
    const cleanupError = freshIpc.onStreamError(errorCb)

    await freshIpc.sendMessage({ sessionId: 'chat-1', content: 'hello', thinkingEnabled: true })

    expect(errorCb).toHaveBeenCalledTimes(1)
    expect(errorCb).toHaveBeenCalledWith({
      conversationId: 'chat-1',
      error: '不支持的请求字段: thinkingEnabled',
    })

    cleanupError()
    vi.doUnmock('@tauri-apps/api/core')
    await vi.resetModules()
  })
})

describe('IPC module — user profile', () => {
  it('getUserProfile returns default profile', async () => {
    const profile = await ipc.getUserProfile()
    expect(profile.userName).toBe('User')
    expect(profile.avatar).toBeDefined()
  })
})

describe('IPC module — agent workspaces', () => {
  it('listAgentWorkspaces returns empty array as fallback', async () => {
    const ws = await ipc.listAgentWorkspaces()
    expect(Array.isArray(ws)).toBe(true)
  })
})
