import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorId: null }
  }

  static getDerivedStateFromError() {
    return { hasError: true, errorId: `err_${Date.now()}` }
  }

  componentDidCatch(error, info) {
    // Log error for debugging
    console.error('Application error reference:', this.state.errorId)
    // Sentry integration (add when you sign up at sentry.io):
    // import * as Sentry from '@sentry/react'
    // Sentry.captureException(error, { extra: { errorId: this.state.errorId } })
    //
    // Never send: error.message, error.stack, info.componentStack (may contain PII)
    // Only send: the errorId reference so you can correlate with user reports
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0d1b2a', fontFamily: "'DM Sans', sans-serif",
        }}>
          <div style={{
            textAlign: 'center', maxWidth: 420, padding: '40px 24px',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16,
          }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, color: '#f0ece2', marginBottom: 10 }}>
              Something went wrong
            </div>
            <div style={{ fontSize: 13, color: '#7a93aa', lineHeight: 1.7, marginBottom: 24 }}>
              An unexpected error occurred. Your vault data is safe - this is a display error only.
              Reference: <code style={{ color: '#c9a84c', fontSize: 11 }}>{this.state.errorId}</code>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: '#c9a84c', color: '#0d1b2a', border: 'none',
                  borderRadius: 8, padding: '10px 24px', fontSize: 13,
                  fontFamily: "'DM Sans',sans-serif", cursor: 'pointer', fontWeight: 500,
                }}>
                Reload app
              </button>
              <button
                onClick={() => { this.setState({ hasError: false }); window.location.href = '/' }}
                style={{
                  background: 'transparent', color: '#7a93aa',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8, padding: '10px 24px', fontSize: 13,
                  fontFamily: "'DM Sans',sans-serif", cursor: 'pointer',
                }}>
                Go home
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
