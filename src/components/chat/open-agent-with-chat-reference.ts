import type { createStore } from 'jotai'
import { toast } from 'sonner'
import { conversationsAtom, currentChatWorkspaceIdAtom } from '@/atoms/chat-atoms'
import {
  agentChannelIdAtom,
  agentPromptSuggestionsAtom,
  agentSessionDraftHtmlAtom,
  agentSessionDraftsAtom,
  agentSessionsAtom,
  agentWorkspacesAtom,
  currentAgentSessionIdAtom,
  currentAgentWorkspaceIdAtom,
} from '@/atoms/agent-atoms'
import { activeViewAtom } from '@/atoms/active-view'
import { appModeAtom } from '@/atoms/app-mode'
import { activeTabIdAtom, openTab, tabsAtom } from '@/atoms/tab-atoms'
import * as ipc from '@/lib/ipc'
import {
  buildChatReferenceDraftHtml,
  buildChatReferenceDraftMarkdown,
} from '@/lib/chat-reference'
import { getEffectiveChatWorkspaceId } from '@/lib/chat-workspace'

interface OpenAgentWithChatReferenceInput {
  store: ReturnType<typeof createStore>
  conversationId: string
  suggestedPrompt?: string | null
}

/**
 * 从 Chat 视图桥接到 Agent：新建会话并预填一个 Chat 引用草稿。
 *
 * 这里不再伪造“迁移历史”能力，而是把引用动作显式落到 Agent 输入框里，
 * 让用户仍然可以改写、补充，然后再发送。
 */
export async function openAgentWithChatReference({
  store,
  conversationId,
  suggestedPrompt,
}: OpenAgentWithChatReferenceInput): Promise<void> {
  const agentChannelId = store.get(agentChannelIdAtom)
  if (!agentChannelId) {
    toast.error('请先在设置中配置 Agent 渠道')
    return
  }

  const conversations = store.get(conversationsAtom)
  const conversationTitle =
    conversations.find((conversation) => conversation.id === conversationId)?.title ??
    '当前 Chat 对话'
  const workspaces = store.get(agentWorkspacesAtom)
  const currentWorkspaceId = store.get(currentChatWorkspaceIdAtom)
  const defaultWorkspaceId = getEffectiveChatWorkspaceId(currentWorkspaceId, workspaces)

  let createdSessionId: string | null = null
  try {
    const session = await ipc.createAgentSession(
      undefined,
      agentChannelId,
      defaultWorkspaceId ?? undefined,
    )
    createdSessionId = session.id

    const draftMarkdown = buildChatReferenceDraftMarkdown(
      conversationId,
      conversationTitle,
    )
    const draftHtml = buildChatReferenceDraftHtml(conversationId, conversationTitle)

    const sessions = await ipc.listAgentSessions()
    store.set(agentSessionsAtom, sessions)

    if (defaultWorkspaceId) {
      store.set(currentAgentWorkspaceIdAtom, defaultWorkspaceId)
      ipc.updateSettings({
        agentWorkspaceId: defaultWorkspaceId,
      }).catch(console.error)
    }

    store.set(agentSessionDraftsAtom, (prev) => {
      const map = new Map(prev)
      map.set(session.id, draftMarkdown)
      return map
    })
    store.set(agentSessionDraftHtmlAtom, (prev) => {
      const map = new Map(prev)
      map.set(session.id, draftHtml)
      return map
    })

    if (suggestedPrompt?.trim()) {
      store.set(agentPromptSuggestionsAtom, (prev) => {
        const map = new Map(prev)
        map.set(session.id, suggestedPrompt)
        return map
      })
    }

    store.set(appModeAtom, 'agent')
    store.set(activeViewAtom, 'conversations')

    const tabs = store.get(tabsAtom)
    const result = openTab(tabs, {
      type: 'agent',
      sessionId: session.id,
      title: session.title ?? '新 Agent 会话',
    })
    store.set(tabsAtom, result.tabs)
    store.set(activeTabIdAtom, result.activeTabId)
    store.set(currentAgentSessionIdAtom, session.id)

    toast.success('已打开 Agent 会话', {
      description: '当前 Chat 已作为引用草稿插入到 Agent 输入框',
    })
  } catch (error) {
    if (createdSessionId) {
      await ipc.deleteAgentSession(createdSessionId).catch((cleanupError) => {
        console.error('[openAgentWithChatReference] 清理失败的 Agent 会话失败:', cleanupError)
      })
    }
    console.error('[openAgentWithChatReference] 打开 Agent 会话失败:', error)
    toast.error('打开 Agent 会话失败')
  }
}
