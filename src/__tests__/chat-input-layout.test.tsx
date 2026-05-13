import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { ChatInput } from '@/components/chat/ChatInput'
import { conversationDraftsAtom, currentChatWorkspaceIdAtom } from '@/atoms/chat-atoms'
import { agentWorkspacesAtom, workspaceAttachedDirectoriesMapAtom } from '@/atoms/agent-atoms'
import { sendWithCmdEnterAtom } from '@/atoms/shortcut-atoms'
import { TooltipProvider } from '@/components/ui/tooltip'

const {
  useConversationModelMock,
  useConversationThinkingEnabledMock,
} = vi.hoisted(() => ({
  useConversationModelMock: vi.fn(() => [{ channelId: 'channel-1', modelId: 'deepseek-v4-pro' }]),
  useConversationThinkingEnabledMock: vi.fn(() => [false, vi.fn()] as [boolean, (value: boolean) => void]),
}))

vi.mock('@/components/chat/ModelSelector', () => ({
  ModelSelector: () => <div data-testid="model-selector" />,
}))

vi.mock('@/components/chat/ClearContextButton', () => ({
  ClearContextButton: () => <div data-testid="clear-context" />,
}))

vi.mock('@/components/chat/ContextSettingsPopover', () => ({
  ContextSettingsPopover: () => <div data-testid="context-settings" />,
}))

vi.mock('@/components/chat/ToolSelectorPopover', () => ({
  ToolSelectorPopover: () => <div data-testid="tool-selector" />,
}))

vi.mock('@/components/ai-elements/rich-text-input', () => ({
  RichTextInput: (props: { workspacePath?: string | null; workspaceSlug?: string | null; attachedDirs?: string[] }) => (
    <div
      data-testid="rich-text-input"
      data-workspace-path={props.workspacePath ?? ''}
      data-workspace-slug={props.workspaceSlug ?? ''}
      data-attached-dirs={(props.attachedDirs ?? []).join('|')}
    />
  ),
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (value: boolean) => void }) => (
    <button type="button" onClick={() => onCheckedChange(!checked)}>
      {checked ? 'on' : 'off'}
    </button>
  ),
}))

vi.mock('@/hooks/useConversationSettings', () => ({
  useConversationModel: useConversationModelMock,
  useConversationThinkingEnabled: useConversationThinkingEnabledMock,
}))

const getWorkspaceFilesPathMock = vi.fn(async () => 'E:/chat-workspace/files')

vi.mock('@/lib/ipc', () => ({
  openFileDialog: vi.fn(),
  getWorkspaceFilesPath: (...args: unknown[]) => getWorkspaceFilesPathMock(...args),
}))

describe('ChatInput docking', () => {
  it('keeps a small bottom gap on the dock wrapper without reintroducing large padding', () => {
    useConversationThinkingEnabledMock.mockReturnValue([false, vi.fn()])

    const store = createStore()
    store.set(conversationDraftsAtom, new Map())
    store.set(sendWithCmdEnterAtom, false)

    render(
      <Provider store={store}>
        <TooltipProvider>
          <ChatInput
            conversationId="chat-1"
            streaming={false}
            pendingAttachments={[]}
            onSetPendingAttachments={vi.fn()}
            onSend={vi.fn()}
            onStop={vi.fn()}
          />
        </TooltipProvider>
      </Provider>,
    )

    expect(screen.getByTestId('chat-input-dock')).toHaveClass('pb-2')
  })

  it('uses the same thinking button treatment as Agent mode when enabled', () => {
    const setThinking = vi.fn()
    useConversationThinkingEnabledMock.mockReturnValue([true, setThinking])

    const store = createStore()
    store.set(conversationDraftsAtom, new Map())
    store.set(sendWithCmdEnterAtom, false)

    render(
      <Provider store={store}>
        <TooltipProvider>
          <ChatInput
            conversationId="chat-1"
            streaming={false}
            pendingAttachments={[]}
            onSetPendingAttachments={vi.fn()}
            onSend={vi.fn()}
            onStop={vi.fn()}
          />
        </TooltipProvider>
      </Provider>,
    )

    const button = screen.getByRole('button', { name: '思考模式' })
    expect(button).toHaveClass('bg-green-500/10')
    expect(button).not.toHaveClass('hover:text-foreground')

    fireEvent.click(button)
    expect(setThinking).toHaveBeenCalledWith(false)
  })

  it('binds Chat workspace mentions to the independent chat workspace source', async () => {
    useConversationThinkingEnabledMock.mockReturnValue([false, vi.fn()])
    getWorkspaceFilesPathMock.mockClear()

    const store = createStore()
    store.set(conversationDraftsAtom, new Map())
    store.set(sendWithCmdEnterAtom, false)
    store.set(currentChatWorkspaceIdAtom, 'chat-ws')
    store.set(agentWorkspacesAtom, [
      { id: 'chat-ws', name: '聊天区', slug: 'chat-space' },
    ])
    store.set(workspaceAttachedDirectoriesMapAtom, new Map([['chat-ws', ['E:/shared-a', 'E:/shared-b']]]))

    render(
      <Provider store={store}>
        <TooltipProvider>
          <ChatInput
            conversationId="chat-1"
            streaming={false}
            pendingAttachments={[]}
            onSetPendingAttachments={vi.fn()}
            onSend={vi.fn()}
            onStop={vi.fn()}
          />
        </TooltipProvider>
      </Provider>,
    )

    const input = await screen.findByTestId('rich-text-input')
    expect(getWorkspaceFilesPathMock).toHaveBeenCalledWith('chat-space')
    expect(input).toHaveAttribute('data-workspace-path', 'E:/chat-workspace/files')
    expect(input).toHaveAttribute('data-workspace-slug', 'chat-space')
    expect(input).toHaveAttribute('data-attached-dirs', 'E:/shared-a|E:/shared-b')
  })

  it('falls back to the first workspace when the saved Chat workspace id is stale', async () => {
    useConversationThinkingEnabledMock.mockReturnValue([false, vi.fn()])
    getWorkspaceFilesPathMock.mockClear()

    const store = createStore()
    store.set(conversationDraftsAtom, new Map())
    store.set(sendWithCmdEnterAtom, false)
    store.set(currentChatWorkspaceIdAtom, 'missing-ws')
    store.set(agentWorkspacesAtom, [
      { id: 'fallback-ws', name: '默认区', slug: 'fallback-space' },
    ])
    store.set(workspaceAttachedDirectoriesMapAtom, new Map([['fallback-ws', ['E:/fallback-dir']]]))

    render(
      <Provider store={store}>
        <TooltipProvider>
          <ChatInput
            conversationId="chat-1"
            streaming={false}
            pendingAttachments={[]}
            onSetPendingAttachments={vi.fn()}
            onSend={vi.fn()}
            onStop={vi.fn()}
          />
        </TooltipProvider>
      </Provider>,
    )

    const input = await screen.findByTestId('rich-text-input')
    expect(getWorkspaceFilesPathMock).toHaveBeenCalledWith('fallback-space')
    expect(input).toHaveAttribute('data-workspace-path', 'E:/chat-workspace/files')
    expect(input).toHaveAttribute('data-workspace-slug', 'fallback-space')
    expect(input).toHaveAttribute('data-attached-dirs', 'E:/fallback-dir')
  })
})
