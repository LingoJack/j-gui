/**
 * HooksSettings - 钩子管理设置页
 *
 * 以 event 分组展示已注册的钩子信息，支持启停切换和按事件/来源筛选。
 */

import * as React from 'react'
import { SettingsSection, SettingsCard } from './primitives'
import { Switch } from '@/components/ui/switch'
import * as ipc from '@/lib/ipc'
import type { HookInfo } from '@/lib/ipc'

// ============================================================
// HookCard
// ============================================================

interface HookCardProps {
  hook: HookInfo
  onToggle: (uniqueId: string, enabled: boolean) => void
  toggling: boolean
}

function HookCard({ hook, onToggle, toggling }: HookCardProps): React.ReactElement {
  return (
    <div className="px-4 py-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <Switch
          checked={hook.enabled}
          onCheckedChange={(checked) => onToggle(hook.uniqueId, checked)}
          disabled={toggling}
        />
        <span className="text-sm font-medium text-foreground">
          {hook.name ?? hook.label}
        </span>
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground font-mono">
          {hook.hookType}
        </span>
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground font-mono">
          {hook.source}
        </span>
        {hook.enabled ? (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 font-medium">
            启用
          </span>
        ) : (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
            禁用
          </span>
        )}
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
// FilterBar
// ============================================================

interface FilterBarProps {
  events: string[]
  sources: string[]
  eventFilter: string
  sourceFilter: string
  onEventFilterChange: (v: string) => void
  onSourceFilterChange: (v: string) => void
}

function FilterBar({
  events,
  sources,
  eventFilter,
  sourceFilter,
  onEventFilterChange,
  onSourceFilterChange,
}: FilterBarProps): React.ReactElement {
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <label className="text-xs text-muted-foreground">事件:</label>
      <select
        className="text-xs h-7 rounded border border-border bg-background px-2 text-foreground"
        value={eventFilter}
        onChange={(e) => onEventFilterChange(e.target.value)}
      >
        {events.map((ev) => (
          <option key={ev} value={ev}>
            {ev === 'all' ? '全部' : ev}
          </option>
        ))}
      </select>
      <label className="text-xs text-muted-foreground">来源:</label>
      <select
        className="text-xs h-7 rounded border border-border bg-background px-2 text-foreground"
        value={sourceFilter}
        onChange={(e) => onSourceFilterChange(e.target.value)}
      >
        {sources.map((src) => (
          <option key={src} value={src}>
            {src === 'all' ? '全部' : src}
          </option>
        ))}
      </select>
    </div>
  )
}

// ============================================================
// EventGroup
// ============================================================

interface EventGroupProps {
  event: string
  hooks: HookInfo[]
  onToggle: (uniqueId: string, enabled: boolean) => void
  togglingSet: Set<string>
}

function EventGroup({ event, hooks, onToggle, togglingSet }: EventGroupProps): React.ReactElement {
  if (hooks.length === 0) return <></>
  return (
    <SettingsSection title={event}>
      <SettingsCard divided={false}>
        <div className="divide-y divide-border/50">
          {hooks.map((hook) => (
            <HookCard
              key={hook.uniqueId}
              hook={hook}
              onToggle={onToggle}
              toggling={togglingSet.has(hook.uniqueId)}
            />
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
  const [eventFilter, setEventFilter] = React.useState('all')
  const [sourceFilter, setSourceFilter] = React.useState('all')
  const [togglingSet, setTogglingSet] = React.useState<Set<string>>(new Set())

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

  const events = React.useMemo(() => {
    const set = new Set(hooks.map((h) => h.event))
    return ['all', ...Array.from(set).sort()]
  }, [hooks])

  const sources = React.useMemo(() => {
    const set = new Set(hooks.map((h) => h.source))
    return ['all', ...Array.from(set).sort()]
  }, [hooks])

  const filteredHooks = React.useMemo(() => {
    return hooks.filter((h) => {
      if (eventFilter !== 'all' && h.event !== eventFilter) return false
      if (sourceFilter !== 'all' && h.source !== sourceFilter) return false
      return true
    })
  }, [hooks, eventFilter, sourceFilter])

  const groupedByEvent = React.useMemo(() => {
    const groups: Record<string, HookInfo[]> = {}
    for (const hook of filteredHooks) {
      if (!groups[hook.event]) {
        groups[hook.event] = []
      }
      groups[hook.event].push(hook)
    }
    return groups
  }, [filteredHooks])

  const handleToggle = React.useCallback(
    async (uniqueId: string, enabled: boolean) => {
      setTogglingSet((prev) => new Set(prev).add(uniqueId))
      try {
        await ipc.toggleHook(uniqueId, enabled)
        setHooks((prev) =>
          prev.map((h) => (h.uniqueId === uniqueId ? { ...h, enabled } : h)),
        )
      } catch (err) {
        console.error('[钩子设置] 切换失败:', err)
      } finally {
        setTogglingSet((prev) => {
          const next = new Set(prev)
          next.delete(uniqueId)
          return next
        })
      }
    },
    [],
  )

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
      <FilterBar
        events={events}
        sources={sources}
        eventFilter={eventFilter}
        sourceFilter={sourceFilter}
        onEventFilterChange={setEventFilter}
        onSourceFilterChange={setSourceFilter}
      />
      {Object.entries(groupedByEvent).map(([event, eventHooks]) => (
        <EventGroup
          key={event}
          event={event}
          hooks={eventHooks}
          onToggle={handleToggle}
          togglingSet={togglingSet}
        />
      ))}
    </div>
  )
}
