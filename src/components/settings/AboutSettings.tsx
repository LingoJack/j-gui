/**
 * AboutSettings - 关于页面
 *
 * 显示版本号和基本运行环境信息。不包含更新检查（roadmap 明确不做）。
 */

import * as React from 'react'
import { RefreshCw, Loader2, Info, AlertCircle } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import * as ipc from '@/lib/ipc'

declare const __APP_VERSION__: string
const APP_VERSION = __APP_VERSION__

/** 环境检测卡片 */
function EnvironmentCard(): React.ReactElement {
  const [result, setResult] = React.useState<any>(null)
  const [isChecking, setIsChecking] = React.useState(false)

  React.useEffect(() => {
    ipc.getSettings().then((settings) => {
      if (settings.lastEnvironmentCheck) setResult(settings.lastEnvironmentCheck)
    }).catch(() => {})
  }, [])

  const handleCheck = async () => {
    setIsChecking(true)
    try {
      const r = await ipc.checkEnvironment()
      setResult(r)
    } catch { /* ignore */ }
    finally { setIsChecking(false) }
  }

  const nodeStatus = !result ? 'checking' : result.nodejs?.installed ? 'success' : 'error'
  const gitStatus = !result ? 'checking' : result.git?.installed ? 'success' : 'error'

  return (
    <SettingsCard>
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="text-sm font-medium">环境检测</h3>
        <button onClick={handleCheck} disabled={isChecking}
          className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50">
          {isChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {isChecking ? '检测中...' : '重新检查'}
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Node.js</span>
          <Badge variant={nodeStatus === 'success' ? 'default' : 'destructive'}>
            {result?.nodejs?.version ? `v${result.nodejs.version}` : '未检测'}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Git</span>
          <Badge variant={gitStatus === 'success' ? 'default' : 'destructive'}>
            {result?.git?.version ? `v${result.git.version}` : '未检测'}
          </Badge>
        </div>
        {(!result?.nodejs?.installed || !result?.git?.installed) && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">Agent 模式需要 Node.js 和 Git 支持，请安装后再使用。</AlertDescription>
          </Alert>
        )}
      </div>
    </SettingsCard>
  )
}

export function AboutSettings(): React.ReactElement {
  return (
    <SettingsSection title="关于 j-gui" description="j-cli Tauri 桌面客户端">
      <SettingsCard>
        <SettingsRow label="版本">
          <span className="text-sm text-muted-foreground font-mono">{APP_VERSION}</span>
        </SettingsRow>
        <SettingsRow label="运行时">
          <span className="text-sm text-muted-foreground">Tauri v2 + React + j-cli</span>
        </SettingsRow>
      </SettingsCard>
      <EnvironmentCard />
    </SettingsSection>
  )
}
