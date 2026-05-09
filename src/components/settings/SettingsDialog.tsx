import { useState } from "react";
import { X } from "lucide-react";
import ModelsTab from "@/components/settings/ModelsTab";
import GeneralTab from "@/components/settings/GeneralTab";
import AliasTab from "@/components/settings/AliasTab";
import SkillsTab from "@/components/settings/SkillsTab";
import HooksTab from "@/components/settings/HooksTab";
import McpTab from "@/components/settings/McpTab";
import ToolsTab from "@/components/settings/ToolsTab";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

type TabId = "models" | "general" | "aliases" | "skills" | "hooks" | "mcp" | "tools";

const TABS: { id: TabId; label: string }[] = [
  { id: "models", label: "模型" },
  { id: "general", label: "通用" },
  { id: "aliases", label: "别名" },
  { id: "skills", label: "Skills" },
  { id: "hooks", label: "Hooks" },
  { id: "mcp", label: "MCP" },
  { id: "tools", label: "工具" },
];

export default function SettingsDialog({ open, onClose }: Props) {
  const [tab, setTab] = useState<TabId>("models");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[600px] max-h-[80vh] flex flex-col bg-card rounded-xl border border-border shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-base font-semibold">设置</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left nav */}
          <div className="w-40 border-r border-border shrink-0 py-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm transition-colors",
                  tab === t.id
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Right content */}
          <div className="flex-1 overflow-y-auto p-4">
            {tab === "models" && <ModelsTab />}
            {tab === "general" && <GeneralTab />}
            {tab === "aliases" && <AliasTab />}
            {tab === "skills" && <SkillsTab />}
            {tab === "hooks" && <HooksTab />}
            {tab === "mcp" && <McpTab />}
            {tab === "tools" && <ToolsTab />}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            配置保存到 ~/.jdata/
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-md hover:bg-accent transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
