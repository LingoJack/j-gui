/**
 * WelcomeView — 主区域真实空态
 *
 * 这里不再自动复用最近会话或偷偷创建 draft。
 * 当用户关闭最后一个 tab 后，应当稳定停留在可操作的空态页面。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { MessageSquare, Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WelcomeEmptyState } from '@/components/welcome/WelcomeEmptyState'
import { appModeAtom } from '@/atoms/app-mode'
import { agentSettingsReadyAtom } from '@/atoms/agent-atoms'
import { useCreateSession } from '@/hooks/useCreateSession'

export function WelcomeView(): React.ReactElement {
  const mode = useAtomValue(appModeAtom)
  const agentSettingsReady = useAtomValue(agentSettingsReadyAtom)
  const { createChat, createAgent } = useCreateSession()
  const [creating, setCreating] = React.useState(false)

  const handleCreate = React.useCallback(() => {
    if (creating) return
    setCreating(true)
    if (mode === 'agent') {
      void Promise.resolve(createAgent()).finally(() => setCreating(false))
      return
    }
    void Promise.resolve(createChat()).finally(() => setCreating(false))
  }, [creating, mode, createAgent, createChat])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 pt-8 pb-4">
        <div className="mx-auto w-full max-w-[920px] rounded-[32px] border border-border/60 bg-background/80 p-6 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.45)] backdrop-blur-xl lg:p-8">
          <WelcomeEmptyState />
        </div>
      </div>

      <div
        className="shrink-0 px-2.5 pb-2 md:px-[18px] md:pb-3"
        data-testid="welcome-bottom-dock"
      >
        <div className="mx-auto flex w-full max-w-[920px] items-center gap-4 rounded-[20px] border border-border/60 bg-background/86 px-4 py-3 shadow-[0_16px_44px_-28px_rgba(15,23,42,0.35)] backdrop-blur-xl">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-foreground">
              {mode === 'agent' ? '从底部直接开启 Agent 会话' : '从底部直接开启 Chat 对话'}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {mode === 'agent'
                ? '默认工作区会自动承接新会话，后续再附加文件夹或切换模型。'
                : '先进入对话，再决定是否迁移到 Agent 继续执行。'}
            </div>
          </div>

          <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
            <span className="rounded-full border border-border/70 bg-muted/45 px-2.5 py-1">Ctrl+N</span>
            <span className="rounded-full border border-border/70 bg-muted/45 px-2.5 py-1">Ctrl+F</span>
            <span className="rounded-full border border-border/70 bg-muted/45 px-2.5 py-1">Ctrl+,</span>
          </div>

          <Button
            type="button"
            onClick={handleCreate}
            disabled={creating || (mode === 'agent' && !agentSettingsReady)}
            className="h-11 shrink-0 rounded-2xl px-4"
          >
            {mode === 'agent' ? <Bot className="size-4" /> : <MessageSquare className="size-4" />}
            <span>
              {creating
                ? '创建中...'
                : mode === 'agent'
                  ? '新建 Agent 会话'
                  : '新建 Chat 对话'}
            </span>
          </Button>
        </div>
      </div>
    </div>
  )
}
