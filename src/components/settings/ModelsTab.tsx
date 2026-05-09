import { useState, useEffect } from "react";
import { useAtom } from "jotai";
import { Plus, Trash2, Check } from "lucide-react";
import { agentConfigAtom, type ProviderInfo } from "@/atoms/config";
import { getAgentConfig, setAgentConfig } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { toast } from "@/atoms/toast";
import SettingsCard from "@/components/settings/primitives/SettingsCard";

const emptyProvider = (): ProviderInfo => ({
  name: "",
  apiBase: "https://api.openai.com/v1",
  apiKey: "",
  model: "",
  supportsVision: false,
});

export default function ModelsTab() {
  const [configState, setConfigState] = useAtom(agentConfigAtom);
  const [draft, setDraft] = useState<ProviderInfo[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    getAgentConfig()
      .then((c) => {
        setConfigState(c);
        setDraft(c.providers.map((p) => ({ ...p })));
        setActiveIndex(c.activeIndex);
        setDirty(false);
      })
      .catch((e) => toast(`加载模型配置失败: ${String(e)}`, "error"));
  }, [setConfigState]);

  const updateProvider = (i: number, patch: Partial<ProviderInfo>) => {
    setDraft((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
    setDirty(true);
  };

  const addProvider = () => {
    setDraft((prev) => [...prev, emptyProvider()]);
    setDirty(true);
  };

  const removeProvider = (i: number) => {
    setDraft((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      if (activeIndex >= next.length) {
        setActiveIndex(Math.max(0, next.length - 1));
      }
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    try {
      await setAgentConfig({ providers: draft, activeIndex, theme: configState.theme || "dark" });
      setConfigState({ providers: draft, activeIndex, theme: configState.theme || "dark" });
      setDirty(false);
      toast("模型配置已保存", "success");
    } catch (e) {
      toast(`保存失败: ${String(e)}`, "error");
    }
  };

  const hasUnsaved = dirty;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        配置模型提供方（API Base URL + Key + 模型名）。勾选即为当前使用的模型。
      </p>

      {draft.map((p, i) => (
        <SettingsCard
          key={i}
          className={activeIndex === i ? "border-primary" : undefined}
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
        </SettingsCard>
      ))}

      <button
        onClick={addProvider}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Plus size={16} />
        添加提供方
      </button>

      {hasUnsaved && (
        <div className="flex justify-end">
          <button
            onClick={save}
            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-colors"
          >
            保存
          </button>
        </div>
      )}
    </div>
  );
}
