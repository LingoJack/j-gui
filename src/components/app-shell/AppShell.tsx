import { useState, useEffect } from "react";
import { useAtomValue } from "jotai";
import { themeAtom } from "@/atoms/theme";
import { appModeAtom } from "@/atoms/app-mode";
import { rightPanelOpenAtom } from "@/atoms/sidebar";
import LeftSidebar from "./LeftSidebar";
import MainArea from "./MainArea";
import RightSidePanel from "./RightSidePanel";
import SettingsDialog from "@/components/settings/SettingsDialog";
import ToastContainer from "@/components/ui/Toast";

export default function AppShell() {
  const mode = useAtomValue(appModeAtom);
  const rightPanelOpen = useAtomValue(rightPanelOpenAtom);
  const theme = useAtomValue(themeAtom);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <LeftSidebar onOpenSettings={() => setSettingsOpen(true)} />
      <main className="flex-1 min-w-0">
        <MainArea />
      </main>
      {mode === "agent" && rightPanelOpen && <RightSidePanel />}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ToastContainer />
    </div>
  );
}
