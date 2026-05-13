import * as React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { WelcomeView } from '@/components/welcome/WelcomeView'
import { appModeAtom } from '@/atoms/app-mode'
import { agentSettingsReadyAtom } from '@/atoms/agent-atoms'

const createChatMock = vi.fn(() => new Promise<void>(() => {}))
const createAgentMock = vi.fn(() => new Promise<void>(() => {}))

vi.mock('@/hooks/useCreateSession', () => ({
  useCreateSession: () => ({
    createChat: createChatMock,
    createAgent: createAgentMock,
  }),
}))

describe('WelcomeView guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates real chats from the empty state and blocks repeat clicks while pending', () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(agentSettingsReadyAtom, true)

    render(
      <Provider store={store}>
        <WelcomeView />
      </Provider>,
    )

    const button = screen.getByRole('button', { name: '新建 Chat 对话' })
    fireEvent.click(button)
    fireEvent.click(button)

    expect(createChatMock).toHaveBeenCalledTimes(1)
    expect(createChatMock).toHaveBeenCalledWith()
  })
})
