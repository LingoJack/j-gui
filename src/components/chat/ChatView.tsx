import { useCallback, useRef } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Channel } from "@tauri-apps/api/core";
import {
  currentSessionIdAtom,
  messagesAtom,
  streamingAtom,
  type Message,
} from "@/atoms/sessions";
import { agentConfigAtom } from "@/atoms/config";
import { sendMessage, createSession, setActiveProvider } from "@/lib/tauri";
import type { ChatEvent } from "@/lib/tauri";
import { ChevronDown } from "lucide-react";
import ChatMessages from "./ChatMessages";
import ChatInput from "./ChatInput";

export default function ChatView() {
  const [sessionId, setSessionId] = useAtom(currentSessionIdAtom);
  const setMessages = useSetAtom(messagesAtom);
  const [streaming, setStreaming] = useAtom(streamingAtom);
  const config = useAtomValue(agentConfigAtom);
  const streamingRef = useRef(false);

  const handleSend = useCallback(
    async (content: string) => {
      // Ensure we have a session
      let sid = sessionId;
      if (!sid) {
        sid = await createSession();
        setSessionId(sid);
      }

      // Add user message
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        isStreaming: false,
      };
      setMessages((prev) => [...prev, userMsg]);

      // Add streaming placeholder
      const assistantId = crypto.randomUUID();
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        isStreaming: true,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      setStreaming(true);
      streamingRef.current = true;

      const onEvent = new Channel<ChatEvent>();
      onEvent.onmessage = (msg) => {
        if (!streamingRef.current) return;

        switch (msg.event) {
          case "chunk":
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + msg.data.content }
                  : m,
              ),
            );
            break;
          case "done":
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, isStreaming: false } : m,
              ),
            );
            setStreaming(false);
            streamingRef.current = false;
            break;
          case "error":
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: `错误: ${msg.data.message}`,
                      isStreaming: false,
                    }
                  : m,
              ),
            );
            setStreaming(false);
            streamingRef.current = false;
            break;
        }
      };

      try {
        await sendMessage(sid!, content, onEvent);
      } catch (e) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `发送失败: ${String(e)}`,
                  isStreaming: false,
                }
              : m,
          ),
        );
        setStreaming(false);
        streamingRef.current = false;
      }
    },
    [sessionId, setSessionId, setMessages, setStreaming],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between h-10 px-4 border-b border-border shrink-0 gap-2">
        <span className="text-sm font-medium shrink-0">Chat</span>
        <div className="flex items-center gap-2 min-w-0">
          {/* Model selector */}
          {config.providers.length > 0 && (
            <div className="relative">
              <select
                value={config.activeIndex}
                onChange={async (e) => {
                  const idx = Number(e.target.value);
                  await setActiveProvider(idx);
                }}
                className="text-xs bg-muted rounded-md px-2 py-1 pr-6 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring max-w-[140px] truncate"
              >
                {config.providers.map((p, i) => (
                  <option key={i} value={i}>
                    {p.name || p.model || `Provider ${i + 1}`}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground"
              />
            </div>
          )}
          <button
            onClick={() => {
              setMessages([]);
              setSessionId(null);
            }}
            className="text-xs text-muted-foreground hover:text-foreground shrink-0"
          >
            新建
          </button>
        </div>
      </div>
      <ChatMessages />
      <ChatInput onSend={handleSend} disabled={streaming} />
    </div>
  );
}
