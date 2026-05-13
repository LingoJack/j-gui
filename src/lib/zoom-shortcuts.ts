import { getCurrentWebview } from "@tauri-apps/api/webview";

export type ZoomCommand = "in" | "out" | "reset";

const DEFAULT_ZOOM = 1;
const ZOOM_STEP = 0.1;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 2;

let currentZoomFactor = DEFAULT_ZOOM;

function isPrimaryModifierPressed(event: KeyboardEvent): boolean {
  return navigator.userAgent.includes("Mac") ? event.metaKey : event.ctrlKey;
}

export function getZoomCommandFromEvent(
  event: KeyboardEvent,
): ZoomCommand | null {
  if (!isPrimaryModifierPressed(event) || event.altKey) {
    return null;
  }

  const key = event.key;
  const code = event.code;

  if (code === "Digit0" || code === "Numpad0" || key === "0") return "reset";
  if (
    code === "Minus" ||
    code === "NumpadSubtract" ||
    key === "-" ||
    key === "_"
  ) {
    return "out";
  }
  if (code === "Equal" || code === "NumpadAdd" || key === "+" || key === "=") {
    return "in";
  }
  return null;
}

function clampZoomFactor(nextZoomFactor: number): number {
  return Math.max(
    MIN_ZOOM,
    Math.min(MAX_ZOOM, Number(nextZoomFactor.toFixed(2))),
  );
}

export async function applyZoomCommand(command: ZoomCommand): Promise<number> {
  if (command === "reset") {
    currentZoomFactor = DEFAULT_ZOOM;
  } else if (command === "in") {
    currentZoomFactor = clampZoomFactor(currentZoomFactor + ZOOM_STEP);
  } else {
    currentZoomFactor = clampZoomFactor(currentZoomFactor - ZOOM_STEP);
  }

  await getCurrentWebview().setZoom(currentZoomFactor);
  return currentZoomFactor;
}

export function resetZoomStateForTests(): void {
  currentZoomFactor = DEFAULT_ZOOM;
}
