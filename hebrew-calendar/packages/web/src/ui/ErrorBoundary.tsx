import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Catches render-time failures so a single broken component shows a recoverable
 * message instead of leaving the user with a blank page.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-boundary" role="alert">
        <h1>משהו השתבש</h1>
        <p className="muted">אירעה שגיאה בלתי צפויה בממשק. אפשר לרענן את העמוד ולנסות שוב.</p>
        <button className="btn btn-primary btn-md" onClick={() => window.location.reload()}>
          רענון העמוד
        </button>
      </div>
    );
  }
}
