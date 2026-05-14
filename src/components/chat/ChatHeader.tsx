/**
 * ChatHeader - 对话头部
 *
 * 显示对话标题（可点击编辑）+ 置顶按钮 + 右侧工作区侧栏开关。
 */

import * as React from 'react'
import { useSetAtom } from 'jotai'
import { Pencil, Check, X, Pin } from 'lucide-react'
import { conversationsAtom } from '@/atoms/chat-atoms'
import type { ConversationMeta } from '@jgui/shared'
import { SystemPromptSelector } from './SystemPromptSelector'
import { MigrateToAgentButton } from './MigrateToAgentButton'
import { RightSidePanelToggleButton } from '@/components/app-shell/RightSidePanelToggleButton'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import * as ipc from '@/lib/ipc'

interface ChatHeaderProps {
  conversation: ConversationMeta | null
  canMigrateToAgent?: boolean
}

export function ChatHeader({
  conversation,
  canMigrateToAgent = false,
}: ChatHeaderProps): React.ReactElement | null {
  const setConversations = useSetAtom(conversationsAtom)
  const [editing, setEditing] = React.useState(false)
  const [editTitle, setEditTitle] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  if (!conversation) return null

  /** 进入编辑模式 */
  const startEdit = (): void => {
    setEditTitle(conversation.title)
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  /** 保存标题 */
  const saveTitle = async (): Promise<void> => {
    const trimmed = editTitle.trim()
    if (!trimmed || trimmed === conversation.title) {
      setEditing(false)
      return
    }

    try {
      const updated = await ipc.updateConversationTitle(conversation.id, trimmed)
      setConversations((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      )
    } catch (error) {
      console.error('[ChatHeader] 更新标题失败:', error)
    }
    setEditing(false)
  }

  /** 键盘事件 */
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveTitle()
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  return (
    <div className="relative z-[51] flex items-center gap-2 px-4 h-[48px] titlebar-drag-region">
      {editing ? (
        <div className="flex items-center gap-1.5 flex-1 min-w-0 titlebar-no-drag">
          <input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={saveTitle}
            className="flex-1 bg-transparent text-sm font-medium border-b border-primary/50 outline-none px-0 py-0.5 min-w-0"
            maxLength={100}
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={saveTitle}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Check className="size-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setEditing(false)}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="truncate text-sm font-medium text-foreground">
            {conversation.title}
          </span>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={startEdit}
            className="titlebar-no-drag p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="编辑标题"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      )}

      {/* 右侧按钮组 */}
      <div className="flex items-center gap-1 titlebar-no-drag ml-auto">
        <SystemPromptSelector />
        {canMigrateToAgent && (
          <MigrateToAgentButton
            conversationId={conversation.id}
            variant="headerIcon"
            className="h-8 w-8 rounded-xl text-foreground/70 hover:bg-accent hover:text-accent-foreground"
          />
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={conversation.pinned ? '取消置顶' : '置顶对话'}
              onMouseDown={(event) => event.preventDefault()}
              className={cn(
                'h-8 w-8 rounded-xl text-foreground/70 hover:bg-accent hover:text-accent-foreground',
                conversation.pinned && 'bg-accent text-accent-foreground',
              )}
              onClick={async () => {
                const updated = await ipc.togglePinConversation(conversation.id)
                setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
              }}
            >
              <Pin className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>{conversation.pinned ? '取消置顶' : '置顶对话'}</p></TooltipContent>
        </Tooltip>
        <RightSidePanelToggleButton sessionId={conversation.id} />
      </div>
    </div>
  )
}
