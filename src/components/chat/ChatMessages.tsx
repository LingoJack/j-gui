import { useAtomValue } from "jotai";
import { chatMessagesAtom, chatStreamingAtom } from "@/atoms/sessions";
import MessageBubble from "./MessageBubble";

interface Props {
  onDelete?: (index: number) => void;
  onResend?: (index: number, content: string) => void;
  onFork?: (index: number, content: string) => void;
  forkIndex?: number;
}

export default function ChatMessages({ onDelete, onResend, onFork, forkIndex }: Props) {
  const messages = useAtomValue(chatMessagesAtom);
  const streaming = useAtomValue(chatStreamingAtom);

  if (messages.length === 0 && !streaming) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p className="text-sm">输入消息开始对话</p>
      </div>
    );
  }

  const handleFork = (msgIndex: number) => {
    const userIdx = msgIndex - 1;
    const userMsg = messages[userIdx];
    if (userMsg && userMsg.role === "user") {
      onFork?.(userIdx, userMsg.content);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map((msg, i) => (
        <div key={msg.id}>
          {forkIndex === i && (
            <div className="flex items-center gap-3 px-4 py-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                上下文已清空
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}
          <MessageBubble
            key={msg.id}
            message={msg}
            index={i}
            onDelete={onDelete ? () => onDelete(i) : undefined}
            onResend={onResend ? () => onResend(i, msg.content) : undefined}
            onFork={onFork ? handleFork : undefined}
          />
        </div>
      ))}
    </div>
  );
}
