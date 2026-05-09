import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  useAgentEngine,
  type InterruptState,
} from "./useAgentEngine";
import { agentConfigAtom } from "@/atoms/config";
import {
  agentMessagesAtom,
  agentMessagesByTabAtom,
  agentStreamingByTabAtom,
  agentStreamingAtom,
  agentDraftsAtom,
  currentSessionIdAtom,
  agentSessionsListAtom,
  sessionTitleOverridesAtom,
  permissionModeByTabAtom,
  agentTokensByTabAtom,
  agentStateAtom,
  deriveSessionTitle,
  type Message,
  type AgentState,
} from "@/atoms/sessions";
import { activeTabAtom, tabsAtom } from "@/atoms/tabs";
import { rightPanelOpenAtom } from "@/atoms/sidebar";
import { toast } from "@/atoms/toast";
import { createAgentSession } from "@/lib/tauri";
import AgentHeader from "./AgentHeader";
import AgentMessages from "./AgentMessages";
import PermissionBanner from "./PermissionBanner";
import AskUserBanner from "./AskUserBanner";
import ExitPlanModeBanner from "./ExitPlanModeBanner";
import ChatInput from "@/components/chat/ChatInput";
import ContextUsageBadge from "./ContextUsageBadge";

export default function AgentView() {
  const [streaming] = useAtom(agentStreamingAtom);
  const setMessages = useSetAtom(agentMessagesAtom);
  const setMessagesByTab = useSetAtom(agentMessagesByTabAtom);
  const setStreamingByTab = useSetAtom(agentStreamingByTabAtom);
  const setAgentSessions = useSetAtom(agentSessionsListAtom);
  const setSessionTitleOverrides = useSetAtom(sessionTitleOverridesAtom);
  const [currentSessionId, setCurrentSessionId] = useAtom(currentSessionIdAtom);
  const [config] = useAtom(agentConfigAtom);
  const [drafts, setDrafts] = useAtom(agentDraftsAtom);
  const [rightPanelOpen, setRightPanelOpen] = useAtom(rightPanelOpenAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const setTabs = useSetAtom(tabsAtom);
  const [agentStarted, setAgentStarted] = useState(false);
  const [permissionModeByTab, setPermissionModeByTab] = useAtom(permissionModeByTabAtom);
  const tokensByTab = useAtomValue(agentTokensByTabAtom);
  const [agentState, setAgentState] = useAtom(agentStateAtom);
  const [interrupt, setInterrupt] = useState<InterruptState | null>(null);
  const [respondingInterruptId, setRespondingInterruptId] = useState<string | null>(null);
  const lastSentContentRef = useRef<string>("");

  const engine = useAgentEngine();
  const activeTabId = activeTab?.id ?? null;

  // Sync activeTabIdRef
  useEffect(() => {
    engine.activeTabIdRef.current = activeTabId;
  }, [activeTabId, engine.activeTabIdRef]);

  // #61 Listen for state machine changes from engine
  useEffect(() => {
    engine.onStateChangeRef.current = (state: AgentState | null) => {
      setAgentState(state);
    };
    return () => {
      engine.onStateChangeRef.current = null;
    };
  }, [engine.onStateChangeRef, setAgentState]);

  // Listen for interrupts from engine
  useEffect(() => {
    engine.onInterruptRef.current = (int) => {
      setInterrupt(int);
      if (int === null) {
        setRespondingInterruptId(null);
      }
    };
    return () => {
      engine.onInterruptRef.current = null;
    };
  }, [engine.onInterruptRef]);

  // Sync session ID on tab change
  useEffect(() => {
    if (activeTab?.type !== "agent") return;
    const sessionId = activeTab.sessionId ?? null;
    if (sessionId !== currentSessionId) {
      setCurrentSessionId(sessionId);
    }
  }, [activeTab, currentSessionId, setCurrentSessionId]);

  // Restart engine if session changes
  useEffect(() => {
    if (!engine.engineStartedRef.current) {
      engine.boundSessionIdRef.current = currentSessionId;
      engine.ownerTabIdRef.current = activeTabId;
      return;
    }
    if (engine.boundSessionIdRef.current !== currentSessionId) {
      const ownerTabId = engine.ownerTabIdRef.current;
      engine.stopEngine();
      engine.engineStartedRef.current = false;
      engine.boundSessionIdRef.current = currentSessionId;
      setAgentStarted(false);
      setInterrupt(null);
      setRespondingInterruptId(null);
      setAgentState(null);
      if (ownerTabId) {
        setStreamingByTab((prev) => ({ ...prev, [ownerTabId]: false }));
      }
      engine.streamingRef.current = false;
      engine.ownerTabIdRef.current = activeTabId;
    }
  }, [activeTabId, currentSessionId, engine, setStreamingByTab, setAgentState]);

  const handleInterruptDecision = useCallback(
    async (kind: string, response: Record<string, unknown>) => {
      if (!interrupt || respondingInterruptId) return;
      const interruptId = interrupt.interruptId;
      setRespondingInterruptId(interruptId);
      try {
        await engine.handleInterrupt(interruptId, kind, response);
        setInterrupt(null);
      } catch (error) {
        const msg = `审批响应失败: ${String(error)}`;
        const tabId = engine.activeTabIdRef.current;
        if (tabId) engine.pushError(msg, tabId);
        toast(msg, "error");
      } finally {
        setRespondingInterruptId((cur) => (cur === interruptId ? null : cur));
      }
    },
    [interrupt, engine, respondingInterruptId],
  );

  // Keyboard shortcut for permission interrupts only (Enter=allow, Esc=deny)
  useEffect(() => {
    if (!interrupt || interrupt.kind !== "permission") return;
    const onKey = (e: KeyboardEvent) => {
      if (respondingInterruptId) return;
      if (e.key === "Enter") {
        e.preventDefault();
        void handleInterruptDecision("permission", { allowed: true, alwaysAllow: false });
      }
      if (e.key === "Escape") {
        e.preventDefault();
        void handleInterruptDecision("permission", { allowed: false, alwaysAllow: false });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleInterruptDecision, interrupt, respondingInterruptId]);

  const startEngine = useCallback(async (sessionId: string) => {
    const tabId = activeTabId;
    const mode = tabId ? (permissionModeByTab[tabId] ?? "default") : "default";
    try {
      await engine.startEngine(sessionId, mode);
      setAgentStarted(true);
    } catch (e) {
      engine.engineStartedRef.current = false;
      engine.boundSessionIdRef.current = null;
      setRespondingInterruptId(null);
      const tid = engine.activeTabIdRef.current;
      if (tid) {
        setStreamingByTab((prev) => ({ ...prev, [tid]: false }));
      }
      toast(`启动 Agent 失败: ${String(e)}`, "error");
    }
  }, [activeTabId, engine, permissionModeByTab, setStreamingByTab]);

  // #61 handleSend — integrates state machine via beginSendCycle/afterMessageSent
  const handleSend = useCallback(
    async (content: string) => {
      const tabId = engine.activeTabIdRef.current;
      if (!tabId) return;

      // Start the state machine cycle
      engine.beginSendCycle();
      lastSentContentRef.current = content;

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

      if (!engine.engineStartedRef.current) {
        await startEngine(sessionId);
      }
      if (!agentStarted && !engine.engineStartedRef.current) {
        const tid = engine.activeTabIdRef.current;
        if (tid) {
          setMessagesByTab((prev) => ({
            ...prev,
            [tid]: [
              ...(prev[tid] ?? []),
              { id: crypto.randomUUID(), role: "user", content, isStreaming: false },
              {
                id: crypto.randomUUID(),
                role: "assistant",
                content: "Agent 引擎启动失败。请确认已安装 Claude Code CLI，且 `claude` 命令在 PATH 中。",
                isStreaming: false,
              },
            ],
          }));
        }
        return;
      }

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        isStreaming: false,
      };
      const derivedTitle = deriveSessionTitle([userMsg]);
      if (derivedTitle) {
        setAgentSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, title: derivedTitle } : s)),
        );
        setSessionTitleOverrides((prev) => ({ ...prev, [sessionId!]: derivedTitle }));
      }
      setMessages((prev) => [...prev, userMsg]);
      setDrafts((prev) => ({ ...prev, [tabId]: "" }));

      setStreamingByTab((prev) => ({ ...prev, [tabId]: true }));
      engine.streamingRef.current = true;

      // #61 Transition to waiting_first_event, start timeout
      engine.afterMessageSent();

      try {
        await engine.sendMessage(content);
      } catch (e) {
        const msg = `发送失败: ${String(e)}`;
        engine.pushError(msg, tabId);
        toast(msg, "error");
        setStreamingByTab((prev) => ({ ...prev, [tabId]: false }));
        engine.streamingRef.current = false;
        setAgentState("disconnected");
      }
    },
    [activeTab, agentStarted, currentSessionId, engine, setAgentSessions,
     setCurrentSessionId, setDrafts, setMessages, setMessagesByTab,
     setSessionTitleOverrides, setStreamingByTab, setTabs, startEngine, setAgentState],
  );

  // #61 Retry: re-send last message content
  const handleRetry = useCallback(() => {
    if (!lastSentContentRef.current) return;
    // For timeout/disconnected, clean up the engine so handleSend restarts it.
    // For empty_done the engine is already idle.
    if (agentState === "timeout" || agentState === "disconnected") {
      engine.stopEngine();
    }
    handleSend(lastSentContentRef.current);
  }, [agentState, engine, handleSend]);

  // #61 Stop: interrupt the current engine and clear state
  const handleStop = useCallback(() => {
    engine.stopEngine();
    setAgentState(null);
  }, [engine, setAgentState]);

  // #61 Resolve the title via sessionTitleOverridesAtom
  const [titleOverrides] = useAtom(sessionTitleOverridesAtom);
  const resolvedTitle = currentSessionId
    ? titleOverrides[currentSessionId] || "Agent"
    : "Agent";

  const permissionMode = activeTabId
    ? permissionModeByTab[activeTabId] ?? "default"
    : "default";

  const handlePermissionModeChange = useCallback(
    (mode: string) => {
      if (activeTabId) {
        setPermissionModeByTab((prev) => ({ ...prev, [activeTabId]: mode }));
      }
    },
    [activeTabId, setPermissionModeByTab],
  );

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      if (!currentSessionId) return;
      setSessionTitleOverrides((prev) => ({ ...prev, [currentSessionId]: newTitle }));
      setAgentSessions((prev) =>
        prev.map((s) => (s.id === currentSessionId ? { ...s, title: newTitle } : s)),
      );
    },
    [currentSessionId, setAgentSessions, setSessionTitleOverrides],
  );

  const handleDraftChange = useCallback(
    (text: string) => {
      const tabId = engine.activeTabIdRef.current;
      if (!tabId) return;
      setDrafts((prev) => ({ ...prev, [tabId]: text }));
    },
    [engine.activeTabIdRef, setDrafts],
  );

  const interruptBanner = useMemo(() => {
    if (!interrupt) return null;

    switch (interrupt.kind) {
      case "ask_user": {
        let question = "AI 向你提问";
        let options: string[] = [];
        try {
          const input = JSON.parse(interrupt.toolInput);
          question = input.question || question;
          options = input.options || [];
        } catch {}
        return (
          <AskUserBanner
            question={question}
            options={options}
            disabled={respondingInterruptId === interrupt.interruptId}
            onSubmit={(answers) =>
              void handleInterruptDecision("ask_user", answers as Record<string, unknown>)
            }
          />
        );
      }
      case "plan": {
        let planSummary = "(无计划详情)";
        try {
          const input = JSON.parse(interrupt.toolInput);
          planSummary = input.plan_summary || planSummary;
        } catch {}
        return (
          <ExitPlanModeBanner
            planSummary={planSummary}
            disabled={respondingInterruptId === interrupt.interruptId}
            onDecision={(decision, feedback) =>
              void handleInterruptDecision("plan", { decision, feedback } as Record<string, unknown>)
            }
          />
        );
      }
      default: {
        // "permission" or unknown
        return (
          <PermissionBanner
            toolName={interrupt.toolName}
            toolInput={interrupt.toolInput}
            disabled={respondingInterruptId === interrupt.interruptId}
            onAllow={() =>
              void handleInterruptDecision("permission", { allowed: true, alwaysAllow: false })
            }
            onDeny={() =>
              void handleInterruptDecision("permission", { allowed: false, alwaysAllow: false })
            }
            onAlwaysAllow={() =>
              void handleInterruptDecision("permission", { allowed: true, alwaysAllow: true })
            }
          />
        );
      }
    }
  }, [interrupt, respondingInterruptId, handleInterruptDecision]);

  // #61 State-dependent overlay
  const stateOverlay = useMemo(() => {
    switch (agentState) {
      case "starting":
        return (
          <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
            <div className="animate-spin w-4 h-4 border-2 border-border border-t-foreground rounded-full" />
            <span className="text-sm">正在启动 Agent...</span>
          </div>
        );
      case "waiting_first_event":
        return (
          <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
            <div className="animate-spin w-4 h-4 border-2 border-border border-t-foreground rounded-full" />
            <span className="text-sm">Agent 正在思考...</span>
          </div>
        );
      case "timeout":
        return (
          <div className="flex items-center justify-center gap-2 py-4 px-4 bg-destructive/5 border-t border-border">
            <span className="text-sm text-destructive font-medium">启动超时</span>
            <button
              onClick={handleRetry}
              className="text-xs px-2 py-1 rounded bg-accent hover:bg-accent/80 text-foreground transition-colors"
            >
              重试
            </button>
            <button
              onClick={handleStop}
              className="text-xs px-2 py-1 rounded bg-accent hover:bg-accent/80 text-foreground transition-colors"
            >
              停止
            </button>
          </div>
        );
      case "empty_done":
        return (
          <div className="flex items-center justify-center gap-2 py-4 px-4 border-t border-border">
            <span className="text-sm text-muted-foreground">Agent 未返回内容</span>
            <button
              onClick={handleRetry}
              className="text-xs px-2 py-1 rounded bg-accent hover:bg-accent/80 text-foreground transition-colors"
            >
              重试
            </button>
          </div>
        );
      case "disconnected":
        return (
          <div className="flex items-center justify-center gap-2 py-4 px-4 bg-destructive/5 border-t border-border">
            <span className="text-sm text-destructive font-medium">连接断开</span>
            <button
              onClick={handleRetry}
              className="text-xs px-2 py-1 rounded bg-accent hover:bg-accent/80 text-foreground transition-colors"
            >
              重试
            </button>
          </div>
        );
      default:
        return null;
    }
  }, [agentState, handleRetry, handleStop]);

  return (
    <div className="flex flex-col h-full">
      <AgentHeader
        sessionId={currentSessionId}
        title={resolvedTitle}
        providerLabel={config.providers[config.activeIndex]?.name || config.providers[config.activeIndex]?.model || "未配置"}
        rightPanelOpen={rightPanelOpen}
        onToggleRightPanel={() => setRightPanelOpen((prev) => !prev)}
        onTitleChange={handleTitleChange}
        permissionMode={permissionMode}
        onPermissionModeChange={handlePermissionModeChange}
      />
      <ContextUsageBadge
        totalTokens={activeTabId ? tokensByTab[activeTabId] : null}
      />
      <AgentMessages />
      {stateOverlay}
      {interruptBanner}
      <ChatInput
        onSend={handleSend}
        onStop={() => { engine.stopEngine(); }}
        sendDisabled={streaming}
        mode="agent"
        placeholder="输入消息... (@引用文件, Enter 发送)"
        draft={drafts[activeTab?.id ?? ""] ?? ""}
        onDraftChange={handleDraftChange}
      />
    </div>
  );
}
