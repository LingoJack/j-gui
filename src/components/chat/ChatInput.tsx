import { useState, useRef, useCallback, useEffect } from "react";
import { useAtomValue } from "jotai";
import { Send, Square, Brain } from "lucide-react";
import { rightPanelDirsAtom } from "@/atoms/sidebar";
import FileMentionPopup, { type FileSuggestion } from "@/components/agent/FileMentionPopup";

interface Props {
  onSend: (content: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  sendDisabled?: boolean;
  placeholder?: string;
  draft?: string;
  onDraftChange?: (text: string) => void;
  mode?: "chat" | "agent";
}

export default function ChatInput({
  onSend,
  onStop,
  disabled,
  sendDisabled,
  placeholder,
  draft,
  onDraftChange,
  mode = "chat",
}: Props) {
  const [text, setText] = useState(draft ?? "");
  const [thinking, setThinking] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // @mention state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [mentionSuggestions, setMentionSuggestions] = useState<FileSuggestion[]>([]);
  const dirs = useAtomValue(rightPanelDirsAtom);

  // Sync text from draft when it changes externally (e.g., session switch)
  useEffect(() => {
    if (draft !== undefined) {
      setText(draft ?? "");
    }
  }, [draft]);

  // Close mention on mode switch
  useEffect(() => {
    setMentionOpen(false);
  }, [mode]);

  // Fetch file suggestions when mention is open and query or dirs change
  useEffect(() => {
    if (!mentionOpen || dirs.length === 0) {
      setMentionSuggestions([]);
      return;
    }
    let cancelled = false;
    const fetchSuggestions = async () => {
      try {
        const { readDir } = await import("@tauri-apps/plugin-fs");
        const results: FileSuggestion[] = [];
        for (const dir of dirs) {
          try {
            const entries = await readDir(dir);
            for (const e of entries) {
              const fullPath = `${dir}/${e.name}`;
              results.push({ name: e.name, path: fullPath, isDir: e.isDirectory });
            }
          } catch {
            // Skip directories that can't be read
          }
        }
        if (cancelled) return;
        const q = mentionQuery.toLowerCase();
        const filtered = q
          ? results.filter((r) => r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q))
          : results;
        filtered.sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setMentionSuggestions(filtered);
        setMentionSelectedIndex(0);
      } catch {
        if (!cancelled) setMentionSuggestions([]);
      }
    };
    fetchSuggestions();
    return () => { cancelled = true; };
  }, [mentionOpen, mentionQuery, dirs]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled || sendDisabled) return;
    onSend(trimmed);
    setText("");
    setMentionOpen(false);
    inputRef.current?.focus();
  }, [text, disabled, sendDisabled, onSend]);

  const insertMention = useCallback(
    (file: FileSuggestion) => {
      const ta = inputRef.current;
      if (!ta) return;
      const cursorPos = ta.selectionStart;
      // Find last @ before cursor
      let atPos = text.lastIndexOf("@", cursorPos - 1);
      if (atPos < 0) {
        // Fallback: scan from end of text
        atPos = text.lastIndexOf("@");
      }
      if (atPos < 0) {
        // No @ found — append at cursor
        atPos = cursorPos;
      }

      const before = text.slice(0, atPos);
      const after = text.slice(cursorPos);
      const ref = `[@${file.name}](${file.path}) `;
      const newText = before + ref + after;
      setText(newText);
      onDraftChange?.(newText);
      setMentionOpen(false);

      // Restore cursor position after ref
      requestAnimationFrame(() => {
        const newCursorPos = before.length + ref.length;
        ta.setSelectionRange(newCursorPos, newCursorPos);
        ta.focus();
      });
    },
    [text, onDraftChange],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      const cursorPos = e.target.selectionStart;

      // Auto-resize
      const ta = e.target;
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;

      // Handle @ mention trigger (only in agent mode with workspace dirs)
      if (mode === "agent" && dirs.length > 0) {
        const lastAtIndex = val.lastIndexOf("@", cursorPos - 1);
        if (lastAtIndex >= 0) {
          const textAfterAt = val.slice(lastAtIndex + 1, cursorPos);
          // Only trigger if text after @ has no spaces, newlines, or other @
          if (!/\s/.test(textAfterAt) && !textAfterAt.includes("@")) {
            setMentionQuery(textAfterAt);
            setMentionOpen(true);
          } else {
            setMentionOpen(false);
          }
        } else {
          setMentionOpen(false);
        }
      } else {
        setMentionOpen(false);
      }

      setText(val);
      onDraftChange?.(val);
    },
    [mode, onDraftChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // IME composition guard
      if (e.nativeEvent.isComposing) return;

      if (mentionOpen) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionSelectedIndex((prev) => Math.min(mentionSuggestions.length - 1, prev + 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionSelectedIndex((prev) => Math.max(0, prev - 1));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const selected = mentionSuggestions[mentionSelectedIndex];
          if (selected) {
            insertMention(selected);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setMentionOpen(false);
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, insertMention, mentionOpen, mentionSuggestions, mentionSelectedIndex],
  );

  const handleSelect = useCallback(
    (file: FileSuggestion) => {
      insertMention(file);
    },
    [insertMention],
  );

  return (
    <div className="border-t border-border p-3">
      <div className="flex items-end gap-2 relative">
        <div className="flex-1 relative">
          <FileMentionPopup
            open={mentionOpen}
            suggestions={mentionSuggestions}
            selectedIndex={mentionSelectedIndex}
            onSelect={handleSelect}
          />
          <textarea
            ref={inputRef}
            value={text}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? (mode === "agent" ? "输入消息... (@引用文件, Enter 发送, Shift+Enter 换行)" : "输入消息... (Enter 发送, Shift+Enter 换行)")}
            rows={1}
            disabled={disabled}
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring w-full"
          />
        </div>
        <button
          onClick={() => setThinking((v) => !v)}
          className={`p-2 rounded-md transition-colors ${thinking ? "text-emerald-500 bg-emerald-500/10" : "text-muted-foreground hover:bg-accent"}`}
          title="Thinking 模式"
        >
          <Brain size={16} />
        </button>
        {sendDisabled && onStop ? (
          <button
            onClick={onStop}
            className="p-2 rounded-md bg-destructive text-destructive-foreground hover:opacity-90 shrink-0"
            aria-label="停止生成"
          >
            <Square size={16} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={disabled || sendDisabled || !text.trim()}
            className="p-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 shrink-0"
            aria-label="发送"
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
