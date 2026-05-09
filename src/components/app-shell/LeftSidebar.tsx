import { useEffect, useCallback, useState, useRef, memo } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { sidebarOpenAtom } from "@/atoms/sidebar";
import {
  agentSessionsListAtom,
  chatSessionsAtom,
  currentSessionIdAtom,
  chatMessagesAtom,
  agentMessagesAtom,
  sessionTitleOverridesAtom,
  timelineToMessages,
} from "@/atoms/sessions";
import { tabsAtom, activeTabIdAtom, activeTabAtom, type Tab } from "@/atoms/tabs";
import {
  listSessions,
  createSession,
  getSessionMessages,
  getAgentSessionList,
  createAgentSession,
  getAgentSession,
  deleteAgentSession,
} from "@/lib/tauri";
import type { MessageInfo, SessionInfo } from "@/lib/tauri";
import {
  MessageSquare,
  Bot,
  PanelLeftClose,
  PanelLeft,
  Settings,
  Plus,
  Trash2,
  Star,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/atoms/toast";

type TabType = "chat" | "agent";

const modes: { key: TabType; label: string; icon: typeof MessageSquare }[] = [
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

// --- SessionItem (memo'd to avoid re-rendering unaffected items) ---

interface SessionItemProps {
  session: SessionInfo;
  modeType: "chat" | "agent";
  isActive: boolean;
  isPinned: boolean;
  isEditing: boolean;
  editValue: string;
  displayTitle: string;
  onSwitch: (id: string) => void;
  onTogglePin: (id: string) => void;
  onStartEdit: (id: string) => void;
  onCommitEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  onEditValueChange: (value: string) => void;
}

const SessionItem = memo(function SessionItem({
  session,
  modeType,
  isActive,
  isPinned,
  isEditing,
  editValue,
  displayTitle,
  onSwitch,
  onTogglePin,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onDelete,
  onEditValueChange,
}: SessionItemProps) {
  const Icon = modeType === "agent" ? Bot : MessageSquare;
  return (
    <div className="group flex items-center gap-0.5">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(session.id);
        }}
        className={cn(
          "p-0.5 rounded hover:bg-muted transition-opacity shrink-0",
          isPinned ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        <Star
          size={12}
          className={isPinned ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}
        />
      </button>

      <button
        onClick={() => onSwitch(session.id)}
        onDoubleClick={() => onStartEdit(session.id)}
        className={cn(
          "flex items-center gap-2 flex-1 min-w-0 px-2 py-1.5 rounded-md text-sm text-left transition-colors",
          isActive
            ? "bg-accent text-foreground"
            : "hover:bg-accent text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon size={14} className="shrink-0" />
        {isEditing ? (
          <input
            autoFocus
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitEdit(session.id);
              if (e.key === "Escape") onCancelEdit();
            }}
            onBlur={() => onCommitEdit(session.id)}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-background border border-border rounded px-1 py-0.5 text-xs outline-none"
          />
        ) : (
          <span className="truncate flex-1 min-w-0">{displayTitle}</span>
        )}
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onStartEdit(session.id);
        }}
        className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity shrink-0"
      >
        <Pencil size={12} className="text-muted-foreground" />
      </button>

      <button
        onClick={(e) => onDelete(e, session.id)}
        className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity shrink-0"
      >
        <Trash2 size={12} className="text-muted-foreground" />
      </button>
    </div>
  );
});

interface Props {
  onOpenSettings: () => void;
}

export default function LeftSidebar({ onOpenSettings }: Props) {
  const [open, setOpen] = useAtom(sidebarOpenAtom);
  const [chatSessions, setChatSessions] = useAtom(chatSessionsAtom);
  const [agentSessions, setAgentSessionsList] = useAtom(agentSessionsListAtom);
  const [currentId, setCurrentId] = useAtom(currentSessionIdAtom);
  const setMessages = useSetAtom(chatMessagesAtom);
  const [tabs, setTabs] = useAtom(tabsAtom);
  const [activeTabId, setActiveTabId] = useAtom(activeTabIdAtom);
  const activeTab = useAtomValue(activeTabAtom);

  const setAgentMessages = useSetAtom(agentMessagesAtom);
  const [sessionTitleOverrides, setSessionTitleOverrides] = useAtom(sessionTitleOverridesAtom);
  const activeTabType: TabType | null = activeTab?.type ?? null;
  const sessions = activeTab?.type === "agent" ? agentSessions : chatSessions;

  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editCommittedRef = useRef(false);

  const togglePin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const startEdit = useCallback(
    (id: string, currentTitle: string | null | undefined, fallbackId: string) => {
      editCommittedRef.current = false;
      setEditingId(id);
      setEditValue(sessionTitleOverrides[id] || currentTitle || fallbackId);
    },
    [sessionTitleOverrides],
  );

  const commitEdit = useCallback(
    (id: string) => {
      if (editCommittedRef.current) return;
      editCommittedRef.current = true;
      const trimmed = editValue.trim();
      if (trimmed) {
        setSessionTitleOverrides((prev) => ({ ...prev, [id]: trimmed }));
        if (activeTab?.type === "agent") {
          setAgentSessionsList((prev) =>
            prev.map((session) =>
              session.id === id ? { ...session, title: trimmed } : session,
            ),
          );
        } else {
          setChatSessions((prev) =>
            prev.map((session) =>
              session.id === id ? { ...session, title: trimmed } : session,
            ),
          );
        }
      }
      setEditingId(null);
      setEditValue("");
    },
    [activeTab?.type, editValue, setAgentSessionsList, setChatSessions, setSessionTitleOverrides],
  );

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditValue("");
  }, []);

  const load = useCallback(async () => {
    try {
      if (!activeTab) {
        setChatSessions([]);
        setAgentSessionsList([]);
        return;
      }
      const list = activeTab.type === "agent" ? await getAgentSessionList() : await listSessions();
      const sorted = list.sort((a, b) => b.updatedAt - a.updatedAt);
      if (activeTab.type === "agent") {
        setAgentSessionsList(sorted);
      } else {
        setChatSessions(sorted);
      }
    } catch {
      // sessions will show empty
    }
  }, [activeTab, setAgentSessionsList, setChatSessions]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const handleNewSession = async () => {
    if (!activeTab) return;
    try {
      const id = activeTab.type === "agent" ? await createAgentSession() : await createSession();
      setCurrentId(id);
      if (activeTab.type === "agent") {
        setAgentMessages([]);
      } else {
        setMessages([]);
      }
      await load();

      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTab.id ? { ...tab, sessionId: id } : tab,
        ),
      );
    } catch {
      toast("创建会话失败", "error");
    }
  };

  const handleSwitchSession = async (id: string) => {
    if (!activeTab) return;
    if (id === currentId) return;
    setCurrentId(id);
    if (activeTab.type === "agent") {
      try {
        const timeline = await getAgentSession(id);
        setAgentMessages(timelineToMessages(timeline));
      } catch {
        setAgentMessages([]);
        toast("加载会话消息失败", "error");
      }
    } else {
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
    }

    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === activeTab.id ? { ...tab, sessionId: id } : tab,
      ),
    );
  };

  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!activeTab) return;
    try {
      if (activeTab.type === "agent") {
        await deleteAgentSession(id);
      } else {
        const { deleteSession } = await import("@/lib/tauri");
        await deleteSession(id);
      }
      if (id === currentId) {
        setCurrentId(null);
        if (activeTab.type === "agent") {
          setAgentMessages([]);
        } else {
          setMessages([]);
        }
        setSessionTitleOverrides((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setTabs((prev) =>
          prev.map((tab) =>
            tab.id === activeTab.id ? { ...tab, sessionId: null } : tab,
          ),
        );
      }
      await load();
    } catch {
      toast("删除会话失败", "error");
    }
  };

  const handleModeSwitch = (key: TabType) => {
    const existing = tabs.find((t) => t.type === key);
    if (existing) {
      if (activeTabId !== existing.id) {
        setActiveTabId(existing.id);
      }
    } else {
      const newTab: Tab = {
        id: crypto.randomUUID(),
        type: key,
        title: key === "chat" ? "Chat" : "Agent",
        sessionId: null,
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    }
  };

  const pinnedSessions = sessions.filter((s) => pinnedIds.has(s.id));
  const unpinnedSessions = sessions.filter((s) => !pinnedIds.has(s.id));
  const groups = groupByDate(unpinnedSessions);

  const renderSessionItem = (s: SessionInfo) => {
    const isPinned = pinnedIds.has(s.id);
    const displayTitle = sessionTitleOverrides[s.id] || s.title || s.id.slice(0, 8);
    const isEditing = editingId === s.id;
    const modeType = activeTab?.type ?? "chat";
    return (
      <SessionItem
        key={s.id}
        session={s}
        modeType={modeType}
        isActive={s.id === currentId}
        isPinned={isPinned}
        isEditing={isEditing}
        editValue={editValue}
        displayTitle={displayTitle}
        onSwitch={handleSwitchSession}
        onTogglePin={togglePin}
        onStartEdit={(id) => startEdit(id, s.title, s.id)}
        onCommitEdit={commitEdit}
        onCancelEdit={cancelEdit}
        onDelete={handleDeleteSession}
        onEditValueChange={setEditValue}
      />
    );
  };

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-card border-r border-border shrink-0 transition-[width] duration-200",
        open ? "w-[280px]" : "w-[48px]",
      )}
    >
      <div className="flex items-center gap-1 h-10 px-2 border-b border-border">
        <button
          onClick={() => setOpen(!open)}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
        >
          {open ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
        </button>
        {open && activeTabType && (
          <span className="text-xs font-medium text-muted-foreground ml-1">
            {activeTabType === "agent" ? "Agent" : "Chat"} 模式
          </span>
        )}
      </div>

      {open ? (
        <>
          <div className="px-3 py-3">
            <div className="flex rounded-lg bg-muted p-0.5">
              {modes.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => handleModeSwitch(key)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-colors",
                    activeTabType === key
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

            {pinnedSessions.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-medium text-muted-foreground mb-1 px-2">
                  已置顶
                </div>
                {pinnedSessions.map((s) => renderSessionItem(s))}
              </div>
            )}

            {!showPinnedOnly &&
              groups.map((group) => (
                <div key={group.label} className="mb-4">
                  <div className="text-xs font-medium text-muted-foreground mb-1 px-2">
                    {group.label}
                  </div>
                  {group.items.map((s) => renderSessionItem(s))}
                </div>
              ))}

            {pinnedSessions.length === 0 &&
              (showPinnedOnly || groups.length === 0) && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {showPinnedOnly ? "暂无置顶会话" : "暂无会话"}
                </p>
              )}

            {!showPinnedOnly && groups.length === 0 && pinnedSessions.length > 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                暂无其他会话
              </p>
            )}
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
      ) : (
        <div className="flex flex-col items-center gap-2 py-2 flex-1">
          <button
            onClick={handleNewSession}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
            title="新建会话"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={() => setShowPinnedOnly(!showPinnedOnly)}
            className={cn(
              "p-1.5 rounded-md hover:bg-accent",
              showPinnedOnly ? "text-amber-400" : "text-muted-foreground",
            )}
            title={showPinnedOnly ? "显示全部" : "只看置顶"}
          >
            <Star
              size={16}
              className={showPinnedOnly ? "fill-amber-400" : ""}
            />
          </button>
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
            title="设置"
          >
            <Settings size={16} />
          </button>
          <div className="mt-auto">
            <div className="w-6 h-6 rounded-full bg-muted-foreground/20 flex items-center justify-center text-xs text-muted-foreground">
              U
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
