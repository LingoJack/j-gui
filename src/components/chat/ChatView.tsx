import { useCallback, useMemo, useRef } from "react";
import { useEffect, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Channel } from "@tauri-apps/api/core";
import {
  currentSessionIdAtom,
  chatMessagesAtom,
  chatStreamingAtom,
  chatDraftsAtom,
  type Message,
} from "@/atoms/sessions";
import { agentConfigAtom } from "@/atoms/config";
import { activeTabAtom, tabsAtom } from "@/atoms/tabs";
import {
  sendMessage,
  createSession,
  deleteMessage,
  clearSession,
  setActiveProvider,
  getAgentConfig,
  getSystemPrompt,
  setSystemPrompt,
  setTheme,
  getVersion,
} from "@/lib/tauri";
import type { ChatEvent } from "@/lib/tauri";
import { ChevronDown, Sun, Moon, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/atoms/toast";
import { themeAtom } from "@/atoms/theme";
import { cn } from "@/lib/utils";
import ChatMessages from "./ChatMessages";
import ChatInput from "./ChatInput";

function estimateTokens(messages: Message[]): number {
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  return Math.max(0, Math.round(totalChars / 3.5));
}

export default function ChatView() {
  const [sessionId, setSessionId] = useAtom(currentSessionIdAtom);
  const messages = useAtomValue(chatMessagesAtom);
  const setMessages = useSetAtom(chatMessagesAtom);
  const [streaming, setStreaming] = useAtom(chatStreamingAtom);
  const [config, setConfig] = useAtom(agentConfigAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const setTabs = useSetAtom(tabsAtom);
  const [theme, setThemeState] = useAtom(themeAtom);
  const [drafts, setDrafts] = useAtom(chatDraftsAtom);
  const [version, setVersion] = useState("");
  const [sysPrompt, setSysPrompt] = useState<string>("");
  const [sysPromptOpen, setSysPromptOpen] = useState(false);
  const [sysPromptDraft, setSysPromptDraft] = useState("");
  const [forkIndex, setForkIndex] = useState<number | undefined>(undefined);
  const streamingRef = useRef(false);
  const channelRef = useRef<Channel<ChatEvent> | null>(null);
  const sysPromptRef = useRef<HTMLDivElement>(null);

  const tokenCount = useMemo(() => estimateTokens(messages), [messages]);

  useEffect(() => {
    getAgentConfig().then(setConfig).catch(() => {});
    getVersion().then(setVersion).catch(() => {});
    getSystemPrompt().then((p) => setSysPrompt(p || "")).catch(() => {});
  }, [setConfig]);

  // Click outside to close system prompt popover
  useEffect(() => {
    if (!sysPromptOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (sysPromptRef.current && !sysPromptRef.current.contains(e.target as Node)) {
        setSysPromptOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [sysPromptOpen]);

  const handleSend = useCallback(
    async (content: string) => {
      let sid = sessionId;
      if (!sid) {
        sid = await createSession();
        setSessionId(sid);
        if (activeTab) {
          setTabs((prev) =>
            prev.map((tab) =>
              tab.id === activeTab.id ? { ...tab, sessionId: sid } : tab,
            ),
          );
        }
      }

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        isStreaming: false,
      };
      setMessages((prev) => [...prev, userMsg]);
      setDrafts((prev) => ({ ...prev, [sid ?? ""]: "" }));

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
      channelRef.current = onEvent;
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
    [activeTab, sessionId, setMessages, setDrafts, setSessionId, setStreaming, setTabs],
  );

  const handleDraftChange = useCallback(
    (text: string) => {
      setDrafts((prev) => ({ ...prev, [sessionId ?? ""]: text }));
    },
    [sessionId, setDrafts],
  );

  const handleClearContext = useCallback(async () => {
    if (!sessionId) return;
    try {
      await clearSession(sessionId);
      setMessages([]);
      setForkIndex(undefined);
      toast("上下文已清空", "success");
    } catch (e) {
      toast(`清空失败: ${String(e)}`, "error");
    }
  }, [sessionId, setMessages]);

  const handleFork = useCallback(
    async (msgIndex: number, content: string) => {
      if (!sessionId) return;
      const oldCount = messages.slice(0, msgIndex).length;
      try {
        await clearSession(sessionId);
      } catch {
        // continue even if clear fails
      }
      setMessages((prev) => prev.slice(0, msgIndex));
      setForkIndex(oldCount);
      handleSend(content);
    },
    [sessionId, messages, setMessages, handleSend],
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
          {/* System prompt button */}
          <div className="relative">
            <button
              onClick={() => {
                setSysPromptDraft(sysPrompt);
                setSysPromptOpen((v) => !v);
              }}
              className={cn(
                "p-1 rounded-md hover:bg-accent shrink-0 transition-colors",
                sysPromptOpen ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
              title="系统提示词"
            >
              <Pencil size={14} />
            </button>
            {sysPromptOpen && (
              <div ref={sysPromptRef} className="absolute right-0 top-8 w-72 bg-card border border-border rounded-lg shadow-lg z-40 p-3 space-y-2">
                <textarea
                  value={sysPromptDraft}
                  onChange={(e) => setSysPromptDraft(e.target.value)}
                  placeholder="系统提示词（可选，用于设定 AI 行为）"
                  rows={6}
                  className="w-full text-xs bg-muted rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">
                    {sysPromptDraft.length > 0 ? `${Math.round(sysPromptDraft.length / 3.5)} tokens` : "未设置"}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setSysPromptOpen(false)}
                      className="px-2 py-1 text-[11px] rounded-md hover:bg-accent"
                    >
                      取消
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await setSystemPrompt(sysPromptDraft);
                          setSysPrompt(sysPromptDraft);
                          setSysPromptOpen(false);
                          toast("系统提示词已保存", "success");
                        } catch (e) {
                          toast(`保存失败: ${String(e)}`, "error");
                        }
                      }}
                      className="px-2 py-1 text-[11px] rounded-md bg-primary text-primary-foreground hover:opacity-90"
                    >
                      保存
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Model selector */}
          {config.providers.length > 0 && (
            <div className="relative">
              <select
                value={config.activeIndex}
                onChange={async (e) => {
                  const idx = Number(e.target.value);
                  setConfig((prev) => ({ ...prev, activeIndex: idx }));
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

          {/* Token count */}
          {messages.length > 0 && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
              ~{tokenCount} tokens
            </span>
          )}

          {/* Clear context */}
          {messages.length > 0 && (
            <button
              onClick={handleClearContext}
              className="text-xs text-muted-foreground hover:text-foreground shrink-0 flex items-center gap-1"
              title="清空上下文"
            >
              <Trash2 size={12} />
              清空
            </button>
          )}

          <button
            onClick={() => {
              channelRef.current = null;
              setMessages([]);
              setSessionId(null);
              setForkIndex(undefined);
              if (activeTab) {
                setTabs((prev) =>
                  prev.map((tab) =>
                    tab.id === activeTab.id ? { ...tab, sessionId: null } : tab,
                  ),
                );
              }
              setStreaming(false);
              streamingRef.current = false;
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
          setMessages((prev) => prev.slice(0, index));
          handleSend(content);
        }}
        onFork={handleFork}
        forkIndex={forkIndex}
      />
      <ChatInput
        onSend={handleSend}
        disabled={streaming}
        draft={drafts[sessionId ?? ""] ?? ""}
        onDraftChange={handleDraftChange}
      />
    </div>
  );
}
