/**
 * RightSidePanel — 右侧边栏容器
 *
 * 在 Agent 模式下显示文件面板，样式与 LeftSidebar 一致。
 * 从全局 atom 读取当前会话 ID 和路径。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { appModeAtom } from '@/atoms/app-mode'
import { agentSessionPathMapAtom } from '@/atoms/agent-atoms'
import { SidePanel } from '@/components/agent/SidePanel'

interface RightSidePanelProps {
  /** 当前激活 tab 的会话 ID，避免右侧内容和 AppShell 顶层按钮读到不同来源。 */
  sessionId: string
}

export function RightSidePanel({ sessionId }: RightSidePanelProps): React.ReactElement | null {
  const appMode = useAtomValue(appModeAtom)
  const sessionPathMap = useAtomValue(agentSessionPathMapAtom)

  if (appMode === 'agent') {
    const sessionPath = sessionPathMap.get(sessionId) ?? null
    return (
      <SidePanel sessionId={sessionId} sessionPath={sessionPath} mode="agent" />
    )
  }

  if (appMode === 'chat') {
    return (
      <SidePanel sessionId={sessionId} sessionPath={null} mode="chat" />
    )
  }

  return null
}
