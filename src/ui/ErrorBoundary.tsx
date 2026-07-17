import {Component} from 'react';
import type {ErrorInfo, ReactNode} from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

/**
 * Catches render-time exceptions so a single bad state (e.g. a malformed
 * imported session) shows a recoverable message instead of a blank white page.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {error: null};

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {error};
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    const {error} = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div className="app-error" role="alert">
        <h1>Something went wrong</h1>
        <p>The tube sheet generator hit an unexpected error and stopped rendering.</p>
        <pre className="app-error__detail">{error.message}</pre>
        <button type="button" className="button primary" onClick={this.handleReload}>
          Reload app
        </button>
      </div>
    );
  }
}
