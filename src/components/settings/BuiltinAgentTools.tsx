/**
 * BuiltinAgentTools - 只读展示 Agent 可用的内置工具
 *
 * 从 AgentSettings.tsx 中拆出，以缩小组件体积。
 */

import * as React from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { Search, Pencil, Terminal, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SettingsSection, SettingsCard } from './primitives'
import { chatToolsAtom } from '@/atoms/chat-tool-atoms'
import { settingsTabAtom } from '@/atoms/settings-tab'
import * as ipc from '@/lib/ipc'

export function BuiltinAgentTools(): React.ReactElement {
  const [tools, setTools] = useAtom(chatToolsAtom)
  const setSettingsTab = useSetAtom(settingsTabAtom)
  const [loading, setLoading] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (tools.length > 0) return
    setLoading(true)
    setLoadError(null)
    ipc.getChatTools()
      .then((nextTools) => {
        setTools(nextTools)
        setLoading(false)
      })
      .catch((error: unknown) => {
        console.error('[BuiltinAgentTools] 加载内置工具失败:', error)
        setLoadError(error instanceof Error ? error.message : String(error))
        setLoading(false)
      })
  }, [setTools, tools.length])

  interface BuiltinToolItem {
    id: string
    name: string
    description: string
    icon: React.ReactElement
    enabled: boolean
    available: boolean
  }

  const builtinTools: BuiltinToolItem[] = [
    {
      id: 'Bash',
      name: '终端命令',
      description: '执行 shell 命令与脚本',
      icon: <Terminal className="size-4" />,
      enabled: tools.find((t) => t.meta.id === 'Bash')?.enabled ?? false,
      available: tools.find((t) => t.meta.id === 'Bash')?.available ?? false,
    },
    {
      id: 'Read',
      name: '读文件',
      description: '读取工作区与附加目录中的文件内容',
      icon: <FileText className="size-4" />,
      enabled: tools.find((t) => t.meta.id === 'Read')?.enabled ?? false,
      available: tools.find((t) => t.meta.id === 'Read')?.available ?? false,
    },
    {
      id: 'WebSearch',
      name: '联网搜索',
      description: '实时搜索互联网获取最新信息',
      icon: <Search className="size-4" />,
      enabled: tools.find((t) => t.meta.id === 'WebSearch')?.enabled ?? false,
      available: tools.find((t) => t.meta.id === 'WebSearch')?.available ?? false,
    },
    {
      id: 'Write',
      name: '写文件',
      description: '创建或修改工作区中的文件',
      icon: <Pencil className="size-4" />,
      enabled: tools.find((t) => t.meta.id === 'Write')?.enabled ?? false,
      available: tools.find((t) => t.meta.id === 'Write')?.available ?? false,
    },
  ]

  return (
    <SettingsSection
      title="内置工具"
      description="启用后自动注入到 Agent 会话，在工具设置中配置"
      action={
        <Button size="sm" variant="outline" onClick={() => setSettingsTab('tools')}>
          <Pencil size={14} />
          <span>配置</span>
        </Button>
      }
    >
      <SettingsCard divided>
        {loading && tools.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">加载内置工具中...</div>
        ) : null}
        {loadError && tools.length === 0 ? (
          <div className="p-4 text-sm text-destructive">加载失败：{loadError}</div>
        ) : null}
        {builtinTools.map((tool) => {
          const isActive = tool.enabled && tool.available
          return (
            <div key={tool.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className={cn('shrink-0', !isActive && 'opacity-40')}>{tool.icon}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-sm font-medium', !isActive && 'text-muted-foreground')}>{tool.name}</span>
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full',
                      isActive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
                    )}>
                      {isActive ? '已启用' : !tool.available ? '需配置' : '未启用'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{tool.description}</p>
                </div>
              </div>
            </div>
          )
        })}
      </SettingsCard>
    </SettingsSection>
  )
}
