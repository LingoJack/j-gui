import { useCallback, useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Channel } from "@tauri-apps/api/core";
import {
  startAgent,
  sendAgentMessage,
  respondAgentInterrupt,
  getAgentConfig,
  createAgentSession,
  stopAgent,
  type AgentEvent,
} from "@/lib/tauri";
import { agentConfigAtom } from "@/atoms/config";
import {
  agentMessagesAtom,
  agentStreamingAtom,
  currentSessionIdAtom,
  type Message,
} from "@/atoms/sessions";
import { activeTabAtom, tabsAtom } from "@/atoms/tabs";
import { rightPanelOpenAtom } from "@/atoms/sidebar";
import { toast } from "@/atoms/toast";
import { PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";
import AgentMessages from "./AgentMessages";
import PermissionBanner from "./PermissionBanner";
import ChatInput from "@/components/chat/ChatInput";

export default function AgentView() {
  const [streaming, setStreaming] = useAtom(agentStreamingAtom);
  const setMessages = useSetAtom(agentMessagesAtom);
  const [currentSessionId, setCurrentSessionId] = useAtom(currentSessionIdAtom);
  const [config, setConfig] = useAtom(agentConfigAtom);
  const [rightPanelOpen, setRightPanelOpen] = useAtom(rightPanelOpenAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const setTabs = useSetAtom(tabsAtom);
  const streamingRef = useRef(false);
  const [agentStarted, setAgentStarted] = useState(false);
  const [permissionMode, setPermissionMode] = useState<string>("bypassPermissions");
  const engineStartedRef = useRef(false);
  const engineRunIdRef = useRef(0);
  const boundSessionIdRef = useRef<string | null>(null);
  const [interrupt, setInterrupt] = useState<{interruptId: string; toolName: string; toolInput: string} | null>(null);
  const [respondingInterruptId, setRespondingInterruptId] = useState<string | null>(null);

  const updateInterruptMessage = useCallback(
    (interruptId: string, allowed: boolean) => {
      setMessages((prev) =>
        prev.map((message) =>
          message.toolCall?.toolId === interruptId
            ? {
                ...message,
                toolCall: {
                  ...message.toolCall,
                  toolOutput: allowed ? "approved" : "denied",
                  status: allowed ? "done" : "error",
                },
              }
            : message,
        ),
      );
    },
    [setMessages],
  );

  useEffect(() => {
    getAgentConfig().then(setConfig).catch(() => {});
  }, [setConfig]);

  useEffect(() => {
    if (activeTab?.type !== "agent") {
      return;
    }

    const sessionId = activeTab.sessionId ?? null;
    if (sessionId !== currentSessionId) {
      setCurrentSessionId(sessionId);
    }
  }, [activeTab, currentSessionId, setCurrentSessionId]);

  useEffect(() => {
    if (!engineStartedRef.current) {
      boundSessionIdRef.current = currentSessionId;
      return;
    }

    if (boundSessionIdRef.current !== currentSessionId) {
      engineRunIdRef.current += 1;
      stopAgent().catch(() => {});
      engineStartedRef.current = false;
      boundSessionIdRef.current = currentSessionId;
      setAgentStarted(false);
      setInterrupt(null);
      setRespondingInterruptId(null);
      setStreaming(false);
      streamingRef.current = false;
    }
  }, [currentSessionId, setStreaming]);

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

  const handleInterruptDecision = useCallback(
    async (allowed: boolean) => {
      if (!interrupt || respondingInterruptId) {
        return;
      }

      const interruptId = interrupt.interruptId;
      setRespondingInterruptId(interruptId);
      try {
        await respondAgentInterrupt(interruptId, allowed);
        updateInterruptMessage(interruptId, allowed);
        setInterrupt(null);
      } catch (error) {
        const message = `审批响应失败: ${String(error)}`;
        pushAgentError(message);
        toast(message, "error");
      } finally {
        setRespondingInterruptId((current) => (current === interruptId ? null : current));
      }
    },
    [interrupt, pushAgentError, respondingInterruptId, updateInterruptMessage],
  );

  useEffect(() => {
    if (!interrupt) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (respondingInterruptId) {
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        void handleInterruptDecision(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        void handleInterruptDecision(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleInterruptDecision, interrupt, respondingInterruptId]);

  const startEngine = useCallback(async (sessionId: string) => {
    if (engineStartedRef.current) return;
    engineStartedRef.current = true;
    const runId = engineRunIdRef.current + 1;
    engineRunIdRef.current = runId;
    boundSessionIdRef.current = sessionId;

    const onEvent = new Channel<AgentEvent>();
    onEvent.onmessage = (msg) => {
      if (engineRunIdRef.current !== runId) return;
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
        case "interrupt":
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: "",
              isStreaming: false,
              toolCall: {
                toolId: msg.data.interruptId,
                toolName: msg.data.toolName,
                toolInput: msg.data.toolInput,
                status: "running",
              },
            },
          ]);
          setInterrupt({ interruptId: msg.data.interruptId, toolName: msg.data.toolName, toolInput: msg.data.toolInput });
          break;
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
          setInterrupt(null);
          setRespondingInterruptId(null);
          break;
        case "error":
          pushAgentError(msg.data.message);
          toast(msg.data.message, "error");
          setStreaming(false);
          streamingRef.current = false;
          setInterrupt(null);
          setRespondingInterruptId(null);
          break;
      }
    };

    try {
      await startAgent(onEvent, permissionMode, sessionId);
      setAgentStarted(true);
    } catch (e) {
      if (engineRunIdRef.current === runId) {
        engineRunIdRef.current += 1;
      }
      engineStartedRef.current = false;
      boundSessionIdRef.current = null;
      setRespondingInterruptId(null);
        toast(`启动 Agent 失败: ${String(e)}`, "error");
      }
  }, [permissionMode, pushAgentError, setMessages, setStreaming]);

  useEffect(() => {
    return () => {
      if (engineStartedRef.current) {
        engineRunIdRef.current += 1;
        stopAgent().catch(() => {});
      }
    };
  }, []);

  const handleSend = useCallback(
    async (content: string) => {
      let sessionId = currentSessionId;
      if (!sessionId) {
        sessionId = await createAgentSession();
        setCurrentSessionId(sessionId);
        if (activeTab) {
          setTabs((prev) =>
            prev.map((tab) =>
              tab.id === activeTab.id ? { ...tab, sessionId } : tab,
            ),
          );
        }
      }

      if (!engineStartedRef.current) {
        await startEngine(sessionId);
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
            content: "Agent 引擎启动失败。请确认已安装 Claude Code CLI，且 `claude` 命令在 PATH 中。",
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
    [
      activeTab,
      agentStarted,
      currentSessionId,
      pushAgentError,
      setCurrentSessionId,
      setMessages,
      setStreaming,
      setTabs,
      startEngine,
    ],
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
        <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
          {[
            { value: "bypassPermissions", label: "Auto" },
            { value: "default", label: "审批" },
            { value: "plan", label: "计划" },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPermissionMode(value)}
              className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${
                permissionMode === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setRightPanelOpen((prev) => !prev)}
          className={cn(
            "p-1 rounded-md hover:bg-accent",
            rightPanelOpen ? "text-foreground bg-accent" : "text-muted-foreground",
          )}
          title="切换文件浏览器"
        >
          <PanelRight size={14} />
        </button>
      </div>
      <AgentMessages />
      {interrupt && (
        <PermissionBanner
          toolName={interrupt.toolName}
          toolInput={interrupt.toolInput}
          disabled={respondingInterruptId === interrupt.interruptId}
          onAllow={() => {
            void handleInterruptDecision(true);
          }}
          onDeny={() => {
            void handleInterruptDecision(false);
          }}
        />
      )}
      <ChatInput onSend={handleSend} sendDisabled={streaming} placeholder="输入消息... (@引用文件 / 调用Skills / # 调用MCP, Enter 发送)" />
    </div>
  );
}
