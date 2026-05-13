import * as React from 'react'
import { Brain } from 'lucide-react'
import { useAtom } from 'jotai'
import { thinkingExpandedAtom } from '@/atoms/chat-atoms'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

interface ThinkingModePopoverProps {
  enabled: boolean
  onToggle: () => void
  showExpandedToggle?: boolean
}

export function ThinkingModePopover({
  enabled,
  onToggle,
  showExpandedToggle = false,
}: ThinkingModePopoverProps): React.ReactElement {
  const [thinkingExpanded, setThinkingExpanded] = useAtom(thinkingExpandedAtom)
  const [open, setOpen] = React.useState(false)
  const hoverTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = React.useCallback(() => {
    if (hoverTimeout.current) {
      clearTimeout(hoverTimeout.current)
    }
    setOpen(true)
  }, [])

  const handleMouseLeave = React.useCallback(() => {
    hoverTimeout.current = setTimeout(() => setOpen(false), 150)
  }, [])

  React.useEffect(() => {
    return () => {
      if (hoverTimeout.current) {
        clearTimeout(hoverTimeout.current)
      }
    }
  }, [])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="思考模式"
          aria-pressed={enabled}
          className={cn(
            'size-[36px] rounded-full',
            enabled
              ? 'bg-green-500/10 text-green-600 hover:bg-green-500/15'
              : open
                ? 'bg-foreground/[0.08] text-foreground'
                : 'text-foreground/60 hover:text-foreground',
          )}
          onClick={onToggle}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <Brain className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={8}
        className="w-auto min-w-[160px] p-2 px-2.5"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-foreground/70">思考模式</span>
            <Switch
              checked={enabled}
              onCheckedChange={() => onToggle()}
              className="h-4 w-7 [&>span]:size-3 [&>span]:data-[state=checked]:translate-x-3"
            />
          </div>
          {showExpandedToggle && (
            <>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-foreground/70">展开思考</span>
                <Switch
                  checked={thinkingExpanded}
                  onCheckedChange={setThinkingExpanded}
                  className="h-4 w-7 [&>span]:size-3 [&>span]:data-[state=checked]:translate-x-3"
                />
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
