import * as React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { appModeAtom } from '@/atoms/app-mode'
import { sendWithCmdEnterAtom, shortcutOverridesAtom } from '@/atoms/shortcut-atoms'
import { settingsTabAtom } from '@/atoms/settings-tab'
import * as ipc from '@/lib/ipc'

vi.mock('@/lib/ipc', () => ({
  updateSettings: vi.fn(async (updates: Record<string, unknown>) => updates),
  listChannels: vi.fn(async () => []),
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
    store.set(shortcutOverridesAtom, {})

    render(
      <Provider store={store}>
        <SettingsPanel />
      </Provider>,
    )

    expect(screen.getAllByText('快捷键管理').length).toBeGreaterThan(0)
    expect(screen.getByText('发送 / 换行快捷键')).toBeInTheDocument()
    expect(screen.queryByText('快速任务')).not.toBeInTheDocument()
    expect(screen.queryByText('显示主窗口')).not.toBeInTheDocument()
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

  it('falls back to a visible tab when agent settings is not available in chat mode', async () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(settingsTabAtom, 'agent')
    store.set(sendWithCmdEnterAtom, false)
    store.set(shortcutOverridesAtom, {})

    render(
      <Provider store={store}>
        <SettingsPanel />
      </Provider>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('模型配置').length).toBeGreaterThan(0)
    })
  })
})
