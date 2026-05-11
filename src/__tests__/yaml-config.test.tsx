/**
 * YamlConfigSettings - YAML 配置编辑页测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { YamlConfigSettings } from '@/components/settings/YamlConfigSettings'
import * as ipc from '@/lib/ipc'

// 模拟 YamlConfigSettings 使用的 IPC 模块
vi.mock('@/lib/ipc', () => ({
  getConfig: vi.fn(),
  setConfig: vi.fn(),
}))

const mockConfig = {
  sections: {
    path: { j: '/usr/bin/j', data: '/var/data' },
    inner_url: { dev: 'http://localhost:3000' },
    script: {},
  },
}

describe('YamlConfigSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders sections from getConfig()', async () => {
    ;(ipc.getConfig as any).mockResolvedValue(mockConfig)

    render(<YamlConfigSettings />)

    // 等待分组加载完成
    await waitFor(() => {
      expect(screen.getByText('path')).toBeInTheDocument()
    })
    expect(screen.getByText('inner_url')).toBeInTheDocument()
    expect(screen.getByText('script')).toBeInTheDocument()
  })

  it('displays key-value pairs within each section', async () => {
    ;(ipc.getConfig as any).mockResolvedValue(mockConfig)

    render(<YamlConfigSettings />)

    await waitFor(() => {
      expect(screen.getByText('j')).toBeInTheDocument()
    })

    // 键名
    expect(screen.getByText('j')).toBeInTheDocument()
    expect(screen.getByText('data')).toBeInTheDocument()
    expect(screen.getByText('dev')).toBeInTheDocument()

    // 值
    expect(screen.getByText('/usr/bin/j')).toBeInTheDocument()
    expect(screen.getByText('/var/data')).toBeInTheDocument()
    expect(screen.getByText('http://localhost:3000')).toBeInTheDocument()
  })

  it('shows empty state for sections with no keys', async () => {
    ;(ipc.getConfig as any).mockResolvedValue(mockConfig)

    render(<YamlConfigSettings />)

    await waitFor(() => {
      expect(screen.getByText('暂无配置项')).toBeInTheDocument()
    })
  })

  it('activates edit mode on value click and saves via setConfig()', async () => {
    ;(ipc.getConfig as any).mockResolvedValue(mockConfig)
    ;(ipc.setConfig as any).mockResolvedValue(undefined)

    render(<YamlConfigSettings />)

    await waitFor(() => {
      expect(screen.getByText('j')).toBeInTheDocument()
    })

    // 点击值以开始编辑
    const valueElement = screen.getByText('/usr/bin/j')
    fireEvent.click(valueElement)

    // 应出现已预填当前值的输入框
    const input = screen.getByDisplayValue('/usr/bin/j')
    expect(input).toBeInTheDocument()

    // 修改值
    fireEvent.change(input, { target: { value: '/usr/local/bin/j' } })

    // 点击保存按钮
    const saveButton = screen.getByTitle('保存')
    fireEvent.click(saveButton)

    // 验证 setConfig 以正确参数调用
    expect(ipc.setConfig).toHaveBeenCalledWith('path', 'j', '/usr/local/bin/j')
  })

  it('cancels edit mode on Escape and restores original value', async () => {
    ;(ipc.getConfig as any).mockResolvedValue(mockConfig)

    render(<YamlConfigSettings />)

    await waitFor(() => {
      expect(screen.getByText('j')).toBeInTheDocument()
    })

    // 点击值以开始编辑
    const valueElement = screen.getByText('/usr/bin/j')
    fireEvent.click(valueElement)

    // 应出现输入框
    const input = screen.getByDisplayValue('/usr/bin/j')
    expect(input).toBeInTheDocument()

    // 按下 Escape
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' })

    // 原始值应恢复显示
    expect(screen.getByText('/usr/bin/j')).toBeInTheDocument()
    expect(ipc.setConfig).not.toHaveBeenCalled()
  })
})
