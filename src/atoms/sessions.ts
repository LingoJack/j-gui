import { atom } from "jotai";

export interface SessionInfo {
  id: string;
  title?: string | null;
  messageCount: number;
  updatedAt: number;
}

export const sessionsAtom = atom<SessionInfo[]>([]);
export const currentSessionIdAtom = atom<string | null>(null);

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming: boolean;
}

export const messagesAtom = atom<Message[]>([]);
export const streamingAtom = atom<boolean>(false);
