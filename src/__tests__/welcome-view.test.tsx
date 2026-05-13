import * as React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { WelcomeView } from '@/components/welcome/WelcomeView'
import { appModeAtom } from '@/atoms/app-mode'
import { agentSettingsReadyAtom } from '@/atoms/agent-atoms'

const createChatMock = vi.fn()
const createAgentMock = vi.fn()

vi.mock('@/hooks/useCreateSession', () => ({
  useCreateSession: () => ({
    createChat: createChatMock,
    createAgent: createAgentMock,
  }),
}))

describe('WelcomeView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderWelcome(mode: 'chat' | 'agent', agentSettingsReady = true) {
    const store = createStore()
    store.set(appModeAtom, mode)
    store.set(agentSettingsReadyAtom, agentSettingsReady)
    return render(
      <Provider store={store}>
        <WelcomeView />
      </Provider>,
    )
  }

  it('keeps a real empty state and lets chat mode create a new conversation explicitly', () => {
    renderWelcome('chat')

    expect(screen.getByRole('button', { name: '新建 Chat 对话' })).toBeInTheDocument()
    expect(screen.getByAltText('j-gui')).toBeInTheDocument()
    expect(screen.getByTestId('welcome-bottom-dock')).toHaveClass('pb-2')
    expect(screen.queryByText('下一步')).not.toBeInTheDocument()
    expect(screen.queryByText('常用入口')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '新建 Chat 对话' }))

    expect(createChatMock).toHaveBeenCalledTimes(1)
    expect(createAgentMock).not.toHaveBeenCalled()
  })

  it('requires an explicit action to create a new agent session', () => {
    renderWelcome('agent')

    fireEvent.click(screen.getByRole('button', { name: '新建 Agent 会话' }))

    expect(createAgentMock).toHaveBeenCalledTimes(1)
    expect(createChatMock).not.toHaveBeenCalled()
  })

  it('disables agent creation until agent settings are ready', () => {
    renderWelcome('agent', false)

    expect(screen.getByRole('button', { name: '新建 Agent 会话' })).toBeDisabled()
  })
})
