import { useCallback, useEffect, useState } from "react";
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
  deriveSessionTitle,
  type Message,
} from "@/atoms/sessions";
import { activeTabAtom, tabsAtom } from "@/atoms/tabs";
import { rightPanelOpenAtom } from "@/atoms/sidebar";
import { toast } from "@/atoms/toast";
import { createAgentSession } from "@/lib/tauri";
import { PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";
import AgentMessages from "./AgentMessages";
import PermissionBanner from "./PermissionBanner";
import ChatInput from "@/components/chat/ChatInput";

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
  const [permissionMode, setPermissionMode] = useState("bypassPermissions");
  const [interrupt, setInterrupt] = useState<InterruptState | null>(null);
  const [respondingInterruptId, setRespondingInterruptId] = useState<string | null>(null);

  const engine = useAgentEngine();
  const activeTabId = activeTab?.id ?? null;

  // Sync activeTabIdRef
  useEffect(() => {
    engine.activeTabIdRef.current = activeTabId;
  }, [activeTabId, engine.activeTabIdRef]);

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
      if (ownerTabId) {
        setStreamingByTab((prev) => ({ ...prev, [ownerTabId]: false }));
      }
      engine.streamingRef.current = false;
      engine.ownerTabIdRef.current = activeTabId;
    }
  }, [activeTabId, currentSessionId, engine, setStreamingByTab]);

  const handleInterruptDecision = useCallback(
    async (allowed: boolean) => {
      if (!interrupt || respondingInterruptId) return;
      const interruptId = interrupt.interruptId;
      setRespondingInterruptId(interruptId);
      try {
        await engine.handleInterrupt(interruptId, allowed);
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

  // Keyboard handler for interrupt
  useEffect(() => {
    if (!interrupt) return;
    const onKey = (e: KeyboardEvent) => {
      if (respondingInterruptId) return;
      if (e.key === "Enter") { e.preventDefault(); void handleInterruptDecision(true); }
      if (e.key === "Escape") { e.preventDefault(); void handleInterruptDecision(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleInterruptDecision, interrupt, respondingInterruptId]);

  const startEngine = useCallback(async (sessionId: string) => {
    try {
      await engine.startEngine(sessionId, permissionMode);
      setAgentStarted(true);
    } catch (e) {
      engine.engineStartedRef.current = false;
      engine.boundSessionIdRef.current = null;
      setRespondingInterruptId(null);
      const tabId = engine.activeTabIdRef.current;
      if (tabId) {
        setStreamingByTab((prev) => ({ ...prev, [tabId]: false }));
      }
      toast(`启动 Agent 失败: ${String(e)}`, "error");
    }
  }, [engine, permissionMode, setStreamingByTab]);

  const handleSend = useCallback(
    async (content: string) => {
      const tabId = engine.activeTabIdRef.current;
      if (!tabId) return;
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

      try {
        await engine.sendMessage(content);
      } catch (e) {
        const msg = `发送失败: ${String(e)}`;
        engine.pushError(msg, tabId);
        toast(msg, "error");
        setStreamingByTab((prev) => ({ ...prev, [tabId]: false }));
        engine.streamingRef.current = false;
      }
    },
    [activeTab, agentStarted, currentSessionId, engine, setAgentSessions,
     setCurrentSessionId, setDrafts, setMessages, setMessagesByTab,
     setSessionTitleOverrides, setStreamingByTab, setTabs, startEngine],
  );

  const handleDraftChange = useCallback(
    (text: string) => {
      const tabId = engine.activeTabIdRef.current;
      if (!tabId) return;
      setDrafts((prev) => ({ ...prev, [tabId]: text }));
    },
    [engine.activeTabIdRef, setDrafts],
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
          onAllow={() => void handleInterruptDecision(true)}
          onDeny={() => void handleInterruptDecision(false)}
        />
      )}
      <ChatInput
        onSend={handleSend}
        sendDisabled={streaming}
        placeholder="输入消息... (@引用文件 / 调用Skills / # 调用MCP, Enter 发送)"
        draft={drafts[activeTab?.id ?? ""] ?? ""}
        onDraftChange={handleDraftChange}
      />
    </div>
  );
}
