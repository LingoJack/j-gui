/**
 * ToolSettings - BuiltinToolsSection 测试
 *
 * 验证 BuiltinToolsSection 能正确使用 list_chat_tools / set_tool_enabled
 * 后端命令渲染工具列表、切换开关、处理加载与错误状态。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BuiltinToolsSection } from '@/components/settings/ToolSettings'
import * as ipc from '@/lib/ipc'

// Mock the IPC module used by BuiltinToolsSection
vi.mock('@/lib/ipc', () => ({
  listChatTools: vi.fn(),
  setToolEnabled: vi.fn(),
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

    // Wait for tool names to render
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

    // Descriptions should be visible
    expect(screen.getByText('Execute shell commands.')).toBeInTheDocument()
    expect(screen.getByText('Read the contents of a file.')).toBeInTheDocument()

    // Switches should be rendered (role="switch" from Radix)
    const switches = screen.getAllByRole('switch')
    expect(switches.length).toBe(mockTools.length)

    // Enabled tools should be checked
    expect(switches[0]).toBeChecked() // Bash: enabled
    expect(switches[1]).toBeChecked() // Read: enabled

    // Disabled tools should not be checked
    expect(switches[2]).not.toBeChecked() // Write: disabled
  })

  it('toggling a tool calls setToolEnabled with correct args', async () => {
    ;(ipc.listChatTools as any).mockResolvedValue(mockTools)
    ;(ipc.setToolEnabled as any).mockResolvedValue(undefined)

    render(<BuiltinToolsSection />)

    await waitFor(() => {
      expect(screen.getByText('Bash')).toBeInTheDocument()
    })

    // Toggle Bash (currently enabled -> disabled)
    const switches = screen.getAllByRole('switch')
    fireEvent.click(switches[0])

    expect(ipc.setToolEnabled).toHaveBeenCalledWith('Bash', false)

    // Toggle Write (currently disabled -> enabled)
    fireEvent.click(switches[2])

    expect(ipc.setToolEnabled).toHaveBeenCalledWith('Write', true)
  })

  it('shows loading state while fetching', async () => {
    // Return a promise that never resolves to keep loading state
    ;(ipc.listChatTools as any).mockImplementation(
      () => new Promise(() => {})
    )

    render(<BuiltinToolsSection />)

    // Loading indicator should be visible immediately
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
})
