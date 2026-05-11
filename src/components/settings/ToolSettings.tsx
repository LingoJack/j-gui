/**
 * ToolSettings 工具设置页
 *
 * Chat 模式工具统一管理标签页与联网搜索工具配置。
 */

import * as React from 'react'
import { useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { Info } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { SettingsSection, SettingsCard } from './primitives'
import * as ipc from '@/lib/ipc'

/** 刷新全局工具列表 atom */
async function refreshChatTools(setter: (tools: Awaited<ReturnType<typeof ipc.getChatTools>>) => void): Promise<void> {
  try {
    const tools = await ipc.getChatTools()
    setter(tools)
  } catch (err) {
    console.error('[ToolSettings] 刷新工具列表失败:', err)
  }
}

/** 内置工具列表区域 — 使用后端 list_chat_tools / set_tool_enabled */
export function BuiltinToolsSection(): React.ReactElement {
  const [tools, setTools] = React.useState<Array<{ name: string; description: string; enabled: boolean }>>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    ipc.listChatTools()
      .then((result) => {
        setTools(result)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [])

  const handleToggle = async (name: string, currentEnabled: boolean): Promise<void> => {
    // 先做乐观更新，立即反馈到 UI
    setTools((prev) =>
      prev.map((t) => (t.name === name ? { ...t, enabled: !currentEnabled } : t))
    )
    try {
      await ipc.setToolEnabled(name, !currentEnabled)
    } catch (err) {
      console.error('[内置工具] 切换失败:', err)
      toast.error('切换工具状态失败')
      // 失败时回滚
      setTools((prev) =>
        prev.map((t) => (t.name === name ? { ...t, enabled: currentEnabled } : t))
      )
    }
  }

  if (loading) {
    return (
      <SettingsSection title="内置工具" description="启用或禁用 AI 可使用的内置工具">
        <SettingsCard divided={false}>
          <div className="text-sm text-muted-foreground py-8 text-center">加载工具列表...</div>
        </SettingsCard>
      </SettingsSection>
    )
  }

  if (error) {
    return (
      <SettingsSection title="内置工具" description="启用或禁用 AI 可使用的内置工具">
        <SettingsCard divided={false}>
          <div className="text-sm text-destructive py-8 text-center">加载失败: {error}</div>
        </SettingsCard>
      </SettingsSection>
    )
  }

  return (
    <SettingsSection
      title="内置工具"
      description="启用或禁用 AI 可使用的内置工具"
    >
      <SettingsCard divided>
        {tools.map((tool) => (
          <div key={tool.name} className="flex items-center justify-between p-4">
            <div className="flex-1 min-w-0 mr-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{tool.name}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {tool.description}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Switch
                checked={tool.enabled}
                onCheckedChange={() => handleToggle(tool.name, tool.enabled)}
              />
            </div>
          </div>
        ))}
      </SettingsCard>
    </SettingsSection>
  )
}

function ToolSettingsSupportNotice(): React.ReactElement {
  return (
    <SettingsSection
      title="更多工具设置"
      description="当前前端只暴露已接通的后端能力，避免出现设置成功但实际不会生效的假象"
    >
      <SettingsCard divided={false}>
        <div className="flex gap-3 p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-foreground/60" />
          <div className="space-y-1">
            <p>目前已闭环的是内置工具开关，对应后端 `list_chat_tools / set_tool_enabled`。</p>
            <p>凭据管理、自定义工具编辑与连通性测试入口暂未接通，已先从设置页隐藏。</p>
          </div>
        </div>
      </SettingsCard>
    </SettingsSection>
  )
}

export function ToolSettings(): React.ReactElement {
  return (
    <div className="space-y-8">
      {/* 内置工具 */}
      <BuiltinToolsSection />

      {/* 支持面说明 */}
      <ToolSettingsSupportNotice />
    </div>
  )
}
