import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

const SHOW_MAIN_WINDOW_ACCELERATOR = "CommandOrControl+Shift+P";

export function matchesShowMainWindowShortcut(event: KeyboardEvent): boolean {
  const primaryModifier = navigator.userAgent.includes("Mac")
    ? event.metaKey
    : event.ctrlKey;

  return (
    primaryModifier && event.shiftKey && !event.altKey && event.code === "KeyP"
  );
}

async function revealCurrentWindow(): Promise<void> {
  const window = getCurrentWebviewWindow();
  await window.unminimize();
  await window.show();
  await window.setFocus();
}

export async function showMainWindow(): Promise<void> {
  await revealCurrentWindow();
}

export async function registerGlobalAppShortcuts(): Promise<
  () => Promise<void>
> {
  await unregister(SHOW_MAIN_WINDOW_ACCELERATOR).catch(() => undefined);

  await register(SHOW_MAIN_WINDOW_ACCELERATOR, async (event) => {
    if (event.state !== "Pressed") return;
    await revealCurrentWindow();
  });

  return async () => {
    await unregister(SHOW_MAIN_WINDOW_ACCELERATOR);
  };
}
