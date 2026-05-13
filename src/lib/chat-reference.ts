/**
 * Chat 引用工具函数
 *
 * 统一维护 `$chat:<conversationId>` token 的解析与替换，
 * 让 Agent 输入、草稿桥接与后续展示都落在同一套约定上。
 */

export const CHAT_REFERENCE_TOKEN_PREFIX = '$chat:'
export const LEGACY_CHAT_REFERENCE_TOKEN_PREFIX = '/chat:'
export const CHAT_MENTION_ID_PREFIX = 'chat:'
const CHAT_REFERENCE_TOKEN_RE = /[$/]chat:([A-Za-z0-9-]+)/g

export function toChatMentionId(conversationId: string): string {
  return `${CHAT_MENTION_ID_PREFIX}${conversationId}`
}

export function fromChatMentionId(mentionId: string): string | null {
  if (!mentionId.startsWith(CHAT_MENTION_ID_PREFIX)) return null
  const conversationId = mentionId.slice(CHAT_MENTION_ID_PREFIX.length)
  return conversationId.length > 0 ? conversationId : null
}

export function extractChatReferenceIds(text: string): string[] {
  const matches = new Set<string>()
  for (const match of text.matchAll(CHAT_REFERENCE_TOKEN_RE)) {
    const id = match[1]?.trim()
    if (id) matches.add(id)
  }
  return [...matches]
}

export function replaceChatReferenceTokens(
  text: string,
  replacements: ReadonlyMap<string, string>,
): string {
  return text.replace(CHAT_REFERENCE_TOKEN_RE, (raw, conversationId: string) => {
    return replacements.get(conversationId) ?? raw
  })
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function buildChatReferenceDraftMarkdown(
  conversationId: string,
  conversationTitle: string,
): string {
  return `请参考 Chat 对话「${conversationTitle}」继续处理：\n$chat:${conversationId}`
}

export function buildChatReferenceDraftHtml(
  conversationId: string,
  conversationTitle: string,
): string {
  const label = `Chat · ${conversationTitle}`
  const mentionId = toChatMentionId(conversationId)
  return [
    `<p>请参考 Chat 对话「${escapeHtml(conversationTitle)}」继续处理：</p>`,
    `<p><span data-type="mention" data-id="${escapeHtml(mentionId)}" data-label="${escapeHtml(label)}" data-mention-suggestion-char="$" class="chat-mention-chip">${escapeHtml(label)}</span></p>`,
  ].join('')
}
