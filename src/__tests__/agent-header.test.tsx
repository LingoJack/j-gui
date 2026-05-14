import * as React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { AgentHeader } from '@/components/agent/AgentHeader'
import { agentSessionsAtom, agentSidePanelOpenMapAtom } from '@/atoms/agent-atoms'
import { promptSidebarOpenAtom } from '@/atoms/system-prompt-atoms'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('@/lib/ipc', () => ({
  updateAgentSessionTitle: vi.fn(),
  listAgentSessions: vi.fn(async () => []),
  togglePinAgentSession: vi.fn(async (id: string) => ({
    id,
    title: 'Agent 会话',
    updatedAt: Date.now(),
    pinned: true,
  })),
}))

describe('AgentHeader', () => {
  it('keeps the Agent action buttons in the header row without an overflow overlay', () => {
    const store = createStore()
    store.set(agentSessionsAtom, [{
      id: 'agent-1',
      title: 'Agent 会话',
      updatedAt: Date.now(),
      pinned: false,
    }])
    store.set(agentSidePanelOpenMapAtom, new Map([['agent-1', false]]))

    render(
      <Provider store={store}>
        <TooltipProvider>
          <AgentHeader sessionId="agent-1" />
        </TooltipProvider>
      </Provider>,
    )

    expect(screen.getByRole('button', { name: '提示词' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '在 Chat 中引用' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '置顶会话' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开右侧工作区' })).toBeInTheDocument()

    const source = readFileSync(resolve(process.cwd(), 'src/components/agent/AgentHeader.tsx'), 'utf8')
    expect(source).not.toContain('top-[42px]')
    expect(source).not.toContain('absolute right-4')
  })

  it('opens prompt settings, toggles pin, and toggles the right panel from header actions', async () => {
    const store = createStore()
    store.set(agentSessionsAtom, [{
      id: 'agent-1',
      title: 'Agent 会话',
      updatedAt: Date.now(),
      pinned: false,
    }])
    store.set(agentSidePanelOpenMapAtom, new Map([['agent-1', false]]))

    render(
      <Provider store={store}>
        <TooltipProvider>
          <AgentHeader sessionId="agent-1" />
        </TooltipProvider>
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '提示词' }))
    expect(store.get(promptSidebarOpenAtom)).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '置顶会话' }))
    expect(await screen.findByRole('button', { name: '取消置顶' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '打开右侧工作区' }))
    expect(store.get(agentSidePanelOpenMapAtom).get('agent-1')).toBe(true)
  })
})
