import { atom } from "jotai";

export interface Toast {
  id: string;
  message: string;
  type: "error" | "success" | "info";
}

export const toastsAtom = atom<Toast[]>([]);

let _addToast: ((message: string, type: Toast["type"]) => void) | null = null;

export function registerToast(add: typeof _addToast) {
  _addToast = add;
}

export function toast(message: string, type: Toast["type"] = "error") {
  _addToast?.(message, type);
}
