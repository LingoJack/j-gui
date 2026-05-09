/**
 * MCP Dual Source UI — Phase B #13
 *
 * Tests for the MCP tab source selector that switches between
 * workspace MCP (full CRUD) and j-cli MCP (read-only) views.
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
import type { AgentWorkspace } from '@proma/shared'

// ===== Mock Data =====

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

// ===== IPC Mock =====

// We mock the full @tauri-apps/api/core module here to override the
// global mock from setup.ts. Since vi.mock is hoisted, this takes
// effect before any imports.
const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
  Channel: class {
    onmessage: ((event: any) => void) | null = null
  },
}))

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

// ===== Test Helpers =====

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
  // Wait for initial loadData to complete
  await waitFor(() => {
    expect(screen.queryByText('加载中...')).not.toBeInTheDocument()
  })
  return result
}

/** Switch to the MCP tab after rendering (Skills tab is default) */
function switchToMcpTab(): void {
  const mcpTabButton = screen.getByRole('button', { name: 'MCP' })
  fireEvent.click(mcpTabButton)
}

// ===== Tests =====

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

    // Workspace view should show existing servers
    expect(screen.getByText('custom-db')).toBeInTheDocument()
    expect(screen.getByText('custom-api')).toBeInTheDocument()
    // Workspace CRUD buttons should be visible
    expect(screen.getByText('添加服务器')).toBeInTheDocument()
    expect(screen.getByText('AI 配置')).toBeInTheDocument()
  })

  it('switches to j-cli MCP view and displays servers', async () => {
    await renderAgentSettings()
    await switchToMcpTab()

    // Click j-cli MCP button
    fireEvent.click(screen.getByText('j-cli MCP'))

    // j-cli servers should be visible
    expect(screen.getByText('server-filesystem')).toBeInTheDocument()
    expect(screen.getByText('server-github')).toBeInTheDocument()
    expect(screen.getByText('server-puppeteer')).toBeInTheDocument()

    // Workspace CRUD buttons should be hidden
    expect(screen.queryByText('添加服务器')).not.toBeInTheDocument()
    expect(screen.queryByText('AI 配置')).not.toBeInTheDocument()

    // j-cli disabled badge should show for disabled server
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

    // Switch to j-cli view
    fireEvent.click(screen.getByText('j-cli MCP'))
    expect(screen.getByText('server-filesystem')).toBeInTheDocument()

    // Switch back to workspace view
    fireEvent.click(screen.getByText('工作区 MCP'))
    expect(screen.getByText('custom-db')).toBeInTheDocument()
    expect(screen.getByText('添加服务器')).toBeInTheDocument()
  })

  it('shows transport type badges for j-cli servers', async () => {
    await renderAgentSettings()
    await switchToMcpTab()

    fireEvent.click(screen.getByText('j-cli MCP'))

    // stdio badge (for the first two servers)
    const stdioBadges = screen.getAllByText('stdio')
    expect(stdioBadges).toHaveLength(2)

    // SSE badge (for the puppeteer server)
    expect(screen.getByText('SSE')).toBeInTheDocument()
  })
})
