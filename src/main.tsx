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
          padding: '2rem', fontFamily: 'monospace', zIndex: 9999
        }}>
          <div style={{background: '#1a0000', border: '1px solid #ff4444', borderRadius: 12, padding: '2rem', maxWidth: 700, width: '100%'}}>
            <h1 style={{color: '#ff4444', marginBottom: '1rem', fontSize: '1.25rem'}}>⚠ App Crashed</h1>
            <p style={{color: '#ffaaaa', marginBottom: '0.5rem', fontWeight: 'bold'}}>{this.state.error.message}</p>
            <pre style={{color: '#ff8888', fontSize: '0.7rem', overflow: 'auto', maxHeight: 300, marginTop: '1rem', whiteSpace: 'pre-wrap'}}>{this.state.error.stack}</pre>
            <button onClick={() => window.location.reload()} style={{marginTop: '1.5rem', padding: '0.5rem 1.5rem', background: '#ff4444', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer'}}>Reload</button>
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
