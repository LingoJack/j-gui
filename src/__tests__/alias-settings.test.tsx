/**
 * AliasSettings - 别名设置页测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { AliasSettings } from '@/components/settings/AliasSettings'
import * as ipc from '@/lib/ipc'

// 模拟 AliasSettings 使用的 IPC 模块
vi.mock('@/lib/ipc', () => ({
  listAliases: vi.fn(),
  setAlias: vi.fn(),
  removeAlias: vi.fn(),
}))

describe('AliasSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders section groups with alias items', async () => {
    const mockAliases = [
      { section: 'path', name: 'j', value: '/usr/bin/j' },
      { section: 'inner_url', name: 'dev', value: 'http://localhost:3000' },
      { section: 'outer_url', name: 'prod', value: 'https://example.com' },
      { section: 'script', name: 'deploy', value: './deploy.sh' },
    ]
    ;(ipc.listAliases as any).mockResolvedValue(mockAliases)

    render(<AliasSettings />)

    // 等待别名加载并渲染
    await waitFor(() => {
      expect(screen.getByText('路径别名')).toBeInTheDocument()
    })
    expect(screen.getByText('内网 URL 别名')).toBeInTheDocument()
    expect(screen.getByText('外网 URL 别名')).toBeInTheDocument()
    expect(screen.getByText('脚本别名')).toBeInTheDocument()

    // 应显示别名名称和值
    expect(screen.getByText('j')).toBeInTheDocument()
    expect(screen.getByText('/usr/bin/j')).toBeInTheDocument()
    expect(screen.getByText('dev')).toBeInTheDocument()
    expect(screen.getByText('http://localhost:3000')).toBeInTheDocument()
    expect(screen.getByText('prod')).toBeInTheDocument()
    expect(screen.getByText('https://example.com')).toBeInTheDocument()
    expect(screen.getByText('deploy')).toBeInTheDocument()
    expect(screen.getByText('./deploy.sh')).toBeInTheDocument()
  })

  it('shows inline add form when add button is clicked', async () => {
    ;(ipc.listAliases as any).mockResolvedValue([])

    render(<AliasSettings />)

    await waitFor(() => {
      expect(screen.getByText('路径别名')).toBeInTheDocument()
    })

    // 点击第一个“添加别名”按钮
    const addButtons = screen.getAllByText('添加别名')
    fireEvent.click(addButtons[0])

    // 应出现行内表单输入框
    expect(screen.getByPlaceholderText('别名名称')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('别名值')).toBeInTheDocument()
  })

  it('calls removeAlias after confirmation', async () => {
    const mockAliases = [
      { section: 'path', name: 'j', value: '/usr/bin/j' },
    ]
    ;(ipc.listAliases as any).mockResolvedValue(mockAliases)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<AliasSettings />)

    await waitFor(() => {
      expect(screen.getByText('j')).toBeInTheDocument()
    })

    // 找到并点击删除按钮（其 title 为“删除”）
    const deleteButton = screen.getByTitle('删除')
    fireEvent.click(deleteButton)

    expect(confirmSpy).toHaveBeenCalled()
    expect(ipc.removeAlias).toHaveBeenCalledWith('path', 'j')
  })

  it('handles empty aliases gracefully', async () => {
    ;(ipc.listAliases as any).mockResolvedValue([])

    render(<AliasSettings />)

    await waitFor(() => {
      expect(screen.getByText('路径别名')).toBeInTheDocument()
    })
    expect(screen.getByText('内网 URL 别名')).toBeInTheDocument()
    expect(screen.getByText('外网 URL 别名')).toBeInTheDocument()
    expect(screen.getByText('脚本别名')).toBeInTheDocument()

    // 应显示添加按钮（非加载态）
    expect(screen.getAllByText('添加别名').length).toBe(4)
  })
})
