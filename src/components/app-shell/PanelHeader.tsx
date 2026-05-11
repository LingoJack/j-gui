/**
 * PanelHeader - 面板头部组件
 * 展示标题和可选操作按钮
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface PanelHeaderProps {
  /** 面板标题 */
  title: string
  /** 可选操作按钮 */
  actions?: React.ReactNode
  /** 可选 className */
  className?: string
}

export function PanelHeader({ title, actions, className }: PanelHeaderProps): React.ReactElement {
  return (
    <div className={cn('flex items-center justify-between px-4 py-3 border-b border-border', className)}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
