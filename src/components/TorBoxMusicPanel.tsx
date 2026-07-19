import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Play, Pause, Music, Search, Disc, Loader2, ArrowLeft, Download, Volume2, VolumeX, History
} from 'lucide-react';
import { fetchStreamsForMusic, TorBoxSearchResult } from '../services/torboxSearchApi';
import { useSettings } from '../lib/settings';

interface AudioFile {
  id: number;
  name: string;
  size: number;
  url: string;
}

export default function TorBoxMusicPanel({ initialQuery = '' }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const { systemSettings } = useSettings();
  
  const [selectedRelease, setSelectedRelease] = useState<TorBoxSearchResult | null>(null);
  const [releaseStatus, setReleaseStatus] = useState<string>('');
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  
  const [playingTrack, setPlayingTrack] = useState<AudioFile | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 500);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: searchResults, isLoading: isSearching } = useQuery<TorBoxSearchResult[]>({
    queryKey: ['torbox-music-search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) return [];
      return await fetchStreamsForMusic(debouncedQuery);
    },
    enabled: !!debouncedQuery,
  });

  const handleSelectRelease = async (release: TorBoxSearchResult) => {
    setSelectedRelease(release);
    setReleaseStatus('Adding to TorBox...');
    setAudioFiles([]);
    setPlayingTrack(null);
    setIsPlaying(false);

    try {
      const apiKey = systemSettings.torboxApiKey;
      if (!apiKey) {
        setReleaseStatus('Error: TorBox API Key is missing in Settings.');
        return;
      }

      let torrentId = 0;
      let usenetId = 0;

      // Create stream
      if (release.type === 'usenet') {
        const res = await fetch('/api/torbox/usenet/create', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ link: release.url })
        });
        const data = await res.json();
        if (data.detail && !data.success) throw new Error(data.detail);
        usenetId = data.data.usenet_id;
      } else {
        const res = await fetch('/api/torbox/torrents/create', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ magnet: release.url })
        });
        const data = await res.json();
        if (data.detail && !data.success) throw new Error(data.detail);
        torrentId = data.data.torrent_id;
      }

      setReleaseStatus('Caching release (this may take a few seconds)...');

      // Poll until ready
      const pollInterval = setInterval(async () => {
        try {
          const listRes = await fetch(release.type === 'usenet' ? '/api/torbox/usenet/list' : '/api/torbox/torrents', {
            headers: { Authorization: `Bearer ${apiKey}` }
          });
          const listData = await listRes.json();
          const items = listData.data || [];
          
          const match = items.find((i: any) => i.id === (release.type === 'usenet' ? usenetId : torrentId));
          if (match) {
            if (match.download_state === 'completed' || match.download_state === 'cached' || match.progress === 100 || match.status === 'completed') {
              clearInterval(pollInterval);
              setReleaseStatus('');
              
              // Extract audio files
              const validExts = ['.mp3', '.flac', '.m4a', '.wav', '.ogg'];
              const files = (match.files || []).filter((f: any) => {
                const ext = f.short_name.substring(f.short_name.lastIndexOf('.')).toLowerCase();
                return validExts.includes(ext);
              }).map((f: any) => ({
                id: f.id,
                name: f.short_name,
                size: f.size,
                url: release.type === 'usenet' 
                  ? `https://api.torbox.app/v1/api/usenet/requestdl?token=${apiKey}&usenet_id=${usenetId}&zip_link=false&redirect=true&file_id=${f.id}`
                  : `https://api.torbox.app/v1/api/torrents/requestdl?token=${apiKey}&torrent_id=${torrentId}&zip_link=false&redirect=true&file_id=${f.id}`
              }));
              
              files.sort((a: any, b: any) => a.name.localeCompare(b.name));
              setAudioFiles(files);
            } else if (match.download_state === 'downloading') {
              setReleaseStatus(`Downloading from peers... ${Math.round(match.progress || 0)}%`);
            } else if (match.download_state === 'error' || match.download_state === 'paused') {
              clearInterval(pollInterval);
              setReleaseStatus(`Error: TorBox could not cache this ${release.type}.`);
            }
          }
        } catch (e) {
          console.error("Polling error", e);
        }
      }, 3000);

      // Timeout after 2 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (releaseStatus.includes('Caching') || releaseStatus.includes('Downloading')) {
          setReleaseStatus('Timeout waiting for TorBox cache.');
        }
      }, 120000);

    } catch (e: any) {
      setReleaseStatus(`Error: ${e.message}`);
    }
  };

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration || 0);
    const handleEnded = () => {
      setIsPlaying(false);
      // Try to play next track
      if (playingTrack && audioFiles.length > 0) {
        const idx = audioFiles.findIndex(f => f.id === playingTrack.id);
        if (idx !== -1 && idx < audioFiles.length - 1) {
          playAudioFile(audioFiles[idx + 1]);
        }
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [playingTrack, audioFiles]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const playAudioFile = (file: AudioFile) => {
    if (!audioRef.current) return;
    if (playingTrack?.id === file.id) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().catch(e => console.error(e));
        setIsPlaying(true);
      }
    } else {
      setPlayingTrack(file);
      setIsPlaying(true);
      audioRef.current.src = file.url;
      audioRef.current.load();
      audioRef.current.play().catch(e => console.error(e));
    }
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!bytes || isNaN(bytes)) return "0 B";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="space-y-8 animate-fadeIn pb-32">
      {/* Search Bar */}
      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 shadow-lg max-w-3xl">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input 
            type="text"
            placeholder="Search TorBox for music albums (e.g., 'Daft Punk FLAC')..."
            className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/5 focus:border-red-500 rounded-xl text-sm text-white placeholder-white/30 outline-none transition-colors"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {!selectedRelease ? (
        <div className="space-y-4">
          <h2 className="text-lg font-light text-white tracking-wide">
            {isSearching ? 'Searching...' : debouncedQuery ? 'TorBox Music Results' : 'Search for music to stream directly from TorBox'}
          </h2>
          
          {isSearching && (
            <div className="flex items-center justify-center py-12 text-red-500">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          )}

          {!isSearching && searchResults && searchResults.length > 0 && (
            <div className="flex flex-col gap-2">
              {searchResults.map((res) => (
                <div 
                  key={res.id} 
                  onClick={() => handleSelectRelease(res)}
                  className="bg-black/40 border border-white/5 hover:border-red-500/50 p-4 rounded-xl cursor-pointer transition-colors group flex items-center justify-between"
                >
                  <div className="flex flex-col overflow-hidden pr-4">
                    <span className="text-white font-medium truncate group-hover:text-red-400 transition-colors">
                      {res.name}
                    </span>
                    <div className="flex items-center gap-3 text-xs text-white/40 mt-1">
                      <span className="uppercase tracking-wider px-1.5 py-0.5 bg-white/10 rounded text-[10px]">{res.type}</span>
                      <span>{res.size}</span>
                      {res.isCached && <span className="text-emerald-400">Cached</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-white/20 group-hover:text-red-500">
                    <Disc className="w-6 h-6" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <button 
            onClick={() => setSelectedRelease(null)}
            className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Results
          </button>
          
          <div className="bg-gradient-to-br from-red-900/20 to-black/40 border border-red-500/20 rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-2 break-words leading-tight">{selectedRelease.name}</h2>
            <div className="flex items-center gap-3 text-sm text-white/60">
              <span>{selectedRelease.size}</span>
              <span>•</span>
              <span className="uppercase">{selectedRelease.type}</span>
            </div>
          </div>

          {releaseStatus && (
            <div className="flex items-center gap-3 text-red-400 bg-red-950/20 border border-red-900/30 p-4 rounded-xl">
              {releaseStatus.includes('Adding') || releaseStatus.includes('Caching') || releaseStatus.includes('Downloading') ? (
                <Loader2 className="w-5 h-5 animate-spin shrink-0" />
              ) : null}
              <span>{releaseStatus}</span>
            </div>
          )}

          {audioFiles.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold tracking-wider uppercase text-white/40 mb-2 pl-2">Audio Files ({audioFiles.length})</h3>
              {audioFiles.map((file, idx) => {
                const isActive = playingTrack?.id === file.id;
                return (
                  <div 
                    key={file.id}
                    onClick={() => playAudioFile(file)}
                    className={`flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-all ${
                      isActive ? 'bg-red-500/10 border border-red-500/20' : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="w-6 text-center text-xs text-white/40 font-mono">
                      {isActive ? (
                        <div className="flex items-end justify-center gap-0.5 h-3">
                          <span className="w-1 h-3 bg-red-500 animate-pulse"></span>
                          <span className="w-1 h-2 bg-red-500 animate-pulse delay-75"></span>
                          <span className="w-1 h-3 bg-red-500 animate-pulse delay-150"></span>
                        </div>
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <div className="flex-1 flex flex-col truncate">
                      <span className={`truncate text-sm ${isActive ? 'text-red-400 font-medium' : 'text-white/80'}`}>
                        {file.name}
                      </span>
                    </div>
                    <div className="text-xs text-white/30 font-mono shrink-0">
                      {formatBytes(file.size)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Global Bottom Audio Player */}
      <div className={`fixed bottom-0 left-0 sm:left-64 right-0 bg-[#0a0a0f]/95 backdrop-blur-xl border-t border-white/10 p-4 transition-transform duration-500 flex flex-col gap-2 z-50 ${playingTrack ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="flex items-center justify-between max-w-5xl mx-auto w-full gap-4 sm:gap-8">
          
          {/* Track Info */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded bg-red-950 flex items-center justify-center shrink-0 border border-red-900/30">
              <Music className="w-5 h-5 text-red-500" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-white truncate">{playingTrack?.name}</span>
              <span className="text-xs text-white/40 truncate">{selectedRelease?.name}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col items-center flex-1 max-w-md w-full">
            <div className="flex items-center gap-6 mb-1.5">
              <button 
                onClick={() => playingTrack && playAudioFile(playingTrack)}
                className="w-10 h-10 flex items-center justify-center bg-white rounded-full hover:scale-105 transition-transform"
              >
                {isPlaying ? <Pause className="w-5 h-5 text-black" fill="currentColor" /> : <Play className="w-5 h-5 text-black pl-1" fill="currentColor" />}
              </button>
            </div>
            
            {/* Scrubber */}
            <div className="flex items-center gap-3 w-full text-xs text-white/40 font-mono">
              <span>{formatTime(currentTime)}</span>
              <div className="flex-1 h-1.5 bg-white/10 rounded-full relative overflow-hidden group cursor-pointer"
                   onClick={(e) => {
                     if (audioRef.current && duration) {
                       const rect = e.currentTarget.getBoundingClientRect();
                       const x = e.clientX - rect.left;
                       const percent = x / rect.width;
                       audioRef.current.currentTime = percent * duration;
                     }
                   }}>
                <div className="absolute top-0 left-0 bottom-0 bg-red-500 rounded-full" style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}></div>
              </div>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Volume */}
          <div className="hidden sm:flex items-center gap-3 flex-1 justify-end min-w-0">
            <button onClick={() => setIsMuted(!isMuted)} className="text-white/40 hover:text-white transition-colors">
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input 
              type="range" min="0" max="1" step="0.01" 
              value={isMuted ? 0 : volume} 
              onChange={(e) => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
              className="w-24 h-1 bg-white/10 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
