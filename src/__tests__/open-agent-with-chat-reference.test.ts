import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createStore } from 'jotai'
import { openAgentWithChatReference } from '@/components/chat/open-agent-with-chat-reference'
import {
  agentChannelIdAtom,
  agentSessionsAtom,
  agentWorkspacesAtom,
  currentAgentWorkspaceIdAtom,
} from '@/atoms/agent-atoms'
import { conversationsAtom, currentChatWorkspaceIdAtom } from '@/atoms/chat-atoms'
import { activeViewAtom } from '@/atoms/active-view'
import { appModeAtom } from '@/atoms/app-mode'

const createAgentSessionMock = vi.fn(async () => ({
  id: 'agent-1',
  title: '引用 Agent',
  createdAt: 1,
  updatedAt: 1,
  workspaceId: 'chat-ws',
}))
const listAgentSessionsMock = vi.fn(async () => [
  {
    id: 'agent-1',
    title: '引用 Agent',
    createdAt: 1,
    updatedAt: 1,
    workspaceId: 'chat-ws',
  },
])
const updateSettingsMock = vi.fn(async () => ({}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/lib/ipc', () => ({
  createAgentSession: (...args: unknown[]) => createAgentSessionMock(...args),
  listAgentSessions: (...args: unknown[]) => listAgentSessionsMock(...args),
  updateSettings: (...args: unknown[]) => updateSettingsMock(...args),
  deleteAgentSession: vi.fn(async () => undefined),
}))

describe('openAgentWithChatReference', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates the bridged Agent session in the current Chat workspace', async () => {
    const store = createStore()
    store.set(agentChannelIdAtom, 'agent-channel')
    store.set(agentSessionsAtom, [])
    store.set(agentWorkspacesAtom, [
      { id: 'agent-ws', name: 'Agent 区', slug: 'agent-space' },
      { id: 'chat-ws', name: 'Chat 区', slug: 'chat-space' },
    ] as never)
    store.set(currentAgentWorkspaceIdAtom, 'agent-ws')
    store.set(currentChatWorkspaceIdAtom, 'chat-ws')
    store.set(conversationsAtom, [
      {
        id: 'chat-1',
        title: '当前聊天',
        createdAt: 1,
        updatedAt: 1,
        pinned: false,
        archived: false,
      },
    ] as never)

    await openAgentWithChatReference({
      store,
      conversationId: 'chat-1',
    })

    expect(createAgentSessionMock).toHaveBeenCalledWith(undefined, 'agent-channel', 'chat-ws')
    expect(updateSettingsMock).toHaveBeenCalledWith({ agentWorkspaceId: 'chat-ws' })
    expect(store.get(currentAgentWorkspaceIdAtom)).toBe('chat-ws')
    expect(store.get(appModeAtom)).toBe('agent')
    expect(store.get(activeViewAtom)).toBe('conversations')
  })
})
