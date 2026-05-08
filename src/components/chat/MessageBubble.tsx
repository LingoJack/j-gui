import { useMemo, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Copy, Check, Trash2, RefreshCw } from "lucide-react";
import type { Message } from "@/atoms/sessions";
import { toast } from "@/atoms/toast";

interface Props {
  message: Message;
  onDelete?: () => void;
  onResend?: () => void;
}

export default function MessageBubble({ message, onDelete, onResend }: Props) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("复制失败", "error");
    }
  }, [message.content]);

  const content = useMemo(
    () => (
      <div className="prose prose-sm dark:prose-invert max-w-none [&_pre]:bg-muted [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_code]:text-[0.85em] [&_table]:block [&_table]:overflow-x-auto [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-1.5 [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
        >
          {message.content || (message.isStreaming ? "..." : "")}
        </ReactMarkdown>
      </div>
    ),
    [message.content, message.isStreaming],
  );

  return (
    <div className="flex gap-3 group">
      <div className="shrink-0 mt-0.5">
        {isUser ? (
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
            U
          </div>
        ) : (
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground">
            AI
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-muted-foreground">
            {isUser ? "你" : "AI"}
          </span>
          {message.content && !message.isStreaming && (
            <>
              <button
                onClick={handleCopy}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-accent text-muted-foreground"
                title="复制"
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
              {isUser && onResend && (
                <button
                  onClick={onResend}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-accent text-muted-foreground"
                  title="重新发送"
                >
                  <RefreshCw size={14} />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={onDelete}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive"
                  title="删除"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </>
          )}
        </div>
        {content}
        {message.isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-primary ml-0.5 animate-pulse align-middle" />
        )}
      </div>
    </div>
  );
}
