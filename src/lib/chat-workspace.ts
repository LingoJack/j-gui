import type { AgentWorkspace } from '@jgui/shared'

/**
 * 解析 Chat 当前应绑定的有效工作区。
 *
 * Chat 与 Agent 的当前工作区是两套状态，但 Chat 侧保存的 id 可能因为工作区删除而失效；
 * 这里统一回退到第一个可用工作区，避免输入引用、右侧面板、桥接会话继续卡在失效 id 上。
 */
export function getEffectiveChatWorkspaceId(
  currentWorkspaceId: string | null,
  workspaces: AgentWorkspace[],
): string | null {
  if (currentWorkspaceId && workspaces.some((workspace) => workspace.id === currentWorkspaceId)) {
    return currentWorkspaceId
  }

  return workspaces[0]?.id ?? null
}
