import { useEffect, useCallback } from "react";
import { useAtom, useSetAtom } from "jotai";
import { appModeAtom, type AppMode } from "@/atoms/app-mode";
import { sidebarOpenAtom } from "@/atoms/sidebar";
import {
  sessionsAtom,
  currentSessionIdAtom,
  messagesAtom,
} from "@/atoms/sessions";
import { listSessions, createSession, getSessionMessages } from "@/lib/tauri";
import type { MessageInfo } from "@/lib/tauri";
import type { SessionInfo } from "@/lib/tauri";
import {
  MessageSquare,
  Bot,
  PanelLeftClose,
  PanelLeft,
  Settings,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/atoms/toast";

const modes: { key: AppMode; label: string; icon: typeof MessageSquare }[] = [
  { key: "chat", label: "Chat", icon: MessageSquare },
  { key: "agent", label: "Agent", icon: Bot },
];

function groupByDate(sessions: SessionInfo[]) {
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const yesterdayStart = todayStart - 86400000;

  const groups: { label: string; items: SessionInfo[] }[] = [];
  const today: SessionInfo[] = [];
  const yesterday: SessionInfo[] = [];
  const older: SessionInfo[] = [];

  for (const s of sessions) {
    const ts = s.updatedAt * 1000;
    if (ts >= todayStart) today.push(s);
    else if (ts >= yesterdayStart) yesterday.push(s);
    else older.push(s);
  }

  if (today.length) groups.push({ label: "今天", items: today });
  if (yesterday.length) groups.push({ label: "昨天", items: yesterday });
  if (older.length) groups.push({ label: "更早", items: older });
  return groups;
}

interface Props {
  onOpenSettings: () => void;
}

export default function LeftSidebar({ onOpenSettings }: Props) {
  const [mode, setMode] = useAtom(appModeAtom);
  const [open, setOpen] = useAtom(sidebarOpenAtom);
  const [sessions, setSessions] = useAtom(sessionsAtom);
  const [currentId, setCurrentId] = useAtom(currentSessionIdAtom);
  const setMessages = useSetAtom(messagesAtom);

  const load = useCallback(async () => {
    try {
      const list = await listSessions();
      setSessions(list.sort((a, b) => b.updatedAt - a.updatedAt));
    } catch {
      // sessions will show empty
    }
  }, [setSessions]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const handleNewSession = async () => {
    try {
      const id = await createSession();
      setCurrentId(id);
      setMessages([]);
      await load();
    } catch {
      toast("创建会话失败", "error");
    }
  };

  const handleSwitchSession = async (id: string) => {
    if (id === currentId) return;
    setCurrentId(id);
    try {
      const msgs: MessageInfo[] = await getSessionMessages(id);
      setMessages(
        msgs.map((m) => ({
          id: crypto.randomUUID(),
          role: m.role as "user" | "assistant",
          content: m.content,
          isStreaming: false,
        })),
      );
    } catch {
      setMessages([]);
      toast("加载会话消息失败", "error");
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const { deleteSession } = await import("@/lib/tauri");
      await deleteSession(id);
      if (id === currentId) {
        setCurrentId(null);
        setMessages([]);
      }
      await load();
    } catch {
      toast("删除会话失败", "error");
    }
  };

  const groups = groupByDate(sessions);

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-card border-r border-border shrink-0 transition-[width] duration-200",
        open ? "w-[280px]" : "w-[48px]",
      )}
    >
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

          <div className="flex-1 overflow-y-auto px-3">
            <button
              onClick={handleNewSession}
              className="flex items-center gap-2 w-full px-2 py-1.5 mb-3 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Plus size={16} />
              新建会话
            </button>

            {groups.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                暂无会话
              </p>
            )}

            {groups.map((group) => (
              <div key={group.label} className="mb-4">
                <div className="text-xs font-medium text-muted-foreground mb-1 px-2">
                  {group.label}
                </div>
                {group.items.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSwitchSession(s.id)}
                    className={cn(
                      "group flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm text-left transition-colors",
                      s.id === currentId
                        ? "bg-accent text-foreground"
                        : "hover:bg-accent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <MessageSquare size={14} className="shrink-0" />
                    <span className="truncate flex-1">
                      {s.title || s.id.slice(0, 8)}
                    </span>
                    <button
                      onClick={(e) => handleDeleteSession(e, s.id)}
                      className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity shrink-0"
                    >
                      <Trash2 size={12} className="text-muted-foreground" />
                    </button>
                  </button>
                ))}
              </div>
            ))}
          </div>

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
