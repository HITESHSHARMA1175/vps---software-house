import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught error:", error, errorInfo);
  }

  handleReset = () => {
    try {
      sessionStorage.clear();
      localStorage.clear();
    } catch(e) {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#0b0f19',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          fontFamily: 'sans-serif'
        }}>
          <div style={{
            maxWidth: '540px',
            backgroundColor: '#111827',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: '16px',
            padding: '2rem',
            textAlign: 'center'
          }}>
            <h2 style={{ color: '#fda4af', marginTop: 0, fontSize: '1.25rem' }}>Session Interface Notice</h2>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', lineHeight: '1.5' }}>
              {this.state.error?.message || 'An unexpected rendering error occurred.'}
            </p>
            <button
              onClick={this.handleReset}
              style={{
                backgroundColor: '#38bdf8',
                color: '#0f172a',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                fontWeight: '700',
                cursor: 'pointer',
                marginTop: '1rem',
                fontSize: '0.9rem'
              }}
            >
              Clear Session & Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
