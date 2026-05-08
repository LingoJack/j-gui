import { useState, useEffect, useCallback, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { themeAtom } from "@/atoms/theme";
import { activeTabAtom, tabsAtom } from "@/atoms/tabs";
import { sessionsAtom } from "@/atoms/sessions";
import { agentConfigAtom } from "@/atoms/config";
import { currentSessionIdAtom, chatMessagesAtom, agentMessagesAtom, timelineToMessages } from "@/atoms/sessions";
import { rightPanelOpenAtom } from "@/atoms/sidebar";
import { getAgentConfig, getSessionMessages, getAgentSession, listAgentSessions } from "@/lib/tauri";
import type { SessionInfo } from "@/lib/tauri";
import LeftSidebar from "./LeftSidebar";
import MainArea from "./MainArea";
import RightSidePanel from "./RightSidePanel";
import SearchDialog from "./SearchDialog";
import SettingsDialog from "@/components/settings/SettingsDialog";
import ToastContainer from "@/components/ui/Toast";
import { toast } from "@/atoms/toast";

export default function AppShell() {
  const rightPanelOpen = useAtomValue(rightPanelOpenAtom);
  const theme = useAtomValue(themeAtom);
  const setTheme = useSetAtom(themeAtom);
  const setConfig = useSetAtom(agentConfigAtom);
  const sessions = useAtomValue(sessionsAtom);
  const [agentSessions, setAgentSessions] = useState<SessionInfo[]>([]);
  const setSessionId = useSetAtom(currentSessionIdAtom);
  const setMessages = useSetAtom(chatMessagesAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const setTabs = useSetAtom(tabsAtom);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
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

  // Load agent sessions for cross-mode search
  useEffect(() => {
    listAgentSessions().then(setAgentSessions).catch(() => {});
  }, []);

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
          setAgentMessages(timelineToMessages(timeline));
          return;
        }

        const msgs = await getSessionMessages(sessionId);
        if (loadRequestRef.current !== requestId) return;
        setMessages(
          msgs.map((m) => ({
            id: crypto.randomUUID(),
            role: m.role as "user" | "assistant",
            content: m.content,
            isStreaming: false,
          })),
        );
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

  // Ctrl+K global shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelectSession = useCallback((id: string, type: "chat" | "agent") => {
    // If the active tab doesn't match the session type, switch it
    if (activeTab && activeTab.type !== type) {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTab.id ? { ...tab, type, sessionId: id, title: type === "agent" ? "Agent" : "Chat" } : tab,
        ),
      );
    } else if (activeTab) {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTab.id ? { ...tab, sessionId: id } : tab,
        ),
      );
    }
    setSessionId(id);
  }, [activeTab, setSessionId, setTabs]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <LeftSidebar onOpenSettings={() => setSettingsOpen(true)} />
      <main className="flex-1 min-w-0">
        <MainArea onOpenSettings={() => setSettingsOpen(true)} />
      </main>
      {activeTab?.type === "agent" && rightPanelOpen && <RightSidePanel />}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        chatSessions={sessions}
        agentSessions={agentSessions}
        onSelect={handleSelectSession}
      />
      <ToastContainer />
    </div>
  );
}
