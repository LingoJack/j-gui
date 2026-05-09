import { useState, useEffect, useCallback } from "react";
import { Search, MessageSquare, Bot } from "lucide-react";
import type { SessionInfo } from "@/lib/tauri";

interface Props {
  open: boolean;
  onClose: () => void;
  chatSessions: SessionInfo[];
  agentSessions: SessionInfo[];
  onSelect: (id: string, type: "chat" | "agent") => void | Promise<void>;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/20 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

interface MergedItem {
  session: SessionInfo;
  type: "chat" | "agent";
}

export default function SearchDialog({
  open,
  onClose,
  chatSessions,
  agentSessions,
  onSelect,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [composing, setComposing] = useState(false);

  // Merge both session sources with type tags for cross-mode search, sorted by most recent
  const allSessions: MergedItem[] = [
    ...chatSessions.map((s) => ({ session: s, type: "chat" as const })),
    ...agentSessions.map((s) => ({ session: s, type: "agent" as const })),
  ].sort((a, b) => b.session.updatedAt - a.session.updatedAt);

  const filtered = composing
    ? allSessions
    : allSessions.filter(
        (item) =>
          !query ||
          (item.session.title || "").toLowerCase().includes(query.toLowerCase()) ||
          item.session.id.toLowerCase().includes(query.toLowerCase()),
      );

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (composing || (e.nativeEvent as KeyboardEvent).isComposing) {
        return;
      }
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIdx]) {
        const item = filtered[selectedIdx];
        onSelect(item.session.id, item.type);
        onClose();
      }
    },
    [composing, filtered, onClose, onSelect, selectedIdx],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-[440px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search size={16} className="text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={(e) => {
              setComposing(false);
              setQuery(e.currentTarget.value);
            }}
            placeholder="搜索会话... (Chat + Agent)"
            className="flex-1 text-sm bg-transparent focus:outline-none"
          />
          <kbd className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            ESC
          </kbd>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {query ? "无匹配会话" : "暂无会话"}
            </p>
          ) : (
            filtered.map((item, i) => (
              <button
                key={`${item.type}-${item.session.id}`}
                onClick={() => {
                  onSelect(item.session.id, item.type);
                  onClose();
                }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors ${
                  i === selectedIdx ? "bg-accent" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  {item.type === "chat" ? (
                    <MessageSquare size={14} className="text-muted-foreground shrink-0" />
                  ) : (
                    <Bot size={14} className="text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate">{highlightMatch(item.session.title || item.session.id, query)}</span>
                </div>
                <span className="text-[10px] text-muted-foreground ml-6">
                  {item.session.messageCount} 条消息 · {item.type === "chat" ? "Chat" : "Agent"}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
