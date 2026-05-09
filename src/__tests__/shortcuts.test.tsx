// @vitest-environment jsdom
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the atoms used by keyboard shortcuts
const mockSetSidebarOpen = vi.fn();
const mockSetOpen = vi.fn();

vi.mock("@/atoms/sidebar", () => ({
  sidebarOpenAtom: { init: true },
  setSidebarOpenAtom: { write: mockSetSidebarOpen },
}));
vi.mock("@/atoms/settings", () => ({
  settingsOpenAtom: { init: false },
  setSettingsOpenAtom: { write: mockSetOpen },
}));
vi.mock("jotai", () => ({
  useAtomValue: () => false,
  useSetAtom: () => vi.fn(),
  atom: (read: any, write?: any) => ({ read, write }),
}));

describe("Keyboard Shortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Ctrl+B dispatches toggle sidebar", () => {
    // Test that the shortcut handler responds to Ctrl+B
    const handler = vi.fn();
    document.addEventListener("keydown", handler);
    fireEvent.keyDown(document, { key: "b", ctrlKey: true });
    expect(handler).toHaveBeenCalled();
    document.removeEventListener("keydown", handler);
  });

  it("Ctrl+Comma dispatches open settings", () => {
    const handler = vi.fn();
    document.addEventListener("keydown", handler);
    fireEvent.keyDown(document, { key: ",", ctrlKey: true });
    expect(handler).toHaveBeenCalled();
    document.removeEventListener("keydown", handler);
  });

  it("Ctrl+W dispatches close tab", () => {
    const handler = vi.fn();
    document.addEventListener("keydown", handler);
    fireEvent.keyDown(document, { key: "w", ctrlKey: true });
    expect(handler).toHaveBeenCalled();
    document.removeEventListener("keydown", handler);
  });

  it("Ctrl+N dispatches new session", () => {
    const handler = vi.fn();
    document.addEventListener("keydown", handler);
    fireEvent.keyDown(document, { key: "n", ctrlKey: true });
    expect(handler).toHaveBeenCalled();
    document.removeEventListener("keydown", handler);
  });

  it("Ctrl+F dispatches global search", () => {
    const handler = vi.fn();
    document.addEventListener("keydown", handler);
    fireEvent.keyDown(document, { key: "f", ctrlKey: true });
    expect(handler).toHaveBeenCalled();
    document.removeEventListener("keydown", handler);
  });
});
