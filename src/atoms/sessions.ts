import { atom } from "jotai";
import type { AgentTimelineItem } from "@/lib/tauri";
import { activeTabAtom, activeTabIdAtom, tabsAtom } from "@/atoms/tabs";

export interface SessionInfo {
  id: string;
  title?: string | null;
  messageCount: number;
  updatedAt: number;
}

export const chatSessionsAtom = atom<SessionInfo[]>([]);
export const agentSessionsListAtom = atom<SessionInfo[]>([]);
export const sessionsAtom = atom((get) => {
  const activeTab = get(activeTabAtom);
  if (activeTab?.type === "agent") {
    return get(agentSessionsListAtom);
  }
  return get(chatSessionsAtom);
});

export const currentSessionIdAtom = atom(
  (get) => get(activeTabAtom)?.sessionId ?? null,
  (get, set, sessionId: string | null) => {
    const activeTabId = get(activeTabIdAtom);
    if (!activeTabId) return;
    set(tabsAtom, (prev) =>
      prev.map((tab) =>
        tab.id === activeTabId ? { ...tab, sessionId } : tab,
      ),
    );
  },
);

export interface ToolCall {
  toolId: string;
  toolName: string;
  toolInput: string;
  toolOutput?: string;
  status: "running" | "done" | "error";
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming: boolean;
  toolCall?: ToolCall;
}

type MessageMap = Record<string, Message[]>;
type StreamingMap = Record<string, boolean>;
type DraftMap = Record<string, string>;

export const chatMessagesByTabAtom = atom<MessageMap>({});
export const chatStreamingByTabAtom = atom<StreamingMap>({});

export const agentMessagesByTabAtom = atom<MessageMap>({});
export const agentStreamingByTabAtom = atom<StreamingMap>({});
export const chatMessagesAtom = atom(
  (get) => {
    const activeTabId = get(activeTabIdAtom);
    if (!activeTabId) return [];
    return get(chatMessagesByTabAtom)[activeTabId] ?? [];
  },
  (get, set, update: Message[] | ((prev: Message[]) => Message[])) => {
    const activeTabId = get(activeTabIdAtom);
    if (!activeTabId) return;
    set(chatMessagesByTabAtom, (prevMap) => {
      const prev = prevMap[activeTabId] ?? [];
      const next = typeof update === "function" ? update(prev) : update;
      return { ...prevMap, [activeTabId]: next };
    });
  },
);
export const chatStreamingAtom = atom(
  (get) => {
    const activeTabId = get(activeTabIdAtom);
    if (!activeTabId) return false;
    return get(chatStreamingByTabAtom)[activeTabId] ?? false;
  },
  (get, set, value: boolean) => {
    const activeTabId = get(activeTabIdAtom);
    if (!activeTabId) return;
    set(chatStreamingByTabAtom, (prev) => ({ ...prev, [activeTabId]: value }));
  },
);

export const agentMessagesAtom = atom(
  (get) => {
    const activeTabId = get(activeTabIdAtom);
    if (!activeTabId) return [];
    return get(agentMessagesByTabAtom)[activeTabId] ?? [];
  },
  (get, set, update: Message[] | ((prev: Message[]) => Message[])) => {
    const activeTabId = get(activeTabIdAtom);
    if (!activeTabId) return;
    set(agentMessagesByTabAtom, (prevMap) => {
      const prev = prevMap[activeTabId] ?? [];
      const next = typeof update === "function" ? update(prev) : update;
      return { ...prevMap, [activeTabId]: next };
    });
  },
);
export const agentStreamingAtom = atom(
  (get) => {
    const activeTabId = get(activeTabIdAtom);
    if (!activeTabId) return false;
    return get(agentStreamingByTabAtom)[activeTabId] ?? false;
  },
  (get, set, value: boolean) => {
    const activeTabId = get(activeTabIdAtom);
    if (!activeTabId) return;
    set(agentStreamingByTabAtom, (prev) => ({ ...prev, [activeTabId]: value }));
  },
);
export const sessionTitleOverridesAtom = atom<Record<string, string>>({});

export const chatDraftsAtom = atom<DraftMap>({});
export const agentDraftsAtom = atom<DraftMap>({});

function shortenTitle(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const firstClause = normalized.split(/[。！？!?；;\n]/)[0]?.trim() ?? normalized;
  return firstClause.length > 24 ? `${firstClause.slice(0, 24)}…` : firstClause;
}

export function timelineToMessages(items: AgentTimelineItem[]): Message[] {
  const messages: Message[] = [];

  for (const item of items) {
    const base = { id: item.id, isStreaming: false };
    switch (item.kind) {
      case "user_message":
        messages.push({ ...base, role: "user" as const, content: item.content || "" });
        break;
      case "assistant_content": {
        const content = item.content || "";
        const last = messages[messages.length - 1];
        if (last && last.role === "assistant" && !last.toolCall) {
          messages[messages.length - 1] = { ...last, content: last.content + content };
        } else {
          messages.push({ ...base, role: "assistant" as const, content });
        }
        break;
      }
      case "tool_call":
        messages.push({ ...base, role: "assistant" as const, content: "", toolCall: item.toolCall ? { toolId: item.toolCall.toolId, toolName: item.toolCall.toolName, toolInput: item.toolCall.toolInput, toolOutput: item.toolCall.toolOutput ?? undefined, status: item.toolCall.status as "running"|"done"|"error" } : undefined });
        break;
      case "interrupt":
        messages.push({
          ...base,
          role: "assistant" as const,
          content: "",
          toolCall: item.interrupt
            ? {
                toolId: item.interrupt.interruptId,
                toolName: item.interrupt.toolName,
                toolInput: item.interrupt.toolInput,
                toolOutput: item.interrupt.response ?? undefined,
                status:
                  item.interrupt.response === "denied"
                    ? "error"
                    : item.interrupt.response
                      ? "done"
                      : "running",
              }
            : undefined,
        });
        break;
      default:
        messages.push({ ...base, role: "assistant" as const, content: item.content || `[${item.kind}]` });
        break;
    }
  }

  return messages;
}

export function deriveSessionTitle(messages: Message[]): string | null {
  const firstUserMessage = messages.find(
    (message) => message.role === "user" && message.content.trim(),
  );
  if (!firstUserMessage) {
    return null;
  }

  const title = shortenTitle(firstUserMessage.content);
  return title.length > 0 ? title : null;
}
