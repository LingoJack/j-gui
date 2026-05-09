import { useEffect, useState } from "react";
import { listMcpServers, saveMcpServers, type McpServerConfig } from "@/lib/tauri";
import SettingsSection from "./primitives/SettingsSection";
import SettingsCard from "./primitives/SettingsCard";
import SettingsToggle from "./primitives/SettingsToggle";
import { Server, Loader2, Trash2 } from "lucide-react";
import { toast } from "@/atoms/toast";

export default function McpTab() {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMcpServers()
      .then(setServers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = (idx: number) => {
    const next = servers.map((s, i) => (i === idx ? { ...s, disabled: !s.disabled } : s));
    setServers(next);
    saveMcpServers(next).catch(() => toast("保存失败", "error"));
  };

  const remove = (idx: number) => {
    const next = servers.filter((_, i) => i !== idx);
    setServers(next);
    saveMcpServers(next).catch(() => toast("保存失败", "error"));
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );

  return (
    <SettingsSection title="MCP 服务器 (Agent 模式)">
      {servers.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          暂无 MCP 服务器。在 ~/.jdata/agent/mcp_config.json 中配置。
        </p>
      ) : (
        <div className="space-y-2">
          {servers.map((s, i) => (
            <SettingsCard key={i}>
              <div className="flex items-start gap-3">
                <Server size={16} className="text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded">
                      {s.transport}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.command && <span className="mr-2">cmd: {s.command}</span>}
                    {s.url && <span>url: {s.url}</span>}
                  </p>
                </div>
                <button
                  onClick={() => remove(i)}
                  className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive"
                >
                  <Trash2 size={14} />
                </button>
                <SettingsToggle checked={!s.disabled} onChange={() => toggle(i)} />
              </div>
            </SettingsCard>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}
