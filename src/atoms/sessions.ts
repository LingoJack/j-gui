import { atom } from "jotai";

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

export const chatMessagesAtom = atom<Message[]>([]);
export const chatStreamingAtom = atom<boolean>(false);

export const agentMessagesAtom = atom<Message[]>([]);
export const agentStreamingAtom = atom<boolean>(false);
