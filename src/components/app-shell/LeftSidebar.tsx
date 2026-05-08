import { useAtom } from "jotai";
import { appModeAtom, type AppMode } from "@/atoms/app-mode";
import { sidebarOpenAtom } from "@/atoms/sidebar";
import {
  MessageSquare,
  Bot,
  PanelLeftClose,
  PanelLeft,
  Settings,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

const modes: { key: AppMode; label: string; icon: typeof MessageSquare }[] = [
  { key: "chat", label: "Chat", icon: MessageSquare },
  { key: "agent", label: "Agent", icon: Bot },
];

// Placeholder session data
const placeholderSessions = {
  today: [
    { id: "1", title: "Rust 项目结构咨询", pinned: true },
    { id: "2", title: "Tailwind 样式调试" },
  ],
  yesterday: [{ id: "3", title: "API 接口设计讨论" }],
  older: [{ id: "4", title: "项目初始化规划" }],
};

interface Props {
  onOpenSettings: () => void;
}

export default function LeftSidebar({ onOpenSettings }: Props) {
  const [mode, setMode] = useAtom(appModeAtom);
  const [open, setOpen] = useAtom(sidebarOpenAtom);

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-card border-r border-border shrink-0 transition-[width] duration-200",
        open ? "w-[280px]" : "w-[48px]",
      )}
    >
      {/* Toggle button */}
      <div className="flex items-center h-10 px-2 border-b border-border">
        <button
          onClick={() => setOpen(!open)}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
        >
          {open ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
        </button>
      </div>

      {open && (
        <>
          {/* Mode switch */}
          <div className="px-3 py-3">
            <div className="flex rounded-lg bg-muted p-0.5">
              {modes.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-colors",
                    mode === key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto px-3">
            {/* New session button */}
            <button className="flex items-center gap-2 w-full px-2 py-1.5 mb-3 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
              <Plus size={16} />
              新建会话
            </button>

            {/* Grouped sessions */}
            {(
              Object.entries(placeholderSessions) as [
                string,
                { id: string; title: string; pinned?: boolean }[],
              ][]
            ).map(([group, sessions]) => (
              <div key={group} className="mb-4">
                <div className="text-xs font-medium text-muted-foreground mb-1 px-2">
                  {group === "today"
                    ? "今天"
                    : group === "yesterday"
                      ? "昨天"
                      : "更早"}
                </div>
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm text-left hover:bg-accent transition-colors"
                  >
                    {s.pinned && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        📌
                      </span>
                    )}
                    <span className="truncate">{s.title}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Bottom */}
          <div className="border-t border-border px-3 py-3 space-y-2">
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Settings size={16} />
              设置
            </button>
            <div className="text-xs text-muted-foreground px-2">v0.1.0</div>
          </div>
        </>
      )}
    </aside>
  );
}
