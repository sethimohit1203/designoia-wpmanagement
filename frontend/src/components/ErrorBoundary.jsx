import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center space-y-3">
            <div className="text-4xl">⚠️</div>
            <h1 className="text-lg font-bold text-gray-800">Something went wrong</h1>
            <p className="text-sm text-gray-500">
              {this.state.error?.message || 'The page hit an unexpected error.'}
            </p>
            <p className="text-xs text-gray-400">
              This often means the backend is unreachable. Check the connection and try again.
            </p>
            <button
              className="btn-primary mt-2"
              onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
