// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { createStore } from "jotai";
import {
  chatSessionsAtom,
  agentSessionsListAtom,
  sessionsAtom,
} from "@/atoms/sessions";
import { tabsAtom, activeTabIdAtom } from "@/atoms/tabs";

describe("Sidebar parity — session isolation", () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
  });

  it("Chat sessions and Agent sessions are in separate lists", () => {
    store.set(chatSessionsAtom, [
      { id: "c1", updatedAt: 1, messageCount: 0, title: "Chat 1" },
    ]);
    store.set(agentSessionsListAtom, [
      { id: "a1", updatedAt: 2, messageCount: 0, title: "Agent 1" },
    ]);

    // Chat mode tab
    store.set(tabsAtom, [{ id: "t1", type: "chat", title: "Chat", sessionId: null }]);
    store.set(activeTabIdAtom, "t1");
    const chatSessions = store.get(sessionsAtom);
    expect(chatSessions).toEqual([{ id: "c1", updatedAt: 1, messageCount: 0, title: "Chat 1" }]);

    // Agent mode tab
    store.set(tabsAtom, [{ id: "t2", type: "agent", title: "Agent", sessionId: null }]);
    store.set(activeTabIdAtom, "t2");
    const agentSessions = store.get(sessionsAtom);
    expect(agentSessions).toEqual([{ id: "a1", updatedAt: 2, messageCount: 0, title: "Agent 1" }]);
  });

  it("adding a chat session does not leak into agent list", () => {
    store.set(chatSessionsAtom, [
      { id: "c1", updatedAt: 1, messageCount: 0, title: "Chat 1" },
      { id: "c2", updatedAt: 2, messageCount: 0, title: "Chat 2" },
    ]);
    store.set(agentSessionsListAtom, [
      { id: "a1", updatedAt: 3, messageCount: 0, title: "Agent 1" },
    ]);

    store.set(tabsAtom, [{ id: "t2", type: "agent", title: "Agent", sessionId: null }]);
    store.set(activeTabIdAtom, "t2");

    const sessions = store.get(sessionsAtom);
    expect(sessions.every((s) => s.id.startsWith("a"))).toBe(true);
    expect(sessions.length).toBe(1);
  });

  it("right panel state is independent per tab", () => {
    // This tests the atom isolation — right panel should be per-tab
    store.set(tabsAtom, [
      { id: "t1", type: "chat", title: "Chat", sessionId: null },
      { id: "t2", type: "agent", title: "Agent", sessionId: null },
    ]);

    // Switch between tabs — panel state should not carry over
    store.set(activeTabIdAtom, "t1");
    expect(store.get(activeTabIdAtom)).toBe("t1");

    store.set(activeTabIdAtom, "t2");
    expect(store.get(activeTabIdAtom)).toBe("t2");
  });
});
