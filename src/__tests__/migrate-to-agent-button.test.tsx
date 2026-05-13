import * as React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MigrateToAgentButton } from '@/components/chat/MigrateToAgentButton'
import {
  agentChannelIdAtom,
  agentWorkspacesAtom,
  currentAgentWorkspaceIdAtom,
} from '@/atoms/agent-atoms'
import { openAgentWithChatReference } from '@/components/chat/open-agent-with-chat-reference'

vi.mock('@/components/chat/open-agent-with-chat-reference', () => ({
  openAgentWithChatReference: vi.fn(),
}))

describe('MigrateToAgentButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(openAgentWithChatReference).mockResolvedValue(undefined)
  })

  function renderButton() {
    const store = createStore()
    store.set(agentChannelIdAtom, 'channel-1')
    store.set(agentWorkspacesAtom, [{ id: 'ws-1', name: 'Workspace 1', slug: 'ws-1' }] as never)
    store.set(currentAgentWorkspaceIdAtom, null)

    return render(
      <Provider store={store}>
        <MigrateToAgentButton conversationId="chat-1" variant="button" />
      </Provider>,
    )
  }

  it('opens the agent bridge helper instead of calling the removed migration command', async () => {
    renderButton()

    fireEvent.click(screen.getByRole('button', { name: /在 Agent 中引用/i }))

    await waitFor(() => {
      expect(openAgentWithChatReference).toHaveBeenCalledTimes(1)
    })
  })
})
