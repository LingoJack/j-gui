import { atom } from "jotai";

export interface Tab {
  id: string;
  type: "chat" | "agent";
  title: string;
  sessionId?: string | null;
}

export const tabsAtom = atom<Tab[]>([]);
export const activeTabIdAtom = atom<string | null>(null);

export const activeTabAtom = atom((get) => {
  const tabs = get(tabsAtom);
  const activeTabId = get(activeTabIdAtom);
  return tabs.find((tab) => tab.id === activeTabId) ?? null;
});
