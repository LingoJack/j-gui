import { beforeEach, describe, expect, it, vi } from "vitest";

const setZoomMock = vi.fn();

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    setZoom: setZoomMock,
  }),
}));

describe("zoom shortcuts", () => {
  beforeEach(() => {
    setZoomMock.mockReset();
  });

  it("matches ctrl/cmd plus, minus and zero shortcuts", async () => {
    const { getZoomCommandFromEvent } = await import("@/lib/zoom-shortcuts");

    expect(
      getZoomCommandFromEvent(
        new KeyboardEvent("keydown", {
          key: "=",
          code: "Equal",
          ctrlKey: true,
          shiftKey: true,
        }),
      ),
    ).toBe("in");

    expect(
      getZoomCommandFromEvent(
        new KeyboardEvent("keydown", {
          key: "-",
          code: "Minus",
          ctrlKey: true,
        }),
      ),
    ).toBe("out");

    expect(
      getZoomCommandFromEvent(
        new KeyboardEvent("keydown", {
          key: "0",
          code: "Digit0",
          ctrlKey: true,
        }),
      ),
    ).toBe("reset");
  });

  it("supports numpad zoom shortcuts", async () => {
    const { getZoomCommandFromEvent } = await import("@/lib/zoom-shortcuts");

    expect(
      getZoomCommandFromEvent(
        new KeyboardEvent("keydown", {
          key: "+",
          code: "NumpadAdd",
          ctrlKey: true,
        }),
      ),
    ).toBe("in");

    expect(
      getZoomCommandFromEvent(
        new KeyboardEvent("keydown", {
          key: "-",
          code: "NumpadSubtract",
          ctrlKey: true,
        }),
      ),
    ).toBe("out");

    expect(
      getZoomCommandFromEvent(
        new KeyboardEvent("keydown", {
          key: "0",
          code: "Numpad0",
          ctrlKey: true,
        }),
      ),
    ).toBe("reset");
  });

  it("applies zoom in, out and reset with bounded scale factors", async () => {
    const { applyZoomCommand, resetZoomStateForTests } =
      await import("@/lib/zoom-shortcuts");

    resetZoomStateForTests();

    await applyZoomCommand("in");
    await applyZoomCommand("out");
    await applyZoomCommand("reset");

    expect(setZoomMock).toHaveBeenNthCalledWith(1, 1.1);
    expect(setZoomMock).toHaveBeenNthCalledWith(2, 1);
    expect(setZoomMock).toHaveBeenNthCalledWith(3, 1);
  });
});
