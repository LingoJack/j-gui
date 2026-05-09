// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ToolsTab from "@/components/settings/ToolsTab";
import * as tauri from "@/lib/tauri";

vi.mock("@/lib/tauri", () => ({
  listChatTools: vi.fn(),
  setToolEnabled: vi.fn(),
}));

const mockTools = [
  { name: "Bash", description: "执行 shell 命令", enabled: true },
  { name: "Read", description: "读取文件内容", enabled: true },
  { name: "Write", description: "写入文件", enabled: false },
  { name: "Edit", description: "编辑文件", enabled: false },
];

describe("ToolsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner initially", () => {
    vi.mocked(tauri.listChatTools).mockReturnValue(new Promise(() => {}));
    render(<ToolsTab />);
    expect(document.querySelector(".animate-spin")).toBeTruthy();
  });

  it("renders tool list after loading", async () => {
    vi.mocked(tauri.listChatTools).mockResolvedValue(mockTools);
    render(<ToolsTab />);

    await waitFor(() => {
      expect(screen.getByText("Bash")).toBeTruthy();
      expect(screen.getByText("Read")).toBeTruthy();
      expect(screen.getByText("Write")).toBeTruthy();
      expect(screen.getByText("Edit")).toBeTruthy();
    });
  });

  it("shows tool descriptions", async () => {
    vi.mocked(tauri.listChatTools).mockResolvedValue(mockTools);
    render(<ToolsTab />);

    await waitFor(() => {
      expect(screen.getByText("执行 shell 命令")).toBeTruthy();
      expect(screen.getByText("读取文件内容")).toBeTruthy();
    });
  });

  it("calls setToolEnabled when toggle is clicked", async () => {
    vi.mocked(tauri.listChatTools).mockResolvedValue(mockTools);
    vi.mocked(tauri.setToolEnabled).mockResolvedValue(undefined);
    render(<ToolsTab />);

    await waitFor(() => {
      expect(screen.getByText("Bash")).toBeTruthy();
    });

    // Find the toggle button next to "Write" (currently disabled)
    const writeRow = screen.getByText("Write").closest("[class*='flex']")!.parentElement!;
    const toggle = writeRow.querySelector("button[role='switch']") as HTMLElement;
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(toggle);
    expect(tauri.setToolEnabled).toHaveBeenCalledWith("Write", true);
  });

  it("shows empty state when no tools", async () => {
    vi.mocked(tauri.listChatTools).mockResolvedValue([]);
    render(<ToolsTab />);

    await waitFor(() => {
      expect(screen.getByText(/暂无/i)).toBeTruthy();
    });
  });
});
