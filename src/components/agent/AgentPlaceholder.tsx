/**
 * AgentPlaceholder - 未启用 Agent 视图时的静态说明卡片
 */

import * as React from 'react'
import { Bot } from 'lucide-react'

export function AgentPlaceholder(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <Bot size={32} className="text-muted-foreground/60" />
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-lg font-medium text-foreground">Agent 模式</h2>
        <p className="text-sm max-w-[300px]">
          使用 AI Agent 处理复杂任务，支持多步骤推理和工具调用
        </p>
      </div>
      <div className="mt-4 px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
        当前视图未接入
      </div>
    </div>
  )
}
