/**
 * 渲染进程入口 — Tauri 原生实现
 */

import React, { useEffect, useMemo, useRef } from 'react'
import ReactDOM from 'react-dom/client'
import { useSetAtom, useAtomValue, useStore } from 'jotai'
import App from './App'
import { themeModeAtom, themeStyleAtom, systemIsDarkAtom, applyThemeToDOM, initializeTheme } from './atoms/theme'
import {
  agentChannelIdAtom, agentModelIdAtom, agentChannelIdsAtom,
  agentWorkspacesAtom, currentAgentWorkspaceIdAtom, currentAgentSessionIdAtom,
  workspaceCapabilitiesVersionAtom, workspaceFilesVersionAtom,
  agentThinkingAtom, agentEffortAtom, agentMaxBudgetUsdAtom, agentMaxTurnsAtom,
  agentSettingsReadyAtom, dockBadgeCountAtom, unviewedCompletedSessionIdsAtom,
} from './atoms/agent-atoms'
import { notificationsEnabledAtom, notificationSoundEnabledAtom, notificationSoundsAtom, initializeNotifications } from './atoms/notifications'
import { stickyUserMessageEnabledAtom, initializeUiPreferences } from './atoms/ui-preferences'
import { useGlobalAgentListeners } from './hooks/useGlobalAgentListeners'
import { useGlobalChatListeners } from './hooks/useGlobalChatListeners'
import { tabsAtom, activeTabIdAtom } from './atoms/tab-atoms'
import type { TabItem } from './atoms/tab-atoms'
import { currentConversationIdAtom, channelsAtom, channelsLoadedAtom, selectedModelAtom } from './atoms/chat-atoms'
import { appModeAtom } from './atoms/app-mode'
import { Toaster } from './components/ui/sonner'
import { diffCapabilities } from '@proma/shared'
import type { WorkspaceCapabilities } from '@proma/shared'
import { showCapabilityChangeToasts } from './lib/capabilities-toast'
import { GlobalShortcuts } from './components/shortcuts/GlobalShortcuts'
import { TabSwitcher } from './components/tabs/TabSwitcher'
import './styles/globals.css'
import 'katex/dist/katex.min.css'
import * as ipc from '@/lib/ipc'

// ============================================================
// Initializer Components
// ============================================================

function ThemeInitializer(): null {
  const setThemeMode = useSetAtom(themeModeAtom)
  const setThemeStyle = useSetAtom(themeStyleAtom)
  const setSystemIsDark = useSetAtom(systemIsDarkAtom)
  const themeMode = useAtomValue(themeModeAtom)
  const themeStyle = useAtomValue(themeStyleAtom)
  const systemIsDark = useAtomValue(systemIsDarkAtom)

  useEffect(() => {
    let isMounted = true
    let cleanup: (() => void) | undefined
    initializeTheme(setThemeMode, setSystemIsDark, setThemeStyle).then((fn) => {
      if (isMounted) cleanup = fn
      else fn()
    })
    return () => { isMounted = false; cleanup?.() }
  }, [setThemeMode, setSystemIsDark, setThemeStyle])

  const themeSignature = useMemo(() => {
    if (themeMode === 'special') return `special:${themeStyle}`
    if (themeMode === 'system') return `system:${systemIsDark ? 'dark' : 'light'}`
    return themeMode
  }, [themeMode, themeStyle, systemIsDark])

  useEffect(() => { applyThemeToDOM(themeMode, themeStyle, systemIsDark) }, [themeSignature])
  return null
}

function AgentSettingsInitializer(): null {
  const setAgentChannelId = useSetAtom(agentChannelIdAtom)
  const setAgentModelId = useSetAtom(agentModelIdAtom)
  const setAgentChannelIds = useSetAtom(agentChannelIdsAtom)
  const setAgentWorkspaces = useSetAtom(agentWorkspacesAtom)
  const setCurrentWorkspaceId = useSetAtom(currentAgentWorkspaceIdAtom)
  const bumpCapabilities = useSetAtom(workspaceCapabilitiesVersionAtom)
  const bumpFiles = useSetAtom(workspaceFilesVersionAtom)
  const setThinking = useSetAtom(agentThinkingAtom)
  const setEffort = useSetAtom(agentEffortAtom)
  const setMaxBudget = useSetAtom(agentMaxBudgetUsdAtom)
  const setMaxTurns = useSetAtom(agentMaxTurnsAtom)
  const setAgentSettingsReady = useSetAtom(agentSettingsReadyAtom)
  const setChannels = useSetAtom(channelsAtom)
  const setChannelsLoaded = useSetAtom(channelsLoadedAtom)
  const store = useStore()
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const prevCapabilitiesRef = useRef<WorkspaceCapabilities | null>(null)
  const suppressToastRef = useRef(true)

  useEffect(() => {
    Promise.all([ipc.listChannels(), ipc.getSettings()]).then(([channels, settings]) => {
      setChannels(channels)
      setChannelsLoaded(true)
      const channelIds = new Set(channels.map((c: any) => c.id))
      const chatModel = store.get(selectedModelAtom)
      if (chatModel && !channelIds.has(chatModel.channelId)) store.set(selectedModelAtom, null)
      if (settings.agentChannelId && channelIds.has(settings.agentChannelId)) setAgentChannelId(settings.agentChannelId)
      if (settings.agentModelId) setAgentModelId(settings.agentModelId)
      if (settings.agentChannelIds?.length) setAgentChannelIds(settings.agentChannelIds.filter((id: string) => channelIds.has(id)))
      if (settings.agentThinking) setThinking(settings.agentThinking)
      if (settings.agentEffort) setEffort(settings.agentEffort)
      if (settings.agentMaxBudgetUsd != null) setMaxBudget(settings.agentMaxBudgetUsd)
      if (settings.agentMaxTurns != null) setMaxTurns(settings.agentMaxTurns)
      ipc.listAgentWorkspaces().then((ws: any[]) => {
        setAgentWorkspaces(ws)
        if (settings.agentWorkspaceId && ws.some((w: any) => w.id === settings.agentWorkspaceId)) setCurrentWorkspaceId(settings.agentWorkspaceId)
        else if (ws.length > 0) setCurrentWorkspaceId(ws[0]!.id)
        setAgentSettingsReady(true)
      }).catch(() => setAgentSettingsReady(true))
    }).catch(() => setAgentSettingsReady(true))
  }, [])

  useEffect(() => {
    suppressToastRef.current = true
    prevCapabilitiesRef.current = null
    if (!currentWorkspaceId) return
    const ws = workspaces.find((w: any) => w.id === currentWorkspaceId)
    if (!ws) return
    ipc.getWorkspaceCapabilities(ws.slug).then((caps: WorkspaceCapabilities) => {
      prevCapabilitiesRef.current = caps
      suppressToastRef.current = false
    }).catch(console.error)
  }, [currentWorkspaceId, workspaces])

  useEffect(() => {
    const u1 = ipc.onCapabilitiesChanged(() => {
      const ws = workspaces.find((w: any) => w.id === currentWorkspaceId)
      if (ws) ipc.getWorkspaceCapabilities(ws.slug).then((newCaps: WorkspaceCapabilities) => {
        const prev = prevCapabilitiesRef.current
        if (prev && !suppressToastRef.current) showCapabilityChangeToasts(diffCapabilities(prev, newCaps))
        prevCapabilitiesRef.current = newCaps
        suppressToastRef.current = false
      }).catch(console.error)
      bumpCapabilities((v) => v + 1)
    })
    const u2 = ipc.onWorkspaceFilesChanged(() => bumpFiles((v) => v + 1))
    return () => { u1(); u2() }
  }, [bumpCapabilities, bumpFiles, currentWorkspaceId, workspaces])

  return null
}

function NotificationsInitializer(): null {
  const setEnabled = useSetAtom(notificationsEnabledAtom)
  const setSoundEnabled = useSetAtom(notificationSoundEnabledAtom)
  const setSounds = useSetAtom(notificationSoundsAtom)
  useEffect(() => { initializeNotifications(setEnabled, setSoundEnabled, setSounds) }, [setEnabled, setSoundEnabled, setSounds])
  return null
}

function DockBadgeInitializer(): null {
  const count = useAtomValue(dockBadgeCountAtom)
  const notificationsEnabled = useAtomValue(notificationsEnabledAtom)
  const currentSessionId = useAtomValue(currentAgentSessionIdAtom)
  const setUnviewedCompleted = useSetAtom(unviewedCompletedSessionIdsAtom)
  const badgeCount = notificationsEnabled ? count : 0
  useEffect(() => { ipc.setDockBadgeCount(badgeCount).catch(console.error) }, [badgeCount])
  useEffect(() => {
    const clear = () => {
      if (!document.hasFocus() || !currentSessionId) return
      setUnviewedCompleted((prev: Set<string>) => { if (!prev.has(currentSessionId)) return prev; const n = new Set(prev); n.delete(currentSessionId); return n })
    }
    clear()
    window.addEventListener('focus', clear)
    document.addEventListener('visibilitychange', clear)
    return () => { window.removeEventListener('focus', clear); document.removeEventListener('visibilitychange', clear) }
  }, [currentSessionId, setUnviewedCompleted])
  return null
}

function UiPreferencesInitializer(): null {
  const setSticky = useSetAtom(stickyUserMessageEnabledAtom)
  useEffect(() => { initializeUiPreferences(setSticky) }, [setSticky])
  return null
}

function ChatListenersInitializer(): null { useGlobalChatListeners(); return null }
function AgentListenersInitializer(): null { useGlobalAgentListeners(); return null }

function TabStatePersistenceInitializer(): null {
  const store = useStore()
  const restoredRef = useRef(false)
  useEffect(() => {
    Promise.all([ipc.getSettings(), ipc.listConversations(), ipc.listAgentSessions()]).then(([settings, conversations, agentSessions]) => {
      const tabState = settings.tabState
      if (!tabState?.tabs?.length) { restoredRef.current = true; return }
      const validSessionIds = new Set([...conversations.map((c: any) => c.id), ...agentSessions.map((s: any) => s.id)])
      const validTabs = tabState.tabs.filter((t: any) => t?.sessionId && validSessionIds.has(t.sessionId))
      if (!validTabs.length) { restoredRef.current = true; return }
      const activeTabId = tabState.activeTabId && validTabs.some((t: any) => t.id === tabState.activeTabId) ? tabState.activeTabId : validTabs[0]?.id ?? null
      store.set(tabsAtom, validTabs)
      store.set(activeTabIdAtom, activeTabId)
      const activeTab = validTabs.find((t: any) => t.id === activeTabId)
      if (activeTab) { store.set(appModeAtom, activeTab.type); store.set(activeTab.type === 'chat' ? currentConversationIdAtom : currentAgentSessionIdAtom, activeTab.sessionId) }
    }).catch(console.error).finally(() => { restoredRef.current = true })
  }, [store])
  useEffect(() => {
    let timer: any = null
    const save = () => { ipc.updateSettings({ tabState: { tabs: store.get(tabsAtom), activeTabId: store.get(activeTabIdAtom) } }).catch(console.error) }
    const debounced = () => { if (!restoredRef.current) return; if (timer) clearTimeout(timer); timer = setTimeout(save, 500) }
    const u1 = store.sub(tabsAtom, debounced)
    const u2 = store.sub(activeTabIdAtom, debounced)
    const beforeUnload = () => { if (timer) clearTimeout(timer); save() }
    window.addEventListener('beforeunload', beforeUnload)
    return () => { u1(); u2(); if (timer) clearTimeout(timer); window.removeEventListener('beforeunload', beforeUnload) }
  }, [store])
  return null
}

// ============================================================
// Render
// ============================================================

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeInitializer />
    <AgentSettingsInitializer />
    <NotificationsInitializer />
    <DockBadgeInitializer />
    <UiPreferencesInitializer />
    <ChatListenersInitializer />
    <AgentListenersInitializer />
    <TabStatePersistenceInitializer />
    <GlobalShortcuts />
    <TabSwitcher />
    <App />
    <Toaster position="top-right" />
  </React.StrictMode>
)
