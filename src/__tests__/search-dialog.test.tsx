import * as React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { SearchDialog } from '@/components/app-shell/SearchDialog'
import { searchDialogOpenAtom } from '@/atoms/search-atoms'
import { conversationsAtom } from '@/atoms/chat-atoms'
import { agentSessionsAtom, agentWorkspacesAtom, currentAgentWorkspaceIdAtom } from '@/atoms/agent-atoms'
import { activeViewAtom } from '@/atoms/active-view'
import * as ipc from '@/lib/ipc'

const openSessionMock = vi.fn()

vi.mock('@/hooks/useOpenSession', () => ({
  useOpenSession: () => openSessionMock,
}))

vi.mock('@/lib/ipc', () => ({
  searchConversationMessages: vi.fn(),
  searchAgentSessionMessages: vi.fn(),
}))

function renderSearchDialog() {
  const store = createStore()
  store.set(searchDialogOpenAtom, true)
  store.set(activeViewAtom, 'conversations')
  store.set(conversationsAtom, [{
    id: 'chat-1',
    title: 'Alpha project',
    messageCount: 1,
    updatedAt: Date.now(),
    pinned: false,
    archived: false,
  }])
  store.set(agentSessionsAtom, [])
  store.set(agentWorkspacesAtom, [])
  store.set(currentAgentWorkspaceIdAtom, null)

  return render(
    <Provider store={store}>
      <SearchDialog />
    </Provider>
  )
}

describe('SearchDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(ipc.searchConversationMessages as any).mockResolvedValue([{
      conversationId: 'chat-1',
      conversationTitle: 'Alpha project',
      messageId: 'chat-index-0',
      role: 'assistant',
      snippet: 'Alpha project detailed match',
      matchStart: 0,
      matchLength: 5,
      archived: false,
    }])
    ;(ipc.searchAgentSessionMessages as any).mockResolvedValue([])
  })

  it('shows explicit content-search error instead of empty results when backend search fails', async () => {
    ;(ipc.searchConversationMessages as any).mockRejectedValue(new Error('search backend unavailable'))
    ;(ipc.searchAgentSessionMessages as any).mockRejectedValue(new Error('agent backend unavailable'))

    renderSearchDialog()

    const input = screen.getByPlaceholderText('搜索对话和会话...')
    fireEvent.change(input, { target: { value: 'Alpha' } })

    await waitFor(() => {
      expect(screen.getByText('内容搜索失败')).toBeInTheDocument()
    }, { timeout: 2000 })

    expect(screen.getByText('search backend unavailable')).toBeInTheDocument()
  })

  it('keeps healthy content-search results visible when only one backend fails', async () => {
    ;(ipc.searchConversationMessages as any).mockResolvedValue([{
      conversationId: 'chat-1',
      conversationTitle: 'Alpha project',
      messageId: 'chat-index-0',
      role: 'assistant',
      snippet: 'Alpha project detailed match',
      matchStart: 0,
      matchLength: 5,
      archived: false,
    }])
    ;(ipc.searchAgentSessionMessages as any).mockRejectedValue(new Error('agent backend unavailable'))

    renderSearchDialog()

    const input = screen.getByPlaceholderText('搜索对话和会话...')
    fireEvent.change(input, { target: { value: 'Alpha' } })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Alpha project.*Alpha project detailed match/ })).toBeInTheDocument()
    }, { timeout: 2000 })

    expect(screen.getByText('内容搜索失败')).toBeInTheDocument()
    expect(screen.getByText('agent backend unavailable')).toBeInTheDocument()
  })

  it('uses stable per-message keys for multiple hits in the same conversation', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(ipc.searchConversationMessages as any).mockResolvedValue([
      {
        conversationId: 'chat-1',
        conversationTitle: 'Alpha project',
        messageId: 'chat-index-0',
        role: 'assistant',
        snippet: 'first match',
        matchStart: 0,
        matchLength: 5,
        archived: false,
      },
      {
        conversationId: 'chat-1',
        conversationTitle: 'Alpha project',
        messageId: 'chat-index-1',
        role: 'assistant',
        snippet: 'second match',
        matchStart: 0,
        matchLength: 6,
        archived: false,
      },
    ])

    renderSearchDialog()

    const input = screen.getByPlaceholderText('搜索对话和会话...')
    fireEvent.change(input, { target: { value: 'Alpha' } })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Alpha project.*first match/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Alpha project.*second match/ })).toBeInTheDocument()
    }, { timeout: 2000 })

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Encountered two children with the same key')
    )

    consoleErrorSpy.mockRestore()
  })

  it('keeps content-hit results clickable even when the title also matches', async () => {
    renderSearchDialog()

    const input = screen.getByPlaceholderText('搜索对话和会话...')
    fireEvent.change(input, { target: { value: 'Alpha' } })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Alpha project.*Alpha project detailed match/ })).toBeInTheDocument()
    }, { timeout: 2000 })

    fireEvent.click(screen.getByRole('button', { name: /Alpha project.*Alpha project detailed match/ }))

    expect(openSessionMock).toHaveBeenCalledWith('chat', 'chat-1', 'Alpha project', {
      messageId: 'chat-index-0',
    })
  })
})
