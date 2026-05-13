/**
 * SettingsDialog - 设置浮窗（带 ErrorBoundary 便于调试）
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { settingsOpenAtom } from '@/atoms/settings-tab'
import { SettingsPanel } from './SettingsPanel'

class SettingsErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[SettingsDialog] Render crash:', error.message)
    console.error('[SettingsDialog] Component stack:', info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6 text-sm">
          <h3 className="text-red-500 font-medium mb-2">Settings Error</h3>
          <pre className="text-muted-foreground text-xs whitespace-pre-wrap">
            {this.state.error.message}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

export function SettingsDialog(): React.ReactElement {
  const [open, setOpen] = useAtom(settingsOpenAtom)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[100] bg-black/20 titlebar-no-drag transition-opacity duration-100 data-[state=open]:opacity-100 data-[state=closed]:opacity-0"
        />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-[100] translate-x-[-50%] translate-y-[-50%] w-[85vw] max-w-[992px] h-[85vh] max-h-[752px] bg-dialog text-dialog-foreground shadow-2xl rounded-xl overflow-hidden titlebar-no-drag transition-all duration-100 data-[state=open]:opacity-100 data-[state=open]:scale-100 data-[state=closed]:opacity-0 data-[state=closed]:scale-[0.98]"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">设置</DialogPrimitive.Title>
          <SettingsErrorBoundary>
            <SettingsPanel onClose={() => setOpen(false)} />
          </SettingsErrorBoundary>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
