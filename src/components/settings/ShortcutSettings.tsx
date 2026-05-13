/**
 * ShortcutSettings - 快捷键管理
 *
 * 复用现有 shortcut-registry 与 settings.json 持久化能力，
 * 提供发送键模式切换、本地快捷键自定义和恢复默认值入口。
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
} from './primitives'
import { shortcutOverridesAtom, sendWithCmdEnterAtom } from '@/atoms/shortcut-atoms'
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_CATEGORY_LABELS,
} from '@/lib/shortcut-defaults'
import type {
  ShortcutCategory,
  ShortcutDefinition,
  ShortcutOverrides,
} from '@/lib/shortcut-defaults'
import {
  checkConflict,
  getAcceleratorDisplay,
  getActiveAccelerator,
  isMac,
  updateShortcutOverrides,
} from '@/lib/shortcut-registry'
import * as ipc from '@/lib/ipc'

interface ShortcutRecorderProps {
  shortcut: ShortcutDefinition
  currentAccelerator: string
  onSave: (shortcutId: string, accelerator: string) => Promise<boolean>
}

function normalizeRecordedKey(rawKey: string): string {
  if (rawKey === ' ') return 'Space'
  if (rawKey === '+') return 'Plus'
  if (rawKey.length === 1) return rawKey.toUpperCase()

  const keyMap: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Esc',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Enter: 'Enter',
    Tab: 'Tab',
  }

  return keyMap[rawKey] ?? rawKey
}

function isStandaloneKeyAllowed(key: string): boolean {
  return /^F(?:[1-9]|1[0-9]|2[0-4])$/i.test(key)
}

function ShortcutRecorder({
  shortcut,
  currentAccelerator,
  onSave,
}: ShortcutRecorderProps): React.ReactElement {
  const [recording, setRecording] = React.useState(false)
  const [pendingAccelerator, setPendingAccelerator] = React.useState('')
  const [conflictLabel, setConflictLabel] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!recording) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        setRecording(false)
        setPendingAccelerator('')
        setConflictLabel(null)
        return
      }

      const parts: string[] = []
      if (event.metaKey && isMac) parts.push('Cmd')
      if (event.ctrlKey) parts.push('Ctrl')
      if (event.shiftKey) parts.push('Shift')
      if (event.altKey) parts.push('Alt')

      if (['Meta', 'Control', 'Shift', 'Alt'].includes(event.key)) {
        setPendingAccelerator(parts.join('+'))
        return
      }

      const key = normalizeRecordedKey(event.key)
      if (parts.length === 0 && !isStandaloneKeyAllowed(key)) {
        setPendingAccelerator('')
        return
      }

      const accelerator = [...parts, key].join('+')
      const conflictId = checkConflict(accelerator, shortcut.id)
      if (conflictId) {
        const conflictShortcut = DEFAULT_SHORTCUTS.find((item) => item.id === conflictId)
        setConflictLabel(conflictShortcut?.name ?? conflictId)
        setPendingAccelerator(accelerator)
        setRecording(false)
        return
      }

      setConflictLabel(null)
      setPendingAccelerator(accelerator)
      setRecording(false)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [recording, shortcut.id])

  const handleSave = React.useCallback(async () => {
    if (!pendingAccelerator || conflictLabel || recording || saving) return
    setSaving(true)
    try {
      const saved = await onSave(shortcut.id, pendingAccelerator)
      if (saved) {
        setPendingAccelerator('')
        setConflictLabel(null)
      }
    } finally {
      setSaving(false)
    }
  }, [conflictLabel, onSave, pendingAccelerator, recording, saving, shortcut.id])

  if (recording || pendingAccelerator) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-mono text-foreground/80">
          {pendingAccelerator ? getAcceleratorDisplay(pendingAccelerator) : '请按下快捷键'}
        </span>
        {conflictLabel && (
          <span className="text-xs text-destructive">
            与“{conflictLabel}”冲突
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => {
            setRecording(false)
            setPendingAccelerator('')
            setConflictLabel(null)
          }}
        >
          取消
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={!pendingAccelerator || !!conflictLabel || recording || saving}
          onClick={() => {
            void handleSave()
          }}
        >
          {saving ? '保存中' : '保存'}
        </Button>
      </div>
    )
  }

  return (
    <button
      type="button"
      className="rounded-md bg-muted px-2.5 py-1 text-xs font-mono text-foreground/80 transition-colors hover:bg-muted/80"
      onClick={() => {
        setRecording(true)
        setConflictLabel(null)
      }}
      title="点击录制新的快捷键"
    >
      {getAcceleratorDisplay(currentAccelerator)}
    </button>
  )
}

function groupShortcuts(): Map<ShortcutCategory, ShortcutDefinition[]> {
  const groups = new Map<ShortcutCategory, ShortcutDefinition[]>()
  for (const definition of DEFAULT_SHORTCUTS) {
    const current = groups.get(definition.category) ?? []
    current.push(definition)
    groups.set(definition.category, current)
  }
  return groups
}

export function ShortcutSettings(): React.ReactElement {
  const [overrides, setOverrides] = useAtom(shortcutOverridesAtom)
  const [sendWithCmdEnter, setSendWithCmdEnter] = useAtom(sendWithCmdEnterAtom)

  const grouped = React.useMemo(groupShortcuts, [])
  const hasOverrides = Object.keys(overrides).length > 0

  const saveOverrides = React.useCallback(async (nextOverrides: ShortcutOverrides) => {
    const saved = await ipc.updateSettings({ shortcutOverrides: nextOverrides })
    const resolvedOverrides = saved.shortcutOverrides ?? nextOverrides
    setOverrides(resolvedOverrides)
    updateShortcutOverrides(resolvedOverrides)
  }, [setOverrides])

  const handleSaveShortcut = React.useCallback(async (shortcutId: string, accelerator: string): Promise<boolean> => {
    const platformKey = isMac ? 'mac' : 'win'
    const nextOverrides: ShortcutOverrides = {
      ...overrides,
      [shortcutId]: {
        ...overrides[shortcutId],
        [platformKey]: accelerator,
      },
    }

    try {
      await saveOverrides(nextOverrides)
      toast.success('快捷键已保存')
      return true
    } catch (error) {
      console.error('[ShortcutSettings] 保存快捷键失败:', error)
      toast.error('快捷键保存失败')
      return false
    }
  }, [overrides, saveOverrides])

  const handleResetShortcut = React.useCallback(async (shortcutId: string) => {
    const nextOverrides = { ...overrides }
    delete nextOverrides[shortcutId]

    try {
      await saveOverrides(nextOverrides)
      toast.success('已恢复默认快捷键')
    } catch (error) {
      console.error('[ShortcutSettings] 恢复默认快捷键失败:', error)
      toast.error('恢复默认快捷键失败')
    }
  }, [overrides, saveOverrides])

  const handleResetAll = React.useCallback(async () => {
    try {
      await saveOverrides({})
      toast.success('已恢复全部默认快捷键')
    } catch (error) {
      console.error('[ShortcutSettings] 恢复全部默认失败:', error)
      toast.error('恢复全部默认快捷键失败')
    }
  }, [saveOverrides])

  const handleToggleSendKey = React.useCallback(async (nextValue: boolean) => {
    setSendWithCmdEnter(nextValue)
    try {
      await ipc.updateSettings({ sendWithCmdEnter: nextValue })
      toast.success('发送快捷键已保存')
    } catch (error) {
      setSendWithCmdEnter(!nextValue)
      console.error('[ShortcutSettings] 保存发送快捷键失败:', error)
      toast.error('发送快捷键保存失败')
    }
  }, [setSendWithCmdEnter])

  const categoryOrder: ShortcutCategory[] = ['app', 'navigation', 'edit']

  return (
    <div className="space-y-6">
      <SettingsSection
        title="快捷键管理"
        description="仅展示当前真实可用的快捷键，改动会立即写入设置。"
      >
        <SettingsCard>
          <SettingsRow
            label="发送 / 换行快捷键"
            description="切换 Enter 发送消息还是换行。"
          >
            <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-0.5">
              <button
                type="button"
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                  !sendWithCmdEnter
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => {
                  if (sendWithCmdEnter) {
                    void handleToggleSendKey(false)
                  }
                }}
              >
                Enter 发送
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                  sendWithCmdEnter
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => {
                  if (!sendWithCmdEnter) {
                    void handleToggleSendKey(true)
                  }
                }}
              >
                {isMac ? '⌘' : 'Ctrl'}+Enter 发送
              </button>
            </div>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      {hasOverrides && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => {
              void handleResetAll()
            }}
          >
            <RotateCcw className="mr-1 size-3.5" />
            恢复全部默认
          </Button>
        </div>
      )}

      {categoryOrder.map((category) => {
        const shortcuts = grouped.get(category)
        if (!shortcuts || shortcuts.length === 0) return null

        return (
          <SettingsSection
            key={category}
            title={SHORTCUT_CATEGORY_LABELS[category]}
          >
            <SettingsCard>
              {shortcuts
                .filter((shortcut) => !shortcut.readonly || (isMac ? shortcut.defaultMac : shortcut.defaultWin))
                .map((shortcut) => {
                  const currentAccelerator = getActiveAccelerator(shortcut.id)
                  const isCustomized = !!overrides[shortcut.id]
                  const isEditable = !shortcut.readonly && !shortcut.global

                  return (
                    <SettingsRow
                      key={shortcut.id}
                      label={shortcut.name}
                      description={shortcut.description}
                    >
                      <div className="flex items-center gap-2">
                        {isEditable ? (
                          <>
                            <ShortcutRecorder
                              shortcut={shortcut}
                              currentAccelerator={currentAccelerator}
                              onSave={handleSaveShortcut}
                            />
                            {isCustomized && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 text-muted-foreground"
                                onClick={() => {
                                  void handleResetShortcut(shortcut.id)
                                }}
                                title="恢复默认"
                              >
                                <RotateCcw className="size-3.5" />
                              </Button>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-mono text-foreground/70">
                              {getAcceleratorDisplay(currentAccelerator)}
                            </span>
                            {shortcut.global && (
                              <span className="text-xs text-muted-foreground">
                                暂不可改
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </SettingsRow>
                  )
                })}
            </SettingsCard>
          </SettingsSection>
        )
      })}
    </div>
  )
}
