import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { AppShell } from '@/components/app-shell/AppShell'
import { appModeAtom } from '@/atoms/app-mode'
import { currentAgentSessionIdAtom } from '@/atoms/agent-atoms'
import { currentConversationIdAtom } from '@/atoms/chat-atoms'
import { activeTabIdAtom, tabsAtom } from '@/atoms/tab-atoms'

vi.mock('@/components/app-shell/LeftSidebar', () => ({
  LeftSidebar: () => <div data-testid="left-sidebar" />,
}))

vi.mock('@/components/app-shell/RightSidePanel', () => ({
  RightSidePanel: () => <div data-testid="right-side-panel" />,
}))

vi.mock('@/components/tabs/MainArea', () => ({
  MainArea: () => <div data-testid="main-area" />,
}))

function renderShell(store: ReturnType<typeof createStore>) {
  return render(
    <Provider store={store}>
      <AppShell contextValue={{}} />
    </Provider>,
  )
}

describe('AppShell layout guards', () => {
  it('does not keep the right panel visible when there is no active tab', () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(currentConversationIdAtom, 'chat-stale')
    store.set(currentAgentSessionIdAtom, null)
    store.set(tabsAtom, [])
    store.set(activeTabIdAtom, null)

    renderShell(store)

    expect(screen.queryByTestId('right-side-panel')).not.toBeInTheDocument()
  })

  it('shows the right panel once a matching active tab exists', () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(currentConversationIdAtom, 'chat-1')
    store.set(currentAgentSessionIdAtom, null)
    store.set(tabsAtom, [
      { id: 'tab-chat-1', type: 'chat', sessionId: 'chat-1', title: 'Chat 1' },
    ])
    store.set(activeTabIdAtom, 'tab-chat-1')

    renderShell(store)

    expect(screen.getByTestId('right-side-panel')).toBeInTheDocument()
  })
})
