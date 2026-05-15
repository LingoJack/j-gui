/**
 * AboutSettings - 关于页面
 *
 * 显示 j-cli 内核版本、本地 CLI 版本、j-gui 应用版本，以及更新检查。
 */

import * as React from 'react'
import { CheckCircle2, XCircle, Loader2, ExternalLink } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { getKernelInfo, checkAppUpdate, getClaudeCliStatus, type KernelInfo, type AppUpdateInfo, type ClaudeCliInfo } from '@/lib/ipc'

const UPDATE_CACHE_KEY = 'jgui-latest-app-version'

export function AboutSettings(): React.ReactElement {
  const [info, setInfo] = React.useState<KernelInfo | null>(null)
  const [claudeCli, setClaudeCli] = React.useState<ClaudeCliInfo | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [appUpdate, setAppUpdate] = React.useState<AppUpdateInfo | null>(null)
  const [checking, setChecking] = React.useState(false)

  React.useEffect(() => {
    getKernelInfo().then(setInfo).catch(() => {}).finally(() => setLoading(false))
    getClaudeCliStatus().then(setClaudeCli).catch(() => {})
    // 自动检查更新，优先用缓存
    const cached = localStorage.getItem(UPDATE_CACHE_KEY)
    if (cached) {
      try { setAppUpdate(JSON.parse(cached)) } catch { /* ignore */ }
    }
    doCheckUpdate()
  }, [])

  const doCheckUpdate = async () => {
    setChecking(true)
    try {
      const result = await checkAppUpdate()
      setAppUpdate(result)
      localStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify(result))
    } catch { /* ignore */ }
    setChecking(false)
  }

  if (loading) {
    return (
      <SettingsSection title="关于 j-gui" description="加载中...">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </SettingsSection>
    )
  }

  return (
    <SettingsSection title="关于 j-gui" description="j-cli Tauri 桌面客户端">
      <SettingsCard>
        <SettingsRow label="j-gui 版本" description="当前桌面应用版本">
          <span className="text-sm text-muted-foreground font-mono">
            {info?.appVersion ?? '—'}
          </span>
        </SettingsRow>
        <SettingsRow label="j-cli 内核" description="编译时嵌入的 j-cli crate 版本">
          <span className="text-sm text-muted-foreground font-mono">
            {info?.crateVersion ?? '—'}
          </span>
        </SettingsRow>
        <SettingsRow label="本地 j CLI" description="系统安装的 j 命令行工具版本">
          <div className="flex items-center gap-2">
            {info?.localCliInstalled ? (
              <>
                <CheckCircle2 className="size-3.5 text-green-500" />
                <span className="text-sm text-muted-foreground font-mono">
                  {info.localCliVersion ?? '已安装'}
                </span>
              </>
            ) : (
              <>
                <XCircle className="size-3.5 text-muted-foreground/40" />
                <span className="text-sm text-muted-foreground/50">
                  未安装
                </span>
              </>
            )}
          </div>
        </SettingsRow>
        <SettingsRow label="Claude Code CLI" description="Agent 模式实际调用的本机 Claude Code CLI">
          <div className="flex items-center gap-2">
            {claudeCli?.installed ? (
              <>
                <CheckCircle2 className="size-3.5 text-green-500" />
                <span className="text-sm text-muted-foreground font-mono">
                  {claudeCli.version ?? '已安装'}
                </span>
              </>
            ) : (
              <>
                <XCircle className="size-3.5 text-muted-foreground/40" />
                <span className="text-sm text-muted-foreground/50">
                  未安装
                </span>
              </>
            )}
          </div>
        </SettingsRow>
        <SettingsRow label="运行时">
          <span className="text-sm text-muted-foreground">Tauri v2 + React + j-cli</span>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard>
        <SettingsRow label="开源协议" description="本项目采用的开源许可证">
          <span className="text-sm text-muted-foreground">MIT</span>
        </SettingsRow>
        <SettingsRow label="项目地址" description="源码仓库与问题反馈">
          <a
            href="https://github.com/wuqie-xuanzhao/j-gui"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="size-3" />
            github.com/wuqie-xuanzhao/j-gui
          </a>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard>
        <SettingsRow label="更新" description="检查 j-gui 最新版本">
          <div className="flex items-center gap-2">
            {checking && !appUpdate ? (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            ) : appUpdate?.updateAvailable ? (
              <span className="text-sm text-amber-500 font-medium">
                有新版本 {appUpdate.latest}
              </span>
            ) : appUpdate ? (
              <span className="text-sm text-muted-foreground font-medium">已是最新</span>
            ) : null}
            {appUpdate?.updateAvailable && appUpdate.downloadUrl && (
              <a
                href={appUpdate.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="size-3" />
                下载
              </a>
            )}
          </div>
        </SettingsRow>
      </SettingsCard>
    </SettingsSection>
  )
}
