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

function asLegacyRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function asLegacyEventRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
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
  if (typeof event === 'string') {
    return {
      kind: 'chunk',
      conversationId,
      delta: event,
      index: 0,
    }
  }
  const raw = asLegacyEventRecord(event)
  if (!raw) {
    return null
  }
  // 优先识别规范化 payload；只有未命中时才回退到旧事件结构，
  // 否则 canonical 分支新增字段时容易被 legacy 分支抢先误解析。
  if (
    raw?.type === 'chunk' ||
    raw?.type === 'reasoning' ||
    raw?.type === 'complete' ||
    raw?.type === 'error' ||
    raw?.type === 'unsupported_fields'
  ) {
    return decodeCanonicalChatStreamPayload(raw as unknown as ChatStreamPayload, conversationId)
  }
  if (raw?.event === 'chunk' || raw?.Chunk) {
    const data = asLegacyRecord(raw.Chunk ?? raw.data)
    const delta = typeof data.delta === 'string' ? data.delta : typeof raw.delta === 'string' ? raw.delta : undefined
    if (typeof delta !== 'string' || delta.length === 0) {
      return null
    }
    return {
      kind: 'chunk',
      conversationId,
      delta,
      index: typeof data.index === 'number' ? data.index : undefined,
    }
  }
  if (raw?.event === 'reasoning' || raw?.Reasoning) {
    const data = asLegacyRecord(raw.Reasoning ?? raw.data)
    const delta = typeof data.delta === 'string' ? data.delta : typeof raw.delta === 'string' ? raw.delta : undefined
    if (typeof delta !== 'string' || delta.length === 0) {
      return null
    }
    return {
      kind: 'reasoning',
      conversationId,
      delta,
      index: typeof data.index === 'number' ? data.index : undefined,
    }
  }
  if (raw?.event === 'done' || raw?.Done) {
    const data = asLegacyRecord(raw.Done ?? raw.data)
    return {
      kind: 'complete',
      conversationId,
      totalTokens:
        typeof data.total_tokens === 'number'
          ? data.total_tokens
          : typeof data.totalTokens === 'number'
            ? data.totalTokens
            : typeof raw.totalTokens === 'number'
              ? raw.totalTokens
              : undefined,
    }
  }
  if (raw?.event === 'error' || raw?.Error) {
    const data = asLegacyRecord(raw.Error ?? raw.data)
    return {
      kind: 'error',
      conversationId,
      error:
        typeof data.message === 'string'
          ? data.message
          : typeof raw.message === 'string'
            ? raw.message
            : 'Unknown error',
    }
  }
  return null
}

export function decodeAgentStreamEvent(event: unknown, sessionId: string): AgentStreamDecodeEvent | null {
  const raw = asLegacyEventRecord(event)
  if (!raw) {
    return null
  }
  const taggedEvent = typeof raw?.event === 'string' ? raw.event : null
  const taggedData = raw?.data
  const assistantContent = raw?.AssistantContent || raw?.assistantContent || (taggedEvent === 'assistantContent' ? taggedData : undefined)
  const toolUse = raw?.ToolUse || raw?.toolUse || (taggedEvent === 'toolUse' ? taggedData : undefined)
  const interrupt = raw?.Interrupt || raw?.interrupt || (taggedEvent === 'interrupt' ? taggedData : undefined)
  const toolResult = raw?.ToolResult || raw?.toolResult || (taggedEvent === 'toolResult' ? taggedData : undefined)
  const done = raw?.Done || raw?.done || (taggedEvent === 'done' ? taggedData : undefined)
  const error = raw?.Error || raw?.error || (taggedEvent === 'error' ? taggedData : undefined)
  const modelResolved = raw?.ModelResolved || raw?.modelResolved || (taggedEvent === 'modelResolved' ? taggedData : undefined)
  const retrying = raw?.Retrying || raw?.retrying || (taggedEvent === 'retrying' ? taggedData : undefined)
  const compacting = raw?.Compacting || raw?.compacting || (taggedEvent === 'compacting' ? (taggedData ?? {}) : undefined)
  const compactComplete = raw?.CompactComplete || raw?.compactComplete || (taggedEvent === 'compactComplete' ? (taggedData ?? {}) : undefined)
  const cancelled = raw?.Cancelled || raw?.cancelled || (taggedEvent === 'cancelled' ? taggedData ?? {} : undefined)
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
    const data = asLegacyRecord(assistantContent)
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
                text:
                  typeof data.text === 'string'
                    ? data.text
                    : typeof raw.text === 'string'
                      ? raw.text
                      : '',
              },
            ],
          },
          parent_tool_use_id: null,
        } satisfies SDKAssistantMessage,
      },
    }
  }
  if (toolUse) {
    const data = asLegacyRecord(toolUse)
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
    const data = asLegacyRecord(interrupt)
    const isPlan = data?.kind === 'plan'
    const isAskUser = data?.kind === 'ask_user'
    // 旧中断事件没有统一 schema，只能按 kind 还原成三个 GUI 专用请求类型。
    // 这里不能偷懒合并，否则 Plan/AskUser/Permission 会在 UI 上丢掉各自的处理路径。
    const toolInput = parseLegacyJsonObject(data?.tool_input)
    const request = isPlan
        ? {
          requestId: typeof data.interrupt_id === 'string' ? data.interrupt_id : '',
          sessionId,
          toolInput,
          allowedPrompts: [] as ExitPlanModeRequest['allowedPrompts'],
        }
      : isAskUser
        ? buildAskUserRequest(sessionId, typeof data.interrupt_id === 'string' ? data.interrupt_id : '', toolInput)
      : {
          requestId: typeof data.interrupt_id === 'string' ? data.interrupt_id : '',
          sessionId,
          toolName: typeof data.tool_name === 'string' ? data.tool_name : '',
          toolInput,
          description: typeof data.tool_name === 'string' ? data.tool_name : '',
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
    const data = asLegacyRecord(toolResult)
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
  if (modelResolved) {
    const data = asLegacyRecord(modelResolved)
    return {
      kind: 'payload',
      sessionId,
      payload: {
        kind: 'jgui_event',
        event: {
          type: 'model_resolved',
          model: typeof data.model === 'string' ? data.model : '',
        },
      },
    }
  }
  if (retrying) {
    const data = asLegacyRecord(retrying)
    return {
      kind: 'payload',
      sessionId,
      payload: {
        kind: 'jgui_event',
        event: {
          type: 'retry',
          status: 'starting',
          attempt: typeof data?.attempt === 'number' ? data.attempt : 1,
          maxAttempts: typeof data?.max_attempts === 'number'
            ? data.max_attempts
            : typeof data?.maxAttempts === 'number'
              ? data.maxAttempts
              : 1,
          delaySeconds: typeof data?.delay_seconds === 'number'
            ? data.delay_seconds
            : typeof data?.delaySeconds === 'number'
              ? data.delaySeconds
              : typeof data?.delayMs === 'number'
                ? Math.ceil(data.delayMs / 1000)
                : 0,
          reason: typeof data?.reason === 'string'
            ? data.reason
            : typeof data?.error === 'string'
              ? data.error
              : '',
        },
      },
    }
  }
  if (compacting) {
    return {
      kind: 'payload',
      sessionId,
      payload: {
        kind: 'sdk_message',
        message: {
          type: 'system',
          subtype: 'compacting',
          session_id: sessionId,
        },
      },
    }
  }
  if (compactComplete) {
    return {
      kind: 'payload',
      sessionId,
      payload: {
        kind: 'sdk_message',
        message: {
          type: 'system',
          subtype: 'compact_boundary',
          session_id: sessionId,
        },
      },
    }
  }
  if (cancelled) {
    return {
      kind: 'complete',
      sessionId,
      resultSubtype: 'cancelled',
    }
  }
  if (done) {
    const data = asLegacyRecord(done)
    return {
      kind: 'complete',
      sessionId,
      totalTokens:
        typeof data.total_tokens === 'number'
          ? data.total_tokens
          : typeof data.totalTokens === 'number'
            ? data.totalTokens
            : undefined,
      resultSubtype:
        typeof data.result_subtype === 'string'
          ? data.result_subtype
          : typeof data.resultSubtype === 'string'
            ? data.resultSubtype
            : typeof raw.resultSubtype === 'string'
              ? raw.resultSubtype
              : undefined,
    }
  }
  if (error) {
    const data = asLegacyRecord(error)
    return {
      kind: 'error',
      sessionId,
      error: typeof data.message === 'string' ? data.message : JSON.stringify(data),
    }
  }
  return null
}
