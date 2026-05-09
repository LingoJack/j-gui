import { useState, useCallback } from "react";
import { useAtomValue } from "jotai";
import { tabsAtom } from "@/atoms/tabs";
import { agentMessagesByTabAtom, agentStreamingByTabAtom } from "@/atoms/sessions";
import { stopAgent } from "@/lib/tauri";
import {
  ChevronDown,
  ChevronUp,
  Bot,
  Loader2,
  X,
  Square,
} from "lucide-react";

interface ActiveAgentTab {
  tabId: string;
  title: string;
  streaming: boolean;
  messageCount: number;
}

export default function BackgroundTasksPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const tabs = useAtomValue(tabsAtom);
  const streamingByTab = useAtomValue(agentStreamingByTabAtom);
  const messagesByTab = useAtomValue(agentMessagesByTabAtom);

  const activeTabs: ActiveAgentTab[] = tabs
    .filter((tab) => tab.type === "agent")
    .map((tab) => ({
      tabId: tab.id,
      title: tab.title,
      streaming: streamingByTab[tab.id] ?? false,
      messageCount: (messagesByTab[tab.id] ?? []).length,
    }));

  const hasStreaming = activeTabs.some((t) => t.streaming);

  // Don't render at all if no agent tabs have any activity
  const hasAnyAgents = activeTabs.length > 0;
  if (!hasAnyAgents) return null;

  const handleCancel = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await stopAgent();
    } catch {
      // best-effort stop
    }
  }, []);

  return (
    <div
      className={`border-t border-border bg-card transition-all ${
        hasStreaming || !collapsed ? "" : "hidden"
      }`}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
      >
        {collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        <Bot size={12} className="text-primary" />
        <span className="font-medium">Agent 任务</span>
        {hasStreaming && (
          <Loader2 size={12} className="animate-spin text-primary" />
        )}
        <span className="ml-auto">{activeTabs.length} 标签页</span>
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="px-3 py-1.5 space-y-1 max-h-32 overflow-y-auto">
          {activeTabs.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-1">无 Agent 标签页</p>
          ) : (
            activeTabs.map((agentTab) => (
              <div
                key={agentTab.tabId}
                className="flex items-center gap-2 text-xs py-1"
              >
                <Bot size={12} className="text-muted-foreground shrink-0" />
                <span className="truncate max-w-[160px]">{agentTab.title}</span>
                <span className="text-[10px] text-muted-foreground">
                  {agentTab.messageCount} 条消息
                </span>
                {agentTab.streaming && (
                  <>
                    <span className="text-[10px] text-primary flex items-center gap-1">
                      <Loader2 size={10} className="animate-spin" />
                      运行中
                    </span>
                    <button
                      onClick={handleCancel}
                      className="ml-auto p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="取消"
                    >
                      <Square size={10} />
                    </button>
                  </>
                )}
                {!agentTab.streaming && (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    <X size={10} className="inline" /> 已停止
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
