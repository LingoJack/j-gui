// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { createStore } from "jotai";
import {
  chatSessionsAtom,
  agentSessionsListAtom,
  sessionsAtom,
} from "@/atoms/sessions";
import { tabsAtom, activeTabIdAtom } from "@/atoms/tabs";
import { rightPanelByTabAtom, rightPanelOpenAtom, rightPanelDirsAtom } from "@/atoms/sidebar";

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

  it("right panel open state is independent per tab", () => {
    store.set(tabsAtom, [
      { id: "t1", type: "chat", title: "Chat", sessionId: null },
      { id: "t2", type: "agent", title: "Agent", sessionId: null },
    ]);

    // Open panel in agent tab
    store.set(activeTabIdAtom, "t2");
    store.set(rightPanelOpenAtom, true);
    expect(store.get(rightPanelOpenAtom)).toBe(true);

    // Switch to chat tab — panel should appear closed (different tab)
    store.set(activeTabIdAtom, "t1");
    expect(store.get(rightPanelOpenAtom)).toBe(false);

    // Switch back to agent tab — state preserved
    store.set(activeTabIdAtom, "t2");
    expect(store.get(rightPanelOpenAtom)).toBe(true);
  });

  it("right panel dirs are isolated per tab", () => {
    store.set(tabsAtom, [
      { id: "t1", type: "agent", title: "Agent 1", sessionId: null },
      { id: "t2", type: "agent", title: "Agent 2", sessionId: null },
    ]);

    // Add dirs to tab t1
    store.set(activeTabIdAtom, "t1");
    store.set(rightPanelDirsAtom, ["/path/to/proj1", "/path/to/proj2"]);
    expect(store.get(rightPanelDirsAtom)).toEqual(["/path/to/proj1", "/path/to/proj2"]);

    // Switch to t2 — different dirs
    store.set(activeTabIdAtom, "t2");
    expect(store.get(rightPanelDirsAtom)).toEqual([]);

    // Add dir to t2
    store.set(rightPanelDirsAtom, ["/path/to/other"]);
    expect(store.get(rightPanelDirsAtom)).toEqual(["/path/to/other"]);

    // Switch back to t1 — dirs preserved
    store.set(activeTabIdAtom, "t1");
    expect(store.get(rightPanelDirsAtom)).toEqual(["/path/to/proj1", "/path/to/proj2"]);
  });

  it("rightPanelByTabAtom stores combined state per tab", () => {
    store.set(tabsAtom, [
      { id: "t1", type: "agent", title: "Agent 1", sessionId: null },
    ]);

    store.set(activeTabIdAtom, "t1");
    store.set(rightPanelOpenAtom, true);
    store.set(rightPanelDirsAtom, ["/workspace"]);

    const state = store.get(rightPanelByTabAtom);
    expect(state["t1"]).toEqual({ open: true, dirs: ["/workspace"] });
  });
});
