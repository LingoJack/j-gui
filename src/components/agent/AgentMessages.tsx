import { useAtomValue } from "jotai";
import { agentMessagesAtom, agentStreamingAtom } from "@/atoms/sessions";
import MessageBubble from "@/components/chat/MessageBubble";
import ToolCallDisplay from "./ToolCallDisplay";
import TaskProgressCard from "./TaskProgressCard";

export default function AgentMessages() {
  const messages = useAtomValue(agentMessagesAtom);
  const streaming = useAtomValue(agentStreamingAtom);

  if (messages.length === 0 && !streaming) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p className="text-sm">输入消息启动 Agent 对话</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <TaskProgressCard messages={messages} />
      {messages.map((msg, i) => (
        <div key={msg.id}>
          {msg.toolCall ? (
            <ToolCallDisplay toolCall={msg.toolCall} />
          ) : (
            <MessageBubble message={msg} index={i} />
          )}
        </div>
      ))}
    </div>
  );
}
