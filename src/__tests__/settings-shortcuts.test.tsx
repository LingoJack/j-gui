import * as React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { appModeAtom } from '@/atoms/app-mode'
import { sendWithCmdEnterAtom, shortcutOverridesAtom, globalShortcutStateAtom } from '@/atoms/shortcut-atoms'
import { settingsTabAtom } from '@/atoms/settings-tab'
import * as globalShortcutManager from '@/lib/global-shortcut-manager'
import * as ipc from '@/lib/ipc'

vi.mock('@/lib/ipc', () => ({
  updateSettings: vi.fn(async (updates: Record<string, unknown>) => updates),
  listChannels: vi.fn(async () => []),
}))

vi.mock('@/lib/global-shortcut-manager', () => ({
  probeGlobalShortcutRegistration: vi.fn(async () => ({
    accelerator: 'Ctrl+Shift+P',
    success: true,
  })),
  setGlobalShortcutHandlingSuspended: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('SettingsPanel shortcuts integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the shortcuts entry and persists send key changes through settings IPC', async () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(settingsTabAtom, 'shortcuts')
    store.set(sendWithCmdEnterAtom, false)
    store.set(shortcutOverridesAtom, {
      'open-settings': {
        win: 'Ctrl+Alt+,',
      },
    })
    store.set(globalShortcutStateAtom, {})

    render(
      <Provider store={store}>
        <SettingsPanel />
      </Provider>,
    )

    expect(screen.getAllByText('快捷键管理').length).toBeGreaterThan(0)
    expect(screen.getByText('发送 / 换行快捷键')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /恢复全部默认/ })).toBeInTheDocument()
    expect(screen.queryByText('快速任务')).not.toBeInTheDocument()
    expect(screen.getByText('显示主窗口')).toBeInTheDocument()
    expect(screen.queryByText('暂不可改')).not.toBeInTheDocument()
    expect(screen.queryByText('语音输入')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ctrl+Enter 发送' }))

    await waitFor(() => {
      expect(ipc.updateSettings).toHaveBeenCalledWith({ sendWithCmdEnter: true })
    })
  })

  it('keeps modifier-only recordings unsavable', async () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(settingsTabAtom, 'shortcuts')
    store.set(sendWithCmdEnterAtom, false)
    store.set(shortcutOverridesAtom, {})
    store.set(globalShortcutStateAtom, {})

    render(
      <Provider store={store}>
        <SettingsPanel />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ctrl+,' }))
    fireEvent.keyDown(window, { key: 'Control', ctrlKey: true })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
    })
  })

  it('saves a recorded shortcut when pressing enter', async () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(settingsTabAtom, 'shortcuts')
    store.set(sendWithCmdEnterAtom, false)
    store.set(shortcutOverridesAtom, {})
    store.set(globalShortcutStateAtom, {})

    render(
      <Provider store={store}>
        <SettingsPanel />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ctrl+,' }))
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => {
      expect(ipc.updateSettings).toHaveBeenCalledWith({
        shortcutOverrides: {
          'open-settings': {
            win: 'Ctrl+J',
          },
        },
      })
    })
  })

  it('falls back to a visible tab when agent settings is not available in chat mode', async () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(settingsTabAtom, 'agent')
    store.set(sendWithCmdEnterAtom, false)
    store.set(shortcutOverridesAtom, {})
    store.set(globalShortcutStateAtom, {})

    render(
      <Provider store={store}>
        <SettingsPanel />
      </Provider>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('模型配置').length).toBeGreaterThan(0)
    })
  })

  it('shows a visible conflict warning for global shortcut failures', async () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(settingsTabAtom, 'shortcuts')
    store.set(sendWithCmdEnterAtom, false)
    store.set(shortcutOverridesAtom, {})
    store.set(globalShortcutStateAtom, {
      'show-main-window': {
        accelerator: 'Ctrl+Shift+P',
        status: 'conflict',
        detail: 'shortcut already registered',
      },
    })

    render(
      <Provider store={store}>
        <SettingsPanel />
      </Provider>,
    )

    expect(screen.getByText(/当前与系统或其他应用冲突，已自动停用/)).toBeInTheDocument()
  })

  it('does not persist a conflicting global shortcut when registration probe fails', async () => {
    vi.mocked(globalShortcutManager.probeGlobalShortcutRegistration).mockResolvedValueOnce({
      accelerator: 'Ctrl+Shift+H',
      success: false,
      reason: 'shortcut already registered',
    })

    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(settingsTabAtom, 'shortcuts')
    store.set(sendWithCmdEnterAtom, false)
    store.set(shortcutOverridesAtom, {})
    store.set(globalShortcutStateAtom, {})

    render(
      <Provider store={store}>
        <SettingsPanel />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ctrl+Shift+P' }))
    fireEvent.keyDown(window, { key: 'h', ctrlKey: true, shiftKey: true })
    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => {
      expect(globalShortcutManager.probeGlobalShortcutRegistration).toHaveBeenCalledWith('Ctrl+Shift+H')
    })
    expect(ipc.updateSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({
        shortcutOverrides: expect.objectContaining({
          'show-main-window': expect.anything(),
        }),
      }),
    )
    expect(store.get(globalShortcutStateAtom)['show-main-window']?.status).toBe('conflict')
  })
})
