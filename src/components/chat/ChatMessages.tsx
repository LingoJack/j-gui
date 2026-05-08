import { useAtomValue } from "jotai";
import { messagesAtom, streamingAtom } from "@/atoms/sessions";
import MessageBubble from "./MessageBubble";

interface Props {
  onDelete?: (index: number) => void;
  onResend?: (index: number, content: string) => void;
}

export default function ChatMessages({ onDelete, onResend }: Props) {
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
      {messages.map((msg, i) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          onDelete={onDelete ? () => onDelete(i) : undefined}
          onResend={onResend ? () => onResend(i, msg.content) : undefined}
        />
      ))}
    </div>
  );
}
