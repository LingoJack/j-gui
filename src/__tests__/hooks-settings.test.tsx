/**
 * HooksSettings - 钩子设置页测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { HooksSettings } from '@/components/settings/HooksSettings'
import * as ipc from '@/lib/ipc'

// Mock the IPC module used by HooksSettings
vi.mock('@/lib/ipc', () => ({
  listHooks: vi.fn(),
}))

const mockHooks = [
  {
    name: 'validate-message',
    event: 'PreSendMessage',
    source: 'builtin',
    hookType: 'builtin',
    label: '消息验证',
    timeout: 5000,
    onError: 'skip',
    uniqueId: 'hook-pre-send-validate',
  },
  {
    name: null,
    event: 'PostLlmResponse',
    source: 'user',
    hookType: 'bash',
    label: 'LLM 响应后处理',
    timeout: null,
    onError: 'stop',
    uniqueId: 'hook-post-llm-bash',
  },
  {
    name: 'log-session',
    event: 'SessionStart',
    source: 'project',
    hookType: 'llm',
    label: '会话日志',
    timeout: 3000,
    onError: null,
    uniqueId: 'hook-session-log',
  },
]

describe('HooksSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders hooks list grouped by event type', async () => {
    ;(ipc.listHooks as any).mockResolvedValue(mockHooks)

    render(<HooksSettings />)

    // Wait for hooks to load
    await waitFor(() => {
      expect(screen.getByText('消息验证')).toBeInTheDocument()
    })

    // Event group headers
    expect(screen.getByText('PreSendMessage')).toBeInTheDocument()
    expect(screen.getByText('PostLlmResponse')).toBeInTheDocument()
    expect(screen.getByText('SessionStart')).toBeInTheDocument()

    // Hook details
    expect(screen.getByText('validate-message')).toBeInTheDocument()
    expect(screen.getAllByText('builtin').length).toBe(2)
    expect(screen.getByText('LLM 响应后处理')).toBeInTheDocument()
    expect(screen.getByText('user')).toBeInTheDocument()
    expect(screen.getByText('bash')).toBeInTheDocument()
  })

  it('displays hook metadata (timeout, onError)', async () => {
    ;(ipc.listHooks as any).mockResolvedValue(mockHooks)

    render(<HooksSettings />)

    await waitFor(() => {
      expect(screen.getByText('消息验证')).toBeInTheDocument()
    })

    // Timeout values — use regex to match across text nodes
    expect(screen.getByText(/超时: 5000ms/)).toBeInTheDocument()
    expect(screen.getByText(/超时: 3000ms/)).toBeInTheDocument()

    // onError values — use regex since text is inside "出错: ..." span
    expect(screen.getByText(/出错: skip/)).toBeInTheDocument()
    expect(screen.getByText(/出错: stop/)).toBeInTheDocument()
  })

  it('shows empty state when no hooks registered', async () => {
    ;(ipc.listHooks as any).mockResolvedValue([])

    render(<HooksSettings />)

    await waitFor(() => {
      expect(screen.getByText('暂无已注册的钩子')).toBeInTheDocument()
    })
    expect(screen.getByText(/尚未注册任何钩子/)).toBeInTheDocument()
  })

  it('handles multiple hooks in the same event group', async () => {
    const multiHooks = [
      { ...mockHooks[0] },
      {
        name: 'check-format',
        event: 'PreSendMessage',
        source: 'user',
        hookType: 'bash',
        label: '格式检查',
        timeout: 1000,
        onError: 'skip',
        uniqueId: 'hook-format-check',
      },
    ]
    ;(ipc.listHooks as any).mockResolvedValue(multiHooks)

    render(<HooksSettings />)

    await waitFor(() => {
      expect(screen.getByText('格式检查')).toBeInTheDocument()
    })
    expect(screen.getByText('消息验证')).toBeInTheDocument()
    // Both hooks in PreSendMessage
    expect(screen.getByText('validate-message')).toBeInTheDocument()
    expect(screen.getByText('check-format')).toBeInTheDocument()
  })
})
