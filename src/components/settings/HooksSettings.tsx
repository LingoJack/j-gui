/**
 * HooksSettings - 钩子管理设置页
 *
 * 以 event 分组展示已注册的钩子信息（只读列表，不含增删改）。
 */

import * as React from 'react'
import { SettingsSection, SettingsCard } from './primitives'
import * as ipc from '@/lib/ipc'
import type { HookInfo } from '@/lib/ipc'

// ============================================================
// HookCard
// ============================================================

interface HookCardProps {
  hook: HookInfo
}

function HookCard({ hook }: HookCardProps): React.ReactElement {
  return (
    <div className="px-4 py-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">
          {hook.name ?? hook.label}
        </span>
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground font-mono">
          {hook.hookType}
        </span>
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground font-mono">
          {hook.source}
        </span>
      </div>
      {hook.name && (
        <div className="text-xs text-muted-foreground">{hook.label}</div>
      )}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {hook.timeout != null && <span>超时: {hook.timeout}ms</span>}
        {hook.onError != null && <span>出错: {hook.onError}</span>}
      </div>
    </div>
  )
}

// ============================================================
// EventGroup
// ============================================================

interface EventGroupProps {
  event: string
  hooks: HookInfo[]
}

function EventGroup({ event, hooks }: EventGroupProps): React.ReactElement {
  return (
    <SettingsSection title={event}>
      <SettingsCard divided={false}>
        <div className="divide-y divide-border/50">
          {hooks.map((hook) => (
            <HookCard key={hook.uniqueId} hook={hook} />
          ))}
        </div>
      </SettingsCard>
    </SettingsSection>
  )
}

// ============================================================
// EmptyState
// ============================================================

function EmptyState(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-medium text-foreground">暂无已注册的钩子</p>
      <p className="text-xs text-muted-foreground mt-1">
        尚未注册任何钩子。钩子可以在会话生命周期中的特定事件点执行自定义逻辑。
      </p>
    </div>
  )
}

// ============================================================
// HooksSettings (main)
// ============================================================

export function HooksSettings(): React.ReactElement {
  const [hooks, setHooks] = React.useState<HookInfo[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    ipc
      .listHooks()
      .then((result) => {
        if (!cancelled) {
          setHooks(result)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[钩子设置] 加载失败:', err)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const groupedByEvent = React.useMemo(() => {
    const groups: Record<string, HookInfo[]> = {}
    for (const hook of hooks) {
      if (!groups[hook.event]) {
        groups[hook.event] = []
      }
      groups[hook.event].push(hook)
    }
    return groups
  }, [hooks])

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        加载中...
      </div>
    )
  }

  if (hooks.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="space-y-6">
      {Object.entries(groupedByEvent).map(([event, eventHooks]) => (
        <EventGroup key={event} event={event} hooks={eventHooks} />
      ))}
    </div>
  )
}
