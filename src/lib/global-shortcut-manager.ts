import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { toggleMainAppWindow } from "@/lib/window-presence";
import { getActiveAccelerator, isMac } from "@/lib/shortcut-registry";

export interface GlobalShortcutRegistrationResult {
  accelerator: string;
  success: boolean;
  reason?: string;
}

interface ParsedAccelerator {
  cmd: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

let globalShortcutHandlingSuspended = false;
let currentRegisteredPluginAccelerator: string | null = null;
let lastMainWindowToggleAt = 0;

const MAIN_WINDOW_TOGGLE_DEDUPE_MS = 250;

function parseAccelerator(accelerator: string): ParsedAccelerator {
  const parts = accelerator.split("+").map((part) => part.trim()).filter(Boolean);
  const key = (parts[parts.length - 1] ?? "").toLowerCase();
  const modifiers = parts.slice(0, -1).map((modifier) => modifier.toLowerCase());

  return {
    cmd: modifiers.includes("cmd") || modifiers.includes("ctrl") || modifiers.includes("commandorcontrol"),
    shift: modifiers.includes("shift"),
    alt: modifiers.includes("alt") || modifiers.includes("option"),
    key,
  };
}

function matchesAccelerator(event: KeyboardEvent, accelerator: string): boolean {
  const parsed = parseAccelerator(accelerator);
  const primaryModifier = isMac ? event.metaKey : event.ctrlKey;

  return (
    parsed.cmd === primaryModifier
    && parsed.shift === event.shiftKey
    && parsed.alt === event.altKey
    && parsed.key === event.key.toLowerCase()
  );
}

function normalizeAcceleratorForPlugin(accelerator: string): string {
  return accelerator
    .replace(/\bCmd\b/gi, "CommandOrControl")
    .replace(/\bCtrl\b/gi, "CommandOrControl")
    .replace(/\bOption\b/gi, "Alt");
}

function getShowMainWindowAccelerator(): string {
  return getActiveAccelerator("show-main-window");
}

export function matchesShowMainWindowShortcut(event: KeyboardEvent): boolean {
  if (globalShortcutHandlingSuspended) return false;
  return matchesAccelerator(event, getShowMainWindowAccelerator());
}

export async function showMainWindow(): Promise<void> {
  if (globalShortcutHandlingSuspended) return;
  await toggleMainAppWindow();
}

export async function showMainWindowFromShortcut(): Promise<void> {
  if (globalShortcutHandlingSuspended) return;
  await toggleMainAppWindowDeduped();
}

export function setGlobalShortcutHandlingSuspended(suspended: boolean): void {
  globalShortcutHandlingSuspended = suspended;
}

export async function probeGlobalShortcutRegistration(
  accelerator: string,
): Promise<GlobalShortcutRegistrationResult> {
  const pluginAccelerator = normalizeAcceleratorForPlugin(accelerator);
  const shouldRestoreCurrent = pluginAccelerator === currentRegisteredPluginAccelerator;

  if (shouldRestoreCurrent) {
    await unregister(pluginAccelerator).catch(() => undefined);
    currentRegisteredPluginAccelerator = null;
  }

  try {
    await register(pluginAccelerator, async () => undefined);
    await unregister(pluginAccelerator).catch(() => undefined);
    if (shouldRestoreCurrent) {
      await register(pluginAccelerator, async (event) => {
        if (event.state !== "Pressed") return;
        if (globalShortcutHandlingSuspended) return;
        await toggleMainAppWindowDeduped();
      });
      currentRegisteredPluginAccelerator = pluginAccelerator;
    }
    return {
      accelerator,
      success: true,
    };
  } catch (error) {
    await unregister(pluginAccelerator).catch(() => undefined);
    if (shouldRestoreCurrent) {
      await register(pluginAccelerator, async (event) => {
        if (event.state !== "Pressed") return;
        if (globalShortcutHandlingSuspended) return;
        await toggleMainAppWindowDeduped();
      }).catch(() => undefined);
      currentRegisteredPluginAccelerator = pluginAccelerator;
    }
    return {
      accelerator,
      success: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function registerGlobalAppShortcuts(): Promise<{
  dispose: () => Promise<void>;
  result: GlobalShortcutRegistrationResult;
}> {
  const accelerator = getShowMainWindowAccelerator();
  const pluginAccelerator = normalizeAcceleratorForPlugin(accelerator);

  if (
    currentRegisteredPluginAccelerator
    && currentRegisteredPluginAccelerator !== pluginAccelerator
  ) {
    await unregister(currentRegisteredPluginAccelerator).catch(() => undefined);
    currentRegisteredPluginAccelerator = null;
  }

  await unregister(pluginAccelerator).catch(() => undefined);

  try {
    await register(pluginAccelerator, async (event) => {
      if (event.state !== "Pressed") return;
      if (globalShortcutHandlingSuspended) return;
      await toggleMainAppWindowDeduped();
    });
    currentRegisteredPluginAccelerator = pluginAccelerator;
  } catch (error) {
    currentRegisteredPluginAccelerator = null;
    return {
      dispose: async () => {
        await unregister(pluginAccelerator).catch(() => undefined);
      },
      result: {
        accelerator,
        success: false,
        reason: error instanceof Error ? error.message : String(error),
      },
    };
  }

  return {
    dispose: async () => {
      await unregister(pluginAccelerator);
      if (currentRegisteredPluginAccelerator === pluginAccelerator) {
        currentRegisteredPluginAccelerator = null;
      }
    },
    result: {
      accelerator,
      success: true,
    },
  };
}

async function toggleMainAppWindowDeduped(): Promise<void> {
  const now = Date.now();
  if (now - lastMainWindowToggleAt < MAIN_WINDOW_TOGGLE_DEDUPE_MS) {
    return;
  }
  lastMainWindowToggleAt = now;
  await toggleMainAppWindow();
}

export function resetGlobalShortcutManagerForTests(): void {
  globalShortcutHandlingSuspended = false;
  currentRegisteredPluginAccelerator = null;
  lastMainWindowToggleAt = 0;
}
