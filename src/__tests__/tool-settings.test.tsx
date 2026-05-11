/**
 * ToolSettings 中 BuiltinToolsSection 的测试
 *
 * 验证 BuiltinToolsSection 能正确使用 list_chat_tools / set_tool_enabled
 * 后端命令渲染工具列表、切换开关、处理加载与错误状态。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BuiltinToolsSection } from '@/components/settings/ToolSettings'
import * as ipc from '@/lib/ipc'
import { toast } from 'sonner'

// 模拟 BuiltinToolsSection 使用的 IPC 模块
vi.mock('@/lib/ipc', () => ({
  listChatTools: vi.fn(),
  setToolEnabled: vi.fn(),
}))

// 为 #21 的错误提示验证模拟 sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

const mockTools: Array<{ name: string; description: string; enabled: boolean }> = [
  { name: 'Bash', description: 'Execute shell commands.', enabled: true },
  { name: 'Read', description: 'Read the contents of a file.', enabled: true },
  { name: 'Write', description: 'Write content to a file.', enabled: false },
  { name: 'Edit', description: 'Edit an existing file with replacement.', enabled: true },
  { name: 'Glob', description: 'Fast file pattern matching tool that works with any codebase size.', enabled: false },
  { name: 'WebFetch', description: 'Fetch content from a URL using HTTP requests.', enabled: true },
  { name: 'WebSearch', description: 'Search the internet for real-time information.', enabled: false },
]

describe('BuiltinToolsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders tool list from listChatTools()', async () => {
    ;(ipc.listChatTools as any).mockResolvedValue(mockTools)

    render(<BuiltinToolsSection />)

    // 等待工具名称渲染
    await waitFor(() => {
      expect(screen.getByText('Bash')).toBeInTheDocument()
    })
    expect(screen.getByText('Read')).toBeInTheDocument()
    expect(screen.getByText('Write')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Glob')).toBeInTheDocument()
    expect(screen.getByText('WebFetch')).toBeInTheDocument()
    expect(screen.getByText('WebSearch')).toBeInTheDocument()
  })

  it('each tool shows name, description, and enabled switch', async () => {
    ;(ipc.listChatTools as any).mockResolvedValue(mockTools)

    render(<BuiltinToolsSection />)

    await waitFor(() => {
      expect(screen.getByText('Bash')).toBeInTheDocument()
    })

    // 描述应可见
    expect(screen.getByText('Execute shell commands.')).toBeInTheDocument()
    expect(screen.getByText('Read the contents of a file.')).toBeInTheDocument()

    // 应渲染开关（role="switch"，来自 Radix）
    const switches = screen.getAllByRole('switch')
    expect(switches.length).toBe(mockTools.length)

    // 已启用工具应为选中状态
    expect(switches[0]).toBeChecked() // Bash: enabled
    expect(switches[1]).toBeChecked() // Read: enabled

    // 已禁用工具不应为选中状态
    expect(switches[2]).not.toBeChecked() // Write: disabled
  })

  it('toggling a tool calls setToolEnabled with correct args', async () => {
    ;(ipc.listChatTools as any).mockResolvedValue(mockTools)
    ;(ipc.setToolEnabled as any).mockResolvedValue(undefined)

    render(<BuiltinToolsSection />)

    await waitFor(() => {
      expect(screen.getByText('Bash')).toBeInTheDocument()
    })

    // 切换 Bash（当前为启用 -> 禁用）
    const switches = screen.getAllByRole('switch')
    fireEvent.click(switches[0])

    expect(ipc.setToolEnabled).toHaveBeenCalledWith('Bash', false)

    // 切换 Write（当前为禁用 -> 启用）
    fireEvent.click(switches[2])

    expect(ipc.setToolEnabled).toHaveBeenCalledWith('Write', true)
  })

  it('shows loading state while fetching', async () => {
    // 返回永不 resolve 的 promise，以维持加载态
    ;(ipc.listChatTools as any).mockImplementation(
      () => new Promise(() => {})
    )

    render(<BuiltinToolsSection />)

    // 加载指示器应立即可见
    expect(screen.getByText('加载工具列表...')).toBeInTheDocument()
  })

  it('shows error state when fetch fails', async () => {
    ;(ipc.listChatTools as any).mockRejectedValue(
      new Error('Failed to fetch tools')
    )

    render(<BuiltinToolsSection />)

    await waitFor(() => {
      expect(screen.getByText(/加载失败/)).toBeInTheDocument()
    })
    expect(screen.getByText(/Failed to fetch tools/)).toBeInTheDocument()
  })

  it('shows error toast when toggle fails (#21 error-toast)', async () => {
    ;(ipc.listChatTools as any).mockResolvedValue(mockTools)
    ;(ipc.setToolEnabled as any).mockRejectedValue(
      new Error('Toggle failed')
    )

    render(<BuiltinToolsSection />)

    await waitFor(() => {
      expect(screen.getByText('Bash')).toBeInTheDocument()
    })

    // 切换工具以触发错误分支
    const switches = screen.getAllByRole('switch')
    fireEvent.click(switches[0])

    // 等待 toast.error 被调用
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
    expect(vi.mocked(toast.error).mock.calls[0][0]).toContain('切换')
  })
})
