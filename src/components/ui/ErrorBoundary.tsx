import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
  retryCount: number;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error, retryCount: 0 };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      const maxRetries = 3;
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center space-y-3 max-w-sm">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertTriangle size={20} className="text-destructive" />
            </div>
            <p className="text-sm font-medium">页面渲染出错</p>
            <p className="text-xs text-muted-foreground break-all">
              {this.state.error.message}
            </p>
            {this.state.retryCount < maxRetries ? (
              <button
                onClick={() =>
                  this.setState((s) => ({
                    error: null,
                    retryCount: s.retryCount + 1,
                  }))
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-muted hover:bg-accent transition-colors"
              >
                <RefreshCw size={12} />
                重试 ({maxRetries - this.state.retryCount})
              </button>
            ) : (
              <p className="text-xs text-muted-foreground">
                重试次数已用完，请刷新页面
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
