import * as React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import { Conversation, ConversationContent } from '@/components/ai-elements/conversation'
import { ChatMessages } from '@/components/chat/ChatMessages'

vi.mock('@/components/welcome/WelcomeEmptyState', () => ({
  WelcomeEmptyState: () => <div>empty</div>,
}))

vi.mock('@/components/chat/ChatMessageItem', () => ({
  ChatMessageItem: ({ message }: { message: { id?: string; content: string } }) => (
    <div data-message-id={message.id ?? 'missing-message-id'}>{message.content}</div>
  ),
  formatMessageTime: () => '00:00',
}))

vi.mock('@/components/chat/ChatToolActivityIndicator', () => ({
  ChatToolActivityIndicator: () => null,
}))

vi.mock('@/components/chat/ParallelChatMessages', () => ({
  ParallelChatMessages: () => <div data-testid="parallel-chat-messages" />,
}))

vi.mock('@/components/ai-elements/message', () => ({
  Message: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  MessageHeader: () => null,
  MessageContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  MessageLoading: () => <div>loading</div>,
  MessageResponse: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  StreamingIndicator: () => <div>streaming</div>,
}))

vi.mock('@/components/ai-elements/context-divider', () => ({
  ContextDivider: () => null,
}))

vi.mock('@/components/chat/ChatReasoningBlock', () => ({
  ChatReasoningBlock: () => null,
}))

vi.mock('@/components/ai-elements/scroll-minimap', () => ({
  ScrollMinimap: ({ items }: { items: Array<{ id: string }> }) => (
    <div data-testid="scroll-minimap">{items.map((item) => item.id).join(',')}</div>
  ),
}))

vi.mock('@/hooks/useConversationSettings', () => ({
  useConversationParallelMode: () => [false, vi.fn()],
}))

vi.mock('@/hooks/useScrollPositionMemory', () => ({
  ScrollPositionManager: () => null,
}))

vi.mock('@jgui/ui', () => ({
  useSmoothStream: ({ content }: { content: string }) => ({ displayedContent: content }),
}))

vi.mock('@/lib/model-logo', () => ({
  resolveAssistantBranding: () => ({ label: 'Mock Model', logo: 'mock-logo.png' }),
}))

describe('Conversation layout', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the root container as a flex column so empty states can push inputs to the bottom', () => {
    const { container } = render(
      <Conversation>
        <ConversationContent>
          <div>content</div>
        </ConversationContent>
      </Conversation>,
    )

    const root = container.firstElementChild
    expect(root).toHaveClass('flex')
    expect(root).toHaveClass('flex-col')
    expect(root).toHaveClass('min-h-0')
    expect(root).toHaveClass('flex-1')
    expect(root).not.toHaveClass('scrollbar-none')
    expect(root).not.toHaveClass('overflow-y-hidden')
    expect(root?.firstElementChild).toHaveClass('overflow-y-auto')
    expect(root?.firstElementChild).toHaveClass('scrollbar-thin')
    expect(root?.firstElementChild?.firstElementChild).toHaveClass('max-w-[min(72rem,100%)]')
    expect(root?.firstElementChild?.firstElementChild).toHaveClass('mx-auto')
  })

  it('keeps the chat message slot as a bounded flex column so Conversation can own scrolling', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/chat/ChatView.tsx'), 'utf8')

    expect(source).toContain('className="flex min-h-0 flex-1 flex-col overflow-hidden"')
    expect(source).toContain('className="flex min-h-0 flex-1 flex-col overflow-hidden"')
    expect(source).not.toContain('className={CENTERED_MAIN_CONTENT_CLASS}>')
  })

  it('mounts the compact message minimap in the standard chat view at runtime', () => {
    render(
      <Provider>
        <ChatMessages
          conversationId="conv-1"
          messages={[
            { id: 'msg-1', role: 'user', content: 'hello' },
            { id: 'msg-2', role: 'assistant', content: 'world', model: 'mock-model' },
          ]}
          messagesLoaded
          streaming={false}
          streamingContent=""
          streamingReasoning=""
          streamingModel={null}
          toolActivities={[]}
          contextDividers={[]}
          hasMore={false}
        />
      </Provider>,
    )

    expect(screen.getByTestId('scroll-minimap')).toHaveTextContent('msg-1,msg-2')
  })

  it('keeps minimap ids aligned with rendered message fallback ids when chat messages lack ids', () => {
    const chatMessagesSource = readFileSync(resolve(process.cwd(), 'src/components/chat/ChatMessages.tsx'), 'utf8')

    expect(chatMessagesSource).toContain('id: m.id || `chat-index-${idx}`')
  })

  it('keeps message resize handling instant so shell width animation does not trigger smooth scroll work', () => {
    const chatMessagesSource = readFileSync(resolve(process.cwd(), 'src/components/chat/ChatMessages.tsx'), 'utf8')
    const agentMessagesSource = readFileSync(resolve(process.cwd(), 'src/components/agent/AgentMessages.tsx'), 'utf8')

    expect(chatMessagesSource).toContain('<Conversation resize="instant"')
    expect(agentMessagesSource).toContain('<Conversation resize="instant"')
    expect(chatMessagesSource).not.toContain("resize={ready && !transitioning ? 'smooth' : 'instant'}")
    expect(agentMessagesSource).not.toContain("resize={ready && !transitioning ? 'smooth' : 'instant'}")
  })
})
