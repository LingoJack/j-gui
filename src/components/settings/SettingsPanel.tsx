/**
 * SettingsPanel - 设置面板
 *
 * 顶部 Header + 左侧导航 + 右侧 ScrollArea 内容区域。
 * 已删除 roadmap 明确不做的模块：飞书/钉钉/微信/代理/语音/教程/快捷键自定义/MemOS/迁移。
 */

import * as React from "react";
import { useAtom, useAtomValue } from "jotai";
import { cn } from "@/lib/utils";
import { Settings, Radio, Palette, Info, Plug, BookOpen, Wrench, Link, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { settingsTabAtom, channelFormDirtyAtom, settingsCloseRequestedAtom } from "@/atoms/settings-tab";
import type { SettingsTab } from "@/atoms/settings-tab";
import { appModeAtom } from "@/atoms/app-mode";
import { hasUpdateAtom } from "@/atoms/updater";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChannelSettings } from "./ChannelSettings";
import { GeneralSettings } from "./GeneralSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { AboutSettings } from "./AboutSettings";
import { AgentSettings } from "./AgentSettings";
import { PromptSettings } from "./PromptSettings";
import { ToolSettings } from "./ToolSettings";
import { AliasSettings } from "./AliasSettings";

interface TabItem { id: SettingsTab; label: string; icon: React.ReactNode }

const BASE_TABS: TabItem[] = [
  { id: "general", label: "通用设置", icon: <Settings size={16} /> },
  { id: "channels", label: "模型配置", icon: <Radio size={16} /> },
  { id: "prompts", label: "提示词管理", icon: <BookOpen size={16} /> },
  { id: "alias", label: "别名管理", icon: <Link size={16} /> },
];

const AGENT_TAB: TabItem = { id: "agent", label: "Agent 配置", icon: <Plug size={16} /> };
const TOOLS_TAB: TabItem = { id: "tools", label: "Chat 工具", icon: <Wrench size={16} /> };

const TAIL_TABS: TabItem[] = [
  { id: "appearance", label: "外观设置", icon: <Palette size={16} /> },
  { id: "about", label: "关于", icon: <Info size={16} /> },
];

/** Per-tab error boundary */
class TabErrorBoundary extends React.Component<
  { tab: string; children: React.ReactNode }, { error: Error | null }
> {
  constructor(props: { tab: string; children: React.ReactNode }) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error(`[SettingsPanel] Tab "${this.props.tab}" crashed:`, error.message) }
  render() {
    if (this.state.error) return <div className="p-4 text-sm text-red-500">Tab "{this.props.tab}" error: {this.state.error.message}</div>
    return this.props.children
  }
}

function TabGuard({ tab, children }: { tab: string; children: React.ReactNode }) {
  return React.createElement(TabErrorBoundary, { tab }, children)
}

function renderTabContent(tab: SettingsTab): React.ReactElement {
  let content: React.ReactElement
  switch (tab) {
    case "general": content = <GeneralSettings />; break;
    case "channels": content = <ChannelSettings />; break;
    case "prompts": content = <PromptSettings />; break;
    case "agent": content = <AgentSettings />; break;
    case "tools": content = <ToolSettings />; break;
    case "alias": content = <AliasSettings />; break;
    case "appearance": content = <AppearanceSettings />; break;
    case "about": content = <AboutSettings />; break;
    default: content = <GeneralSettings />;
  }
  return <TabGuard tab={tab}>{content}</TabGuard>
}

interface SettingsPanelProps { onClose?: () => void }

export function SettingsPanel({ onClose }: SettingsPanelProps): React.ReactElement {
  const [activeTab, setActiveTab] = useAtom(settingsTabAtom);
  const channelFormDirty = useAtomValue(channelFormDirtyAtom);
  const [closeRequested, setCloseRequested] = useAtom(settingsCloseRequestedAtom);
  const appMode = useAtomValue(appModeAtom);
  const hasUpdate = useAtomValue(hasUpdateAtom);

  type PendingAction = { type: 'tab'; tabId: SettingsTab } | { type: 'close' } | null
  const [pendingAction, setPendingAction] = React.useState<PendingAction>(null)
  const showNavDialog = pendingAction !== null

  const executePendingAction = (): void => {
    if (!pendingAction) return
    if (pendingAction.type === 'tab') setActiveTab(pendingAction.tabId)
    else onClose?.()
    setPendingAction(null)
  }
  const cancelPendingAction = (): void => { setPendingAction(null) }

  const handleTabChange = (tabId: SettingsTab): void => {
    if (tabId === activeTab) return
    if (activeTab === 'channels' && channelFormDirty) { setPendingAction({ type: 'tab', tabId }); return }
    setActiveTab(tabId)
  }
  const handleClose = (): void => {
    if (activeTab === 'channels' && channelFormDirty) { setPendingAction({ type: 'close' }); return }
    onClose?.()
  }

  React.useEffect(() => {
    if (closeRequested && activeTab === 'channels') { setPendingAction({ type: 'close' }); setCloseRequested(false) }
  }, [closeRequested, activeTab, setCloseRequested])

  const tabs = React.useMemo(() => {
    return [...BASE_TABS, AGENT_TAB, TOOLS_TAB, ...TAIL_TABS]
  }, []);

  const activeTabLabel = tabs.find((t) => t.id === activeTab)?.label ?? "设置";

  return (
    <div className="flex flex-col h-full">
      <div className="h-12 flex items-center justify-between px-5 border-b border-border/50 flex-shrink-0">
        <h2 className="text-sm font-medium text-foreground">{activeTabLabel}</h2>
        {onClose && (
          <button onClick={handleClose} className="rounded-md p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors">
            <X size={16} />
          </button>
        )}
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-[160px] border-r border-border/50 pt-3 px-2 flex-shrink-0">
          <nav className="flex flex-col gap-0.5">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => handleTabChange(tab.id)} className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                activeTab === tab.id ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}>
                {tab.icon}
                <span>{tab.label}</span>
                {tab.id === "about" && hasUpdate && <span className="w-2 h-2 rounded-full bg-red-500" />}
              </button>
            ))}
          </nav>
        </div>
        <ScrollArea className="flex-1">
          <div className="px-6 py-4">{renderTabContent(activeTab)}</div>
        </ScrollArea>
      </div>
      <AlertDialog open={showNavDialog} onOpenChange={(open) => { if (!open) cancelPendingAction() }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存的更改？</AlertDialogTitle>
            <AlertDialogDescription>当前渠道配置尚未保存，确定要离开吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelPendingAction}>留在当前页</AlertDialogCancel>
            <AlertDialogAction onClick={executePendingAction}>放弃并离开</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
