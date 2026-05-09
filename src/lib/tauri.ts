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
  | { event: "interrupt"; data: { interruptId: string; kind: string; toolName: string; toolInput: string } }
  | { event: "done"; data: { totalTokens: number } }
  | { event: "error"; data: { message: string } };

export async function startAgent(
  onEvent: Channel<AgentEvent>,
  permissionMode?: string,
  sessionId?: string,
): Promise<void> {
  return invoke("start_agent", {
    onEvent,
    permissionMode: permissionMode ?? null,
    sessionId: sessionId ?? null,
  });
}

export async function sendAgentMessage(content: string): Promise<void> {
  return invoke("send_agent_message", { content });
}

export async function respondAgentInterrupt(interruptId: string, allowed: boolean): Promise<void> {
  return invoke("respond_agent_interrupt", { interruptId, allowed });
}

export async function stopAgent(): Promise<void> {
  return invoke("stop_agent");
}

// ===== Agent Sessions =====

export interface ToolCallSnapshot {
  toolId: string;
  toolName: string;
  toolInput: string;
  toolOutput?: string | null;
  status: string;
}

export interface InterruptSnapshot {
  interruptId: string;
  kind: string;
  toolName: string;
  toolInput: string;
  response?: string | null;
}

export interface AgentTimelineItem {
  id: string;
  kind: string;
  content?: string | null;
  toolCall?: ToolCallSnapshot | null;
  interrupt?: InterruptSnapshot | null;
  createdAt: number;
}

export interface AgentSessionInfo {
  id: string;
  title?: string | null;
  messageCount: number;
  updatedAt: number;
}

export async function createAgentSession(): Promise<string> {
  return invoke("create_agent_session");
}

export async function listAgentSessions(): Promise<AgentSessionInfo[]> {
  return invoke("list_agent_sessions");
}

export async function getAgentSession(sessionId: string): Promise<AgentTimelineItem[]> {
  return invoke("get_agent_session", { sessionId });
}

export async function deleteAgentSession(sessionId: string): Promise<void> {
  return invoke("delete_agent_session", { sessionId });
}

// ===== Governance =====

export interface SkillInfo {
  name: string;
  description: string;
  source: string;
  dirPath: string;
}

export interface HookInfo {
  name?: string | null;
  event: string;
  source: string;
  hookType: string;
  label: string;
  timeout?: number | null;
  onError?: string | null;
  uniqueId: string;
}

export interface McpServerConfig {
  name: string;
  transport: string;
  command?: string | null;
  args?: string[] | null;
  url?: string | null;
  env?: Record<string, string> | null;
  disabled: boolean;
}

export async function listSkills(): Promise<SkillInfo[]> {
  return invoke("list_skills");
}

export async function listHooks(): Promise<HookInfo[]> {
  return invoke("list_hooks");
}

export async function listMcpServers(): Promise<McpServerConfig[]> {
  return invoke("list_mcp_servers");
}

export async function saveMcpServers(servers: McpServerConfig[]): Promise<void> {
  return invoke("save_mcp_servers", { servers });
}

// ===== Chat Tools =====

export interface ToolInfo {
  name: string;
  description: string;
  enabled: boolean;
}

export async function listChatTools(): Promise<ToolInfo[]> {
  return invoke("list_chat_tools");
}

export async function setToolEnabled(name: string, enabled: boolean): Promise<void> {
  return invoke("set_tool_enabled", { name, enabled });
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
