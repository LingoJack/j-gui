import { useState } from "react";
import { useSetAtom } from "jotai";
import { tabsAtom, activeTabIdAtom } from "@/atoms/tabs";
import type { Tab } from "@/atoms/tabs";
import { Bot, X } from "lucide-react";

export default function AgentRecommendBanner() {
  const [dismissed, setDismissed] = useState(false);
  const setTabs = useSetAtom(tabsAtom);
  const setActiveTabId = useSetAtom(activeTabIdAtom);

  if (dismissed) return null;

  const handleSwitch = () => {
    const newTab: Tab = {
      id: crypto.randomUUID(),
      type: "agent",
      title: "Agent",
      sessionId: null,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-t border-border">
      <div className="flex items-center gap-2 min-w-0">
        <Bot size={14} className="shrink-0 text-muted-foreground" />
        <span className="text-xs text-muted-foreground truncate">
          复杂任务建议使用 Agent 模式
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={handleSwitch}
          className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          切换到 Agent
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded hover:bg-accent text-muted-foreground transition-colors"
          aria-label="关闭建议"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
