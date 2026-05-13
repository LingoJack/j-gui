import { getCurrentWindow, type CloseRequestedEvent } from '@tauri-apps/api/window'

export async function showMainAppWindow(): Promise<void> {
  const window = getCurrentWindow()
  await window.unminimize()
  await window.show()
  await window.setFocus()
}

export async function hideMainAppWindow(): Promise<void> {
  const window = getCurrentWindow()
  await window.hide()
}

export async function toggleMainAppWindow(): Promise<void> {
  const window = getCurrentWindow()
  const visible = await window.isVisible()
  if (visible) {
    await window.hide()
    return
  }
  await window.unminimize()
  await window.show()
  await window.setFocus()
}

export async function handleMainWindowCloseRequested(event: CloseRequestedEvent): Promise<void> {
  event.preventDefault()
  await hideMainAppWindow()
}
