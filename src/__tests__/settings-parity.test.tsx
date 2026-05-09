// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tauri", () => ({
  getConfig: vi.fn().mockResolvedValue({ providers: [] }),
  listAliases: vi.fn().mockResolvedValue([]),
  listSkills: vi.fn().mockResolvedValue([]),
  listHooks: vi.fn().mockResolvedValue([]),
  listMcpServers: vi.fn().mockResolvedValue([]),
  listChatTools: vi.fn().mockResolvedValue([
    { name: "Read", description: "Read files", enabled: true },
  ]),
  setConfig: vi.fn(),
  setAlias: vi.fn(),
  removeAlias: vi.fn(),
  setTheme: vi.fn(),
  getAgentConfig: vi.fn().mockResolvedValue({}),
  setAgentConfig: vi.fn(),
  saveMcpServers: vi.fn(),
  setToolEnabled: vi.fn(),
  getSystemPrompt: vi.fn().mockResolvedValue(""),
  setSystemPrompt: vi.fn(),
}));

vi.mock("@/atoms/ui", () => {
  const { atom } = require("jotai");
  return { settingsOpenAtom: atom(true), searchOpenAtom: atom(false) };
});

vi.mock("@/atoms/sidebar", () => {
  const { atom } = require("jotai");
  return { sidebarOpenAtom: atom(true), rightPanelOpenAtom: atom(false) };
});

describe("Settings console parity", () => {
  it("shows all expected navigation tabs", async () => {
    const { default: SettingsDialog } = await import(
      "@/components/settings/SettingsDialog"
    );

    render(<SettingsDialog open={true} onClose={() => {}} />);

    // Should have these tabs: 模型, 通用, 别名, Skills, Hooks, MCP, 工具
    const navLabels = ["模型", "通用", "别名", "Skills", "Hooks", "MCP", "工具"];
    for (const label of navLabels) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("renders as a modal overlay with backdrop", async () => {
    const { default: SettingsDialog } = await import(
      "@/components/settings/SettingsDialog"
    );

    const { container } = render(<SettingsDialog open={true} onClose={() => {}} />);

    // Check for fixed positioning (modal overlay)
    const overlay = container.querySelector(".fixed.inset-0");
    expect(overlay).toBeTruthy();

    // Check for backdrop (bg-black/50)
    expect(overlay?.classList.contains("bg-black/50")).toBe(true);

    // Check for centered dialog
    expect(overlay?.classList.contains("flex")).toBe(true);
    expect(overlay?.classList.contains("items-center")).toBe(true);
    expect(overlay?.classList.contains("justify-center")).toBe(true);
  });

  it("switches between tabs when clicked", async () => {
    const { default: SettingsDialog } = await import(
      "@/components/settings/SettingsDialog"
    );

    render(<SettingsDialog open={true} onClose={() => {}} />);

    // Initially on models tab - should show model config hint
    expect(screen.getByText(/配置模型提供方/)).toBeTruthy();

    // Click on "通用" tab
    const generalTab = screen.getByText("通用");
    fireEvent.click(generalTab);

    // Should show general settings section
    expect(screen.getByText("偏好设置")).toBeTruthy();

    // Click on "别名" tab
    const aliasesTab = screen.getByText("别名");
    fireEvent.click(aliasesTab);

    // Should show alias hint
    expect(screen.getByText(/管理快捷别名/)).toBeTruthy();
  });

  it("has proper dialog structure with header, nav, and content", async () => {
    const { default: SettingsDialog } = await import(
      "@/components/settings/SettingsDialog"
    );

    render(<SettingsDialog open={true} onClose={() => {}} />);

    // Check for header with title
    expect(screen.getByText("设置")).toBeTruthy();

    // Check for close button (X icon) - find by aria-label or just check button exists in header
    const header = document.querySelector(".border-b");
    expect(header).toBeTruthy();
    const closeButton = header?.querySelector("button");
    expect(closeButton).toBeTruthy();

    // Check for left nav area (w-40 class)
    const leftNav = document.querySelector(".w-40");
    expect(leftNav).toBeTruthy();

    // Check for scrollable content area
    const scrollArea = document.querySelector(".overflow-y-auto");
    expect(scrollArea).toBeTruthy();
  });

  it("shows correct empty states for agent config tabs", async () => {
    const { default: SettingsDialog } = await import(
      "@/components/settings/SettingsDialog"
    );

    render(<SettingsDialog open={true} onClose={() => {}} />);

    // Navigate to Skills tab
    fireEvent.click(screen.getByText("Skills"));
    await waitFor(() => {
      expect(screen.getByText(/暂无 Skills/)).toBeTruthy();
    });

    // Navigate to Hooks tab
    fireEvent.click(screen.getByText("Hooks"));
    await waitFor(() => {
      expect(screen.getByText(/暂无 Hooks/)).toBeTruthy();
    });

    // Navigate to MCP tab
    fireEvent.click(screen.getByText("MCP"));
    await waitFor(() => {
      expect(screen.getByText(/暂无 MCP/)).toBeTruthy();
    });

    // Navigate to Tools tab
    fireEvent.click(screen.getByText("工具"));
    await waitFor(() => {
      // Tools tab has data from mock, so check for the tool
      expect(screen.getByText("Read")).toBeTruthy();
    });
  });
});
