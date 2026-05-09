import { atom } from "jotai";
import { activeTabIdAtom } from "@/atoms/tabs";

export const sidebarOpenAtom = atom(true);

// --- Per-tab right panel state ---

export interface RightPanelState {
  open: boolean;
  dirs: string[];
}

const DEFAULT_TAB_STATE: RightPanelState = { open: false, dirs: [] };

/** Source-of-truth: right panel state keyed by tab ID. */
export const rightPanelByTabAtom = atom<Record<string, RightPanelState>>({});

/** Active tab's right panel open/close flag (backward-compatible API). */
export const rightPanelOpenAtom = atom(
  (get) => {
    const tabId = get(activeTabIdAtom);
    if (!tabId) return false;
    return get(rightPanelByTabAtom)[tabId]?.open ?? false;
  },
  (get, set, value: boolean | ((prev: boolean) => boolean)) => {
    const tabId = get(activeTabIdAtom);
    if (!tabId) return;
    const prev = get(rightPanelByTabAtom);
    const prevTab = prev[tabId] ?? DEFAULT_TAB_STATE;
    const next = typeof value === "function" ? value(prevTab.open) : value;
    set(rightPanelByTabAtom, { ...prev, [tabId]: { ...prevTab, open: next } });
  },
);

/** Active tab's added workspace directories. */
export const rightPanelDirsAtom = atom(
  (get) => {
    const tabId = get(activeTabIdAtom);
    if (!tabId) return [];
    return get(rightPanelByTabAtom)[tabId]?.dirs ?? [];
  },
  (get, set, value: string[] | ((prev: string[]) => string[])) => {
    const tabId = get(activeTabIdAtom);
    if (!tabId) return;
    const prev = get(rightPanelByTabAtom);
    const prevTab = prev[tabId] ?? DEFAULT_TAB_STATE;
    const next = typeof value === "function" ? value(prevTab.dirs) : value;
    set(rightPanelByTabAtom, { ...prev, [tabId]: { ...prevTab, dirs: next } });
  },
);
