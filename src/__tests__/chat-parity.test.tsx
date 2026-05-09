// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { createStore, Provider } from "jotai";
import ContextDivider from "@/components/chat/ContextDivider";
import AgentRecommendBanner from "@/components/chat/AgentRecommendBanner";
import ScrollMinimap from "@/components/chat/ScrollMinimap";
import ChatMessages from "@/components/chat/ChatMessages";
import {
  chatClearMarkerAtom,
  chatClearMarkerByTabAtom,
  chatMessagesByTabAtom,
  chatStreamingByTabAtom,
} from "@/atoms/sessions";
import { tabsAtom, activeTabIdAtom } from "@/atoms/tabs";
import type { Message } from "@/atoms/sessions";

// Helper to create a store with a chat tab set up
function chatStore(messages: Message[] = []) {
  const store = createStore();
  store.set(tabsAtom, [
    { id: "tab-1", type: "chat", title: "Chat", sessionId: "sess-1" },
  ]);
  store.set(activeTabIdAtom, "tab-1");
  store.set(chatMessagesByTabAtom, { "tab-1": messages });
  return store;
}

const sampleMessages: Message[] = [
  { id: "m1", role: "user", content: "hello", isStreaming: false },
  { id: "m2", role: "assistant", content: "hi there", isStreaming: false },
  { id: "m3", role: "user", content: "how are you?", isStreaming: false },
  { id: "m4", role: "assistant", content: "I'm fine", isStreaming: false },
];

describe("ContextDivider", () => {
  it("renders with correct text", () => {
    render(<ContextDivider />);
    expect(screen.getByText("上下文已清空")).toBeTruthy();
  });

  it("has separator role", () => {
    render(<ContextDivider />);
    expect(screen.getByRole("separator")).toBeTruthy();
  });
});

describe("chatClearMarker atoms", () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
    store.set(tabsAtom, [
      { id: "tab-1", type: "chat", title: "Chat", sessionId: null },
      { id: "tab-2", type: "chat", title: "Chat", sessionId: null },
    ]);
  });

  it("starts as null when no active tab", () => {
    expect(store.get(chatClearMarkerAtom)).toBeNull();
  });

  it("starts as null for a chat tab", () => {
    store.set(activeTabIdAtom, "tab-1");
    expect(store.get(chatClearMarkerAtom)).toBeNull();
  });

  it("can be set and read", () => {
    store.set(activeTabIdAtom, "tab-1");
    store.set(chatClearMarkerAtom, 5);
    expect(store.get(chatClearMarkerAtom)).toBe(5);
  });

  it("keeps values isolated per tab", () => {
    store.set(activeTabIdAtom, "tab-1");
    store.set(chatClearMarkerAtom, 3);
    store.set(activeTabIdAtom, "tab-2");
    expect(store.get(chatClearMarkerAtom)).toBeNull();
    store.set(chatClearMarkerAtom, 7);
    store.set(activeTabIdAtom, "tab-1");
    expect(store.get(chatClearMarkerAtom)).toBe(3);
  });

  it("can be reset to null", () => {
    store.set(activeTabIdAtom, "tab-1");
    store.set(chatClearMarkerAtom, 5);
    store.set(chatClearMarkerAtom, null);
    expect(store.get(chatClearMarkerAtom)).toBeNull();
  });
});

describe("AgentRecommendBanner", () => {
  it("renders suggestion text", () => {
    render(<AgentRecommendBanner />);
    expect(screen.getByText("复杂任务建议使用 Agent 模式")).toBeTruthy();
  });

  it("renders switch to agent button", () => {
    render(<AgentRecommendBanner />);
    expect(screen.getByText("切换到 Agent")).toBeTruthy();
  });

  it("dismisses when close button is clicked", () => {
    render(<AgentRecommendBanner />);
    const closeBtn = screen.getByLabelText("关闭建议");
    fireEvent.click(closeBtn);
    expect(screen.queryByText("复杂任务建议使用 Agent 模式")).toBeNull();
  });
});

describe("ScrollMinimap", () => {
  it("renders nothing when messageCount is 0", () => {
    const el = document.createElement("div");
    el.setAttribute("style", "height: 500px; overflow-y: auto;");
    Object.defineProperty(el, "scrollHeight", { value: 1000, writable: true });
    Object.defineProperty(el, "clientHeight", { value: 500, writable: true });
    const ref = { current: el };
    const { container } = render(
      <ScrollMinimap containerRef={ref} messageCount={0} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders scrollbar when messageCount > 0", () => {
    const el = document.createElement("div");
    el.setAttribute("style", "height: 500px; overflow-y: auto;");
    Object.defineProperty(el, "scrollHeight", { value: 1000, writable: true });
    Object.defineProperty(el, "clientHeight", { value: 500, writable: true });
    const ref = { current: el };
    render(<ScrollMinimap containerRef={ref} messageCount={4} />);
    expect(screen.getByRole("scrollbar")).toBeTruthy();
  });

  it("has correct aria-label", () => {
    const el = document.createElement("div");
    el.setAttribute("style", "height: 500px; overflow-y: auto;");
    Object.defineProperty(el, "scrollHeight", { value: 1000, writable: true });
    Object.defineProperty(el, "clientHeight", { value: 500, writable: true });
    const ref = { current: el };
    render(<ScrollMinimap containerRef={ref} messageCount={3} />);
    expect(screen.getByLabelText("消息滚动缩略图")).toBeTruthy();
  });
});

describe("ChatMessages with clearMarker", () => {
  it("renders ContextDivider at clearMarker position", () => {
    const store = chatStore(sampleMessages);
    store.set(chatClearMarkerByTabAtom, { "tab-1": 2 });

    render(
      <Provider store={store}>
        <ChatMessages clearMarker={2} />
      </Provider>,
    );

    const dividers = screen.getAllByText("上下文已清空");
    expect(dividers.length).toBe(1);
  });

  it("renders ContextDivider when clearMarker equals message count (end)", () => {
    const store = chatStore(sampleMessages);
    store.set(chatClearMarkerByTabAtom, { "tab-1": 4 });

    render(
      <Provider store={store}>
        <ChatMessages clearMarker={4} />
      </Provider>,
    );

    const dividers = screen.getAllByText("上下文已清空");
    expect(dividers.length).toBe(1);
  });

  it("renders no divider when clearMarker is null", () => {
    const store = chatStore(sampleMessages);

    render(
      <Provider store={store}>
        <ChatMessages />
      </Provider>,
    );

    expect(screen.queryByText("上下文已清空")).toBeNull();
  });

  it("renders AgentRecommendBanner in chat mode", () => {
    const store = chatStore(sampleMessages);

    render(
      <Provider store={store}>
        <ChatMessages />
      </Provider>,
    );

    expect(screen.getByText("复杂任务建议使用 Agent 模式")).toBeTruthy();
  });
});

describe("ChatMessages empty state", () => {
  it("shows hint when no messages and not streaming", () => {
    const store = chatStore([]);

    render(
      <Provider store={store}>
        <ChatMessages />
      </Provider>,
    );

    expect(screen.getByText("输入消息开始对话")).toBeTruthy();
  });

  it("does not show hint when streaming even with no messages", () => {
    const store = chatStore([]);
    store.set(chatStreamingByTabAtom, { "tab-1": true });

    render(
      <Provider store={store}>
        <ChatMessages />
      </Provider>,
    );

    expect(screen.queryByText("输入消息开始对话")).toBeNull();
  });
});
