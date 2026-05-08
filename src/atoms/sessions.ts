import { atom } from "jotai";
import type { AgentTimelineItem } from "@/lib/tauri";

export interface SessionInfo {
  id: string;
  title?: string | null;
  messageCount: number;
  updatedAt: number;
}

export const sessionsAtom = atom<SessionInfo[]>([]);
export const currentSessionIdAtom = atom<string | null>(null);

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

// NOTE: 当前为全局共享 atoms——同类型多标签共享消息状态。
// 切换 activeTab 时由 AppShell useEffect 自动 reload，但不支持真正的并行对话。
// per-tab 消息隔离（如 Map<tabId, Message[]>）为已知架构改进项，后置处理。
export const chatMessagesAtom = atom<Message[]>([]);
export const chatStreamingAtom = atom<boolean>(false);

export const agentMessagesAtom = atom<Message[]>([]);
export const agentStreamingAtom = atom<boolean>(false);

// Per-session draft storage: sessionId -> draftText
export const chatDraftsAtom = atom<Record<string, string>>({});
export const agentDraftsAtom = atom<Record<string, string>>({});

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
