import { StrictMode, Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import BubbaFlixLogo from './components/BubbaFlixLogo.tsx';
import { Film, RefreshCw, RotateCcw } from 'lucide-react';

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
    
    // Automatically log every component render error to the backend app.log file
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

    // Auto-recover transient errors max 1 time behind the loading screen
    if (this.state.retryCount < 1) {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => {
        this.setState(prev => ({ error: null, retryCount: prev.retryCount + 1 }));
      }, 600);
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  render() {
    if (this.state.error && this.state.retryCount >= 1) {
      return (
        <div 
          className="fixed inset-0 z-[999999] bg-[#060609] flex flex-col items-center justify-center space-y-6 select-none p-6 text-center"
        >
          <div className="relative flex items-center justify-center">
            <div className="w-16 h-16 border-4 border-red-600/20 border-t-red-600 rounded-full animate-spin"></div>
            <Film className="w-7 h-7 text-red-500 absolute" />
          </div>
          <div className="text-center space-y-3 flex flex-col items-center max-w-lg">
            <BubbaFlixLogo className="w-64 h-20 animate-pulse" idPrefix="main-error-logo" />
            <p className="text-sm font-mono text-red-400 font-semibold bg-red-950/60 border border-red-500/30 px-4 py-2 rounded-xl">
              {this.state.error.message || 'Media Center Render Error'}
            </p>
            <p className="text-xs text-white/50">
              An unexpected render error occurred. Click Retry or Reset App Cache to restore the interface.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => this.setState({ error: null, retryCount: 0 })}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg cursor-pointer flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry Loading</span>
              </button>
              <button
                onClick={() => {
                  try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
                  window.location.reload();
                }}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset Cache & Reload</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (this.state.error) {
      return (
        <div 
          className="fixed inset-0 z-[999999] bg-[#060609] flex flex-col items-center justify-center space-y-6 select-none"
        >
          <div className="relative flex items-center justify-center">
            <div className="w-16 h-16 border-4 border-red-600/20 border-t-red-600 rounded-full animate-spin"></div>
            <Film className="w-7 h-7 text-red-500 absolute" />
          </div>
          <div className="text-center space-y-3 flex flex-col items-center">
            <BubbaFlixLogo className="w-64 h-20 animate-pulse" idPrefix="main-error-logo" />
            <p className="text-xs font-mono text-white/50 tracking-wider animate-pulse">
              Loading Media Center & Syncing Components...
            </p>
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
