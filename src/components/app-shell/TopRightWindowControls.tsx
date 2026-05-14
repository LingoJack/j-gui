import * as React from 'react'
import { cn } from '@/lib/utils'
import { WindowControlsHost } from './WindowControlsHost'

interface TopRightWindowControlsProps {
  className?: string
}

export function TopRightWindowControls({
  className,
}: TopRightWindowControlsProps): React.ReactElement {
  return (
    <div
      data-window-controls-host="true"
      className={cn('pointer-events-none absolute top-2 right-4 z-[140] flex justify-end', className)}
    >
      <WindowControlsHost />
    </div>
  )
}
