// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ChatInput from "@/components/chat/ChatInput";

describe("ChatInput", () => {
  it("keeps the textarea editable while send is disabled", () => {
    render(<ChatInput onSend={() => {}} sendDisabled />);

    const input = screen.getByPlaceholderText("输入消息... (Enter 发送, Shift+Enter 换行)");
    fireEvent.change(input, { target: { value: "next prompt" } });

    expect(input).not.toBeDisabled();
    expect((input as HTMLTextAreaElement).value).toBe("next prompt");
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("sends when input is enabled", () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    const input = screen.getByPlaceholderText("输入消息... (Enter 发送, Shift+Enter 换行)");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button"));

    expect(onSend).toHaveBeenCalledWith("hello");
  });
});
