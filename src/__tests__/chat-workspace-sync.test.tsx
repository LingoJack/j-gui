import * as React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Provider, createStore } from 'jotai'
import { render, waitFor } from '@testing-library/react'
import { agentWorkspacesAtom } from '@/atoms/agent-atoms'
import { currentChatWorkspaceIdAtom } from '@/atoms/chat-atoms'
import { useSyncChatWorkspaceId } from '@/hooks/useSyncChatWorkspaceId'

const updateSettingsMock = vi.fn(async () => ({}))

vi.mock('@/lib/ipc', () => ({
  updateSettings: (...args: unknown[]) => updateSettingsMock(...args),
}))

function SyncHarness(): React.ReactElement | null {
  useSyncChatWorkspaceId()
  return null
}

describe('useSyncChatWorkspaceId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('repairs stale chat workspace ids to the first available workspace', async () => {
    const store = createStore()
    store.set(currentChatWorkspaceIdAtom, 'missing-ws')
    store.set(agentWorkspacesAtom, [
      { id: 'chat-ws', name: 'Chat 区', slug: 'chat-space' },
    ] as never)

    render(
      <Provider store={store}>
        <SyncHarness />
      </Provider>,
    )

    await waitFor(() => expect(updateSettingsMock).toHaveBeenCalledWith({ chatWorkspaceId: 'chat-ws' }))
    expect(store.get(currentChatWorkspaceIdAtom)).toBe('chat-ws')
  })
})
