/**
 * RightSidePanel — 右侧边栏容器
 *
 * 在 Agent 模式下显示文件面板，样式与 LeftSidebar 一致。
 * 从全局 atom 读取当前会话 ID 和路径。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { appModeAtom } from '@/atoms/app-mode'
import { currentAgentSessionIdAtom, agentSessionPathMapAtom } from '@/atoms/agent-atoms'
import { currentConversationIdAtom } from '@/atoms/chat-atoms'
import { SidePanel } from '@/components/agent/SidePanel'

export function RightSidePanel(): React.ReactElement | null {
  const appMode = useAtomValue(appModeAtom)
  const currentSessionId = useAtomValue(currentAgentSessionIdAtom)
  const currentConversationId = useAtomValue(currentConversationIdAtom)
  const sessionPathMap = useAtomValue(agentSessionPathMapAtom)

  if (appMode === 'agent' && currentSessionId) {
    const sessionPath = sessionPathMap.get(currentSessionId) ?? null
    return (
      <SidePanel sessionId={currentSessionId} sessionPath={sessionPath} mode="agent" />
    )
  }

  if (appMode === 'chat' && currentConversationId) {
    return (
      <SidePanel sessionId={currentConversationId} sessionPath={null} mode="chat" />
    )
  }

  return null
}
