/**
 * MigrateToAgentButton — 从 Chat 桥接到 Agent 的引用按钮
 *
 * 保留原组件名是为了兼容现有调用点和测试，但行为已经改成：
 * 1. 创建 Agent 会话（绑定默认工作区）
 * 2. 在 Agent 输入框草稿中插入当前 Chat 的引用 token
 * 3. 打开 Agent 会话 Tab，等待用户继续编辑 / 发送
 */

import * as React from 'react'
import { useStore } from 'jotai'
import { Bot, Loader2, ArrowRight } from 'lucide-react'
import { MessageAction } from '@/components/ai-elements/message'
import { Button } from '@/components/ui/button'
import { openAgentWithChatReference } from './open-agent-with-chat-reference'

interface MigrateToAgentButtonProps {
  /** 当前对话 ID */
  conversationId: string
  variant?: 'icon' | 'button'
  className?: string
}

export function MigrateToAgentButton({
  conversationId,
  variant = 'icon',
  className,
}: MigrateToAgentButtonProps): React.ReactElement {
  const store = useStore()
  const [migrating, setMigrating] = React.useState(false)

  const handleMigrate = async (): Promise<void> => {
    if (migrating) return

    setMigrating(true)
    try {
      await openAgentWithChatReference({
        store,
        conversationId,
      })
    } catch (error) {
      console.error('[MigrateToAgentButton] 打开 Agent 引用失败:', error)
    } finally {
      setMigrating(false)
    }
  }

  if (variant === 'button') {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => { void handleMigrate() }}
        disabled={migrating}
        className={className}
      >
        {migrating ? <Loader2 className="size-3.5 animate-spin" /> : <Bot className="size-3.5" />}
        <span>{migrating ? '打开中...' : '在 Agent 中引用'}</span>
        {!migrating && <ArrowRight className="size-3.5" />}
      </Button>
    )
  }

  return (
    <MessageAction
      tooltip={migrating ? '打开中...' : '在 Agent 中引用'}
      onClick={() => { void handleMigrate() }}
      disabled={migrating}
    >
      {migrating ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Bot className="size-3.5" />
      )}
    </MessageAction>
  )
}
