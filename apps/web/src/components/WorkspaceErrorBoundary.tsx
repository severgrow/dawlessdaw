import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  workspace: string;
  onReset: () => void;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Keeps StatusBar / Nav / DeviceStrip mounted if a workspace throws
 * (e.g. React #185 from an uncached useSyncExternalStore snapshot).
 */
export class WorkspaceErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[workspace:${this.props.workspace}]`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props): void {
    if (prev.workspace !== this.props.workspace && this.state.error) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="section-enter" role="alert">
        <div className="page-head">
          <h1>workspace error</h1>
        </div>
        <p className="lead">
          The <b>{this.props.workspace}</b> tab crashed. The rest of dawless/daw MIDI Brain is still
          up — pick another tab or reset.
        </p>
        <p className="muted mono small">{this.state.error.message}</p>
        <div className="row">
          <button type="button" onClick={() => this.setState({ error: null })}>
            Retry tab
          </button>
          <button type="button" onClick={this.props.onReset}>
            Back to Rig
          </button>
        </div>
      </div>
    );
  }
}
