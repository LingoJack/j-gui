import * as React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { AppShell } from '@/components/app-shell/AppShell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { appModeAtom } from '@/atoms/app-mode'
import { agentSidePanelOpenMapAtom, currentAgentSessionIdAtom } from '@/atoms/agent-atoms'
import { currentConversationIdAtom } from '@/atoms/chat-atoms'
import { activeTabIdAtom, sidebarCollapsedAtom, tabsAtom } from '@/atoms/tab-atoms'

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
const mainAreaRenderMock = vi.hoisted(() => vi.fn())

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
  COLLAPSED_SIDEBAR_WIDTH: 48,
  DEFAULT_EXPANDED_SIDEBAR_WIDTH: 280,
  LeftSidebar: () => <div data-testid="left-sidebar" />,
  SIDEBAR_VISUAL_TRANSITION_MS: 200,
}))

vi.mock('@/components/app-shell/RightSidePanel', () => ({
  RightSidePanel: ({ sessionId }: { sessionId: string }) => <div data-testid="right-side-panel">{sessionId}</div>,
}))

vi.mock('@/components/tabs/MainArea', () => ({
  MainArea: () => {
    mainAreaRenderMock()
    return <div data-testid="main-area" />
  },
}))

function renderShell(store: ReturnType<typeof createStore>) {
  return render(
    <Provider store={store}>
      <TooltipProvider>
        <AppShell contextValue={{}} />
      </TooltipProvider>
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
    mainAreaRenderMock.mockClear()
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

  it('keeps the window controls floating at the app shell top-right when the right panel is collapsed', () => {
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

    const rightPanel = screen.getByTestId('right-side-panel')
    expect(rightPanel).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '最小化窗口' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '最小化窗口' }).closest('.tabbar-bg')).not.toBeNull()
    const controlsHost = document.querySelector('[data-window-controls-host="true"]')
    expect(controlsHost?.closest('[data-app-shell-layout="true"]')).not.toBeNull()
    expect(controlsHost?.closest('[data-main-content-slot="true"]')).toBeNull()
    expect(controlsHost?.closest('[data-right-panel-slot="true"]')).toBeNull()
  })

  it('keeps the window controls floating at the app shell top-right when the right panel is open', () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(currentConversationIdAtom, 'chat-1')
    store.set(currentAgentSessionIdAtom, null)
    store.set(tabsAtom, [
      { id: 'tab-chat-1', type: 'chat', sessionId: 'chat-1', title: 'Chat 1' },
    ])
    store.set(activeTabIdAtom, 'tab-chat-1')
    store.set(agentSidePanelOpenMapAtom, new Map([['chat-1', true]]))

    renderShell(store)

    expect(screen.getByTestId('right-side-panel')).toBeInTheDocument()
    const controlsHost = document.querySelector('[data-window-controls-host="true"]')
    expect(controlsHost?.closest('[data-app-shell-layout="true"]')).not.toBeNull()
    expect(controlsHost?.closest('[data-main-content-slot="true"]')).toBeNull()
    expect(controlsHost?.closest('[data-right-panel-slot="true"]')).toBeNull()
  })

  it('keeps the same right panel subtree mounted when toggling the panel open state', async () => {
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

    const initialPanel = screen.getByTestId('right-side-panel')

    await act(async () => {
      store.set(agentSidePanelOpenMapAtom, new Map([['chat-1', true]]))
    })

    expect(screen.getByTestId('right-side-panel')).toBe(initialPanel)
  })

  it('keeps the right panel slot at full column height without inserting an extra top strip', () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(currentConversationIdAtom, 'chat-1')
    store.set(currentAgentSessionIdAtom, null)
    store.set(tabsAtom, [
      { id: 'tab-chat-1', type: 'chat', sessionId: 'chat-1', title: 'Chat 1' },
    ])
    store.set(activeTabIdAtom, 'tab-chat-1')
    store.set(agentSidePanelOpenMapAtom, new Map([['chat-1', true]]))

    renderShell(store)

    const slot = screen.getByTestId('right-side-panel').closest('[data-right-panel-slot="true"]')
    expect(slot?.querySelector('.titlebar-drag-region')).toBeNull()
  })

  it('drives left, main, and right column movement from the app shell grid', () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(currentConversationIdAtom, 'chat-1')
    store.set(currentAgentSessionIdAtom, null)
    store.set(tabsAtom, [
      { id: 'tab-chat-1', type: 'chat', sessionId: 'chat-1', title: 'Chat 1' },
    ])
    store.set(activeTabIdAtom, 'tab-chat-1')
    store.set(agentSidePanelOpenMapAtom, new Map([['chat-1', true]]))

    renderShell(store)

    const shell = screen.getByTestId('main-area').closest('[data-app-shell-layout="true"]')
    expect(shell).toHaveClass('grid')
    expect(shell).toHaveClass('transition-[grid-template-columns]')
    expect(shell).toHaveAttribute('style', expect.stringContaining('grid-template-columns: 288px minmax(0, 1fr) 328px'))

    const mainArea = screen.getByTestId('main-area')
    const mainSlot = mainArea.parentElement
    expect(mainSlot).toHaveClass('overflow-hidden')
    expect(mainSlot).not.toHaveClass('flex-1')
    expect(mainSlot).not.toHaveClass('h-full')

    act(() => {
      store.set(sidebarCollapsedAtom, true)
    })

    expect(shell).toHaveAttribute('style', expect.stringContaining('grid-template-columns: 56px minmax(0, 1fr) 328px'))
  })

  it('keeps the left sidebar on a width transition instead of FLIP translation for shell movement', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/app-shell/LeftSidebar.tsx'), 'utf8')
    expect(source).toContain('transition-[width,min-width]')
    expect(source).not.toContain('useLayoutFlipTransition')
  })

  it('does not rerender the main conversation tree when only the left sidebar collapses', () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(currentConversationIdAtom, 'chat-1')
    store.set(currentAgentSessionIdAtom, null)
    store.set(sidebarCollapsedAtom, false)
    store.set(tabsAtom, [
      { id: 'tab-chat-1', type: 'chat', sessionId: 'chat-1', title: 'Chat 1' },
    ])
    store.set(activeTabIdAtom, 'tab-chat-1')
    store.set(agentSidePanelOpenMapAtom, new Map([['chat-1', true]]))

    renderShell(store)
    expect(mainAreaRenderMock).toHaveBeenCalledTimes(1)

    act(() => {
      store.set(sidebarCollapsedAtom, true)
    })

    expect(mainAreaRenderMock).toHaveBeenCalledTimes(1)
  })

  it('reserves enough tabbar space for the top-right window controls', () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(currentConversationIdAtom, 'chat-1')
    store.set(currentAgentSessionIdAtom, null)
    store.set(tabsAtom, [
      { id: 'tab-chat-1', type: 'chat', sessionId: 'chat-1', title: 'Chat 1' },
    ])
    store.set(activeTabIdAtom, 'tab-chat-1')

    renderShell(store)

    const source = readFileSync(resolve(process.cwd(), 'src/components/tabs/TabBar.tsx'), 'utf8')
    expect(source).toContain('pr-[192px]')
  })

  it('does not keep the right panel slot open when switching to a tab whose panel is closed', async () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(currentConversationIdAtom, 'chat-1')
    store.set(currentAgentSessionIdAtom, null)
    store.set(sidebarCollapsedAtom, false)
    store.set(tabsAtom, [
      { id: 'chat-1', type: 'chat', sessionId: 'chat-1', title: 'Chat 1' },
      { id: 'chat-2', type: 'chat', sessionId: 'chat-2', title: 'Chat 2' },
    ])
    store.set(activeTabIdAtom, 'chat-1')
    store.set(agentSidePanelOpenMapAtom, new Map([
      ['chat-1', true],
      ['chat-2', false],
    ]))

    renderShell(store)

    const shell = screen.getByTestId('right-side-panel').closest('[data-app-shell-layout="true"]')
    expect(shell).toHaveAttribute('style', expect.stringContaining('grid-template-columns: 288px minmax(0, 1fr) 328px'))

    await act(async () => {
      store.set(currentConversationIdAtom, 'chat-2')
      store.set(activeTabIdAtom, 'chat-2')
    })

    await waitFor(() => expect(shell).toHaveAttribute('style', expect.stringContaining('grid-template-columns: 288px minmax(0, 1fr) 0px')))
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
