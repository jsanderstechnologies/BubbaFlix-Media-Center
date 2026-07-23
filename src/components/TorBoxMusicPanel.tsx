import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Play, Pause, Music, Search, Disc, Loader2, ArrowLeft, Download, Volume2, VolumeX, History, UserPlus, UserCheck, Video, X
} from 'lucide-react';
import { fetchStreamsForMusic, TorBoxSearchResult } from '../services/torboxSearchApi';
import { useSettings } from '../lib/settings';
import { useAuth } from './Auth';
import { collection, addDoc, query as firestoreQuery, onSnapshot, where, deleteDoc, doc, serverTimestamp, updateDoc, arrayUnion } from '../lib/localDb';
import { db } from '../lib/localDb';

interface AudioFile {
  id: number;
  name: string;
  size: number;
  url: string;
}

export default function TorBoxMusicPanel({ initialQuery = '' }: { initialQuery?: string }) {
  const [activeTab, setActiveTab] = useState<'search' | 'videos' | 'library' | 'playlists'>('search');
  const [selectedVideoModal, setSelectedVideoModal] = useState<any | null>(null);

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const { systemSettings } = useSettings();
  
  const [selectedAlbumDetails, setSelectedAlbumDetails] = useState<any | null>(null);
  const [selectedRelease, setSelectedRelease] = useState<TorBoxSearchResult | null>(null);
  const [releaseStatus, setReleaseStatus] = useState<string>('');
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  
  const [playingTrack, setPlayingTrack] = useState<AudioFile | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  
  const { user } = useAuth();
  const [savedArtists, setSavedArtists] = useState<any[]>([]);
  const [savedAlbums, setSavedAlbums] = useState<any[]>([]);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [selectedLibraryArtist, setSelectedLibraryArtist] = useState<any | null>(null);
  const [selectedLibraryAlbum, setSelectedLibraryAlbum] = useState<any | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<any | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!user) {
      setSavedArtists([]);
      setSavedAlbums([]);
      setPlaylists([]);
      return;
    }
    const qArtists = firestoreQuery(collection(db, 'saved_artists'), where('userId', '==', user.uid));
    const unSubArtists = onSnapshot(qArtists, (snapshot) => {
      setSavedArtists(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('Error fetching saved artists:', err));

    const qAlbums = firestoreQuery(collection(db, 'saved_albums'), where('userId', '==', user.uid));
    const unSubAlbums = onSnapshot(qAlbums, (snapshot) => {
      setSavedAlbums(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('Error fetching saved albums:', err));

    const qPlaylists = firestoreQuery(collection(db, 'music_playlists'), where('userId', '==', user.uid));
    const unSubPlaylists = onSnapshot(qPlaylists, (snapshot) => {
      setPlaylists(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('Error fetching playlists:', err));

    return () => {
      unSubArtists();
      unSubAlbums();
      unSubPlaylists();
    };
  }, [user]);

  const toggleSaveArtist = async (artistName: string, artworkUrl: string) => {
    if (!user) {
      alert("Please log in to add artists to your library.");
      return;
    }
    const existing = savedArtists.find(a => a.artistName.toLowerCase() === artistName.toLowerCase());
    if (existing) {
      try { await deleteDoc(doc(db, 'saved_artists', existing.id)); } catch (err) {}
    } else {
      try {
        await addDoc(collection(db, 'saved_artists'), {
          userId: user.uid,
          artistName: artistName,
          artwork: artworkUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=300&h=300',
          addedAt: serverTimestamp()
        });
      } catch (err) {}
    }
  };

  const [showSaveAlbumModal, setShowSaveAlbumModal] = useState(false);
  const [albumArtistName, setAlbumArtistName] = useState('');
  const [showPlaylistModalForTrack, setShowPlaylistModalForTrack] = useState<any | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');

  const createPlaylist = async (name: string, description: string) => {
    if (!user) {
      alert("Please log in to create playlists.");
      return;
    }
    if (!name.trim()) return;
    try {
      await addDoc(collection(db, 'music_playlists'), {
        userId: user.uid,
        name: name.trim(),
        description: description.trim() || '',
        tracks: [],
        addedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setNewPlaylistName('');
      setNewPlaylistDesc('');
    } catch (err) {
      console.error('Error creating playlist:', err);
    }
  };

  const addTrackToPlaylist = async (playlistId: string, track: AudioFile) => {
    if (!user) return;
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return;
    
    if (pl.tracks.some((t: any) => t.id === track.id)) {
      const updatedTracks = pl.tracks.filter((t: any) => t.id !== track.id);
      try {
        await updateDoc(doc(db, 'music_playlists', playlistId), {
          tracks: updatedTracks,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.error('Error removing track from playlist:', err);
      }
    } else {
      const serializedTrack = {
        id: track.id,
        name: track.name,
        size: track.size,
        url: track.url,
        addedAt: Date.now()
      };
      try {
        await updateDoc(doc(db, 'music_playlists', playlistId), {
          tracks: arrayUnion(serializedTrack),
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.error('Error adding track to playlist:', err);
      }
    }
    setShowPlaylistModalForTrack(null);
  };

  const handleSaveAlbumToLibrary = async () => {
    if (!user) {
      alert("Please log in to save albums.");
      return;
    }
    if (!albumArtistName.trim()) {
      alert("Please specify the artist name.");
      return;
    }
    
    // First, ensure artist exists
    const existingArtist = savedArtists.find(a => a.artistName.toLowerCase() === albumArtistName.trim().toLowerCase());
    if (!existingArtist) {
      await addDoc(collection(db, 'saved_artists'), {
        userId: user.uid,
        artistName: albumArtistName.trim(),
        artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=300&h=300',
        addedAt: serverTimestamp()
      });
    }

    try {
      await addDoc(collection(db, 'saved_albums'), {
        userId: user.uid,
        artistName: albumArtistName.trim(),
        albumName: selectedRelease?.name || 'Unknown Album',
        torboxId: selectedRelease?.id,
        torboxType: selectedRelease?.type,
        audioFiles: audioFiles,
        addedAt: serverTimestamp()
      });
      setShowSaveAlbumModal(false);
      setAlbumArtistName('');
    } catch (e) {
      console.error("Error saving album:", e);
    }
  };

  const { data: artistInfo } = useQuery<any>({
    queryKey: ['itunes-artist-search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) return null;
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(debouncedQuery)}&entity=musicArtist&limit=1`);
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const artist = data.results[0];
          // Apple Music doesn't return high res images directly for artists on this endpoint often,
          // but we can try to fetch a related track to get artwork if needed.
          const trackRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist.artistName)}&entity=song&limit=1`);
          const trackData = await trackRes.json();
          const artwork = trackData.results?.[0]?.artworkUrl100?.replace('100x100bb', '640x640bb') 
            || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=300&h=300';
          
          return {
            name: artist.artistName,
            genre: artist.primaryGenreName,
            artwork
          };
        }
      } catch (e) {
        console.error("Artist fetch error:", e);
      }
      return null;
    },
    enabled: !!debouncedQuery,
  });

  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 500);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: musicAlbums, isLoading: loadingAlbums } = useQuery({
    queryKey: ['itunes-albums-search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) return [];
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(debouncedQuery)}&entity=album&limit=12`);
        if (res.ok) {
          const data = await res.json();
          return (data.results || []).map((album: any) => ({
            id: String(album.collectionId),
            title: album.collectionName,
            artist: album.artistName,
            artwork: album.artworkUrl100 ? album.artworkUrl100.replace('100x100bb', '640x640bb') : 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=300&h=300',
            genre: album.primaryGenreName,
            year: album.releaseDate ? album.releaseDate.substring(0, 4) : 'N/A',
            trackCount: album.trackCount,
            url: album.collectionViewUrl,
          }));
        }
      } catch (err) {
        console.error('Error fetching albums:', err);
      }
      return [];
    },
    enabled: !!debouncedQuery,
  });

  const { data: albumTracks, isLoading: loadingAlbumTracks } = useQuery({
    queryKey: ['album-tracks-lookup', selectedAlbumDetails?.id],
    queryFn: async () => {
      if (!selectedAlbumDetails?.id) return [];
      try {
        const res = await fetch(`https://itunes.apple.com/lookup?id=${selectedAlbumDetails.id}&entity=song`);
        if (res.ok) {
          const data = await res.json();
          return (data.results || [])
            .filter((item: any) => item.wrapperType === 'track')
            .map((t: any) => ({
              id: String(t.trackId),
              name: t.trackName,
              trackNumber: t.trackNumber,
              duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : 0,
              url: t.previewUrl,
              artist: t.artistName,
              album: t.collectionName
            }));
        }
      } catch (err) {
        console.error('Error looking up album tracks:', err);
      }
      return [];
    },
    enabled: !!selectedAlbumDetails?.id,
  });

  const { data: musicVideos, isLoading: loadingVideos } = useQuery({
    queryKey: ['torbox-youtube-videos', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) return [];
      try {
        const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(debouncedQuery)}`);
        if (res.ok) {
          const data = await res.json();
          return data.results || [];
        }
      } catch (err) {
        console.error('Error fetching youtube videos:', err);
      }
      return [];
    },
    enabled: !!debouncedQuery,
  });

  const musicSearchQuery = useMemo(() => {
    if (selectedAlbumDetails) {
      return `${selectedAlbumDetails.artist} ${selectedAlbumDetails.title}`;
    }
    return debouncedQuery;
  }, [selectedAlbumDetails, debouncedQuery]);

  const { data: rawSearchResults, isLoading: isSearching } = useQuery<TorBoxSearchResult[]>({
    queryKey: ['torbox-music-search', musicSearchQuery],
    queryFn: async () => {
      if (!musicSearchQuery) return [];
      return await fetchStreamsForMusic(musicSearchQuery);
    },
    enabled: !!musicSearchQuery,
  });

  const searchResults = useMemo(() => {
    if (!rawSearchResults) return [];
    if (selectedAlbumDetails) {
      const titleWords = selectedAlbumDetails.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(' ').filter(w => w.length > 2);
      if (titleWords.length > 0) {
        const albumMatches = rawSearchResults.filter(res => {
          const cleanName = res.name.toLowerCase();
          return titleWords.some(w => cleanName.includes(w));
        });
        if (albumMatches.length > 0) return albumMatches;
      }
    }
    return rawSearchResults;
  }, [selectedAlbumDetails, rawSearchResults]);


  const handleSelectRelease = async (release: TorBoxSearchResult) => {
    setSelectedRelease(release);
    setReleaseStatus('Adding album release to TorBox...');
    setAudioFiles([]);
    setPlayingTrack(null);
    setIsPlaying(false);

    try {
      const apiKey = localStorage.getItem('torboxApiKey') || systemSettings.torboxApiKey;
      if (!apiKey) {
        setReleaseStatus('Error: TorBox API Key is missing in Settings.');
        alert('Please enter your TorBox API Key in Settings to cache music torrents.');
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
        if (data.detail && !data.success) throw new Error(data.detail || 'Failed to add usenet release');
        usenetId = data.data?.usenet_id || data.data?.id || data.data;
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
        if (data.detail && !data.success) throw new Error(data.detail || 'Failed to add torrent release');
        torrentId = data.data?.torrent_id || data.data?.id || data.data;
      }

      setReleaseStatus('Caching release on TorBox (fetching audio files)...');


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
              let files = (match.files || []).map((f: any) => {
                const fname = f.short_name || f.name || f.filename || `File ${f.id}`;
                return {
                  id: f.id,
                  name: fname,
                  size: f.size || 0,
                  ext: fname.includes('.') ? fname.substring(fname.lastIndexOf('.')).toLowerCase() : '',
                  url: release.type === 'usenet' 
                    ? `https://api.torbox.app/v1/api/usenet/requestdl?token=${apiKey}&usenet_id=${usenetId}&zip_link=false&redirect=true&file_id=${f.id}`
                    : `https://api.torbox.app/v1/api/torrents/requestdl?token=${apiKey}&torrent_id=${torrentId}&zip_link=false&redirect=true&file_id=${f.id}`
                };
              });

              let audioFiles = files.filter((f: any) => validExts.includes(f.ext));
              
              // If no audio files found but there are files, maybe they are in a zip or different format. 
              // Just show all files so the user can see what was downloaded.
              if (audioFiles.length === 0 && files.length > 0) {
                 audioFiles = files;
              }
              
              audioFiles.sort((a: any, b: any) => a.name.localeCompare(b.name));
              setAudioFiles(audioFiles);
              
              if (files.length === 0) {
                 setReleaseStatus(`Download complete, but TorBox reported no files inside this ${release.type}.`);
              }
            } else if (match.download_state === 'downloading' || match.download_state === 'downloading (checking)') {
              setReleaseStatus(`Downloading from peers... ${Math.round(match.progress || 0)}%`);
            } else if (match.download_state === 'error' || match.download_state === 'paused') {
              clearInterval(pollInterval);
              setReleaseStatus(`Error: TorBox could not cache this ${release.type}. (State: ${match.download_state})`);
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
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const playAudioFile = async (file: any) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;

    if (playingTrack && String(playingTrack.id) === String(file.id)) {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        try {
          await audio.play();
          setIsPlaying(true);
        } catch (e) {
          console.error("Play error:", e);
        }
      }
    } else {
      let playUrl = file.url;
      if (!playUrl) {
        alert("TorBox stream URL is missing for this file. Please cache the torrent to TorBox first.");
        return;
      }

      const activeFile = { ...file, url: playUrl };
      setPlayingTrack(activeFile);
      setIsPlaying(true);

      audio.src = playUrl;
      audio.load();
      try {
        await audio.play();
      } catch (e) {
        console.error("Playback start error:", e);
      }
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
      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-white/10 pb-4">
        <button onClick={() => { setActiveTab('search'); setSelectedRelease(null); }} className={`pb-4 -mb-[17px] text-sm font-medium transition-colors ${activeTab === 'search' ? 'text-red-500 border-b-2 border-red-500' : 'text-white/50 hover:text-white'}`}>TorBox & Audio</button>
        <button onClick={() => { setActiveTab('videos'); }} className={`pb-4 -mb-[17px] text-sm font-medium transition-colors ${activeTab === 'videos' ? 'text-red-500 border-b-2 border-red-500' : 'text-white/50 hover:text-white'}`}>YouTube Music Videos</button>
        <button onClick={() => { setActiveTab('library'); setSelectedLibraryArtist(null); setSelectedLibraryAlbum(null); }} className={`pb-4 -mb-[17px] text-sm font-medium transition-colors ${activeTab === 'library' ? 'text-red-500 border-b-2 border-red-500' : 'text-white/50 hover:text-white'}`}>Library</button>
        <button onClick={() => { setActiveTab('playlists'); setSelectedPlaylist(null); }} className={`pb-4 -mb-[17px] text-sm font-medium transition-colors ${activeTab === 'playlists' ? 'text-red-500 border-b-2 border-red-500' : 'text-white/50 hover:text-white'}`}>Playlists</button>
      </div>

      {activeTab === 'search' && selectedAlbumDetails ? (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => setSelectedAlbumDetails(null)}
              className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Albums & Search
            </button>
          </div>

          {/* Album Info Header */}
          <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-6 p-6 bg-gradient-to-br from-red-950/40 to-black/60 border border-red-500/20 rounded-2xl shadow-2xl">
            <img 
              src={selectedAlbumDetails.artwork} 
              alt={selectedAlbumDetails.title} 
              className="w-36 h-36 rounded-xl object-cover shadow-2xl border border-white/10"
              referrerPolicy="no-referrer"
            />
            <div className="flex flex-col justify-center flex-1 text-center sm:text-left">
              <span className="text-xs uppercase tracking-widest text-red-500 font-bold mb-1">Album</span>
              <h2 className="text-3xl font-black text-white mb-1 leading-tight">{selectedAlbumDetails.title}</h2>
              <p className="text-sm font-medium text-white/70">{selectedAlbumDetails.artist}</p>
              <div className="flex items-center gap-3 text-xs text-white/40 mt-3 justify-center sm:justify-start font-mono">
                <span>{selectedAlbumDetails.year}</span>
                <span>•</span>
                <span>{selectedAlbumDetails.genre}</span>
                <span>•</span>
                <span>{selectedAlbumDetails.trackCount} Tracks</span>
              </div>
            </div>
            <div className="flex items-center">
              <button
                onClick={() => setQuery(`${selectedAlbumDetails.artist} ${selectedAlbumDetails.title}`)}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-full text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-red-600/25 flex items-center gap-2"
              >
                <Download className="w-4 h-4" /> Search TorBox Torrent
              </button>
            </div>
          </div>

          {/* Release Caching Status Banner */}
          {releaseStatus && (
            <div className="p-4 bg-red-950/40 border border-red-500/30 rounded-xl text-xs font-bold text-red-400 animate-pulse flex items-center gap-3 shadow-lg">
              <Loader2 className="w-4 h-4 animate-spin shrink-0 text-red-500" />
              <span>{releaseStatus}</span>
            </div>
          )}

          {/* TorBox Audio Files Section (If cached torrent loaded) */}
          {audioFiles && audioFiles.length > 0 && (
            <div className="space-y-3 bg-red-950/20 border border-red-500/30 p-5 rounded-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold tracking-wider uppercase text-red-400 flex items-center gap-2">
                  <Music className="w-4 h-4" /> TorBox Full-Length Audio Tracks ({audioFiles.length})
                </h3>
                <span className="text-xs text-white/50 font-mono">Streamed directly from TorBox</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {audioFiles.map((file, idx) => {
                  const isCurrent = playingTrack?.id === file.id;
                  return (
                    <div 
                      key={file.id || idx}
                      onClick={() => playAudioFile(file)}
                      className={`flex items-center gap-4 p-3.5 rounded-xl cursor-pointer transition-all ${
                        isCurrent ? 'bg-red-500/20 border border-red-500/50' : 'bg-black/50 hover:bg-white/5 border border-white/5'
                      }`}
                    >
                      <span className="w-6 text-center text-xs font-mono text-white/40 font-bold">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-bold truncate block ${isCurrent ? 'text-red-400' : 'text-white'}`}>
                          {file.name}
                        </span>
                        <span className="text-xs text-white/40 truncate block mt-0.5 font-mono">
                          {formatBytes(file.size)} • {file.ext.toUpperCase()}
                        </span>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); playAudioFile(file); }}
                        className="w-8 h-8 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-lg shadow-red-600/30"
                      >
                        {isCurrent && isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TorBox Torrent & Usenet Releases for this Album */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold tracking-wider uppercase text-white/40 pl-2">
              TorBox Torrent & Usenet Releases for {selectedAlbumDetails.title}
            </h3>
            {isSearching ? (
              <div className="flex items-center justify-center py-8 text-red-500">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Searching TorBox indexers for album torrents...
              </div>
            ) : searchResults && searchResults.length > 0 ? (
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
                        {res.seeders !== undefined && (
                          <span className="text-emerald-400 font-mono">Seeders: {res.seeders}</span>
                        )}
                        {res.cached && (
                          <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold px-2 py-0.5 rounded">
                            Instant TorBox Cache
                          </span>
                        )}
                      </div>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleSelectRelease(res); }}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer shadow-lg shadow-red-600/20"
                    >
                      Cache to TorBox & Stream
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white/5 border border-white/5 rounded-2xl p-6 text-center text-sm text-white/40">
                No direct TorBox torrent results found yet. Click "Search TorBox Torrent" above to run a custom query.
              </div>
            )}
          </div>

        </div>
      ) : activeTab === 'search' && (

        <>
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

          {!isSearching && artistInfo && (
            <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-6 p-6 bg-gradient-to-br from-red-900/20 to-black/40 border border-white/10 rounded-2xl mb-6">
              <img src={artistInfo.artwork} alt={artistInfo.name} className="w-32 h-32 rounded-full object-cover shadow-2xl shadow-red-900/20" />
              <div className="flex flex-col justify-center flex-1 text-center sm:text-left">
                <span className="text-xs uppercase tracking-widest text-red-500 font-bold mb-1">Artist Profile</span>
                <h3 className="text-3xl font-bold text-white mb-1">{artistInfo.name}</h3>
                <span className="text-sm text-white/50">{artistInfo.genre}</span>
              </div>
              <div className="flex items-center">
                <button 
                  onClick={() => toggleSaveArtist(artistInfo.name, artistInfo.artwork)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all shadow-lg
                    ${savedArtists.some(a => a.artistName.toLowerCase() === artistInfo.name.toLowerCase())
                      ? 'bg-red-500 text-white shadow-red-500/25 hover:bg-red-600' 
                      : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                  {savedArtists.some(a => a.artistName.toLowerCase() === artistInfo.name.toLowerCase()) ? (
                    <><UserCheck className="w-4 h-4" /> In Library</>
                  ) : (
                    <><UserPlus className="w-4 h-4" /> Save to Library</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Albums Section */}
          {!isSearching && musicAlbums && musicAlbums.length > 0 && (
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                <Disc className="w-5 h-5 text-red-500" />
                <h3 className="text-base font-bold text-white tracking-wide">
                  Albums <span className="text-white/40 text-xs font-normal">({musicAlbums.length})</span>
                </h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {musicAlbums.map((album: any) => (
                  <div 
                    key={album.id}
                    onClick={() => setSelectedAlbumDetails(album)}
                    className="bg-black/40 border border-white/5 hover:border-red-500/50 p-3 rounded-xl cursor-pointer transition-all group hover:scale-[1.03] flex flex-col gap-2"
                  >
                    <div className="aspect-square bg-slate-800 rounded-lg overflow-hidden relative shadow">
                      <img 
                        src={album.artwork} 
                        alt={album.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-2 text-center">
                        <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">View Tracklist</span>
                        <span className="text-[9px] text-white/70 mt-0.5">{album.trackCount} Tracks</span>
                      </div>
                      <div className="absolute top-1.5 right-1.5 bg-black/70 text-[8px] font-mono text-white/80 px-1.5 py-0.5 rounded border border-white/10">
                        {album.year}
                      </div>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-white truncate group-hover:text-red-400 transition-colors">
                        {album.title}
                      </span>
                      <span className="text-[10px] text-white/50 truncate">
                        {album.artist}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isSearching && searchResults && searchResults.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                <Music className="w-5 h-5 text-red-500" />
                <h3 className="text-base font-bold text-white tracking-wide">
                  Lossless Audio & FLAC Streams <span className="text-white/40 text-xs font-normal">({searchResults.length})</span>
                </h3>
              </div>
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
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => setSelectedRelease(null)}
              className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Results
            </button>
            
            {audioFiles.length > 0 && (
              <button
                onClick={() => {
                  setAlbumArtistName(artistInfo ? artistInfo.name : debouncedQuery);
                  setShowSaveAlbumModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4" /> Save Album to Library
              </button>
            )}
          </div>
          
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
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowPlaylistModalForTrack(file); }}
                      className="text-white/30 hover:text-white p-1.5 rounded-full transition-colors shrink-0"
                      title="Add to Playlist"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
        </>
      )}

      {activeTab === 'videos' && (
        <div className="space-y-6">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 shadow-lg max-w-3xl">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input 
                type="text"
                placeholder="Search YouTube for music videos..."
                className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/5 focus:border-red-500 rounded-xl text-sm text-white placeholder-white/30 outline-none transition-colors"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {loadingVideos ? (
            <div className="flex items-center justify-center py-16 text-red-500">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : musicVideos && musicVideos.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {musicVideos.map((vid: any) => (
                <div 
                  key={vid.id}
                  onClick={() => setSelectedVideoModal(vid)}
                  className="bg-black/40 border border-white/5 hover:border-red-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all group hover:scale-[1.02] flex flex-col shadow-lg"
                >
                  <div className="aspect-video bg-slate-900 relative">
                    <img 
                      src={vid.artwork} 
                      alt={vid.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center shadow-xl">
                        <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                      </div>
                    </div>
                  </div>
                  <div className="p-4 flex flex-col min-w-0 flex-1 justify-between gap-1">
                    <span className="text-sm font-bold text-white line-clamp-2 leading-tight group-hover:text-red-400 transition-colors">
                      {vid.title}
                    </span>
                    <span className="text-xs text-white/50 truncate">
                      {vid.artist}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white/5 border border-white/5 rounded-2xl p-8 text-center text-sm text-white/40">
              No music videos found. Try searching for an artist or song.
            </div>
          )}
        </div>
      )}

      {activeTab === 'library' && (
        <div className="space-y-6">
          {!selectedLibraryArtist ? (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white mb-6">Your Artists</h2>
              {savedArtists.length === 0 ? (
                <div className="text-center py-12 text-white/40">No artists saved yet. Search for an artist to add them!</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                  {savedArtists.map(artist => (
                    <div 
                      key={artist.id} 
                      onClick={() => setSelectedLibraryArtist(artist)}
                      className="group cursor-pointer flex flex-col items-center gap-3 text-center"
                    >
                      <div className="w-32 h-32 rounded-full overflow-hidden shadow-lg border border-white/5 group-hover:border-red-500/50 transition-all group-hover:scale-105">
                        <img src={artist.artwork} alt={artist.artistName} className="w-full h-full object-cover" />
                      </div>
                      <span className="text-sm font-medium text-white group-hover:text-red-400 transition-colors">{artist.artistName}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : !selectedLibraryAlbum ? (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-6 p-6 bg-gradient-to-br from-red-900/20 to-black/40 border border-white/10 rounded-2xl mb-6">
                <img src={selectedLibraryArtist.artwork} alt={selectedLibraryArtist.artistName} className="w-32 h-32 rounded-full object-cover shadow-2xl" />
                <div className="flex flex-col justify-center flex-1 text-center sm:text-left">
                  <h3 className="text-3xl font-bold text-white mb-1">{selectedLibraryArtist.artistName}</h3>
                  <button 
                    onClick={() => setSelectedLibraryArtist(null)}
                    className="mt-2 text-sm text-white/50 hover:text-white self-center sm:self-start flex items-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back to Artists
                  </button>
                </div>
                <div className="flex items-center">
                  <button 
                    onClick={() => toggleSaveArtist(selectedLibraryArtist.artistName, selectedLibraryArtist.artwork)}
                    className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors text-sm"
                  >
                    <UserCheck className="w-4 h-4" /> Remove
                  </button>
                </div>
              </div>

              <h2 className="text-lg font-bold text-white mb-4">Saved Albums</h2>
              {savedAlbums.filter(a => a.artistName.toLowerCase() === selectedLibraryArtist.artistName.toLowerCase()).length === 0 ? (
                <div className="text-center py-12 text-white/40 bg-black/40 border border-white/5 rounded-2xl">
                  No albums saved for this artist. Search TorBox and click "Save Album to Library".
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {savedAlbums
                    .filter(a => a.artistName.toLowerCase() === selectedLibraryArtist.artistName.toLowerCase())
                    .map(album => (
                    <div 
                      key={album.id}
                      onClick={() => setSelectedLibraryAlbum(album)}
                      className="bg-black/40 border border-white/5 hover:border-red-500/50 p-4 rounded-xl cursor-pointer transition-colors group flex items-center gap-4"
                    >
                      <div className="w-12 h-12 bg-red-950 rounded flex items-center justify-center shrink-0 border border-red-900/30">
                        <Disc className="w-6 h-6 text-red-500" />
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-white font-medium truncate group-hover:text-red-400">{album.albumName}</span>
                        <span className="text-xs text-white/40 mt-1">{album.audioFiles?.length || 0} tracks</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <button 
                onClick={() => setSelectedLibraryAlbum(null)}
                className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Albums
              </button>
              
              <div className="bg-gradient-to-br from-red-900/20 to-black/40 border border-red-500/20 rounded-2xl p-6 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-white mb-2 break-words leading-tight">{selectedLibraryAlbum.albumName}</h2>
                  <div className="text-sm text-white/60">{selectedLibraryArtist.artistName}</div>
                </div>
              </div>

              {selectedLibraryAlbum.audioFiles && selectedLibraryAlbum.audioFiles.length > 0 && (
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold tracking-wider uppercase text-white/40 mb-2 pl-2">Tracks ({selectedLibraryAlbum.audioFiles.length})</h3>
                  {selectedLibraryAlbum.audioFiles.map((file: any, idx: number) => {
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
                        <button 
                          onClick={(e) => { e.stopPropagation(); setShowPlaylistModalForTrack(file); }}
                          className="text-white/30 hover:text-white p-1.5 rounded-full transition-colors shrink-0"
                          title="Add to Playlist"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'playlists' && (
        <div className="space-y-6">
          {!selectedPlaylist ? (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Your Playlists</h2>
              </div>
              
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-white/80 uppercase tracking-widest">Create New Playlist</h3>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input type="text" placeholder="Playlist Name" value={newPlaylistName} onChange={e => setNewPlaylistName(e.target.value)} className="bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-red-500 outline-none flex-1" />
                  <input type="text" placeholder="Description (Optional)" value={newPlaylistDesc} onChange={e => setNewPlaylistDesc(e.target.value)} className="bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-red-500 outline-none flex-1" />
                  <button onClick={() => createPlaylist(newPlaylistName, newPlaylistDesc)} disabled={!newPlaylistName.trim()} className="bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:hover:bg-red-500 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors">Create</button>
                </div>
              </div>

              {playlists.length === 0 ? (
                <div className="text-center py-12 text-white/40">You haven't created any playlists yet.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {playlists.map(pl => (
                    <div key={pl.id} onClick={() => setSelectedPlaylist(pl)} className="bg-black/40 border border-white/10 hover:border-red-500/50 p-5 rounded-2xl cursor-pointer transition-colors group flex flex-col gap-2">
                      <h3 className="text-lg font-bold text-white group-hover:text-red-400">{pl.name}</h3>
                      {pl.description && <p className="text-xs text-white/50 line-clamp-2">{pl.description}</p>}
                      <div className="mt-2 text-xs text-white/40 font-mono">{pl.tracks?.length || 0} tracks</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <button onClick={() => setSelectedPlaylist(null)} className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to Playlists
              </button>
              
              <div className="bg-gradient-to-br from-red-900/20 to-black/40 border border-red-500/20 rounded-2xl p-6">
                <h2 className="text-3xl font-bold text-white mb-2">{selectedPlaylist.name}</h2>
                {selectedPlaylist.description && <p className="text-white/60 text-sm mb-4">{selectedPlaylist.description}</p>}
                <div className="text-sm text-white/40 font-mono">{selectedPlaylist.tracks?.length || 0} tracks</div>
              </div>

              {selectedPlaylist.tracks && selectedPlaylist.tracks.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {selectedPlaylist.tracks.map((track: any, idx: number) => {
                    const isActive = playingTrack?.id === track.id;
                    return (
                      <div key={track.id + '-' + idx} onClick={() => playAudioFile(track)} className={`flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-all ${isActive ? 'bg-red-500/10 border border-red-500/20' : 'hover:bg-white/5 border border-transparent'}`}>
                        <div className="w-6 text-center text-xs text-white/40 font-mono">
                          {isActive ? (
                            <div className="flex items-end justify-center gap-0.5 h-3"><span className="w-1 h-3 bg-red-500 animate-pulse"></span><span className="w-1 h-2 bg-red-500 animate-pulse delay-75"></span><span className="w-1 h-3 bg-red-500 animate-pulse delay-150"></span></div>
                          ) : idx + 1}
                        </div>
                        <div className="flex-1 flex flex-col truncate">
                          <span className={`truncate text-sm ${isActive ? 'text-red-400 font-medium' : 'text-white/80'}`}>{track.name}</span>
                        </div>
                        <div className="text-xs text-white/30 font-mono shrink-0">
                          {formatBytes(track.size)}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); addTrackToPlaylist(selectedPlaylist.id, track); }} className="text-white/30 hover:text-white p-1.5 rounded-full transition-colors shrink-0" title="Remove from Playlist">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-white/40 bg-black/40 border border-white/5 rounded-2xl">This playlist is empty. Add tracks from TorBox search results.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Save Album Modal */}
      {showSaveAlbumModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <h2 className="text-xl font-bold text-white mb-2">Save Album to Library</h2>
            <p className="text-sm text-white/60 mb-6">Link this TorBox album to an artist in your library so you can easily find it later.</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">Artist Name</label>
                <input 
                  type="text" 
                  value={albumArtistName}
                  onChange={(e) => setAlbumArtistName(e.target.value)}
                  placeholder="e.g. Daft Punk"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:border-red-500 outline-none"
                />
              </div>
              
              <div className="flex justify-end gap-3 pt-4">
                <button 
                  onClick={() => setShowSaveAlbumModal(false)}
                  className="px-5 py-2.5 rounded-xl font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveAlbumToLibrary}
                  className="px-5 py-2.5 rounded-xl font-medium bg-red-500 hover:bg-red-600 text-white transition-colors"
                >
                  Save Album
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add to Playlist Modal */}
      {showPlaylistModalForTrack && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowPlaylistModalForTrack(null)}>
          <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-4">Add to Playlist</h2>
            
            <div className="space-y-2 max-h-64 overflow-y-auto mb-6 pr-2">
              {playlists.length === 0 ? (
                <div className="text-sm text-white/50 text-center py-4">No playlists found. Create one below.</div>
              ) : (
                playlists.map(pl => {
                  const hasTrack = pl.tracks?.some((t: any) => t.id === showPlaylistModalForTrack.id);
                  return (
                    <div 
                      key={pl.id}
                      onClick={() => addTrackToPlaylist(pl.id, showPlaylistModalForTrack)}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors border ${hasTrack ? 'bg-red-500/10 border-red-500/30' : 'bg-white/5 border-transparent hover:bg-white/10'}`}
                    >
                      <span className={`text-sm ${hasTrack ? 'text-red-400' : 'text-white'}`}>{pl.name}</span>
                      {hasTrack && <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-white/10 pt-4 space-y-3">
              <h3 className="text-xs font-semibold text-white/40 uppercase">New Playlist</h3>
              <input type="text" placeholder="Name" value={newPlaylistName} onChange={e => setNewPlaylistName(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-red-500 outline-none" />
              <button onClick={() => { createPlaylist(newPlaylistName, ''); }} disabled={!newPlaylistName.trim()} className="w-full bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors">Create & Add</button>
            </div>
          </div>
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

      {/* YouTube Music Video Player Modal */}
      {selectedVideoModal && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="relative w-full max-w-4xl bg-[#0d0d14] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/40">
              <div className="flex items-center gap-3 min-w-0 pr-4">
                <Video className="w-5 h-5 text-red-500 shrink-0" />
                <div className="truncate">
                  <h3 className="text-base font-bold text-white truncate">{selectedVideoModal.title}</h3>
                  <p className="text-xs text-white/50 truncate">{selectedVideoModal.artist}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedVideoModal(null)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="aspect-video w-full bg-black">
              <iframe 
                src={`https://www.youtube.com/embed/${selectedVideoModal.videoId}?autoplay=1`}
                title={selectedVideoModal.title}
                className="w-full h-full border-none"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
