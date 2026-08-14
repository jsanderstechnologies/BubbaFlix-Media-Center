import { StrictMode, Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import BubbaFlixLogo from './components/BubbaFlixLogo.tsx';
import { Film } from 'lucide-react';

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

    // Auto-recover transient errors behind the loading screen
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
          onClick={() => this.setState({ error: null, retryCount: 0 })}
          className="fixed inset-0 z-[999999] bg-[#060609] flex flex-col items-center justify-center space-y-6 cursor-pointer select-none"
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
