import * as React from 'react'

export interface AppShellContextType {
}

export const APP_SHELL_CONTEXT_VALUE: AppShellContextType = {}

const AppShellContext = React.createContext<AppShellContextType | undefined>(undefined)

export function AppShellProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: AppShellContextType
}): React.ReactElement {
  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>
}

export function useAppShellContext(): AppShellContextType {
  const context = React.useContext(AppShellContext)
  if (context === undefined) {
    throw new Error('useAppShellContext must be used within AppShellProvider')
  }
  return context
}
