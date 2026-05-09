import { useEffect, useCallback, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { themeAtom } from "@/atoms/theme";
import { activeTabAtom, activeTabIdAtom, tabsAtom, type Tab } from "@/atoms/tabs";
import { agentConfigAtom } from "@/atoms/config";
import {
  agentSessionsListAtom,
  chatSessionsAtom,
  currentSessionIdAtom,
  chatMessagesAtom,
  agentMessagesAtom,
  sessionTitleOverridesAtom,
  deriveSessionTitle,
  timelineToMessages,
} from "@/atoms/sessions";
import { rightPanelOpenAtom } from "@/atoms/sidebar";
import { settingsOpenAtom, searchOpenAtom } from "@/atoms/ui";
import {
  getAgentConfig,
  getSessionMessages,
  getAgentSession,
  getAgentSessionList,
  listSessions,
} from "@/lib/tauri";
import LeftSidebar from "./LeftSidebar";
import MainArea from "./MainArea";
import RightSidePanel from "./RightSidePanel";
import SearchDialog from "./SearchDialog";
import SettingsDialog from "@/components/settings/SettingsDialog";
import BackgroundTasksPanel from "@/components/agent/BackgroundTasksPanel";
import ToastContainer from "@/components/ui/Toast";
import { toast } from "@/atoms/toast";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

export default function AppShell() {
  useKeyboardShortcuts();
  const rightPanelOpen = useAtomValue(rightPanelOpenAtom);
  const theme = useAtomValue(themeAtom);
  const setTheme = useSetAtom(themeAtom);
  const setConfig = useSetAtom(agentConfigAtom);
  const setChatSessions = useSetAtom(chatSessionsAtom);
  const setAgentSessions = useSetAtom(agentSessionsListAtom);
  const setSessionTitleOverrides = useSetAtom(sessionTitleOverridesAtom);
  const setSessionId = useSetAtom(currentSessionIdAtom);
  const setMessages = useSetAtom(chatMessagesAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const tabs = useAtomValue(tabsAtom);
  const setTabs = useSetAtom(tabsAtom);
  const setActiveTabId = useSetAtom(activeTabIdAtom);
  const settingsOpen = useAtomValue(settingsOpenAtom);
  const setSettingsOpen = useSetAtom(settingsOpenAtom);
  const searchOpen = useAtomValue(searchOpenAtom);
  const setSearchOpen = useSetAtom(searchOpenAtom);
  const setAgentMessages = useSetAtom(agentMessagesAtom);
  const loadRequestRef = useRef(0);

  // Load agent config (including theme) on mount
  useEffect(() => {
    getAgentConfig()
      .then((c) => {
        setConfig(c);
        const isDark = c.theme !== "light" && c.theme !== "anthropic_light";
        setTheme(isDark ? "dark" : "light");
      })
      .catch(() => {});
  }, []);

  // Load session lists for cross-mode search
  useEffect(() => {
    const loadSearchSessions = async () => {
      try {
        const [chatList, agentList] = await Promise.all([listSessions(), getAgentSessionList()]);
        setChatSessions(chatList);
        setAgentSessions(agentList);
      } catch {
        // Search data stays best-effort.
      }
    };

    void loadSearchSessions();
  }, [setAgentSessions, setChatSessions]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    const requestId = ++loadRequestRef.current;

    if (!activeTab) {
      setSessionId(null);
      setMessages([]);
      setAgentMessages([]);
      return;
    }

    const sessionId = activeTab.sessionId ?? null;
    setSessionId(sessionId);

    if (!sessionId) {
      if (activeTab.type === "agent") {
        setAgentMessages([]);
      } else {
        setMessages([]);
      }
      return;
    }

    void (async () => {
      try {
        if (activeTab.type === "agent") {
          const timeline = await getAgentSession(sessionId);
          if (loadRequestRef.current !== requestId) return;
          const messages = timelineToMessages(timeline);
          setAgentMessages(messages);
          const derivedTitle = deriveSessionTitle(messages);
          if (derivedTitle) {
            setAgentSessions((prev) =>
              prev.map((session) =>
                session.id === sessionId ? { ...session, title: derivedTitle } : session,
              ),
            );
            setSessionTitleOverrides((prev) => ({ ...prev, [sessionId]: derivedTitle }));
          }
          return;
        }

        const msgs = await getSessionMessages(sessionId);
        if (loadRequestRef.current !== requestId) return;
        const mappedMessages = msgs.map((m) => ({
          id: crypto.randomUUID(),
          role: m.role as "user" | "assistant",
          content: m.content,
          isStreaming: false,
        }));
        setMessages(mappedMessages);
        const derivedTitle = deriveSessionTitle(mappedMessages);
        if (derivedTitle) {
          setChatSessions((prev) =>
            prev.map((session) =>
              session.id === sessionId ? { ...session, title: derivedTitle } : session,
            ),
          );
          setSessionTitleOverrides((prev) => ({ ...prev, [sessionId]: derivedTitle }));
        }
      } catch {
        if (loadRequestRef.current !== requestId) return;
        if (activeTab.type === "agent") {
          setAgentMessages([]);
        } else {
          setMessages([]);
        }
        toast("加载会话消息失败", "error");
      }
    })();
  }, [activeTab, setAgentMessages, setMessages, setSessionId]);

  const handleSelectSession = useCallback((id: string, type: "chat" | "agent") => {
    const existingTab = tabs.find((tab) => tab.type === type && tab.sessionId === id);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    const nextTab: Tab = {
      id: crypto.randomUUID(),
      type,
      title: type === "agent" ? "Agent" : "Chat",
      sessionId: id,
    };
    setTabs((prev) => [...prev, nextTab]);
    setActiveTabId(nextTab.id);
  }, [setActiveTabId, setTabs, tabs]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <LeftSidebar onOpenSettings={() => setSettingsOpen(true)} />
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 overflow-hidden">
          <MainArea onOpenSettings={() => setSettingsOpen(true)} />
        </div>
        {activeTab?.type === "agent" && <BackgroundTasksPanel />}
      </main>
      {activeTab?.type === "agent" && rightPanelOpen && <RightSidePanel />}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectSession={handleSelectSession}
      />
      <ToastContainer />
    </div>
  );
}
