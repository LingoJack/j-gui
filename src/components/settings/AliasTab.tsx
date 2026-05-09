import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { listAliases, setAlias, removeAlias } from "@/lib/tauri";
import type { AliasEntry } from "@/lib/tauri";
import { toast } from "@/atoms/toast";
import SettingsCard from "@/components/settings/primitives/SettingsCard";

const ALIAS_SECTIONS = [
  { key: "path", label: "路径" },
  { key: "inner_url", label: "内网 URL" },
  { key: "outer_url", label: "外网 URL" },
  { key: "script", label: "脚本" },
];

export default function AliasTab() {
  const [aliases, setAliases] = useState<AliasEntry[]>([]);
  const [draft, setDraft] = useState<{ section: string; name: string; value: string }>({
    section: "path",
    name: "",
    value: "",
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    listAliases()
      .then(setAliases)
      .catch((e) => toast(`加载别名失败: ${String(e)}`, "error"));
  }, []);

  const addAlias = async () => {
    if (!draft.name.trim() || !draft.value.trim()) return;
    try {
      await setAlias(draft.section, draft.name, draft.value);
      const updated = await listAliases();
      setAliases(updated);
      setDraft({ section: "path", name: "", value: "" });
      setDirty(false);
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

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        管理快捷别名（路径 / URL / 脚本映射），等同于 j-cli 的 <code className="bg-muted px-1 rounded">j set</code> 命令。
      </p>

      <SettingsCard>
        <div className="flex gap-2">
          <select
            value={draft.section}
            onChange={(e) => setDraft((d) => ({ ...d, section: e.target.value }))}
            className="text-xs bg-muted rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {ALIAS_SECTIONS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          <input
            value={draft.name}
            onChange={(e) => { setDraft((d) => ({ ...d, name: e.target.value })); setDirty(true); }}
            placeholder="别名 (如 proj)"
            className="flex-1 text-xs bg-muted rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex gap-2">
          <input
            value={draft.value}
            onChange={(e) => { setDraft((d) => ({ ...d, value: e.target.value })); setDirty(true); }}
            placeholder="值 (路径或 URL)"
            className="flex-1 text-xs bg-muted rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={addAlias}
            disabled={!dirty || !draft.name.trim() || !draft.value.trim()}
            className="flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Plus size={14} />
            添加
          </button>
        </div>
      </SettingsCard>

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
  );
}
