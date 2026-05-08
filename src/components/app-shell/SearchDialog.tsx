import { useState, useEffect, useCallback } from "react";
import { Search } from "lucide-react";
import type { SessionInfo } from "@/lib/tauri";

interface Props {
  open: boolean;
  onClose: () => void;
  sessions: SessionInfo[];
  onSelect: (id: string) => void;
}

export default function SearchDialog({ open, onClose, sessions, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);

  const filtered = sessions.filter(
    (s) =>
      !query ||
      (s.title || "").toLowerCase().includes(query.toLowerCase()) ||
      s.id.toLowerCase().includes(query.toLowerCase()),
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
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIdx]) {
        onSelect(filtered[selectedIdx].id);
        onClose();
      }
    },
    [onClose, onSelect, filtered, selectedIdx],
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
            placeholder="搜索会话..."
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
            filtered.map((s, i) => (
              <button
                key={s.id}
                onClick={() => {
                  onSelect(s.id);
                  onClose();
                }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors ${
                  i === selectedIdx ? "bg-accent" : ""
                }`}
              >
                <span className="truncate block">{s.title || s.id}</span>
                <span className="text-[10px] text-muted-foreground">
                  {s.messageCount} 条消息
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
