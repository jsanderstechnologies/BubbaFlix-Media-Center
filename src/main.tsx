import {StrictMode, Component, ErrorInfo, ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

class ErrorBoundary extends Component<{children: ReactNode}, {error: Error | null; retryCount: number}> {
  private retryTimer: any = null;

  constructor(props: any) {
    super(props);
    this.state = { error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[ErrorBoundary] Caught transient render error, recovering behind loading screen:', error);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.setState(prev => ({ error: null, retryCount: prev.retryCount + 1 }));
    }, 600);
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  render() {
    if (this.state.error) {
      return (
        <div 
          onClick={() => this.setState({ error: null })}
          style={{
            position: 'fixed', inset: 0, background: '#060609', color: '#fff',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            zIndex: 999999, cursor: 'pointer', fontFamily: 'system-ui, sans-serif'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', textAlign: 'center', padding: '2rem' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{
                width: 64, height: 64, border: '4px solid rgba(239,68,68,0.2)', borderTopColor: '#ef4444',
                borderRadius: '50%', animation: 'spin 1s linear infinite'
              }}></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0, color: '#ffffff' }}>BUBBAFLIX</h1>
              <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.05em', margin: 0 }}>
                Loading Media Center & Syncing Components...
              </p>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
