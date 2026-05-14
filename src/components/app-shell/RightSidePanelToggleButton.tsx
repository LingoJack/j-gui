import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Columns2 } from 'lucide-react'
import { agentSidePanelOpenMapAtom, sessionSidePanelOpenAtom } from '@/atoms/agent-atoms'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface RightSidePanelToggleButtonProps {
  sessionId: string
  className?: string
}

export function RightSidePanelToggleButton({
  sessionId,
  className,
}: RightSidePanelToggleButtonProps): React.ReactElement {
  const isPanelOpen = useAtomValue(sessionSidePanelOpenAtom(sessionId))
  const setSidePanelOpenMap = useSetAtom(agentSidePanelOpenMapAtom)
  const label = isPanelOpen ? '关闭右侧工作区' : '打开右侧工作区'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          data-side-panel-open-trigger={sessionId}
          className={cn('h-8 w-8 rounded-xl text-foreground/70 hover:bg-accent hover:text-accent-foreground', className)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setSidePanelOpenMap((prev) => {
              const map = new Map(prev)
              map.set(sessionId, !(map.get(sessionId) ?? true))
              return map
            })
          }}
        >
          <Columns2 className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  )
}
