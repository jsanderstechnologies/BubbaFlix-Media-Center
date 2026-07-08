
import { useState, useEffect } from 'react';
import { User, Mail, Lock, UserPlus, LogIn } from 'lucide-react';

export interface AuthUser {
  uid: string;
  email: string | null;
  username: string | null;
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

  if (loading || user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    const body = isLogin ? { email, password } : { email, username, password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');
      
      login(data.user, data.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] bg-black flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/20 to-black pointer-events-none" />
      <div className="bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 w-full max-w-md relative z-10 shadow-2xl">
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
              type="email" 
              placeholder="Email Address" 
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

export function AuthButton() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return <div className="w-10 h-10 rounded-full bg-white/5 animate-pulse" />;
  }

  if (user) {
    return (
      <div className="relative group">
        <div 
          className="w-10 h-10 rounded-full border border-emerald-500/30 overflow-hidden bg-emerald-900/20 flex items-center justify-center text-emerald-300 font-bold shrink-0 cursor-pointer hover:bg-emerald-800/30 transition-colors"
          title={user.username || user.email || 'User'}
        >
          {(user.username || user.email || 'U')[0].toUpperCase()}
        </div>
        <div className="absolute top-full right-0 mt-2 bg-zinc-900 border border-white/10 rounded-xl p-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity shadow-2xl z-50 min-w-[150px]">
          <div className="px-3 py-2 text-sm text-white border-b border-white/10 mb-2 truncate">
            {user.username || user.email}
          </div>
          <button 
            onClick={logout}
            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-white/5 rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return null;
}
