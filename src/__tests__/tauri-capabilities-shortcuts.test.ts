import { describe, expect, it } from "vitest";
import capability from "../../src-tauri/capabilities/default.json";
import tauriConfig from "../../src-tauri/tauri.conf.json";

describe("shortcut-related tauri capabilities", () => {
  it("grants the explicit ACL entries required by global shortcuts and zoom", () => {
    const permissions = capability.permissions as string[];

    expect(permissions).toContain("global-shortcut:allow-register");
    expect(permissions).toContain("global-shortcut:allow-unregister");
    expect(permissions).toContain("core:window:allow-show");
    expect(permissions).toContain("core:window:allow-unminimize");
    expect(permissions).toContain("core:window:allow-set-focus");
    expect(permissions).toContain("core:webview:allow-set-webview-zoom");
  });

  it("grants the explicit ACL entries required by Windows custom window controls", () => {
    const permissions = capability.permissions as string[];

    expect(permissions).toContain("core:window:allow-set-decorations");
    expect(permissions).toContain("core:window:allow-is-maximized");
    expect(permissions).toContain("core:window:allow-toggle-maximize");
    expect(permissions).toContain("core:window:allow-minimize");
    expect(permissions).toContain("core:window:allow-close");
  });
});

describe("desktop shell tauri config", () => {
  it("keeps macOS overlay titlebar config and points bundle icons at generated tauri icons", () => {
    const mainWindow = tauriConfig.app.windows[0];

    expect(mainWindow.decorations).toBe(true);
    expect(mainWindow.titleBarStyle).toBe("Overlay");
    expect(mainWindow.trafficLightPosition).toEqual({ x: 16, y: 14 });
    expect(tauriConfig.bundle.icon).toEqual([
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico",
    ]);
  });

  it("keeps desktop window defaults stable for window-state restore", () => {
    const mainWindow = tauriConfig.app.windows[0];

    expect(mainWindow.width).toBe(1200);
    expect(mainWindow.height).toBe(800);
    expect(mainWindow.minWidth).toBe(800);
    expect(mainWindow.minHeight).toBe(500);
  });
});
