import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
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

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <main className="page-shell">
          <section className="panel page-panel">
            <div
              style={{
                display: "flex", flexDirection: "column", gap: "12px",
                padding: "40px 20px", alignItems: "center", justifyContent: "center"
              }}
              className="result-empty-state"
            >
              <strong style={{ fontSize: "15px", color: "#ef4444" }}>页面渲染异常</strong>
              <p style={{ fontSize: "13px", color: "#94a3b8", maxWidth: "400px", textAlign: "center", margin: 0, wordBreak: "break-all" }}>
                {this.state.error?.message || "未知错误"}
              </p>
              <button
                onClick={this.handleRetry}
                style={{
                  marginTop: "8px", padding: "6px 20px", cursor: "pointer",
                  border: "1px solid #e2e8f0", borderRadius: "6px",
                  background: "#fff", color: "#334155", fontSize: "13px"
                }}
              >
                重试
              </button>
            </div>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
