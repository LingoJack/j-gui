import { useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { cn } from "@/lib/utils";
import { tabsAtom, activeTabIdAtom, activeTabAtom, type Tab } from "@/atoms/tabs";
import { chatStreamingByTabAtom, agentStreamingByTabAtom } from "@/atoms/sessions";
import { agentConfigAtom } from "@/atoms/config";
import ChatView from "@/components/chat/ChatView";
import AgentView from "@/components/agent/AgentView";
import WelcomePage from "./WelcomePage";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { getVersion, stopAgent } from "@/lib/tauri";
import { MessageSquare, Bot, X, Plus } from "lucide-react";

interface Props {
  onOpenSettings: () => void;
}

export default function MainArea({ onOpenSettings }: Props) {
  const [tabs, setTabs] = useAtom(tabsAtom);
  const [activeTabId, setActiveTabId] = useAtom(activeTabIdAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const chatStreamingByTab = useAtomValue(chatStreamingByTabAtom);
  const agentStreamingByTab = useAtomValue(agentStreamingByTabAtom);
  const config = useAtomValue(agentConfigAtom);
  const [version, setVersion] = useState("");
  const [closeConfirmTabId, setCloseConfirmTabId] = useState<string | null>(null);
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const previousActiveTabRef = useRef<Tab | null>(null);

  const hasProviders = config.providers.length > 0;

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  // On mount, if no tabs exist, create a default chat tab
  useEffect(() => {
    if (tabs.length === 0) {
      const defaultTab: Tab = {
        id: crypto.randomUUID(),
        type: "chat",
        title: "Chat",
        sessionId: null,
      };
      setTabs([defaultTab]);
      setActiveTabId(defaultTab.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl+Tab / Ctrl+Shift+Tab keyboard switching
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        if (tabs.length === 0) return;
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        if (e.shiftKey) {
          const prev = (idx - 1 + tabs.length) % tabs.length;
          setActiveTabId(tabs[prev].id);
        } else {
          const next = (idx + 1) % tabs.length;
          setActiveTabId(tabs[next].id);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tabs, activeTabId, setActiveTabId]);

  // Click outside to dismiss close-confirm popup
  useEffect(() => {
    if (!closeConfirmTabId) return;
    const handleClick = (e: MouseEvent) => {
      if (confirmRef.current && !confirmRef.current.contains(e.target as Node)) {
        setCloseConfirmTabId(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [closeConfirmTabId]);

  useEffect(() => {
    const previousActiveTab = previousActiveTabRef.current;
    if (
      previousActiveTab &&
      previousActiveTab.id !== activeTab?.id &&
      previousActiveTab.type === "agent"
    ) {
      void stopAgent().catch(() => {});
    }
    previousActiveTabRef.current = activeTab;
  }, [activeTab]);
  const isStreaming = (tab: Tab) => {
    if (tab.type === "chat") return chatStreamingByTab[tab.id] ?? false;
    return agentStreamingByTab[tab.id] ?? false;
  };

  const handleAddTab = () => {
    const nextType = activeTab?.type ?? "chat";
    const newTab: Tab = {
      id: crypto.randomUUID(),
      type: nextType,
      title: nextType === "agent" ? "Agent" : "Chat",
      sessionId: null,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const executeCloseTab = async (tabId: string) => {
    // Check tab type from current state for stopAgent decision
    const tab = tabs.find((t) => t.id === tabId);
    if (tab?.type === "agent") {
      await stopAgent().catch(() => {});
    }

    setTabs((prev) => {
      const remaining = prev.filter((t) => t.id !== tabId);
      if (remaining.length === 0) {
        if (!hasProviders) {
          setActiveTabId(null);
          return [];
        }
        const newTab: Tab = {
          id: crypto.randomUUID(),
          type: "chat",
          title: "Chat",
          sessionId: null,
        };
        setActiveTabId(newTab.id);
        return [newTab];
      }
      const closedIdx = prev.findIndex((t) => t.id === tabId);
      if (activeTabId === tabId) {
        const newActiveIdx = Math.min(closedIdx, remaining.length - 1);
        setActiveTabId(remaining[newActiveIdx].id);
      }
      return remaining;
    });
  };

  const handleCloseTab = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;

    if (isStreaming(tab)) {
      setCloseConfirmTabId(tabId);
      return;
    }

    void executeCloseTab(tabId);
  };

  const handleCreateTab = (type: "chat" | "agent") => {
    const newTab: Tab = {
      id: crypto.randomUUID(),
      type,
      title: type === "agent" ? "Agent" : "Chat",
      sessionId: null,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  // Empty state: no tabs — show WelcomePage if no providers, or "create tab" prompt
  if (tabs.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center h-10 border-b border-border bg-card shrink-0 px-3">
          <span className="text-sm text-muted-foreground">标签页</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          {!hasProviders ? (
            <WelcomePage onOpenSettings={onOpenSettings} version={version} />
          ) : (
            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">暂无打开的标签页</p>
              <button
                onClick={() => handleCreateTab("chat")}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity"
              >
                <Plus size={16} />
                新建标签页
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center h-10 border-b border-border bg-card shrink-0">
        <div className="flex-1 flex items-center overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              onMouseEnter={() => {
                hoverTimerRef.current = setTimeout(() => {
                  setHoveredTabId(tab.id);
                }, 300);
              }}
              onMouseLeave={() => {
                if (hoverTimerRef.current) {
                  clearTimeout(hoverTimerRef.current);
                  hoverTimerRef.current = null;
                }
                setHoveredTabId(null);
              }}
              className={cn(
                "flex items-center gap-1.5 h-10 px-3 border-r border-border text-sm cursor-pointer select-none shrink-0 transition-colors relative",
                tab.id === activeTabId
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {tab.type === "chat" ? (
                <MessageSquare size={14} />
              ) : (
                <Bot size={14} />
              )}
              <span className="truncate max-w-[140px]">{tab.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseTab(tab.id);
                }}
                className="p-0.5 rounded hover:bg-muted transition-colors shrink-0"
              >
                <X size={12} />
              </button>
              {hoveredTabId === tab.id && (
                <div className="absolute z-50 top-full left-0 mt-1 bg-card border border-border rounded-md shadow-lg px-3 py-2 text-xs whitespace-nowrap pointer-events-none">
                  <div className="flex items-center gap-1.5 mb-0.5 text-muted-foreground">
                    {tab.type === "chat" ? (
                      <MessageSquare size={12} />
                    ) : (
                      <Bot size={12} />
                    )}
                    <span>{tab.type === "chat" ? "Chat" : "Agent"}</span>
                  </div>
                  <div className="text-foreground font-medium">{tab.title}</div>
                  {tab.sessionId && (
                    <div className="text-muted-foreground mt-0.5 font-mono text-[10px] truncate max-w-[200px]">
                      {tab.sessionId}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={handleAddTab}
          className="p-2 mx-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="新建标签页"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Close-confirm popup */}
      {closeConfirmTabId && (
        <div ref={confirmRef} className="bg-card border border-border rounded-lg shadow-lg p-3 absolute z-50 top-10 right-4">
          <p className="text-sm mb-3">确定关闭？当前正在流式传输</p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setCloseConfirmTabId(null)}
              className="px-3 py-1 rounded text-sm text-muted-foreground hover:bg-accent transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => {
                const id = closeConfirmTabId;
                setCloseConfirmTabId(null);
                void executeCloseTab(id);
              }}
              className="px-3 py-1 rounded text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            >
              确定
            </button>
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab && (
          <ErrorBoundary>
            {!hasProviders ? (
              <WelcomePage onOpenSettings={onOpenSettings} version={version} />
            ) : activeTab.type === "chat" ? (
              <ChatView />
            ) : (
              <AgentView />
            )}
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
