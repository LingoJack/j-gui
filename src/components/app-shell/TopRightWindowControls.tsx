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
    <div className={cn('pointer-events-none absolute top-3 right-4 z-[70] flex justify-end', className)}>
      <WindowControlsHost />
    </div>
  )
}
