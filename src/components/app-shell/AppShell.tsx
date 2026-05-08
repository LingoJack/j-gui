import { useState } from "react";
import { useAtomValue } from "jotai";
import { appModeAtom } from "@/atoms/app-mode";
import { rightPanelOpenAtom } from "@/atoms/sidebar";
import LeftSidebar from "./LeftSidebar";
import MainArea from "./MainArea";
import RightSidePanel from "./RightSidePanel";
import SettingsDialog from "@/components/settings/SettingsDialog";

export default function AppShell() {
  const mode = useAtomValue(appModeAtom);
  const rightPanelOpen = useAtomValue(rightPanelOpenAtom);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <LeftSidebar onOpenSettings={() => setSettingsOpen(true)} />
      <main className="flex-1 min-w-0">
        <MainArea />
      </main>
      {mode === "agent" && rightPanelOpen && <RightSidePanel />}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
