import { useState, useRef, useCallback } from "react";
import { Send } from "lucide-react";

interface Props {
  onSend: (content: string) => void;
  disabled?: boolean;
  sendDisabled?: boolean;
}

export default function ChatInput({ onSend, disabled, sendDisabled }: Props) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={handleSend}
          disabled={disabled || sendDisabled || !text.trim()}
          className="p-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 shrink-0"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
