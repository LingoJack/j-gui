import * as React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { SidePanel } from '@/components/agent/SidePanel'
import { currentChatWorkspaceIdAtom, currentConversationIdAtom, pendingAttachmentsAtom } from '@/atoms/chat-atoms'
import {
  agentWorkspacesAtom,
  currentAgentWorkspaceIdAtom,
  workspaceAttachedDirectoriesMapAtom,
  agentSessionsAtom,
  agentAttachedDirectoriesMapAtom,
  workspaceFilesVersionAtom,
  recentlyModifiedPathsAtom,
  agentSidePanelOpenMapAtom,
} from '@/atoms/agent-atoms'

const getWorkspaceDirectoriesMock = vi.fn(async () => [])
const getWorkspaceFilesPathMock = vi.fn(async (slug: string) => `E:/workspaces/${slug}`)
const updateSettingsMock = vi.fn(async () => ({}))

vi.mock('@/components/file-browser', () => ({
  FileBrowser: ({ rootPath }: { rootPath: string }) => <div data-testid="file-browser">{rootPath}</div>,
  FileDropZone: ({ workspaceSlug }: { workspaceSlug: string }) => <div data-testid="file-drop-zone">{workspaceSlug}</div>,
  FileTypeIcon: () => <div />,
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <div />,
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string
    onValueChange: (value: string) => void
    children: React.ReactNode
  }) => (
    <select
      data-testid="chat-workspace-select"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))

vi.mock('@/lib/platform', () => ({
  detectIsMac: () => false,
  detectIsWindows: () => true,
}))

vi.mock('@/lib/ipc', () => ({
  getWorkspaceDirectories: (...args: unknown[]) => getWorkspaceDirectoriesMock(...args),
  getWorkspaceFilesPath: (...args: unknown[]) => getWorkspaceFilesPathMock(...args),
  updateSettings: (...args: unknown[]) => updateSettingsMock(...args),
  openFile: vi.fn(),
  openFolderDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
  readAttachedFile: vi.fn(),
}))

describe('SidePanel chat workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
    vi.stubGlobal('CSS', { escape: (value: string) => value })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses Chat workspace state instead of Agent workspace state in chat mode', async () => {
    const store = createStore()
    store.set(currentConversationIdAtom, 'chat-1')
    store.set(currentChatWorkspaceIdAtom, 'chat-ws')
    store.set(currentAgentWorkspaceIdAtom, 'agent-ws')
    store.set(agentWorkspacesAtom, [
      { id: 'agent-ws', name: 'Agent 区', slug: 'agent-space' },
      { id: 'chat-ws', name: 'Chat 区', slug: 'chat-space' },
    ])
    store.set(workspaceAttachedDirectoriesMapAtom, new Map())
    store.set(agentSessionsAtom, [])
    store.set(agentAttachedDirectoriesMapAtom, new Map())
    store.set(workspaceFilesVersionAtom, 0)
    store.set(recentlyModifiedPathsAtom, new Map())
    store.set(agentSidePanelOpenMapAtom, new Map([['chat-1', true]]))
    store.set(pendingAttachmentsAtom, [])

    render(
      <Provider store={store}>
        <SidePanel sessionId="chat-1" sessionPath={null} mode="chat" />
      </Provider>,
    )

    await waitFor(() => expect(getWorkspaceFilesPathMock).toHaveBeenCalledWith('chat-space'))
    expect(screen.getByTestId('file-browser')).toHaveTextContent('E:/workspaces/chat-space')
    expect(screen.getByTestId('file-drop-zone')).toHaveTextContent('chat-space')
  })

  it('persists chat workspace changes without mutating Agent workspace selection', async () => {
    const store = createStore()
    store.set(currentConversationIdAtom, 'chat-1')
    store.set(currentChatWorkspaceIdAtom, 'chat-ws')
    store.set(currentAgentWorkspaceIdAtom, 'agent-ws')
    store.set(agentWorkspacesAtom, [
      { id: 'agent-ws', name: 'Agent 区', slug: 'agent-space' },
      { id: 'chat-ws', name: 'Chat 区', slug: 'chat-space' },
    ])
    store.set(workspaceAttachedDirectoriesMapAtom, new Map())
    store.set(agentSessionsAtom, [])
    store.set(agentAttachedDirectoriesMapAtom, new Map())
    store.set(workspaceFilesVersionAtom, 0)
    store.set(recentlyModifiedPathsAtom, new Map())
    store.set(agentSidePanelOpenMapAtom, new Map([['chat-1', true]]))
    store.set(pendingAttachmentsAtom, [])

    render(
      <Provider store={store}>
        <SidePanel sessionId="chat-1" sessionPath={null} mode="chat" />
      </Provider>,
    )

    fireEvent.change(screen.getByTestId('chat-workspace-select'), {
      target: { value: 'agent-ws' },
    })

    await waitFor(() => expect(updateSettingsMock).toHaveBeenCalledWith({ chatWorkspaceId: 'agent-ws' }))
    expect(store.get(currentChatWorkspaceIdAtom)).toBe('agent-ws')
    expect(store.get(currentAgentWorkspaceIdAtom)).toBe('agent-ws')
  })

  it('keeps workspace content mounted while the panel slides out of interaction', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
    const store = createStore()
    store.set(currentConversationIdAtom, 'chat-1')
    store.set(currentChatWorkspaceIdAtom, 'chat-ws')
    store.set(currentAgentWorkspaceIdAtom, 'agent-ws')
    store.set(agentWorkspacesAtom, [
      { id: 'agent-ws', name: 'Agent 区', slug: 'agent-space' },
      { id: 'chat-ws', name: 'Chat 区', slug: 'chat-space' },
    ])
    store.set(workspaceAttachedDirectoriesMapAtom, new Map())
    store.set(agentSessionsAtom, [])
    store.set(agentAttachedDirectoriesMapAtom, new Map())
    store.set(workspaceFilesVersionAtom, 0)
    store.set(recentlyModifiedPathsAtom, new Map())
    store.set(agentSidePanelOpenMapAtom, new Map([['chat-1', true]]))
    store.set(pendingAttachmentsAtom, [])

    render(
      <Provider store={store}>
        <SidePanel sessionId="chat-1" sessionPath={null} mode="chat" />
      </Provider>,
    )

    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId('file-drop-zone')).toBeInTheDocument()

    await act(async () => {
      store.set(agentSidePanelOpenMapAtom, new Map([['chat-1', false]]))
    })
    expect(screen.getByTestId('file-drop-zone')).toBeInTheDocument()
    const hiddenContent = screen.getByTestId('file-drop-zone').closest('[aria-hidden="true"]')
    expect(hiddenContent).not.toBeNull()
    expect(hiddenContent).toHaveAttribute('inert')
    expect(hiddenContent?.parentElement).toHaveClass('translate-x-full')
    expect(hiddenContent?.parentElement).toHaveClass('pointer-events-none')

    await act(async () => {
      store.set(agentSidePanelOpenMapAtom, new Map([['chat-1', true]]))
      await Promise.resolve()
    })

    expect(screen.getByTestId('file-drop-zone')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('does not flash the workspace placeholder before the workspace path resolves', async () => {
    let resolveWorkspacePath: ((value: string) => void) | null = null
    getWorkspaceFilesPathMock.mockImplementationOnce(() => new Promise<string>((resolve) => {
      resolveWorkspacePath = resolve
    }))

    const store = createStore()
    store.set(currentConversationIdAtom, 'chat-1')
    store.set(currentChatWorkspaceIdAtom, 'chat-ws')
    store.set(currentAgentWorkspaceIdAtom, 'agent-ws')
    store.set(agentWorkspacesAtom, [
      { id: 'agent-ws', name: 'Agent 区', slug: 'agent-space' },
      { id: 'chat-ws', name: 'Chat 区', slug: 'chat-space' },
    ])
    store.set(workspaceAttachedDirectoriesMapAtom, new Map())
    store.set(agentSessionsAtom, [])
    store.set(agentAttachedDirectoriesMapAtom, new Map())
    store.set(workspaceFilesVersionAtom, 0)
    store.set(recentlyModifiedPathsAtom, new Map())
    store.set(agentSidePanelOpenMapAtom, new Map([['chat-1', true]]))
    store.set(pendingAttachmentsAtom, [])

    render(
      <Provider store={store}>
        <SidePanel sessionId="chat-1" sessionPath={null} mode="chat" />
      </Provider>,
    )

    expect(screen.queryByText('这里是聊天可引用的文件区')).not.toBeInTheDocument()

    await act(async () => {
      resolveWorkspacePath?.('E:/workspaces/chat-space')
      await Promise.resolve()
    })

    expect(screen.getByTestId('file-browser')).toHaveTextContent('E:/workspaces/chat-space')
    expect(screen.queryByText('这里是聊天可引用的文件区')).not.toBeInTheDocument()
  })

  it('clears the previous workspace file browser while a newly selected workspace is still resolving', async () => {
    let resolveAgentWorkspacePath: ((value: string) => void) | null = null
    let resolveChatWorkspacePath: ((value: string) => void) | null = null
    getWorkspaceFilesPathMock
      .mockImplementationOnce(() => new Promise<string>((resolve) => {
        resolveAgentWorkspacePath = resolve
      }))
      .mockImplementationOnce(() => new Promise<string>((resolve) => {
        resolveChatWorkspacePath = resolve
      }))

    const store = createStore()
    store.set(currentConversationIdAtom, 'chat-1')
    store.set(currentChatWorkspaceIdAtom, 'agent-ws')
    store.set(currentAgentWorkspaceIdAtom, 'agent-ws')
    store.set(agentWorkspacesAtom, [
      { id: 'agent-ws', name: 'Agent 区', slug: 'agent-space' },
      { id: 'chat-ws', name: 'Chat 区', slug: 'chat-space' },
    ])
    store.set(workspaceAttachedDirectoriesMapAtom, new Map())
    store.set(agentSessionsAtom, [])
    store.set(agentAttachedDirectoriesMapAtom, new Map())
    store.set(workspaceFilesVersionAtom, 0)
    store.set(recentlyModifiedPathsAtom, new Map())
    store.set(agentSidePanelOpenMapAtom, new Map([['chat-1', true]]))
    store.set(pendingAttachmentsAtom, [])

    render(
      <Provider store={store}>
        <SidePanel sessionId="chat-1" sessionPath={null} mode="chat" />
      </Provider>,
    )

    await act(async () => {
      resolveAgentWorkspacePath?.('E:/workspaces/agent-space')
      await Promise.resolve()
    })
    expect(screen.getByTestId('file-browser')).toHaveTextContent('E:/workspaces/agent-space')

    fireEvent.change(screen.getByTestId('chat-workspace-select'), {
      target: { value: 'chat-ws' },
    })

    expect(screen.queryByTestId('file-browser')).not.toBeInTheDocument()
    expect(screen.queryByText('这里是聊天可引用的文件区')).not.toBeInTheDocument()

    await act(async () => {
      resolveChatWorkspacePath?.('E:/workspaces/chat-space')
      await Promise.resolve()
    })

    expect(screen.getByTestId('file-browser')).toHaveTextContent('E:/workspaces/chat-space')
  })
})
