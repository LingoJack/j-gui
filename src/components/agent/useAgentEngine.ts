import { useCallback, useEffect, useRef } from "react";
import { useSetAtom } from "jotai";
import { Channel } from "@tauri-apps/api/core";
import {
  startAgent,
  respondAgentInterrupt,
  stopAgent,
  sendAgentMessage,
  type AgentEvent,
} from "@/lib/tauri";
import {
  agentMessagesByTabAtom,
  agentStreamingByTabAtom,
} from "@/atoms/sessions";
import { toast } from "@/atoms/toast";

export interface InterruptState {
  interruptId: string;
  toolName: string;
  toolInput: string;
}

export function useAgentEngine() {
  const setMessagesByTab = useSetAtom(agentMessagesByTabAtom);
  const setStreamingByTab = useSetAtom(agentStreamingByTabAtom);

  const engineStartedRef = useRef(false);
  const engineRunIdRef = useRef(0);
  const boundSessionIdRef = useRef<string | null>(null);
  const ownerTabIdRef = useRef<string | null>(null);
  const streamingRef = useRef(false);
  const activeTabIdRef = useRef<string | null>(null);
  const onInterruptRef = useRef<((int: InterruptState | null) => void) | null>(null);

  const pushError = useCallback(
    (message: string, tabId: string) => {
      setMessagesByTab((prev) => ({
        ...prev,
        [tabId]: [
          ...(prev[tabId] ?? []),
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: message,
            isStreaming: false,
          },
        ],
      }));
    },
    [setMessagesByTab],
  );

  useEffect(() => {
    return () => {
      if (engineStartedRef.current) {
        engineRunIdRef.current += 1;
        stopAgent().catch(() => {});
      }
    };
  }, []);

  const startEngine = useCallback(
    async (sessionId: string, permissionMode: string) => {
      if (engineStartedRef.current) return;
      engineStartedRef.current = true;
      const runId = engineRunIdRef.current + 1;
      engineRunIdRef.current = runId;
      boundSessionIdRef.current = sessionId;
      const tabId = activeTabIdRef.current;

      const onEvent = new Channel<AgentEvent>();
      onEvent.onmessage = (msg) => {
        if (engineRunIdRef.current !== runId) return;
        if (!streamingRef.current && msg.event !== "done" && msg.event !== "error") return;
        if (!tabId) return;

        switch (msg.event) {
          case "assistantContent": {
            const text = msg.data.text;
            setMessagesByTab((prev) => {
              const messages = prev[tabId] ?? [];
              const last = messages[messages.length - 1];
              if (last && last.role === "assistant" && last.isStreaming) {
                return {
                  ...prev,
                  [tabId]: [
                    ...messages.slice(0, -1),
                    { ...last, content: last.content + text },
                  ],
                };
              }
              return {
                ...prev,
                [tabId]: [
                  ...messages,
                  {
                    id: crypto.randomUUID(),
                    role: "assistant" as const,
                    content: text,
                    isStreaming: true,
                  },
                ],
              };
            });
            break;
          }
          case "toolUse": {
            setMessagesByTab((prev) => ({
              ...prev,
              [tabId]: [
                ...(prev[tabId] ?? []),
                {
                  id: crypto.randomUUID(),
                  role: "assistant" as const,
                  content: "",
                  isStreaming: false,
                  toolCall: {
                    toolId: msg.data.toolId,
                    toolName: msg.data.toolName,
                    toolInput: msg.data.toolInput,
                    status: "running" as const,
                  },
                },
              ],
            }));
            break;
          }
          case "interrupt":
            setMessagesByTab((prev) => ({
              ...prev,
              [tabId]: [
                ...(prev[tabId] ?? []),
                {
                  id: crypto.randomUUID(),
                  role: "assistant" as const,
                  content: "",
                  isStreaming: false,
                  toolCall: {
                    toolId: msg.data.interruptId,
                    toolName: msg.data.toolName,
                    toolInput: msg.data.toolInput,
                    status: "running" as const,
                  },
                },
              ],
            }));
            onInterruptRef.current?.({
              interruptId: msg.data.interruptId,
              toolName: msg.data.toolName,
              toolInput: msg.data.toolInput,
            });
            break;
          case "toolResult": {
            setMessagesByTab((prev) => ({
              ...prev,
              [tabId]: (prev[tabId] ?? []).map((m) =>
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
            }));
            break;
          }
          case "done":
            setMessagesByTab((prev) => ({
              ...prev,
              [tabId]: (prev[tabId] ?? []).map((m) =>
                m.toolCall?.status === "running"
                  ? {
                      ...m,
                      toolCall: { ...m.toolCall, status: "done" as const },
                    }
                  : m.isStreaming
                    ? { ...m, isStreaming: false }
                    : m,
              ),
            }));
            setStreamingByTab((prev) => ({ ...prev, [tabId]: false }));
            streamingRef.current = false;
            onInterruptRef.current?.(null);
            break;
          case "error":
            pushError(msg.data.message, tabId);
            toast(msg.data.message, "error");
            setStreamingByTab((prev) => ({ ...prev, [tabId]: false }));
            streamingRef.current = false;
            onInterruptRef.current?.(null);
            break;
        }
      };

      try {
        await startAgent(onEvent, permissionMode, sessionId);
      } catch (e) {
        if (engineRunIdRef.current === runId) {
          engineRunIdRef.current += 1;
        }
        engineStartedRef.current = false;
        boundSessionIdRef.current = null;
        if (tabId) {
          setStreamingByTab((prev) => ({ ...prev, [tabId]: false }));
        }
        throw e;
      }
    },
    [pushError, setMessagesByTab, setStreamingByTab],
  );

  const stopEngine = useCallback(() => {
    engineRunIdRef.current += 1;
    const tabId = ownerTabIdRef.current;
    stopAgent().catch(() => {});
    engineStartedRef.current = false;
    boundSessionIdRef.current = null;
    streamingRef.current = false;
    if (tabId) {
      setStreamingByTab((prev) => ({ ...prev, [tabId]: false }));
    }
  }, [setStreamingByTab]);

  const handleInterrupt = useCallback(
    async (interruptId: string, allowed: boolean) => {
      try {
        await respondAgentInterrupt(interruptId, allowed);
        const tabId = activeTabIdRef.current;
        if (tabId) {
          setMessagesByTab((prev) => ({
            ...prev,
            [tabId]: (prev[tabId] ?? []).map((message) =>
              message.toolCall?.toolId === interruptId
                ? {
                    ...message,
                    toolCall: {
                      ...message.toolCall,
                      toolOutput: allowed ? "approved" : "denied",
                      status: allowed ? ("done" as const) : ("error" as const),
                    },
                  }
                : message,
            ),
          }));
        }
        onInterruptRef.current?.(null);
      } catch (error) {
        throw error;
      }
    },
    [setMessagesByTab],
  );

  return {
    engineStartedRef,
    engineRunIdRef,
    boundSessionIdRef,
    ownerTabIdRef,
    streamingRef,
    activeTabIdRef,
    startEngine,
    stopEngine,
    handleInterrupt,
    sendMessage: sendAgentMessage,
    pushError,
    onInterruptRef,
  };
}
