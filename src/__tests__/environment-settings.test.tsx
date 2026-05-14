import * as React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'

import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { EnvironmentSettings } from '@/components/settings/EnvironmentSettings'
import { appModeAtom } from '@/atoms/app-mode'
import { settingsTabAtom } from '@/atoms/settings-tab'
import type { RuntimeStatus } from '@jgui/shared'
import * as ipc from '@/lib/ipc'

const runtimeStatus: RuntimeStatus = {
  node: { available: true, version: 'v22.0.0', path: '/usr/bin/node', error: null },
  bun: {
    available: true,
    version: '1.3.14',
    path: '/usr/bin/bun',
    source: 'system',
    error: null,
  },
  git: { available: true, version: '2.45.0', path: '/usr/bin/git', error: null },
  shell: {
    platform: 'linux',
    current: {
      family: 'zsh',
      available: true,
      path: '/bin/zsh',
      version: '5.9',
      source: 'env',
      error: null,
    },
    recommended: 'bash',
    fallbackOrder: ['bash', 'zsh', 'fish', 'sh'],
    windows: null,
    posix: {
      current: {
        family: 'zsh',
        available: true,
        path: '/bin/zsh',
        version: '5.9',
        source: 'env',
        error: null,
      },
      candidates: [
        {
          family: 'bash',
          available: true,
          path: '/bin/bash',
          version: '5.2',
          source: 'path-scan',
          error: null,
        },
        {
          family: 'fish',
          available: false,
          path: null,
          version: null,
          source: 'path-scan',
          error: 'missing',
        },
      ],
      recommended: 'bash',
    },
  },
  envLoaded: true,
  initializedAt: 1_715_000_000_000,
}

vi.mock('@/lib/ipc', () => ({
  getRuntimeStatus: vi.fn(async () => runtimeStatus),
  reinitRuntime: vi.fn(async () => undefined),
  updateSettings: vi.fn(async (updates: Record<string, unknown>) => updates),
  listChannels: vi.fn(async () => []),
}))

describe('Environment settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ipc.getRuntimeStatus).mockResolvedValue(runtimeStatus)
    vi.mocked(ipc.reinitRuntime).mockResolvedValue(undefined)
  })

  it('shows the environment tab in settings navigation', () => {
    const store = createStore()
    store.set(appModeAtom, 'chat')
    store.set(settingsTabAtom, 'channels')

    render(
      <Provider store={store}>
        <SettingsPanel />
      </Provider>,
    )

    expect(screen.getByRole('button', { name: '环境配置' })).toBeInTheDocument()
  })

  it('renders runtime truth and refreshes in place', async () => {
    render(<EnvironmentSettings />)

    await waitFor(() => {
      expect(ipc.getRuntimeStatus).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByText('Node.js')).toBeInTheDocument()
    expect(screen.getByText('Shell 真相')).toBeInTheDocument()
    expect(screen.getByText('bash → zsh → fish → sh')).toBeInTheDocument()
    expect(screen.getByText('zsh | /bin/zsh | 5.9')).toBeInTheDocument()
    expect(screen.getByText('POSIX shell 明细')).toBeInTheDocument()
    expect(screen.getAllByText('missing').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: '重新检测' }))

    await waitFor(() => {
      expect(ipc.reinitRuntime).toHaveBeenCalledTimes(1)
      expect(ipc.getRuntimeStatus).toHaveBeenCalledTimes(2)
    })
  })

  it('shows explicit failure reason for missing current shell', async () => {
    vi.mocked(ipc.getRuntimeStatus).mockResolvedValueOnce({
      ...runtimeStatus,
      shell: {
        ...runtimeStatus.shell,
        current: {
          family: 'unknown',
          available: false,
          path: null,
          version: null,
          source: 'env',
          error: 'SHELL 环境变量缺失',
        },
      },
    })

    render(<EnvironmentSettings />)

    await waitFor(() => {
      expect(screen.getByText('SHELL 环境变量缺失')).toBeInTheDocument()
    })
  })
})
