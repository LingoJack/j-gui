import { invoke, Channel } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ===== Chat =====

export type ChatEvent =
  | { event: "chunk"; data: { index: number; content: string } }
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

export async function deleteSession(sessionId: string): Promise<void> {
  return invoke("delete_session", { sessionId });
}

export interface MessageInfo {
  role: string;
  content: string;
}

export async function getSessionMessages(sessionId: string): Promise<MessageInfo[]> {
  return invoke("get_session_messages", { sessionId });
}

export async function deleteMessage(sessionId: string, pairIndex: number): Promise<void> {
  return invoke("delete_message", { sessionId, pairIndex });
}

// ===== YamlConfig =====

export interface YamlConfigInfo {
  sections: Record<string, Record<string, string>>;
}

export async function getConfig(): Promise<YamlConfigInfo> {
  return invoke("get_config");
}

export async function setConfig(section: string, key: string, value: string): Promise<void> {
  return invoke("set_config", { section, key, value });
}

// ===== Alias =====

export interface AliasEntry {
  section: string;
  name: string;
  value: string;
}

export async function listAliases(): Promise<AliasEntry[]> {
  return invoke("list_aliases");
}

export async function setAlias(section: string, name: string, value: string): Promise<void> {
  return invoke("set_alias", { section, name, value });
}

export async function removeAlias(section: string, name: string): Promise<void> {
  return invoke("remove_alias", { section, name });
}

// ===== Agent Config =====

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
  theme: string;
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

// ===== System Prompt =====

export async function getSystemPrompt(): Promise<string | null> {
  return invoke("get_system_prompt");
}

export async function setSystemPrompt(prompt: string): Promise<void> {
  return invoke("set_system_prompt", { prompt });
}

// ===== Session =====

export async function clearSession(sessionId: string): Promise<void> {
  return invoke("clear_session", { sessionId });
}

// ===== Agent =====

export type AgentEvent =
  | { event: "assistantContent"; data: { text: string } }
  | { event: "toolUse"; data: { toolId: string; toolName: string; toolInput: string } }
  | { event: "toolResult"; data: { toolId: string; content: string } }
  | { event: "done"; data: { totalTokens: number } }
  | { event: "error"; data: { message: string } };

export async function startAgent(onEvent: Channel<AgentEvent>): Promise<void> {
  return invoke("start_agent", { onEvent });
}

export async function sendAgentMessage(content: string): Promise<void> {
  return invoke("send_agent_message", { content });
}

export async function stopAgent(): Promise<void> {
  return invoke("stop_agent");
}

// ===== System =====

export async function setTheme(theme: string): Promise<void> {
  return invoke("set_theme", { theme });
}

export async function getVersion(): Promise<string> {
  return invoke("get_version");
}

export function onThemeChanged(callback: (theme: string) => void): Promise<UnlistenFn> {
  return listen<string>("theme-changed", (event) => callback(event.payload));
}
