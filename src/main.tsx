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
        <div className="fixed inset-0 bg-[#060609] text-white flex flex-col items-center justify-center p-6 z-[999999] select-none font-sans">
          <div className="flex flex-col items-center gap-6 text-center max-w-xl w-full">
            <BubbaFlixLogo className="w-64 h-20 animate-pulse" idPrefix="main-error-logo" />
            <div className="w-10 h-10 border-4 border-red-600/20 border-t-red-600 rounded-full animate-spin"></div>
            
            <div className="space-y-3 w-full text-left bg-red-950/70 border border-red-500/40 rounded-2xl p-5 shadow-2xl backdrop-blur-md">
              <h2 className="text-red-400 font-bold text-base flex items-center gap-2">
                <span>⚠️</span> Component Render Error
              </h2>
              <p className="text-xs text-white/90 font-mono bg-black/60 p-3 rounded-lg border border-white/10 break-all select-text font-bold">
                {this.state.error?.message || String(this.state.error)}
              </p>
              {this.state.error?.stack && (
                <details className="text-[11px] font-mono text-white/60 cursor-pointer">
                  <summary className="hover:text-white transition-colors py-1">View Error Stack Trace</summary>
                  <pre className="mt-2 p-3 bg-black/80 rounded-lg overflow-x-auto text-[10px] text-red-300 max-h-40 leading-relaxed">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  this.setState({ error: null, retryCount: 0 });
                }}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-xl shadow-lg transition-all"
              >
                Try Again
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem('authUser');
                    localStorage.removeItem('authToken');
                  } catch(e) {}
                  window.location.reload();
                }}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all transform active:scale-95"
              >
                Reload Media Center
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
