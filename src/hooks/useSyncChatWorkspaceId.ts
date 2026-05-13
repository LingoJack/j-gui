import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { agentWorkspacesAtom } from '@/atoms/agent-atoms'
import { currentChatWorkspaceIdAtom } from '@/atoms/chat-atoms'
import { getEffectiveChatWorkspaceId } from '@/lib/chat-workspace'
import * as ipc from '@/lib/ipc'

/**
 * 维护 Chat 工作区选择的运行时自愈。
 *
 * 当持久化下来的 chatWorkspaceId 指向已删除工作区时，Chat 输入和右侧文件区都会失效；
 * 这里统一把它纠偏到第一个可用工作区，并同步写回设置。
 */
export function useSyncChatWorkspaceId(): void {
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const [currentChatWorkspaceId, setCurrentChatWorkspaceId] = useAtom(currentChatWorkspaceIdAtom)

  React.useEffect(() => {
    const nextWorkspaceId = getEffectiveChatWorkspaceId(currentChatWorkspaceId, workspaces)
    if (nextWorkspaceId === currentChatWorkspaceId) return

    setCurrentChatWorkspaceId(nextWorkspaceId)
    ipc.updateSettings({ chatWorkspaceId: nextWorkspaceId }).catch(console.error)
  }, [currentChatWorkspaceId, setCurrentChatWorkspaceId, workspaces])
}
