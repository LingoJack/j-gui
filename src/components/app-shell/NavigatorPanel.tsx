/**
 * NavigatorPanel - 用于列表导航的中间面板
 * 展示带标题的头部和可滚动内容区
 */

import * as React from 'react'
import { Panel } from './Panel'
import { PanelHeader } from './PanelHeader'

export interface NavigatorPanelProps {
  /** 面板标题 */
  title: string
  /** 面板宽度（像素） */
  width: number
  /** 主要内容 */
  children: React.ReactNode
}

export function NavigatorPanel({
  title,
  width,
  children,
}: NavigatorPanelProps): React.ReactElement {
  return (
    <Panel variant="shrink" width={width} className="bg-background border-r border-border">
      <PanelHeader title={title} />
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </Panel>
  )
}
