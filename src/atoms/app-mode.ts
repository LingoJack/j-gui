/**
 * App Mode Atom - 应用模式状态
 *
 * - chat: 对话模式
 * - agent: Agent 模式（原 Flow）
 */

import type { WritableAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

export type AppMode = 'chat' | 'agent'

/** App 模式，自动持久化到 localStorage */
export const appModeAtom: WritableAtom<AppMode, [AppMode], void> = atomWithStorage<AppMode>('jgui-app-mode', 'agent')
