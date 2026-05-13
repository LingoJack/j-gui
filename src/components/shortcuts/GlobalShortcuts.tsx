/**
 * GlobalShortcuts — 全局快捷键注册 + 初始化组件
 *
 * 在 main.tsx 顶层挂载（类似 AgentListenersInitializer），永不销毁。
 * 负责：
 * 1. 初始化快捷键注册表
 * 2. 从 settings 加载用户自定义配置
 * 3. 注册所有应用级快捷键处理器
 * 4. 注册窗口内会真正生效的快捷键处理器
 */

import { useEffect, useCallback } from 'react'
import { useAtomValue, useSetAtom, useAtom, useStore } from 'jotai'
import { appModeAtom } from '@/atoms/app-mode'
import { settingsOpenAtom, channelFormDirtyAtom, settingsCloseRequestedAtom } from '@/atoms/settings-tab'
import { searchDialogOpenAtom } from '@/atoms/search-atoms'
import { conversationsAtom, currentConversationIdAtom } from '@/atoms/chat-atoms'
import {
  tabsAtom,
  activeTabIdAtom,
  sidebarCollapsedAtom,
} from '@/atoms/tab-atoms'
import { shortcutOverridesAtom, sendWithCmdEnterAtom } from '@/atoms/shortcut-atoms'
import { draftSessionIdsAtom } from '@/atoms/draft-session-atoms'
import {
  agentSessionsAtom,
  currentAgentSessionIdAtom,
  currentAgentWorkspaceIdAtom,
} from '@/atoms/agent-atoms'
import { useCreateSession } from '@/hooks/useCreateSession'
import { useShortcut } from '@/hooks/useShortcut'
import { useCloseTab } from '@/hooks/useCloseTab'
import { useOpenSession } from '@/hooks/useOpenSession'
import * as ipc from '@/lib/ipc'
import {
  initShortcutRegistry,
  updateShortcutOverrides,
} from '@/lib/shortcut-registry'
import { isDraftLikeAgentSession, isDraftLikeConversation } from '@/lib/session-meta'

/**
 * 快捷键初始化 + 全局 Handler 注册
 *
 * 挂载后从 settings 加载自定义配置，并注册所有应用级快捷键。
 */
export function GlobalShortcuts(): null {
  const [appMode, setAppMode] = useAtom(appModeAtom)
  const [settingsOpen, setSettingsOpen] = useAtom(settingsOpenAtom)
  const channelFormDirty = useAtomValue(channelFormDirtyAtom)
  const setSettingsCloseRequested = useSetAtom(settingsCloseRequestedAtom)
  const [searchOpen, setSearchOpen] = useAtom(searchDialogOpenAtom)
  const [, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom)
  const setShortcutOverrides = useSetAtom(shortcutOverridesAtom)
  const shortcutOverrides = useAtomValue(shortcutOverridesAtom)
  const setSendWithCmdEnter = useSetAtom(sendWithCmdEnterAtom)
  const { createChat, createAgent } = useCreateSession()
  const openSession = useOpenSession()
  const conversations = useAtomValue(conversationsAtom)
  const currentConversationId = useAtomValue(currentConversationIdAtom)
  const draftSessionIds = useAtomValue(draftSessionIdsAtom)
  const agentSessions = useAtomValue(agentSessionsAtom)
  const currentAgentSessionId = useAtomValue(currentAgentSessionIdAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const store = useStore()

  // 标签页管理（用于关闭标签页）
  const activeTabId = useAtomValue(activeTabIdAtom)

  // 统一关闭逻辑：与 TabBar.handleClose 共用
  // 含 Agent 子进程 stop + 流式中的确认对话框（修复 Issue #357）
  const { requestClose } = useCloseTab()

  // 初始化：挂载注册表 + 加载用户配置
  useEffect(() => {
    initShortcutRegistry()

    ipc.getSettings().then((settings) => {
      if (settings.shortcutOverrides) {
        setShortcutOverrides(settings.shortcutOverrides)
        updateShortcutOverrides(settings.shortcutOverrides)
      }
      setSendWithCmdEnter(settings.sendWithCmdEnter ?? false)
    }).catch(console.error)
  }, [setShortcutOverrides, setSendWithCmdEnter])

  // 配置变更时同步到注册表
  useEffect(() => {
    updateShortcutOverrides(shortcutOverrides)
  }, [shortcutOverrides])

  // ===== 关闭标签页逻辑 =====

  const handleCloseTab = useCallback(() => {
    // 浮窗优先：有浮窗打开时 Cmd+W 先关闭浮窗而非 tab
    if (settingsOpen) {
      // 渠道表单有未保存内容时，通知 SettingsPanel 弹出确认对话框
      if (channelFormDirty) {
        setSettingsCloseRequested(true)
        return
      }
      setSettingsOpen(false)
      return
    }
    if (searchOpen) {
      setSearchOpen(false)
      return
    }

    if (!activeTabId) return
    requestClose(activeTabId)
  }, [settingsOpen, setSettingsOpen, channelFormDirty, setSettingsCloseRequested, searchOpen, setSearchOpen, activeTabId, requestClose])

  // 注册到快捷键系统，关闭逻辑统一走当前窗口内的快捷键处理。
  useShortcut('close-tab', handleCloseTab)

  const restoreModeSession = useCallback(async (targetMode: 'chat' | 'agent') => {
    if (targetMode === 'chat') {
      if (currentConversationId) {
        const current = conversations.find((c) => c.id === currentConversationId)
        if (current && !draftSessionIds.has(current.id) && !isDraftLikeConversation(current)) {
          openSession('chat', current.id, current.title)
          return
        }
      }

      const currentTabs = store.get(tabsAtom)
      const chatTab = currentTabs.find((tab) => tab.type === 'chat' && !draftSessionIds.has(tab.sessionId))
      if (chatTab) {
        openSession('chat', chatTab.sessionId, chatTab.title)
        return
      }

      const visibleConversation = conversations.find((c) =>
        !c.archived && !draftSessionIds.has(c.id) && !isDraftLikeConversation(c),
      )
      if (visibleConversation) {
        openSession('chat', visibleConversation.id, visibleConversation.title)
        return
      }

      await createChat()
      return
    }

    if (currentAgentSessionId) {
      const current = agentSessions.find((s) => s.id === currentAgentSessionId)
      if (current && !draftSessionIds.has(current.id) && !isDraftLikeAgentSession(current)) {
        openSession('agent', current.id, current.title)
        return
      }
    }

    const currentTabs = store.get(tabsAtom)
    const agentTab = currentTabs.find((tab) => tab.type === 'agent' && !draftSessionIds.has(tab.sessionId))
    if (agentTab) {
      openSession('agent', agentTab.sessionId, agentTab.title)
      return
    }

    const recentAgentSession = agentSessions.find((s) =>
      !s.archived && !draftSessionIds.has(s.id) && !isDraftLikeAgentSession(s),
    )
    if (recentAgentSession) {
      openSession('agent', recentAgentSession.id, recentAgentSession.title)
      return
    }

    if (currentWorkspaceId) {
      const createdSessionId = await createAgent()
      if (createdSessionId) {
        return
      }
    }

    setAppMode('agent')
  }, [agentSessions, conversations, createAgent, createChat, currentAgentSessionId, currentConversationId, currentWorkspaceId, openSession, setAppMode, store, draftSessionIds])

  // ===== 快捷键 Handler =====

  // Cmd+, → 开关设置
  useShortcut(
    'open-settings',
    useCallback(() => {
      if (settingsOpen) {
        if (channelFormDirty) {
          setSettingsCloseRequested(true)
          return
        }
        setSettingsOpen(false)
        return
      }
      setSettingsOpen(true)
    }, [settingsOpen, channelFormDirty, setSettingsCloseRequested, setSettingsOpen]),
  )

  // Cmd+F → 全局搜索
  useShortcut(
    'global-search',
    useCallback(() => setSearchOpen((prev) => !prev), [setSearchOpen]),
  )

  // Cmd+N → 新建对话/会话（根据当前模式）
  useShortcut(
    'new-session',
    useCallback(() => {
      if (appMode === 'agent') {
        createAgent()
      } else {
        createChat()
      }
    }, [appMode, createAgent, createChat]),
  )

  // Cmd+B → 切换侧边栏
  useShortcut(
    'toggle-sidebar',
    useCallback(
      () => setSidebarCollapsed((prev) => !prev),
      [setSidebarCollapsed],
    ),
  )

  // Cmd+Shift+M → 切换模式
  useShortcut(
    'toggle-mode',
    useCallback(
      () => { void restoreModeSession(appMode === 'chat' ? 'agent' : 'chat') },
      [appMode, restoreModeSession],
    ),
  )

  // Cmd+K → 清除上下文（通过 CustomEvent 分发到 ChatInput）
  useShortcut(
    'clear-context',
    useCallback(() => {
      window.dispatchEvent(new CustomEvent('jgui:clear-context'))
    }, []),
  )

  // Cmd+L → 聚焦输入框（通过 CustomEvent 分发到 ChatInput/AgentView）
  useShortcut(
    'focus-input',
    useCallback(() => {
      window.dispatchEvent(new CustomEvent('jgui:focus-input'))
    }, []),
  )

  // Cmd+Shift+Backspace → 停止 Agent（通过 CustomEvent 分发到 ChatView/AgentView）
  useShortcut(
    'stop-generation',
    useCallback(() => {
      window.dispatchEvent(new CustomEvent('jgui:stop-generation'))
    }, []),
  )

  return null
}
