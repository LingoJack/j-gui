import { useRef } from "react";
import { useAtomValue } from "jotai";
import { chatMessagesAtom, chatStreamingAtom } from "@/atoms/sessions";
import { activeTabAtom } from "@/atoms/tabs";
import MessageBubble from "./MessageBubble";
import ContextDivider from "./ContextDivider";
import ScrollMinimap from "./ScrollMinimap";
import AgentRecommendBanner from "./AgentRecommendBanner";

interface Props {
  onDelete?: (index: number) => void;
  onResend?: (index: number, content: string) => void;
  onFork?: (index: number, content: string) => void;
  forkIndex?: number;
  clearMarker?: number | null;
}

export default function ChatMessages({
  onDelete,
  onResend,
  onFork,
  forkIndex,
  clearMarker,
}: Props) {
  const messages = useAtomValue(chatMessagesAtom);
  const streaming = useAtomValue(chatStreamingAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const isChatMode = activeTab?.type === "chat";

  return (
    <div className="flex-1 relative overflow-hidden">
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto px-4 py-4 space-y-4"
      >
        {messages.map((msg, i) => (
          <div key={msg.id}>
            {clearMarker != null && i === clearMarker && <ContextDivider />}
            {forkIndex != null && i === forkIndex && <ContextDivider />}
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
        {/* Divider at the very end when clearMarker equals message count */}
        {clearMarker != null && clearMarker === messages.length && (
          <ContextDivider />
        )}
        {messages.length > 0 && isChatMode && <AgentRecommendBanner />}
      </div>
      <ScrollMinimap containerRef={scrollRef} messageCount={messages.length} />
    </div>
  );
}
