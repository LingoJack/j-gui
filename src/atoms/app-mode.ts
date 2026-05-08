import { atom } from "jotai";

export type AppMode = "chat" | "agent";

export const appModeAtom = atom<AppMode>("chat");
