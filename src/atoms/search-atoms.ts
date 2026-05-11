/**
 * 搜索对话框状态原子
 *
 * 管理全局搜索对话框的开关、查询词和搜索结果。
 */

import { atom } from 'jotai'

/** 搜索对话框是否打开 */
export const searchDialogOpenAtom = atom(false)
