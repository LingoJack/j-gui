import * as React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import '@testing-library/jest-dom/vitest'

import { ModeSwitcher } from '@/components/app-shell/ModeSwitcher'
import { appModeAtom } from '@/atoms/app-mode'
import { conversationsAtom, currentConversationIdAtom, selectedModelAtom } from '@/atoms/chat-atoms'
import {
  agentSessionsAtom,
  currentAgentSessionIdAtom,
  currentAgentWorkspaceIdAtom,
  agentChannelIdAtom,
} from '@/atoms/agent-atoms'
import { tabsAtom, activeTabIdAtom } from '@/atoms/tab-atoms'
import { activeViewAtom } from '@/atoms/active-view'
import { draftSessionIdsAtom } from '@/atoms/draft-session-atoms'
import { promptConfigAtom, selectedPromptIdAtom } from '@/atoms/system-prompt-atoms'
import { invoke } from '@tauri-apps/api/core'

const mockInvoke = vi.mocked(invoke)

describe('ModeSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockImplementation((cmd: string) => {
      switch (cmd) {
        case 'create_session':
          return Promise.resolve('chat-created')
        case 'create_agent_session':
          return Promise.resolve({
            id: 'agent-created',
            title: '新 Agent 会话',
            workspaceId: 'ws-1',
            channelId: 'channel-1',
            updatedAt: Date.now(),
            pinned: false,
            archived: false,
            manualWorking: false,
            stoppedByUser: false,
            permissionMode: 'bypassPermissions',
          })
        case 'update_settings':
          return Promise.resolve({})
        default:
          return Promise.reject(new Error(`Unmocked invoke: ${cmd}`))
      }
    })
  })

  function createTestStore() {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(conversationsAtom, [])
    store.set(currentConversationIdAtom, null)
    store.set(agentSessionsAtom, [])
    store.set(currentAgentSessionIdAtom, null)
    store.set(currentAgentWorkspaceIdAtom, 'ws-1')
    store.set(agentChannelIdAtom, 'channel-1')
    store.set(tabsAtom, [])
    store.set(activeTabIdAtom, null)
    store.set(activeViewAtom, 'conversations')
    store.set(draftSessionIdsAtom, new Set())
    store.set(selectedModelAtom, null)
    store.set(promptConfigAtom, { prompts: [], defaultPromptId: null, appendDateTimeAndUserName: true })
    store.set(selectedPromptIdAtom, null)
    return store
  }

  it('creates a draft agent session when switching to agent without any existing session/tab', async () => {
    const store = createTestStore()
    render(
      <Provider store={store}>
        <ModeSwitcher />
      </Provider>,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /agent/i }))
    })

    await waitFor(() => {
      expect(store.get(appModeAtom)).toBe('agent')
      expect(store.get(currentAgentSessionIdAtom)).toBe('agent-created')
      expect(store.get(tabsAtom)).toHaveLength(1)
      expect(store.get(tabsAtom)[0]?.type).toBe('agent')
    })
  })
})
