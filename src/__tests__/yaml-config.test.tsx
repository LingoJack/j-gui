/**
 * YamlConfigSettings - YAML 配置编辑页测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { YamlConfigSettings } from '@/components/settings/YamlConfigSettings'
import * as ipc from '@/lib/ipc'

// Mock the IPC module used by YamlConfigSettings
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

    // Wait for sections to load
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

    // Key names
    expect(screen.getByText('j')).toBeInTheDocument()
    expect(screen.getByText('data')).toBeInTheDocument()
    expect(screen.getByText('dev')).toBeInTheDocument()

    // Values
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

    // Click the value to start editing
    const valueElement = screen.getByText('/usr/bin/j')
    fireEvent.click(valueElement)

    // Input should appear with the value pre-filled
    const input = screen.getByDisplayValue('/usr/bin/j')
    expect(input).toBeInTheDocument()

    // Change the value
    fireEvent.change(input, { target: { value: '/usr/local/bin/j' } })

    // Click save button
    const saveButton = screen.getByTitle('保存')
    fireEvent.click(saveButton)

    // Verify setConfig was called with correct args
    expect(ipc.setConfig).toHaveBeenCalledWith('path', 'j', '/usr/local/bin/j')
  })

  it('cancels edit mode on Escape and restores original value', async () => {
    ;(ipc.getConfig as any).mockResolvedValue(mockConfig)

    render(<YamlConfigSettings />)

    await waitFor(() => {
      expect(screen.getByText('j')).toBeInTheDocument()
    })

    // Click the value to start editing
    const valueElement = screen.getByText('/usr/bin/j')
    fireEvent.click(valueElement)

    // Input should appear
    const input = screen.getByDisplayValue('/usr/bin/j')
    expect(input).toBeInTheDocument()

    // Press Escape
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' })

    // Original value should be back
    expect(screen.getByText('/usr/bin/j')).toBeInTheDocument()
    expect(ipc.setConfig).not.toHaveBeenCalled()
  })
})
