import * as React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SearchDialog } from '@/components/app-shell/SearchDialog'
import { searchDialogOpenAtom } from '@/atoms/search-atoms'
import { conversationsAtom } from '@/atoms/chat-atoms'
import { agentSessionsAtom, agentWorkspacesAtom, currentAgentWorkspaceIdAtom } from '@/atoms/agent-atoms'
import { activeViewAtom } from '@/atoms/active-view'

const openSessionMock = vi.fn()
const {
  searchConversationMessagesMock,
  searchAgentSessionMessagesMock,
} = vi.hoisted(() => ({
  searchConversationMessagesMock: vi.fn(),
  searchAgentSessionMessagesMock: vi.fn(),
}))

vi.mock('@/hooks/useOpenSession', () => ({
  useOpenSession: () => openSessionMock,
}))

vi.mock('@/lib/ipc', () => ({
  searchConversationMessages: searchConversationMessagesMock,
  searchAgentSessionMessages: searchAgentSessionMessagesMock,
}))

describe('SearchDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    openSessionMock.mockReset()
    searchConversationMessagesMock.mockReset()
    searchAgentSessionMessagesMock.mockReset()
    searchConversationMessagesMock.mockResolvedValue([
      {
        conversationId: 'deleted-chat',
        conversationTitle: '已删除会话',
        messageId: 'chat-index-0',
        role: 'user',
        snippet: 'ghost result',
        matchStart: 0,
        matchLength: 5,
        archived: false,
      },
    ])
    searchAgentSessionMessagesMock.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('filters deleted conversations out of content search results', async () => {
    const store = createStore()
    store.set(searchDialogOpenAtom, true)
    store.set(conversationsAtom, [])
    store.set(agentSessionsAtom, [])
    store.set(agentWorkspacesAtom, [])
    store.set(currentAgentWorkspaceIdAtom, null)
    store.set(activeViewAtom, 'conversations')

    render(
      <Provider store={store}>
        <TooltipProvider>
          <SearchDialog />
        </TooltipProvider>
      </Provider>,
    )

    const input = screen.getByPlaceholderText('搜索对话和会话...')
    fireEvent.change(input, { target: { value: 'ghost' } })

    await act(async () => {
      vi.advanceTimersByTime(400)
    })

    expect(screen.queryByText('已删除会话')).not.toBeInTheDocument()
    expect(openSessionMock).not.toHaveBeenCalled()
  })

  it('shows explicit content-search error instead of empty results when backend search fails', async () => {
    searchConversationMessagesMock.mockRejectedValueOnce(new Error('chat search unavailable'))
    searchAgentSessionMessagesMock.mockResolvedValueOnce([])

    const store = createStore()
    store.set(searchDialogOpenAtom, true)
    store.set(conversationsAtom, [])
    store.set(agentSessionsAtom, [])
    store.set(agentWorkspacesAtom, [])
    store.set(currentAgentWorkspaceIdAtom, null)
    store.set(activeViewAtom, 'conversations')

    render(
      <Provider store={store}>
        <TooltipProvider>
          <SearchDialog />
        </TooltipProvider>
      </Provider>,
    )

    const input = screen.getByPlaceholderText('搜索对话和会话...')
    fireEvent.change(input, { target: { value: 'broken' } })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
      await Promise.resolve()
    })

    expect(screen.getByText('内容搜索失败')).toBeInTheDocument()
    expect(screen.getByText('chat search unavailable')).toBeInTheDocument()
    expect(screen.queryByText('未找到匹配结果')).not.toBeInTheDocument()
  })
})
