import * as React from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, TerminalSquare } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SettingsCard, SettingsRow, SettingsSection } from './primitives'
import * as ipc from '@/lib/ipc'
import type { RuntimeStatus, ShellCandidateStatus, WslStatus } from '@jgui/shared'

function StatusBadge({
  ok,
  label,
}: {
  ok: boolean
  label: string
}): React.ReactElement {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        ok ? 'bg-emerald-500/12 text-emerald-600' : 'bg-amber-500/12 text-amber-600',
      ].join(' ')}
    >
      {label}
    </span>
  )
}

function formatCandidateSummary(candidate: ShellCandidateStatus | null | undefined): string {
  if (!candidate) return '—'
  if (!candidate.available) return candidate.error ?? '不可用'
  return [candidate.path, candidate.version].filter(Boolean).join(' | ') || '可用'
}

function formatWslSummary(wsl: WslStatus | null | undefined): string {
  if (!wsl) return '—'
  if (!wsl.available) return wsl.error ?? '不可用'
  const parts = [
    wsl.defaultDistro ? `默认发行版 ${wsl.defaultDistro}` : null,
    wsl.version ? `WSL ${wsl.version}` : null,
    wsl.distros.length > 0 ? `${wsl.distros.length} 个发行版` : null,
  ].filter(Boolean)
  return parts.join(' | ') || '可用'
}

function ShellCandidateRows({
  candidates,
}: {
  candidates: ShellCandidateStatus[]
}): React.ReactElement {
  return (
    <>
      {candidates.map((candidate) => (
        <SettingsRow
          key={`${candidate.family}-${candidate.source}`}
          label={candidate.family}
          description={candidate.error ?? candidate.source}
        >
          <div className="flex min-w-[220px] items-center justify-end gap-3 text-right">
            <StatusBadge ok={candidate.available} label={candidate.available ? '可用' : '不可用'} />
            <span className="max-w-[280px] truncate text-xs text-muted-foreground">
              {formatCandidateSummary(candidate)}
            </span>
          </div>
        </SettingsRow>
      ))}
    </>
  )
}

export function EnvironmentSettings(): React.ReactElement {
  const [runtime, setRuntime] = React.useState<RuntimeStatus | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const loadRuntime = React.useCallback(async (refresh = false) => {
    if (refresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setLoadError(null)
    try {
      const result = await ipc.getRuntimeStatus()
      setRuntime(result)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error))
    } finally {
      if (refresh) {
        setRefreshing(false)
      } else {
        setLoading(false)
      }
    }
  }, [])

  React.useEffect(() => {
    loadRuntime().catch(() => {})
  }, [loadRuntime])

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true)
    setLoadError(null)
    try {
      // reinitRuntime 触发后端重新检测并返回最新 RuntimeStatus
      const freshStatus = await ipc.reinitRuntime()
      setRuntime(freshStatus)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setLoadError(message)
      toast.error('环境重新检测失败', { description: message })
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <SettingsSection title="环境配置" description="加载运行时与 shell 真相中">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </SettingsSection>
    )
  }

  return (
    <div className="space-y-6">
      <SettingsSection
        title="环境配置"
        description="只读展示当前运行时、推荐 shell、fallback 顺序和失败原因。"
        action={
          <Button variant="outline" size="sm" onClick={() => void handleRefresh()} disabled={refreshing}>
            {refreshing ? <Loader2 className="mr-1 size-4 animate-spin" /> : <RefreshCw className="mr-1 size-4" />}
            重新检测
          </Button>
        }
      >
        {loadError ? (
          <SettingsCard>
            <SettingsRow
              label="运行时检测失败"
              icon={<AlertTriangle className="size-4 text-amber-500" />}
              description={loadError}
            />
          </SettingsCard>
        ) : null}

        <SettingsCard>
          <SettingsRow label="Node.js" description={runtime?.node.error ?? 'Node 运行时'}>
            <div className="flex min-w-[220px] items-center justify-end gap-3 text-right">
              <StatusBadge ok={!!runtime?.node.available} label={runtime?.node.available ? '可用' : '不可用'} />
              <span className="max-w-[280px] truncate text-xs text-muted-foreground">
                {runtime?.node.path ?? runtime?.node.version ?? '—'}
              </span>
            </div>
          </SettingsRow>
          <SettingsRow label="Git" description={runtime?.git.error ?? 'Git 运行时'}>
            <div className="flex min-w-[220px] items-center justify-end gap-3 text-right">
              <StatusBadge ok={!!runtime?.git.available} label={runtime?.git.available ? '可用' : '不可用'} />
              <span className="max-w-[280px] truncate text-xs text-muted-foreground">
                {runtime?.git.path ?? runtime?.git.version ?? '—'}
              </span>
            </div>
          </SettingsRow>
          <SettingsRow label="Bun" description={runtime?.bun.error ?? 'Bun 运行时'}>
            <div className="flex min-w-[220px] items-center justify-end gap-3 text-right">
              <StatusBadge ok={!!runtime?.bun.available} label={runtime?.bun.available ? '可用' : '不可用'} />
              <span className="max-w-[280px] truncate text-xs text-muted-foreground">
                {runtime?.bun.path ?? runtime?.bun.version ?? '—'}
              </span>
            </div>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="Shell 真相"
        description="展示当前 shell、推荐 shell、fallback 顺序和平台明细；本页不写回 shell 选择。"
      >
        <SettingsCard>
          <SettingsRow
            label="当前平台"
            icon={<TerminalSquare className="size-4 text-muted-foreground" />}
            description="当前桌面环境的运行平台"
          >
            <span className="text-sm font-mono text-muted-foreground">{runtime?.shell.platform ?? '—'}</span>
          </SettingsRow>
          <SettingsRow
            label="当前 shell"
            description={runtime?.shell.current?.error ?? '当前用户环境下的默认交互 shell'}
          >
            <div className="flex min-w-[220px] items-center justify-end gap-3 text-right">
              <StatusBadge ok={!!runtime?.shell.current?.available} label={runtime?.shell.current?.available ? '可用' : '不可用'} />
              <span className="max-w-[280px] truncate text-xs text-muted-foreground">
                {runtime?.shell.current
                  ? `${runtime.shell.current.family} | ${formatCandidateSummary(runtime.shell.current)}`
                  : '未探测到'}
              </span>
            </div>
          </SettingsRow>
          <SettingsRow
            label="推荐 shell"
            description="仅用于展示推荐和 fallback，不代表已经切换生效"
          >
            <span className="text-sm font-mono text-muted-foreground">{runtime?.shell.recommended ?? 'unknown'}</span>
          </SettingsRow>
          <SettingsRow
            label="Fallback 顺序"
            description="推荐 shell 不可用时的只读退化顺序"
          >
            <span className="max-w-[320px] text-right text-xs text-muted-foreground">
              {runtime?.shell.fallbackOrder.join(' → ') ?? '—'}
            </span>
          </SettingsRow>
        </SettingsCard>

        {runtime?.shell.windows ? (
          <SettingsCard>
            <SettingsRow
              label="Windows shell 明细"
              description="Git Bash / WSL / PowerShell / CMD 的当前可用性与失败原因"
              icon={<CheckCircle2 className="size-4 text-muted-foreground" />}
            />
            <SettingsRow label="PowerShell" description={runtime.shell.windows.powershell.error ?? runtime.shell.windows.powershell.source}>
              <div className="flex min-w-[220px] items-center justify-end gap-3 text-right">
                <StatusBadge ok={runtime.shell.windows.powershell.available} label={runtime.shell.windows.powershell.available ? '可用' : '不可用'} />
                <span className="max-w-[280px] truncate text-xs text-muted-foreground">
                  {formatCandidateSummary(runtime.shell.windows.powershell)}
                </span>
              </div>
            </SettingsRow>
            <SettingsRow label="CMD" description={runtime.shell.windows.cmd.error ?? runtime.shell.windows.cmd.source}>
              <div className="flex min-w-[220px] items-center justify-end gap-3 text-right">
                <StatusBadge ok={runtime.shell.windows.cmd.available} label={runtime.shell.windows.cmd.available ? '可用' : '不可用'} />
                <span className="max-w-[280px] truncate text-xs text-muted-foreground">
                  {formatCandidateSummary(runtime.shell.windows.cmd)}
                </span>
              </div>
            </SettingsRow>
            <SettingsRow label="Git Bash" description={runtime.shell.windows.gitBash.error ?? runtime.shell.windows.gitBash.source}>
              <div className="flex min-w-[220px] items-center justify-end gap-3 text-right">
                <StatusBadge ok={runtime.shell.windows.gitBash.available} label={runtime.shell.windows.gitBash.available ? '可用' : '不可用'} />
                <span className="max-w-[280px] truncate text-xs text-muted-foreground">
                  {formatCandidateSummary(runtime.shell.windows.gitBash)}
                </span>
              </div>
            </SettingsRow>
            <SettingsRow label="WSL" description={runtime.shell.windows.wsl.error ?? 'Windows Subsystem for Linux'}>
              <div className="flex min-w-[220px] items-center justify-end gap-3 text-right">
                <StatusBadge ok={runtime.shell.windows.wsl.available} label={runtime.shell.windows.wsl.available ? '可用' : '不可用'} />
                <span className="max-w-[280px] truncate text-xs text-muted-foreground">
                  {formatWslSummary(runtime.shell.windows.wsl)}
                </span>
              </div>
            </SettingsRow>
          </SettingsCard>
        ) : null}

        {runtime?.shell.posix ? (
          <SettingsCard>
            <SettingsRow
              label="POSIX shell 明细"
              description="bash / zsh / fish / sh 的当前可用性与失败原因"
              icon={<CheckCircle2 className="size-4 text-muted-foreground" />}
            />
            <ShellCandidateRows candidates={runtime.shell.posix.candidates} />
          </SettingsCard>
        ) : null}
      </SettingsSection>
    </div>
  )
}
