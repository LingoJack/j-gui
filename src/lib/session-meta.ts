export const DEFAULT_CHAT_TITLE = '新对话'
export const DEFAULT_AGENT_TITLE = '新 Agent 会话'

export function normalizeConversationTitle(title: string | null | undefined): string {
  const trimmed = title?.trim()
  return trimmed ? trimmed : DEFAULT_CHAT_TITLE
}

export function normalizeAgentSessionTitle(title: string | null | undefined): string {
  const trimmed = title?.trim()
  return trimmed ? trimmed : DEFAULT_AGENT_TITLE
}

export function isDraftLikeConversation(
  conversation: { messageCount?: number; title?: string | null },
): boolean {
  void conversation
  // 后端返回的 0 条消息会话仍然是真实会话，不能再拿它冒充前端 draft。
  return false
}

export function isDraftLikeAgentSession(
  session: { messageCount?: number; title?: string | null },
): boolean {
  void session
  // draft 仅由前端 draftSessionIdsAtom 临时追踪，不能靠 messageCount 推断。
  return false
}
