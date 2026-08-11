import { useState, useEffect, useMemo } from 'react';
import { Save, Server, Shield, Link as LinkIcon, Database, Tv, CheckSquare, Square, Filter, Mail, Eye, EyeOff, SendHorizonal, Terminal, ChevronDown, ChevronUp, Users, PlayCircle, Search, Key, Folder, Plus, Trash2, Film, RefreshCw, CheckCircle2, AlertCircle, Globe, Lock, ExternalLink, Copy } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';


import AdminPanel from './AdminPanel';
import { useAuth } from './Auth';
import { logger, LogEntry } from '../lib/logger';
import { useSettings } from '../lib/settings';

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

const CollapsibleSection = ({ id, title, icon: Icon, isOpen, onToggle, children, description, headerAction }: any) => {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 mb-6">
      <div className="w-full flex items-center justify-between p-6 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
        <button onClick={() => onToggle(id)} className="flex-1 flex items-center gap-3 text-left focus:outline-none">
          <Icon className="w-5 h-5 text-indigo-400" />
          <div>
            <h2 className="text-lg font-medium text-white">{title}</h2>
            {description && <p className="text-xs text-white/40 mt-0.5">{description}</p>}
          </div>
        </button>
        <div className="flex items-center gap-4">
          {headerAction && <div onClick={e => e.stopPropagation()}>{headerAction}</div>}
          <button onClick={() => onToggle(id)} className="text-white/40 hover:text-white/80 focus:outline-none">
            {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>
      <div 
        className={`transition-all duration-300 overflow-hidden ${isOpen ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}
        {...(!isOpen ? { inert: "" } as any : {})}
      >
        <div className="p-6 pt-2 border-t border-white/10">
          {children}
        </div>
      </div>
    </div>
  );
};


const SETTINGS_TABS = [
  { id: 'users', label: 'Users', icon: Users, adminOnly: true },
  { id: 'media', label: 'Media Sources', icon: Database, adminOnly: false },
  { id: 'playback', label: 'Playback & Transcoding', icon: PlayCircle, adminOnly: false },
  { id: 'iptv', label: 'Live TV (IPTV)', icon: Tv, adminOnly: false },
  { id: 'system', label: 'System', icon: Server, adminOnly: true }
];

export default function SettingsPanel() {
  const queryClient = useQueryClient();
  const [openSections, setOpenSections] = useState<string[]>([]);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [activeTab, setActiveTab] = useState(isAdmin ? 'users' : 'media');
  
  const toggleSection = (section: string) => {
    setOpenSections(prev => 
      prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
    );
  };
  const { systemSettings, userSettings, updateSystemSettings, updateUserSettings } = useSettings();

  const [tmdbKey, setTmdbKey] = useState(systemSettings.tmdbKey || '');
  const [tvdbApiKey, setTvdbApiKey] = useState(systemSettings.tvdbApiKey || '');
  const [premiumizeApiKey, setPremiumizeApiKey] = useState(systemSettings.premiumizeApiKey || localStorage.getItem('premiumizeApiKey') || '');
  const [geminiApiKey, setGeminiApiKey] = useState(systemSettings.geminiApiKey || '');
  const [groqApiKey, setGroqApiKey] = useState(systemSettings.groqApiKey || '');
  const [openRouterApiKey, setOpenRouterApiKey] = useState(systemSettings.openRouterApiKey || '');
  const [newsApiKey, setNewsApiKey] = useState(systemSettings.newsApiKey || '');
  const [gnewsApiKey, setGnewsApiKey] = useState(systemSettings.gnewsApiKey || '');
  const [preferHEVC, setPreferHEVC] = useState(systemSettings.preferHEVC !== false);
  const [hevcMode, setHevcMode] = useState<'prefer' | 'allow' | 'exclude'>(() => {
    if (systemSettings.hevcMode) return systemSettings.hevcMode;
    const local = localStorage.getItem('hevcMode') as any;
    if (local) return local;
    return systemSettings.preferHEVC === false ? 'exclude' : 'prefer';
  });

  useEffect(() => {
    if (systemSettings.hevcMode) {
      setHevcMode(systemSettings.hevcMode);
    }
  }, [systemSettings.hevcMode]);

  const [maxResults, setMaxResults] = useState(systemSettings.maxResults || '20');

  const [providerType, setProviderType] = useState(() => localStorage.getItem('providerType') || 'm3u');
  const [iptvUrl, setIptvUrl] = useState(systemSettings.iptvUrl || '');
  const [epgUrl, setEpgUrl] = useState(systemSettings.epgUrl || '');
  const [epgOffset, setEpgOffset] = useState(systemSettings.epgOffset || '0');
  
  const [xtreamServer, setXtreamServer] = useState(systemSettings.xtreamServer || '');
  const [xtreamUsername, setXtreamUsername] = useState(systemSettings.xtreamUsername || '');
  const [xtreamPassword, setXtreamPassword] = useState(systemSettings.xtreamPassword || '');

  const [playerPath, setPlayerPath] = useState(userSettings.playerPath || 'mpv');
  const [streamBufferSeconds, setStreamBufferSeconds] = useState(systemSettings.streamBufferSeconds || '60');
  const [filterAnime, setFilterAnime] = useState(systemSettings.filterAnime === true || userSettings.filterAnime === true);
  const [hideUnreleasedMedia, setHideUnreleasedMedia] = useState(() => localStorage.getItem('hideUnreleasedMedia') !== 'false');
  const [preferredLanguage, setPreferredLanguage] = useState(systemSettings.preferredLanguage || userSettings.preferredLanguage || 'all');
  const [adminMode, setAdminMode] = useState(userSettings.adminMode === true);

  const [iptvProviders, setIptvProviders] = useState(() => {
    if (systemSettings.iptvProviders && Array.isArray(systemSettings.iptvProviders) && systemSettings.iptvProviders.length > 0) {
      return systemSettings.iptvProviders;
    }
    return [{ id: 'default-m3u', name: 'Primary M3U Provider', type: 'm3u' as const, url: systemSettings.iptvUrl || '', enabled: true }];
  });
  const [customChannels, setCustomChannels] = useState<Record<string, any>>(() => systemSettings.customChannels || {});
  const [isDeduplicating, setIsDeduplicating] = useState(false);
  const [channelSearch, setChannelSearch] = useState('');

  const [sportsGroups, setSportsGroups] = useState<string[]>(() => systemSettings.sportsIptvGroups || []);
  const [enableEztv, setEnableEztv] = useState<boolean>(() => systemSettings.enableEztv === true);

  const [mediaFolders, setMediaFolders] = useState<Array<{ id: string; path: string; mediaType: 'movie' | 'series' }>>(() => {
    return systemSettings.mediaFolders || [];
  });
  const [newFolderPath, setNewFolderPath] = useState('');
  const [newFolderType, setNewFolderType] = useState<'movie' | 'series'>('movie');

  const handleAddFolder = async () => {

    if (!newFolderPath.trim()) return;
    const newEntry = {
      id: Date.now().toString(),
      path: newFolderPath.trim(),
      mediaType: newFolderType
    };
    const updatedFolders = [...mediaFolders, newEntry];
    setMediaFolders(updatedFolders);
    setNewFolderPath('');

    // Persist immediately to backend settings
    const token = localStorage.getItem('authToken');
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mediaFolders: updatedFolders })
      });
    } catch (e) {}

    // Automatically trigger scan for the newly added folder
    handleScanFolders(newEntry);
  };

  const handleRemoveFolder = async (id: string) => {
    const updatedFolders = mediaFolders.filter(f => f.id !== id);
    setMediaFolders(updatedFolders);

    const token = localStorage.getItem('authToken');
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mediaFolders: updatedFolders })
      });
    } catch (e) {}
    window.dispatchEvent(new CustomEvent('refresh-local-library'));
  };

  const [isScanningFolders, setIsScanningFolders] = useState(false);
  const [scanningFolderId, setScanningFolderId] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleScanFolders = async (folderObj?: { id: string; path: string; mediaType: 'movie' | 'series' }) => {
    if (folderObj) setScanningFolderId(folderObj.id);
    else setIsScanningFolders(true);
    setScanFeedback(null);

    // Save current mediaFolders before scanning
    const token = localStorage.getItem('authToken');
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mediaFolders })
      });
    } catch (e) {}

    try {
      const res = await fetch('/api/local-media/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(folderObj ? { folderPath: folderObj.path, mediaType: folderObj.mediaType } : {})
      });
      const data = await res.json();
      if (data.success) {
        setScanFeedback({
          type: 'success',
          message: data.message || `Scanned! Discovered ${data.moviesCount} Movies and ${data.seriesCount} TV Series.`
        });
        window.dispatchEvent(new CustomEvent('refresh-local-library'));
      } else {
        setScanFeedback({
          type: 'error',
          message: data.error || 'Failed to scan share folders.'
        });
      }
    } catch (e: any) {
      setScanFeedback({
        type: 'error',
        message: e.message || 'Server error while scanning folders.'
      });
    } finally {
      setIsScanningFolders(false);
      setScanningFolderId(null);
    }
  };





  const [enableUsenetSearch, setEnableUsenetSearch] = useState(systemSettings.enableUsenetSearch !== false);
  const [enableTorrentSearch, setEnableTorrentSearch] = useState(systemSettings.enableTorrentSearch !== false);
  
  const [usenetHost, setUsenetHost] = useState(systemSettings.usenetHost || '');
  const [usenetPort, setUsenetPort] = useState(systemSettings.usenetPort || '');
  const [usenetUsername, setUsenetUsername] = useState(systemSettings.usenetUsername || '');
  const [usenetPassword, setUsenetPassword] = useState(systemSettings.usenetPassword || '');

  const [saved, setSaved] = useState(false);
  

  // --- Debug Logging state ---
  const [enableDebugLog, setEnableDebugLog] = useState(() => localStorage.getItem('enableDebugLog') === 'true');
  const [disableLogin, setDisableLogin] = useState(systemSettings.disableLogin === true);
  const [intelTranscoding, setIntelTranscoding] = useState(systemSettings.intelTranscoding === true);
  const [frontendLogs, setFrontendLogs] = useState<LogEntry[]>([]);
  const [backendLogs, setBackendLogs] = useState<LogEntry[]>([]);

  const debugLogs = useMemo(() => {
    return [...frontendLogs, ...backendLogs].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [frontendLogs, backendLogs]);

  useEffect(() => {
    if (enableDebugLog) {
      const unsubscribe = logger.subscribe((logs) => {
        setFrontendLogs(logs);
      });

      let interval: NodeJS.Timeout;
      if (isAdmin) {
        const fetchLogs = async () => {
          const token = localStorage.getItem('authToken');
          if (token) {
            const bLogs = await logger.fetchBackendLogs(token);
            setBackendLogs(bLogs);
          }
        };
        fetchLogs();
        interval = setInterval(fetchLogs, 2000);
      }

      return () => {
        unsubscribe();
        if (interval) clearInterval(interval);
      };
    }
  }, [enableDebugLog, isAdmin]);

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
        if (data.usenetHost !== undefined) setUsenetHost(data.usenetHost);
        if (data.usenetPort !== undefined) setUsenetPort(data.usenetPort);
        if (data.usenetUsername !== undefined) setUsenetUsername(data.usenetUsername);
        if (data.usenetPassword !== undefined) setUsenetPassword(data.usenetPassword);
        if (data.disableLogin !== undefined) {
          setDisableLogin(data.disableLogin);
          localStorage.setItem('disableLogin', data.disableLogin.toString());
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

  const [enabledGroups, setEnabledGroups] = useState<string[] | null>(userSettings.enabledGroups && userSettings.enabledGroups.length > 0 ? userSettings.enabledGroups : null);

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

  // If enabledGroups is null (never saved) and we load groups, enable them all by default.
  // Also, if the user completely replaces their IPTV provider, their old groups will no longer exist.
  // In that case, auto-enable the new groups so they aren't left with an empty TV guide.
  useEffect(() => {
    if (availableGroups.length > 0) {
      if (enabledGroups === null) {
        setEnabledGroups(availableGroups);
      } else if (enabledGroups.length > 0) {
        const overlap = enabledGroups.filter(g => availableGroups.includes(g));
        if (overlap.length === 0) {
          setEnabledGroups(availableGroups);
        }
      }
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

  const toggleSportsGroup = (group: string) => {
    setSportsGroups(prev => {
      const current = prev || [];
      return current.includes(group) 
        ? current.filter(g => g !== group)
        : [...current, group]
    });
  };

  const toggleAllSportsGroups = () => {
    const current = sportsGroups || [];
    if (current.length === availableGroups.length) {
      setSportsGroups([]);
    } else {
      setSportsGroups(availableGroups);
    }
  };

  const editableChannels = useMemo(() => {
    if (!parsedM3u?.channels) return [];
    
    let filtered = parsedM3u.channels;
    if (enabledGroups !== null) {
      filtered = filtered.filter((c: any) => {
        const groupName = c.group?.title || c.group || '';
        return enabledGroups.includes(groupName);
      });
    }

    if (!channelSearch.trim()) return filtered;
    const q = channelSearch.toLowerCase();
    return filtered.filter((c: any) => 
      (c.title || c.name || '').toLowerCase().includes(q) || (c.group?.title || c.group || '').toLowerCase().includes(q)
    );
  }, [parsedM3u, channelSearch, enabledGroups]);

  const handleSave = async () => {
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
    localStorage.setItem('enableDebugLog', enableDebugLog.toString());
    localStorage.setItem('hideUnreleasedMedia', hideUnreleasedMedia.toString());
    logger.setEnabled(enableDebugLog);


    localStorage.setItem('premiumizeApiKey', premiumizeApiKey);
    localStorage.setItem('tvdbApiKey', tvdbApiKey);

    await updateSystemSettings({
      tmdbKey,
      tvdbApiKey,
      premiumizeApiKey,
      geminiApiKey,
      groqApiKey,
      openRouterApiKey,
      newsApiKey,
      gnewsApiKey,
      preferHEVC: hevcMode !== 'exclude',
      hevcMode,

      maxResults,
      iptvUrl: finalIptvUrl,
      epgUrl: finalEpgUrl,
      epgOffset,
      xtreamServer,
      xtreamUsername,
      xtreamPassword,
      iptvProviders,
      customChannels,
      streamBufferSeconds,
      enableUsenetSearch,
      enableTorrentSearch,
      intelTranscoding,
      disableLogin,
      filterAnime,
      preferredLanguage,
      mediaFolders,
      usenetHost,
      usenetPort,
      usenetUsername,
      usenetPassword,
      sportsIptvGroups: sportsGroups || [],
      enableEztv
    });

    await updateUserSettings({
      playerPath,
      filterAnime,
      preferredLanguage,
      enabledGroups: enabledGroups || [],
      adminMode
    });

    queryClient.invalidateQueries({ queryKey: ['movies'] });
    queryClient.invalidateQueries({ queryKey: ['tvseries'] });
    queryClient.invalidateQueries({ queryKey: ['m3u'] });
    
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto w-full pb-32 relative">
      <div className="fixed bottom-8 right-8 z-50 transition-all duration-300">
        <button 
          onClick={handleSave}
          className="flex items-center gap-3 px-6 py-4 bg-red-600 hover:bg-red-500 text-white rounded-full font-semibold shadow-2xl shadow-black/80 border border-red-500/50 hover:scale-105 active:scale-95 transition-all cursor-pointer"
        >
          <Save className="w-5 h-5" />
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>


      {/* Tabs */}
      <div className="flex overflow-x-auto hide-scrollbar gap-2 mb-2 p-1 bg-black/20 rounded-2xl border border-white/5">
        {SETTINGS_TABS.filter(t => !t.adminOnly || isAdmin).map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-all whitespace-nowrap ${
                isActive 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' 
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-indigo-400'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-6">
        {activeTab === 'users' && isAdmin && (
          <div className="mb-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <AdminPanel />
          </div>
        )}

        {/* Email Configuration */}
        {activeTab === 'system' && isAdmin && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
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

          </div>
        )}

        {activeTab === 'media' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
        {/* Local & Network Shared Folders */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <Folder className="w-5 h-5 text-indigo-400" />
              <div>
                <h2 className="text-lg font-medium text-white">Local & Network Shared Folders</h2>
                <p className="text-xs text-white/50">Add Windows SMB shared folders or local disk paths containing movies or TV series.</p>
              </div>
            </div>

            {mediaFolders.length > 0 && (
              <button
                type="button"
                onClick={() => handleScanFolders()}
                disabled={isScanningFolders}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScanningFolders ? 'animate-spin' : ''}`} />
                {isScanningFolders ? 'Scanning Shared Folders...' : 'Scan & Add To Library'}
              </button>
            )}
          </div>

          <div className="space-y-6">
            {scanFeedback && (
              <div className={`p-4 rounded-xl text-xs flex items-center gap-3 border ${scanFeedback.type === 'success' ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30' : 'bg-red-950/40 text-red-300 border-red-500/30'}`}>
                {scanFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
                <span className="font-medium">{scanFeedback.message}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <input 
                type="text" 
                value={newFolderPath}
                onChange={(e) => setNewFolderPath(e.target.value)}
                placeholder="e.g. \\192.168.1.100\Movies or C:\Media\TV Shows"
                className="flex-1 bg-black/20 border border-white/10 rounded-lg p-3 text-white outline-none focus:border-indigo-500/50 text-sm font-mono"
              />
              <select
                value={newFolderType}
                onChange={(e) => setNewFolderType(e.target.value as 'movie' | 'series')}
                className="bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm outline-none cursor-pointer"
              >
                <option value="movie">Movies Folder</option>
                <option value="series">TV Series Folder</option>
              </select>
              <button
                type="button"
                onClick={handleAddFolder}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium text-sm transition-all shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add Path
              </button>
            </div>

            {mediaFolders.length === 0 ? (
              <div className="bg-black/20 border border-white/5 rounded-xl p-6 text-center text-xs text-white/40">
                No local or network folders added yet. Add your Windows server share paths above!
              </div>
            ) : (
              <div className="space-y-3">
                {mediaFolders.map((folder) => (
                  <div key={folder.id} className="flex items-center justify-between p-3.5 bg-black/30 border border-white/5 rounded-xl text-sm gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Folder className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span className="font-mono text-white/90 text-xs truncate">{folder.path}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${folder.mediaType === 'series' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-sky-500/10 text-sky-400 border-sky-500/20'}`}>
                        {folder.mediaType === 'series' ? 'TV Series' : 'Movies'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleScanFolders(folder)}
                        disabled={scanningFolderId === folder.id}
                        className="text-white/60 hover:text-indigo-400 p-1.5 rounded-lg bg-white/5 border border-white/5 hover:border-indigo-500/30 transition-all cursor-pointer flex items-center gap-1 text-xs"
                        title="Scan this folder now"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${scanningFolderId === folder.id ? 'animate-spin text-indigo-400' : ''}`} />
                        <span className="hidden sm:inline text-[10px]">Scan Folder</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveFolder(folder.id)}
                        className="text-white/40 hover:text-red-400 p-1.5 transition-colors cursor-pointer"
                        title="Remove Folder Path"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>


        {/* System Status */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/10">
            <Shield className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-medium text-white">System Status</h2>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <span className="text-[10px] text-white/80 uppercase font-bold tracking-wider">Premiumize</span>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${premiumizeApiKey ? 'bg-emerald-500 animate-pulse' : 'bg-orange-500'}`}></span>
                <span className="text-sm font-semibold text-white">{premiumizeApiKey ? 'ONLINE' : 'MISSING KEY'}</span>
              </div>
            </div>

            <div className="bg-black/20 border border-white/5 rounded-xl p-4 flex flex-col gap-1.5">
              <span className="text-[10px] text-white/80 uppercase font-bold tracking-wider">Gemini API</span>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${geminiApiKey ? 'bg-emerald-500 animate-pulse' : 'bg-orange-500'}`}></span>
                <span className="text-sm font-semibold text-white">{geminiApiKey ? 'ONLINE' : 'MISSING KEY'}</span>
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
              <label className="block text-sm font-medium text-white mb-2">Premiumize API Key / Account Code</label>
              <div className="flex">
                <span className="inline-flex items-center px-4 rounded-l-lg border border-r-0 border-white/10 bg-black/40 text-white/80">
                  <Database className="w-4 h-4" />
                </span>
                <input 
                  type="password"
                  value={premiumizeApiKey}
                  onChange={(e) => setPremiumizeApiKey(e.target.value)}
                  className="flex-1 bg-black/20 border border-white/10 rounded-r-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors"
                  placeholder="Enter Premiumize API Key..."
                />
              </div>
              <p className="text-xs text-white/80 mt-2">Enables instant high-speed 4K torrent & cloud streaming via Premiumize.me. Get key at <a href="https://www.premiumize.me/account" target="_blank" rel="noreferrer" className="text-indigo-400 underline hover:text-indigo-300">premiumize.me/account</a></p>
            </div>

            {/* Premiumize VPN Configuration Card */}
            <div className="bg-gradient-to-br from-indigo-950/40 via-purple-950/20 to-black/60 border border-indigo-500/20 rounded-xl p-5 space-y-4 shadow-lg">
              <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400 border border-indigo-500/30">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Premiumize.me VPN Integration
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] uppercase tracking-wider font-extrabold">Active</span>
                    </h3>
                    <p className="text-xs text-white/60">Secure OpenVPN & WireGuard tunnel gateways provided by Premiumize</p>
                  </div>
                </div>
                <a 
                  href="https://www.premiumize.me/vpn" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <span>VPN Dashboard</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {/* Credentials Box */}
                <div className="bg-black/30 border border-white/5 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-300 uppercase tracking-wider">
                    <span>VPN Credentials</span>
                    <Lock className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <div className="text-xs space-y-1.5 text-white/80">
                    <div className="flex justify-between items-center py-1 border-b border-white/5">
                      <span className="text-white/50">VPN Username:</span>
                      <span className="font-mono text-white font-semibold">Your Customer ID</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-white/50">VPN Password:</span>
                      <span className="font-mono text-white font-semibold">Your Premiumize API Key</span>
                    </div>
                  </div>
                </div>

                {/* Gateways Box */}
                <div className="bg-black/30 border border-white/5 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-300 uppercase tracking-wider">
                    <span>Available VPN Locations</span>
                    <Globe className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono text-white/80 pt-1">
                    <div className="bg-white/5 px-2.5 py-1 rounded border border-white/5 text-[11px] flex items-center justify-between">
                      <span>🇺🇸 USA</span>
                      <span className="text-white/40 text-[9px]">usa.premiumize.me</span>
                    </div>
                    <div className="bg-white/5 px-2.5 py-1 rounded border border-white/5 text-[11px] flex items-center justify-between">
                      <span>🇪🇺 Europe</span>
                      <span className="text-white/40 text-[9px]">eu.premiumize.me</span>
                    </div>
                    <div className="bg-white/5 px-2.5 py-1 rounded border border-white/5 text-[11px] flex items-center justify-between">
                      <span>🇨🇦 Canada</span>
                      <span className="text-white/40 text-[9px]">ca.premiumize.me</span>
                    </div>
                    <div className="bg-white/5 px-2.5 py-1 rounded border border-white/5 text-[11px] flex items-center justify-between">
                      <span>🇬🇧 UK</span>
                      <span className="text-white/40 text-[9px]">uk.premiumize.me</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-lg p-3 text-xs text-indigo-200/80 leading-relaxed flex items-start gap-2.5">
                <Shield className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-indigo-200">Built-in Cloud Protection:</strong> All torrent streams, cloud transfers, and direct media downloads resolved in BubbaFlix are automatically encrypted and proxied through Premiumize's cloud servers, shielding your IP address without requiring an extra system VPN client!
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">Gemini API Key</label>
              <div className="flex">
                <span className="inline-flex items-center px-4 rounded-l-lg border border-r-0 border-white/10 bg-black/40 text-white/80">
                  <Database className="w-4 h-4" />
                </span>
                <input 
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  className="flex-1 bg-black/20 border border-white/10 rounded-r-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors"
                  placeholder="Enter Gemini API Key..."
                />
              </div>
              <p className="text-xs text-white/80 mt-2">Primary AI provider. Used by backend for search filtering, sports matching, and deduplication.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">Groq API Key (Optional Free AI Fallback)</label>
              <div className="flex">
                <span className="inline-flex items-center px-4 rounded-l-lg border border-r-0 border-white/10 bg-black/40 text-white/80">
                  <Database className="w-4 h-4" />
                </span>
                <input 
                  type="password"
                  value={groqApiKey}
                  onChange={(e) => setGroqApiKey(e.target.value)}
                  className="flex-1 bg-black/20 border border-white/10 rounded-r-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors"
                  placeholder="Enter Groq API Key (Optional)..."
                />
              </div>
              <p className="text-xs text-white/80 mt-2">100% Free ultra-fast AI fallback if Gemini encounters rate limits (429). Get free key at <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-indigo-400 underline hover:text-indigo-300">console.groq.com</a></p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">OpenRouter API Key (Optional Free AI Fallback)</label>
              <div className="flex">
                <span className="inline-flex items-center px-4 rounded-l-lg border border-r-0 border-white/10 bg-black/40 text-white/80">
                  <Database className="w-4 h-4" />
                </span>
                <input 
                  type="password"
                  value={openRouterApiKey}
                  onChange={(e) => setOpenRouterApiKey(e.target.value)}
                  className="flex-1 bg-black/20 border border-white/10 rounded-r-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors"
                  placeholder="Enter OpenRouter API Key (Optional)..."
                />
              </div>
              <p className="text-xs text-white/80 mt-2">Secondary free AI fallback supporting Llama 3.2 & Gemma 2 free models. Get key at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-indigo-400 underline hover:text-indigo-300">openrouter.ai/keys</a></p>
            </div>

            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={enableEztv} 
                  onChange={(e) => setEnableEztv(e.target.checked)}
                  className="w-4 h-4 text-indigo-500 rounded bg-black/40 border-white/20 focus:ring-indigo-500 focus:ring-offset-gray-900" 
                />
                <span className="text-sm font-medium text-white">Enable EZTV Integration</span>
              </label>
              <p className="text-xs text-white/80 mt-2 ml-7">Turn on EZTV searches for TV Shows. (Note: EZTV API can sometimes block requests or rate limit).</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">NewsAPI.org API Key</label>
              <div className="flex">
                <span className="inline-flex items-center px-4 rounded-l-lg border border-r-0 border-white/10 bg-black/40 text-white/80">
                  <Key className="w-4 h-4" />
                </span>
                <input 
                  type="password"
                  value={newsApiKey}
                  onChange={(e) => setNewsApiKey(e.target.value)}
                  className="flex-1 bg-black/20 border border-white/10 rounded-r-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors"
                  placeholder="Enter NewsAPI.org Key..."
                />
              </div>
              <p className="text-xs text-white/80 mt-2">Powers local, national, world, and sports news headlines.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">GNews API Key</label>
              <div className="flex">
                <span className="inline-flex items-center px-4 rounded-l-lg border border-r-0 border-white/10 bg-black/40 text-white/80">
                  <Key className="w-4 h-4" />
                </span>
                <input 
                  type="password"
                  value={gnewsApiKey}
                  onChange={(e) => setGnewsApiKey(e.target.value)}
                  className="flex-1 bg-black/20 border border-white/10 rounded-r-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors"
                  placeholder="Enter GNews API Key..."
                />
              </div>
              <p className="text-xs text-white/80 mt-2">Provides additional regional, global, and sports news feeds.</p>
            </div>
            
            <div>
              <label className="text-sm font-medium text-white block mb-2">HEVC (H.265) Codec & Stream Filtering</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
                <button
                  type="button"
                  onClick={() => { setHevcMode('prefer'); setPreferHEVC(true); }}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${hevcMode === 'prefer' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-black/20 border-white/10 text-white/60 hover:text-white'}`}
                >
                  <span className="font-bold text-xs">🌟 Prioritize HEVC</span>
                  <span className="text-[10px] opacity-70 mt-1">Sort high-efficiency 4K/HEVC streams to top of results.</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setHevcMode('allow'); setPreferHEVC(true); }}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${hevcMode === 'allow' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-black/20 border-white/10 text-white/60 hover:text-white'}`}
                >
                  <span className="font-bold text-xs">⚡ Allow All Codecs</span>
                  <span className="text-[10px] opacity-70 mt-1">Include H.264 & HEVC streams equally.</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setHevcMode('exclude'); setPreferHEVC(false); }}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${hevcMode === 'exclude' ? 'bg-red-600/20 border-red-500 text-white' : 'bg-black/20 border-white/10 text-white/60 hover:text-white'}`}
                >
                  <span className="font-bold text-xs">🚫 Exclude HEVC</span>
                  <span className="text-[10px] opacity-70 mt-1">Strictly force H.264 only (for older devices).</span>
                </button>
              </div>
              <p className="text-xs text-white/80">Configure how stream searches handle HEVC / H.265 video releases.</p>
            </div>


            <div>
              <label className="block text-sm font-medium text-white mb-2">Max Stream Results</label>
              <input 
                type="number"
                value={maxResults}
                onChange={(e) => setMaxResults(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors font-mono text-xs"
                placeholder="20"
                min="1"
                max="100"
              />
              <p className="text-xs text-white/80 mt-2">Maximum number of cached streams to fetch (1-100).</p>
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
              <label className="block text-sm font-medium text-white mb-2">TVDB API Key</label>
              <div className="flex">
                <span className="inline-flex items-center px-4 rounded-l-lg border border-r-0 border-white/10 bg-black/40 text-white/80">
                  <Database className="w-4 h-4 text-emerald-400" />
                </span>
                <input 
                  type="password"
                  value={tvdbApiKey}
                  onChange={(e) => setTvdbApiKey(e.target.value)}
                  className="flex-1 bg-black/20 border border-white/10 rounded-r-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors"
                  placeholder="Enter TVDB API Key..."
                />
              </div>
              <p className="text-xs text-white/80 mt-2">Optional TVDB API key for enhanced TV Series season and episode metadata.</p>
            </div>
          </div>
          </div>
          </div>
        )}

        {activeTab === 'iptv' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-medium text-white">Primary IPTV Configuration</h3>
                  <p className="text-xs text-white/50">Setup your primary IPTV provider (M3U or Xtream Codes).</p>
                </div>
                
                <div className="flex gap-4 mb-4">
                  <button
                    type="button"
                    onClick={() => setProviderType('m3u')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg border transition-all ${providerType === 'm3u' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-transparent border-white/10 text-white/50 hover:bg-white/5'}`}
                  >
                    M3U Playlist
                  </button>
                  <button
                    type="button"
                    onClick={() => setProviderType('xtream')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg border transition-all ${providerType === 'xtream' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-transparent border-white/10 text-white/50 hover:bg-white/5'}`}
                  >
                    Xtream Codes API
                  </button>
                </div>

                {providerType === 'm3u' ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-white block mb-1">M3U Playlist URL</label>
                      <input
                        type="url"
                        value={iptvUrl}
                        onChange={e => setIptvUrl(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-indigo-500 transition-colors"
                        placeholder="https://example.com/playlist.m3u"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-white block mb-1">Server URL</label>
                      <input
                        type="url"
                        value={xtreamServer}
                        onChange={e => setXtreamServer(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-indigo-500 transition-colors"
                        placeholder="http://example.com:8080"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-white block mb-1">Username</label>
                        <input
                          type="text"
                          value={xtreamUsername}
                          onChange={e => setXtreamUsername(e.target.value)}
                          className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-indigo-500 transition-colors"
                          placeholder="Username"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-white block mb-1">Password</label>
                        <input
                          type="password"
                          value={xtreamPassword}
                          onChange={e => setXtreamPassword(e.target.value)}
                          className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-indigo-500 transition-colors"
                          placeholder="Password"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-white/10">
                  <label className="text-sm font-medium text-white block mb-1">EPG XMLTV URL (Optional)</label>
                  <p className="text-xs text-white/50 mb-2">Provide a custom EPG guide URL. If using Xtream Codes, this can be left blank to use the default server EPG.</p>
                  <input
                    type="url"
                    value={epgUrl}
                    onChange={e => setEpgUrl(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-indigo-500 transition-colors"
                    placeholder="https://example.com/epg.xml"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              {/* Multi-Provider IPTV Manager & Channel Customization Table */}
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div>
                  <h3 className="text-base font-medium text-white">IPTV Stream Providers</h3>
                  <p className="text-xs text-white/50">Add multiple M3U playlist URLs or Xtream Codes servers.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newProv = { id: `prov-${Date.now()}`, name: `Provider #${iptvProviders.length + 1}`, type: 'm3u' as const, url: '', epgUrl: '', enabled: true };
                    setIptvProviders([...iptvProviders, newProv]);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Provider
                </button>
              </div>

              {/* Providers List */}
              <div className="space-y-3">
                {iptvProviders.map((prov, index) => (
                  <div key={prov.id} className="bg-black/30 border border-white/10 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1">
                        <input
                          type="text"
                          value={prov.name}
                          onChange={(e) => {
                            const updated = [...iptvProviders];
                            updated[index].name = e.target.value;
                            setIptvProviders(updated);
                          }}
                          className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-white font-bold text-sm outline-none focus:border-indigo-500 w-48"
                          placeholder="Provider Name"
                        />
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${prov.type === 'm3u' ? 'bg-indigo-950 text-indigo-300 border border-indigo-500/30' : 'bg-purple-950 text-purple-300 border border-purple-500/30'}`}>
                          {prov.type.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...iptvProviders];
                            updated[index].enabled = !updated[index].enabled;
                            setIptvProviders(updated);
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${prov.enabled ? 'bg-emerald-600' : 'bg-slate-700'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${prov.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIptvProviders(iptvProviders.filter((_, i) => i !== index));
                          }}
                          className="text-white/40 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        value={prov.url}
                        onChange={(e) => {
                          const updated = [...iptvProviders];
                          updated[index].url = e.target.value;
                          setIptvProviders(updated);
                        }}
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-xs outline-none focus:border-indigo-500"
                        placeholder="M3U Playlist URL or Xtream Host..."
                      />
                      <input
                        type="text"
                        value={prov.epgUrl || ''}
                        onChange={(e) => {
                          const updated = [...iptvProviders];
                          updated[index].epgUrl = e.target.value;
                          setIptvProviders(updated);
                        }}
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-xs outline-none focus:border-indigo-500"
                        placeholder="Custom EPG XMLTV URL (Optional)..."
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Channel Customization & Gemini AI Matcher */}
              <div className="pt-6 border-t border-white/10 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-medium text-white flex items-center gap-2">
                      <span>Channel Editor & AI Deduplicator</span>
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold uppercase">Gemini AI</span>
                    </h3>
                    <p className="text-xs text-white/50">Edit channel names, logos, groups, hide channels, or run AI matching across providers to setup backup streams.</p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!parsedM3u?.channels || parsedM3u.channels.length === 0) {
                        alert("No IPTV channels found to deduplicate. Make sure your provider M3U URLs are valid.");
                        return;
                      }
                      setIsDeduplicating(true);
                      try {
                        const token = localStorage.getItem('authToken');
                        const res = await fetch('/api/admin/iptv/ai-dedupe', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ channels: parsedM3u.channels })
                        });
                        const data = await res.json();
                        if (data.success && data.customChannels) {
                          setCustomChannels({ ...customChannels, ...data.customChannels });
                          alert(data.message || `Successfully matched and grouped ${data.matchedGroupsCount || 0} identical channels with primary & backup fallback streams!`);
                        } else {
                          alert(data.error || "Gemini AI channel deduplication failed.");
                        }
                      } catch (e: any) {
                        alert(e.message || "Failed to run Gemini channel matcher.");
                      } finally {
                        setIsDeduplicating(false);
                      }
                    }}
                    disabled={isDeduplicating}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isDeduplicating ? 'animate-spin' : ''}`} />
                    {isDeduplicating ? 'Gemini Matching Duplicates...' : '⚡ Run Gemini AI Deduplication'}
                  </button>
                </div>

                {/* Search & Channel Table */}
                <div className="space-y-3">
                  <input
                    type="text"
                    value={channelSearch}
                    onChange={(e) => setChannelSearch(e.target.value)}
                    placeholder="Search channels to edit..."
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-xs outline-none focus:border-indigo-500"
                  />

                  <div className="flex items-center justify-between text-xs text-white/60 px-1">
                    <span>Showing {editableChannels.length} channel{editableChannels.length === 1 ? '' : 's'}</span>
                    {editableChannels.length > 100 && (
                      <span className="text-[11px] text-amber-400/80 font-mono">Use search above to narrow down specific channels</span>
                    )}
                  </div>

                  <div className="bg-black/40 border border-white/10 rounded-xl overflow-hidden max-h-[500px] overflow-y-auto custom-scrollbar">
                    {editableChannels.length === 0 ? (
                      <div className="p-6 text-center text-xs text-white/40">No channels found matching search.</div>
                    ) : (
                      <table className="w-full text-left text-xs">
                        <thead className="bg-white/5 text-white/60 font-mono uppercase text-[10px] sticky top-0 backdrop-blur-md z-10">
                          <tr>
                            <th className="p-3">Visibility</th>
                            <th className="p-3">Channel Name</th>
                            <th className="p-3">Group / Category</th>
                            <th className="p-3">Backups</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {editableChannels.slice(0, 500).map((ch) => {
                            const cfg = customChannels[ch.id] || { id: ch.id, name: ch.title || ch.name, group: ch.group?.title || ch.group || '', hidden: false, primaryStreamUrl: ch.rawUrl || ch.url, backupStreamUrls: [] };
                            return (
                              <tr key={ch.id} className="hover:bg-white/[0.02]">
                                <td className="p-3">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = { ...customChannels, [ch.id]: { ...cfg, hidden: !cfg.hidden } };
                                      setCustomChannels(updated);
                                    }}
                                    className={`p-1.5 rounded-lg transition-colors ${cfg.hidden ? 'text-red-400 bg-red-950/30' : 'text-emerald-400 bg-emerald-950/30'}`}
                                  >
                                    {cfg.hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                  </button>
                                </td>
                                <td className="p-3">
                                  <input
                                    type="text"
                                    value={cfg.name}
                                    onChange={(e) => {
                                      const updated = { ...customChannels, [ch.id]: { ...cfg, name: e.target.value } };
                                      setCustomChannels(updated);
                                    }}
                                    className="bg-black/40 border border-white/10 rounded px-2 py-1 text-white text-xs w-full"
                                  />
                                </td>
                                <td className="p-3">
                                  <input
                                    type="text"
                                    value={cfg.group}
                                    onChange={(e) => {
                                      const updated = { ...customChannels, [ch.id]: { ...cfg, group: e.target.value } };
                                      setCustomChannels(updated);
                                    }}
                                    className="bg-black/40 border border-white/10 rounded px-2 py-1 text-white/80 text-xs w-full"
                                  />
                                </td>
                                <td className="p-3">
                                  <span className="font-mono text-[10px] text-amber-400 font-bold">
                                    {cfg.backupStreamUrls?.length || 0} Fallbacks
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>

              {/* Group Selection */}
              <div className="mt-6 border-t border-white/10 pt-6">
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

              {/* Sports Group Selection */}
              <div className="mt-6 border-t border-white/10 pt-6">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <label className="text-sm font-medium text-white block">Sports Playlist Groups</label>
                    <span className="text-xs text-white/50">Select the groups to use when searching for live sports. If none are selected, it will fall back to keyword matching.</span>
                  </div>
                  {availableGroups.length > 0 && (
                    <button 
                      onClick={toggleAllSportsGroups}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                      {((sportsGroups || []).length === availableGroups.length) ? 'Deselect All' : 'Select All'}
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
                        const isEnabled = (sportsGroups || []).includes(group);
                        return (
                          <div 
                            key={`sports-${group}`} 
                            onClick={() => toggleSportsGroup(group)}
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
        )}

        {activeTab === 'playback' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
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
                <label className="text-sm font-medium text-white block mb-1">Hide Unreleased Media</label>
                <p className="text-xs text-white/80">Hide movies and TV series that have not been released yet.</p>
              </div>
              <button
                onClick={() => setHideUnreleasedMedia(!hideUnreleasedMedia)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${hideUnreleasedMedia ? 'bg-indigo-600' : 'bg-slate-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${hideUnreleasedMedia ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
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
        )}

        {activeTab === 'system' && isAdmin && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
        {/* Developer / Debug */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/10">
            <Terminal className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-medium text-white">Developer / Debug</h2>
          </div>
          
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-white block mb-1">Developer Admin Mode</label>
                <p className="text-xs text-white/80">Enables experimental UI features for UI development.</p>
              </div>
              <button
                onClick={() => setAdminMode(!adminMode)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${adminMode ? 'bg-indigo-600' : 'bg-slate-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${adminMode ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-white block mb-1">Disable Login (Auto Admin)</label>
                <p className="text-xs text-white/80">Skip authentication entirely and auto-login as admin. Useful for local development.</p>
              </div>
              <button
                onClick={() => setDisableLogin(!disableLogin)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${disableLogin ? 'bg-rose-600' : 'bg-slate-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${disableLogin ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-white block mb-1">Enable Debug Logging</label>
                <p className="text-xs text-white/80">Capture and display frontend console logs below.</p>
              </div>
              <button
                onClick={() => setEnableDebugLog(!enableDebugLog)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enableDebugLog ? 'bg-indigo-600' : 'bg-slate-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enableDebugLog ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-white block mb-1">Hardware Transcoding (GPU Acceleration)</label>
                <p className="text-xs text-white/80">Automatically detects and uses NVENC, QSV, or AMF to reduce CPU load when playing HEVC streams.</p>
              </div>
              <button
                onClick={() => setIntelTranscoding(!intelTranscoding)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${intelTranscoding ? 'bg-indigo-600' : 'bg-slate-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${intelTranscoding ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {enableDebugLog && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-white">Live Logs</h3>
                  <button 
                    onClick={() => logger.clearLogs()}
                    className="text-xs px-3 py-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded transition-colors"
                  >
                    Clear Logs
                  </button>
                </div>
                <div className="bg-black/50 border border-white/10 rounded-lg p-4 h-64 overflow-y-auto font-mono text-xs flex flex-col gap-1 custom-scrollbar">
                  {debugLogs.length === 0 ? (
                    <div className="text-white/40 italic">Waiting for logs...</div>
                  ) : (
                    debugLogs.map((log, i) => (
                      <div key={i} className="flex gap-3">
                        <span className="text-white/40 shrink-0">[{log.timestamp}]</span>
                        {log.source === 'backend' ? (
                          <span className="text-purple-400 font-bold shrink-0 w-8">[BE]</span>
                        ) : (
                          <span className="text-emerald-400 font-bold shrink-0 w-8">[FE]</span>
                        )}
                        <span className={`shrink-0 w-10 uppercase ${
                          log.level === 'error' ? 'text-red-400' : 
                          log.level === 'warn' ? 'text-yellow-400' : 
                          'text-blue-400'
                        }`}>
                          {log.level}
                        </span>
                        <span className="text-white/80 break-words whitespace-pre-wrap">{log.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

          </div>
        )}
      </div>
    </div>
  );
}
