import { describe, it, expect, vi } from 'vitest'
import * as ipc from '@/lib/ipc'

describe('IPC module — settings', () => {
  it('getSettings returns default settings when Tauri is unavailable', async () => {
    const settings = await ipc.getSettings()
    expect(settings).toBeDefined()
    expect(settings.themeMode).toBe('dark')
    expect(settings.onboardingCompleted).toBe(true)
  })

  it('updateSettings merges updates locally when Tauri is unavailable', async () => {
    const result = await ipc.updateSettings({ themeMode: 'light' })
    expect(result.themeMode).toBe('light')
  })

  it('getSettings after update returns cached value', async () => {
    const s = await ipc.getSettings()
    expect(s.themeMode).toBe('light')
  })
})

describe('IPC module — channels', () => {
  it('listChannels returns empty array as fallback', async () => {
    const channels = await ipc.listChannels()
    expect(Array.isArray(channels)).toBe(true)
  })

  it('testChannelDirect returns not-implemented fallback', async () => {
    const result = await ipc.testChannelDirect({ apiBase: '', apiKey: '' })
    expect(result).toHaveProperty('success')
  })
})

describe('IPC module — conversations', () => {
  it('listConversations returns empty array as fallback', async () => {
    const convs = await ipc.listConversations()
    expect(Array.isArray(convs)).toBe(true)
  })

  it('createConversation throws when Tauri is unavailable', async () => {
    await expect(ipc.createConversation()).rejects.toThrow()
  })
})

describe('IPC module — agent', () => {
  it('listAgentSessions returns empty array as fallback', async () => {
    const sessions = await ipc.listAgentSessions()
    expect(Array.isArray(sessions)).toBe(true)
  })

  it('onAgentStreamEvent registers and returns cleanup', () => {
    const cb = vi.fn()
    const cleanup = ipc.onAgentStreamEvent(cb)
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  it('sendAgentMessage fails gracefully without Tauri', async () => {
    // Should not throw
    await expect(ipc.sendAgentMessage({ sessionId: 'test', content: 'hello' })).resolves.toBeUndefined()
  })
})

describe('IPC module — event subscriptions', () => {
  it('onStreamChunk registers callback', () => {
    const cb = vi.fn()
    const cleanup = ipc.onStreamChunk(cb)
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  it('onStreamComplete registers callback', () => {
    const cb = vi.fn()
    const cleanup = ipc.onStreamComplete(cb)
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  it('onStreamError registers callback', () => {
    const cb = vi.fn()
    const cleanup = ipc.onStreamError(cb)
    expect(typeof cleanup).toBe('function')
    cleanup()
  })
})

describe('IPC module — user profile', () => {
  it('getUserProfile returns default profile', async () => {
    const profile = await ipc.getUserProfile()
    expect(profile.userName).toBe('User')
    expect(profile.avatar).toBeDefined()
  })
})

describe('IPC module — agent workspaces', () => {
  it('listAgentWorkspaces returns empty array as fallback', async () => {
    const ws = await ipc.listAgentWorkspaces()
    expect(Array.isArray(ws)).toBe(true)
  })
})
