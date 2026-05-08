import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Brain } from "lucide-react";

interface Props {
  onSend: (content: string) => void;
  disabled?: boolean;
  sendDisabled?: boolean;
  placeholder?: string;
  draft?: string;
  onDraftChange?: (text: string) => void;
}

export default function ChatInput({ onSend, disabled, sendDisabled, placeholder, draft, onDraftChange }: Props) {
  const [text, setText] = useState(draft ?? "");
  const [thinking, setThinking] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Sync text from draft when it changes externally (e.g., session switch)
  useEffect(() => {
    if (draft !== undefined) {
      setText(draft ?? "");
    }
  }, [draft]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled || sendDisabled) return;
    onSend(trimmed);
    setText("");
    inputRef.current?.focus();
  }, [text, disabled, sendDisabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border p-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => {
            const val = e.target.value;
            setText(val);
            onDraftChange?.(val);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? "输入消息... (Enter 发送, Shift+Enter 换行)"}
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={() => setThinking((v) => !v)}
          className={`p-2 rounded-md transition-colors ${thinking ? "text-emerald-500 bg-emerald-500/10" : "text-muted-foreground hover:bg-accent"}`}
          title="Thinking 模式"
        >
          <Brain size={16} />
        </button>
        <button
          onClick={handleSend}
          disabled={disabled || sendDisabled || !text.trim()}
          className="p-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 shrink-0"
          aria-label="发送"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
