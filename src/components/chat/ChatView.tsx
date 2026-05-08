import { useCallback, useRef } from "react";
import { useEffect, useState } from "react";
import { useAtom, useSetAtom } from "jotai";
import { Channel } from "@tauri-apps/api/core";
import {
  currentSessionIdAtom,
  messagesAtom,
  streamingAtom,
  type Message,
} from "@/atoms/sessions";
import { agentConfigAtom } from "@/atoms/config";
import { sendMessage, createSession, deleteMessage, setActiveProvider, getAgentConfig, setTheme, getVersion } from "@/lib/tauri";
import type { ChatEvent } from "@/lib/tauri";
import { ChevronDown, Sun, Moon } from "lucide-react";
import { toast } from "@/atoms/toast";
import { themeAtom } from "@/atoms/theme";
import ChatMessages from "./ChatMessages";
import ChatInput from "./ChatInput";

export default function ChatView() {
  const [sessionId, setSessionId] = useAtom(currentSessionIdAtom);
  const setMessages = useSetAtom(messagesAtom);
  const [streaming, setStreaming] = useAtom(streamingAtom);
  const [config, setConfig] = useAtom(agentConfigAtom);
  const [theme, setThemeState] = useAtom(themeAtom);
  const [version, setVersion] = useState("");
  const streamingRef = useRef(false);

  useEffect(() => {
    getAgentConfig().then(setConfig).catch(() => {});
    getVersion().then(setVersion).catch(() => {});
  }, [setConfig]);

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
            toast(msg.data.message, "error");
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
        toast(`发送失败: ${String(e)}`, "error");
        streamingRef.current = false;
      }
    },
    [sessionId, setSessionId, setMessages, setStreaming],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between h-10 px-4 border-b border-border shrink-0 gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-medium">Chat</span>
          {version && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {version}
            </span>
          )}
        </div>
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
          <button
            onClick={async () => {
              const next = theme === "dark" ? "light" : "dark";
              setThemeState(next);
              document.documentElement.classList.toggle("dark", next === "dark");
              await setTheme(next);
            }}
            className="p-1 rounded-md hover:bg-accent text-muted-foreground shrink-0"
            title={theme === "dark" ? "切换亮色" : "切换暗色"}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>
      <ChatMessages
        onDelete={(index) => {
          if (!sessionId) return;
          const pairIndex = Math.floor(index / 2);
          deleteMessage(sessionId, pairIndex)
            .then(() => {
              setMessages((prev) => {
                const userIdx = pairIndex * 2;
                const newMsgs = [...prev];
                newMsgs.splice(userIdx, 2);
                return newMsgs;
              });
            })
            .catch((e) => toast(`删除失败: ${String(e)}`, "error"));
        }}
        onResend={(index, content) => {
          // Remove messages from this user message onward, then resend
          setMessages((prev) => prev.slice(0, index));
          handleSend(content);
        }}
      />
      <ChatInput onSend={handleSend} disabled={streaming} />
    </div>
  );
}
