/**
 * LeftSidebar - 左侧边栏
 *
 * 包含：
 * - Chat/Agent 模式切换器
 * - 导航菜单项（点击切换主内容区视图）
 * - 置顶对话区域（可展开/收起）
 * - 对话列表（新对话按钮 + 右键菜单 + 按 updatedAt 降序排列）
 */

import * as React from 'react'
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { Pin, Settings, Plus, ChevronDown, ChevronRight, Plug, Zap, PanelLeftClose, PanelLeftOpen, Search, Trash2, Archive } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { ModeSwitcher } from './ModeSwitcher'
import { SearchDialog } from './SearchDialog'
import { UserAvatar } from '@/components/chat/UserAvatar'
import { activeViewAtom } from '@/atoms/active-view'
import { appModeAtom } from '@/atoms/app-mode'
import { settingsTabAtom, settingsOpenAtom } from '@/atoms/settings-tab'
import {
  conversationsAtom,
  selectedModelAtom,
  streamingConversationIdsAtom,
  conversationModelsAtom,
  conversationContextLengthAtom,
  conversationThinkingEnabledAtom,
  conversationParallelModeAtom,
} from '@/atoms/chat-atoms'
import {
  agentSessionsAtom,
  currentAgentSessionIdAtom,
  agentSessionIndicatorMapAtom,
  unviewedCompletedSessionIdsAtom,
  workingDoneSessionIdsAtom,
  agentChannelIdAtom,
  agentModelIdAtom,
  agentSessionChannelMapAtom,
  agentSessionModelMapAtom,
  currentAgentWorkspaceIdAtom,
  agentWorkspacesAtom,
  workspaceCapabilitiesVersionAtom,
  agentSidePanelOpenMapAtom,
} from '@/atoms/agent-atoms'

import {
  tabsAtom,
  activeTabIdAtom,
  sidebarCollapsedAtom,
  closeTab,
  updateTabTitle,
} from '@/atoms/tab-atoms'
import { userProfileAtom } from '@/atoms/user-profile'
import { sidebarViewModeAtom, agentSidebarTopHeightAtom } from '@/atoms/sidebar-atoms'
import { searchDialogOpenAtom } from '@/atoms/search-atoms'
import { draftSessionIdsAtom } from '@/atoms/draft-session-atoms'
import { workingSessionGroupsAtom, workingSessionIdsSetAtom } from '@/atoms/working-atoms'
// hasEnvironmentIssues 已移除 - 环境检查已从 roadmap 中排除
const hasEnvironmentIssuesAtom = atom(false)
import { promptConfigAtom, selectedPromptIdAtom, conversationPromptIdAtom } from '@/atoms/system-prompt-atoms'
import { useOpenSession } from '@/hooks/useOpenSession'
import { useSyncActiveTabSideEffects } from '@/hooks/useSyncActiveTabSideEffects'
import { WorkspaceSelector } from '@/components/agent/WorkspaceSelector'
import { MoveSessionDialog } from '@/components/agent/MoveSessionDialog'
import { detectIsMac } from '@/lib/platform'
import { isDraftLikeAgentSession, isDraftLikeConversation } from '@/lib/session-meta'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { ActiveView } from '@/atoms/active-view'
import type { ConversationMeta, AgentSessionMeta, WorkspaceCapabilities } from '@jgui/shared'
import * as ipc from '@/lib/ipc'
import { SessionListItems, type SessionListItemsProps } from './SessionListItems'

function isAgentSessionMeta(value: unknown): value is AgentSessionMeta {
  return typeof value === 'object' && value !== null && 'id' in value
}

interface SidebarItemProps {
  icon: React.ReactNode
  label: string
  active?: boolean
  /** 右侧额外元素（如展开/收起箭头） */
  suffix?: React.ReactNode
  onClick?: () => void
}

function SidebarItem({ icon, label, active, suffix, onClick }: SidebarItemProps): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-between px-3 py-2 rounded-[10px] text-[13px] transition-colors duration-100 titlebar-no-drag',
        active
          ? 'bg-primary/10 text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
          : 'text-foreground/60 hover:bg-primary/5 hover:text-foreground'
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex-shrink-0 w-[18px] h-[18px]">{icon}</span>
        <span>{label}</span>
      </div>
      {suffix}
    </button>
  )
}

export interface LeftSidebarProps {
  /** 可选固定宽度，默认使用 CSS 响应式宽度 */
  width?: number
}

/** 侧边栏导航项标识 */
type SidebarItemId = 'pinned' | 'all-chats'

/** 导航项到视图的映射 */
const ITEM_TO_VIEW: Record<SidebarItemId, ActiveView> = {
  pinned: 'conversations',
  'all-chats': 'conversations',
}

function groupByDate<T extends { updatedAt: number }>(items: T[]): Array<{ label: '今天' | '昨天' | '更早'; items: T[] }> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86_400_000

  const today: T[] = []
  const yesterday: T[] = []
  const earlier: T[] = []

  for (const item of items) {
    if (item.updatedAt >= todayStart) {
      today.push(item)
    } else if (item.updatedAt >= yesterdayStart) {
      yesterday.push(item)
    } else {
      earlier.push(item)
    }
  }

  const groups: Array<{ label: '今天' | '昨天' | '更早'; items: T[] }> = []
  if (today.length > 0) groups.push({ label: '今天', items: today })
  if (yesterday.length > 0) groups.push({ label: '昨天', items: yesterday })
  if (earlier.length > 0) groups.push({ label: '更早', items: earlier })
  return groups
}

const SIDEBAR_WIDTH_TRANSITION_MS = 200

export function LeftSidebar({ width }: LeftSidebarProps): React.ReactElement {
  const sidebarExpandDelayTimerRef = React.useRef<number | null>(null)
  const sidebarContainerRef = React.useRef<HTMLDivElement>(null)
  const [activeView, setActiveView] = useAtom(activeViewAtom)
  const setSettingsTab = useSetAtom(settingsTabAtom)
  const setSettingsOpen = useSetAtom(settingsOpenAtom)
  const [, setActiveItem] = React.useState<SidebarItemId>('all-chats')
  const [conversations, setConversations] = useAtom(conversationsAtom)
  const draftSessionIds = useAtomValue(draftSessionIdsAtom)
  const setDraftSessionIds = useSetAtom(draftSessionIdsAtom)
  const [hoveredId, setHoveredId] = React.useState<string | null>(null)
  const [selectionMode, setSelectionMode] = React.useState(false)
  const [selectedSessionIds, setSelectedSessionIds] = React.useState<Set<string>>(new Set())

  // 窗口失焦时清除 hover 状态，防止 Tooltip 残留
  React.useEffect(() => {
    const handleBlur = (): void => setHoveredId(null)
    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [])

  const clearSelection = React.useCallback(() => {
    setSelectedSessionIds(new Set())
  }, [])

  /** 待删除会话 ID 列表，非空时显示确认弹窗 */
  const [pendingDeleteIds, setPendingDeleteIds] = React.useState<string[]>([])
  /** 待迁移会话 ID，非空时显示迁移对话框 */
  const [moveTargetId, setMoveTargetId] = React.useState<string | null>(null)
  /** 置顶区域展开/收起 */
  const [pinnedExpanded, setPinnedExpanded] = React.useState(true)
  /** Agent 上区子标签：'working' | 'pinned'，默认 working 在前 */
  const [agentSubTab, setAgentSubTab] = React.useState<'working' | 'pinned'>('working')
  const [userProfile, setUserProfile] = useAtom(userProfileAtom)
  const selectedModel = useAtomValue(selectedModelAtom)
  const streamingIds = useAtomValue(streamingConversationIdsAtom)
  const mode = useAtomValue(appModeAtom)
  const isMac = React.useMemo(() => detectIsMac(), [])
  const hasEnvironmentIssues = useAtomValue(hasEnvironmentIssuesAtom)
  const promptConfig = useAtomValue(promptConfigAtom)
  const setSelectedPromptId = useSetAtom(selectedPromptIdAtom)

  // Agent 模式状态
  const [agentSessions, setAgentSessions] = useAtom(agentSessionsAtom)
  const [currentAgentSessionId] = useAtom(currentAgentSessionIdAtom)
  const agentIndicatorMap = useAtomValue(agentSessionIndicatorMapAtom)
  const unviewedCompletedSessionIds = useAtomValue(unviewedCompletedSessionIdsAtom)
  const setUnviewedCompleted = useSetAtom(unviewedCompletedSessionIdsAtom)
  const agentChannelId = useAtomValue(agentChannelIdAtom)
  const agentModelId = useAtomValue(agentModelIdAtom)
  const setSessionChannelMap = useSetAtom(agentSessionChannelMapAtom)
  const setSessionModelMap = useSetAtom(agentSessionModelMapAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const effectiveWorkspaceId = React.useMemo(
    () => currentWorkspaceId ?? workspaces[0]?.id ?? null,
    [currentWorkspaceId, workspaces],
  )
  const selectedAgentSessionWorkspaceId = React.useMemo(
    () => agentSessions.find((session) => session.id === currentAgentSessionId)?.workspaceId ?? null,
    [agentSessions, currentAgentSessionId],
  )

  // 工作区能力（MCP + 技能计数）
  const [capabilities, setCapabilities] = React.useState<WorkspaceCapabilities | null>(null)
  const [capabilitiesError, setCapabilitiesError] = React.useState<string | null>(null)
  const lastCapabilitiesErrorRef = React.useRef<string | null>(null)
  const capabilitiesVersion = useAtomValue(workspaceCapabilitiesVersionAtom)

  // 标签页状态
  const [tabs, setTabs] = useAtom(tabsAtom)
  const [activeTabId, setActiveTabId] = useAtom(activeTabIdAtom)
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom)
  const [sessionListMounted, setSessionListMounted] = React.useState(() => !sidebarCollapsed)
  const openSession = useOpenSession()
  const syncActiveTabSideEffects = useSyncActiveTabSideEffects()
  const expandedSidebarWidth = width ?? 280
  const collapsedSidebarWidth = 48

  // 归档 & 搜索状态
  const [viewMode, setViewMode] = useAtom(sidebarViewModeAtom)
  const setSearchDialogOpen = useSetAtom(searchDialogOpenAtom)

  // Agent 模式上区（工作中/置顶）可拖拽高度
  /** -1 表示未初始化，首次渲染时按容器 40% 计算 */
  const [agentTopHeight, setAgentTopHeight] = useAtom(agentSidebarTopHeightAtom)
  const agentSplitContainerRef = React.useRef<HTMLDivElement>(null)
  const agentTopResizing = React.useRef(false)
  const agentTopResizeCleanup = React.useRef<(() => void) | null>(null)

  React.useEffect(() => {
    return () => { agentTopResizeCleanup.current?.() }
  }, [])

  React.useEffect(() => {
    if (agentTopHeight > 0) return
    if (mode !== 'agent' || viewMode !== 'active' || !sessionListMounted) return
    const el = agentSplitContainerRef.current
    if (!el) return
    const h = el.getBoundingClientRect().height
    if (h > 0) {
      setAgentTopHeight(Math.round(h * 0.4))
    }
  }, [agentTopHeight, setAgentTopHeight, mode, sessionListMounted, viewMode])

  const handleAgentTopResizeStart = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const container = agentSplitContainerRef.current
      if (!container) return
      agentTopResizing.current = true
      const startY = e.clientY
      const startH = Math.max(0, agentTopHeight)
      const containerHeight = container.getBoundingClientRect().height
      const minH = 80
      const maxH = Math.max(minH, Math.floor(containerHeight * 0.7))

      const onMove = (ev: MouseEvent): void => {
        if (!agentTopResizing.current) return
        const delta = ev.clientY - startY
        const next = Math.min(maxH, Math.max(minH, startH + delta))
        setAgentTopHeight(next)
      }
      const onUp = (): void => {
        agentTopResizing.current = false
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        agentTopResizeCleanup.current = null
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
      agentTopResizeCleanup.current = onUp
    },
    [agentTopHeight, setAgentTopHeight],
  )

  // 当 activeTabId 变化时，自动滚动侧边栏使选中项可见
  React.useEffect(() => {
    if (sidebarCollapsed || !sessionListMounted) return
    if (!activeTabId) return
    requestAnimationFrame(() => {
      const el = document.querySelector('.session-item-selected')
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }, [activeTabId, sessionListMounted, sidebarCollapsed])

  React.useEffect(() => {
    if (sidebarExpandDelayTimerRef.current !== null) {
      window.clearTimeout(sidebarExpandDelayTimerRef.current)
      sidebarExpandDelayTimerRef.current = null
    }

    if (sidebarCollapsed) {
      setSessionListMounted(false)
      return
    }

    // 优先跟随真实 width transition 结束，再兜底定时，避免动画和重子树挂载抢同一帧。
    sidebarExpandDelayTimerRef.current = window.setTimeout(() => {
      setSessionListMounted(true)
      sidebarExpandDelayTimerRef.current = null
    }, SIDEBAR_WIDTH_TRANSITION_MS)

    return () => {
      if (sidebarExpandDelayTimerRef.current !== null) {
        window.clearTimeout(sidebarExpandDelayTimerRef.current)
        sidebarExpandDelayTimerRef.current = null
      }
    }
  }, [sidebarCollapsed])

  const handleSidebarWidthTransitionEnd = React.useCallback((event: React.TransitionEvent<HTMLDivElement>) => {
    if (event.target !== sidebarContainerRef.current || event.propertyName !== 'width') return
    if (sidebarCollapsed) return
    if (sidebarExpandDelayTimerRef.current !== null) {
      window.clearTimeout(sidebarExpandDelayTimerRef.current)
      sidebarExpandDelayTimerRef.current = null
    }
    setSessionListMounted(true)
  }, [sidebarCollapsed])

  // 按对话/会话隔离的映射 atom（删除时清理）
  const setConvModels = useSetAtom(conversationModelsAtom)
  const setConvContextLength = useSetAtom(conversationContextLengthAtom)
  const setConvThinking = useSetAtom(conversationThinkingEnabledAtom)
  const setConvParallel = useSetAtom(conversationParallelModeAtom)
  const setConvPromptId = useSetAtom(conversationPromptIdAtom)
  const setAgentSidePanelOpen = useSetAtom(agentSidePanelOpenMapAtom)
  const setWorkingDone = useSetAtom(workingDoneSessionIdsAtom)

  /** 清理按对话/会话隔离的映射 atom 条目 */
  const cleanupMapAtoms = React.useCallback((id: string) => {
    const deleteKey = <T,>(prev: Map<string, T>): Map<string, T> => {
      if (!prev.has(id)) return prev
      const map = new Map(prev)
      map.delete(id)
      return map
    }
    setConvModels(deleteKey)
    setConvContextLength(deleteKey)
    setConvThinking(deleteKey)
    setConvParallel(deleteKey)
    setConvPromptId(deleteKey)
    setAgentSidePanelOpen(deleteKey)
    setSessionChannelMap(deleteKey)
    setSessionModelMap(deleteKey)
  }, [setConvModels, setConvContextLength, setConvThinking, setConvParallel, setConvPromptId, setAgentSidePanelOpen, setSessionChannelMap, setSessionModelMap])

  const currentWorkspaceSlug = React.useMemo(() => {
    if (!effectiveWorkspaceId) return null
    return workspaces.find((w) => w.id === effectiveWorkspaceId)?.slug ?? null
  }, [effectiveWorkspaceId, workspaces])

  const workspaceNameMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const w of workspaces) map.set(w.id, w.name)
    return map
  }, [workspaces])

  const isVisibleConversation = React.useCallback(
    (conversation: ConversationMeta) => !draftSessionIds.has(conversation.id) && !isDraftLikeConversation(conversation),
    [draftSessionIds],
  )

  const isVisibleAgentSession = React.useCallback(
    (session: AgentSessionMeta) => !draftSessionIds.has(session.id) && !isDraftLikeAgentSession(session),
    [draftSessionIds],
  )

  const matchesWorkspaceFilter = React.useCallback(
    (session: AgentSessionMeta) => {
      if (!effectiveWorkspaceId) return true
      return session.workspaceId === effectiveWorkspaceId || session.id === currentAgentSessionId
    },
    [effectiveWorkspaceId, currentAgentSessionId],
  )

  React.useEffect(() => {
    if (!currentWorkspaceSlug || mode !== 'agent') {
      setCapabilities(null)
      setCapabilitiesError(null)
      lastCapabilitiesErrorRef.current = null
      return
    }
    ipc.getResolvedWorkspaceCapabilities(currentWorkspaceSlug)
      .then((resolvedCapabilities) => {
        setCapabilities(resolvedCapabilities)
        setCapabilitiesError(null)
        lastCapabilitiesErrorRef.current = null
      })
      .catch((error) => {
        console.error('[LeftSidebar] 加载工作区能力失败:', error)
        setCapabilities(null)
        const message = error instanceof Error ? error.message : '未知错误'
        setCapabilitiesError(message)
        if (lastCapabilitiesErrorRef.current !== message) {
          lastCapabilitiesErrorRef.current = message
          toast.error('加载工作区能力失败', { description: message })
        }
      })
  }, [currentWorkspaceSlug, mode, activeView, capabilitiesVersion])

  /** 置顶对话列表（仅活跃模式显示，排除草稿） */
  const pinnedConversations = React.useMemo(
    () => viewMode === 'active' ? conversations.filter((c) => c.pinned && isVisibleConversation(c)) : [],
    [conversations, viewMode, isVisibleConversation]
  )

  /** Working 区域状态 */
  const workingGroups = useAtomValue(workingSessionGroupsAtom)
  const workingSessionIds = useAtomValue(workingSessionIdsSetAtom)
  const hasWorkingSessions = workingGroups.todo.length > 0 || workingGroups.running.length > 0 || workingGroups.done.length > 0

  /** 置顶 Agent 会话列表（仅活跃模式显示，按当前工作区过滤，排除草稿和工作中） */
  const pinnedAgentSessions = React.useMemo(
    () => viewMode === 'active'
      ? agentSessions.filter((s) => s.pinned && isVisibleAgentSession(s) && !workingSessionIds.has(s.id) && matchesWorkspaceFilter(s))
      : [],
    [agentSessions, viewMode, isVisibleAgentSession, matchesWorkspaceFilter, workingSessionIds]
  )

  /** 顶部 TabBar 切换标签页时，自动同步上区子标签到对应分类 */
  const prevActiveTabIdForSubTab = React.useRef<string | null>(activeTabId)
  React.useEffect(() => {
    if (activeTabId === prevActiveTabIdForSubTab.current) return
    prevActiveTabIdForSubTab.current = activeTabId
    if (mode !== 'agent' || viewMode !== 'active' || !activeTabId) return
    if (pinnedAgentSessions.some((s) => s.id === activeTabId)) {
      setAgentSubTab('pinned')
    } else if (workingSessionIds.has(activeTabId)) {
      setAgentSubTab('working')
    }
  }, [activeTabId, mode, viewMode, pinnedAgentSessions, workingSessionIds])

  /** 对话按日期分组（根据 viewMode 过滤归档状态，排除草稿） */
  const conversationGroups = React.useMemo(
    () => {
      const filtered = viewMode === 'archived'
        ? conversations.filter((c) => c.archived && isVisibleConversation(c))
        : conversations.filter((c) => !c.archived && !c.pinned && isVisibleConversation(c))
      return groupByDate(filtered)
    },
    [conversations, viewMode, isVisibleConversation]
  )

  /** 已归档对话数量 */
  const archivedConversationCount = React.useMemo(
    () => conversations.filter((c) => c.archived && isVisibleConversation(c)).length,
    [conversations, isVisibleConversation]
  )

  /** 已归档 Agent 会话数量（当前工作区） */
  const archivedAgentSessionCount = React.useMemo(
    () => agentSessions.filter((s) => s.archived && isVisibleAgentSession(s) && matchesWorkspaceFilter(s)).length,
    [agentSessions, isVisibleAgentSession, matchesWorkspaceFilter]
  )

  // 初始加载对话列表 + 用户档案 + Agent 会话
  React.useEffect(() => {
    ipc
      .listConversations()
      .then((list) => {
        setConversations(list)
      })
      .catch(console.error)
    ipc
      .getUserProfile()
      .then(setUserProfile)
      .catch(console.error)
    ipc
      .listAgentSessions()
      .then(setAgentSessions)
      .catch(console.error)
  }, [setConversations, setUserProfile, setAgentSessions])

  // 窗口聚焦时重新同步列表，修复长时间后前后端不一致
  React.useEffect(() => {
    const handleFocus = (): void => {
      ipc.listConversations().then(setConversations).catch(console.error)
      ipc.listAgentSessions().then(setAgentSessions).catch(console.error)
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [setConversations, setAgentSessions])

  /** 处理导航项点击 */
  const handleItemClick = (item: SidebarItemId): void => {
    if (item === 'pinned') {
      // 置顶按钮仅切换展开/收起，不改变 activeView
      setPinnedExpanded((prev) => !prev)
      return
    }
    setActiveItem(item)
    setActiveView(ITEM_TO_VIEW[item])
  }

  // 切换模式时重置归档视图
  React.useEffect(() => {
    setViewMode('active')
  }, [mode, setViewMode])

  /** 创建新对话（继承当前选中的模型/渠道） */
  const handleNewConversation = async (): Promise<void> => {
    try {
      const meta = await ipc.createConversation(
        undefined,
        selectedModel?.modelId,
        selectedModel?.channelId,
      )
      setConversations((prev) => [meta, ...prev])
      // 打开新标签页
      openSession('chat', meta.id, meta.title)
      // 确保在对话视图
      setActiveView('conversations')
      setActiveItem('all-chats')
      // 根据默认提示词重置选中
      if (promptConfig.defaultPromptId) {
        setSelectedPromptId(promptConfig.defaultPromptId)
      }
    } catch (error) {
      console.error('[侧边栏] 创建对话失败:', error)
      toast.error('创建对话失败')
    }
  }

  /** 选择对话（打开或聚焦标签页） */
  const handleSelectConversation = (id: string, title: string): void => {
    openSession('chat', id, title)
    setActiveView('conversations')
    setActiveItem('all-chats')
  }

  /** 请求删除对话（弹出确认框） */
  const handleRequestDelete = (id: string): void => {
    setPendingDeleteIds([id])
  }

  /** 重命名对话标题 */
  const handleRename = async (id: string, newTitle: string): Promise<void> => {
    try {
      const updated = await ipc.updateConversationTitle(id, newTitle)
      setConversations((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      )
      // 同步更新标签页标题
      setTabs((prev) => updateTabTitle(prev, id, newTitle))
    } catch (error) {
      console.error('[侧边栏] 重命名对话失败:', error)
    }
  }

  /** 切换对话置顶状态 */
  const handleTogglePin = async (id: string): Promise<void> => {
    try {
      const original = conversations.find((c) => c.id === id)
      const updated = await ipc.togglePinConversation(id)
      setConversations((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      )
      // 归档会话被置顶时会自动取消归档
      if (original?.archived && updated.pinned && !updated.archived) {
        toast.success('已取消归档并置顶')
      }
    } catch (error) {
      console.error('[侧边栏] 切换置顶失败:', error)
    }
  }

  /** 切换对话归档状态 */
  const handleToggleArchive = async (id: string): Promise<void> => {
    try {
      const updated = await ipc.toggleArchiveConversation(id)
      setConversations((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      )
      // 归档时自动关闭该对话的标签页，并同步新激活标签的副作用
      // （appMode、currentXxxId 等），避免文件面板/工具栏等 per-tab
      // 状态被遗留为旧值或被错误地置 null。
      if (updated.archived) {
        const wasActive = activeTabId === id
        const tabResult = closeTab(tabs, activeTabId, id)
        setTabs(tabResult.tabs)
        setActiveTabId(tabResult.activeTabId)
        cleanupMapAtoms(id)
        if (wasActive) {
          const newActiveTab = tabResult.activeTabId
            ? tabResult.tabs.find((t) => t.id === tabResult.activeTabId) ?? null
            : null
          syncActiveTabSideEffects(newActiveTab)
        }
      }
      toast.success(updated.archived ? '已归档' : '已取消归档')
    } catch (error) {
      console.error('[侧边栏] 切换归档失败:', error)
    }
  }

  /** 确认删除对话 */
  const handleConfirmDelete = async (): Promise<void> => {
    if (pendingDeleteIds.length === 0) return

    const ids = [...pendingDeleteIds]
    const deletedIds: string[] = []
    let succeeded = 0
    let failed = 0

    if (mode === 'agent') {
      for (const id of ids) {
        try {
          await ipc.deleteAgentSession(id)
          deletedIds.push(id)
          succeeded += 1
        } catch (error) {
          console.error('[侧边栏] 删除 Agent 会话失败:', error)
          failed += 1
        }
      }

      try {
        const sessions = await ipc.listAgentSessions()
        setAgentSessions(sessions)
      } catch (error) {
        console.error('[侧边栏] 刷新 Agent 会话列表失败:', error)
        const deletedSet = new Set(deletedIds)
        setAgentSessions((prev) => prev.filter((session) => !deletedSet.has(session.id)))
      }
    } else {
      for (const id of ids) {
        try {
          await ipc.deleteConversation(id)
          deletedIds.push(id)
          succeeded += 1
        } catch (error) {
          console.error('[侧边栏] 删除对话失败:', error)
          failed += 1
        }
      }

      try {
        const conversations = await ipc.listConversations()
        setConversations(conversations)
      } catch (error) {
        console.error('[侧边栏] 刷新对话列表失败:', error)
        const deletedSet = new Set(deletedIds)
        setConversations((prev) => prev.filter((conversation) => !deletedSet.has(conversation.id)))
      }
    }

    if (deletedIds.length > 0) {
      const deletedSet = new Set(deletedIds)
      let nextTabs = tabs
      let nextActiveTabId = activeTabId
      let activeChanged = false

      for (const id of deletedIds) {
        const wasActive = nextActiveTabId === id
        const tabResult = closeTab(nextTabs, nextActiveTabId, id)
        nextTabs = tabResult.tabs
        nextActiveTabId = tabResult.activeTabId
        cleanupMapAtoms(id)
        activeChanged = activeChanged || wasActive
      }

      setTabs(nextTabs)
      setActiveTabId(nextActiveTabId)
      if (activeChanged) {
        const newActiveTab = nextActiveTabId
          ? nextTabs.find((tab) => tab.id === nextActiveTabId) ?? null
          : null
        syncActiveTabSideEffects(newActiveTab)
      }

      setDraftSessionIds((prev: Set<string>) => {
        const next = new Set([...prev].filter((id) => !deletedSet.has(id)))
        return next.size === prev.size ? prev : next
      })

      setWorkingDone((prev) => {
        const next = new Set([...prev].filter((id) => !deletedSet.has(id)))
        return next.size === prev.size ? prev : next
      })

      if (failed === 0) {
        clearSelection()
      } else {
        setSelectedSessionIds(new Set(ids.filter((id) => !deletedSet.has(id))))
      }
    }

    if (succeeded > 0 && failed === 0) {
      toast.success(ids.length > 1 ? '已批量删除' : '已删除')
    } else if (succeeded > 0) {
      toast.warning('删除部分成功', {
        description: `成功 ${succeeded} 个，失败 ${failed} 个`,
      })
    } else {
      toast.error('删除失败')
    }

    setPendingDeleteIds([])
  }

  /** 创建新 Agent 会话 */
  const handleNewAgentSession = async (): Promise<void> => {
    try {
      const meta = await ipc.createAgentSession(
        undefined,
        agentChannelId || undefined,
        effectiveWorkspaceId || undefined,
      )
      setAgentSessions((prev) => [meta, ...prev])
      // 从全局默认值初始化 per-session 渠道/模型配置
      if (agentChannelId) {
        setSessionChannelMap((prev) => {
          const map = new Map(prev)
          map.set(meta.id, agentChannelId)
          return map
        })
      }
      if (agentModelId) {
        setSessionModelMap((prev) => {
          const map = new Map(prev)
          map.set(meta.id, agentModelId)
          return map
        })
      }
      // 打开新标签页
      openSession('agent', meta.id, meta.title)
      setActiveView('conversations')
      setActiveItem('all-chats')
    } catch (error) {
      console.error('[侧边栏] 创建 Agent 会话失败:', error)
    }
  }

  /** 选择 Agent 会话（打开或聚焦标签页） */
  const handleSelectAgentSession = (id: string, title: string): void => {
    openSession('agent', id, title)
    setActiveView('conversations')
    setActiveItem('all-chats')
    // 清除该会话的"已完成未查看"标记
    setUnviewedCompleted((prev: Set<string>) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  /** 重命名 Agent 会话标题 */
  const handleAgentRename = async (id: string, newTitle: string): Promise<void> => {
    try {
      const updated = await ipc.updateAgentSessionTitle(id, newTitle)
      setAgentSessions((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      )
      // 同步更新标签页标题
      setTabs((prev) => updateTabTitle(prev, id, newTitle))
    } catch (error) {
      console.error('[侧边栏] 重命名 Agent 会话失败:', error)
    }
  }

  /** 切换 Agent 会话置顶状态 */
  const handleTogglePinAgent = async (id: string): Promise<void> => {
    try {
      const original = agentSessions.find((s) => s.id === id)
      const updated = await ipc.togglePinAgentSession(id)
      setAgentSessions((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      )
      // 归档会话被置顶时会自动取消归档
      if (original?.archived && updated.pinned && !updated.archived) {
        toast.success('已取消归档并置顶')
      }
    } catch (error) {
      console.error('[侧边栏] 切换 Agent 会话置顶失败:', error)
    }
  }

  /** 切换 Agent 会话手动工作中状态 */
  const handleToggleManualWorkingAgent = async (id: string): Promise<void> => {
    try {
      const isCurrentlyInWorking = workingSessionIds.has(id)
      if (isCurrentlyInWorking) {
        // 从工作中移出：清除 manualWorking + 清除 workingDone
        const session = agentSessions.find((s) => s.id === id)
        if (session?.manualWorking) {
          const updated = await ipc.toggleManualWorkingAgentSession(id)
          if (isAgentSessionMeta(updated)) {
            setAgentSessions((prev) =>
              prev.map((s) => (s.id === updated.id ? updated : s))
            )
          }
        }
        setWorkingDone((prev) => {
          if (!prev.has(id)) return prev
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      } else {
        // 加入工作中
        const original = agentSessions.find((s) => s.id === id)
        const updated = await ipc.toggleManualWorkingAgentSession(id)
        if (isAgentSessionMeta(updated)) {
          setAgentSessions((prev) =>
            prev.map((s) => (s.id === updated.id ? updated : s))
          )
        }
        if (original?.archived && isAgentSessionMeta(updated) && updated.manualWorking && !updated.archived) {
          toast.success('已取消归档并标记为工作中')
        }
      }
    } catch (error) {
      console.error('[Sidebar] Failed to toggle manual working:', error)
      toast.error('操作失败')
    }
  }

  /** 切换 Agent 会话归档状态 */
  const handleToggleArchiveAgent = async (id: string): Promise<void> => {
    try {
      const updated = await ipc.toggleArchiveAgentSession(id)
      setAgentSessions((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      )
      // 归档时自动关闭该会话的标签页，并同步新激活标签的副作用，
      // 否则 RightSidePanel（依赖 currentAgentSessionIdAtom）会因为
      // 指针被错误置 null 而消失。
      if (updated.archived) {
        const wasActive = activeTabId === id
        const tabResult = closeTab(tabs, activeTabId, id)
        setTabs(tabResult.tabs)
        setActiveTabId(tabResult.activeTabId)
        cleanupMapAtoms(id)
        // 从 Working Done 集合移除
        setWorkingDone((prev) => {
          if (!prev.has(id)) return prev
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        if (wasActive) {
          const newActiveTab = tabResult.activeTabId
            ? tabResult.tabs.find((t) => t.id === tabResult.activeTabId) ?? null
            : null
          syncActiveTabSideEffects(newActiveTab)
        }
      }
      toast.success(updated.archived ? '已归档' : '已取消归档')
    } catch (error) {
      console.error('[侧边栏] 切换 Agent 会话归档失败:', error)
    }
  }

  /** 迁移会话到另一个工作区后的回调 */
  const handleSessionMoved = (updatedSession: AgentSessionMeta, targetWorkspaceName: string): void => {
    setAgentSessions((prev) =>
      prev.map((s) => (s.id === updatedSession.id ? updatedSession : s))
    )
    // 如果迁移的是当前选中的会话，取消选中并关闭标签页
    if (currentAgentSessionId === updatedSession.id) {
      const wasActive = activeTabId === updatedSession.id
      const tabResult = closeTab(tabs, activeTabId, updatedSession.id)
      setTabs(tabResult.tabs)
      setActiveTabId(tabResult.activeTabId)
      // 从 Working Done 集合移除
      setWorkingDone((prev) => {
        if (!prev.has(updatedSession.id)) return prev
        const next = new Set(prev)
        next.delete(updatedSession.id)
        return next
      })
      if (wasActive) {
        const newActiveTab = tabResult.activeTabId
          ? tabResult.tabs.find((t) => t.id === tabResult.activeTabId) ?? null
          : null
        syncActiveTabSideEffects(newActiveTab)
      }
    }
    setMoveTargetId(null)
    toast.success('会话已迁移', {
      description: `已迁移到「${targetWorkspaceName}」，请切换工作区查看`,
    })
  }

  /** Agent 会话按工作区过滤 + 归档过滤 + 排除 draft + 排除 Working */
  const filteredAgentSessions = React.useMemo(
    () => {
      const byWorkspace = agentSessions.filter((s) => matchesWorkspaceFilter(s))
      const visibleByWorkspace = byWorkspace.filter((s) => isVisibleAgentSession(s))
      return viewMode === 'archived'
        ? visibleByWorkspace.filter((s) => s.archived)
        : visibleByWorkspace.filter((s) => !s.archived && !s.pinned && !workingSessionIds.has(s.id))
    },
    [agentSessions, matchesWorkspaceFilter, viewMode, workingSessionIds, isVisibleAgentSession]
  )

  /** Agent 会话按日期分组 */
  const agentSessionGroups = React.useMemo(
    () => groupByDate(filteredAgentSessions),
    [filteredAgentSessions]
  )

  const visibleSessionIds = React.useMemo(() => {
    if (mode === 'chat') {
      return new Set([
        ...pinnedConversations.map((conversation) => conversation.id),
        ...conversationGroups.flatMap((group) => group.items.map((conversation) => conversation.id)),
      ])
    }

    return new Set([
      ...pinnedAgentSessions.map((session) => session.id),
      ...workingGroups.todo.map((session) => session.id),
      ...workingGroups.running.map((session) => session.id),
      ...workingGroups.done.map((session) => session.id),
      ...agentSessionGroups.flatMap((group) => group.items.map((session) => session.id)),
    ])
  }, [
    mode,
    pinnedConversations,
    conversationGroups,
    pinnedAgentSessions,
    workingGroups,
    agentSessionGroups,
  ])

  React.useEffect(() => {
    setSelectedSessionIds((prev) => {
      if (prev.size === 0) return prev
      const next = new Set([...prev].filter((id) => visibleSessionIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [visibleSessionIds])

  React.useEffect(() => {
    clearSelection()
    setSelectionMode(false)
  }, [mode, viewMode, clearSelection])

  const toggleSessionSelection = React.useCallback((id: string) => {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const toggleSelectAllVisibleSessions = React.useCallback(() => {
    setSelectedSessionIds((prev) => {
      const allVisibleIds = [...visibleSessionIds]
      if (allVisibleIds.length === 0) return prev
      const allSelected = allVisibleIds.every((id) => prev.has(id))
      if (allSelected) {
        return new Set([...prev].filter((id) => !visibleSessionIds.has(id)))
      }
      const next = new Set(prev)
      for (const id of allVisibleIds) {
        next.add(id)
      }
      return next
    })
  }, [visibleSessionIds])

  const handleBulkDeleteSelection = React.useCallback((): void => {
    if (selectedSessionIds.size === 0) return
    setPendingDeleteIds([...selectedSessionIds])
  }, [selectedSessionIds])

  const handleBulkArchiveSelection = React.useCallback(async (): Promise<void> => {
    const ids = [...selectedSessionIds]
    if (ids.length === 0) return
    let succeeded = 0
    let failed = 0

    if (mode === 'chat') {
      let nextTabs = tabs
      let nextActiveTabId = activeTabId
      let activeChanged = false
      const updatedConversations = new Map<string, ConversationMeta>()

      for (const id of ids) {
        try {
          const updated = await ipc.toggleArchiveConversation(id)
          updatedConversations.set(id, updated)
          if (updated.archived) {
            const wasActive = nextActiveTabId === id
            const tabResult = closeTab(nextTabs, nextActiveTabId, id)
            nextTabs = tabResult.tabs
            nextActiveTabId = tabResult.activeTabId
            cleanupMapAtoms(id)
            activeChanged = activeChanged || wasActive
          }
          succeeded += 1
        } catch (error) {
          console.error('[侧边栏] 批量归档对话失败:', error)
          failed += 1
        }
      }

      setTabs(nextTabs)
      setActiveTabId(nextActiveTabId)
      if (activeChanged) {
        const newActiveTab = nextActiveTabId
          ? nextTabs.find((tab) => tab.id === nextActiveTabId) ?? null
          : null
        syncActiveTabSideEffects(newActiveTab)
      }
      try {
        setConversations(await ipc.listConversations())
      } catch (error) {
        console.error('[侧边栏] 刷新对话列表失败:', error)
        if (updatedConversations.size > 0) {
          setConversations((prev) =>
            prev.map((conversation) => updatedConversations.get(conversation.id) ?? conversation),
          )
        }
      }
      if (succeeded > 0 && failed === 0) {
        toast.success(viewMode === 'archived' ? '已批量取消归档' : '已批量归档')
      } else if (succeeded > 0) {
        toast.warning('批量操作部分成功', {
          description: `成功 ${succeeded} 个，失败 ${failed} 个`,
        })
      } else {
        toast.error('批量操作失败')
      }
      clearSelection()
      return
    }

    let nextTabs = tabs
    let nextActiveTabId = activeTabId
    let activeChanged = false
    const updatedAgentSessions = new Map<string, AgentSessionMeta>()

    for (const id of ids) {
      try {
        const updated = await ipc.toggleArchiveAgentSession(id)
        updatedAgentSessions.set(id, updated)
        if (updated.archived) {
          const wasActive = nextActiveTabId === id
          const tabResult = closeTab(nextTabs, nextActiveTabId, id)
          nextTabs = tabResult.tabs
          nextActiveTabId = tabResult.activeTabId
          cleanupMapAtoms(id)
          setWorkingDone((prev) => {
            if (!prev.has(id)) return prev
            const next = new Set(prev)
            next.delete(id)
            return next
          })
          activeChanged = activeChanged || wasActive
        }
        succeeded += 1
      } catch (error) {
        console.error('[侧边栏] 批量归档 Agent 会话失败:', error)
        failed += 1
      }
    }

    setTabs(nextTabs)
    setActiveTabId(nextActiveTabId)
    if (activeChanged) {
      const newActiveTab = nextActiveTabId
        ? nextTabs.find((tab) => tab.id === nextActiveTabId) ?? null
        : null
      syncActiveTabSideEffects(newActiveTab)
    }
    try {
      setAgentSessions(await ipc.listAgentSessions())
    } catch (error) {
      console.error('[侧边栏] 刷新 Agent 会话列表失败:', error)
      if (updatedAgentSessions.size > 0) {
        setAgentSessions((prev) =>
          prev.map((session) => updatedAgentSessions.get(session.id) ?? session),
        )
      }
    }
    if (succeeded > 0 && failed === 0) {
      toast.success(viewMode === 'archived' ? '已批量取消归档' : '已批量归档')
    } else if (succeeded > 0) {
      toast.warning('批量操作部分成功', {
        description: `成功 ${succeeded} 个，失败 ${failed} 个`,
      })
    } else {
      toast.error('批量操作失败')
    }
    clearSelection()
  }, [
    activeTabId,
    clearSelection,
    cleanupMapAtoms,
    mode,
    selectedSessionIds,
    setActiveTabId,
    setAgentSessions,
    setConversations,
    setTabs,
    setWorkingDone,
    syncActiveTabSideEffects,
    tabs,
    viewMode,
  ])

  const deleteTargetCount = pendingDeleteIds.length
  const deleteEntityLabel = mode === 'agent' ? '会话' : '对话'
  const deleteDialogTitle = deleteTargetCount > 1 ? `确认删除所选${deleteEntityLabel}` : `确认删除${deleteEntityLabel}`
  const deleteDialogDescription = deleteTargetCount > 1
    ? `删除后将无法恢复，确定要删除选中的 ${deleteTargetCount} 个${deleteEntityLabel}吗？`
    : `删除后将无法恢复，确定要删除这个${deleteEntityLabel}吗？`

  // 删除确认弹窗（折叠/展开态共用）
  const deleteDialog = (
    <AlertDialog
      open={pendingDeleteIds.length > 0}
      onOpenChange={(open) => { if (!open) setPendingDeleteIds([]) }}
    >
      <AlertDialogContent
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void handleConfirmDelete()
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{deleteDialogTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {deleteDialogDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { void handleConfirmDelete() }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  // 迁移会话对话框（折叠/展开态共用）
  const moveDialog = (
    <MoveSessionDialog
      open={moveTargetId !== null}
      onOpenChange={(open) => { if (!open) setMoveTargetId(null) }}
      sessionId={moveTargetId ?? ''}
      currentWorkspaceId={selectedAgentSessionWorkspaceId ?? effectiveWorkspaceId ?? undefined}
      workspaces={workspaces}
      onMoved={handleSessionMoved}
    />
  )

  // SessionListItems 参数
  const sessionListProps: SessionListItemsProps = {
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
    onHoveredIdChange: setHoveredId,
    onToggleSessionSelection: toggleSessionSelection,
    onSelectConversation: handleSelectConversation,
    onRequestDelete: handleRequestDelete,
    onRename: handleRename,
    onTogglePin: handleTogglePin,
    onToggleArchive: handleToggleArchive,
    onSelectAgentSession: handleSelectAgentSession,
    onAgentRename: handleAgentRename,
    onTogglePinAgent: handleTogglePinAgent,
    onToggleManualWorkingAgent: handleToggleManualWorkingAgent,
    onToggleArchiveAgent: handleToggleArchiveAgent,
    onRequestMove: setMoveTargetId,
    onAgentTopResizeStart: handleAgentTopResizeStart,
    onAgentSubTabChange: setAgentSubTab,
    onSetViewMode: setViewMode,
  }
  return (
    <div
      ref={sidebarContainerRef}
      onTransitionEnd={handleSidebarWidthTransitionEnd}
      className="relative h-full overflow-hidden rounded-2xl bg-background shadow-xl transition-[width]"
      style={{
        width: sidebarCollapsed ? collapsedSidebarWidth : expandedSidebarWidth,
        minWidth: sidebarCollapsed ? collapsedSidebarWidth : 180,
        flexShrink: sidebarCollapsed ? 0 : 1,
        transitionDuration: `${SIDEBAR_WIDTH_TRANSITION_MS}ms`,
      }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="h-full w-full titlebar-drag-region" />
      </div>
      {sidebarCollapsed && (
      <div
        aria-hidden={false}
        className="absolute inset-0 flex flex-col items-center"
      >
        {/* macOS 需要避开左上角红绿灯，其他平台保留紧凑呼吸感。 */}
        <div className={cn(isMac ? 'pt-[50px]' : 'pt-2')} />

        {/* 展开按钮 */}
        <div className="pt-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label="展开侧边栏"
                onClick={() => setSidebarCollapsed(false)}
                className="size-[36px] flex items-center justify-center rounded-[10px] text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground transition-colors titlebar-no-drag"
              >
                <PanelLeftOpen size={18} strokeWidth={2.2} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">展开侧边栏</TooltipContent>
          </Tooltip>
        </div>

        {/* 新对话/会话按钮 */}
        <div className="pt-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={mode === 'agent' ? handleNewAgentSession : handleNewConversation}
                className="p-2 rounded-[10px] text-foreground/70 bg-primary/5 hover:bg-primary/10 transition-colors titlebar-no-drag border border-dashed border-[hsl(var(--dashed-border))] hover:border-[hsl(var(--dashed-border-hover))]"
              >
                <Plus size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {mode === 'agent' ? '新会话' : '新对话'}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* 弹性空间 */}
        <div className="flex-1" />

        {/* 用户头像（点击打开设置） */}
        <div className="pb-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSettingsOpen(true)}
                className="relative p-1 rounded-[10px] transition-colors titlebar-no-drag hover:bg-foreground/5"
              >
                <UserAvatar avatar={userProfile.avatar} size={28} />
                {hasEnvironmentIssues && (
                  <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">设置</TooltipContent>
          </Tooltip>
        </div>
      </div>
      )}

      {!sidebarCollapsed && (
      <div
        aria-hidden={false}
        className="absolute inset-0 flex flex-col"
      >
        {/* macOS 需要避开左上角红绿灯，其他平台不占用这块空间。 */}
        <div className={cn(isMac ? 'pt-[30px]' : 'pt-1')}>
          {/* 模式切换器 + 折叠按钮 */}
          <div className="flex items-stretch gap-1.5 px-3">
            <div className="flex-1 min-w-0">
              <ModeSwitcher />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label="收起侧边栏"
                  onClick={() => setSidebarCollapsed(true)}
                  className="h-[44px] w-[44px] flex-shrink-0 flex items-center justify-center rounded-xl bg-muted text-foreground/40 hover:bg-foreground/[0.08] hover:text-foreground/60 transition-colors titlebar-no-drag"
                >
                  <PanelLeftClose size={17} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">收起侧边栏</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Agent 模式：工作区选择器 */}
        {mode === 'agent' && (
          <div className="px-3 pt-2">
            <WorkspaceSelector />
          </div>
        )}

        {/* 新对话/新会话按钮 + 搜索按钮 */}
        <div className="px-3 pt-2 flex items-center gap-1.5">
          <button
            onClick={mode === 'agent' ? handleNewAgentSession : handleNewConversation}
            className="flex-1 flex items-center gap-2 px-3 py-2 rounded-[10px] text-[13px] font-medium text-foreground/70 bg-primary/5 hover:bg-primary/10 transition-colors duration-100 titlebar-no-drag border border-dashed border-[hsl(var(--dashed-border))] hover:border-[hsl(var(--dashed-border-hover))]"
          >
            <Plus size={14} />
            <span>{mode === 'agent' ? '新会话' : '新对话'}</span>
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSearchDialogOpen((prev) => !prev)}
                className="flex-shrink-0 size-[36px] flex items-center justify-center rounded-[10px] text-foreground/40 bg-primary/5 hover:bg-primary/10 hover:text-foreground/60 transition-colors duration-100 titlebar-no-drag border border-dashed border-[hsl(var(--dashed-border))] hover:border-[hsl(var(--dashed-border-hover))]"
              >
                <Search size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">搜索 (⌘F)</TooltipContent>
          </Tooltip>
          <button
            type="button"
            onClick={() => {
              const next = !selectionMode
              setSelectionMode(next)
              if (!next) clearSelection()
            }}
            className={cn(
              'flex-shrink-0 h-[36px] rounded-[10px] px-2.5 text-[12px] font-medium transition-colors titlebar-no-drag border border-dashed',
              selectionMode
                ? 'bg-foreground/[0.08] text-foreground border-foreground/20'
                : 'text-foreground/40 bg-primary/5 hover:bg-primary/10 hover:text-foreground/60 border-[hsl(var(--dashed-border))] hover:border-[hsl(var(--dashed-border-hover))]'
            )}
          >
            多选
          </button>
        </div>

        {selectionMode && (
          <div className="px-3 pt-2">
            <div className="flex items-center justify-between gap-2 rounded-[10px] border border-border/60 bg-muted/40 px-2.5 py-2 text-[12px]">
              <span className="min-w-0 text-foreground/70">
                已选 {selectedSessionIds.size} 项
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleSelectAllVisibleSessions}
                  disabled={visibleSessionIds.size === 0}
                  className="inline-flex items-center rounded-md px-2 py-1 text-foreground/60 hover:bg-foreground/[0.06] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {selectedSessionIds.size > 0 && selectedSessionIds.size === visibleSessionIds.size
                    ? '取消全选'
                    : '全选'}
                </button>
                <button
                  type="button"
                  onClick={() => { void handleBulkArchiveSelection() }}
                  disabled={selectedSessionIds.size === 0}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-foreground/60 hover:bg-foreground/[0.06] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Archive size={12} />
                  <span>{viewMode === 'archived' ? '取消归档' : '归档'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleBulkDeleteSelection}
                  disabled={selectedSessionIds.size === 0}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-foreground/60 hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 size={12} />
                  <span>删除</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Chat 模式：导航菜单（置顶区域） */}
        {mode === 'chat' && pinnedConversations.length > 0 && (
          <div className="flex flex-col gap-1 pt-3 px-3">
            <SidebarItem
              icon={<Pin size={16} />}
              label="置顶对话"
              suffix={
                pinnedConversations.length > 0 ? (
                  pinnedExpanded
                    ? <ChevronDown size={14} className="text-foreground/40" />
                    : <ChevronRight size={14} className="text-foreground/40" />
                ) : undefined
              }
              onClick={() => handleItemClick('pinned')}
            />
          </div>
        )}

        {sessionListMounted && mode === 'agent' && viewMode === 'active' ? (
          <div ref={agentSplitContainerRef} className="flex-1 flex flex-col min-h-0">
            <SessionListItems {...sessionListProps} />
          </div>
        ) : sessionListMounted ? (
          <div className="flex-1 flex flex-col min-h-0">
            <SessionListItems {...sessionListProps} />
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {/* Agent 模式：工作区能力指示器 */}
        {mode === 'agent' && capabilities && (
          <div className="px-3 pb-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => { setSettingsTab('agent'); setSettingsOpen(true) }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-[10px] text-[12px] text-foreground/50 hover:bg-foreground/[0.04] hover:text-foreground/70 transition-colors titlebar-no-drag"
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span className="flex items-center gap-1">
                      <Plug size={13} className="text-foreground/40" />
                      <span className="tabular-nums">{capabilities.mcpServers.filter((s) => s.enabled).length}</span>
                      <span className="text-foreground/30">MCP</span>
                    </span>
                    <span className="text-foreground/20">·</span>
                    <span className="flex items-center gap-1">
                      <Zap size={13} className="text-foreground/40" />
                      <span className="tabular-nums">{capabilities.skills.filter((skill) => skill.enabled).length}</span>
                      <span className="text-foreground/30">Skills</span>
                    </span>
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">点击配置 MCP 与 Skills</TooltipContent>
            </Tooltip>
          </div>
        )}

        {mode === 'agent' && !capabilities && capabilitiesError && (
          <div className="px-3 pb-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => { setSettingsTab('agent'); setSettingsOpen(true) }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-[10px] text-[12px] text-amber-600 hover:bg-amber-500/10 transition-colors titlebar-no-drag"
                >
                  <Plug size={13} />
                  <span className="truncate">能力加载失败</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{capabilitiesError}</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* 底部：用户资料 + 设置入口 */}
        <div className="px-3 pb-3">
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-[10px] transition-colors titlebar-no-drag text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          >
            <UserAvatar avatar={userProfile.avatar} size={28} />
            <span className="flex-1 truncate text-left text-sm">{userProfile.userName}</span>
            <div className="relative flex-shrink-0 text-foreground/40">
              <Settings size={16} />
              {hasEnvironmentIssues && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" />
              )}
            </div>
          </button>
        </div>
      </div>
      )}

      {deleteDialog}
      {moveDialog}
      <SearchDialog />
    </div>
  )
}

