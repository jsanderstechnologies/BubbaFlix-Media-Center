
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User, Mail, Lock, UserPlus, LogIn } from 'lucide-react';

export interface AuthUser {
  uid: string;
  email: string | null;
  username: string | null;
  role?: string;
}

// Global state to avoid prop drilling for Auth
let globalUser: AuthUser | null = null;
let globalSetUser: ((u: AuthUser | null) => void)[] = [];

export function useAuth() {
  const [user, setUserState] = useState<AuthUser | null>(globalUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    globalSetUser.push(setUserState);
    
    const token = localStorage.getItem('authToken');
    if (!token) {
      setLoading(false);
      return;
    }

    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          globalUser = data.user;
          globalSetUser.forEach(fn => fn(data.user));
        } else {
          localStorage.removeItem('authToken');
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    return () => {
      globalSetUser = globalSetUser.filter(fn => fn !== setUserState);
    };
  }, []);

  const login = (user: AuthUser, token: string) => {
    localStorage.setItem('authToken', token);
    globalUser = user;
    globalSetUser.forEach(fn => fn(user));
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    globalUser = null;
    globalSetUser.forEach(fn => fn(null));
  };

  return { user, loading, login, logout };
}

export function AuthModal() {
  const { user, loading, login } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [firstAdminPassword, setFirstAdminPassword] = useState<string | null>(null);

  if (loading || user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    // Registration no longer sends a password — server generates one on approval
    const body = isLogin ? { email, password } : { email, username };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');
      
      if (data.pending) {
        setPendingApproval(true);
        return;
      }

      // First-ever user: server auto-approves and returns a generated password
      if (data.firstUser && data.generatedPassword) {
        // Store in sessionStorage so App.tsx can display it as a one-time banner
        sessionStorage.setItem('firstAdminPassword', data.generatedPassword);
        login(data.user, data.token);
        return;
      }

      login(data.user, data.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Pending approval screen
  if (pendingApproval) {
    return (
      <div className="fixed inset-0 z-[999] bg-black flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-900/20 to-black pointer-events-none" />
        <div className="bg-zinc-900/80 backdrop-blur-xl border border-amber-500/20 rounded-2xl p-8 w-full max-w-md relative z-10 shadow-2xl text-center">
          <div className="flex justify-center mb-6">
            <svg width="240" height="70" viewBox="0 0 320 80" className="drop-shadow-2xl overflow-visible">
              <defs>
                <path id="bubbaflix-curve-pending" d="M 12,56 Q 160,20 308,56" fill="none" />
                <linearGradient id="bubbaflix-gradient-pending" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ff1a1a" />
                  <stop offset="100%" stopColor="#4d0000" />
                </linearGradient>
              </defs>
              <text fontFamily="'Bebas Neue', Impact, sans-serif" fontSize="56" fontWeight="900" letterSpacing="2"
                fill="url(#bubbaflix-gradient-pending)" stroke="url(#bubbaflix-gradient-pending)" strokeWidth="1.5">
                <textPath href="#bubbaflix-curve-pending" startOffset="50%" textAnchor="middle">BUBBAFLIX</textPath>
              </text>
            </svg>
          </div>
          <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-white mb-3 tracking-tight">Awaiting Approval</h2>
          <p className="text-white/50 text-sm leading-relaxed mb-6">
            Your account has been created and is pending review by an administrator.
            You'll be able to sign in once your account is approved.
          </p>
          <button
            onClick={() => { setPendingApproval(false); setIsLogin(true); }}
            className="text-white/40 hover:text-white text-sm transition-colors"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[999] bg-black flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/20 to-black pointer-events-none" />
      <div className="bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 w-full max-w-md relative z-10 shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="font-['Bebas_Neue'] text-4xl text-red-600 select-none flex items-center justify-center leading-none tracking-tighter" style={{ WebkitTextStroke: '1px black', textShadow: '0 2px 4px rgba(0,0,0,0.6)' }}>
            <svg width="240" height="70" viewBox="0 0 320 80" className="drop-shadow-2xl overflow-visible">
              <defs>
                <path id="bubbaflix-curve-auth" d="M 12,56 Q 160,20 308,56" fill="none" />
                <linearGradient id="bubbaflix-gradient-auth" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ff1a1a" />
                  <stop offset="40%" stopColor="#e60000" />
                  <stop offset="80%" stopColor="#990000" />
                  <stop offset="100%" stopColor="#4d0000" />
                </linearGradient>
                <filter id="bubbaflix-glow-auth" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="8" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              <text 
                fontFamily="'Bebas Neue', Impact, sans-serif" 
                fontSize="56" 
                fontWeight="900" 
                letterSpacing="2"
                fill="url(#bubbaflix-gradient-auth)"
                stroke="url(#bubbaflix-gradient-auth)"
                strokeWidth="1.5"
                className="drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]"
                style={{ textShadow: '0 8px 16px rgba(220,0,0,0.4)' }}
                filter="url(#bubbaflix-glow-auth)"
              >
                <textPath href="#bubbaflix-curve-auth" startOffset="50%" textAnchor="middle">
                  BUBBAFLIX
                </textPath>
              </text>
            </svg>
          </div>
        </div>
        <h2 className="text-3xl font-black text-white mb-2 text-center tracking-tight">
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </h2>
        <p className="text-white/50 text-center mb-8">
          {isLogin ? 'Sign in to access your media center.' : 'Register to save your favorites and settings.'}
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl mb-6 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
            <input 
              type="text" 
              placeholder="Email Address or Username" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-white/30 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
              required
            />
          </div>

          {!isLogin && (
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
              <input 
                type="text" 
                placeholder="Username" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-white/30 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                required
              />
            </div>
          )}

          {/* Password field — only shown on login, not registration */}
          {isLogin && (
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
            <input 
              type="password" 
              placeholder="Password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-white/30 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
              required
            />
          </div>
          )}

          {/* Register info notice */}
          {!isLogin && (
            <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-amber-300/80 leading-relaxed">
                No password needed. An admin will review your request and send your login credentials to this email address once approved.
              </p>
            </div>
          )}

          <button 
            type="submit" 
            disabled={submitting}
            className="mt-4 w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? 'Please wait...' : isLogin ? <><LogIn className="w-5 h-5"/> Sign In</> : <><UserPlus className="w-5 h-5"/> Register</>}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="text-white/50 hover:text-white transition-colors text-sm"
          >
            {isLogin ? "Don't have an account? Register" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { UserSettingsModal } from './UserSettingsModal';

export function AuthButton() {
  const { user, loading, logout } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const avatarRef = useRef<HTMLDivElement>(null);

  const openDropdown = () => {
    if (avatarRef.current) {
      const rect = avatarRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setIsDropdownOpen(true);
  };

  if (loading) {
    return <div className="w-10 h-10 rounded-full bg-white/5 animate-pulse" />;
  }

  if (user) {
    return (
      <>
        <div
          ref={avatarRef}
          className="w-10 h-10 rounded-full border border-emerald-500/30 bg-emerald-900/20 flex items-center justify-center text-emerald-300 font-bold shrink-0 cursor-pointer hover:bg-emerald-800/30 transition-colors select-none"
          title={user.username || user.email || 'User'}
          onClick={openDropdown}
        >
          {(user.username || user.email || 'U')[0].toUpperCase()}
        </div>

        {isDropdownOpen && createPortal(
          <>
            <div
              className="fixed inset-0"
              style={{ zIndex: 9998 }}
              onClick={() => setIsDropdownOpen(false)}
            />
            <div
              className="fixed min-w-[160px]"
              style={{ top: dropdownPos.top, right: dropdownPos.right, zIndex: 9999 }}
            >
              <div className="bg-zinc-900 border border-white/10 rounded-xl p-2 shadow-2xl">
                <div className="px-3 py-2 text-sm text-white border-b border-white/10 mb-2 truncate">
                  {user.username || user.email}
                </div>
                <button
                  onClick={() => { setShowSettings(true); setIsDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  Settings
                </button>
                <button
                  onClick={() => { logout(); setIsDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-white/5 rounded-lg transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </>,
          document.body
        )}

        {showSettings && <UserSettingsModal onClose={() => setShowSettings(false)} userId={user.uid} />}
      </>
    );
  }

  return null;
}
