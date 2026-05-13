import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { decodeAgentStreamEvent, decodeChatStreamEvent } from '@/lib/ipc-stream-protocol'
import type {
  AgentSendInput,
  AgentStreamDecodeEvent,
  AgentStreamPayload,
  ChatRequestInput,
  ChatStreamDecodeEvent,
  ChatStreamPayload,
  ChatUnsupportedFieldsPayload,
} from '@jgui/shared'

describe('shared stream protocol types', () => {
  it('routes decode helper shapes through shared type references', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/ipc-stream-protocol.ts'), 'utf8')

    expect(source).toContain("from '@jgui/shared'")
    expect(source).toContain('ChatStreamDecodeEvent')
    expect(source).toContain('ChatStreamPayload')
    expect(source).toContain('AgentStreamDecodeEvent')
    expect(source).toContain('AgentStreamPayload')
    expect(source).not.toContain('type ChatStreamNormalizedEvent')
    expect(source).not.toContain('type AgentStreamNormalizedEvent')
    expect(source).not.toContain("kind: 'text'")
    expect(source).not.toContain("kind: 'tool_use'")
    expect(source).not.toContain("kind: 'interrupt'")
    expect(source).not.toContain("kind: 'tool_result'")
  })

  it('keeps canonical chat request and unsupported payload shapes', () => {
    const request = {
      sessionId: 'chat-1',
      content: 'hello',
      channelId: 'channel-1',
      modelId: 'model-1',
      systemMessage: null,
      contextLength: 'infinite',
      contextDividers: ['divider-1'],
      attachments: [],
      thinkingEnabled: true,
    } satisfies ChatRequestInput

    const unsupported = {
      sessionId: request.sessionId,
      fields: ['attachments'],
      message: 'attachments are not supported yet',
    } satisfies ChatUnsupportedFieldsPayload

    const payload = {
      type: 'unsupported_fields',
      sessionId: request.sessionId,
      fields: unsupported.fields,
      message: unsupported.message,
    } satisfies ChatStreamPayload

    expect(request.sessionId).toBe('chat-1')
    expect(unsupported.fields).toEqual(['attachments'])
    expect(payload.type).toBe('unsupported_fields')
  })

  it('decodes canonical chat payloads', () => {
    const chunkPayload = {
      type: 'chunk',
      sessionId: 'chat-1',
      delta: 'hello',
      index: 3,
    } satisfies ChatStreamPayload

    const completePayload = {
      type: 'complete',
      sessionId: 'chat-1',
      totalTokens: 42,
    } satisfies ChatStreamPayload

    const reasoningPayload = {
      type: 'reasoning',
      sessionId: 'chat-1',
      delta: 'step-1',
      index: 1,
    } satisfies ChatStreamPayload

    const errorPayload = {
      type: 'error',
      sessionId: 'chat-1',
      message: 'boom',
      code: 'service_error',
    } satisfies ChatStreamPayload

    const unsupportedPayload = {
      type: 'unsupported_fields',
      sessionId: 'chat-1',
      fields: ['contextLength'],
      message: 'contextLength is not supported yet',
    } satisfies ChatStreamPayload

    expect(decodeChatStreamEvent(chunkPayload, 'chat-1')).toEqual({
      kind: 'chunk',
      conversationId: 'chat-1',
      delta: 'hello',
      index: 3,
    })
    expect(decodeChatStreamEvent(reasoningPayload, 'chat-1')).toEqual({
      kind: 'reasoning',
      conversationId: 'chat-1',
      delta: 'step-1',
      index: 1,
    })
    expect(decodeChatStreamEvent(completePayload, 'chat-1')).toEqual({
      kind: 'complete',
      conversationId: 'chat-1',
      totalTokens: 42,
    })
    expect(decodeChatStreamEvent(errorPayload, 'chat-1')).toEqual({
      kind: 'error',
      conversationId: 'chat-1',
      error: 'boom',
    })
    expect(decodeChatStreamEvent(unsupportedPayload, 'chat-1')).toEqual({
      kind: 'error',
      conversationId: 'chat-1',
      error: 'contextLength is not supported yet',
    })
  })

  it('types the ipc decode helpers with shared canonical payloads', () => {
    const chatDecoded = decodeChatStreamEvent({ event: 'chunk', Chunk: { delta: 'hello', index: 3 } }, 'chat-1')
    const reasoningDecoded = decodeChatStreamEvent(
      { event: 'reasoning', data: { delta: 'step-2', index: 4 } },
      'chat-1'
    )
    const agentDecoded = decodeAgentStreamEvent({ AssistantContent: { text: 'answer' } }, 'agent-1')

    const typedChatDecoded: ChatStreamDecodeEvent | null = chatDecoded
    const typedReasoningDecoded: ChatStreamDecodeEvent | null = reasoningDecoded
    const typedAgentDecoded: AgentStreamDecodeEvent | null = agentDecoded

    expect(typedChatDecoded).toEqual({
      kind: 'chunk',
      conversationId: 'chat-1',
      delta: 'hello',
      index: 3,
    })
    expect(typedReasoningDecoded).toEqual({
      kind: 'reasoning',
      conversationId: 'chat-1',
      delta: 'step-2',
      index: 4,
    })
    expect(
      decodeChatStreamEvent(
        { event: 'done', data: { totalTokens: 12 } },
        'chat-1'
      )
    ).toEqual({
      kind: 'complete',
      conversationId: 'chat-1',
      totalTokens: 12,
    })
    expect(
      decodeChatStreamEvent(
        { event: 'error', data: { message: 'backend boom' } },
        'chat-1'
      )
    ).toEqual({
      kind: 'error',
      conversationId: 'chat-1',
      error: 'backend boom',
    })
    expect(typedAgentDecoded).toEqual({
      kind: 'payload',
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
  })

  it('parses legacy agent JSON string payloads into canonical shared shapes', () => {
    expect(
      decodeAgentStreamEvent(
        { ToolUse: { tool_id: 't1', tool_name: 'Bash', tool_input: '{"command":"pwd"}' } },
        'agent-1'
      )
    ).toEqual({
      kind: 'payload',
      sessionId: 'agent-1',
      payload: {
        kind: 'sdk_message',
        message: {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 't1',
                name: 'Bash',
                input: { command: 'pwd' },
              },
            ],
          },
          parent_tool_use_id: null,
        },
      },
    })

    expect(
      decodeAgentStreamEvent(
        {
          Interrupt: {
            interrupt_id: 'ask-1',
            kind: 'ask_user',
            tool_name: 'ask_user',
            tool_input: '{"questions":[{"id":"question-1","question":"Choose","options":[{"label":"A"}]}]}',
          },
        },
        'agent-1'
      )
    ).toEqual({
      kind: 'payload',
      sessionId: 'agent-1',
      payload: {
        kind: 'jgui_event',
        event: {
          type: 'ask_user_request',
          request: {
            requestId: 'ask-1',
            sessionId: 'agent-1',
            questions: [
              {
                id: 'question-1',
                question: 'Choose',
                header: undefined,
                options: [{ label: 'A', description: undefined, preview: undefined }],
                multiSelect: false,
              },
            ],
            toolInput: {
              questions: [
                {
                  id: 'question-1',
                  question: 'Choose',
                  options: [{ label: 'A', description: undefined, preview: undefined }],
                },
              ],
            },
          },
        },
      },
    })
  })

  it('parses legacy runtime agent events into canonical shared shapes', () => {
    expect(
      decodeAgentStreamEvent(
        { ModelResolved: { model: 'claude-sonnet-4-6' } },
        'agent-1'
      )
    ).toEqual({
      kind: 'payload',
      sessionId: 'agent-1',
      payload: {
        kind: 'jgui_event',
        event: {
          type: 'model_resolved',
          model: 'claude-sonnet-4-6',
        },
      },
    })

    expect(
      decodeAgentStreamEvent(
        { Retrying: { attempt: 1, maxAttempts: 3, delayMs: 1000, error: 'timeout' } },
        'agent-1'
      )
    ).toEqual({
      kind: 'payload',
      sessionId: 'agent-1',
      payload: {
        kind: 'jgui_event',
        event: {
          type: 'retry',
          status: 'starting',
          attempt: 1,
          maxAttempts: 3,
          delaySeconds: 1,
          reason: 'timeout',
        },
      },
    })

    expect(
      decodeAgentStreamEvent(
        { event: 'compacting' },
        'agent-1'
      )
    ).toEqual({
      kind: 'payload',
      sessionId: 'agent-1',
      payload: {
        kind: 'sdk_message',
        message: {
          type: 'system',
          subtype: 'compacting',
          session_id: 'agent-1',
        },
      },
    })

    expect(
      decodeAgentStreamEvent(
        { event: 'cancelled' },
        'agent-1'
      )
    ).toEqual({
      kind: 'complete',
      sessionId: 'agent-1',
      resultSubtype: 'cancelled',
    })
  })

  it('rejects legacy content-only chat chunk shapes as the mainline decode', () => {
    expect(
      decodeChatStreamEvent({ event: 'chunk', Chunk: { content: 'hello', index: 3 } }, 'chat-1')
    ).toBeNull()
  })

  it('keeps the agent request and stream payload types available', () => {
    const request = {
      sessionId: 'agent-1',
      userMessage: 'hello',
      channelId: 'channel-1',
      modelId: 'model-1',
      permissionModeOverride: 'bypassPermissions',
      startedAt: 123,
    } satisfies AgentSendInput

    const payload = {
      kind: 'sdk_message',
      message: {
        type: 'assistant',
        message: {
          content: [],
        },
        parent_tool_use_id: null,
      },
    } satisfies AgentStreamPayload

    expect(request.sessionId).toBe('agent-1')
    expect(payload.kind).toBe('sdk_message')
  })

  it('rejects legacy agent event unions as the canonical decode type', () => {
    const payload = {
      kind: 'jgui_event',
      event: {
        type: 'permission_request',
        request: {
          requestId: 'i1',
          sessionId: 'agent-1',
          toolName: 'Bash',
          toolInput: {},
          description: 'Bash',
          dangerLevel: 'normal',
        },
      },
    } satisfies AgentStreamPayload

    expect(payload.kind).toBe('jgui_event')
  })

  it('keeps legacy interrupt commands as compat shims in Rust source', () => {
    const source = readFileSync(resolve(process.cwd(), 'src-tauri/src/commands/agent.rs'), 'utf8')

    expect(source).toContain('respond_agent_interrupt(')
    expect(source).toContain('respond_permission(')
    expect(source).toContain('respond_ask_user(')
    expect(source).toContain('respond_agent_interrupt_impl(')
  })

  it('keeps frontend interrupt responses on the canonical entrypoint', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/ipc.ts'), 'utf8')

    expect(source).toContain("invoke('respond_agent_interrupt'")
    expect(source).not.toContain("invoke('respond_permission'")
    expect(source).not.toContain("invoke('respond_ask_user'")
  })
})
