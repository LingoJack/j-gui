/**
 * AgentHeader — Agent 会话头部
 *
 * 显示会话标题（可点击编辑）。
 * 参照 ChatHeader 的编辑模式。
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { BookOpen, Bot, Check, Pencil, Pin, X } from 'lucide-react'
import {
  agentSessionsAtom,
} from '@/atoms/agent-atoms'
import { promptSidebarOpenAtom } from '@/atoms/system-prompt-atoms'
import { RightSidePanelToggleButton } from '@/components/app-shell/RightSidePanelToggleButton'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import * as ipc from '@/lib/ipc'

/** AgentHeader 属性接口 */
interface AgentHeaderProps {
  sessionId: string
}

export function AgentHeader({ sessionId }: AgentHeaderProps): React.ReactElement | null {
  const sessions = useAtomValue(agentSessionsAtom)
  const session = sessions.find((s) => s.id === sessionId) ?? null
  const setAgentSessions = useSetAtom(agentSessionsAtom)
  const setPromptSidebarOpen = useSetAtom(promptSidebarOpenAtom)
  const [editing, setEditing] = React.useState(false)
  const [editTitle, setEditTitle] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  if (!session) return null

  /** 进入编辑模式 */
  const startEdit = (): void => {
    setEditTitle(session.title)
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  /** 保存标题 */
  const saveTitle = async (): Promise<void> => {
    const trimmed = editTitle.trim()
    if (!trimmed || trimmed === session.title) {
      setEditing(false)
      return
    }

    try {
      await ipc.updateAgentSessionTitle(session.id, trimmed)
      // 刷新会话列表以同步侧边栏
      const sessions = await ipc.listAgentSessions()
      setAgentSessions(sessions)
    } catch (error) {
      console.error('[AgentHeader] 更新标题失败:', error)
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

  const togglePin = async (): Promise<void> => {
    try {
      const updated = await ipc.togglePinAgentSession(session.id)
      setAgentSessions((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    } catch (error) {
      console.error('[AgentHeader] 置顶状态更新失败:', error)
    }
  }

  const headerButtonClass = 'h-8 w-8 rounded-xl text-foreground/70 hover:bg-accent hover:text-accent-foreground'

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
        <>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="truncate text-sm font-medium text-foreground">
              {session.title}
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
          <div className="ml-auto flex items-center gap-1 titlebar-no-drag">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="提示词"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setPromptSidebarOpen(true)}
                  className={headerButtonClass}
                >
                  <BookOpen className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>提示词</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="在 Chat 中引用"
                    disabled
                    className={cn(headerButtonClass, 'opacity-60')}
                  >
                    <Bot className="size-4" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>Agent 到 Chat 引用暂未接入</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={session.pinned ? '取消置顶' : '置顶会话'}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => { void togglePin() }}
                  className={cn(headerButtonClass, session.pinned && 'bg-accent text-accent-foreground')}
                >
                  <Pin className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>{session.pinned ? '取消置顶' : '置顶会话'}</p></TooltipContent>
            </Tooltip>
            <RightSidePanelToggleButton
              sessionId={sessionId}
              className={headerButtonClass}
            />
          </div>
        </>
      )}
    </div>
  )
}
