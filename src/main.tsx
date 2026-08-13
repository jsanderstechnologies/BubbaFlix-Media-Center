import {StrictMode, Component, ErrorInfo, ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

class ErrorBoundary extends Component<{children: ReactNode}, {error: Error | null}> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React crash:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          position: 'fixed', inset: 0, background: '#050507', color: '#fff',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '2rem', fontFamily: 'system-ui, sans-serif', zIndex: 9999
        }}>
          <div style={{background: '#14080e', border: '1px solid #ef4444', borderRadius: 16, padding: '2rem', maxWidth: 700, width: '100%', boxShadow: '0 20px 50px rgba(239,68,68,0.3)'}}>
            <h1 style={{color: '#ef4444', marginBottom: '0.75rem', fontSize: '1.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>⚠ Application Recovered</h1>
            <p style={{color: '#fca5a5', marginBottom: '0.5rem', fontWeight: 'bold'}}>{this.state.error.message}</p>
            {this.state.error.stack && (
              <pre style={{color: '#f87171', fontSize: '0.75rem', overflow: 'auto', maxHeight: 220, marginTop: '1rem', padding: '1rem', background: '#000000', borderRadius: 8, whiteSpace: 'pre-wrap', fontFamily: 'monospace'}}>{this.state.error.stack}</pre>
            )}
            <div style={{marginTop: '1.5rem', display: 'flex', gap: '0.75rem'}}>
              <button 
                onClick={() => this.setState({ error: null })} 
                style={{padding: '0.75rem 1.5rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 'bold', cursor: 'pointer'}}
              >
                Try Again
              </button>
              <button 
                onClick={() => window.location.reload()} 
                style={{padding: '0.75rem 1.5rem', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 12, fontWeight: 'bold', cursor: 'pointer'}}
              >
                Reload Page
              </button>
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
