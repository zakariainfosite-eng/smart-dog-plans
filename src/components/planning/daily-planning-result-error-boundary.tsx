import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  scope: string;
};

type State = { error: Error | null };

/**
 * Temporary diagnostics: logs exact render failures after planning generation.
 */
export class DailyPlanningResultErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[daily-planning][RENDER_CRASH] scope=${this.props.scope}`, {
      name: error.name,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
    if (typeof window !== "undefined") {
      (window as unknown as { __CYNO_LAST_DAILY_PLANNING_RENDER_ERROR__?: unknown }).__CYNO_LAST_DAILY_PLANNING_RENDER_ERROR__ =
        {
          scope: this.props.scope,
          message: error.message,
          stack: error.stack,
          componentStack: info.componentStack,
          at: new Date().toISOString(),
        };
    }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"
          data-testid="daily-planning-render-diagnostics"
        >
          <p className="font-semibold text-destructive">
            [daily-planning] Erreur de rendu ({this.props.scope})
          </p>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs">
            {this.state.error.stack ?? this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
