import * as React from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'

interface TabErrorBoundaryProps {
  sessionId: string
  children: React.ReactNode
}

interface TabErrorBoundaryState {
  hasError: boolean
  errorMessage: string
  retryKey: number
}

export class TabErrorBoundary extends React.Component<
  TabErrorBoundaryProps,
  TabErrorBoundaryState
> {
  constructor(props: TabErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, errorMessage: '', retryKey: 0 }
  }

  static getDerivedStateFromError(error: unknown): TabErrorBoundaryState {
    const msg = error instanceof Error ? error.message : String(error)
    return { hasError: true, errorMessage: msg, retryKey: 0 }
  }

  override componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('[TabErrorBoundary] 渲染异常:', error, info.componentStack)
  }

  private handleReset = (): void => {
    this.setState((prev) => ({ hasError: false, errorMessage: '', retryKey: prev.retryKey + 1 }))
  }

  override render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 text-muted-foreground">
          <AlertTriangle className="size-10 text-destructive/60" />
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-foreground">页面渲染出错</p>
            <p className="text-xs text-muted-foreground max-w-xs break-all">
              {this.state.errorMessage}
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-accent transition-colors"
          >
            <RotateCw className="size-3.5" />
            重新加载
          </button>
        </div>
      )
    }
    return (
      <div key={this.state.retryKey} className="flex h-full min-h-0 flex-1 flex-col">
        {this.props.children}
      </div>
    )
  }
}
