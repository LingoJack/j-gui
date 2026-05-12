/**
 * ToolSettings 中 BuiltinToolsSection 的测试
 *
 * 验证 BuiltinToolsSection 能正确使用 list_chat_tools / set_tool_enabled
 * 后端命令渲染工具列表、切换开关、处理加载与错误状态。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { Provider } from 'jotai'
import { BuiltinToolsSection } from '@/components/settings/ToolSettings'
import * as ipc from '@/lib/ipc'
import { toast } from 'sonner'

// 模拟 BuiltinToolsSection 使用的 IPC 模块
vi.mock('@/lib/ipc', () => ({
  getChatTools: vi.fn(),
  updateChatToolState: vi.fn(),
}))

// 为 #21 的错误提示验证模拟 sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

const mockTools = [
  { meta: { id: 'Bash', name: 'Bash', description: 'Execute shell commands.' }, enabled: true, available: true },
  { meta: { id: 'Read', name: 'Read', description: 'Read the contents of a file.' }, enabled: true, available: true },
  { meta: { id: 'Write', name: 'Write', description: 'Write content to a file.' }, enabled: false, available: true },
  { meta: { id: 'Edit', name: 'Edit', description: 'Edit an existing file with replacement.' }, enabled: true, available: true },
  { meta: { id: 'Glob', name: 'Glob', description: 'Fast file pattern matching tool that works with any codebase size.' }, enabled: false, available: true },
  { meta: { id: 'WebFetch', name: 'WebFetch', description: 'Fetch content from a URL using HTTP requests.' }, enabled: true, available: true },
  { meta: { id: 'WebSearch', name: 'WebSearch', description: 'Search the internet for real-time information.' }, enabled: false, available: true },
]

function renderBuiltinToolsSection() {
  return render(
    <Provider>
      <BuiltinToolsSection />
    </Provider>
  )
}

describe('BuiltinToolsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders tool list from listChatTools()', async () => {
    ;(ipc.getChatTools as any).mockResolvedValue(mockTools)

    renderBuiltinToolsSection()

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
    ;(ipc.getChatTools as any).mockResolvedValue(mockTools)

    renderBuiltinToolsSection()

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
    ;(ipc.getChatTools as any).mockResolvedValue(mockTools)
    ;(ipc.updateChatToolState as any).mockResolvedValue(undefined)

    renderBuiltinToolsSection()

    await waitFor(() => {
      expect(screen.getByText('Bash')).toBeInTheDocument()
    })

    // 切换 Bash（当前为启用 -> 禁用）
    const switches = screen.getAllByRole('switch')
    fireEvent.click(switches[0])

    expect(ipc.updateChatToolState).toHaveBeenCalledWith('Bash', { enabled: false })

    // 切换 Write（当前为禁用 -> 启用）
    fireEvent.click(switches[2])

    expect(ipc.updateChatToolState).toHaveBeenCalledWith('Write', { enabled: true })
  })

  it('shows loading state while fetching', async () => {
    // 返回永不 resolve 的 promise，以维持加载态
    ;(ipc.getChatTools as any).mockImplementation(
      () => new Promise(() => {})
    )

    renderBuiltinToolsSection()

    // 加载指示器应立即可见
    expect(screen.getByText('加载工具列表...')).toBeInTheDocument()
  })

  it('shows error state when fetch fails', async () => {
    ;(ipc.getChatTools as any).mockRejectedValue(
      new Error('Failed to fetch tools')
    )

    renderBuiltinToolsSection()

    await waitFor(() => {
      expect(screen.getByText(/加载失败/)).toBeInTheDocument()
    })
    expect(screen.getByText(/Failed to fetch tools/)).toBeInTheDocument()
  })

  it('shows error toast when toggle fails (#21 error-toast)', async () => {
    ;(ipc.getChatTools as any).mockResolvedValue(mockTools)
    ;(ipc.updateChatToolState as any).mockRejectedValue(
      new Error('Toggle failed')
    )

    renderBuiltinToolsSection()

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
