import { useState, useEffect, useMemo } from 'react';
import { Save, Server, Shield, Link as LinkIcon, Database, Tv, CheckSquare, Square, Filter, Mail, Eye, EyeOff, SendHorizonal } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AdminPanel from './AdminPanel';
import { useAuth } from './Auth';

const fetchM3U = async (url: string) => {
  if (!url) return null;
  const res = await fetch('/api/m3u', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  if (!res.ok) throw new Error("Failed to fetch M3U");
  return res.json();
};

export default function SettingsPanel() {
  const queryClient = useQueryClient();
  const [tmdbKey, setTmdbKey] = useState(() => localStorage.getItem('tmdbKey') || '');
  const [torboxApiKey, setTorboxApiKey] = useState(() => localStorage.getItem('torboxApiKey') || '');
  const [preferHEVC, setPreferHEVC] = useState(() => localStorage.getItem('preferHEVC') === 'true');
  const [maxResults, setMaxResults] = useState(() => localStorage.getItem('maxResults') || '20');
  const [aiostreamsUrl, setAiostreamsUrl] = useState(() => localStorage.getItem('aiostreamsUrl') || '');
  const [providerType, setProviderType] = useState(() => localStorage.getItem('providerType') || 'm3u');
  const [iptvUrl, setIptvUrl] = useState(() => localStorage.getItem('iptvUrl') || '');
  const [epgUrl, setEpgUrl] = useState(() => localStorage.getItem('epgUrl') || '');
  const [epgOffset, setEpgOffset] = useState(() => localStorage.getItem('epgOffset') || '0');
  
  const [xtreamServer, setXtreamServer] = useState(() => localStorage.getItem('xtreamServer') || '');
  const [xtreamUsername, setXtreamUsername] = useState(() => localStorage.getItem('xtreamUsername') || '');
  const [xtreamPassword, setXtreamPassword] = useState(() => localStorage.getItem('xtreamPassword') || '');

  const [playerPath, setPlayerPath] = useState(() => localStorage.getItem('playerPath') || 'mpv');
  const [streamBufferSeconds, setStreamBufferSeconds] = useState(() => localStorage.getItem('streamBufferSeconds') || '60');
  const [filterAnime, setFilterAnime] = useState(() => localStorage.getItem('filterAnime') === 'true');
  const [preferredLanguage, setPreferredLanguage] = useState(() => localStorage.getItem('preferredLanguage') || 'all');
  const [saved, setSaved] = useState(false);
  
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // --- Email Config state (admin only) ---
  const [emailGmailUser, setEmailGmailUser] = useState('');
  const [emailGmailAppPassword, setEmailGmailAppPassword] = useState('');
  const [emailAppName, setEmailAppName] = useState('BubbaFlix');
  const [emailAppUrl, setEmailAppUrl] = useState('');
  const [emailPasswordSet, setEmailPasswordSet] = useState(false);
  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    const token = localStorage.getItem('authToken');
    fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (data.email) {
          setEmailGmailUser(data.email.gmailUser || '');
          setEmailAppName(data.email.appName || 'BubbaFlix');
          setEmailAppUrl(data.email.appUrl || '');
          setEmailPasswordSet(!!data.email.gmailAppPasswordSet);
        }
      })
      .catch(console.error);
  }, [isAdmin]);

  const handleEmailSave = async () => {
    setEmailSaving(true);
    try {
      const token = localStorage.getItem('authToken');
      const body: any = { email: { gmailUser: emailGmailUser, appName: emailAppName, appUrl: emailAppUrl } };
      if (emailGmailAppPassword) body.email.gmailAppPassword = emailGmailAppPassword;
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('Failed to save');
      setEmailSaved(true);
      if (emailGmailAppPassword) setEmailPasswordSet(true);
      setEmailGmailAppPassword('');
      setTimeout(() => setEmailSaved(false), 3000);
    } catch (e: any) { alert(e.message); }
    finally { setEmailSaving(false); }
  };

  const handleTestEmail = async () => {
    setEmailTesting(true);
    setEmailTestResult(null);
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/admin/test-email', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setEmailTestResult('✓ Test email sent to your address!');
    } catch (e: any) { setEmailTestResult('✗ ' + e.message); }
    finally { setEmailTesting(false); }
  };

  const [enabledGroups, setEnabledGroups] = useState<string[] | null>(() => {
    try {
      const stored = localStorage.getItem('enabledGroups');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const { data: parsedM3u, isLoading: isM3uLoading } = useQuery({
    queryKey: ['m3u', iptvUrl],
    queryFn: () => fetchM3U(iptvUrl),
    staleTime: 5 * 60 * 1000,
  });

  const availableGroups = useMemo(() => {
    if (!parsedM3u?.items) return [];
    const groups = new Set<string>();
    parsedM3u.items.forEach((c: any) => {
      if (c.group?.title) {
        groups.add(c.group.title.trim());
      }
    });
    return Array.from(groups).sort();
  }, [parsedM3u]);

  // If enabledGroups is null (never saved) and we load groups, enable them all by default
  useEffect(() => {
    if (availableGroups.length > 0 && enabledGroups === null) {
      setEnabledGroups(availableGroups);
    }
  }, [availableGroups, enabledGroups]);

  const toggleGroup = (group: string) => {
    setEnabledGroups(prev => {
      const current = prev || [];
      return current.includes(group) 
        ? current.filter(g => g !== group)
        : [...current, group]
    });
  };

  const toggleAllGroups = () => {
    const current = enabledGroups || [];
    if (current.length === availableGroups.length) {
      setEnabledGroups([]);
    } else {
      setEnabledGroups(availableGroups);
    }
  };

  const handleSave = () => {
    localStorage.setItem('tmdbKey', tmdbKey);
    localStorage.setItem('torboxApiKey', torboxApiKey);
    localStorage.setItem('preferHEVC', preferHEVC.toString());
    localStorage.setItem('maxResults', maxResults);
    localStorage.setItem('aiostreamsUrl', aiostreamsUrl);
    
    let finalIptvUrl = iptvUrl;
    let finalEpgUrl = epgUrl;
    
    if (providerType === 'xtream' && xtreamServer && xtreamUsername && xtreamPassword) {
      const serverUrl = xtreamServer.endsWith('/') ? xtreamServer.slice(0, -1) : xtreamServer;
      finalIptvUrl = `${serverUrl}/get.php?username=${xtreamUsername}&password=${xtreamPassword}&type=m3u_plus`;
      finalEpgUrl = `${serverUrl}/xmltv.php?username=${xtreamUsername}&password=${xtreamPassword}`;
      setIptvUrl(finalIptvUrl);
      setEpgUrl(finalEpgUrl);
    }
    
    localStorage.setItem('providerType', providerType);
    localStorage.setItem('iptvUrl', finalIptvUrl);
    localStorage.setItem('epgUrl', finalEpgUrl);
    localStorage.setItem('epgOffset', epgOffset);
    
    localStorage.setItem('xtreamServer', xtreamServer);
    localStorage.setItem('xtreamUsername', xtreamUsername);
    localStorage.setItem('xtreamPassword', xtreamPassword);

    localStorage.setItem('playerPath', playerPath);
    localStorage.setItem('streamBufferSeconds', streamBufferSeconds);
    localStorage.setItem('filterAnime', filterAnime.toString());
    localStorage.setItem('preferredLanguage', preferredLanguage);
    localStorage.setItem('enabledGroups', JSON.stringify(enabledGroups));
    
    queryClient.invalidateQueries({ queryKey: ['movies'] });
    queryClient.invalidateQueries({ queryKey: ['tvseries'] });
    
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto w-full pb-10 relative">
      <div className="sticky top-[-24px] sm:top-[-40px] z-30 bg-transparent py-4 flex items-center justify-end -mx-6 px-6 sm:-mx-10 sm:px-10 transition-all duration-300">
        <button 
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-semibold shadow-lg shadow-red-600/20 active:scale-95 transition-all cursor-pointer"
        >
          <Save className="w-4 h-4" />
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      <div className="grid gap-6">
        {isAdmin && (
          <div className="mb-2">
            <AdminPanel />
          </div>
        )}

        {/* Email Configuration */}
        {isAdmin && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-emerald-400" />
                <div>
                  <h2 className="text-lg font-medium text-white">Email Configuration</h2>
                  <p className="text-xs text-white/40 mt-0.5">Used to send welcome emails with auto-generated passwords when users are approved.</p>
                </div>
              </div>
              <button
                onClick={handleEmailSave}
                disabled={emailSaving}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition-all"
              >
                <Save className="w-3.5 h-3.5" />
                {emailSaved ? 'Saved!' : emailSaving ? 'Saving...' : 'Save Email Config'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">Gmail Address</label>
                <input
                  type="email"
                  value={emailGmailUser}
                  onChange={e => setEmailGmailUser(e.target.value)}
                  placeholder="yourname@gmail.com"
                  className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white placeholder:text-white/20 outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Gmail App Password
                  {emailPasswordSet && <span className="ml-2 text-xs text-emerald-400 font-normal">✓ Configured</span>}
                </label>
                <div className="relative">
                  <input
                    type={showEmailPassword ? 'text' : 'password'}
                    value={emailGmailAppPassword}
                    onChange={e => setEmailGmailAppPassword(e.target.value)}
                    placeholder={emailPasswordSet ? '(leave blank to keep existing)' : 'xxxx xxxx xxxx xxxx'}
                    className="w-full bg-black/20 border border-white/10 rounded-lg p-3 pr-10 text-white placeholder:text-white/20 outline-none focus:border-emerald-500/50 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEmailPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
                  >
                    {showEmailPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-white/30 mt-1">Generate at <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-emerald-400/70 hover:text-emerald-400 underline">myaccount.google.com/apppasswords</a></p>
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-2">App Name (shown in emails)</label>
                <input
                  type="text"
                  value={emailAppName}
                  onChange={e => setEmailAppName(e.target.value)}
                  placeholder="BubbaFlix"
                  className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white placeholder:text-white/20 outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-2">App URL (login link in emails)</label>
                <input
                  type="url"
                  value={emailAppUrl}
                  onChange={e => setEmailAppUrl(e.target.value)}
                  placeholder="http://your-server-address:5150"
                  className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white placeholder:text-white/20 outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleTestEmail}
                disabled={emailTesting || !emailGmailUser}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-all"
              >
                <SendHorizonal className="w-3.5 h-3.5" />
                {emailTesting ? 'Sending...' : 'Send Test Email to Me'}
              </button>
              {emailTestResult && (
                <span className={`text-sm font-medium ${emailTestResult.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
                  {emailTestResult}
                </span>
              )}
            </div>
          </div>
        )}

        {/* System Status */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/10">
            <Shield className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-medium text-white">System Status</h2>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-black/20 border border-white/5 rounded-xl p-4 flex flex-col gap-1.5">
              <span className="text-[10px] text-white/80 uppercase font-bold tracking-wider">AIOStreams</span>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-sm font-semibold text-white">CONNECTED</span>
              </div>
            </div>
            
            <div className="bg-black/20 border border-white/5 rounded-xl p-4 flex flex-col gap-1.5">
              <span className="text-[10px] text-white/80 uppercase font-bold tracking-wider">TMDB API</span>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-sm font-semibold text-white">ONLINE</span>
              </div>
            </div>
            
            <div className="bg-black/20 border border-white/5 rounded-xl p-4 flex flex-col gap-1.5">
              <span className="text-[10px] text-white/80 uppercase font-bold tracking-wider">DRV Driver</span>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                <span className="text-sm font-semibold text-white">i915/VAAPI</span>
              </div>
            </div>

            <div className="bg-black/20 border border-white/5 rounded-xl p-4 flex flex-col gap-1.5">
              <span className="text-[10px] text-white/80 uppercase font-bold tracking-wider">TorBox API</span>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${torboxApiKey ? 'bg-emerald-500 animate-pulse' : 'bg-orange-500'}`}></span>
                <span className="text-sm font-semibold text-white">{torboxApiKey ? 'ONLINE' : 'MISSING KEY'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Backend Integrations */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/10">
            <Server className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-medium text-white">Integrations</h2>
          </div>
          
          <div className="space-y-6">
            
            <div>
              <label className="block text-sm font-medium text-white mb-2">TorBox API Key</label>
              <div className="flex">
                <span className="inline-flex items-center px-4 rounded-l-lg border border-r-0 border-white/10 bg-black/40 text-white/80">
                  <Database className="w-4 h-4" />
                </span>
                <input 
                  type="password"
                  value={torboxApiKey}
                  onChange={(e) => setTorboxApiKey(e.target.value)}
                  className="flex-1 bg-black/20 border border-white/10 rounded-r-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors"
                  placeholder="Enter TorBox API Key..."
                />
              </div>
              <p className="text-xs text-white/80 mt-2">Required to monitor TorBox download caching status in real-time.</p>
            </div>\n
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-white block">Prefer HEVC / H.265</label>
                <button
                  onClick={() => setPreferHEVC(!preferHEVC)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${preferHEVC ? 'bg-indigo-600' : 'bg-slate-700'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${preferHEVC ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <p className="text-xs text-white/80">If enabled, HEVC encoded streams will be prioritized over H.264.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">Max TorBox Stream Results</label>
              <input 
                type="number"
                value={maxResults}
                onChange={(e) => setMaxResults(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors font-mono text-xs"
                placeholder="20"
                min="1"
                max="100"
              />
              <p className="text-xs text-white/80 mt-2">Maximum number of cached streams to fetch from TorBox (1-100).</p>
            </div>


            <div>
              <label className="block text-sm font-medium text-white mb-2">TMDB API Key</label>
              <div className="flex">
                <span className="inline-flex items-center px-4 rounded-l-lg border border-r-0 border-white/10 bg-black/40 text-white/80">
                  <Database className="w-4 h-4" />
                </span>
                <input 
                  type="password"
                  value={tmdbKey}
                  onChange={(e) => setTmdbKey(e.target.value)}
                  className="flex-1 bg-black/20 border border-white/10 rounded-r-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors"
                  placeholder="Enter TMDB API Key..."
                />
              </div>
              <p className="text-xs text-white/80 mt-2">Required to fetch movie metadata, posters, and trending lists.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">AIOStreams Manifest URL</label>
              <div className="flex">
                <span className="inline-flex items-center px-4 rounded-l-lg border border-r-0 border-white/10 bg-black/40 text-white/80">
                  <LinkIcon className="w-4 h-4" />
                </span>
                <input 
                  type="text"
                  value={aiostreamsUrl}
                  onChange={(e) => setAiostreamsUrl(e.target.value)}
                  className="flex-1 bg-black/20 border border-white/10 rounded-r-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors font-mono text-xs"
                  placeholder="https://aiostreams.elfhosted.com/..."
                />
              </div>
              <p className="text-xs text-white/80 mt-2">Used to scrape and resolve torrents/streams for catalog items.</p>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-medium text-white">IPTV Provider Configuration</label>
                <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
                  <button
                    onClick={() => setProviderType('m3u')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${providerType === 'm3u' ? 'bg-indigo-600 text-white' : 'text-white/60 hover:text-white'}`}
                  >
                    M3U / XMLTV
                  </button>
                  <button
                    onClick={() => setProviderType('xtream')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${providerType === 'xtream' ? 'bg-indigo-600 text-white' : 'text-white/60 hover:text-white'}`}
                  >
                    Xtream Codes
                  </button>
                </div>
              </div>

              {providerType === 'm3u' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-white mb-1">M3U Playlist URL or Path</label>
                    <div className="flex">
                      <span className="inline-flex items-center px-4 rounded-l-lg border border-r-0 border-white/10 bg-black/40 text-white/80">
                        <Tv className="w-4 h-4" />
                      </span>
                      <input 
                        type="text"
                        value={iptvUrl}
                        onChange={(e) => setIptvUrl(e.target.value)}
                        className="flex-1 bg-black/20 border border-white/10 rounded-r-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors font-mono text-xs"
                        placeholder="http://example.com/playlist.m3u"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-white mb-1">XMLTV EPG URL (Optional)</label>
                    <div className="flex">
                      <span className="inline-flex items-center px-4 rounded-l-lg border border-r-0 border-white/10 bg-black/40 text-white/80">
                        <LinkIcon className="w-4 h-4" />
                      </span>
                      <input 
                        type="text"
                        value={epgUrl}
                        onChange={(e) => setEpgUrl(e.target.value)}
                        className="flex-1 bg-black/20 border border-white/10 rounded-r-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors font-mono text-xs"
                        placeholder="http://example.com/epg.xml"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-white mb-1">Server URL</label>
                    <input 
                      type="text"
                      value={xtreamServer}
                      onChange={(e) => setXtreamServer(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors font-mono text-xs"
                      placeholder="http://server-domain.com:port"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-white mb-1">Username</label>
                      <input 
                        type="text"
                        value={xtreamUsername}
                        onChange={(e) => setXtreamUsername(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors font-mono text-xs"
                        placeholder="Username"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-white mb-1">Password</label>
                      <input 
                        type="password"
                        value={xtreamPassword}
                        onChange={(e) => setXtreamPassword(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors font-mono text-xs"
                        placeholder="Password"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-emerald-500/80 mt-2">
                    Saving will automatically generate the M3U and EPG URLs from these credentials.
                  </p>
                </div>
              )}
              
              <div className="mt-4">
                <label className="block text-xs text-white mb-1">EPG Time Offset (Hours)</label>
                <input 
                  type="number"
                  value={epgOffset}
                  onChange={(e) => setEpgOffset(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors font-mono text-xs"
                  placeholder="e.g. 0, -5, 2"
                />
                <p className="text-xs text-white/80 mt-2">Shift EPG times to match your timezone if they appear incorrect.</p>
              </div>
              
              {/* Group Selection */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-white">Available Playlist Groups</label>
                  {availableGroups.length > 0 && (
                    <button 
                      onClick={toggleAllGroups}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                      {((enabledGroups || []).length === availableGroups.length) ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>
                
                <div className="bg-black/20 border border-white/10 rounded-lg p-4 max-h-60 overflow-y-auto custom-scrollbar">
                  {isM3uLoading ? (
                    <div className="text-center text-white text-sm py-4">Loading groups...</div>
                  ) : availableGroups.length === 0 ? (
                    <div className="text-center text-white text-sm py-4">No groups found in playlist or invalid URL.</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {availableGroups.map(group => {
                        const isEnabled = (enabledGroups || []).includes(group);
                        return (
                          <div 
                            key={group} 
                            onClick={() => toggleGroup(group)}
                            className="flex items-center gap-3 cursor-pointer group/item"
                          >
                            <div className="text-indigo-400">
                              {isEnabled ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 opacity-50 group-hover/item:opacity-100 transition-opacity" />}
                            </div>
                            <span className={`text-sm truncate transition-colors ${isEnabled ? 'text-white' : 'text-white/60 group-hover/item:text-white'}`}>
                              {group}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content Filters */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/10">
            <Filter className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-medium text-white">Content Filters</h2>
          </div>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-white mb-2">Preferred Language</label>
              <select 
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors cursor-pointer"
              >
                <option value="all" className="bg-slate-900 text-white">All Languages</option>
                <option value="en" className="bg-slate-900 text-white">English</option>
                <option value="es" className="bg-slate-900 text-white">Spanish</option>
                <option value="fr" className="bg-slate-900 text-white">French</option>
                <option value="de" className="bg-slate-900 text-white">German</option>
                <option value="it" className="bg-slate-900 text-white">Italian</option>
                <option value="ja" className="bg-slate-900 text-white">Japanese</option>
                <option value="ko" className="bg-slate-900 text-white">Korean</option>
                <option value="zh" className="bg-slate-900 text-white">Chinese</option>
              </select>
              <p className="text-xs text-white/80 mt-2">Filter trending and search results by original language.</p>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-white block mb-1">Filter Anime</label>
                <p className="text-xs text-white/80">Hide Japanese animation from trending and search results.</p>
              </div>
              <button
                onClick={() => setFilterAnime(!filterAnime)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${filterAnime ? 'bg-indigo-600' : 'bg-slate-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${filterAnime ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
        </div>



        {/* Player Configuration */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/10">
            <Shield className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-medium text-white">Player Configuration</h2>
          </div>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-white mb-2">External Player Executable</label>
              <select 
                value={playerPath}
                onChange={(e) => setPlayerPath(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors appearance-none"
              >
                <option value="mpv">mpv (Default)</option>
                <option value="vlc">VLC Media Player</option>
                <option value="iina">IINA (macOS)</option>
                <option value="custom">Custom Path...</option>
              </select>
              <p className="text-xs text-white/80 mt-2">Select the media player to spawn when launching a stream.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">Streaming Buffer Size</label>
              <select 
                value={streamBufferSeconds}
                onChange={(e) => setStreamBufferSeconds(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors appearance-none"
              >
                <option value="15">15 Seconds (Faster start, less stable)</option>
                <option value="30">30 Seconds (Good for local network)</option>
                <option value="60">60 Seconds (Default, balanced)</option>
                <option value="120">2 Minutes (Better for high latency)</option>
                <option value="300">5 Minutes (Maximum stability, slower start)</option>
              </select>
              <p className="text-xs text-white/80 mt-2">Adjust the FFmpeg transcoding buffer size. Higher values increase stability but delay stream startup.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
