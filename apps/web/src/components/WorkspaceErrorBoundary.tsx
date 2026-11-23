import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Short label for the panel (tab name or "Rig art"). */
  workspace: string;
  onReset: () => void;
  children: ReactNode;
}

interface State {
  error: Error | null;
  copied: boolean;
}

/**
 * Keeps StatusBar / Nav / DeviceStrip mounted if a panel throws
 * (e.g. React #185 from an uncached useSyncExternalStore snapshot).
 */
export class WorkspaceErrorBoundary extends Component<Props, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, copied: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[panel:${this.props.workspace}]`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props): void {
    if (prev.workspace !== this.props.workspace && this.state.error) {
      this.setState({ error: null, copied: false });
    }
  }

  private copyError = async (): Promise<void> => {
    const err = this.state.error;
    if (!err) return;
    const text = `${err.name}: ${err.message}\n\n${err.stack ?? '(no stack)'}`;
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
    } catch {
      // Clipboard may be blocked — leave copied false
    }
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="section-enter panel-error" role="alert">
        <div className="page-head">
          <h1>This panel hit a problem</h1>
        </div>
        <p className="lead">
          <b>{this.props.workspace}</b> crashed. The rest of Splot MIDI Brain is still up — pick
          another tab or retry.
        </p>
        <pre className="muted mono small panel-error-stack">{this.state.error.message}</pre>
        <div className="row">
          <button type="button" onClick={() => this.setState({ error: null, copied: false })}>
            Retry
          </button>
          <button type="button" className="ghost" onClick={() => void this.copyError()}>
            {this.state.copied ? 'Copied' : 'Copy error'}
          </button>
          <button type="button" className="ghost" onClick={this.props.onReset}>
            Back to Rig
          </button>
        </div>
      </div>
    );
  }
}
