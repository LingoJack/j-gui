/**
 * HooksSettings - 钩子设置页测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { HooksSettings } from '@/components/settings/HooksSettings'
import * as ipc from '@/lib/ipc'

// 模拟 HooksSettings 使用的 IPC 模块
vi.mock('@/lib/ipc', () => ({
  listHooks: vi.fn(),
  toggleHook: vi.fn(),
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
    enabled: true,
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
    enabled: false,
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
    enabled: false,
  },
]

describe('HooksSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders hooks list grouped by event type', async () => {
    ;(ipc.listHooks as any).mockResolvedValue(mockHooks)

    render(<HooksSettings />)

    // 等待钩子加载完成
    await waitFor(() => {
      expect(screen.getByText('消息验证')).toBeInTheDocument()
    })

    // 事件分组标题（标题本身，不是筛选下拉项）
    expect(screen.getByRole('heading', { name: 'PreSendMessage' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'PostLlmResponse' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'SessionStart' })).toBeInTheDocument()

    // 钩子详情
    expect(screen.getByText('validate-message')).toBeInTheDocument()
    expect(screen.getByText('LLM 响应后处理')).toBeInTheDocument()
    // “user”和“builtin”应显示为来源徽标与筛选项
    expect(screen.getAllByText('user').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('bash')).toBeInTheDocument()
  })

  it('displays hook metadata (timeout, onError)', async () => {
    ;(ipc.listHooks as any).mockResolvedValue(mockHooks)

    render(<HooksSettings />)

    await waitFor(() => {
      expect(screen.getByText('消息验证')).toBeInTheDocument()
    })

    // 超时值 - 使用正则跨文本节点匹配
    expect(screen.getByText(/超时: 5000ms/)).toBeInTheDocument()
    expect(screen.getByText(/超时: 3000ms/)).toBeInTheDocument()

    // onError 的值需要用正则匹配，因为文本位于“出错: ...”节点内
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
        enabled: true,
      },
    ]
    ;(ipc.listHooks as any).mockResolvedValue(multiHooks)

    render(<HooksSettings />)

    await waitFor(() => {
      expect(screen.getByText('格式检查')).toBeInTheDocument()
    })
    expect(screen.getByText('消息验证')).toBeInTheDocument()
    // PreSendMessage 分组中的两个钩子
    expect(screen.getByText('validate-message')).toBeInTheDocument()
    expect(screen.getByText('check-format')).toBeInTheDocument()
  })
})
