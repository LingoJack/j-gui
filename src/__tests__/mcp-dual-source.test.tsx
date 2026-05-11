/**
 * MCP 双数据源界面测试 - Phase B #13
 *
 * 测试 MCP 标签页的数据源选择器在工作区 MCP（完整增删改查）
 * 与 j-cli MCP（只读）视图之间切换的行为。
 */

import * as React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import '@testing-library/jest-dom/vitest'

import { AgentSettings } from '@/components/settings/AgentSettings'
import { agentWorkspacesAtom, currentAgentWorkspaceIdAtom, workspaceCapabilitiesVersionAtom } from '@/atoms/agent-atoms'
import { chatToolsAtom } from '@/atoms/chat-tool-atoms'
import { settingsTabAtom, settingsOpenAtom } from '@/atoms/settings-tab'
import { appModeAtom } from '@/atoms/app-mode'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { AgentWorkspace } from '@jgui/shared'
import { invoke } from '@tauri-apps/api/core'

// ===== 模拟数据 =====

const mockWorkspace: AgentWorkspace = {
  id: 'ws-test',
  name: '测试工作区',
  slug: 'test-workspace',
  createdAt: 0,
  updatedAt: 0,
}

const mockJCliServers = [
  {
    name: 'server-filesystem',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    url: null,
    env: null,
    disabled: false,
  },
  {
    name: 'server-github',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    url: null,
    env: null,
    disabled: true,
  },
  {
    name: 'server-puppeteer',
    transport: 'sse',
    command: null,
    args: null,
    url: 'http://localhost:3000/mcp',
    env: null,
    disabled: false,
  },
]

const mockWorkspaceServers: Record<string, any> = {
  'custom-db': {
    type: 'stdio',
    command: 'uvx',
    args: ['mcp-db-server'],
    enabled: true,
  },
  'custom-api': {
    type: 'http',
    url: 'http://localhost:8080/mcp',
    enabled: false,
  },
}

// ===== IPC 模拟 =====

// 对 setup.ts 中全局模拟的 invoke 使用 vi.mocked()
// 不要重新声明 vi.mock，以免覆盖全局 mock。
const mockInvoke = vi.mocked(invoke)

function setupInvokeMocks(jCliServers: any[] = mockJCliServers, workspaceServers: Record<string, any> = mockWorkspaceServers): void {
  mockInvoke.mockImplementation((cmd: string, args?: any) => {
    switch (cmd) {
      case 'list_mcp_servers':
        return Promise.resolve(jCliServers)
      case 'get_workspace_mcp_config':
        return Promise.resolve({ servers: workspaceServers })
      case 'save_workspace_mcp_config':
        return Promise.resolve(undefined)
      case 'get_workspace_skills':
        return Promise.resolve([])
      case 'get_workspace_skills_dir':
        return Promise.resolve('')
      case 'list_skills':
        return Promise.resolve([])
      case 'scan_global_skills':
        return Promise.resolve([
          { name: 'Global Skill', description: 'From global', source: 'global:.claude/agents/skills/global-skill', dirPath: '/skills/global-skill' },
        ])
      case 'copy_skill_to_workspace':
        return Promise.resolve(undefined)
      case 'list_agent_workspaces':
        return Promise.resolve([mockWorkspace])
      case 'get_settings':
        return Promise.resolve({
          themeMode: 'dark',
          themeStyle: 'default',
          onboardingCompleted: true,
          agentChannelIds: [],
          agentWorkspaceId: null,
          notificationsEnabled: true,
          notificationSoundEnabled: false,
          tutorialBannerDismissed: false,
          archiveAfterDays: 7,
          sendWithCmdEnter: false,
          stickyUserMessageEnabled: true,
        })
      case 'get_chat_tools':
        return Promise.resolve([])
      case 'list_chat_tools':
        return Promise.resolve([])
      default:
        return Promise.reject(new Error(`Unmocked invoke: ${cmd}`))
    }
  })
}

// ===== 测试辅助函数 =====

function createTestStore(): ReturnType<typeof createStore> {
  const store = createStore()
  store.set(agentWorkspacesAtom, [mockWorkspace])
  store.set(currentAgentWorkspaceIdAtom, mockWorkspace.id)
  store.set(workspaceCapabilitiesVersionAtom, 0)
  store.set(chatToolsAtom, [])
  store.set(settingsTabAtom, 'mcp')
  store.set(settingsOpenAtom, true)
  store.set(appModeAtom, 'agent')
  return store
}

async function renderAgentSettings(): Promise<ReturnType<typeof render>> {
  const store = createTestStore()
  const result = render(
    <Provider store={store}>
      <TooltipProvider delayDuration={0}>
        <AgentSettings />
      </TooltipProvider>
    </Provider>,
  )
    // 等待初始数据加载完成
  await waitFor(() => {
    expect(screen.queryByText('加载中...')).not.toBeInTheDocument()
  })
  return result
}

/** 渲染后切换到 MCP 标签页（默认显示技能标签） */
function switchToMcpTab(): void {
  const mcpTabButton = screen.getByRole('button', { name: 'MCP' })
  fireEvent.click(mcpTabButton)
}

// ===== 测试用例 =====

beforeEach(() => {
  vi.clearAllMocks()
  setupInvokeMocks()
})

describe('MCP Dual Source UI', () => {
  it('renders source selector buttons when on MCP tab', async () => {
    await renderAgentSettings()
    await switchToMcpTab()

    expect(screen.getByText('工作区 MCP')).toBeInTheDocument()
    expect(screen.getByText('j-cli MCP')).toBeInTheDocument()
  })

  it('defaults to workspace MCP view', async () => {
    await renderAgentSettings()
    await switchToMcpTab()

    // 工作区视图应显示现有服务器
    expect(screen.getByText('custom-db')).toBeInTheDocument()
    expect(screen.getByText('custom-api')).toBeInTheDocument()
    // 工作区增删改查按钮应可见
    expect(screen.getByText('添加服务器')).toBeInTheDocument()
    expect(screen.getByText('AI 配置')).toBeInTheDocument()
  })

  it('switches to j-cli MCP view and displays servers', async () => {
    await renderAgentSettings()
    await switchToMcpTab()

    // 点击 j-cli MCP 按钮
    fireEvent.click(screen.getByText('j-cli MCP'))

    // j-cli 服务器应可见
    expect(screen.getByText('server-filesystem')).toBeInTheDocument()
    expect(screen.getByText('server-github')).toBeInTheDocument()
    expect(screen.getByText('server-puppeteer')).toBeInTheDocument()

    // 工作区增删改查按钮应隐藏
    expect(screen.queryByText('添加服务器')).not.toBeInTheDocument()
    expect(screen.queryByText('AI 配置')).not.toBeInTheDocument()

    // 禁用的 j-cli 服务器应显示禁用徽标
    expect(screen.getByText('已禁用')).toBeInTheDocument()
  })

  it('shows empty state when j-cli has no servers', async () => {
    setupInvokeMocks([])
    await renderAgentSettings()
    await switchToMcpTab()

    fireEvent.click(screen.getByText('j-cli MCP'))

    expect(screen.getByText('暂无 j-cli MCP 服务器')).toBeInTheDocument()
  })

  it('still shows workspace CRUD when switching back from j-cli view', async () => {
    await renderAgentSettings()
    await switchToMcpTab()

    // 切换到 j-cli 视图
    fireEvent.click(screen.getByText('j-cli MCP'))
    expect(screen.getByText('server-filesystem')).toBeInTheDocument()

    // 切回工作区视图
    fireEvent.click(screen.getByText('工作区 MCP'))
    expect(screen.getByText('custom-db')).toBeInTheDocument()
    expect(screen.getByText('添加服务器')).toBeInTheDocument()
  })

  it('shows transport type badges for j-cli servers', async () => {
    await renderAgentSettings()
    await switchToMcpTab()

    fireEvent.click(screen.getByText('j-cli MCP'))

    // stdio 徽标（前两个服务器）
    const stdioBadges = screen.getAllByText('stdio')
    expect(stdioBadges).toHaveLength(2)

    // SSE 徽标（puppeteer 服务器）
    expect(screen.getByText('SSE')).toBeInTheDocument()
  })

  it('selects imported external skill after importing from global source', async () => {
    await renderAgentSettings()

    fireEvent.click(screen.getByRole('button', { name: '扫描全局' }))

    await waitFor(() => {
      expect(screen.getByText('Global Skill')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '导入到工作区' }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('copy_skill_to_workspace', {
        sourceDir: '/skills/global-skill',
        workspaceSlug: 'test-workspace',
        skillSlug: 'global-skill',
      })
    })
  })
})
