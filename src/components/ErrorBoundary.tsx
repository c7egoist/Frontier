import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in component tree:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-[#0a0d14] p-6 text-slate-200">
          <div className="max-w-lg w-full bg-[#161f30] border border-rose-500/50 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <h2 className="text-base font-bold tracking-wide">Procedural Generator Notice</h2>
            </div>
            
            <p className="text-xs text-slate-300">
              {this.state.error?.message || "An unexpected rendering event occurred."}
            </p>

            {this.state.error?.stack && (
              <pre className="text-[10px] font-mono bg-black/60 p-3 rounded-lg overflow-x-auto text-slate-400 max-h-40 border border-slate-800">
                {this.state.error.stack}
              </pre>
            )}

            <button
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
                window.location.reload();
              }}
              className="flex items-center justify-center gap-2 w-full py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-lg"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Procedural Studio
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
