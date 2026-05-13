import {
  extractChatReferenceIds,
  fromChatMentionId,
  replaceChatReferenceTokens,
  toChatMentionId,
} from '@/lib/chat-reference'

describe('chat-reference helpers', () => {
  it('extracts unique chat ids from new and legacy agent markdown', () => {
    expect(
      extractChatReferenceIds('先看 $chat:aaa-111，再补充 /chat:bbb-222 和 $chat:aaa-111'),
    ).toEqual(['aaa-111', 'bbb-222'])
  })

  it('replaces only known chat tokens', () => {
    const replaced = replaceChatReferenceTokens(
      'A $chat:aaa-111 B /chat:missing',
      new Map([['aaa-111', '[chat-ref]']]),
    )
    expect(replaced).toBe('A [chat-ref] B /chat:missing')
  })

  it('converts chat mention ids both ways', () => {
    const mentionId = toChatMentionId('chat-123')
    expect(mentionId).toBe('chat:chat-123')
    expect(fromChatMentionId(mentionId)).toBe('chat-123')
    expect(fromChatMentionId('skill:lint')).toBeNull()
  })
})
