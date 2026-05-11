import type {
  AgentStreamDecodeEvent,
  AgentStreamPayload,
  AskUserRequest,
  ChatStreamDecodeEvent,
  ChatStreamPayload,
  ExitPlanModeRequest,
  PermissionRequest,
  SDKAssistantMessage,
  SDKUserMessage,
} from '@jgui/shared'

// 这里同时接收 canonical payload 和旧 GUI/SDK 事件壳。
// 兼容层存在的原因不是“代码还没清理”，而是为了保证：
// 1. Rust 侧逐步迁移协议时，前端不需要和后端强绑版本；
// 2. 历史会话重放、旧测试桩、以及 fallback 通道仍能被同一套渲染逻辑消费。
function parseLegacyJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function buildAskUserRequest(
  sessionId: string,
  interruptId: string,
  toolInput: Record<string, unknown>
): AskUserRequest {
  const rawQuestions = Array.isArray(toolInput.questions) ? toolInput.questions : []
  const questions = rawQuestions
    .filter((question): question is Record<string, unknown> => typeof question === 'object' && question !== null)
    .map((question) => ({
      id:
        typeof question.id === 'string'
          ? question.id
          : typeof question.questionId === 'string'
            ? question.questionId
            : typeof question.question_id === 'string'
              ? question.question_id
              : undefined,
      question: typeof question.question === 'string' ? question.question : '',
      header: typeof question.header === 'string' ? question.header : undefined,
      options: Array.isArray(question.options)
        ? question.options
            .filter((option): option is Record<string, unknown> => typeof option === 'object' && option !== null)
            .map((option) => ({
              label: typeof option.label === 'string' ? option.label : '',
              description: typeof option.description === 'string' ? option.description : undefined,
              preview: typeof option.preview === 'string' ? option.preview : undefined,
            }))
            .filter((option) => option.label.length > 0)
        : [],
      multiSelect: question.multiSelect === true,
    }))
    .filter((question) => question.question.length > 0)

  return {
    requestId: interruptId,
    sessionId,
    questions,
    toolInput,
  }
}

function decodeCanonicalChatStreamPayload(payload: ChatStreamPayload, conversationId: string): ChatStreamDecodeEvent {
  switch (payload.type) {
    case 'chunk':
      return {
        kind: 'chunk',
        conversationId,
        delta: payload.delta,
        index: payload.index,
      }
    case 'reasoning':
      return {
        kind: 'reasoning',
        conversationId,
        delta: payload.delta,
        index: payload.index,
      }
    case 'complete':
      return {
        kind: 'complete',
        conversationId,
        totalTokens: payload.totalTokens,
      }
    case 'error':
      return {
        kind: 'error',
        conversationId,
        error: payload.message,
      }
    case 'unsupported_fields':
      return {
        kind: 'error',
        conversationId,
        error: payload.message,
      }
  }
}

export function decodeChatStreamEvent(event: unknown, conversationId: string): ChatStreamDecodeEvent | null {
  const raw = event as any
  // 优先识别规范化 payload；只有未命中时才回退到旧事件结构，
  // 否则 canonical 分支新增字段时容易被 legacy 分支抢先误解析。
  if (
    raw?.type === 'chunk' ||
    raw?.type === 'reasoning' ||
    raw?.type === 'complete' ||
    raw?.type === 'error' ||
    raw?.type === 'unsupported_fields'
  ) {
    return decodeCanonicalChatStreamPayload(raw as ChatStreamPayload, conversationId)
  }
  if (raw?.event === 'chunk' || raw?.Chunk) {
    const data = raw.Chunk || raw.data
    const delta = data?.delta || raw?.delta
    if (typeof delta !== 'string' || delta.length === 0) {
      return null
    }
    return {
      kind: 'chunk',
      conversationId,
      delta,
      index: data?.index,
    }
  }
  if (raw?.event === 'reasoning' || raw?.Reasoning) {
    const data = raw.Reasoning || raw.data
    const delta = data?.delta || raw?.delta
    if (typeof delta !== 'string' || delta.length === 0) {
      return null
    }
    return {
      kind: 'reasoning',
      conversationId,
      delta,
      index: data?.index,
    }
  }
  if (raw?.event === 'done' || raw?.Done) {
    const data = raw.Done || raw.data
    return {
      kind: 'complete',
      conversationId,
      totalTokens:
        data?.total_tokens ||
        data?.totalTokens ||
        raw?.totalTokens,
    }
  }
  if (raw?.event === 'error' || raw?.Error) {
    const data = raw.Error || raw.data
    return {
      kind: 'error',
      conversationId,
      error: data?.message || raw?.message || 'Unknown error',
    }
  }
  if (typeof raw === 'string') {
    return {
      kind: 'chunk',
      conversationId,
      delta: raw,
      index: 0,
    }
  }
  return null
}

export function decodeAgentStreamEvent(event: unknown, sessionId: string): AgentStreamDecodeEvent | null {
  const raw = event as any
  const taggedEvent = typeof raw?.event === 'string' ? raw.event : null
  const taggedData = raw?.data
  const assistantContent = raw?.AssistantContent || raw?.assistantContent || (taggedEvent === 'assistantContent' ? taggedData : undefined)
  const toolUse = raw?.ToolUse || raw?.toolUse || (taggedEvent === 'toolUse' ? taggedData : undefined)
  const interrupt = raw?.Interrupt || raw?.interrupt || (taggedEvent === 'interrupt' ? taggedData : undefined)
  const toolResult = raw?.ToolResult || raw?.toolResult || (taggedEvent === 'toolResult' ? taggedData : undefined)
  const done = raw?.Done || raw?.done || (taggedEvent === 'done' ? taggedData : undefined)
  const error = raw?.Error || raw?.error || (taggedEvent === 'error' ? taggedData : undefined)
  // 规范化 payload 直接透传，保留最完整的语义。
  // 后面的分支只负责把旧事件壳提升成同一个 AgentStreamPayload 契约。
  if (raw?.kind === 'sdk_message' || raw?.kind === 'jgui_event') {
    return {
      kind: 'payload',
      sessionId,
      payload: raw as AgentStreamPayload,
    }
  }
  if (assistantContent) {
    const data = assistantContent
    return {
      kind: 'payload',
      sessionId,
      payload: {
        kind: 'sdk_message',
        message: {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'text',
                text: data?.text || raw?.text || '',
              },
            ],
          },
          parent_tool_use_id: null,
        } satisfies SDKAssistantMessage,
      },
    }
  }
  if (toolUse) {
    const data = toolUse
    const toolInput = parseLegacyJsonObject(data?.tool_input)
    return {
      kind: 'payload',
      sessionId,
      payload: {
        kind: 'sdk_message',
        message: {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: data?.tool_id ?? '',
                name: data?.tool_name ?? '',
                input: toolInput,
              },
            ],
          },
          parent_tool_use_id: null,
        } satisfies SDKAssistantMessage,
      },
    }
  }
  if (interrupt) {
    const data = interrupt
    const isPlan = data?.kind === 'plan'
    const isAskUser = data?.kind === 'ask_user'
    // 旧中断事件没有统一 schema，只能按 kind 还原成三个 GUI 专用请求类型。
    // 这里不能偷懒合并，否则 Plan/AskUser/Permission 会在 UI 上丢掉各自的处理路径。
    const toolInput = parseLegacyJsonObject(data?.tool_input)
    const request = isPlan
      ? {
          requestId: data?.interrupt_id ?? '',
          sessionId,
          toolInput,
          allowedPrompts: [] as ExitPlanModeRequest['allowedPrompts'],
        }
      : isAskUser
        ? buildAskUserRequest(sessionId, data?.interrupt_id ?? '', toolInput)
      : {
          requestId: data?.interrupt_id ?? '',
          sessionId,
          toolName: data?.tool_name ?? '',
          toolInput,
          description: data?.tool_name ?? '',
          dangerLevel: 'normal' as const,
        }
    return {
      kind: 'payload',
      sessionId,
      payload: {
        kind: 'jgui_event',
        event: isPlan
          ? {
              type: 'exit_plan_mode_request',
              request: request as ExitPlanModeRequest,
            }
          : isAskUser
            ? {
                type: 'ask_user_request',
                request: request as AskUserRequest,
              }
          : {
              type: 'permission_request',
              request: request as PermissionRequest,
            },
      },
    }
  }
  if (toolResult) {
    const data = toolResult
    return {
      kind: 'payload',
      sessionId,
      payload: {
        kind: 'sdk_message',
        message: {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: data?.tool_id ?? '',
                content: data?.content,
                is_error: data?.is_error,
              },
            ],
          },
          parent_tool_use_id: null,
        } satisfies SDKUserMessage,
      },
    }
  }
  if (done) {
    const data = done
    return {
      kind: 'complete',
      sessionId,
      totalTokens: data?.total_tokens ?? data?.totalTokens,
      resultSubtype: data?.result_subtype ?? data?.resultSubtype ?? raw?.resultSubtype,
    }
  }
  if (error) {
    const data = error
    return {
      kind: 'error',
      sessionId,
      error: data?.message || JSON.stringify(data),
    }
  }
  return null
}
