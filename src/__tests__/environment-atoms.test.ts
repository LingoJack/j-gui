import { describe, expect, it } from 'vitest'
import { createStore } from 'jotai'

import { isShellEnvironmentOkAtom, runtimeStatusAtom } from '@/atoms/environment'
import type { RuntimeStatus } from '@jgui/shared'

function buildRuntimeStatus(overrides: Partial<RuntimeStatus['shell']>): RuntimeStatus {
  return {
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
      current: null,
      recommended: 'bash',
      fallbackOrder: ['bash', 'zsh', 'fish', 'sh'],
      windows: null,
      posix: {
        current: null,
        candidates: [],
        recommended: 'bash',
      },
      ...overrides,
    },
    envLoaded: false,
    initializedAt: Date.now(),
  }
}

describe('environment atoms', () => {
  it('treats missing posix shell candidates as not ready', () => {
    const store = createStore()
    store.set(runtimeStatusAtom, buildRuntimeStatus({}))
    expect(store.get(isShellEnvironmentOkAtom)).toBe(false)
  })

  it('accepts available current shell on posix', () => {
    const store = createStore()
    store.set(
      runtimeStatusAtom,
      buildRuntimeStatus({
        current: {
          family: 'zsh',
          available: true,
          path: '/bin/zsh',
          version: '5.9',
          source: 'env',
          error: null,
        },
      }),
    )
    expect(store.get(isShellEnvironmentOkAtom)).toBe(true)
  })

  it('accepts available windows fallback shell', () => {
    const store = createStore()
    store.set(
      runtimeStatusAtom,
      buildRuntimeStatus({
        platform: 'win32',
        recommended: 'powershell',
        fallbackOrder: ['git-bash', 'wsl', 'powershell', 'cmd'],
        current: null,
        posix: null,
        windows: {
          powershell: {
            family: 'powershell',
            available: true,
            path: 'C:/Program Files/PowerShell/7/pwsh.exe',
            version: '7.5.0',
            source: 'path-scan',
            error: null,
          },
          cmd: {
            family: 'cmd',
            available: true,
            path: 'C:/Windows/System32/cmd.exe',
            version: '10.0.26100.1',
            source: 'env',
            error: null,
          },
          gitBash: {
            family: 'git-bash',
            available: false,
            path: null,
            version: null,
            source: 'unknown',
            error: 'missing',
          },
          wsl: {
            available: false,
            version: null,
            defaultDistro: null,
            distros: [],
            error: 'missing',
          },
          recommended: 'powershell',
        },
      }),
    )
    expect(store.get(isShellEnvironmentOkAtom)).toBe(true)
  })

  it('treats broken current posix shell as not ready without available candidates', () => {
    const store = createStore()
    store.set(
      runtimeStatusAtom,
      buildRuntimeStatus({
        current: {
          family: 'zsh',
          available: false,
          path: '/broken/zsh',
          version: null,
          source: 'env',
          error: 'SHELL 指向的默认 shell 路径不存在',
        },
      }),
    )
    expect(store.get(isShellEnvironmentOkAtom)).toBe(false)
  })
})
