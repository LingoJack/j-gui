/**
 * AI Elements - 上下文分隔线
 *
 * 虚线分隔 + "清除上下文" 标签 + 撤回按钮。
 * 移植自 proma-frontend 的 ai-elements/context-divider.tsx。
 */

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ComponentProps } from 'react'

export interface ContextDividerProps extends ComponentProps<'div'> {
  /** 分隔线对应的 messageId */
  messageId: string
  /** 删除分隔线的回调 */
  onDelete?: (messageId: string) => void
}

export function ContextDivider({
  messageId,
  onDelete,
  className,
  ...props
}: ContextDividerProps): React.ReactElement {
  return (
    <div
      className={cn(
        'relative flex items-center justify-center py-2',
        className
      )}
      {...props}
    >
      {/* 左侧虚线 */}
      <div className="flex-1 border-t border-dashed border-muted-foreground/30" />

      {/* 中间文字和撤回按钮 */}
      <div className="mx-3 flex items-center gap-1.5 leading-none">
        <span className="text-xs leading-none text-muted-foreground select-none">
          清除上下文
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 rounded-md px-1.5 text-[11px] leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => onDelete?.(messageId)}
          aria-label="撤回清除上下文"
        >
          撤回
        </Button>
      </div>

      {/* 右侧虚线 */}
      <div className="flex-1 border-t border-dashed border-muted-foreground/30" />
    </div>
  )
}
