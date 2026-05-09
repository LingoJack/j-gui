import { useEffect, useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { sidebarOpenAtom } from "@/atoms/sidebar";
import { settingsOpenAtom, searchOpenAtom } from "@/atoms/ui";
import {
  tabsAtom,
  activeTabIdAtom,
  activeTabAtom,
} from "@/atoms/tabs";
import {
  chatStreamingAtom,
  agentStreamingAtom,
  chatStreamingByTabAtom,
  agentStreamingByTabAtom,
  chatMessagesAtom,
  agentMessagesAtom,
  currentSessionIdAtom,
  chatDraftsAtom,
  agentDraftsAtom,
} from "@/atoms/sessions";
import { stopAgent, clearSession } from "@/lib/tauri";
import { toast } from "@/atoms/toast";

export function useKeyboardShortcuts() {
  const sidebarOpen = useAtomValue(sidebarOpenAtom);
  const setSidebarOpen = useSetAtom(sidebarOpenAtom);
  const setSettingsOpen = useSetAtom(settingsOpenAtom);
  const setSearchOpen = useSetAtom(searchOpenAtom);
  const tabs = useAtomValue(tabsAtom);
  const activeTabId = useAtomValue(activeTabIdAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const setTabs = useSetAtom(tabsAtom);
  const setActiveTabId = useSetAtom(activeTabIdAtom);
  const chatStreaming = useAtomValue(chatStreamingAtom);
  const agentStreaming = useAtomValue(agentStreamingAtom);
  const currentSessionId = useAtomValue(currentSessionIdAtom);
  const setChatStreamingByTab = useSetAtom(chatStreamingByTabAtom);
  const setAgentStreamingByTab = useSetAtom(agentStreamingByTabAtom);
  const setChatMessages = useSetAtom(chatMessagesAtom);
  const setAgentMessages = useSetAtom(agentMessagesAtom);
  const setCurrentSessionId = useSetAtom(currentSessionIdAtom);
  const setTabsAtom = useSetAtom(tabsAtom);
  const setChatDrafts = useSetAtom(chatDraftsAtom);
  const setAgentDrafts = useSetAtom(agentDraftsAtom);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.shiftKey) {
          if (e.key === "M") {
            e.preventDefault();
            handleToggleMode();
          } else if (e.key === "Backspace") {
            e.preventDefault();
            handleStopGeneration();
          }
          return;
        }

        switch (e.key) {
          case ",":
            e.preventDefault();
            setSettingsOpen((prev) => !prev);
            break;
          case "n":
            e.preventDefault();
            handleNewSession();
            break;
          case "b":
            e.preventDefault();
            setSidebarOpen(!sidebarOpen);
            break;
          case "f":
            e.preventDefault();
            setSearchOpen(true);
            break;
          case "l":
            e.preventDefault();
            focusCurrentInput();
            break;
          case "k":
            e.preventDefault();
            handleClearContext();
            break;
          case "w":
            e.preventDefault();
            handleCloseTab();
            break;
        }
      }
    },
    [
      setSettingsOpen,
      setSidebarOpen,
      sidebarOpen,
      setSearchOpen,
      activeTab,
      activeTabId,
      currentSessionId,
      tabs,
      chatStreaming,
      agentStreaming,
      setTabs,
      setActiveTabId,
      setChatStreamingByTab,
      setAgentStreamingByTab,
      setChatMessages,
      setAgentMessages,
      setCurrentSessionId,
      setTabsAtom,
      setChatDrafts,
      setAgentDrafts,
    ]
  );

  function handleToggleMode() {
    const currentType = activeTab?.type;
    const targetType: "chat" | "agent" = currentType === "agent" ? "chat" : "agent";
    const existingTab = tabs.find((t) => t.type === targetType);
    if (existingTab) {
      setActiveTabId(existingTab.id);
    } else {
      const newTab = {
        id: crypto.randomUUID(),
        type: targetType,
        title: targetType === "chat" ? "Chat" : "Agent",
        sessionId: null as string | null,
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    }
  }

  function handleNewSession() {
    if (!activeTab) return;
    const type: "chat" | "agent" = activeTab.type;
    const newTab = {
      id: crypto.randomUUID(),
      type,
      title: type === "chat" ? "Chat" : "Agent",
      sessionId: null as string | null,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    if (type === "chat") {
      setChatMessages([]);
      setChatDrafts((prev) => ({ ...prev, [newTab.id]: "" }));
    } else {
      setAgentMessages([]);
      setAgentDrafts((prev) => ({ ...prev, [newTab.id]: "" }));
    }
    setCurrentSessionId(null);
  }

  function handleStopGeneration() {
    if (!activeTabId) return;
    if (activeTab?.type === "agent" && agentStreaming) {
      setAgentStreamingByTab((prev) => ({ ...prev, [activeTabId]: false }));
      stopAgent().catch(() => {});
    }
    if (activeTab?.type === "chat" && chatStreaming) {
      setChatStreamingByTab((prev) => ({ ...prev, [activeTabId]: false }));
    }
  }

  function handleCloseTab() {
    if (tabs.length <= 1) return;
    if (!activeTabId) return;

    const isStreaming = activeTab?.type === "agent" ? agentStreaming : chatStreaming;
    if (isStreaming) {
      const confirmed = window.confirm("当前正在生成，确定关闭？");
      if (!confirmed) return;
      handleStopGeneration();
    }

    const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
    const newTabs = tabs.filter((t) => t.id !== activeTabId);
    setTabs(newTabs);

    if (newTabs.length > 0) {
      const nextIndex = Math.min(currentIndex, newTabs.length - 1);
      setActiveTabId(newTabs[nextIndex].id);
    } else {
      setActiveTabId(null);
    }
  }

  function focusCurrentInput() {
    const input = document.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder*="输入"]'
    );
    if (input) {
      input.focus();
    }
  }

  function handleClearContext() {
    if (!currentSessionId) return;
    if (activeTab?.type === "agent") {
      setAgentMessages([]);
    } else {
      setChatMessages([]);
    }
    clearSession(currentSessionId)
      .then(() => toast("上下文已清空", "success"))
      .catch((e) => toast(`清空失败: ${String(e)}`, "error"));
  }

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
