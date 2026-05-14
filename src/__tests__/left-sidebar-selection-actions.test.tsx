import * as React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LeftSidebar } from '@/components/app-shell/LeftSidebar'
import { appModeAtom } from '@/atoms/app-mode'
import { activeTabIdAtom, sidebarCollapsedAtom } from '@/atoms/tab-atoms'
import { agentSidebarTopHeightAtom } from '@/atoms/sidebar-atoms'

const deleteConversationMock = vi.fn(async () => undefined)
const listConversationsMock = vi.fn(async () => [
  {
    id: 'chat-1',
    title: '测试对话',
    updatedAt: Date.now(),
    createdAt: Date.now(),
    pinned: false,
    archived: false,
  },
])
const listAgentSessionsMock = vi.fn(async () => [])
const getUserProfileMock = vi.fn(async () => ({
  userName: 'Tester',
  avatar: '',
}))
const sessionListRenderMock = vi.hoisted(() => vi.fn())

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

vi.mock('@/components/app-shell/ModeSwitcher', () => ({
  ModeSwitcher: () => <div data-testid="mode-switcher" />,
}))

vi.mock('@/components/app-shell/SearchDialog', () => ({
  SearchDialog: () => <div data-testid="search-dialog" />,
}))

vi.mock('@/components/chat/UserAvatar', () => ({
  UserAvatar: () => <div data-testid="user-avatar" />,
}))

vi.mock('@/components/agent/WorkspaceSelector', () => ({
  WorkspaceSelector: () => <div data-testid="workspace-selector" />,
}))

vi.mock('@/components/agent/MoveSessionDialog', () => ({
  MoveSessionDialog: () => null,
}))

vi.mock('@/components/app-shell/SessionListItems', () => ({
  groupByDate: (items: unknown[]) => [{ label: '今天', items }],
  SessionListItems: ({ onToggleSessionSelection }: { onToggleSessionSelection: (id: string) => void }) => {
    sessionListRenderMock()
    return (
      <div data-testid="session-list-items">
        <div className="session-item-selected">当前选中项</div>
        <button type="button" onClick={() => onToggleSessionSelection('chat-1')}>
          选择第一项
        </button>
      </div>
    )
  },
}))

vi.mock('@/hooks/useOpenSession', () => ({
  useOpenSession: () => vi.fn(),
}))

vi.mock('@/hooks/useSyncActiveTabSideEffects', () => ({
  useSyncActiveTabSideEffects: () => vi.fn(),
}))

vi.mock('@/lib/platform', () => ({
  detectIsMac: () => false,
}))

vi.mock('@/lib/ipc', () => ({
  listConversations: () => listConversationsMock(),
  listAgentSessions: () => listAgentSessionsMock(),
  getUserProfile: () => getUserProfileMock(),
  deleteConversation: (id: string) => deleteConversationMock(id),
}))

describe('LeftSidebar selection actions', () => {
  beforeEach(() => {
    deleteConversationMock.mockClear()
    listConversationsMock.mockClear()
    listAgentSessionsMock.mockClear()
    getUserProfileMock.mockClear()
    sessionListRenderMock.mockClear()
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers bulk delete with a confirmation dialog in selection mode', async () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')

    render(
      <Provider store={store}>
        <TooltipProvider>
          <LeftSidebar />
        </TooltipProvider>
      </Provider>,
    )

    await waitFor(() => expect(screen.getByTestId('session-list-items')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '多选' }))
    fireEvent.click(screen.getByRole('button', { name: '选择第一项' }))
    fireEvent.click(screen.getByRole('button', { name: '删除' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('确认删除对话')).toBeInTheDocument()
    expect(within(dialog).getByText('删除后将无法恢复，确定要删除这个对话吗？')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))

    await waitFor(() => expect(deleteConversationMock).toHaveBeenCalledWith('chat-1'))
  })

  it('keeps SessionListItems mounted when the sidebar is collapsed', async () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(sidebarCollapsedAtom, true)

    render(
      <Provider store={store}>
        <TooltipProvider>
          <LeftSidebar />
        </TooltipProvider>
      </Provider>,
    )

    await waitFor(() => expect(screen.getByTestId('session-list-items')).toBeInTheDocument())
  })

  it('animates the sidebar slot width while clipping the expanded content', () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(sidebarCollapsedAtom, true)

    const { container } = render(
      <Provider store={store}>
        <TooltipProvider>
          <LeftSidebar />
        </TooltipProvider>
      </Provider>,
    )

    const sidebar = container.firstElementChild
    expect(sidebar).toHaveStyle({ width: '48px', minWidth: '48px' })
    const expandedContent = sidebar?.querySelector('[data-sidebar-expanded-content="true"]')
    expect(expandedContent).toHaveClass('-translate-x-2')
    expect(expandedContent).toHaveStyle({ width: '280px' })
    expect(expandedContent).not.toHaveClass('transition-[clip-path,opacity,transform]')

    act(() => {
      store.set(sidebarCollapsedAtom, false)
    })

    expect(sidebar).toHaveStyle({ width: '280px', minWidth: '280px' })
    expect(expandedContent).toHaveClass('translate-x-0')
  })

  it('scrolls the selected item back into view when the sidebar re-expands', async () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(activeTabIdAtom, 'chat-1')
    store.set(sidebarCollapsedAtom, false)

    render(
      <Provider store={store}>
        <TooltipProvider>
          <LeftSidebar />
        </TooltipProvider>
      </Provider>,
    )

    await waitFor(() => expect(screen.getByTestId('session-list-items')).toBeInTheDocument())

    const scrollIntoViewMock = vi.mocked(Element.prototype.scrollIntoView)
    scrollIntoViewMock.mockClear()

    await act(async () => {
      store.set(sidebarCollapsedAtom, true)
    })
    await waitFor(() => expect(screen.getByTestId('session-list-items')).toBeInTheDocument())

    await act(async () => {
      store.set(sidebarCollapsedAtom, false)
    })

    await waitFor(() => expect(screen.getByTestId('session-list-items')).toBeInTheDocument())
    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled())
  })

  it('keeps SessionListItems available while the sidebar re-expands', async () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(sidebarCollapsedAtom, true)

    render(
      <Provider store={store}>
        <TooltipProvider>
          <LeftSidebar />
        </TooltipProvider>
      </Provider>,
    )

    expect(screen.getByTestId('session-list-items')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '展开侧边栏' }))

    await waitFor(() => expect(screen.getByTestId('session-list-items')).toBeInTheDocument())
  })

  it('does not rerender the expanded session list when only collapsed state changes', async () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(sidebarCollapsedAtom, false)

    render(
      <Provider store={store}>
        <TooltipProvider>
          <LeftSidebar />
        </TooltipProvider>
      </Provider>,
    )

    await waitFor(() => expect(screen.getByTestId('session-list-items')).toBeInTheDocument())
    sessionListRenderMock.mockClear()

    await act(async () => {
      store.set(sidebarCollapsedAtom, true)
    })

    expect(screen.getByTestId('session-list-items')).toBeInTheDocument()
    expect(sessionListRenderMock).not.toHaveBeenCalled()

    await act(async () => {
      store.set(sidebarCollapsedAtom, false)
    })

    expect(screen.getByTestId('session-list-items')).toBeInTheDocument()
    expect(sessionListRenderMock).not.toHaveBeenCalled()
  })

  it('moves focus to the collapsed rail trigger when collapsing from the expanded header', async () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(sidebarCollapsedAtom, false)

    render(
      <Provider store={store}>
        <TooltipProvider>
          <LeftSidebar />
        </TooltipProvider>
      </Provider>,
    )

    const collapseButton = screen.getByRole('button', { name: '收起侧边栏' })
    collapseButton.focus()
    expect(document.activeElement).toBe(collapseButton)

    fireEvent.click(collapseButton)

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '展开侧边栏' })))
  })

  it('moves focus out of the expanded content when the sidebar is collapsed externally', async () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(sidebarCollapsedAtom, false)

    render(
      <Provider store={store}>
        <TooltipProvider>
          <LeftSidebar />
        </TooltipProvider>
      </Provider>,
    )

    const collapseButton = screen.getByRole('button', { name: '收起侧边栏' })
    collapseButton.focus()
    expect(document.activeElement).toBe(collapseButton)

    await act(async () => {
      store.set(sidebarCollapsedAtom, true)
    })

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '展开侧边栏' })))
  })

  it('initializes the agent top split height after expanding from collapsed mode', async () => {
    const store = createStore()
    store.set(appModeAtom, 'agent')
    store.set(sidebarCollapsedAtom, true)
    store.set(agentSidebarTopHeightAtom, -1)

    const originalGetBoundingClientRect = HTMLDivElement.prototype.getBoundingClientRect
    Object.defineProperty(HTMLDivElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: function getBoundingClientRect(): DOMRect {
        const element = this as HTMLDivElement
        if (element.className.includes('flex-1 flex flex-col min-h-0')) {
          return {
            x: 0,
            y: 0,
            width: 280,
            height: 400,
            top: 0,
            right: 280,
            bottom: 400,
            left: 0,
            toJSON() { return {} },
          } as DOMRect
        }
        return originalGetBoundingClientRect.call(this)
      },
    })

    try {
      render(
        <Provider store={store}>
          <TooltipProvider>
            <LeftSidebar />
          </TooltipProvider>
        </Provider>,
      )

      fireEvent.click(screen.getByRole('button', { name: '展开侧边栏' }))
      await waitFor(() => expect(store.get(agentSidebarTopHeightAtom)).toBe(160))
    } finally {
      Object.defineProperty(HTMLDivElement.prototype, 'getBoundingClientRect', {
        configurable: true,
        value: originalGetBoundingClientRect,
      })
    }
  })
})
