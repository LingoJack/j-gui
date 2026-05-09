/**
 * AliasSettings - 别名设置页测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { AliasSettings } from '@/components/settings/AliasSettings'
import * as ipc from '@/lib/ipc'

// Mock the IPC module used by AliasSettings
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

    // Wait for aliases to load and render
    await waitFor(() => {
      expect(screen.getByText('路径别名')).toBeInTheDocument()
    })
    expect(screen.getByText('内网 URL 别名')).toBeInTheDocument()
    expect(screen.getByText('外网 URL 别名')).toBeInTheDocument()
    expect(screen.getByText('脚本别名')).toBeInTheDocument()

    // Alias names and values should be displayed
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

    // Click the first "添加别名" button
    const addButtons = screen.getAllByText('添加别名')
    fireEvent.click(addButtons[0])

    // Inline form inputs should appear
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

    // Find and click the delete button (it has title="删除")
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

    // Should show add buttons (not loading)
    expect(screen.getAllByText('添加别名').length).toBe(4)
  })
})
