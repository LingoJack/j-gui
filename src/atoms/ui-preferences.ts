/**
 * UI 偏好设置状态管理
 *
 * 管理用户界面相关的显示偏好，如悬浮置顶条等。
 */

import { atom, type PrimitiveAtom } from 'jotai'
import * as ipc from '@/lib/ipc'

// ===== Jotai 原子 =====

/** 是否显示用户消息悬浮置顶条 */
export const stickyUserMessageEnabledAtom: PrimitiveAtom<boolean> = atom<boolean>(true)

// ===== 初始化 =====

/**
 * 从主进程加载 UI 偏好设置
 */
export async function initializeUiPreferences(
  setStickyUserMessageEnabled: (enabled: boolean) => void
): Promise<void> {
  try {
    const settings = await ipc.getSettings()
    setStickyUserMessageEnabled(settings.stickyUserMessageEnabled ?? true)
  } catch (error) {
    console.error('[UI偏好] 初始化失败:', error)
  }
}

// ===== 持久化更新 =====

/**
 * 更新悬浮置顶条开关并持久化
 */
export async function updateStickyUserMessageEnabled(enabled: boolean): Promise<void> {
  try {
    await ipc.updateSettings({ stickyUserMessageEnabled: enabled })
  } catch (error) {
    console.error('[UI偏好] 更新悬浮置顶条设置失败:', error)
  }
}
