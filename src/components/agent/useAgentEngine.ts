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
  agentTokensByTabAtom,
  type AgentState,
} from "@/atoms/sessions";
import { toast } from "@/atoms/toast";

export interface InterruptState {
  interruptId: string;
  kind: string;
  toolName: string;
  toolInput: string;
}

const DEFAULT_TIMEOUT_MS = 15000;

export function useAgentEngine(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
  const setMessagesByTab = useSetAtom(agentMessagesByTabAtom);
  const setStreamingByTab = useSetAtom(agentStreamingByTabAtom);
  const setTokensByTab = useSetAtom(agentTokensByTabAtom);

  const engineStartedRef = useRef(false);
  const engineRunIdRef = useRef(0);
  const boundSessionIdRef = useRef<string | null>(null);
  const ownerTabIdRef = useRef<string | null>(null);
  const streamingRef = useRef(false);
  const activeTabIdRef = useRef<string | null>(null);
  const onInterruptRef = useRef<((int: InterruptState | null) => void) | null>(null);

  // #61 State machine refs
  const onStateChangeRef = useRef<((state: AgentState | null) => void) | null>(null);
  const stateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateCycleHadContentRef = useRef(false);

  const clearSendTimeout = useCallback(() => {
    if (stateTimeoutRef.current) {
      clearTimeout(stateTimeoutRef.current);
      stateTimeoutRef.current = null;
    }
  }, []);

  const resetSendCycle = useCallback(() => {
    clearSendTimeout();
    stateCycleHadContentRef.current = false;
  }, [clearSendTimeout]);

  /**
   * beginSendCycle — called at the start of every user send.
   * Resets all send-cycle tracking and transitions → `starting`.
   */
  const beginSendCycle = useCallback(() => {
    resetSendCycle();
    onStateChangeRef.current?.("starting");
  }, [resetSendCycle]);

  /**
   * afterMessageSent — called after the engine is ready and the message
   * has been dispatched. Transitions → `waiting_first_event` and starts
   * the configurable timeout.
   */
  const afterMessageSent = useCallback(() => {
    onStateChangeRef.current?.("waiting_first_event");
    stateCycleHadContentRef.current = false;
    stateTimeoutRef.current = setTimeout(() => {
      onStateChangeRef.current?.("timeout");
    }, timeoutMs);
  }, [timeoutMs]);

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
            // #61 State transition: first content → streaming
            if (!stateCycleHadContentRef.current) {
              stateCycleHadContentRef.current = true;
              clearSendTimeout();
              onStateChangeRef.current?.("streaming");
            }
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
            // #61 State transition: first content → streaming
            if (!stateCycleHadContentRef.current) {
              stateCycleHadContentRef.current = true;
              clearSendTimeout();
              onStateChangeRef.current?.("streaming");
            }
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
              kind: msg.data.kind,
              toolName: msg.data.toolName,
              toolInput: msg.data.toolInput,
            });
            // #61 State transition: first interrupt → streaming
            if (!stateCycleHadContentRef.current) {
              stateCycleHadContentRef.current = true;
              clearSendTimeout();
              onStateChangeRef.current?.("streaming");
            }
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
            setTokensByTab((prev) => ({
              ...prev,
              [tabId]: msg.data.totalTokens,
            }));
            // #61 State transition: done with/without content
            clearSendTimeout();
            onStateChangeRef.current?.(stateCycleHadContentRef.current ? "idle_done" : "empty_done");
            setStreamingByTab((prev) => ({ ...prev, [tabId]: false }));
            streamingRef.current = false;
            onInterruptRef.current?.(null);
            break;
          case "error":
            pushError(msg.data.message, tabId);
            toast(msg.data.message, "error");
            // #61 State transition: error → disconnected
            clearSendTimeout();
            onStateChangeRef.current?.("disconnected");
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
        resetSendCycle();
        onStateChangeRef.current?.("disconnected");
        if (tabId) {
          setStreamingByTab((prev) => ({ ...prev, [tabId]: false }));
        }
        throw e;
      }
    },
    [pushError, setMessagesByTab, setStreamingByTab, setTokensByTab, resetSendCycle, clearSendTimeout],
  );

  const stopEngine = useCallback(() => {
    engineRunIdRef.current += 1;
    const tabId = ownerTabIdRef.current;
    stopAgent().catch(() => {});
    resetSendCycle();
    engineStartedRef.current = false;
    boundSessionIdRef.current = null;
    streamingRef.current = false;
    if (tabId) {
      setStreamingByTab((prev) => ({ ...prev, [tabId]: false }));
    }
  }, [setStreamingByTab, resetSendCycle]);

  const handleInterrupt = useCallback(
    async (
      interruptId: string,
      kind: string,
      response: Record<string, unknown>,
    ) => {
      try {
        await respondAgentInterrupt(interruptId, kind, response);
        const tabId = activeTabIdRef.current;
        if (tabId) {
          const responseStr = JSON.stringify(response);
          const status =
            kind === "permission" && response.allowed === false
              ? ("error" as const)
              : ("done" as const);
          setMessagesByTab((prev) => ({
            ...prev,
            [tabId]: (prev[tabId] ?? []).map((message) =>
              message.toolCall?.toolId === interruptId
                ? {
                    ...message,
                    toolCall: {
                      ...message.toolCall,
                      toolOutput: responseStr,
                      status,
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
    // #61 State machine API
    onStateChangeRef,
    beginSendCycle,
    afterMessageSent,
    resetSendCycle,
  };
}
