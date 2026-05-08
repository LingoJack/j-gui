import { useCallback, useEffect, useRef, useState } from "react";
import { useAtom, useSetAtom } from "jotai";
import { Channel } from "@tauri-apps/api/core";
import {
  startAgent,
  sendAgentMessage,
  getAgentConfig,
  type AgentEvent,
} from "@/lib/tauri";
import { agentConfigAtom } from "@/atoms/config";
import { agentMessagesAtom, agentStreamingAtom, type Message } from "@/atoms/sessions";
import { toast } from "@/atoms/toast";
import AgentMessages from "./AgentMessages";
import ChatInput from "@/components/chat/ChatInput";

export default function AgentView() {
  const [streaming, setStreaming] = useAtom(agentStreamingAtom);
  const setMessages = useSetAtom(agentMessagesAtom);
  const [config, setConfig] = useAtom(agentConfigAtom);
  const streamingRef = useRef(false);
  const [agentStarted, setAgentStarted] = useState(false);
  const engineStartedRef = useRef(false);

  useEffect(() => {
    getAgentConfig().then(setConfig).catch(() => {});
  }, [setConfig]);

  const pushAgentError = useCallback(
    (message: string) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: message,
          isStreaming: false,
        },
      ]);
    },
    [setMessages],
  );

  const startEngine = useCallback(async () => {
    if (engineStartedRef.current) return;
    engineStartedRef.current = true;

    const onEvent = new Channel<AgentEvent>();
    onEvent.onmessage = (msg) => {
      if (!streamingRef.current && msg.event !== "done" && msg.event !== "error") return;

      switch (msg.event) {
        case "assistantContent": {
          const text = msg.data.text;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.isStreaming) {
              const updated = [...prev];
              updated[updated.length - 1] = { ...last, content: last.content + text };
              return updated;
            }
            const newMsg: Message = {
              id: crypto.randomUUID(),
              role: "assistant",
              content: text,
              isStreaming: true,
              toolCall: undefined,
            };
            return [...prev, newMsg];
          });
          break;
        }
        case "toolUse": {
          const tcMsg: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "",
            isStreaming: false,
            toolCall: {
              toolId: msg.data.toolId,
              toolName: msg.data.toolName,
              toolInput: msg.data.toolInput,
              status: "running",
            },
          };
          setMessages((prev) => [...prev, tcMsg]);
          break;
        }
        case "toolResult": {
          setMessages((prev) =>
            prev.map((m) =>
              m.toolCall?.toolId === msg.data.toolId
                ? {
                    ...m,
                    toolCall: {
                      ...m.toolCall,
                      toolOutput: msg.data.content,
                      status: "done" as const,
                    },
                  }
                : m,
            ),
          );
          break;
        }
        case "done":
          setMessages((prev) =>
            prev.map((m) =>
              m.toolCall?.status === "running"
                ? {
                    ...m,
                    toolCall: {
                      ...m.toolCall,
                      status: "done" as const,
                    },
                  }
                : m.isStreaming
                  ? { ...m, isStreaming: false }
                  : m,
            ),
          );
          setStreaming(false);
          streamingRef.current = false;
          break;
        case "error":
          pushAgentError(msg.data.message);
          toast(msg.data.message, "error");
          setStreaming(false);
          streamingRef.current = false;
          break;
      }
    };

    try {
      await startAgent(onEvent);
      setAgentStarted(true);
    } catch (e) {
      engineStartedRef.current = false;
      toast(`启动 Agent 失败: ${String(e)}`, "error");
    }
  }, [pushAgentError, setMessages, setStreaming]);

  const handleSend = useCallback(
    async (content: string) => {
      if (!engineStartedRef.current) {
        await startEngine();
      }
      if (!agentStarted && !engineStartedRef.current) {
        // Engine failed to start — show error in chat
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "user",
            content,
            isStreaming: false,
          },
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Agent 引擎启动失败。请确认已安装 Claude Code CLI（`npm i -g @anthropic-ai/claude-code`）且 `claude` 命令在 PATH 中。",
            isStreaming: false,
          },
        ]);
        return;
      }

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        isStreaming: false,
      };
      setMessages((prev) => [...prev, userMsg]);

      setStreaming(true);
      streamingRef.current = true;

      try {
        await sendAgentMessage(content);
      } catch (e) {
        const message = `发送失败: ${String(e)}`;
        pushAgentError(message);
        toast(message, "error");
        setStreaming(false);
        streamingRef.current = false;
      }
    },
    [agentStarted, pushAgentError, setMessages, setStreaming, startEngine],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between h-10 px-4 border-b border-border shrink-0 gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-medium">Agent</span>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {config.providers[config.activeIndex]?.name || config.providers[config.activeIndex]?.model || "未配置"}
          </span>
        </div>
      </div>
      <AgentMessages />
      <ChatInput onSend={handleSend} sendDisabled={streaming} />
    </div>
  );
}
