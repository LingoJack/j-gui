import { useAtomValue } from "jotai";
import { messagesAtom, streamingAtom } from "@/atoms/sessions";
import { Bot, User } from "lucide-react";

export default function ChatMessages() {
  const messages = useAtomValue(messagesAtom);
  const streaming = useAtomValue(streamingAtom);

  if (messages.length === 0 && !streaming) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p className="text-sm">输入消息开始对话</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map((msg) => (
        <div key={msg.id} className="flex gap-3">
          <div className="shrink-0 mt-0.5">
            {msg.role === "user" ? (
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <User size={14} className="text-primary-foreground" />
              </div>
            ) : (
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                <Bot size={14} className="text-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-muted-foreground mb-1">
              {msg.role === "user" ? "你" : "AI"}
            </div>
            <div className="text-sm whitespace-pre-wrap break-words">
              {msg.content}
              {msg.isStreaming && (
                <span className="inline-block w-1.5 h-4 bg-primary ml-0.5 animate-pulse align-middle" />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
