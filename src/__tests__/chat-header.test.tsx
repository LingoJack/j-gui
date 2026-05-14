import * as React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { ChatHeader } from '@/components/chat/ChatHeader'
import { conversationsAtom } from '@/atoms/chat-atoms'
import { agentSidePanelOpenMapAtom } from '@/atoms/agent-atoms'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('@/components/chat/SystemPromptSelector', () => ({
  SystemPromptSelector: () => <div data-testid="system-prompt-selector" />,
}))

vi.mock('@/components/chat/MigrateToAgentButton', () => ({
  MigrateToAgentButton: ({ conversationId }: { conversationId: string }) => (
    <button type="button">引用 {conversationId}</button>
  ),
}))

vi.mock('@/lib/ipc', () => ({
  updateConversationTitle: vi.fn(),
  togglePinConversation: vi.fn(async (id: string) => ({ id, title: '测试对话', pinned: true })),
}))

describe('ChatHeader', () => {
  it('keeps the right workspace toggle after the chat header actions', () => {
    const store = createStore()
    const conversation = {
      id: 'chat-1',
      title: '测试对话',
      updatedAt: Date.now(),
      pinned: false,
      archived: false,
      messageCount: 1,
    }

    store.set(conversationsAtom, [conversation])
    store.set(agentSidePanelOpenMapAtom, new Map([['chat-1', false]]))

    render(
      <Provider store={store}>
        <TooltipProvider>
          <ChatHeader conversation={conversation} />
        </TooltipProvider>
      </Provider>,
    )

    const toggle = screen.getByRole('button', { name: '打开右侧工作区' })
    expect(toggle.querySelector('.lucide-columns-2')).not.toBeNull()

    fireEvent.click(toggle)

    expect(store.get(agentSidePanelOpenMapAtom).get('chat-1')).toBe(true)
    expect(screen.getByRole('button', { name: '关闭右侧工作区' })).toBeInTheDocument()
  })

  it('shows the migrate entry in the header action area when the conversation can migrate', () => {
    const store = createStore()
    const conversation = {
      id: 'chat-1',
      title: '测试对话',
      updatedAt: Date.now(),
      pinned: false,
      archived: false,
      messageCount: 1,
    }

    store.set(conversationsAtom, [conversation])

    render(
      <Provider store={store}>
        <TooltipProvider>
          <ChatHeader conversation={conversation} canMigrateToAgent />
        </TooltipProvider>
      </Provider>,
    )

    expect(screen.getByRole('button', { name: '引用 chat-1' })).toBeInTheDocument()
  })
})
