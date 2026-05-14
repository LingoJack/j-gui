/**
 * AppShell - 应用主布局容器
 *
 * 布局结构：[LeftSidebar 可折叠] | [MainArea: TabBar + TabContent] | [RightSidePanel 可折叠]
 *
 * MainArea 支持多标签页，Settings 视图为独立覆盖。
 */

import * as React from 'react'
import { atom, useAtomValue } from 'jotai'
import {
  COLLAPSED_SIDEBAR_WIDTH,
  DEFAULT_EXPANDED_SIDEBAR_WIDTH,
  LeftSidebar,
} from './LeftSidebar'
import { RightSidePanel } from './RightSidePanel'
import { TopRightWindowControls } from './TopRightWindowControls'
import { MainArea } from '@/components/tabs/MainArea'
import { AppShellProvider, type AppShellContextType } from '@/contexts/AppShellContext'
import { appModeAtom } from '@/atoms/app-mode'
import { sessionSidePanelOpenAtom } from '@/atoms/agent-atoms'
import { activeTabIdAtom, sidebarCollapsedAtom, tabsAtom } from '@/atoms/tab-atoms'
import { cn } from '@/lib/utils'

export interface AppShellProps {
  /** Context 值，用于传递给子组件 */
  contextValue: AppShellContextType
}

const LEFT_SIDEBAR_SLOT_PADDING = 8
const RIGHT_PANEL_SLOT_WIDTH = 328

export function AppShell({ contextValue }: AppShellProps): React.ReactElement {
  const appMode = useAtomValue(appModeAtom)
  const tabs = useAtomValue(tabsAtom)
  const activeTabId = useAtomValue(activeTabIdAtom)
  const sidebarCollapsed = useAtomValue(sidebarCollapsedAtom)

  const activeTab = React.useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId],
  )

  const showRightPanel = React.useMemo(() => {
    if (!activeTab) return false
    if (activeTab.type === 'agent') {
      return appMode === 'agent'
    }
    return appMode === 'chat'
  }, [activeTab, appMode])

  const activePanelSessionId = React.useMemo(() => {
    if (!activeTab) return null
    // 右侧面板必须跟着当前激活 tab 的真实 sessionId 走，避免 Chat/Agent 共用开关串台。
    return activeTab.sessionId
  }, [activeTab])
  const activePanelAtom = React.useMemo(
    () => (activePanelSessionId ? sessionSidePanelOpenAtom(activePanelSessionId) : null),
    [activePanelSessionId],
  )
  const isRightPanelOpen = useAtomValue(activePanelAtom ?? FALLBACK_CLOSED_PANEL_ATOM)
  const leftColumnWidth = (sidebarCollapsed ? COLLAPSED_SIDEBAR_WIDTH : DEFAULT_EXPANDED_SIDEBAR_WIDTH) + LEFT_SIDEBAR_SLOT_PADDING
  const rightColumnWidth = showRightPanel && isRightPanelOpen ? RIGHT_PANEL_SLOT_WIDTH : 0
  return (
    <AppShellProvider value={contextValue}>
      <div
        data-app-shell-layout="true"
        className="shell-bg relative grid h-screen w-screen overflow-hidden bg-gradient-to-br from-zinc-50 to-zinc-100 transition-[grid-template-columns] duration-300 ease-in-out dark:from-zinc-950 dark:to-zinc-900"
        style={{
          gridTemplateColumns: `${leftColumnWidth}px minmax(0, 1fr) ${rightColumnWidth}px`,
        }}
      >
        <MemoizedTopRightWindowControls />

        {/* 左侧边栏：可折叠，带圆角和内边距 */}
        <div className="min-w-0 overflow-hidden p-2 pr-0 relative z-[60]">
          <LeftSidebar />
        </div>

        {/* 三列宽度由 AppShell 统一过渡，避免左右栏各自动画造成主内容跳闪或露出异常空隙。 */}
        <div
          data-main-content-slot="true"
          className="min-w-0 overflow-hidden p-2 relative z-[60]"
        >
          {/* 主内容区域（TabBar + TabContent） */}
          <MemoizedMainArea />
        </div>

        {/* 右侧边栏：Agent 文件面板，带圆角和内边距 */}
        {showRightPanel && (
          <MemoizedRightPanelSlot
            sessionId={activePanelSessionId}
            isPanelOpen={isRightPanelOpen}
          />
        )}
      </div>
    </AppShellProvider>
  )
}

interface RightPanelSlotProps {
  sessionId: string | null
  isPanelOpen: boolean
}

function RightPanelSlot({
  sessionId,
  isPanelOpen,
}: RightPanelSlotProps): React.ReactElement | null {
  if (!sessionId) return null

  return (
    <div
      data-right-panel-slot="true"
      className={cn(
        'relative z-[60] min-w-0 overflow-hidden transition-[padding] duration-300 ease-in-out',
        isPanelOpen ? 'p-2 pl-0' : 'p-0',
      )}
      style={{
        contain: 'layout paint style',
      }}
    >
      <RightSidePanel sessionId={sessionId} />
    </div>
  )
}

const FALLBACK_CLOSED_PANEL_ATOM = atom(false)

// AppShell 会响应左右栏折叠状态；这些重组件不应因为列宽动画而跟着整树重渲染。
const MemoizedTopRightWindowControls = React.memo(TopRightWindowControls)
const MemoizedMainArea = React.memo(MainArea)
const MemoizedRightPanelSlot = React.memo(RightPanelSlot)
