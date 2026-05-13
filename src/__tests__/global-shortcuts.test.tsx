import * as React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { GlobalShortcuts } from '@/components/shortcuts/GlobalShortcuts'
import { settingsOpenAtom, channelFormDirtyAtom, settingsCloseRequestedAtom } from '@/atoms/settings-tab'
import { appModeAtom } from '@/atoms/app-mode'
import { searchDialogOpenAtom } from '@/atoms/search-atoms'
import { sidebarCollapsedAtom, tabsAtom, activeTabIdAtom } from '@/atoms/tab-atoms'
import { conversationsAtom, currentConversationIdAtom } from '@/atoms/chat-atoms'
import { agentSessionsAtom, currentAgentSessionIdAtom, currentAgentWorkspaceIdAtom } from '@/atoms/agent-atoms'

const shortcutHandlers = new Map<string, () => void>()

vi.mock('@/hooks/useShortcut', () => ({
  useShortcut: (id: string, callback: () => void) => {
    shortcutHandlers.set(id, callback)
  },
}))

vi.mock('@/hooks/useCreateSession', () => ({
  useCreateSession: () => ({
    createChat: vi.fn(),
    createAgent: vi.fn(),
  }),
}))

vi.mock('@/hooks/useCloseTab', () => ({
  useCloseTab: () => ({
    requestClose: vi.fn(),
  }),
}))

vi.mock('@/hooks/useOpenSession', () => ({
  useOpenSession: () => vi.fn(),
}))

vi.mock('@/lib/shortcut-registry', () => ({
  initShortcutRegistry: vi.fn(),
  updateShortcutOverrides: vi.fn(),
}))

vi.mock('@/lib/ipc', () => ({
  getSettings: vi.fn(async () => ({ sendWithCmdEnter: false })),
}))

describe('GlobalShortcuts', () => {
  beforeEach(() => {
    shortcutHandlers.clear()
  })

  function renderShortcuts() {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(settingsOpenAtom, false)
    store.set(channelFormDirtyAtom, false)
    store.set(settingsCloseRequestedAtom, false)
    store.set(searchDialogOpenAtom, false)
    store.set(sidebarCollapsedAtom, false)
    store.set(tabsAtom, [])
    store.set(activeTabIdAtom, null)
    store.set(conversationsAtom, [])
    store.set(currentConversationIdAtom, null)
    store.set(agentSessionsAtom, [])
    store.set(currentAgentSessionIdAtom, null)
    store.set(currentAgentWorkspaceIdAtom, null)

    render(
      <Provider store={store}>
        <GlobalShortcuts />
      </Provider>,
    )

    return store
  }

  it('toggles settings on repeated open-settings shortcut presses', async () => {
    const store = renderShortcuts()
    const handler = shortcutHandlers.get('open-settings')

    expect(handler).toBeTypeOf('function')

    await act(async () => {
      handler?.()
    })
    expect(store.get(settingsOpenAtom)).toBe(true)

    const toggledHandler = shortcutHandlers.get('open-settings')
    await act(async () => {
      toggledHandler?.()
    })
    expect(store.get(settingsOpenAtom)).toBe(false)
  })

  it('toggles search on repeated global-search shortcut presses', async () => {
    const store = renderShortcuts()
    const handler = shortcutHandlers.get('global-search')

    expect(handler).toBeTypeOf('function')

    await act(async () => {
      handler?.()
    })
    expect(store.get(searchDialogOpenAtom)).toBe(true)

    await act(async () => {
      handler?.()
    })
    expect(store.get(searchDialogOpenAtom)).toBe(false)
  })

  it('toggles sidebar twice with the same shortcut handler instance', async () => {
    const store = renderShortcuts()
    const handler = shortcutHandlers.get('toggle-sidebar')

    expect(handler).toBeTypeOf('function')

    await act(async () => {
      handler?.()
    })
    expect(store.get(sidebarCollapsedAtom)).toBe(true)

    await act(async () => {
      handler?.()
    })
    expect(store.get(sidebarCollapsedAtom)).toBe(false)
  })
})
