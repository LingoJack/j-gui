import * as React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
})
