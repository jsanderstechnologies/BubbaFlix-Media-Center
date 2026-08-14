import { StrictMode, Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import BubbaFlixLogo from './components/BubbaFlixLogo.tsx';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; retryCount: number }> {
  private retryTimer: any = null;

  constructor(props: any) {
    super(props);
    this.state = { error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary caught error]', error, info.componentStack);
    
    try {
      fetch('/api/logs/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'error',
          message: `[ErrorBoundary] ${error?.message || String(error)}`,
          stack: info?.componentStack || error?.stack || '',
          url: typeof window !== 'undefined' ? window.location.href : ''
        })
      }).catch(() => {});
    } catch (e) {}

    if (this.state.retryCount < 3) {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => {
        this.setState(prev => ({ error: null, retryCount: prev.retryCount + 1 }));
      }, 800);
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  render() {
    if (this.state.error) {
      return (
        <div 
          onClick={() => this.setState({ error: null, retryCount: 0 })}
          className="fixed inset-0 bg-[#060609] text-white flex flex-col items-center justify-center p-6 z-[999999] cursor-pointer select-none"
        >
          <div className="flex flex-col items-center gap-6 text-center max-w-md">
            <BubbaFlixLogo className="w-64 h-20 animate-pulse" idPrefix="main-error-logo" />
            <div className="w-12 h-12 border-4 border-red-600/20 border-t-red-600 rounded-full animate-spin"></div>
            <div className="space-y-2">
              <p className="text-sm font-mono text-white/70 tracking-wider">
                Loading Media Center & Syncing Components...
              </p>
              {this.state.retryCount >= 3 && (
                <p className="text-xs text-red-400 font-mono bg-red-950/40 border border-red-500/20 px-3 py-2 rounded-lg mt-3">
                  Click anywhere to reload & recover Media Center session
                </p>
              )}
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
