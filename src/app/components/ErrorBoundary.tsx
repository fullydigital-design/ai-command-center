// ============================================================
// Global Error Boundary — catches render crashes per-route
// ============================================================
// Wraps each lazy-loaded page so a crash in one page doesn't
// nuke the entire app. Shows a styled recovery card.
// ============================================================

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const msg = this.state.error?.message || "Unknown error";

    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div
          className="max-w-md w-full rounded-xl border p-6 space-y-4"
          style={{
            background: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          {/* Icon */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(239,68,68,0.15)" }}
            >
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h2 className="text-foreground" style={{ fontSize: 16 }}>
                Something went wrong
              </h2>
              <p className="text-muted-foreground text-[13px]">
                This page crashed — the rest of the app is fine.
              </p>
            </div>
          </div>

          {/* Error detail */}
          <pre
            className="text-[11px] p-3 rounded-lg overflow-auto max-h-[120px]"
            style={{
              background: "var(--secondary)",
              color: "var(--destructive)",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {msg}
          </pre>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={this.handleRetry}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors"
              style={{
                background: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
            <button
              onClick={this.handleGoHome}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors border"
              style={{
                background: "transparent",
                color: "var(--foreground)",
                borderColor: "var(--border)",
              }}
            >
              <Home className="w-4 h-4" />
              Home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
