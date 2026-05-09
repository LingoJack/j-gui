import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { agentMessagesAtom, agentStreamingAtom } from "@/atoms/sessions";
import MessageBubble from "@/components/chat/MessageBubble";
import ToolCallDisplay from "./ToolCallDisplay";
import TaskProgressCard from "./TaskProgressCard";

export default function AgentMessages() {
  const messages = useAtomValue(agentMessagesAtom);
  const streaming = useAtomValue(agentStreamingAtom);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  // Auto-scroll when new messages arrive or during streaming
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (userScrolledUpRef.current && !streaming) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, messages[messages.length - 1]?.content, streaming]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    userScrolledUpRef.current = !atBottom;
  };

  if (messages.length === 0 && !streaming) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p className="text-sm">输入消息启动 Agent 对话</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
    >
      <TaskProgressCard messages={messages} />
      {messages.map((msg, i) => (
        <div key={msg.id}>
          {msg.toolCall ? (
            <ToolCallDisplay
              toolId={msg.toolCall.toolId}
              toolName={msg.toolCall.toolName}
              toolInput={msg.toolCall.toolInput}
              toolOutput={msg.toolCall.toolOutput}
              status={msg.toolCall.status}
            />
          ) : (
            <MessageBubble message={msg} index={i} />
          )}
        </div>
      ))}
    </div>
  );
}
