import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { GlobalShortcuts } from "@/components/shortcuts/GlobalShortcuts";
import {
  settingsOpenAtom,
  channelFormDirtyAtom,
  settingsCloseRequestedAtom,
} from "@/atoms/settings-tab";
import { appModeAtom } from "@/atoms/app-mode";
import { searchDialogOpenAtom } from "@/atoms/search-atoms";
import {
  sidebarCollapsedAtom,
  tabsAtom,
  activeTabIdAtom,
} from "@/atoms/tab-atoms";
import {
  conversationsAtom,
  currentConversationIdAtom,
} from "@/atoms/chat-atoms";
import {
  agentSessionsAtom,
  currentAgentSessionIdAtom,
  currentAgentWorkspaceIdAtom,
} from "@/atoms/agent-atoms";
import * as globalShortcutManager from "@/lib/global-shortcut-manager";
import * as zoomShortcuts from "@/lib/zoom-shortcuts";

const shortcutHandlers = new Map<string, () => void>();

vi.mock("@/hooks/useShortcut", () => ({
  useShortcut: (id: string, callback: () => void) => {
    shortcutHandlers.set(id, callback);
  },
}));

vi.mock("@/hooks/useCreateSession", () => ({
  useCreateSession: () => ({
    createChat: vi.fn(),
    createAgent: vi.fn(),
  }),
}));

vi.mock("@/hooks/useCloseTab", () => ({
  useCloseTab: () => ({
    requestClose: vi.fn(),
  }),
}));

vi.mock("@/hooks/useOpenSession", () => ({
  useOpenSession: () => vi.fn(),
}));

vi.mock("@/lib/shortcut-registry", () => ({
  initShortcutRegistry: vi.fn(),
  updateShortcutOverrides: vi.fn(),
}));

vi.mock("@/lib/global-shortcut-manager", () => ({
  registerGlobalAppShortcuts: vi.fn(async () => async () => {}),
  matchesShowMainWindowShortcut: vi.fn(
    (event: KeyboardEvent) =>
      event.ctrlKey && event.shiftKey && event.code === "KeyP",
  ),
  showMainWindow: vi.fn(),
}));

vi.mock("@/lib/zoom-shortcuts", () => ({
  applyZoomCommand: vi.fn(),
  getZoomCommandFromEvent: vi.fn(() => null),
}));

vi.mock("@/lib/ipc", () => ({
  getSettings: vi.fn(async () => ({ sendWithCmdEnter: false })),
}));

describe("GlobalShortcuts", () => {
  beforeEach(() => {
    shortcutHandlers.clear();
    vi.mocked(globalShortcutManager.showMainWindow).mockReset();
    vi.mocked(globalShortcutManager.registerGlobalAppShortcuts).mockClear();
    vi.mocked(zoomShortcuts.applyZoomCommand).mockReset();
    vi.mocked(zoomShortcuts.getZoomCommandFromEvent).mockReset();
    vi.mocked(globalShortcutManager.showMainWindow).mockResolvedValue(
      undefined,
    );
    vi.mocked(zoomShortcuts.applyZoomCommand).mockResolvedValue(1);
    vi.mocked(zoomShortcuts.getZoomCommandFromEvent).mockReturnValue(null);
  });

  function renderShortcuts() {
    const store = createStore();
    store.set(appModeAtom, "chat");
    store.set(settingsOpenAtom, false);
    store.set(channelFormDirtyAtom, false);
    store.set(settingsCloseRequestedAtom, false);
    store.set(searchDialogOpenAtom, false);
    store.set(sidebarCollapsedAtom, false);
    store.set(tabsAtom, []);
    store.set(activeTabIdAtom, null);
    store.set(conversationsAtom, []);
    store.set(currentConversationIdAtom, null);
    store.set(agentSessionsAtom, []);
    store.set(currentAgentSessionIdAtom, null);
    store.set(currentAgentWorkspaceIdAtom, null);

    render(
      <Provider store={store}>
        <GlobalShortcuts />
      </Provider>,
    );

    return store;
  }

  it("toggles settings on repeated open-settings shortcut presses", async () => {
    const store = renderShortcuts();
    const handler = shortcutHandlers.get("open-settings");

    expect(handler).toBeTypeOf("function");

    await act(async () => {
      handler?.();
    });
    expect(store.get(settingsOpenAtom)).toBe(true);

    const toggledHandler = shortcutHandlers.get("open-settings");
    await act(async () => {
      toggledHandler?.();
    });
    expect(store.get(settingsOpenAtom)).toBe(false);
  });

  it("toggles search on repeated global-search shortcut presses", async () => {
    const store = renderShortcuts();
    const handler = shortcutHandlers.get("global-search");

    expect(handler).toBeTypeOf("function");

    await act(async () => {
      handler?.();
    });
    expect(store.get(searchDialogOpenAtom)).toBe(true);

    await act(async () => {
      handler?.();
    });
    expect(store.get(searchDialogOpenAtom)).toBe(false);
  });

  it("toggles sidebar twice with the same shortcut handler instance", async () => {
    const store = renderShortcuts();
    const handler = shortcutHandlers.get("toggle-sidebar");

    expect(handler).toBeTypeOf("function");

    await act(async () => {
      handler?.();
    });
    expect(store.get(sidebarCollapsedAtom)).toBe(true);

    await act(async () => {
      handler?.();
    });
    expect(store.get(sidebarCollapsedAtom)).toBe(false);
  });

  it("intercepts ctrl+shift+p before browser print and forwards to showMainWindow", async () => {
    renderShortcuts();
    const event = new KeyboardEvent("keydown", {
      key: "p",
      code: "KeyP",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(globalShortcutManager.showMainWindow).toHaveBeenCalledTimes(1);
  });

  it("intercepts ctrl+plus zoom shortcuts and forwards zoom command", async () => {
    vi.mocked(zoomShortcuts.getZoomCommandFromEvent).mockReturnValue("in");

    renderShortcuts();
    const event = new KeyboardEvent("keydown", {
      key: "=",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(zoomShortcuts.applyZoomCommand).toHaveBeenCalledWith("in");
  });
});
