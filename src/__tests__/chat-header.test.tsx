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
  it('uses the columns button to toggle the right workspace panel instead of conversation layout mode', () => {
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
    store.set(agentSidePanelOpenMapAtom, new Map())

    render(
      <Provider store={store}>
        <TooltipProvider>
          <ChatHeader conversation={conversation} />
        </TooltipProvider>
      </Provider>,
    )

    const toggleButton = screen.getByRole('button', { name: '切换右侧工作区' })

    fireEvent.click(toggleButton)
    expect(store.get(agentSidePanelOpenMapAtom).get('chat-1')).toBe(false)

    fireEvent.click(toggleButton)
    expect(store.get(agentSidePanelOpenMapAtom).get('chat-1')).toBe(true)
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
    store.set(agentSidePanelOpenMapAtom, new Map())

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
