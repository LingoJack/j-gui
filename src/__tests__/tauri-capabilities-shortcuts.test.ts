import { describe, expect, it } from "vitest";
import capability from "../../src-tauri/capabilities/default.json";

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
});
