import { describe, it, expect } from "vitest";
import { createStore } from "jotai";
import { agentConfigAtom } from "@/atoms/config";
import {
  sessionsAtom,
  chatMessagesAtom,
  chatDraftsAtom,
  chatSessionsAtom,
  chatStreamingAtom,
  chatStreamingByTabAtom,
  agentDraftsAtom,
  agentMessagesAtom,
  agentSessionsListAtom,
  agentStreamingAtom,
  agentStreamingByTabAtom,
  currentSessionIdAtom,
  deriveSessionTitle,
} from "@/atoms/sessions";
import { themeAtom } from "@/atoms/theme";
import { appModeAtom } from "@/atoms/app-mode";
import { sidebarOpenAtom, rightPanelOpenAtom } from "@/atoms/sidebar";
import { tabsAtom, activeTabIdAtom } from "@/atoms/tabs";

function store() {
  return createStore();
}

describe("config atoms", () => {
  it("agentConfigAtom has sensible defaults", () => {
    const s = store();
    const config = s.get(agentConfigAtom);
    expect(config.providers).toEqual([]);
    expect(config.activeIndex).toBe(0);
    expect(config.theme).toBe("dark");
  });
});

describe("sessions atoms", () => {
  it("starts with no sessions", () => {
    const s = store();
    s.set(tabsAtom, [{ id: "tab-1", type: "chat", title: "Chat", sessionId: null }]);
    s.set(activeTabIdAtom, "tab-1");
    expect(s.get(sessionsAtom)).toEqual([]);
  });

  it("starts with no chat messages", () => {
    const s = store();
    s.set(tabsAtom, [{ id: "tab-1", type: "chat", title: "Chat", sessionId: null }]);
    s.set(activeTabIdAtom, "tab-1");
    expect(s.get(chatMessagesAtom)).toEqual([]);
  });

  it("starts with no agent messages", () => {
    const s = store();
    s.set(tabsAtom, [{ id: "tab-1", type: "agent", title: "Agent", sessionId: null }]);
    s.set(activeTabIdAtom, "tab-1");
    expect(s.get(agentMessagesAtom)).toEqual([]);
  });

  it("starts not streaming in chat or agent mode", () => {
    const s = store();
    s.set(tabsAtom, [{ id: "tab-1", type: "chat", title: "Chat", sessionId: null }]);
    s.set(activeTabIdAtom, "tab-1");
    expect(s.get(chatStreamingAtom)).toBe(false);
    s.set(tabsAtom, [{ id: "tab-2", type: "agent", title: "Agent", sessionId: null }]);
    s.set(activeTabIdAtom, "tab-2");
    expect(s.get(agentStreamingAtom)).toBe(false);
  });

  it("reads sessions from the active tab type", () => {
    const s = store();
    s.set(chatSessionsAtom, [{ id: "chat-session", updatedAt: 1, messageCount: 0, title: "Chat" }]);
    s.set(agentSessionsListAtom, [{ id: "agent-session", updatedAt: 2, messageCount: 0, title: "Agent" }]);
    s.set(tabsAtom, [{ id: "tab-1", type: "chat", title: "Chat", sessionId: null }]);
    s.set(activeTabIdAtom, "tab-1");

    expect(s.get(sessionsAtom)).toEqual([
      { id: "chat-session", updatedAt: 1, messageCount: 0, title: "Chat" },
    ]);

    s.set(tabsAtom, [{ id: "tab-2", type: "agent", title: "Agent", sessionId: null }]);
    s.set(activeTabIdAtom, "tab-2");

    expect(s.get(sessionsAtom)).toEqual([
      { id: "agent-session", updatedAt: 2, messageCount: 0, title: "Agent" },
    ]);
  });

  it("keeps same-type tab chat messages isolated", () => {
    const s = store();
    s.set(tabsAtom, [
      { id: "chat-tab-1", type: "chat", title: "Chat", sessionId: null },
      { id: "chat-tab-2", type: "chat", title: "Chat", sessionId: null },
    ]);
    s.set(activeTabIdAtom, "chat-tab-1");

    s.set(chatMessagesAtom, [
      { id: "chat-1", role: "user", content: "chat", isStreaming: false },
    ]);

    expect(s.get(chatMessagesAtom)).toEqual([
      { id: "chat-1", role: "user", content: "chat", isStreaming: false },
    ]);

    s.set(activeTabIdAtom, "chat-tab-2");
    expect(s.get(chatMessagesAtom)).toEqual([]);

    s.set(chatMessagesAtom, [
      { id: "chat-2", role: "assistant", content: "other", isStreaming: false },
    ]);

    s.set(activeTabIdAtom, "chat-tab-1");
    expect(s.get(chatMessagesAtom)).toEqual([
      { id: "chat-1", role: "user", content: "chat", isStreaming: false },
    ]);
  });

  it("keeps same-type tab agent messages isolated", () => {
    const s = store();
    s.set(tabsAtom, [
      { id: "agent-tab-1", type: "agent", title: "Agent", sessionId: null },
      { id: "agent-tab-2", type: "agent", title: "Agent", sessionId: null },
    ]);
    s.set(activeTabIdAtom, "agent-tab-1");

    s.set(agentMessagesAtom, [
      { id: "agent-1", role: "assistant", content: "agent", isStreaming: false },
    ]);

    expect(s.get(agentMessagesAtom)).toEqual([
      { id: "agent-1", role: "assistant", content: "agent", isStreaming: false },
    ]);

    s.set(activeTabIdAtom, "agent-tab-2");
    expect(s.get(agentMessagesAtom)).toEqual([]);
  });

  it("keeps same-type tab streaming states isolated", () => {
    const s = store();
    s.set(tabsAtom, [
      { id: "chat-tab-1", type: "chat", title: "Chat", sessionId: null },
      { id: "chat-tab-2", type: "chat", title: "Chat", sessionId: null },
      { id: "agent-tab-1", type: "agent", title: "Agent", sessionId: null },
      { id: "agent-tab-2", type: "agent", title: "Agent", sessionId: null },
    ]);

    s.set(activeTabIdAtom, "chat-tab-1");
    s.set(chatStreamingAtom, true);
    expect(s.get(chatStreamingByTabAtom)).toEqual({ "chat-tab-1": true });

    s.set(activeTabIdAtom, "chat-tab-2");
    expect(s.get(chatStreamingAtom)).toBe(false);

    s.set(activeTabIdAtom, "agent-tab-1");
    s.set(agentStreamingAtom, true);
    expect(s.get(agentStreamingByTabAtom)).toEqual({ "agent-tab-1": true });

    s.set(activeTabIdAtom, "agent-tab-2");
    expect(s.get(agentStreamingAtom)).toBe(false);
  });

  it("writes current session id back to the active tab", () => {
    const s = store();
    s.set(tabsAtom, [{ id: "tab-1", type: "chat", title: "Chat", sessionId: null }]);
    s.set(activeTabIdAtom, "tab-1");

    s.set(currentSessionIdAtom, "session-1");

    expect(s.get(currentSessionIdAtom)).toBe("session-1");
    expect(s.get(tabsAtom)).toEqual([
      { id: "tab-1", type: "chat", title: "Chat", sessionId: "session-1" },
    ]);
  });

  it("can keep drafts isolated by tab key for chat", () => {
    const s = store();
    s.set(chatDraftsAtom, {
      "chat-tab-1": "draft-a",
      "chat-tab-2": "draft-b",
    });

    expect(s.get(chatDraftsAtom)).toEqual({
      "chat-tab-1": "draft-a",
      "chat-tab-2": "draft-b",
    });
  });

  it("can keep drafts isolated by tab key for agent", () => {
    const s = store();
    s.set(agentDraftsAtom, {
      "agent-tab-1": "draft-a",
      "agent-tab-2": "draft-b",
    });

    expect(s.get(agentDraftsAtom)).toEqual({
      "agent-tab-1": "draft-a",
      "agent-tab-2": "draft-b",
    });
  });

  it("derives a short title from the first user message", () => {
    const title = deriveSessionTitle([
      { id: "1", role: "assistant", content: "ignored", isStreaming: false },
      {
        id: "2",
        role: "user",
        content: "帮我看看当前未提交改动里的 tab 切换问题，以及标题为什么会变成 session id",
        isStreaming: false,
      },
    ]);

    expect(title).toContain("帮我看看当前未提交改动");
    expect(title?.length).toBeLessThanOrEqual(25);
  });
});

describe("theme atom", () => {
  it("defaults to dark", () => {
    const s = store();
    expect(s.get(themeAtom)).toBe("dark");
  });
});

describe("app mode atom", () => {
  it("defaults to chat mode", () => {
    const s = store();
    expect(s.get(appModeAtom)).toBe("chat");
  });
});

describe("sidebar atoms", () => {
  it("sidebar is open by default", () => {
    const s = store();
    expect(s.get(sidebarOpenAtom)).toBe(true);
  });

  it("right panel is closed by default", () => {
    const s = store();
    expect(s.get(rightPanelOpenAtom)).toBe(false);
  });
});
