import { beforeEach, describe, expect, it, vi } from "vitest";

const registerMock = vi.fn();
const unregisterMock = vi.fn();
const unminimizeMock = vi.fn();
const showMock = vi.fn();
const setFocusMock = vi.fn();
const hideMock = vi.fn();
const isVisibleMock = vi.fn();
let activeAccelerator = "Ctrl+Shift+P";

vi.mock("@tauri-apps/plugin-global-shortcut", () => ({
  register: registerMock,
  unregister: unregisterMock,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    unminimize: unminimizeMock,
    show: showMock,
    setFocus: setFocusMock,
    hide: hideMock,
    isVisible: isVisibleMock,
  }),
}));

vi.mock("@/lib/shortcut-registry", () => ({
  getActiveAccelerator: vi.fn(() => activeAccelerator),
  isMac: false,
}));

describe("global shortcut manager", () => {
  beforeEach(() => {
    activeAccelerator = "Ctrl+Shift+P";
    registerMock.mockReset();
    unregisterMock.mockReset();
    unminimizeMock.mockReset();
    showMock.mockReset();
    setFocusMock.mockReset();
    hideMock.mockReset();
    isVisibleMock.mockReset();
    unregisterMock.mockResolvedValue(undefined);
    registerMock.mockResolvedValue(undefined);
    unminimizeMock.mockResolvedValue(undefined);
    showMock.mockResolvedValue(undefined);
    setFocusMock.mockResolvedValue(undefined);
    hideMock.mockResolvedValue(undefined);
    isVisibleMock.mockResolvedValue(false);
    return import("@/lib/global-shortcut-manager").then((module) => {
      module.resetGlobalShortcutManagerForTests();
    });
  });

  it("registers the show-main-window shortcut and reveals the current window when triggered", async () => {
    const { registerGlobalAppShortcuts } =
      await import("@/lib/global-shortcut-manager");

    const { result } = await registerGlobalAppShortcuts();
    expect(result.success).toBe(true);

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

  it("toggles the main window back to hidden when it is already visible", async () => {
    isVisibleMock.mockResolvedValueOnce(true);
    const { showMainWindow } =
      await import("@/lib/global-shortcut-manager");

    await showMainWindow();

    expect(hideMock).toHaveBeenCalledTimes(1);
    expect(showMock).not.toHaveBeenCalled();
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
          ctrlKey: true,
          shiftKey: true,
        }),
      ),
    ).toBe(true);

    expect(
      matchesShowMainWindowShortcut(
        new KeyboardEvent("keydown", {
          key: "P",
          ctrlKey: true,
          shiftKey: true,
        }),
      ),
    ).toBe(true);
  });

  it("registers a customized show-main-window accelerator", async () => {
    activeAccelerator = "Ctrl+Alt+P";
    const { registerGlobalAppShortcuts } =
      await import("@/lib/global-shortcut-manager");

    await registerGlobalAppShortcuts();

    expect(registerMock).toHaveBeenCalledWith(
      "CommandOrControl+Alt+P",
      expect.any(Function),
    );
  });

  it("unregisters the previous accelerator before registering a new one", async () => {
    const { registerGlobalAppShortcuts } =
      await import("@/lib/global-shortcut-manager");

    await registerGlobalAppShortcuts();
    activeAccelerator = "Ctrl+Shift+H";
    await registerGlobalAppShortcuts();

    expect(unregisterMock).toHaveBeenCalledWith("CommandOrControl+Shift+P");
    expect(registerMock).toHaveBeenCalledWith(
      "CommandOrControl+Shift+H",
      expect.any(Function),
    );
  });

  it("unregisters the shortcut on dispose", async () => {
    const { registerGlobalAppShortcuts } =
      await import("@/lib/global-shortcut-manager");

    const { dispose } = await registerGlobalAppShortcuts();
    await dispose();

    expect(unregisterMock).toHaveBeenCalledWith("CommandOrControl+Shift+P");
  });

  it("reports failure when the global shortcut cannot be registered", async () => {
    registerMock.mockRejectedValueOnce(new Error("shortcut already registered"));
    const { registerGlobalAppShortcuts } =
      await import("@/lib/global-shortcut-manager");

    const { result } = await registerGlobalAppShortcuts();

    expect(result.success).toBe(false);
    expect(result.reason).toContain("shortcut already registered");
  });

  it("probes a candidate accelerator without leaving it registered", async () => {
    const { probeGlobalShortcutRegistration } =
      await import("@/lib/global-shortcut-manager");

    const result = await probeGlobalShortcutRegistration("Ctrl+Shift+H");

    expect(result.success).toBe(true);
    expect(registerMock).toHaveBeenCalledWith(
      "CommandOrControl+Shift+H",
      expect.any(Function),
    );
    expect(unregisterMock).toHaveBeenCalledWith("CommandOrControl+Shift+H");
  });

  it("dedupes repeated shortcut-triggered window toggles within the same burst", async () => {
    const { registerGlobalAppShortcuts } =
      await import("@/lib/global-shortcut-manager");

    await registerGlobalAppShortcuts();
    const handler = registerMock.mock.calls[0]?.[1] as
      | ((event: { state: "Pressed" | "Released" }) => Promise<void>)
      | undefined;

    await handler?.({ state: "Pressed" });
    await handler?.({ state: "Pressed" });

    expect(unminimizeMock).toHaveBeenCalledTimes(1);
    expect(showMock).toHaveBeenCalledTimes(1);
    expect(setFocusMock).toHaveBeenCalledTimes(1);
  });
});
