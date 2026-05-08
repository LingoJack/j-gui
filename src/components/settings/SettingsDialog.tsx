import { useState, useEffect } from "react";
import { useAtom } from "jotai";
import { X, Plus, Trash2, Check } from "lucide-react";
import { agentConfigAtom, type ProviderInfo } from "@/atoms/config";
import { getAgentConfig, setAgentConfig } from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

const emptyProvider = (): ProviderInfo => ({
  name: "",
  apiBase: "https://api.openai.com/v1",
  apiKey: "",
  model: "",
  supportsVision: false,
});

export default function SettingsDialog({ open, onClose }: Props) {
  const [, setConfig] = useAtom(agentConfigAtom);
  const [tab, setTab] = useState<"models" | "general">("models");
  const [draft, setDraft] = useState<ProviderInfo[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open) return;
    getAgentConfig()
      .then((c) => {
        setConfig(c);
        setDraft(c.providers.map((p) => ({ ...p })));
        setActiveIndex(c.activeIndex);
        setDirty(false);
      })
      .catch(console.error);
  }, [open, setConfig]);

  const updateProvider = (i: number, patch: Partial<ProviderInfo>) => {
    setDraft((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
    setDirty(true);
  };

  const addProvider = () => {
    setDraft((prev) => [...prev, emptyProvider()]);
    setDirty(true);
  };

  const removeProvider = (i: number) => {
    setDraft((prev) => prev.filter((_, idx) => idx !== i));
    if (activeIndex >= draft.length - 1) {
      setActiveIndex(Math.max(0, draft.length - 2));
    }
    setDirty(true);
  };

  const save = async () => {
    try {
      await setAgentConfig({ providers: draft, activeIndex });
      setConfig({ providers: draft, activeIndex });
      setDirty(false);
    } catch (e) {
      console.error("保存配置失败:", e);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[560px] max-h-[80vh] flex flex-col bg-card rounded-xl border border-border shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-base font-semibold">设置</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-5 pt-3 gap-1">
          {(["models", "general"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md font-medium transition-colors",
                tab === t
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "models" ? "模型" : "通用"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "models" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                配置模型提供方（API Base URL + Key + 模型名）。勾选即为当前使用的模型。
              </p>

              {draft.map((p, i) => (
                <div
                  key={i}
                  className={cn(
                    "border rounded-lg p-3 space-y-2 transition-colors",
                    activeIndex === i ? "border-primary" : "border-border",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setActiveIndex(i);
                        setDirty(true);
                      }}
                      className={cn(
                        "shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                        activeIndex === i
                          ? "border-primary bg-primary"
                          : "border-muted-foreground/30",
                      )}
                    >
                      {activeIndex === i && <Check size={12} className="text-primary-foreground" />}
                    </button>
                    <input
                      value={p.name}
                      onChange={(e) => updateProvider(i, { name: e.target.value })}
                      placeholder="显示名称 (如 GPT-4o)"
                      className="flex-1 text-sm bg-transparent border-b border-border px-1 py-0.5 focus:outline-none focus:border-primary"
                    />
                    <button
                      onClick={() => removeProvider(i)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={p.apiBase}
                      onChange={(e) => updateProvider(i, { apiBase: e.target.value })}
                      placeholder="API Base URL"
                      className="text-xs bg-muted rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <input
                      value={p.model}
                      onChange={(e) => updateProvider(i, { model: e.target.value })}
                      placeholder="模型 ID (如 gpt-4o)"
                      className="text-xs bg-muted rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <input
                    value={p.apiKey}
                    onChange={(e) => updateProvider(i, { apiKey: e.target.value })}
                    placeholder="API Key"
                    type="password"
                    className="w-full text-xs bg-muted rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              ))}

              <button
                onClick={addProvider}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus size={16} />
                添加提供方
              </button>
            </div>
          )}

          {tab === "general" && (
            <div className="text-sm text-muted-foreground">
              <p>通用设置（即将推出）</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            配置保存到 ~/.jdata/agent/data/agent_config.json
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-md hover:bg-accent transition-colors"
            >
              取消
            </button>
            <button
              onClick={save}
              disabled={!dirty}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
