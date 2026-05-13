import * as React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { AppShell } from '@/components/app-shell/AppShell'
import { appModeAtom } from '@/atoms/app-mode'
import { agentSidePanelOpenMapAtom, currentAgentSessionIdAtom } from '@/atoms/agent-atoms'
import { currentConversationIdAtom } from '@/atoms/chat-atoms'
import { activeTabIdAtom, tabsAtom } from '@/atoms/tab-atoms'

const platformState = {
  isWindows: true,
  isMac: false,
}

const tauriInternalsState = {
  enabled: true,
}

const tauriWindowMock = vi.hoisted(() => ({
  minimize: vi.fn(async () => {}),
  toggleMaximize: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  hide: vi.fn(async () => {}),
  isMaximized: vi.fn(async () => false),
  setDecorations: vi.fn(async (_decorations: boolean) => {}),
  onResized: vi.fn(async () => () => {}),
  onCloseRequested: vi.fn(async () => () => {}),
  unminimize: vi.fn(async () => {}),
  show: vi.fn(async () => {}),
  setFocus: vi.fn(async () => {}),
}))

vi.mock('@/lib/platform', () => ({
  detectIsWindows: () => platformState.isWindows,
  detectIsMac: () => platformState.isMac,
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    minimize: tauriWindowMock.minimize,
    toggleMaximize: tauriWindowMock.toggleMaximize,
    close: tauriWindowMock.close,
    hide: tauriWindowMock.hide,
    isMaximized: tauriWindowMock.isMaximized,
    setDecorations: tauriWindowMock.setDecorations,
    onResized: tauriWindowMock.onResized,
    onCloseRequested: tauriWindowMock.onCloseRequested,
    unminimize: tauriWindowMock.unminimize,
    show: tauriWindowMock.show,
    setFocus: tauriWindowMock.setFocus,
  }),
}))

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
  beforeEach(() => {
    platformState.isWindows = true
    platformState.isMac = false
    tauriInternalsState.enabled = true
    ;(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = tauriInternalsState.enabled
      ? { metadata: { currentWindow: { label: 'main' } } }
      : undefined
    tauriWindowMock.minimize.mockClear()
    tauriWindowMock.toggleMaximize.mockClear()
    tauriWindowMock.close.mockClear()
    tauriWindowMock.hide.mockClear()
    tauriWindowMock.isMaximized.mockClear()
    tauriWindowMock.onResized.mockClear()
    tauriWindowMock.onCloseRequested.mockClear()
    tauriWindowMock.unminimize.mockClear()
    tauriWindowMock.show.mockClear()
    tauriWindowMock.setFocus.mockClear()
    tauriWindowMock.isMaximized.mockResolvedValue(false)
    tauriWindowMock.onResized.mockResolvedValue(() => {})
    tauriWindowMock.onCloseRequested.mockResolvedValue(() => {})
  })

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

  it('falls back to the main-area window controls when the right panel is collapsed', () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(currentConversationIdAtom, 'chat-1')
    store.set(currentAgentSessionIdAtom, null)
    store.set(tabsAtom, [
      { id: 'tab-chat-1', type: 'chat', sessionId: 'chat-1', title: 'Chat 1' },
    ])
    store.set(activeTabIdAtom, 'tab-chat-1')
    store.set(agentSidePanelOpenMapAtom, new Map([['chat-1', false]]))

    renderShell(store)

    expect(screen.getByTestId('right-side-panel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '最小化窗口' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '最小化窗口' }).closest('.tabbar-bg')).not.toBeNull()
  })

  it('renders desktop window controls on Windows and wires the window actions', async () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(currentConversationIdAtom, null)
    store.set(currentAgentSessionIdAtom, null)
    store.set(tabsAtom, [])
    store.set(activeTabIdAtom, null)

    renderShell(store)

    expect(screen.getByRole('button', { name: '最小化窗口' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '最大化窗口' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭窗口' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '最小化窗口' }))
    fireEvent.click(screen.getByRole('button', { name: '最大化窗口' }))
    fireEvent.click(screen.getByRole('button', { name: '关闭窗口' }))

    expect(tauriWindowMock.onResized).toHaveBeenCalledTimes(1)
    expect(tauriWindowMock.minimize).toHaveBeenCalledTimes(1)
    expect(tauriWindowMock.toggleMaximize).toHaveBeenCalledTimes(1)
    expect(tauriWindowMock.hide).toHaveBeenCalledTimes(1)
  })

  it('does not render custom window controls on macOS and does not disable decorations', () => {
    platformState.isWindows = false
    platformState.isMac = true

    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(currentConversationIdAtom, null)
    store.set(currentAgentSessionIdAtom, null)
    store.set(tabsAtom, [])
    store.set(activeTabIdAtom, null)

    renderShell(store)

    expect(screen.queryByRole('button', { name: '最小化窗口' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '最大化窗口' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '关闭窗口' })).not.toBeInTheDocument()
  })

  it('does not render custom controls when Tauri window metadata is unavailable', () => {
    tauriInternalsState.enabled = false
    ;(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = undefined

    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(currentConversationIdAtom, null)
    store.set(currentAgentSessionIdAtom, null)
    store.set(tabsAtom, [])
    store.set(activeTabIdAtom, null)

    renderShell(store)

    expect(screen.queryByRole('button', { name: '最小化窗口' })).not.toBeInTheDocument()
    expect(tauriWindowMock.onResized).not.toHaveBeenCalled()
  })

  it('cleans up late resize listeners that resolve after unmount', async () => {
    let resolveUnlisten: ((value: () => void) => void) | null = null
    const unlisten = vi.fn()
    tauriWindowMock.onResized.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveUnlisten = resolve
      }),
    )

    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(currentConversationIdAtom, null)
    store.set(currentAgentSessionIdAtom, null)
    store.set(tabsAtom, [])
    store.set(activeTabIdAtom, null)

    const view = renderShell(store)
    view.unmount()
    resolveUnlisten?.(unlisten)

    await waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1))
  })
})
