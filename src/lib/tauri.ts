import { invoke, Channel } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ===== Chat =====

export type ChatEvent =
  | { event: "chunk"; data: { index: number; content: string } }
  | { event: "toolCall"; data: { toolName: string; toolInput: string } }
  | { event: "toolResult"; data: { toolName: string; toolOutput: string; success: boolean } }
  | { event: "done"; data: { totalTokens: number } }
  | { event: "error"; data: { message: string } };

export async function sendMessage(
  sessionId: string,
  content: string,
  onEvent: Channel<ChatEvent>,
): Promise<void> {
  await invoke("send_message", { sessionId, content, onEvent });
}

// ===== Sessions =====

export interface SessionInfo {
  id: string;
  title?: string | null;
  messageCount: number;
  updatedAt: number;
}

export async function listSessions(): Promise<SessionInfo[]> {
  return invoke("list_sessions");
}

export async function createSession(): Promise<string> {
  return invoke("create_session");
}

export async function switchSession(sessionId: string): Promise<void> {
  return invoke("switch_session", { sessionId });
}

export async function deleteSession(sessionId: string): Promise<void> {
  return invoke("delete_session", { sessionId });
}

// ===== Config =====

export async function getConfig(): Promise<Record<string, unknown>> {
  return invoke("get_config");
}

// ===== Config =====

export interface ProviderInfo {
  name: string;
  apiBase: string;
  apiKey: string;
  model: string;
  supportsVision: boolean;
}

export interface AgentConfigInfo {
  providers: ProviderInfo[];
  activeIndex: number;
}

export async function getAgentConfig(): Promise<AgentConfigInfo> {
  return invoke("get_agent_config");
}

export async function setAgentConfig(config: AgentConfigInfo): Promise<void> {
  return invoke("set_agent_config", { config });
}

export async function setActiveProvider(index: number): Promise<void> {
  return invoke("set_active_provider", { index });
}

export async function setConfig(key: string, value: unknown): Promise<void> {
  return invoke("set_config", { key, value });
}

// ===== System =====

export async function setTheme(theme: "dark" | "light"): Promise<void> {
  return invoke("set_theme", { theme });
}

export function onThemeChanged(callback: (theme: string) => void): Promise<UnlistenFn> {
  return listen<string>("theme-changed", (event) => callback(event.payload));
}
