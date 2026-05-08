import { describe, it, expect } from "vitest";
import { createStore } from "jotai";
import { agentConfigAtom } from "@/atoms/config";
import {
  sessionsAtom,
  chatMessagesAtom,
  chatStreamingAtom,
  agentMessagesAtom,
  agentStreamingAtom,
} from "@/atoms/sessions";
import { themeAtom } from "@/atoms/theme";
import { appModeAtom } from "@/atoms/app-mode";
import { sidebarOpenAtom, rightPanelOpenAtom } from "@/atoms/sidebar";

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
    expect(s.get(sessionsAtom)).toEqual([]);
  });

  it("starts with no chat messages", () => {
    const s = store();
    expect(s.get(chatMessagesAtom)).toEqual([]);
  });

  it("starts with no agent messages", () => {
    const s = store();
    expect(s.get(agentMessagesAtom)).toEqual([]);
  });

  it("starts not streaming in chat or agent mode", () => {
    const s = store();
    expect(s.get(chatStreamingAtom)).toBe(false);
    expect(s.get(agentStreamingAtom)).toBe(false);
  });

  it("keeps chat and agent messages isolated", () => {
    const s = store();

    s.set(chatMessagesAtom, [
      { id: "chat-1", role: "user", content: "chat", isStreaming: false },
    ]);
    s.set(agentMessagesAtom, [
      { id: "agent-1", role: "assistant", content: "agent", isStreaming: false },
    ]);

    expect(s.get(chatMessagesAtom)).toEqual([
      { id: "chat-1", role: "user", content: "chat", isStreaming: false },
    ]);
    expect(s.get(agentMessagesAtom)).toEqual([
      { id: "agent-1", role: "assistant", content: "agent", isStreaming: false },
    ]);
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
