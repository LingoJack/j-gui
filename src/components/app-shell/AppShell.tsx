/**
 * AppShell - 应用主布局容器
 *
 * 布局结构：[LeftSidebar 可折叠] | [MainArea: TabBar + TabContent] | [RightSidePanel 可折叠]
 *
 * MainArea 支持多标签页，Settings 视图为独立覆盖。
 */

import * as React from 'react'
import { atom, useAtomValue } from 'jotai'
import { LeftSidebar } from './LeftSidebar'
import { RightSidePanel } from './RightSidePanel'
import { TopRightWindowControls } from './TopRightWindowControls'
import { MainArea } from '@/components/tabs/MainArea'
import { AppShellProvider, type AppShellContextType } from '@/contexts/AppShellContext'
import { appModeAtom } from '@/atoms/app-mode'
import { currentAgentSessionIdAtom, sessionSidePanelOpenAtom } from '@/atoms/agent-atoms'
import { currentConversationIdAtom } from '@/atoms/chat-atoms'
import { activeTabIdAtom, tabsAtom } from '@/atoms/tab-atoms'
import { cn } from '@/lib/utils'

export interface AppShellProps {
  /** Context 值，用于传递给子组件 */
  contextValue: AppShellContextType
}

export function AppShell({ contextValue }: AppShellProps): React.ReactElement {
  const appMode = useAtomValue(appModeAtom)
  const currentSessionId = useAtomValue(currentAgentSessionIdAtom)
  const currentConversationId = useAtomValue(currentConversationIdAtom)
  const tabs = useAtomValue(tabsAtom)
  const activeTabId = useAtomValue(activeTabIdAtom)

  const activeTab = React.useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId],
  )

  const showRightPanel = React.useMemo(() => {
    if (!activeTab) return false
    if (activeTab.type === 'agent') {
      return appMode === 'agent' && !!currentSessionId
    }
    return appMode === 'chat' && !!currentConversationId
  }, [activeTab, appMode, currentSessionId, currentConversationId])

  const activePanelSessionId = React.useMemo(() => {
    if (!activeTab) return null
    // 右侧面板必须跟着当前激活 tab 的真实 sessionId 走，避免 Chat/Agent 共用开关串台。
    return activeTab.type === 'agent' ? currentSessionId : currentConversationId
  }, [activeTab, currentConversationId, currentSessionId])

  const panelAtom = React.useMemo(
    () => (activePanelSessionId ? sessionSidePanelOpenAtom(activePanelSessionId) : null),
    [activePanelSessionId],
  )
  useAtomValue(panelAtom ?? FALLBACK_CLOSED_PANEL_ATOM)

  return (
    <AppShellProvider value={contextValue}>
      <div className="shell-bg h-screen w-screen flex overflow-hidden bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900">
        {/* 左侧边栏：可折叠，带圆角和内边距 */}
        <div className="p-2 pr-0 relative z-[60]">
          <LeftSidebar />
        </div>

        {/* 中间容器：relative z-[60] 使其在 z-50 拖动区域之上 */}
        <div className="flex-1 min-w-0 p-2 relative z-[60]">
          <TopRightWindowControls />
          {/* 主内容区域（TabBar + TabContent） */}
          <MainArea />
        </div>

        {/* 右侧边栏：Agent 文件面板，带圆角和内边距 */}
        {showRightPanel && (
          <RightPanelSlot sessionId={activePanelSessionId} />
        )}
      </div>
    </AppShellProvider>
  )
}

interface RightPanelSlotProps {
  sessionId: string | null
}

function RightPanelSlot({ sessionId }: RightPanelSlotProps): React.ReactElement | null {
  const panelAtom = React.useMemo(
    () => (sessionId ? sessionSidePanelOpenAtom(sessionId) : null),
    [sessionId],
  )
  const isPanelOpen = useAtomValue(panelAtom ?? FALLBACK_CLOSED_PANEL_ATOM)

  return (
    <div className={cn('relative z-[60] transition-[padding] duration-300 ease-in-out', isPanelOpen ? 'p-2 pl-0' : 'p-0')}>
      <RightSidePanel />
    </div>
  )
}

const FALLBACK_CLOSED_PANEL_ATOM = atom(false)
