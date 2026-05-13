import * as React from 'react'
import { cn } from '@/lib/utils'
import { WindowControls } from './WindowControls'

interface WindowControlsHostProps {
  className?: string
}

export function WindowControlsHost({ className }: WindowControlsHostProps): React.ReactElement {
  return (
    <div className={cn('tabbar-bg pointer-events-auto flex h-[34px] items-center rounded-full px-1', className)}>
      <WindowControls className="h-full" />
    </div>
  )
}
