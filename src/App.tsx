/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider, useIsFetching } from '@tanstack/react-query';
import ReactPlayer from 'react-player';
import { Play, Search, Tv, Clapperboard, MonitorPlay, Settings, History, Check, Bookmark, Home, X, Music , ArrowLeft, Subtitles, AudioLines, Info, FastForward, Rewind } from 'lucide-react';
import { collection, query, where, onSnapshot } from './lib/localDb';
import { db } from './lib/localDb';
import { logger } from './lib/logger';
import CatalogGrid from './components/CatalogGrid';
import TvSeriesGrid from './components/TvSeriesGrid';
import IptvGuide from './components/IptvGuide';
import MediaModal from './components/MediaModal';
import SettingsPanel from './components/SettingsPanel';
import { AuthButton, AuthModal, useAuth } from './components/Auth';
import LibraryGrid from './components/LibraryGrid';
import { BackgroundUpdater } from './components/BackgroundUpdater';
import { VirtualKeyboard } from './components/VirtualKeyboard';
import HomePanel from './components/HomePanel';
import SearchPanel from './components/SearchPanel';


const queryClient = new QueryClient();


const formatTime = (secs: number) => {
  if (!secs) return "00:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

function MainApp() {
  const isFetching = useIsFetching();
  const isPageLoading = isFetching > 0;

  const [selectedMovie, setSelectedMovie] = useState<any>(null);
  const [playerStatus, setPlayerStatus] = useState<string>('STREAM READY');
  const [isTranscoding, setIsTranscoding] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingUrl, setPlayingUrl] = useState<string>('');
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [mediaInfo, setMediaInfo] = useState<any>(null);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number>(0);
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState<number | null>(null);
  const [showMediaInfo, setShowMediaInfo] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [totalDuration, setTotalDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [bufferedSeconds, setBufferedSeconds] = useState<number>(0);
  const [streamOffset, setStreamOffset] = useState<number>(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isIdle, setIsIdle] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [musicSearchQuery, setMusicSearchQuery] = useState<string>('');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('home');
  const [sortOption, setSortOption] = useState<string>('newest');
  const [filterGenre, setFilterGenre] = useState<number>(0);
  const [showFilters, setShowFilters] = useState(false);

  const { user } = useAuth();
  const [favorites, setFavorites] = useState<any[]>([]);
  const [backgroundPoster, setBackgroundPoster] = useState<string>('');
  const [hoveredPoster, setHoveredPoster] = useState<string>('');
  const [firstAdminPassword, setFirstAdminPassword] = useState<string | null>(
    () => sessionStorage.getItem('firstAdminPassword')
  );

  const activePoster = activeTab === 'music' ? '/music_backdrop.jpg' : (hoveredPoster || (selectedMovie?.poster) || backgroundPoster);

  const selectRandomBackdrop = (itemsList: any[]) => {
    if (itemsList.length > 0) {
      const randomIndex = Math.floor(Math.random() * itemsList.length);
      const randomItem = itemsList[randomIndex];
      if (randomItem && randomItem.poster) {
        setBackgroundPoster(randomItem.poster);
      }
    } else {
      setBackgroundPoster('');
    }
  };

  useEffect(() => {
    // Sync configurations set via Docker env variables to client localStorage automatically on boot
    fetch('/api/auth/config')
      .then(res => res.json())
      .then(data => {
        if (data.tmdbKey) localStorage.setItem('tmdbKey', data.tmdbKey);
        if (data.torboxApiKey) localStorage.setItem('torboxApiKey', data.torboxApiKey);
        if (data.preferHEVC !== null) localStorage.setItem('preferHEVC', String(data.preferHEVC));
        if (data.maxResults) localStorage.setItem('maxResults', data.maxResults);
        if (data.streamBufferSeconds) localStorage.setItem('streamBufferSeconds', data.streamBufferSeconds);
        if (data.iptvUrl) localStorage.setItem('iptvUrl', data.iptvUrl);
        if (data.epgUrl) localStorage.setItem('epgUrl', data.epgUrl);
        if (data.epgOffset !== null) localStorage.setItem('epgOffset', String(data.epgOffset));
        if (data.xtreamServer) localStorage.setItem('xtreamServer', data.xtreamServer);
        if (data.xtreamUsername) localStorage.setItem('xtreamUsername', data.xtreamUsername);
        if (data.xtreamPassword) localStorage.setItem('xtreamPassword', data.xtreamPassword);
        if (data.usenetHost) localStorage.setItem('usenetHost', data.usenetHost);
        if (data.usenetPort) localStorage.setItem('usenetPort', data.usenetPort);
        if (data.usenetUsername) localStorage.setItem('usenetUsername', data.usenetUsername);
        if (data.usenetPassword) localStorage.setItem('usenetPassword', data.usenetPassword);
      })
      .catch(err => console.error('[Config Sync] Failed to load server configs:', err));
  }, []);

  useEffect(() => {
    if (!user) {
      setFavorites([]);
      setBackgroundPoster('');
      return;
    }

    const q = query(collection(db, 'favorites'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => doc.data());
      setFavorites(items);
      // Select initially
      selectRandomBackdrop(items);
    }, (error) => {
      console.error('Error in onSnapshot for background backdrop:', error);
    });
    return () => unsubscribe();
  }, [user]);

  // When activeTab changes, pick a new random background for a dynamic aesthetic
  useEffect(() => {
    if (favorites.length > 0) {
      selectRandomBackdrop(favorites);
    }
  }, [activeTab]);


  
  useEffect(() => {
    let timeout: any;
    const handleMouseMove = () => {
      setIsIdle(false);
      clearTimeout(timeout);
      timeout = setTimeout(() => setIsIdle(true), 3000);
    };
    if (isPlaying) {
      window.addEventListener('mousemove', handleMouseMove);
      timeout = setTimeout(() => setIsIdle(true), 3000);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(timeout);
    };
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying && selectedMovie?.id) {
      const type = selectedMovie.name ? 'tv' : 'movie';
      const url = `https://api.themoviedb.org/3/${type}/${selectedMovie.id}/images?api_key=b4d4dfa06829b83e3a8b08fc89372a9d&include_image_language=en,null`;
      console.log('Fetching logo from:', url);
      fetch(url)
        .then(res => res.json())
        .then(data => {
          console.log('Logo data:', data.logos?.length);
          const logo = data.logos?.find((l: any) => l.iso_639_1 === 'en') || data.logos?.[0];
          if (logo) {
            setLogoUrl(`https://image.tmdb.org/t/p/w500${logo.file_path}`);
            console.log('Set logo to:', logo.file_path);
          } else {
            setLogoUrl('');
          }
        }).catch((e) => { console.error('Logo fetch error:', e); setLogoUrl(''); });
    } else {
      setLogoUrl('');
    }
  }, [isPlaying, selectedMovie]);

  
  const handleSeek = (secondsToAdd: number) => {
    if (!totalDuration) return;
    setStreamOffset(prevOffset => {
      const currentAbsoluteTime = prevOffset + (videoRef.current?.currentTime || 0);
      let newTime = currentAbsoluteTime + secondsToAdd;
      if (newTime < 0) newTime = 0;
      if (newTime > totalDuration) newTime = totalDuration;
      
      setCurrentTime(0);
      return newTime;
    });
  };

  useEffect(() => {
    if (!isPlaying) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') {
        handleSeek(30);
      } else if (e.key === 'ArrowLeft') {
        handleSeek(-15);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, totalDuration]);

  useEffect(() => {
    if (isPlaying && playingUrl) {
      setTotalDuration(0);
      setCurrentTime(0);
      fetch(`/api/duration?url=${encodeURIComponent(playingUrl)}`)
        .then(res => res.json())
        .then(data => {
          if (data.duration) setTotalDuration(Number(data.duration));
        }).catch(e => console.error("Duration fetch error:", e));

      fetch(`/api/media-info?url=${encodeURIComponent(playingUrl)}`)
        .then(res => res.json())
        .then(data => {
          setMediaInfo(data);
        }).catch(e => console.error("Media info fetch error:", e));
    }
  }, [isPlaying, playingUrl]);

  const handlePlayStream = async (url: string) => {
    logger.info("Built-in Player: Requesting to play stream", { url });
    setStreamOffset(0);
    setCurrentTime(0);
    setBufferedSeconds(0);
    setTotalDuration(0);
    setSelectedAudioTrack(0);
    setSelectedSubtitleTrack(null);
    setMediaInfo(null);
    setPlayerStatus('BUFFERING...');
    setIsPlaying(true);
    setPlayingUrl(url);
    let savedPlayer = 'mpv';
    try {
      savedPlayer = localStorage.getItem('playerPath') || 'mpv';
    } catch (e) {}

    if ((window as any).mediaAPI && savedPlayer !== 'builtin') {
      try {
        (window as any).mediaAPI.playStream(url);
        setPlayerStatus('PLAYING 4K HDR');
      } catch (e) {
        setPlayerStatus('ERROR SPAWNING MPV');
      }
    }
  };

  return (
    <>
      <AuthModal />
      {/* First-admin generated password banner */}
      {firstAdminPassword && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-lg px-4">
          <div className="bg-amber-950/95 border border-amber-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-md flex gap-4 items-start">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-amber-300 font-bold text-sm mb-1">Your Admin Password (save this now!)</p>
              <p className="text-white/60 text-xs mb-2">This is the only time your auto-generated password will be shown.</p>
              <code className="block bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-amber-300 font-mono text-lg font-bold tracking-widest select-all">{firstAdminPassword}</code>
            </div>
            <button
              onClick={() => { setFirstAdminPassword(null); sessionStorage.removeItem('firstAdminPassword'); }}
              className="text-white/30 hover:text-white transition-colors shrink-0 mt-0.5"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
      <div className="h-screen w-full bg-[#050507] text-white font-sans flex overflow-hidden select-none relative">
      <BackgroundUpdater />
      {/* Real Web Video Player Overlay */}
      {isPlaying && (!(window as any).mediaAPI || localStorage.getItem('playerPath') === 'builtin') && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
          <div className={`absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-[110] bg-gradient-to-b from-black/80 to-transparent pointer-events-none transition-opacity duration-500 ${isIdle ? 'opacity-0' : 'opacity-100'}`}>
            <div className="flex gap-4 pointer-events-auto items-center">
              <button 
                onClick={() => { 
                  setIsPlaying(false); 
                  setPlayerStatus('STREAM READY'); 
                  setPlayingUrl('');
                  setStreamOffset(0);
                  setCurrentTime(0);
                  setBufferedSeconds(0);
                  setTotalDuration(0);
                  setSelectedAudioTrack(0);
                  setSelectedSubtitleTrack(null);
                  setMediaInfo(null);
                }}
                className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-colors shadow-lg"
                title="Go Back"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-28 object-contain filter drop-shadow-2xl" />
              ) : selectedMovie ? (
                <h1 className="text-white text-xl font-bold tracking-wide drop-shadow-md">{selectedMovie.title || selectedMovie.name}</h1>
              ) : null}
            </div>
              {/* Media Info Modal */}
              {showMediaInfo && mediaInfo && (
                <div className="absolute top-24 right-10 bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 min-w-72 shadow-2xl z-[120] pointer-events-auto transform transition-all animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-3">
                    <h2 className="text-white font-bold text-lg flex items-center gap-2"><Info className="w-5 h-5 text-red-500"/> Media Info</h2>
                    <button onClick={() => setShowMediaInfo(false)} className="text-white/40 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-colors"><X className="w-5 h-5"/></button>
                  </div>
                  <div className="flex flex-col gap-3 text-sm">
                    <div className="flex justify-between items-center"><span className="text-white/50 font-medium">Container</span> <span className="text-white font-mono bg-white/5 px-2 py-1 rounded">{(mediaInfo.format?.format_name || '').split(',')[0].toUpperCase()}</span></div>
                    <div className="flex justify-between items-center"><span className="text-white/50 font-medium">Bitrate</span> <span className="text-white font-mono bg-white/5 px-2 py-1 rounded">{Math.round((mediaInfo.format?.bit_rate || 0)/1000)} kbps</span></div>
                    {mediaInfo.streams?.filter((s) => s.codec_type === 'video')[0] && (
                      <>
                        <div className="flex justify-between items-center"><span className="text-white/50 font-medium">Video Codec</span> <span className="text-white font-mono bg-white/5 px-2 py-1 rounded">{mediaInfo.streams.find((s) => s.codec_type === 'video').codec_name?.toUpperCase() || 'N/A'}</span></div>
                        <div className="flex justify-between items-center"><span className="text-white/50 font-medium">Resolution</span> <span className="text-white font-mono bg-white/5 px-2 py-1 rounded">{mediaInfo.streams.find((s) => s.codec_type === 'video').width}x{mediaInfo.streams.find((s) => s.codec_type === 'video').height}</span></div>
                      </>
                    )}
                    {mediaInfo.streams?.filter((s) => s.codec_type === 'audio').length > 0 && (
                      <div className="flex justify-between items-center"><span className="text-white/50 font-medium">Audio Tracks</span> <span className="text-white font-mono bg-white/5 px-2 py-1 rounded">{mediaInfo.streams.filter((s) => s.codec_type === 'audio').length}</span></div>
                    )}
                    {mediaInfo.streams?.filter((s: any) => s.codec_type === 'subtitle').length > 0 && (
                      <div className="flex justify-between items-center"><span className="text-white/50 font-medium">Subtitles</span> <span className="text-white font-mono bg-white/5 px-2 py-1 rounded">{mediaInfo.streams.filter((s: any) => s.codec_type === 'subtitle').length}</span></div>
                    )}
                  {bufferedSeconds > 0 && (
                    <div className="flex justify-between items-center"><span className="text-white/50 font-medium">Local Client Buffer</span> <span className="text-emerald-400 font-mono bg-white/5 px-2 py-1 rounded">{Math.round(Math.max(0, bufferedSeconds - currentTime))}s ahead</span></div>
                  )}
                  </div>
                </div>
              )}
          </div>
          <div className="flex-1 w-full h-full relative flex items-center justify-center bg-black">
            
          {/* We determine the URL right before passing it to the player */}
          {true ? (
            <>
              <video 
                key={`${streamOffset}-${selectedAudioTrack}`}
                ref={videoRef}
                src={`/api/transcode/stream.mp4?url=${encodeURIComponent(playingUrl)}&audio=${selectedAudioTrack}&start=${streamOffset}&audioLeveling=${(() => {
                  try {
                    const saved = localStorage.getItem('userSettings_' + user?.uid);
                    return saved ? JSON.parse(saved).enableAudioLeveling === true : false;
                  } catch { return false; }
                })()}&bufsize=${Math.max(16, Math.round((15000000 * parseInt(localStorage.getItem('streamBufferSeconds') || '60', 10)) / 8000000))}M`}
                autoPlay
                className="w-full h-full object-contain absolute top-0 left-0"
                onTimeUpdate={(e) => {
                  setCurrentTime(e.currentTarget.currentTime);
                  if (e.currentTarget.buffered.length > 0) {
                    setBufferedSeconds(e.currentTarget.buffered.end(e.currentTarget.buffered.length - 1));
                  }
                }}
                onProgress={(e) => {
                  if (e.currentTarget.buffered.length > 0) {
                    setBufferedSeconds(e.currentTarget.buffered.end(e.currentTarget.buffered.length - 1));
                  }
                }}
                onLoadStart={() => {
                  logger.info("Built-in Player: Load started", { src: videoRef.current?.src });
                }}
                onError={(e) => {
                  const error = e.currentTarget.error;
                  logger.error("Built-in Player Error", { 
                    code: error?.code, 
                    message: error?.message, 
                    networkState: e.currentTarget.networkState,
                    readyState: e.currentTarget.readyState,
                    src: e.currentTarget.src 
                  });
                  console.error("Video element error", e);
                  setPlayerStatus("ERROR: Video failed to load.");
                }}
                onPlay={() => { 
                  logger.info("Built-in Player: Playing");
                  setIsVideoPlaying(true); 
                  setPlayerStatus("PLAYING 4K HDR"); 
                }}
                onPause={() => { 
                  logger.info("Built-in Player: Paused");
                  setIsVideoPlaying(false); 
                }}
                onWaiting={() => { 
                  logger.info("Built-in Player: Buffering");
                  setPlayerStatus("BUFFERING..."); 
                }}
              >
                {selectedSubtitleTrack !== null && (
                  <track
                    key={`sub-${selectedSubtitleTrack}`}
                    kind="subtitles"
                    src={`/api/transcode/subtitle.vtt?url=${encodeURIComponent(playingUrl)}&track=${mediaInfo?.streams?.filter((s: any) => s.codec_type === 'subtitle').findIndex((s: any) => s.index === selectedSubtitleTrack)}`}
                    default
                  />
                )}
              </video>
              <div className={`absolute bottom-0 left-0 right-0 p-8 pb-12 flex flex-col gap-4 z-[110] bg-gradient-to-t from-black/90 to-transparent pointer-events-none transition-opacity duration-500 ${isIdle ? 'opacity-0' : 'opacity-100'}`}>
                <div className="flex items-center gap-6 pointer-events-auto w-full max-w-5xl mx-auto">
                  <button 
                    onClick={() => handleSeek(-15)}
                    className="p-3 rounded-full hover:bg-white/10 text-white transition-colors"
                    title="Rewind 15s"
                  >
                    <Rewind className="w-6 h-6" />
                  </button>
                  <button 
                    onClick={() => {
                      if (videoRef.current) {
                        if (isVideoPlaying) videoRef.current.pause();
                        else videoRef.current.play();
                      }
                    }}
                    className="p-4 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-colors"
                  >
                    {isVideoPlaying ? <span className="font-bold text-lg leading-none">||</span> : <Play className="w-6 h-6 fill-current" />}
                  </button>
                  <button 
                    onClick={() => handleSeek(30)}
                    className="p-3 rounded-full hover:bg-white/10 text-white transition-colors"
                    title="Forward 30s"
                  >
                    <FastForward className="w-6 h-6" />
                  </button>
                  <div className="text-white text-sm font-mono font-medium drop-shadow-md">
                    {formatTime(streamOffset + currentTime)}
                  </div>
                  <div 
                    className="flex-1 bg-white/20 h-3 rounded-full overflow-hidden relative shadow-inner cursor-pointer"
                    onClick={(e) => {
                      if (!totalDuration) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const percentage = x / rect.width;
                      const newTime = percentage * totalDuration;
                      setStreamOffset(newTime);
                      setCurrentTime(0);
                    }}
                  >
                    <div 
                      className="absolute top-0 left-0 bottom-0 bg-white/30 transition-all duration-300 pointer-events-none" 
                      style={{ width: `${totalDuration > 0 ? ((streamOffset + bufferedSeconds) / totalDuration) * 100 : 0}%` }}
                    />
                    <div 
                      className="absolute top-0 left-0 bottom-0 bg-red-500 transition-all duration-300 pointer-events-none" 
                      style={{ width: `${totalDuration > 0 ? ((streamOffset + currentTime) / totalDuration) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="text-white/80 text-sm font-mono font-medium drop-shadow-md mr-4">
                    {formatTime(totalDuration)}
                  </div>
                  <div className="flex items-center gap-2 border-l border-white/20 pl-6 relative">
                    <button onClick={() => { setShowSubtitleMenu(!showSubtitleMenu); setShowAudioMenu(false); }} className={`text-white/70 hover:text-white p-2 rounded-full transition-colors ${showSubtitleMenu ? 'bg-white/20 text-white' : 'hover:bg-white/10'}`} title="Subtitles / CC">
                      <Subtitles className="w-5 h-5" />
                    </button>
                    <button onClick={() => { setShowAudioMenu(!showAudioMenu); setShowSubtitleMenu(false); }} className={`text-white/70 hover:text-white p-2 rounded-full transition-colors ${showAudioMenu ? 'bg-white/20 text-white' : 'hover:bg-white/10'}`} title="Audio Track">
                      <AudioLines className="w-5 h-5" />
                    </button>
                    <button onClick={() => setShowMediaInfo(!showMediaInfo)} className={`text-white/70 hover:text-white p-2 rounded-full transition-colors ${showMediaInfo ? 'bg-white/20 text-white' : 'hover:bg-white/10'}`} title="Media Info (Codec, Bitrate)">
                      <Info className="w-5 h-5" />
                    </button>
                    
                    {/* Popover Menus */}
                    {(showSubtitleMenu || showAudioMenu) && (
                      <div className="absolute bottom-16 right-0 bg-black/95 border border-white/20 rounded-xl p-4 min-w-64 shadow-2xl flex flex-col gap-2 max-h-64 overflow-y-auto z-[130] backdrop-blur-xl">
                        {showAudioMenu && mediaInfo && (
                          <>
                            <h3 className="text-white/50 font-bold text-xs uppercase tracking-wider border-b border-white/20 pb-2 mb-2">Audio Tracks</h3>
                            {mediaInfo.streams?.filter((s: any) => s.codec_type === 'audio').map((stream: any, idx: number) => (
                              <button 
                                key={idx}
                                onClick={() => { setSelectedAudioTrack(stream.index); setShowAudioMenu(false); }}
                                className={`text-left text-sm px-3 py-2 rounded transition-colors ${selectedAudioTrack === stream.index ? 'bg-red-600 text-white font-medium shadow-lg' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
                              >
                                {stream.tags?.language ? stream.tags.language.toUpperCase() : 'Track'} {idx + 1} - {stream.codec_name.toUpperCase()} {stream.channels ? `(${stream.channels}ch)` : ''}
                              </button>
                            ))}
                          </>
                        )}
                        {showSubtitleMenu && mediaInfo && (
                          <>
                            <h3 className="text-white/50 font-bold text-xs uppercase tracking-wider border-b border-white/20 pb-2 mb-2">Subtitles</h3>
                            <button 
                                onClick={() => { setSelectedSubtitleTrack(null); setShowSubtitleMenu(false); }}
                                className={`text-left text-sm px-3 py-2 rounded transition-colors ${selectedSubtitleTrack === null ? 'bg-red-600 text-white font-medium shadow-lg' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
                              >
                                None (Off)
                              </button>
                            {mediaInfo.streams?.filter((s: any) => s.codec_type === 'subtitle').map((stream: any, idx: number) => (
                              <button 
                                key={idx}
                                onClick={() => { setSelectedSubtitleTrack(stream.index); setShowSubtitleMenu(false); }}
                                className={`text-left text-sm px-3 py-2 rounded transition-colors ${selectedSubtitleTrack === stream.index ? 'bg-red-600 text-white font-medium shadow-lg' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
                              >
                                {stream.tags?.title || stream.tags?.language?.toUpperCase() || `Track ${idx + 1}`} ({stream.codec_name})
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            null
          )}

          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="w-20 bg-black/60 border-r border-white/10 flex flex-col items-center py-10 gap-10 z-20 shrink-0">
        <div className="select-none cursor-pointer flex items-center justify-center hover:scale-110 transition-transform duration-300" title="BUBBAFLIX">
          <img src="https://raw.githubusercontent.com/jsanderstechnologies/BubbaFlix-Media-Center/main/public/icon.svg" alt="BubbaFlix Icon" className="w-10 h-10 drop-shadow-lg" />
        </div>
        <div className="flex flex-col gap-8 text-white/60 w-full px-2">
          <div 
            onClick={() => { setActiveTab('home'); setSearchQuery(''); }}
            className={`hover:text-white transition-colors cursor-pointer flex flex-col items-center gap-1.5 ${activeTab === 'home' ? 'text-red-500' : ''}`}
            title="Home"
          >
            <Home className="w-6 h-6" />
            <span className="text-[9px] uppercase tracking-wider font-medium">Home</span>
          </div>
          <div 
            onClick={() => { setActiveTab('tv'); setSearchQuery(''); }}
            className={`hover:text-white transition-colors cursor-pointer flex flex-col items-center gap-1.5 ${activeTab === 'tv' ? 'text-red-500' : ''}`}
            title="Live TV"
          >
            <MonitorPlay className="w-6 h-6" />
            <span className="text-[9px] uppercase tracking-wider font-medium">Live</span>
          </div>
          <div 
            onClick={() => { setActiveTab('series'); setSearchQuery(''); }}
            className={`hover:text-white transition-colors cursor-pointer flex flex-col items-center gap-1.5 ${activeTab === 'series' ? 'text-red-500' : ''}`}
            title="TV Series"
          >
            <Tv className="w-6 h-6" />
            <span className="text-[9px] uppercase tracking-wider font-medium">Series</span>
          </div>
          <div 
            onClick={() => { setActiveTab('catalog'); setSearchQuery(''); }}
            className={`hover:text-white transition-colors cursor-pointer flex flex-col items-center gap-1.5 ${activeTab === 'catalog' ? 'text-red-500' : ''}`}
            title="Movies"
          >
            <Clapperboard className="w-6 h-6" />
            <span className="text-[9px] uppercase tracking-wider font-medium">Movies</span>
          </div>
          <div 
            onClick={() => { setActiveTab('library'); setSearchQuery(''); }}
            className={`hover:text-white transition-colors cursor-pointer flex flex-col items-center gap-1.5 ${activeTab === 'library' ? 'text-red-500' : ''}`}
            title="Library / Favorites"
          >
            <Bookmark className="w-6 h-6" />
            <span className="text-[9px] uppercase tracking-wider font-medium">Library</span>
          </div>
          {user?.role === 'admin' && (
            <div 
              onClick={() => { setActiveTab('settings'); setSearchQuery(''); }}
              className={`hover:text-white transition-colors cursor-pointer flex flex-col items-center gap-1.5 ${activeTab === 'settings' ? 'text-red-500' : ''}`}
              title="Settings"
            >
              <Settings className="w-6 h-6" />
              <span className="text-[9px] uppercase tracking-wider font-medium">Settings</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full bg-[#050507] overflow-hidden relative z-0">
        {activePoster && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10">
            <div 
              className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-in-out scale-100"
              style={{ backgroundImage: `url(${activePoster})`, opacity: 0.45 }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050507] via-[#050507]/60 to-black/30" />
          </div>
        )}
        {!activePoster && (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0c0c12] to-[#050507] pointer-events-none -z-10" />
        )}
        
        {/* Header */}
        <header className="h-20 shrink-0 flex items-center justify-between px-10 border-b border-white/5 bg-black/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-5">
            {/* BUBBAFLIX Full Brand Logo */}
            <svg 
              viewBox="0 0 320 70" 
              className="w-44 h-12 select-none cursor-pointer hover:scale-105 transition-transform duration-300 drop-shadow-[0_0_15px_rgba(229,9,20,0.25)]" 
              onClick={() => setActiveTab('home')}
            >
              <defs>
                {/* A precise quadratic Bezier curve to arch the BUBBAFLIX text perfectly */}
                <path id="bubbaflix-curve" d="M 12,56 Q 160,20 308,56" fill="none" />
                
                {/* Rich 3D cinematic red gradient */}
                <linearGradient id="bubbaflix-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ff4d4d" />
                  <stop offset="35%" stopColor="#e50914" />
                  <stop offset="75%" stopColor="#b30000" />
                  <stop offset="100%" stopColor="#7a0000" />
                </linearGradient>

                {/* Combined professional text-shadow & vibrant backglow filter */}
                <filter id="bubbaflix-glow" x="-20%" y="-20%" width="140%" height="140%">
                  {/* Deep black structural drop shadow for readability */}
                  <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.95"/>
                  {/* Subtle red ambient backglow to separate logo from dark background */}
                  <feDropShadow dx="0" dy="0" stdDeviation="5.5" floodColor="#e50914" floodOpacity="0.45"/>
                </filter>
              </defs>
              <text 
                fontFamily="'Bebas Neue', 'Impact', sans-serif" 
                fontSize="56" 
                fontWeight="900" 
                fill="url(#bubbaflix-gradient)" 
                stroke="url(#bubbaflix-gradient)" 
                strokeWidth="2.8" 
                strokeLinejoin="round"
                letterSpacing="-1.2"
                filter="url(#bubbaflix-glow)"
              >
                <textPath href="#bubbaflix-curve" startOffset="50%" textAnchor="middle">
                  BUBBAFLIX
                </textPath>
              </text>
            </svg>
            <div className="w-px h-6 bg-white/10 hidden sm:block" />
            <div className="flex items-center gap-4">
             {activeTab === 'home' && (
                <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white">
                  <span className="text-red-500 font-medium italic">Home</span>
                </h1>
              )}
              {activeTab === 'search' && (
                <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white">
                  <span className="text-red-500 font-medium italic">Search</span>
                </h1>
              )}
              {activeTab === 'music' && (
                <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white">
                  <span className="text-red-500 font-medium italic">Music</span>
                </h1>
              )}
              {activeTab === 'catalog' && (
              <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white">
                Movie <span className="text-red-500 font-medium italic">Catalog</span>
              </h1>
            )}
            {activeTab === 'series' && (
              <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white">
                TV <span className="text-red-500 font-medium italic">Series</span>
              </h1>
            )}
            {activeTab === 'library' && (
              <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white">
                My <span className="text-red-500 font-medium italic">Library</span>
              </h1>
            )}
            {activeTab === 'tv' && (
              <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white">
                Live <span className="text-emerald-400 font-medium italic">TV Guide</span>
              </h1>
            )}
            {activeTab === 'settings' && (
              <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white">
                <span className="text-red-500 font-medium italic">Settings</span>
              </h1>
            )}
          </div>
        </div>
        <div className="flex items-center gap-6">
            {/* Loading Status Circles */}
            <div className="flex items-center gap-3">
              {/* Stream Status Circle */}
              {isPlaying && (
                <div 
                  className={`flex items-center gap-2 bg-black/40 border px-3 py-1.5 rounded-full select-none transition-all duration-300 ${
                    playerStatus.includes('BUFFERING') 
                      ? 'border-red-500/20 text-red-400 bg-red-950/10' 
                      : 'border-emerald-500/20 text-emerald-400 bg-emerald-950/10'
                  }`}
                  title={`Stream Status: ${playerStatus}`}
                >
                  <span className="relative flex h-2 w-2">
                    {playerStatus.includes('BUFFERING') && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${
                      playerStatus.includes('BUFFERING') ? 'bg-red-500' : 'bg-emerald-500'
                    }`}></span>
                  </span>
                  <span className="text-[10px] font-mono font-semibold tracking-widest uppercase">
                    {playerStatus.includes('BUFFERING') ? 'STREAM BUFFERING' : 'STREAM PLAYING'}
                  </span>
                </div>
              )}

              {/* Page / Metadata Catalog Loading Circle */}
              {isPageLoading && (
                <div 
                  className="flex items-center gap-2 bg-black/40 border border-indigo-500/20 px-3 py-1.5 rounded-full select-none text-indigo-400 bg-indigo-950/10 transition-all duration-300"
                  title="Retrieving media content..."
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                  </span>
                  <span className="text-[10px] font-mono font-semibold tracking-widest uppercase animate-pulse">
                    LOADING CONTENT
                  </span>
                </div>
              )}
            </div>

            <div 
              className="bg-white/5 border border-white/10 px-4 py-2 rounded-full flex items-center gap-3 w-48 sm:w-64 cursor-pointer hover:bg-white/10 transition-colors relative"
              onClick={() => {
                setActiveTab('search');
                setIsKeyboardOpen(true);
              }}
            >
              <Search className="w-4 h-4 text-white/50 shrink-0" />
              <input 
                type="text" 
                placeholder="Search Catalog..." 
                className="bg-transparent border-none outline-none text-sm text-white w-full pr-6 placeholder-white/30 cursor-pointer"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setActiveTab('search');
                }}
                onFocus={(e) => {
                  e.target.blur();
                  setActiveTab('search');
                  setIsKeyboardOpen(true);
                }}
                readOnly
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSearchQuery('');
                  }}
                  className="absolute right-3 p-1 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center cursor-pointer z-10"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <AuthButton />
          </div>
        </header>

        {/* Main View */}
        <main className="flex-1 p-6 sm:p-10 overflow-y-auto flex flex-col gap-8 custom-scrollbar">
          
          {activeTab === 'home' ? (
            <HomePanel onSelectMedia={setSelectedMovie} onHoverMedia={setHoveredPoster} />
          ) : activeTab === 'catalog' ? (
            <>
              <div className="flex items-center justify-end shrink-0 gap-2">
                {showFilters && (
                  <div className="flex gap-2 mr-2">
                    <select 
                      value={filterGenre} 
                      onChange={(e) => setFilterGenre(Number(e.target.value))}
                      className="bg-black/40 border border-white/10 text-white text-xs rounded px-2 py-1.5 outline-none"
                    >
                      <option value={0} className="bg-slate-900 text-white">All Genres</option>
                      {MOVIE_GENRES.map(g => (
                        <option key={g.id} value={g.id} className="bg-slate-900 text-white">{g.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className={`px-4 py-1.5 rounded text-xs font-bold tracking-wider transition-colors ${showFilters ? 'bg-indigo-600' : 'bg-white/5 border border-white/10 hover:bg-white/10'}`}
                >
                  FILTERS
                </button>
                <select 
                  value={sortOption} 
                  onChange={(e) => setSortOption(e.target.value)}
                  className="px-4 py-1.5 bg-white/5 rounded text-xs font-bold tracking-wider border border-white/10 outline-none appearance-none cursor-pointer hover:bg-white/10"
                >
                  <option value="default" className="bg-slate-900 text-white">SORT: DEFAULT</option>
                  <option value="newest" className="bg-slate-900 text-white">SORT: NEWEST</option>
                  <option value="oldest" className="bg-slate-900 text-white">SORT: OLDEST</option>
                  <option value="rating_high" className="bg-slate-900 text-white">SORT: RATING (HIGH)</option>
                  <option value="rating_low" className="bg-slate-900 text-white">SORT: RATING (LOW)</option>
                </select>
              </div>

              <CatalogGrid onSelectMovie={setSelectedMovie} onHoverMedia={setHoveredPoster} searchQuery="" sortOption={sortOption} filterGenre={filterGenre} />
            </>
          ) : activeTab === 'series' ? (
            <>
              <div className="flex items-center justify-end shrink-0 gap-2">
                {showFilters && (
                  <div className="flex gap-2 mr-2">
                    <select 
                      value={filterGenre} 
                      onChange={(e) => setFilterGenre(Number(e.target.value))}
                      className="bg-black/40 border border-white/10 text-white text-xs rounded px-2 py-1.5 outline-none"
                    >
                      <option value={0} className="bg-slate-900 text-white">All Genres</option>
                      {TV_GENRES.map(g => (
                        <option key={g.id} value={g.id} className="bg-slate-900 text-white">{g.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className={`px-4 py-1.5 rounded text-xs font-bold tracking-wider transition-colors ${showFilters ? 'bg-indigo-600' : 'bg-white/5 border border-white/10 hover:bg-white/10'}`}
                >
                  FILTERS
                </button>
                <select 
                  value={sortOption} 
                  onChange={(e) => setSortOption(e.target.value)}
                  className="px-4 py-1.5 bg-white/5 rounded text-xs font-bold tracking-wider border border-white/10 outline-none appearance-none cursor-pointer hover:bg-white/10"
                >
                  <option value="default" className="bg-slate-900 text-white">SORT: DEFAULT</option>
                  <option value="newest" className="bg-slate-900 text-white">SORT: NEWEST</option>
                  <option value="oldest" className="bg-slate-900 text-white">SORT: OLDEST</option>
                  <option value="rating_high" className="bg-slate-900 text-white">SORT: RATING (HIGH)</option>
                  <option value="rating_low" className="bg-slate-900 text-white">SORT: RATING (LOW)</option>
                </select>
              </div>

              <TvSeriesGrid onSelectSeries={setSelectedMovie} onHoverMedia={setHoveredPoster} searchQuery="" sortOption={sortOption} filterGenre={filterGenre} />
            </>
          ) : activeTab === 'search' ? (
            <SearchPanel 
              query={searchQuery}
              onSelectMedia={setSelectedMovie}
              onHoverMedia={setHoveredPoster}
              onSelectSuggestion={(term) => {
                setSearchQuery(term);
                setActiveTab('search');
              }}
              onActorSearchClick={(actorName) => {
                setSearchQuery(actorName);
                setActiveTab('search');
              }}
            />
          ) : activeTab === 'library' ? (
            <>
              <LibraryGrid onSelectMedia={setSelectedMovie} onHoverMedia={setHoveredPoster} />
            </>
          ) : activeTab === 'tv' ? (
            <IptvGuide onPlayStream={handlePlayStream} />
          ) : activeTab === 'settings' ? (
            user?.role === 'admin' ? <SettingsPanel /> : null
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
                <Tv className="w-10 h-10 text-white/50" />
              </div>
              <div>
                <h2 className="text-2xl font-light tracking-tight text-white capitalize">{activeTab}</h2>
                <p className="text-white/60 text-sm mt-2">This section is not yet implemented.</p>
              </div>
            </div>
          )}

        </main>
      </div>

      <MediaModal 
        movie={selectedMovie} 
        onClose={() => setSelectedMovie(null)} 
        onPlay={handlePlayStream} 
        onActorSearch={(actorName) => {
          setSearchQuery(actorName);
          setActiveTab('search');
          setSelectedMovie(null);
        }}
      />

      <VirtualKeyboard
        value={searchQuery}
        onChange={setSearchQuery}
        onClose={() => setIsKeyboardOpen(false)}
        isOpen={isKeyboardOpen}
      />
    </div>
    </>
  );
}

const MOVIE_GENRES = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Family' },
  { id: 14, name: 'Fantasy' },
  { id: 36, name: 'History' },
  { id: 27, name: 'Horror' },
  { id: 10402, name: 'Music' },
  { id: 9648, name: 'Mystery' },
  { id: 10749, name: 'Romance' },
  { id: 878, name: 'Science Fiction' },
  { id: 10770, name: 'TV Movie' },
  { id: 53, name: 'Thriller' },
  { id: 10752, name: 'War' },
  { id: 37, name: 'Western' }
];

const TV_GENRES = [
  { id: 10759, name: 'Action & Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Family' },
  { id: 10762, name: 'Kids' },
  { id: 9648, name: 'Mystery' },
  { id: 10763, name: 'News' },
  { id: 10764, name: 'Reality' },
  { id: 10765, name: 'Sci-Fi & Fantasy' },
  { id: 10766, name: 'Soap' },
  { id: 10767, name: 'Talk' },
  { id: 10768, name: 'War & Politics' },
  { id: 37, name: 'Western' }
];

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MainApp />
    </QueryClientProvider>
  );
}

