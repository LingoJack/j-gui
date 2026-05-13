import { beforeEach, describe, expect, it, vi } from "vitest";

const registerMock = vi.fn();
const unregisterMock = vi.fn();
const unminimizeMock = vi.fn();
const showMock = vi.fn();
const setFocusMock = vi.fn();

vi.mock("@tauri-apps/plugin-global-shortcut", () => ({
  register: registerMock,
  unregister: unregisterMock,
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({
    unminimize: unminimizeMock,
    show: showMock,
    setFocus: setFocusMock,
  }),
}));

describe("global shortcut manager", () => {
  beforeEach(() => {
    registerMock.mockReset();
    unregisterMock.mockReset();
    unminimizeMock.mockReset();
    showMock.mockReset();
    setFocusMock.mockReset();
    unregisterMock.mockResolvedValue(undefined);
    registerMock.mockResolvedValue(undefined);
    unminimizeMock.mockResolvedValue(undefined);
    showMock.mockResolvedValue(undefined);
    setFocusMock.mockResolvedValue(undefined);
  });

  it("registers the show-main-window shortcut and reveals the current window when triggered", async () => {
    const { registerGlobalAppShortcuts } =
      await import("@/lib/global-shortcut-manager");

    await registerGlobalAppShortcuts();

    expect(registerMock).toHaveBeenCalledWith(
      "CommandOrControl+Shift+P",
      expect.any(Function),
    );

    const handler = registerMock.mock.calls[0]?.[1] as
      | ((event: { state: "Pressed" | "Released" }) => Promise<void>)
      | undefined;
    await handler?.({ state: "Pressed" });

    expect(unminimizeMock).toHaveBeenCalledTimes(1);
    expect(showMock).toHaveBeenCalledTimes(1);
    expect(setFocusMock).toHaveBeenCalledTimes(1);
  });

  it("ignores released global shortcut events", async () => {
    const { registerGlobalAppShortcuts } =
      await import("@/lib/global-shortcut-manager");

    await registerGlobalAppShortcuts();

    const handler = registerMock.mock.calls[0]?.[1] as
      | ((event: { state: "Pressed" | "Released" }) => Promise<void>)
      | undefined;
    await handler?.({ state: "Released" });

    expect(unminimizeMock).not.toHaveBeenCalled();
    expect(showMock).not.toHaveBeenCalled();
    expect(setFocusMock).not.toHaveBeenCalled();
  });

  it("matches ctrl/cmd+shift+p by key code", async () => {
    const { matchesShowMainWindowShortcut } =
      await import("@/lib/global-shortcut-manager");

    expect(
      matchesShowMainWindowShortcut(
        new KeyboardEvent("keydown", {
          key: "P",
          code: "KeyP",
          ctrlKey: true,
          shiftKey: true,
        }),
      ),
    ).toBe(true);

    expect(
      matchesShowMainWindowShortcut(
        new KeyboardEvent("keydown", {
          key: "π",
          code: "KeyP",
          ctrlKey: true,
          shiftKey: true,
        }),
      ),
    ).toBe(true);
  });

  it("unregisters the shortcut on dispose", async () => {
    const { registerGlobalAppShortcuts } =
      await import("@/lib/global-shortcut-manager");

    const dispose = await registerGlobalAppShortcuts();
    await dispose();

    expect(unregisterMock).toHaveBeenCalledWith("CommandOrControl+Shift+P");
  });
});
