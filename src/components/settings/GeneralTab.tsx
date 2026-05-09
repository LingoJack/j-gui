import { useState, useEffect } from "react";
import { useAtom } from "jotai";
import { agentConfigAtom } from "@/atoms/config";
import { getConfig, setConfig, setTheme } from "@/lib/tauri";
import type { YamlConfigInfo } from "@/lib/tauri";
import { toast } from "@/atoms/toast";
import SettingsCard from "@/components/settings/primitives/SettingsCard";
import SettingsRow from "@/components/settings/primitives/SettingsRow";
import SettingsSection from "@/components/settings/primitives/SettingsSection";

export default function GeneralTab() {
  const [configState, setConfigState] = useAtom(agentConfigAtom);
  const [generalConfig, setGeneralConfig] = useState<YamlConfigInfo | null>(null);

  useEffect(() => {
    getConfig()
      .then(setGeneralConfig)
      .catch((e) => toast(`加载通用配置失败: ${String(e)}`, "error"));
  }, []);

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

  const generalSettings = generalConfig?.sections?.setting || {};
  const logSettings = generalConfig?.sections?.log || {};
  const versionSettings = generalConfig?.sections?.version || {};

  return (
    <div className="space-y-4">
      {Object.keys(versionSettings).length > 0 && (
        <SettingsSection title="版本信息">
          <SettingsCard>
            {Object.entries(versionSettings).map(([k, v]) => (
              <SettingsRow key={k} label={k}>
                <span className="text-xs font-mono text-muted-foreground">{v}</span>
              </SettingsRow>
            ))}
          </SettingsCard>
        </SettingsSection>
      )}

      <SettingsSection title="偏好设置">
        <SettingsCard>
          <SettingsRow label="搜索引擎">
            <input
              defaultValue={generalSettings["search-engine"] || ""}
              onBlur={(e) => {
                if (e.target.value !== (generalSettings["search-engine"] || "")) {
                  updateGeneralConfig("setting", "search-engine", e.target.value);
                }
              }}
              placeholder="google"
              className="text-xs bg-muted rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring w-40"
            />
          </SettingsRow>
          <SettingsRow label="日志模式">
            <select
              value={logSettings["mode"] || "concise"}
              onChange={(e) => updateGeneralConfig("log", "mode", e.target.value)}
              className="text-xs bg-muted rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="concise">简洁</option>
              <option value="verbose">详细</option>
            </select>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="外观">
        <SettingsCard>
          <SettingsRow label="主题">
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
          </SettingsRow>
          <SettingsRow label="字体大小">
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
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}
