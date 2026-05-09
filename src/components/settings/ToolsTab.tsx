import { useEffect, useState } from "react";
import * as tauri from "@/lib/tauri";
import SettingsSection from "./primitives/SettingsSection";
import SettingsCard from "./primitives/SettingsCard";
import SettingsToggle from "./primitives/SettingsToggle";
import { Wrench, Loader2 } from "lucide-react";
import { toast } from "@/atoms/toast";

export default function ToolsTab() {
  const [tools, setTools] = useState<tauri.ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tauri.listChatTools()
      .then(setTools)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (name: string, currentEnabled: boolean) => {
    setTools((prev) => prev.map((t) => (t.name === name ? { ...t, enabled: !t.enabled } : t)));
    tauri.setToolEnabled(name, !currentEnabled).catch(() => toast("保存失败", "error"));
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );

  if (error)
    return (
      <SettingsSection title="Chat 工具">
        <p className="text-sm text-destructive py-4">
          加载工具列表失败: {error}
        </p>
      </SettingsSection>
    );

  return (
    <SettingsSection title="Chat 工具">
      {tools.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          暂无 Chat 工具。
        </p>
      ) : (
        <div className="space-y-2">
          {tools.map((tool) => (
            <SettingsCard key={tool.name}>
              <div className="flex items-start gap-3">
                <Wrench size={16} className="text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{tool.name}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tool.description}
                  </p>
                </div>
                <SettingsToggle checked={tool.enabled} onChange={() => toggle(tool.name, tool.enabled)} />
              </div>
            </SettingsCard>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}