import { Component } from 'react';

// Wraps the canvas and the side panel. If either throws while drawing (say, a hand-edited flow the
// builder can't read), this shows a plain message and a way out instead of a blank page. Any new
// flow (`resetKey` changes, e.g. from the top bar's buttons) gets a fresh try.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("Flow builder: this flow can't be shown", error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { onLoadSample, onNewBlank } = this.props;
    return (
      <div role="alert" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 14 }}>Something in this flow can't be shown.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn" onClick={onLoadSample}>Load sample flow</button>
          <button type="button" className="btn ghost" onClick={onNewBlank}>New blank flow</button>
        </div>
      </div>
    );
  }
}
