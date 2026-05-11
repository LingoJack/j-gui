import * as React from 'react'
import { AppShell } from './components/app-shell/AppShell'
import { TooltipProvider } from './components/ui/tooltip'
import { APP_SHELL_CONTEXT_VALUE } from './contexts/AppShellContext'

export default function App(): React.ReactElement {
  return (
    <TooltipProvider delayDuration={200}>
      <AppShell contextValue={APP_SHELL_CONTEXT_VALUE} />
    </TooltipProvider>
  )
}
