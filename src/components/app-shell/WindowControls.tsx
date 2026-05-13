import * as React from 'react'
import { Minus, Square, X } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { detectIsMac, detectIsWindows } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { hideMainAppWindow } from '@/lib/window-presence'

interface WindowControlsProps {
  className?: string
}

export function WindowControls({ className }: WindowControlsProps): React.ReactElement | null {
  const isWindows = React.useMemo(() => detectIsWindows(), [])
  const isMac = React.useMemo(() => detectIsMac(), [])
  const hasTauriWindow = React.useMemo(() => hasTauriWindowContext(), [])
  const [isMaximized, setIsMaximized] = React.useState(false)
  const appWindowRef = React.useRef<ReturnType<typeof getCurrentWindow> | null>(null)
  const maximizeReadVersionRef = React.useRef(0)

  React.useEffect(() => {
    if (!isWindows || !hasTauriWindow) return
    try {
      appWindowRef.current = getCurrentWindow()
    } catch {
      appWindowRef.current = null
    }
  }, [hasTauriWindow, isWindows])

  React.useEffect(() => {
    if (!isWindows || !hasTauriWindow) return

    let dispose: (() => void) | null = null
    let cancelled = false
    const appWindow = appWindowRef.current
    if (!appWindow) return

    const syncMaximizedState = async (): Promise<void> => {
      const requestVersion = maximizeReadVersionRef.current + 1
      maximizeReadVersionRef.current = requestVersion
      const value = await appWindow.isMaximized()
      if (!cancelled && requestVersion === maximizeReadVersionRef.current) {
        setIsMaximized(value)
      }
    }

    void syncMaximizedState()
    void appWindow.onResized(() => {
      void syncMaximizedState()
    }).then((unlisten) => {
      if (cancelled) {
        unlisten()
        return
      }
      dispose = unlisten
    })

    return () => {
      cancelled = true
      dispose?.()
    }
  }, [hasTauriWindow, isWindows])

  if (!isWindows || isMac || !hasTauriWindow) return null

  return (
    <div
      className={cn(
        'flex h-full items-center justify-end gap-0.5 titlebar-no-drag',
        className,
      )}
    >
        <WindowControlButton
          ariaLabel="最小化窗口"
          onClick={() => {
            const appWindow = appWindowRef.current
            if (appWindow) {
              void appWindow.minimize()
            }
          }}
        >
          <Minus className="size-3.5" />
        </WindowControlButton>
        <WindowControlButton
          ariaLabel={isMaximized ? '还原窗口' : '最大化窗口'}
          onClick={() => {
            const appWindow = appWindowRef.current
            if (appWindow) {
              setIsMaximized((prev) => !prev)
              void appWindow.toggleMaximize()
            }
          }}
        >
          <Square className="size-3.5" />
        </WindowControlButton>
        <WindowControlButton
          ariaLabel="关闭窗口"
          onClick={() => {
            void hideMainAppWindow()
          }}
        >
          <X className="size-3.5" />
        </WindowControlButton>
    </div>
  )
}

interface WindowControlButtonProps {
  ariaLabel: string
  children: React.ReactNode
  danger?: boolean
  onClick: () => void
}

function WindowControlButton({
  ariaLabel,
  children,
  onClick,
}: WindowControlButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={cn(
        'flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full bg-transparent text-foreground/70 transition-colors',
        'hover:bg-foreground/[0.06] hover:text-foreground',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function hasTauriWindowContext(): boolean {
  if (typeof window === 'undefined') return false
  const tauriWindow = window as Window & {
    __TAURI_INTERNALS__?: {
      metadata?: {
        currentWindow?: {
          label?: string
        }
      }
    }
  }
  return typeof tauriWindow.__TAURI_INTERNALS__?.metadata?.currentWindow?.label === 'string'
}
