import { useState, useEffect } from "react";
import { useAtomValue } from "jotai";
import { cn } from "@/lib/utils";
import { appModeAtom } from "@/atoms/app-mode";
import ChatView from "@/components/chat/ChatView";
import AgentView from "@/components/agent/AgentView";
import WelcomePage from "./WelcomePage";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { getVersion } from "@/lib/tauri";

interface Tab {
  id: string;
  title: string;
}

interface Props {
  hasProviders: boolean;
  onOpenSettings: () => void;
}

export default function MainArea({ hasProviders, onOpenSettings }: Props) {
  const mode = useAtomValue(appModeAtom);
  const [tabs] = useState<Tab[]>([{ id: "default", title: mode === "chat" ? "Chat" : "Agent" }]);
  const [activeTabId] = useState("default");
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center h-10 border-b border-border bg-card shrink-0">
        <div className="flex-1 flex items-center overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                "flex items-center gap-1.5 h-10 px-3 border-r border-border text-sm cursor-pointer select-none shrink-0 transition-colors",
                tab.id === activeTabId
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              <span className="truncate max-w-[140px]">{mode === "chat" ? "Chat" : "Agent"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tabs.map((tab) => (
          <div key={tab.id} className={cn("h-full", tab.id !== activeTabId && "hidden")}>
            <ErrorBoundary>
              {!hasProviders ? (
                <WelcomePage onOpenSettings={onOpenSettings} version={version} />
              ) : (
                <>
                  {mode === "chat" ? <ChatView /> : <AgentView />}
                </>
              )}
            </ErrorBoundary>
          </div>
        ))}
      </div>
    </div>
  );
}
