import { useState, useEffect } from "react";
import { useAtom } from "jotai";
import { X, Plus, Trash2, Check } from "lucide-react";
import { agentConfigAtom, type ProviderInfo } from "@/atoms/config";
import { getAgentConfig, setAgentConfig, getConfig, setConfig, setTheme, listAliases, setAlias, removeAlias, type YamlConfigInfo, type AliasEntry } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { toast } from "@/atoms/toast";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Tab = "models" | "general" | "aliases";

const emptyProvider = (): ProviderInfo => ({
  name: "",
  apiBase: "https://api.openai.com/v1",
  apiKey: "",
  model: "",
  supportsVision: false,
});

const ALIAS_SECTIONS = [
  { key: "path", label: "路径" },
  { key: "inner_url", label: "内网 URL" },
  { key: "outer_url", label: "外网 URL" },
  { key: "script", label: "脚本" },
];

export default function SettingsDialog({ open, onClose }: Props) {
  const [configState, setConfigState] = useAtom(agentConfigAtom);
  const [tab, setTab] = useState<Tab>("models");
  const [draft, setDraft] = useState<ProviderInfo[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dirty, setDirty] = useState(false);

  // General tab state
  const [generalConfig, setGeneralConfig] = useState<YamlConfigInfo | null>(null);

  // Alias tab state
  const [aliases, setAliases] = useState<AliasEntry[]>([]);
  const [aliasDraft, setAliasDraft] = useState<{ section: string; name: string; value: string }>({ section: "path", name: "", value: "" });
  const [aliasDirty, setAliasDirty] = useState(false);

  useEffect(() => {
    if (!open) return;
    getAgentConfig()
      .then((c) => {
        setConfigState(c);
        setDraft(c.providers.map((p) => ({ ...p })));
        setActiveIndex(c.activeIndex);
        setDirty(false);
      })
      .catch((e) => toast(`加载模型配置失败: ${String(e)}`, "error"));
    getConfig()
      .then(setGeneralConfig)
      .catch((e) => toast(`加载通用配置失败: ${String(e)}`, "error"));
    listAliases()
      .then(setAliases)
      .catch((e) => toast(`加载别名失败: ${String(e)}`, "error"));
  }, [open, setConfigState]);

  // ===== Models tab =====
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

  const saveModels = async () => {
    try {
      await setAgentConfig({ providers: draft, activeIndex, theme: configState.theme || "dark" });
      setConfigState({ providers: draft, activeIndex, theme: configState.theme || "dark" });
      setDirty(false);
      toast("模型配置已保存", "success");
    } catch (e) {
      toast(`保存失败: ${String(e)}`, "error");
    }
  };

  // ===== General tab =====
  const updateGeneralConfig = async (section: string, key: string, value: string) => {
    try {
      await setConfig(section, key, value);
      setGeneralConfig((prev) => {
        if (!prev) return prev;
        const sections = { ...prev.sections };
        sections[section] = { ...(sections[section] || {}), [key]: value };
        return { sections };
      });
    } catch (e) {
      toast(`保存失败: ${String(e)}`, "error");
    }
  };

  // ===== Alias tab =====
  const addAlias = async () => {
    if (!aliasDraft.name.trim() || !aliasDraft.value.trim()) return;
    try {
      await setAlias(aliasDraft.section, aliasDraft.name, aliasDraft.value);
      const updated = await listAliases();
      setAliases(updated);
      setAliasDraft({ section: "path", name: "", value: "" });
      setAliasDirty(false);
      toast("别名已添加", "success");
    } catch (e) {
      toast(`添加别名失败: ${String(e)}`, "error");
    }
  };

  const deleteAlias = async (entry: AliasEntry) => {
    try {
      await removeAlias(entry.section, entry.name);
      setAliases((prev) => prev.filter((a) => !(a.section === entry.section && a.name === entry.name)));
      toast("别名已删除", "success");
    } catch (e) {
      toast(`删除别名失败: ${String(e)}`, "error");
    }
  };

  const save = async () => {
    if (tab === "models") await saveModels();
  };

  if (!open) return null;

  const generalSettings = generalConfig?.sections?.setting || {};
  const logSettings = generalConfig?.sections?.log || {};
  const versionSettings = generalConfig?.sections?.version || {};

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

        {/* Tabs */}
        <div className="flex px-5 pt-3 gap-1">
          {(["models", "general", "aliases"] as const).map((t) => (
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
              {t === "models" ? "模型" : t === "general" ? "通用" : "别名"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* ===== Models Tab ===== */}
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

          {/* ===== General Tab ===== */}
          {tab === "general" && (
            <div className="space-y-4">
              {/* Version info (read-only) */}
              {Object.keys(versionSettings).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-2">版本信息</h3>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {Object.entries(versionSettings).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <span className="w-20 shrink-0 text-right">{k}:</span>
                        <span className="font-mono">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Setting section */}
              <div>
                <h3 className="text-sm font-medium mb-2">偏好设置</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-muted-foreground w-24 shrink-0">搜索引擎</label>
                    <input
                      defaultValue={generalSettings["search-engine"] || ""}
                      onBlur={(e) => {
                        if (e.target.value !== (generalSettings["search-engine"] || "")) {
                          updateGeneralConfig("setting", "search-engine", e.target.value);
                        }
                      }}
                      placeholder="google"
                      className="flex-1 text-xs bg-muted rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-muted-foreground w-24 shrink-0">日志模式</label>
                    <select
                      value={logSettings["mode"] || "concise"}
                      onChange={(e) => updateGeneralConfig("log", "mode", e.target.value)}
                      className="text-xs bg-muted rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="concise">简洁</option>
                      <option value="verbose">详细</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Appearance section */}
              <div>
                <h3 className="text-sm font-medium mb-2">外观</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-muted-foreground w-24 shrink-0">主题</label>
                    <select
                      value={configState.theme || "dark"}
                      onChange={async (e) => {
                        const t = e.target.value;
                        setConfigState((prev) => ({ ...prev, theme: t }));
                        const isDark = t !== "light" && t !== "anthropic_light";
                        document.documentElement.classList.toggle("dark", isDark);
                        await setTheme(t);
                      }}
                      className="text-xs bg-muted rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <optgroup label="暗色">
                        <option value="dark">Dark</option>
                        <option value="midnight">Midnight</option>
                        <option value="nord">Nord</option>
                        <option value="monokai">Monokai</option>
                        <option value="anthropic_dark">Anthropic Dark</option>
                      </optgroup>
                      <optgroup label="亮色">
                        <option value="light">Light</option>
                        <option value="anthropic_light">Anthropic Light</option>
                      </optgroup>
                    </select>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-muted-foreground w-24 shrink-0">字体大小</label>
                    <select
                      defaultValue="medium"
                      onChange={(e) => {
                        const scale = e.target.value === "small" ? "0.9" : e.target.value === "large" ? "1.1" : "1";
                        document.documentElement.style.fontSize = `${Number(scale) * 100}%`;
                      }}
                      className="text-xs bg-muted rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="small">小</option>
                      <option value="medium">中</option>
                      <option value="large">大</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===== Alias Tab ===== */}
          {tab === "aliases" && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                管理快捷别名（路径 / URL / 脚本映射），等同于 j-cli 的 <code className="bg-muted px-1 rounded">j set</code> 命令。
              </p>

              {/* Add form */}
              <div className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex gap-2">
                  <select
                    value={aliasDraft.section}
                    onChange={(e) => setAliasDraft((d) => ({ ...d, section: e.target.value }))}
                    className="text-xs bg-muted rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {ALIAS_SECTIONS.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                  <input
                    value={aliasDraft.name}
                    onChange={(e) => { setAliasDraft((d) => ({ ...d, name: e.target.value })); setAliasDirty(true); }}
                    placeholder="别名 (如 proj)"
                    className="flex-1 text-xs bg-muted rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    value={aliasDraft.value}
                    onChange={(e) => { setAliasDraft((d) => ({ ...d, value: e.target.value })); setAliasDirty(true); }}
                    placeholder="值 (路径或 URL)"
                    className="flex-1 text-xs bg-muted rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    onClick={addAlias}
                    disabled={!aliasDirty || !aliasDraft.name.trim() || !aliasDraft.value.trim()}
                    className="flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    <Plus size={14} />
                    添加
                  </button>
                </div>
              </div>

              {/* Alias list */}
              {aliases.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">暂无别名</p>
              ) : (
                <div className="space-y-1">
                  {aliases.map((a) => (
                    <div key={`${a.section}:${a.name}`} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-accent group">
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded shrink-0 w-16 text-center">
                        {ALIAS_SECTIONS.find((s) => s.key === a.section)?.label || a.section}
                      </span>
                      <span className="text-xs font-medium min-w-0 truncate">{a.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono truncate flex-1">→ {a.value}</span>
                      <button
                        onClick={() => deleteAlias(a)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
              取消
            </button>
            {tab === "models" && (
              <button
                onClick={save}
                disabled={!dirty}
                className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                保存
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
