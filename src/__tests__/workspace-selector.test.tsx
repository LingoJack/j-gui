import * as React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { WorkspaceSelector } from '@/components/agent/WorkspaceSelector'
import {
  agentSessionsAtom,
  agentWorkspacesAtom,
  currentAgentWorkspaceIdAtom,
} from '@/atoms/agent-atoms'
import { workspaceListHeightAtom } from '@/atoms/sidebar-atoms'

const { deleteAgentWorkspaceMock } = vi.hoisted(() => ({
  deleteAgentWorkspaceMock: vi.fn(),
}))

vi.mock('@/lib/ipc', () => ({
  deleteAgentWorkspace: deleteAgentWorkspaceMock,
  updateSettings: vi.fn(),
  reorderAgentWorkspaces: vi.fn(),
  createAgentWorkspace: vi.fn(),
  updateAgentWorkspace: vi.fn(),
}))

describe('WorkspaceSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderSelector(hasSessions: boolean) {
    const store = createStore()
    store.set(agentWorkspacesAtom, [
      { id: 'default-workspace', name: '默认工作区', slug: 'default' },
      { id: 'ws-2', name: '项目 B', slug: 'project-b' },
    ])
    store.set(
      agentSessionsAtom,
      hasSessions
        ? [{
            id: 'agent-1',
            title: '会话 1',
            workspaceId: 'ws-2',
            updatedAt: Date.now(),
            archived: false,
            pinned: false,
            messageCount: 1,
          }]
        : [],
    )
    store.set(currentAgentWorkspaceIdAtom, 'default-workspace')
    store.set(workspaceListHeightAtom, 180)

    render(
      <Provider store={store}>
        <WorkspaceSelector />
      </Provider>,
    )
  }

  it('hides delete actions for workspaces that still own agent sessions', () => {
    renderSelector(true)

    expect(screen.queryByTitle('删除')).not.toBeInTheDocument()
  })

  it('allows deleting a workspace after its sessions are gone', () => {
    renderSelector(false)

    const deleteButton = screen.getByTitle('删除')
    fireEvent.click(deleteButton)
    fireEvent.click(screen.getByRole('button', { name: '删除' }))

    expect(deleteAgentWorkspaceMock).toHaveBeenCalledWith('ws-2')
  })
})
