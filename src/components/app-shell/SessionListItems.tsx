/**
 * SessionListItems — 侧边栏会话列表渲染组件
 *
 * 从 LeftSidebar 提取，包含会话/对话列表项的渲染逻辑，
 * 以及 ConversationItem 和 AgentSessionItem 子组件。
 */

import * as React from 'react'
import { Pin, PinOff, Trash2, Pencil, Archive, ArchiveRestore, ArrowRightLeft, Hammer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ConversationMeta, AgentSessionMeta } from '@jgui/shared'
import type { SessionIndicatorStatus } from '@/atoms/agent-atoms'

/** 日期分组标签 */
type DateGroup = '今天' | '昨天' | '更早'

// ===== 对话列表项 =====

interface ConversationItemProps {
  conversation: ConversationMeta
  active: boolean
  hovered: boolean
  selectionMode: boolean
  selected: boolean
  streaming: boolean
  /** 是否在标题旁显示置顶图标 */
  showPinIcon: boolean
  onSelect: () => void
  onToggleSelect: () => void
  onRequestDelete: () => void
  onRename: (id: string, newTitle: string) => Promise<void>
  onTogglePin: (id: string) => Promise<void>
  onToggleArchive: (id: string) => Promise<void>
  onMouseEnter: () => void
  onMouseLeave: () => void
}

function ConversationItem({
  conversation,
  active,
  hovered,
  selectionMode,
  selected,
  streaming,
  showPinIcon,
  onSelect,
  onToggleSelect,
  onRequestDelete,
  onRename,
  onTogglePin,
  onToggleArchive,
  onMouseEnter,
  onMouseLeave,
}: ConversationItemProps): React.ReactElement {
  const [editing, setEditing] = React.useState(false)
  const [editTitle, setEditTitle] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const justStartedEditing = React.useRef(false)

  const startEdit = (): void => {
    setEditTitle(conversation.title)
    setEditing(true)
    justStartedEditing.current = true
    setTimeout(() => {
      justStartedEditing.current = false
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 300)
  }

  const saveTitle = async (): Promise<void> => {
    if (justStartedEditing.current) return
    const trimmed = editTitle.trim()
    if (!trimmed || trimmed === conversation.title) {
      setEditing(false)
      return
    }
    await onRename(conversation.id, trimmed)
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveTitle()
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  const isPinned = !!conversation.pinned

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (selectionMode) {
          onToggleSelect()
          return
        }
        onSelect()
      }}
      onDoubleClick={(e) => {
        if (selectionMode) return
        e.stopPropagation()
        startEdit()
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      aria-pressed={selectionMode ? selected : active}
      className={cn(
        'relative w-full flex items-center gap-2 px-3 py-[7px] rounded-[10px] transition-colors duration-100 titlebar-no-drag text-left',
        selectionMode
          ? selected
            ? 'bg-primary/10 ring-1 ring-primary/25 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
            : 'hover:bg-primary/5'
          : active
          ? 'session-item-selected bg-primary/10 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
          : 'hover:bg-primary/5'
      )}
    >
      {streaming && (
        <span
          className="absolute left-1 top-1.5 bottom-1.5 w-[2px] rounded-full bg-emerald-500 animate-pulse pointer-events-none"
          aria-hidden="true"
        />
      )}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={saveTitle}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-transparent text-[13px] leading-5 text-foreground border-b border-primary/50 outline-none px-0 py-0"
            maxLength={100}
          />
        ) : (
          <div className={cn(
            'truncate text-[13px] leading-5 flex items-center gap-1.5',
            active ? 'text-foreground' : 'text-foreground/80'
          )}>
            {showPinIcon && (
              <Pin size={11} className="flex-shrink-0 text-primary/60" />
            )}
            <span className="truncate">{conversation.title}</span>
          </div>
        )}
      </div>

      <div className={cn(
        'flex items-center gap-0.5 flex-shrink-0 transition-all duration-100 overflow-hidden',
        hovered && !editing && !selectionMode ? 'opacity-100' : 'opacity-0 w-0 pointer-events-none'
      )}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onTogglePin(conversation.id)
              }}
              className="p-1 rounded-md text-foreground/30 hover:bg-foreground/[0.08] hover:text-foreground/60 transition-colors"
            >
              {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{isPinned ? '取消置顶' : '置顶对话'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation()
                startEdit()
              }}
              className="p-1 rounded-md text-foreground/30 hover:bg-foreground/[0.08] hover:text-foreground/60 transition-colors"
            >
              <Pencil size={13} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">重命名</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleArchive(conversation.id)
              }}
              className="p-1 rounded-md text-foreground/30 hover:bg-foreground/[0.08] hover:text-foreground/60 transition-colors"
            >
              {conversation.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{conversation.archived ? '取消归档' : '归档'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRequestDelete()
              }}
              className="p-1 rounded-md text-foreground/30 hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">删除对话</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

// ===== Agent 会话列表项 =====

/** 会话行左侧状态色块的颜色 */
type SessionLeftAccent = 'orange' | 'blue' | 'green'
const SESSION_LEFT_ACCENT_CLASS: Record<SessionLeftAccent, string> = {
  orange: 'bg-orange-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
}

interface AgentSessionItemProps {
  session: AgentSessionMeta
  active: boolean
  hovered: boolean
  selectionMode: boolean
  selected: boolean
  indicatorStatus: SessionIndicatorStatus
  showPinIcon?: boolean
  isInWorkingSection?: boolean
  leftAccent?: SessionLeftAccent
  workspaceName?: string
  onSelect: () => void
  onToggleSelect: () => void
  onRequestDelete: () => void
  onRequestMove: () => void
  onRename: (id: string, newTitle: string) => Promise<void>
  onTogglePin: (id: string) => Promise<void>
  onToggleManualWorking: (id: string) => Promise<void>
  onToggleArchive: (id: string) => Promise<void>
  onMouseEnter: () => void
  onMouseLeave: () => void
}

function AgentSessionItem({
  session,
  active,
  hovered,
  selectionMode,
  selected,
  indicatorStatus,
  showPinIcon,
  isInWorkingSection,
  leftAccent,
  workspaceName,
  onSelect,
  onToggleSelect,
  onRequestDelete,
  onRequestMove,
  onRename,
  onTogglePin,
  onToggleManualWorking,
  onToggleArchive,
  onMouseEnter,
  onMouseLeave,
}: AgentSessionItemProps): React.ReactElement {
  const [editing, setEditing] = React.useState(false)
  const [editTitle, setEditTitle] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const justStartedEditing = React.useRef(false)

  const startEdit = (): void => {
    setEditTitle(session.title)
    setEditing(true)
    justStartedEditing.current = true
    setTimeout(() => {
      justStartedEditing.current = false
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 300)
  }

  const saveTitle = async (): Promise<void> => {
    if (justStartedEditing.current) return
    const trimmed = editTitle.trim()
    if (!trimmed || trimmed === session.title) {
      setEditing(false)
      return
    }
    await onRename(session.id, trimmed)
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveTitle()
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (selectionMode) {
          onToggleSelect()
          return
        }
        onSelect()
      }}
      onDoubleClick={(e) => {
        if (selectionMode) return
        e.stopPropagation()
        startEdit()
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      aria-pressed={selectionMode ? selected : active}
      className={cn(
        'relative w-full flex items-center gap-2 px-3 py-[7px] rounded-[10px] transition-colors duration-100 titlebar-no-drag text-left',
        selectionMode
          ? selected
            ? 'bg-primary/10 ring-1 ring-primary/25 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
            : 'hover:bg-primary/5'
          : active
          ? 'session-item-selected bg-primary/10 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
          : 'hover:bg-primary/5'
      )}
    >
      {leftAccent && (
        <span
          className={cn(
            'absolute left-1 top-1.5 bottom-1.5 w-[2px] rounded-full pointer-events-none',
            SESSION_LEFT_ACCENT_CLASS[leftAccent]
          )}
        />
      )}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={saveTitle}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-transparent text-[13px] leading-5 text-foreground border-b border-primary/50 outline-none px-0 py-0"
            maxLength={100}
          />
        ) : (
          <div className={cn(
            'truncate text-[13px] leading-5 flex items-center gap-1.5',
            active ? 'text-foreground' : 'text-foreground/80'
          )}>
            {showPinIcon && (
              <Pin size={11} className="flex-shrink-0 text-primary/60" />
            )}
            <span className="truncate">{session.title}</span>
            {workspaceName && (
              <span className="flex-shrink-0 px-1.5 py-0 rounded-full bg-primary/10 text-[10px] leading-4 workspace-badge font-medium truncate max-w-[80px]">
                {workspaceName}
              </span>
            )}
          </div>
        )}
      </div>

      <div className={cn(
        'flex items-center gap-0.5 flex-shrink-0 transition-all duration-100 overflow-hidden',
        hovered && !editing && !selectionMode ? 'opacity-100' : 'opacity-0 w-0 pointer-events-none'
      )}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onTogglePin(session.id)
              }}
              className="p-1 rounded-md text-foreground/30 hover:bg-foreground/[0.08] hover:text-foreground/60 transition-colors"
            >
              {session.pinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{session.pinned ? '取消置顶' : '置顶会话'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (indicatorStatus !== 'running') {
                  onToggleManualWorking(session.id)
                }
              }}
              disabled={indicatorStatus === 'running'}
              className={cn(
                'p-1 rounded-md transition-colors',
                indicatorStatus === 'running'
                  ? 'text-primary/40 cursor-not-allowed'
                  : (isInWorkingSection || session.manualWorking)
                    ? 'text-primary hover:bg-foreground/[0.08]'
                    : 'text-foreground/30 hover:bg-foreground/[0.08] hover:text-foreground/60'
              )}
            >
              <Hammer size={13} className={(isInWorkingSection || session.manualWorking) ? 'fill-current' : ''} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {indicatorStatus === 'running'
              ? '运行中无法移出'
              : (isInWorkingSection || session.manualWorking) ? '取消工作中' : '标记为工作中'}
          </TooltipContent>
        </Tooltip>
        {(indicatorStatus === 'idle' || indicatorStatus === 'completed') && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onRequestMove()
                }}
                className="p-1 rounded-md text-foreground/30 hover:bg-foreground/[0.08] hover:text-foreground/60 transition-colors"
              >
                <ArrowRightLeft size={13} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">迁移到其他工作区</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation()
                startEdit()
              }}
              className="p-1 rounded-md text-foreground/30 hover:bg-foreground/[0.08] hover:text-foreground/60 transition-colors"
            >
              <Pencil size={13} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">重命名</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleArchive(session.id)
              }}
              className="p-1 rounded-md text-foreground/30 hover:bg-foreground/[0.08] hover:text-foreground/60 transition-colors"
            >
              {session.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{session.archived ? '取消归档' : '归档'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRequestDelete()
              }}
              className="p-1 rounded-md text-foreground/30 hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">删除会话</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

// ===== SessionListItems 主组件 =====

export interface SessionListItemsProps {
  mode: 'chat' | 'agent'
  viewMode: 'active' | 'archived'
  activeTabId: string | null
  hoveredId: string | null
  selectionMode: boolean
  selectedSessionIds: Set<string>
  pinnedExpanded: boolean

  // Chat 数据
  pinnedConversations: ConversationMeta[]
  conversationGroups: Array<{ label: DateGroup; items: ConversationMeta[] }>
  archivedConversationCount: number
  streamingIds: Set<string>

  // Agent 工作中数据
  hasWorkingSessions: boolean
  workingGroups: { todo: AgentSessionMeta[]; running: AgentSessionMeta[]; done: AgentSessionMeta[] }
  workingSessionIds: Set<string>
  workspaceNameMap: Map<string, string>

  // Agent 置顶数据
  pinnedAgentSessions: AgentSessionMeta[]
  agentSessionGroups: Array<{ label: DateGroup; items: AgentSessionMeta[] }>
  archivedAgentSessionCount: number

  // Agent 指示器
  agentIndicatorMap: Map<string, SessionIndicatorStatus>
  unviewedCompletedSessionIds: Set<string>

  // Agent 分割面板
  agentTopHeight: number
  agentSubTab: 'working' | 'pinned'

  // 回调
  onHoveredIdChange: (id: string | null) => void
  onToggleSessionSelection: (id: string) => void
  onSelectConversation: (id: string, title: string) => void
  onRequestDelete: (id: string) => void
  onRename: (id: string, newTitle: string) => Promise<void>
  onTogglePin: (id: string) => Promise<void>
  onToggleArchive: (id: string) => Promise<void>
  onSelectAgentSession: (id: string, title: string) => void
  onAgentRename: (id: string, newTitle: string) => Promise<void>
  onTogglePinAgent: (id: string) => Promise<void>
  onToggleManualWorkingAgent: (id: string) => Promise<void>
  onToggleArchiveAgent: (id: string) => Promise<void>
  onRequestMove: (id: string) => void
  onAgentTopResizeStart: (e: React.MouseEvent) => void
  onAgentSubTabChange: (tab: 'working' | 'pinned') => void
  onSetViewMode: (mode: 'active' | 'archived') => void
}

export function SessionListItems(props: SessionListItemsProps): React.ReactElement {
  const {
    mode,
    viewMode,
    activeTabId,
    hoveredId,
    selectionMode,
    selectedSessionIds,
    pinnedExpanded,
    pinnedConversations,
    conversationGroups,
    archivedConversationCount,
    streamingIds,
    hasWorkingSessions,
    workingGroups,
    workingSessionIds,
    workspaceNameMap,
    pinnedAgentSessions,
    agentSessionGroups,
    archivedAgentSessionCount,
    agentIndicatorMap,
    unviewedCompletedSessionIds,
    agentTopHeight,
    agentSubTab,
    onHoveredIdChange,
    onToggleSessionSelection,
    onSelectConversation,
    onRequestDelete,
    onRename,
    onTogglePin,
    onToggleArchive,
    onSelectAgentSession,
    onAgentRename,
    onTogglePinAgent,
    onToggleManualWorkingAgent,
    onToggleArchiveAgent,
    onRequestMove,
    onAgentTopResizeStart,
    onAgentSubTabChange,
    onSetViewMode,
  } = props

  return (
    <>
      {/* Chat 模式：置顶对话区域 */}
      {mode === 'chat' && pinnedExpanded && pinnedConversations.length > 0 && (
        <div className="px-3 pt-1 pb-1">
          <div className="flex flex-col gap-0.5 pl-1 border-l-2 border-primary/20 ml-2">
            {pinnedConversations.map((conv) => (
              <ConversationItem
                key={`pinned-${conv.id}`}
                conversation={conv}
                active={conv.id === activeTabId}
                hovered={conv.id === hoveredId}
                selectionMode={selectionMode}
                selected={selectedSessionIds.has(conv.id)}
                streaming={streamingIds.has(conv.id)}
                showPinIcon={false}
                onSelect={() => onSelectConversation(conv.id, conv.title)}
                onToggleSelect={() => onToggleSessionSelection(conv.id)}
                onRequestDelete={() => onRequestDelete(conv.id)}
                onRename={onRename}
                onTogglePin={onTogglePin}
                onToggleArchive={onToggleArchive}
                onMouseEnter={() => onHoveredIdChange(conv.id)}
                onMouseLeave={() => onHoveredIdChange(null)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Agent 模式活跃视图：可拖拽双区（上 置顶+Working，下 最近会话） */}
      {mode === 'agent' && viewMode === 'active' ? (
        <div className="flex-1 flex flex-col min-h-0">
          {(pinnedAgentSessions.length > 0 || hasWorkingSessions) && (
            <>
              {/* 上区：工作中 / 置顶标签切换（高度可拖拽） */}
              <div
                style={{ height: agentTopHeight > 0 ? agentTopHeight : undefined }}
                className="flex flex-col min-h-0 flex-shrink-0 overflow-hidden"
              >
                {/* 标签切换按钮 */}
                <div className="pt-2 px-3 flex-shrink-0">
                  <div className="flex items-center gap-1 mb-0.5">
                    <button
                      onClick={() => onAgentSubTabChange('working')}
                      className={cn(
                        'flex-1 justify-center px-2.5 py-0.5 rounded-md text-[12px] font-medium transition-colors titlebar-no-drag inline-flex items-center',
                        agentSubTab === 'working'
                          ? 'tab-item-selected bg-foreground/[0.08] text-foreground/80'
                          : 'text-foreground/40 hover:text-foreground/60 hover:bg-foreground/[0.04]'
                      )}
                    >
                      工作中
                      {hasWorkingSessions && (
                        <span className={cn(
                          'ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px]',
                          agentSubTab === 'working'
                            ? 'bg-foreground/10 text-foreground/60'
                            : 'bg-foreground/10 text-foreground/50'
                        )}>
                          {workingGroups.todo.length + workingGroups.running.length + workingGroups.done.length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => onAgentSubTabChange('pinned')}
                      className={cn(
                        'flex-1 justify-center px-2.5 py-0.5 rounded-md text-[12px] font-medium transition-colors titlebar-no-drag inline-flex items-center',
                        agentSubTab === 'pinned'
                          ? 'tab-item-selected bg-foreground/[0.08] text-foreground/80'
                          : 'text-foreground/40 hover:text-foreground/60 hover:bg-foreground/[0.04]'
                      )}
                    >
                      置顶
                      {pinnedAgentSessions.length > 0 && (
                        <span className={cn(
                          'ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px]',
                          agentSubTab === 'pinned'
                            ? 'bg-foreground/10 text-foreground/60'
                            : 'bg-foreground/10 text-foreground/50'
                        )}>
                          {pinnedAgentSessions.length}
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* 标签内容 */}
                <div className="flex-1 overflow-y-auto scrollbar-none px-3 pb-1 min-h-0">
                  {agentSubTab === 'working' && (
                    <div className="pt-0.5 pb-0.5">
                      {hasWorkingSessions ? (() => {
                        const workingItems: Array<{ session: AgentSessionMeta; accent?: SessionLeftAccent; keyPrefix: string }> = [
                          ...workingGroups.todo.map((s) => ({ session: s, accent: 'orange' as const, keyPrefix: 'working-todo' })),
                          ...workingGroups.running.map((s) => ({ session: s, accent: 'blue' as const, keyPrefix: 'working-running' })),
                          ...workingGroups.done.map((s) => ({ session: s, accent: unviewedCompletedSessionIds.has(s.id) ? 'green' as const : undefined, keyPrefix: 'working-done' })),
                        ]
                        return (
                          <div className="flex flex-col gap-0.5">
                            {workingItems.map(({ session, accent, keyPrefix }) => (
                              <AgentSessionItem
                                key={`${keyPrefix}-${session.id}`}
                                session={session}
                                active={session.id === activeTabId}
                                hovered={session.id === hoveredId}
                                selectionMode={selectionMode}
                                selected={selectedSessionIds.has(session.id)}
                                indicatorStatus={agentIndicatorMap.get(session.id) ?? 'idle'}
                                isInWorkingSection={workingSessionIds.has(session.id)}
                                showPinIcon={false}
                                leftAccent={accent}
                                workspaceName={session.workspaceId ? workspaceNameMap.get(session.workspaceId) : undefined}
                                onSelect={() => onSelectAgentSession(session.id, session.title)}
                                onToggleSelect={() => onToggleSessionSelection(session.id)}
                                onRequestDelete={() => onRequestDelete(session.id)}
                                onRequestMove={() => onRequestMove(session.id)}
                                onRename={onAgentRename}
                                onTogglePin={onTogglePinAgent}
                                onToggleManualWorking={onToggleManualWorkingAgent}
                                onToggleArchive={onToggleArchiveAgent}
                                onMouseEnter={() => onHoveredIdChange(session.id)}
                                onMouseLeave={() => onHoveredIdChange(null)}
                              />
                            ))}
                          </div>
                        )
                      })() : (
                        <div className="px-2 py-3 text-[11px] text-foreground/30 text-center select-none">
                          暂无进行中的会话
                        </div>
                      )}
                    </div>
                  )}

                  {agentSubTab === 'pinned' && (
                    <div className="pt-0.5 pb-0.5">
                      {pinnedAgentSessions.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {pinnedAgentSessions.map((session) => (
                            <AgentSessionItem
                              key={`pinned-${session.id}`}
                              session={session}
                              active={session.id === activeTabId}
                              hovered={session.id === hoveredId}
                              selectionMode={selectionMode}
                              selected={selectedSessionIds.has(session.id)}
                              indicatorStatus={agentIndicatorMap.get(session.id) ?? 'idle'}
                              isInWorkingSection={workingSessionIds.has(session.id)}
                              showPinIcon={false}
                              onSelect={() => onSelectAgentSession(session.id, session.title)}
                              onToggleSelect={() => onToggleSessionSelection(session.id)}
                              onRequestDelete={() => onRequestDelete(session.id)}
                              onRequestMove={() => onRequestMove(session.id)}
                              onRename={onAgentRename}
                              onTogglePin={onTogglePinAgent}
                              onToggleManualWorking={onToggleManualWorkingAgent}
                              onToggleArchive={onToggleArchiveAgent}
                              onMouseEnter={() => onHoveredIdChange(session.id)}
                              onMouseLeave={() => onHoveredIdChange(null)}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="px-2 py-3 text-[11px] text-foreground/30 text-center select-none">
                          暂无置顶会话
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 拖拽分割条 */}
              <div
                onMouseDown={onAgentTopResizeStart}
                className="h-px bg-border/60 hover:h-1 hover:bg-foreground/[0.08] cursor-row-resize titlebar-no-drag flex-shrink-0 transition-[height,background-color] duration-75"
              />
            </>
          )}

          {/* 下区标题 */}
          <div className="px-3 pt-2 pb-1 text-[11px] font-medium text-foreground/40 select-none flex-shrink-0">
            最近会话
          </div>

          {/* 下区：历史会话列表 */}
          <div className="flex-1 overflow-y-auto px-3 pb-3 scrollbar-none min-h-0">
            {agentSessionGroups.map((group) => (
              <div key={group.label} className="mb-1">
                <div className="px-3 pt-2 pb-1 text-[11px] font-medium text-foreground/40 select-none">
                  {group.label}
                </div>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((session) => (
                    <AgentSessionItem
                      key={session.id}
                      session={session}
                      active={session.id === activeTabId}
                      hovered={session.id === hoveredId}
                      selectionMode={selectionMode}
                      selected={selectedSessionIds.has(session.id)}
                      indicatorStatus={agentIndicatorMap.get(session.id) ?? 'idle'}
                      isInWorkingSection={workingSessionIds.has(session.id)}
                      showPinIcon={!!session.pinned}
                      onSelect={() => onSelectAgentSession(session.id, session.title)}
                      onToggleSelect={() => onToggleSessionSelection(session.id)}
                      onRequestDelete={() => onRequestDelete(session.id)}
                      onRequestMove={() => onRequestMove(session.id)}
                      onRename={onAgentRename}
                      onTogglePin={onTogglePinAgent}
                      onToggleManualWorking={onToggleManualWorkingAgent}
                      onToggleArchive={onToggleArchiveAgent}
                      onMouseEnter={() => onHoveredIdChange(session.id)}
                      onMouseLeave={() => onHoveredIdChange(null)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* 归档视图标题栏 */}
          {viewMode === 'archived' && (
            <div className="px-6 pt-3 pb-1">
              <div className="text-[12px] font-medium text-foreground/40">
                已归档{mode === 'agent' ? '会话' : '对话'}
              </div>
            </div>
          )}

          {/* Chat 模式 / 归档视图：单列表布局 */}
          <div className="flex-1 overflow-y-auto px-3 pt-2 pb-3 scrollbar-none">
            {mode === 'chat' ? (
              /* Chat 模式：对话按日期分组 */
              conversationGroups.map((group) => (
                <div key={group.label} className="mb-1">
                  <div className="px-3 pt-2 pb-1 text-[11px] font-medium text-foreground/40 select-none">
                    {group.label}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {group.items.map((conv) => (
                      <ConversationItem
                        key={conv.id}
                        conversation={conv}
                        active={conv.id === activeTabId}
                        hovered={conv.id === hoveredId}
                        selectionMode={selectionMode}
                        selected={selectedSessionIds.has(conv.id)}
                        streaming={streamingIds.has(conv.id)}
                        showPinIcon={!!conv.pinned}
                        onSelect={() => onSelectConversation(conv.id, conv.title)}
                        onToggleSelect={() => onToggleSessionSelection(conv.id)}
                        onRequestDelete={() => onRequestDelete(conv.id)}
                        onRename={onRename}
                        onTogglePin={onTogglePin}
                        onToggleArchive={onToggleArchive}
                        onMouseEnter={() => onHoveredIdChange(conv.id)}
                        onMouseLeave={() => onHoveredIdChange(null)}
                      />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              /* Agent 模式归档：Agent 会话按日期分组 */
              agentSessionGroups.map((group) => (
                <div key={group.label} className="mb-1">
                  <div className="px-3 pt-2 pb-1 text-[11px] font-medium text-foreground/40 select-none">
                    {group.label}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {group.items.map((session) => (
                      <AgentSessionItem
                        key={session.id}
                        session={session}
                        active={session.id === activeTabId}
                        hovered={session.id === hoveredId}
                        selectionMode={selectionMode}
                        selected={selectedSessionIds.has(session.id)}
                        indicatorStatus={agentIndicatorMap.get(session.id) ?? 'idle'}
                        isInWorkingSection={workingSessionIds.has(session.id)}
                        showPinIcon={!!session.pinned}
                        onSelect={() => onSelectAgentSession(session.id, session.title)}
                        onToggleSelect={() => onToggleSessionSelection(session.id)}
                        onRequestDelete={() => onRequestDelete(session.id)}
                        onRequestMove={() => onRequestMove(session.id)}
                        onRename={onAgentRename}
                        onTogglePin={onTogglePinAgent}
                        onToggleManualWorking={onToggleManualWorkingAgent}
                        onToggleArchive={onToggleArchiveAgent}
                        onMouseEnter={() => onHoveredIdChange(session.id)}
                        onMouseLeave={() => onHoveredIdChange(null)}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* 已归档入口 / 返回活跃对话 */}
      <div className="px-3 pb-1">
        {viewMode === 'active' ? (
          <>
            {mode === 'chat' && archivedConversationCount > 0 && (
              <button
                onClick={() => onSetViewMode('archived')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-[12px] text-foreground/40 hover:bg-foreground/[0.04] hover:text-foreground/60 transition-colors titlebar-no-drag"
              >
                <Archive size={13} className="text-foreground/30" />
                <span>已归档 ({archivedConversationCount})</span>
              </button>
            )}
            {mode === 'agent' && archivedAgentSessionCount > 0 && (
              <button
                onClick={() => onSetViewMode('archived')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-[12px] text-foreground/40 hover:bg-foreground/[0.04] hover:text-foreground/60 transition-colors titlebar-no-drag"
              >
                <Archive size={13} className="text-foreground/30" />
                <span>已归档 ({archivedAgentSessionCount})</span>
              </button>
            )}
          </>
        ) : (
          <button
            onClick={() => onSetViewMode('active')}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-[12px] text-foreground/60 bg-foreground/[0.04] hover:bg-foreground/[0.07] hover:text-foreground/80 transition-colors titlebar-no-drag"
          >
            <ArrowRightLeft size={13} className="text-foreground/50" />
            <span>返回活跃{mode === 'agent' ? '会话' : '对话'}</span>
          </button>
        )}
      </div>
    </>
  )
}
