// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ChatToolBlock from "@/components/chat/ChatToolBlock";
import MessageBubble from "@/components/chat/MessageBubble";
import type { Message } from "@/atoms/sessions";

describe("ChatToolBlock", () => {
  it("renders tool name", () => {
    render(<ChatToolBlock name="web_search" status="running" />);
    expect(screen.getByText("web_search")).toBeTruthy();
  });

  it("shows spinner when status is running", () => {
    const { container } = render(<ChatToolBlock name="web_search" status="running" />);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeTruthy();
  });

  it("shows check mark when status is done", () => {
    const { container } = render(
      <ChatToolBlock name="web_search" status="done" output="found 3 results" />,
    );
    const check = container.querySelector(".text-emerald-500");
    expect(check).toBeTruthy();
  });

  it("shows error icon when status is error", () => {
    const { container } = render(
      <ChatToolBlock name="web_search" status="error" output="timeout" />,
    );
    const errIcon = container.querySelector(".text-destructive");
    expect(errIcon).toBeTruthy();
  });

  it("shows error message text when expanded and status is error", async () => {
    render(<ChatToolBlock name="web_search" status="error" output="connection refused" />);
    await fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("connection refused")).toBeTruthy();
  });

  it("shows input when expanded", async () => {
    render(<ChatToolBlock name="web_search" status="done" input='{"query": "test"}' output="ok" />);
    await fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText('{"query": "test"}')).toBeTruthy();
  });
});

describe("MessageBubble with toolCall", () => {
  const toolMessage: Message = {
    id: "msg-tool-1",
    role: "assistant",
    content: "",
    isStreaming: false,
    toolCall: {
      toolId: "tool-1",
      toolName: "web_search",
      toolInput: '{"query": "rust tauri"}',
      toolOutput: "found 5 results",
      status: "done",
    },
  };

  it("renders ChatToolBlock when message has toolCall", () => {
    render(<MessageBubble message={toolMessage} index={0} />);
    expect(screen.getByText("web_search")).toBeTruthy();
  });

  it("does not render tool block when message has no toolCall", () => {
    const plainMessage: Message = {
      id: "msg-plain",
      role: "assistant",
      content: "Hello world",
      isStreaming: false,
    };
    const { container } = render(<MessageBubble message={plainMessage} index={0} />);
    // Should not have a ChatToolBlock border element
    const toolBlocks = container.querySelectorAll(".border-border\\/50");
    expect(toolBlocks.length).toBe(0);
  });

  it("renders tool block in running state", () => {
    const runningMessage: Message = {
      id: "msg-tool-running",
      role: "assistant",
      content: "",
      isStreaming: true,
      toolCall: {
        toolId: "tool-2",
        toolName: "read_file",
        toolInput: '{"path": "/src/main.rs"}',
        status: "running",
      },
    };
    const { container } = render(<MessageBubble message={runningMessage} index={0} />);
    expect(screen.getByText("read_file")).toBeTruthy();
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeTruthy();
  });

  it("renders tool block in error state with error output", () => {
    const errorMessage: Message = {
      id: "msg-tool-err",
      role: "assistant",
      content: "",
      isStreaming: false,
      toolCall: {
        toolId: "tool-3",
        toolName: "run_command",
        toolInput: '{"command": "cargo build"}',
        toolOutput: "compilation failed",
        status: "error",
      },
    };
    const { container } = render(<MessageBubble message={errorMessage} index={0} />);
    expect(screen.getByText("run_command")).toBeTruthy();
    const errIcon = container.querySelector(".text-destructive");
    expect(errIcon).toBeTruthy();
  });
});
