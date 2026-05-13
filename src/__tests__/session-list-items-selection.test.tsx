import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SessionListItems } from '@/components/app-shell/SessionListItems'
import { TooltipProvider } from '@/components/ui/tooltip'

describe('SessionListItems selection mode', () => {
  it('toggles selection instead of opening the conversation when selection mode is enabled', () => {
    const onSelectConversation = vi.fn()
    const onToggleSessionSelection = vi.fn()

    render(
      <TooltipProvider>
        <SessionListItems
          mode="chat"
          viewMode="active"
          activeTabId={null}
          hoveredId={null}
          selectionMode
          selectedSessionIds={new Set()}
          pinnedExpanded
          pinnedConversations={[]}
          conversationGroups={[
            {
              label: '今天',
              items: [
                {
                  id: 'chat-1',
                  title: '测试对话',
                  updatedAt: Date.now(),
                  createdAt: Date.now(),
                  pinned: false,
                  archived: false,
                },
              ],
            },
          ]}
          archivedConversationCount={0}
          streamingIds={new Set()}
          hasWorkingSessions={false}
          workingGroups={{ todo: [], running: [], done: [] }}
          workingSessionIds={new Set()}
          workspaceNameMap={new Map()}
          pinnedAgentSessions={[]}
          agentSessionGroups={[]}
          archivedAgentSessionCount={0}
          agentIndicatorMap={new Map()}
          unviewedCompletedSessionIds={new Set()}
          agentTopHeight={0}
          agentSubTab="working"
          onHoveredIdChange={vi.fn()}
          onToggleSessionSelection={onToggleSessionSelection}
          onSelectConversation={onSelectConversation}
          onRequestDelete={vi.fn()}
          onRename={vi.fn()}
          onTogglePin={vi.fn()}
          onToggleArchive={vi.fn()}
          onSelectAgentSession={vi.fn()}
          onAgentRename={vi.fn()}
          onTogglePinAgent={vi.fn()}
          onToggleManualWorkingAgent={vi.fn()}
          onToggleArchiveAgent={vi.fn()}
          onRequestMove={vi.fn()}
          onAgentTopResizeStart={vi.fn()}
          onAgentSubTabChange={vi.fn()}
          onSetViewMode={vi.fn()}
        />
      </TooltipProvider>,
    )

    fireEvent.click(screen.getByText('测试对话'))

    expect(onToggleSessionSelection).toHaveBeenCalledWith('chat-1')
    expect(onSelectConversation).not.toHaveBeenCalled()
  })
})
