// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ToolCallDisplay from "@/components/agent/ToolCallDisplay";

const baseToolCall = {
  toolId: "tool-1",
  toolName: "Read",
  toolInput: '{"path": "/src/main.ts"}',
  toolOutput: null as string | null,
  status: "running" as string,
};

describe("ToolCallDisplay type-specific renderers", () => {
  it("renders Read tool with file path chip", () => {
    render(<ToolCallDisplay {...baseToolCall} toolName="Read" />);
    expect(screen.getByText("/src/main.ts")).toBeTruthy();
    expect(screen.getByText("Read")).toBeTruthy();
  });

  it("renders Write tool with file path and status", () => {
    render(
      <ToolCallDisplay
        {...baseToolCall}
        toolName="Write"
        toolInput='{"path": "/src/config.json", "content": "{}"}'
        status="done"
        toolOutput="File written successfully"
      />,
    );
    expect(screen.getByText("/src/config.json")).toBeTruthy();
    expect(screen.getByText("Write")).toBeTruthy();
  });

  it("renders Edit tool with file path and search hint", () => {
    render(
      <ToolCallDisplay
        {...baseToolCall}
        toolName="Edit"
        toolInput='{"file_path": "/src/app.tsx", "old_string": "foo", "new_string": "bar"}'
        status="done"
        toolOutput="Replacement done"
      />,
    );
    expect(screen.getByText("/src/app.tsx")).toBeTruthy();
  });

  it("renders Bash/PowerShell tool with command", () => {
    render(
      <ToolCallDisplay
        {...baseToolCall}
        toolName="PowerShell"
        toolInput='{"command": "Get-ChildItem"}'
        status="done"
        toolOutput="file1.txt\nfile2.txt"
      />,
    );
    expect(screen.getByText("Get-ChildItem")).toBeTruthy();
  });

  it("renders Grep tool with pattern and file count", () => {
    render(
      <ToolCallDisplay
        {...baseToolCall}
        toolName="Grep"
        toolInput='{"pattern": "useState", "path": "/src"}'
        status="done"
        toolOutput='{"matches": [{"file": "a.tsx", "line": 1}, {"file": "b.tsx", "line": 5}]}'
      />,
    );
    expect(screen.getByText("useState")).toBeTruthy();
  });

  it("renders error state for failed tool", () => {
    render(
      <ToolCallDisplay
        {...baseToolCall}
        toolName="Read"
        toolInput='{"path": "/nonexistent.ts"}'
        status="error"
        toolOutput="File not found: /nonexistent.ts"
      />,
    );
    expect(screen.getByText(/not found|error/i)).toBeTruthy();
  });

  it("shows default JSON renderer for unknown tool", () => {
    render(
      <ToolCallDisplay
        {...baseToolCall}
        toolName="CustomTool"
        toolInput='{"key": "value"}'
        status="running"
      />,
    );
    expect(screen.getByText("CustomTool")).toBeTruthy();
  });
});
