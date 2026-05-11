/**
 * Panel - 应用面板的基础容器组件
 * 为面板容器提供一致的样式封装
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface PanelProps {
  /** 面板尺寸行为 */
  variant?: 'shrink' | 'grow'
  /** 固定宽度（像素，仅 shrink 变体使用） */
  width?: number
  /** 可选 className，用于补充样式 */
  className?: string
  /** 可选内联样式 */
  style?: React.CSSProperties
  /** 面板内容 */
  children: React.ReactNode
}

/**
 * 带统一样式的基础面板容器
 */
export function Panel({
  variant = 'grow',
  width,
  className,
  style,
  children,
}: PanelProps): React.ReactElement {
  return (
    <div
      className={cn(
        // 所有面板共享的基础样式
        'h-full flex flex-col min-w-0 overflow-hidden',
        // 各变体专属样式
        variant === 'grow' && 'flex-1',
        variant === 'shrink' && 'shrink-0',
        className
      )}
      style={{
        ...(variant === 'shrink' && width ? { width } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  )
}
