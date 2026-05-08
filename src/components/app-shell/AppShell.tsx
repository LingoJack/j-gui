import { useState, useEffect, useCallback } from "react";
import { useAtom, useAtomValue } from "jotai";
import { themeAtom } from "@/atoms/theme";
import { appModeAtom } from "@/atoms/app-mode";
import { sessionsAtom } from "@/atoms/sessions";
import { agentConfigAtom } from "@/atoms/config";
import { currentSessionIdAtom } from "@/atoms/sessions";
import { rightPanelOpenAtom } from "@/atoms/sidebar";
import { getAgentConfig } from "@/lib/tauri";
import LeftSidebar from "./LeftSidebar";
import MainArea from "./MainArea";
import RightSidePanel from "./RightSidePanel";
import SearchDialog from "./SearchDialog";
import SettingsDialog from "@/components/settings/SettingsDialog";
import ToastContainer from "@/components/ui/Toast";

export default function AppShell() {
  const mode = useAtomValue(appModeAtom);
  const rightPanelOpen = useAtomValue(rightPanelOpenAtom);
  const [theme, setTheme] = useAtom(themeAtom);
  const [config, setConfig] = useAtom(agentConfigAtom);
  const sessions = useAtomValue(sessionsAtom);
  const [, setSessionId] = useAtom(currentSessionIdAtom);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Load agent config (including theme) on mount
  useEffect(() => {
    getAgentConfig()
      .then((c) => {
        setConfig(c);
        const isDark = c.theme !== "light" && c.theme !== "anthropic_light";
        setTheme(isDark ? "dark" : "light");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Ctrl+K global shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    setSessionId(id);
  }, [setSessionId]);

  const hasProviders = config.providers.length > 0;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <LeftSidebar onOpenSettings={() => setSettingsOpen(true)} />
      <main className="flex-1 min-w-0">
        <MainArea hasProviders={hasProviders} onOpenSettings={() => setSettingsOpen(true)} />
      </main>
      {mode === "agent" && rightPanelOpen && <RightSidePanel />}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        sessions={sessions}
        onSelect={handleSelectSession}
      />
      <ToastContainer />
    </div>
  );
}
