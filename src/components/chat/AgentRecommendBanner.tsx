/**
 * AgentRecommendBanner — Agent 模式推荐横幅
 *
 * 当 AI 通过 suggest_agent_mode 工具推荐切换到 Agent 模式时，
 * 在 ChatInput 上方展示推荐横幅（与 AskUserBanner 同风格同位置）。
 * 用户可点击"交给 Agent"按钮，新建 Agent 会话并把当前 Chat
 * 作为引用草稿插入输入框，或点击 × 关闭。
 */

import * as React from 'react'
import { useAtom, useStore } from 'jotai'
import { Sparkles, X, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { pendingAgentRecommendationAtom } from '@/atoms/chat-atoms'
import { openAgentWithChatReference } from './open-agent-with-chat-reference'

export function AgentRecommendBanner(): React.ReactElement | null {
  const [recommendation, setRecommendation] = useAtom(pendingAgentRecommendationAtom)
  const store = useStore()
  const [migrating, setMigrating] = React.useState(false)

  if (!recommendation) return null

  const handleDismiss = (): void => {
    setRecommendation(null)
  }

  const handleMigrate = async (): Promise<void> => {
    if (migrating) return

    // 保存推荐数据后立即清除，避免模式切换时 ChatView 副作用
    const { conversationId, suggestedPrompt } = recommendation
    setRecommendation(null)

    setMigrating(true)
    try {
      await openAgentWithChatReference({
        store,
        conversationId,
        suggestedPrompt,
      })
    } catch (error) {
      console.error('[AgentRecommendBanner] 打开 Agent 引用失败:', error)
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div className="mx-4 mb-2 flex items-center gap-2 rounded-full border border-border/60 bg-background/72 px-3 py-2 text-xs text-muted-foreground animate-in slide-in-from-bottom-1 duration-200">
      <Sparkles className="size-3.5 shrink-0 text-primary/70" />
      <p className="min-w-0 flex-1 truncate">{recommendation.reason}</p>
      <div className="flex items-center gap-1.5">
        <Button
          variant="default"
          size="sm"
          onClick={handleMigrate}
          disabled={migrating}
          className="h-7 rounded-full px-3 text-xs"
        >
          {migrating ? '切换中...' : '交给 Agent'}
          {!migrating && <ArrowRight className="size-3 ml-1" />}
        </Button>
        <button
          type="button"
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          onClick={handleDismiss}
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
