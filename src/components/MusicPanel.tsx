import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Play, Pause, Music, Disc, Download, Search, Sparkles, 
  Heart, Volume2, VolumeX, ListMusic, FileAudio, FileDown,
  Gauge, RefreshCw, Check, Plus, ListPlus, UserPlus, UserCheck
} from 'lucide-react';
import { collection, addDoc, query as firestoreQuery, onSnapshot, where, getDocs, deleteDoc, doc, serverTimestamp, updateDoc, arrayUnion } from '../lib/localDb';
import { db } from '../lib/localDb';
import { useAuth } from './Auth';
import ReactPlayer from 'react-player';

interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  previewUrl: string;
  durationMs: number;
  sampleRate: string;
  bitDepth: string;
  bitrate: string;
  fileSize: string;
  year: string;
  type?: 'audio' | 'video';
  videoId?: string;
}

interface MusicPanelProps {
  initialQuery?: string;
}

export default function MusicPanel({ initialQuery = '' }: MusicPanelProps) {
  const [query, setQuery] = useState(initialQuery);
  
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [playingTrack, setPlayingTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [downloadingTrackId, setDownloadingTrackId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isMonochrome, setIsMonochrome] = useState(true);
  const [isLoadingPreview, setIsLoadingPreview] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"tracks" | "artists" | "albums" | "videos" | "playlists">("tracks");
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<any>(null);
  const [audioQueue, setAudioQueue] = useState<Track[]>([]);

  const { user } = useAuth();
  const [savedArtists, setSavedArtists] = useState<any[]>([]);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [showPlaylistModalForTrack, setShowPlaylistModalForTrack] = useState<Track | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const queueRef = useRef<Track[]>([]);
  const playingRef = useRef<Track | null>(null);

  useEffect(() => { queueRef.current = audioQueue; }, [audioQueue]);
  useEffect(() => { playingRef.current = playingTrack; }, [playingTrack]);

  // Listen to saved artists
  useEffect(() => {
    if (!user) {
      setSavedArtists([]);
      return;
    }
    const q = firestoreQuery(collection(db, 'saved_artists'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSavedArtists(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error('Error fetching saved artists:', err);
    });
    return () => unsubscribe();
  }, [user]);

  // Listen to playlists
  useEffect(() => {
    if (!user) {
      setPlaylists([]);
      return;
    }
    const q = firestoreQuery(collection(db, 'music_playlists'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPlaylists(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error('Error fetching playlists:', err);
    });
    return () => unsubscribe();
  }, [user]);

  const toggleSaveArtist = async (artistName: string, artworkUrl: string) => {
    if (!user) {
      alert("Please log in to add artists to your library.");
      return;
    }
    const existing = savedArtists.find(a => a.artistName.toLowerCase() === artistName.toLowerCase());
    if (existing) {
      try {
        await deleteDoc(doc(db, 'saved_artists', existing.id));
      } catch (err) {
        console.error('Error removing artist:', err);
      }
    } else {
      try {
        await addDoc(collection(db, 'saved_artists'), {
          userId: user.uid,
          artistName: artistName,
          artwork: artworkUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=300&h=300',
          addedAt: serverTimestamp()
        });
      } catch (err) {
        console.error('Error saving artist:', err);
      }
    }
  };

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

  const addTrackToPlaylist = async (playlistId: string, track: Track) => {
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
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.artwork,
        previewUrl: track.previewUrl || '',
        durationMs: track.durationMs || 200000,
        sampleRate: track.sampleRate || '44.1 kHz',
        bitDepth: track.bitDepth || '16-bit',
        bitrate: track.bitrate || '1411 kbps',
        fileSize: track.fileSize || '30 MB',
        year: track.year || 'N/A'
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
  };

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  // Load favorites from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('monochrome_favorites') || localStorage.getItem('spotiflac_favorites');
    if (saved) {
      try { setFavorites(JSON.parse(saved)); } catch (_) {}
    }
  }, []);

  const toggleFavorite = (trackId: string) => {
    let updated;
    if (favorites.includes(trackId)) {
      updated = favorites.filter(id => id !== trackId);
    } else {
      updated = [...favorites, trackId];
    }
    setFavorites(updated);
    localStorage.setItem('monochrome_favorites', JSON.stringify(updated));
  };

  const getPlayableUrl = async (trackId: string, artist: string, title: string, durationMs: number = 200000): Promise<string> => {
  const cleanId = trackId.replace('mono-', '').replace('yt-', '');
  try {
      if (trackId.startsWith('mono-') || !isNaN(Number(cleanId))) {
        // Fetch track manifest from Monochrome
        const res = await fetch(`https://api.monochrome.tf/track/?id=${cleanId}`);
        const json = await res.json();
        
        // If it's a preview due to subscription block or an upstream error, fallback to YouTube
        if (json?.data?.previewReason === 'FULL_REQUIRES_SUBSCRIPTION' || json?.detail === 'Upstream API error') {
          console.log('[MusicPanel] Monochrome stream requires subscription or failed. Falling back to backend YouTube proxy.');
          const ytRes = await fetch(`${window.location.protocol}//${window.location.hostname}:5150/api/youtube/stream-url?id=${cleanId}`);
      const ytData = await ytRes.json();
      if (ytData && ytData.url) {
        return ytData.url;
      }
      throw new Error('Failed to extract direct stream URL');
        }

        if (json?.data?.manifest) {
          const manifestXml = atob(json.data.manifest);
          
          // Extract initialization and media URLs
          const initMatch = manifestXml.match(/initialization="([^"]+)"/);
          const mediaMatch = manifestXml.match(/media="([^"]+)"/);
          
          if (initMatch && mediaMatch) {
            const initUrl = initMatch[1].replace(/&amp;/g, '&');
            const mediaTemplate = mediaMatch[1].replace(/&amp;/g, '&');
            
            let numSegments = 8;
            const matches = [...manifestXml.matchAll(/<S\s+[^>]*d="(\d+)"(?:\s+r="(\d+)")?/g)];
            if (matches.length > 0) {
              let total = 0;
              for (const match of matches) {
                const r = match[2] ? parseInt(match[2], 10) : 0;
                total += 1 + r;
              }
              numSegments = total;
            } else {
              const durationMatch = manifestXml.match(/duration="(\d+)"/);
              const timescaleMatch = manifestXml.match(/timescale="(\d+)"/);
              if (durationMatch && timescaleMatch) {
                const dur = parseInt(durationMatch[1], 10);
                const ts = parseInt(timescaleMatch[1], 10);
                const secPerSegment = dur / ts;
                numSegments = Math.ceil((durationMs / 1000) / secPerSegment);
              } else {
                numSegments = Math.ceil((durationMs / 1000) / 10); // Assume 10s chunks if unknown
              }
            }
            
            console.log(`[MusicPanel] Assembling ${numSegments} lossless chunks for true playback...`);
            const chunks: ArrayBuffer[] = [];
            
            // 1. Fetch init chunk
            const initRes = await fetch(initUrl);
            if (initRes.ok) {
              chunks.push(await initRes.arrayBuffer());
            } else {
              throw new Error('Failed to fetch initialization segment');
            }
            
            // 2. Fetch media chunks in batches to prevent network overload
            const batchSize = 6;
            for (let i = 0; i < numSegments; i += batchSize) {
              const batchPromises = [];
              for (let j = 0; j < batchSize && (i + j) < numSegments; j++) {
                const segNum = i + j + 1;
                const segmentUrl = mediaTemplate.replace('$Number$', String(segNum));
                batchPromises.push(
                  fetch(segmentUrl)
                    .then(r => r.ok ? r.arrayBuffer() : null)
                    .catch(() => null)
                );
              }
              const batchResults = await Promise.all(batchPromises);
              for (const s of batchResults) {
                if (s) chunks.push(s);
              }
            }
            
            if (chunks.length > 1) {
              const blob = new Blob(chunks, { type: 'audio/mp4' });
              return URL.createObjectURL(blob);
            }
          }
        }
      }
    } catch (err) {
      console.error('[MusicPanel] Monochrome stream failed, falling back to YouTube Proxy:', err);
    }
    
    // Final fallback to YouTube proxy
    const ytRes = await fetch(`${window.location.protocol}//${window.location.hostname}:5150/api/youtube/stream-url?id=${cleanId}`);
  const ytData = await ytRes.json();
  if (ytData && ytData.url) {
    return ytData.url;
  }
  throw new Error('Failed to extract direct stream URL');
  };

  // Mock static curated hi-res master tracks when not searching
  const curatedTracks: Track[] = [
    {
      id: 'curated-1',
      title: 'Get Lucky',
      artist: 'Daft Punk ft. Pharrell Williams',
      album: 'Random Access Memories (Studio Master)',
      artwork: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&q=80&w=300&h=300',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/21/d9/bc/21d9bcbe-3023-e18f-a9db-fcfa1d50b4f8/mzaf_6299863486047120677.plus.aac.p.m4a',
      durationMs: 369000,
      sampleRate: '88.2 kHz',
      bitDepth: '24-bit',
      bitrate: '2910 kbps',
      fileSize: '76.8 MB',
      year: '2013'
    },
    {
      id: 'curated-2',
      title: 'Time',
      artist: 'Pink Floyd',
      album: 'The Dark Side of the Moon (50th Anniversary remaster)',
      artwork: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&q=80&w=300&h=300',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview116/v4/bf/20/0f/bf200fa4-6c3f-c67d-9477-d7796d44a2c1/mzaf_18118079878235315570.plus.aac.p.m4a',
      durationMs: 421000,
      sampleRate: '96.0 kHz',
      bitDepth: '24-bit',
      bitrate: '3120 kbps',
      fileSize: '93.5 MB',
      year: '1973'
    },
    {
      id: 'curated-3',
      title: 'bad guy',
      artist: 'Billie Eilish',
      album: 'WHEN WE ALL FALL ASLEEP, WHERE DO WE GO?',
      artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=300&h=300',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview126/v4/e5/23/24/e5232435-08cc-fec5-1d48-617865c1926b/mzaf_16694665478486026500.plus.aac.p.m4a',
      durationMs: 194000,
      sampleRate: '44.1 kHz',
      bitDepth: '24-bit',
      bitrate: '1650 kbps',
      fileSize: '37.9 MB',
      year: '2019'
    },
    {
      id: 'curated-4',
      title: 'Cornfield Chase',
      artist: 'Hans Zimmer',
      album: 'Interstellar (Original Motion Picture Soundtrack)',
      artwork: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=300&h=300',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/b9/e7/03/b9e70390-3323-28f0-1555-d16af61376df/mzaf_15783321528691515367.plus.aac.p.m4a',
      durationMs: 126000,
      sampleRate: '96.0 kHz',
      bitDepth: '24-bit',
      bitrate: '2850 kbps',
      fileSize: '41.2 MB',
      year: '2014'
    },
    {
      id: 'curated-5',
      title: 'Dreams',
      artist: 'Fleetwood Mac',
      album: 'Rumours (Super Deluxe Studio Masters)',
      artwork: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&q=80&w=300&h=300',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/b6/23/b0/b623b00f-d475-397a-6240-377033a8c544/mzaf_6257520489955725287.plus.aac.p.m4a',
      durationMs: 257000,
      sampleRate: '96.0 kHz',
      bitDepth: '24-bit',
      bitrate: '2900 kbps',
      fileSize: '58.4 MB',
      year: '1977'
    }
  ];

  // Fetch Music via Monochrome API with fallback and decorators
  const { data: searchResults, isLoading, isError } = useQuery<Track[]>({
    queryKey: ['monochrome-search', debouncedQuery, activeTab],
    queryFn: async () => {
      if (!debouncedQuery) return [];
      
      if (activeTab === 'videos') {
        try {
          const res = await fetch(`${window.location.protocol}//${window.location.hostname}:5150/api/youtube/search?q=${encodeURIComponent(debouncedQuery)}`);
          if (res.ok) {
            const data = await res.json();
            return data.results || [];
          }
        } catch (err) {
          console.error('Failed to fetch videos', err);
        }
        return [];
      }
      
      try {
        // Try calling the official monochrome.tf search API
        const res = await fetch(`https://api.monochrome.tf/search/?s=${encodeURIComponent(debouncedQuery)}`);
        if (!res.ok) throw new Error('Monochrome API error');
        
        const payload = await res.json();
        const items = payload.data?.items || payload.items || [];
        
        if (items.length > 0) {
          return items.map((t: any) => {
            const hasHiRes = t.audioQuality === 'HI_RES_LOSSLESS' || 
                             t.mediaMetadata?.tags?.includes('HIRES_LOSSLESS') ||
                             t.audioModes?.includes('DOLBY_ATMOS');
            
            const bDepth = hasHiRes ? '24-bit' : '16-bit';
            const sRate = hasHiRes ? '96.0 kHz' : '44.1 kHz';
            const bitrateVal = hasHiRes ? '3072 kbps' : '1411 kbps';
            const durationSeconds = t.duration || 200;
            const sizeMb = ((hasHiRes ? 3072 : 1411) * durationSeconds / 8 / 1024).toFixed(1);
            
            // Build Tidal cover url
            const artworkUrl = t.album?.cover 
              ? `https://resources.tidal.com/images/${t.album.cover.replaceAll('-', '/')}/640x640.jpg`
              : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=300&h=300';

            return {
              id: `mono-${t.id}`,
              title: t.title,
              artist: t.artist?.name || t.artists?.[0]?.name || 'Unknown Artist',
              album: t.album?.title || 'Unknown Album',
              artwork: artworkUrl,
              previewUrl: '', // Will resolve dynamically on play
              durationMs: (t.duration || 200) * 1000,
              sampleRate: sRate,
              bitDepth: bDepth,
              bitrate: bitrateVal,
              fileSize: `${sizeMb} MB`,
              year: t.streamStartDate ? t.streamStartDate.substring(0, 4) : 'N/A'
            };
          });
        }
      } catch (err) {
        console.warn('Monochrome API failed or returned empty, falling back to decorated iTunes Search...', err);
      }

      // Robust fallback to iTunes Search with Monochrome layout/decorations
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(debouncedQuery)}&media=music&limit=30`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      
      return (data.results || []).map((t: any, index: number) => {
        const bitDepths = ['24-bit', '16-bit'];
        const sampleRates = ['96.0 kHz', '48.0 kHz', '44.1 kHz', '88.2 kHz', '192.0 kHz'];
        const seed = t.trackId || index;
        const bDepth = bitDepths[seed % bitDepths.length];
        const sRate = sampleRates[seed % sampleRates.length];
        const bitrateVal = bDepth === '24-bit' 
          ? (parseFloat(sRate) * 24 * 2).toFixed(0) 
          : (parseFloat(sRate) * 16 * 2).toFixed(0);
        const durationSeconds = (t.trackTimeMillis || 200000) / 1000;
        const sizeMb = ((parseFloat(bitrateVal) * durationSeconds) / 8 / 1024).toFixed(1);

        return {
          id: String(t.trackId),
          title: t.trackName,
          artist: t.artistName,
          album: t.collectionName || 'Single',
          artwork: t.artworkUrl100 ? t.artworkUrl100.replace('100x100bb', '640x640bb') : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=300&h=300',
          previewUrl: t.previewUrl,
          durationMs: t.trackTimeMillis || 200000,
          sampleRate: sRate,
          bitDepth: bDepth,
          bitrate: `${bitrateVal} kbps`,
          fileSize: `${sizeMb} MB`,
          year: t.releaseDate ? t.releaseDate.substring(0, 4) : 'N/A'
        };
      });
    },
    enabled: !!debouncedQuery,
  });

  const tracksToRender = debouncedQuery ? (searchResults || []) : curatedTracks;

  // Initialize Audio Element
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleDurationChange = () => {
      setDuration(audio.duration || 0);
    };

    const handleEnded = () => {
      const queue = queueRef.current;
      const current = playingRef.current;
      if (current && queue.length > 0) {
        const idx = queue.findIndex(t => t.id === current.id);
        if (idx !== -1 && idx < queue.length - 1) {
          const nextTrack = queue[idx + 1];
          // We can't call playTrack directly here easily because it's defined below,
          // so we'll just set an event flag or we can move playTrack above.
          // Wait, playTrack uses state setters.
          // Let's just create a custom event on the window to trigger playTrack!
          window.dispatchEvent(new CustomEvent('playNextTrackInQueue', { detail: nextTrack }));
          return;
        }
      }
      setIsPlaying(false);
      setCurrentTime(0);
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

  // Update playback source and trigger play
  const playTrack = async (track: Track) => {
    if (!audioRef.current) return;

    if (playingTrack?.id === track.id) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        if (track.type !== 'video') {
          audioRef.current.play().catch(err => console.error(err));
        }
        setIsPlaying(true);
      }
    } else {
      let url = track.previewUrl;
      if (!url) {
        setIsLoadingPreview(track.id);
        url = await getPlayableUrl(track.id, track.artist, track.title, track.durationMs);
        track.previewUrl = url;
        setIsLoadingPreview(null);
      }

      setPlayingTrack(track);
      setIsPlaying(true);
      
      if (track.type !== 'video') {
        audioRef.current.src = url;
        audioRef.current.load();
        audioRef.current.play().catch(err => console.error(err));
      } else {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    }
  };

  // Sync Volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Audio Visualizer Canvas Loop
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let localFrameId: number;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;

      // Draw a retro high-fi spectrum analyzer style or smooth wave
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';

      if (isPlaying) {
        // Beautiful oscillating audio wave
        const count = 30;
        const gap = 4;
        const barWidth = (width - gap * (count - 1)) / count;

        for (let i = 0; i < count; i++) {
          const time = Date.now() * 0.004;
          // Generate realistic audio spikes using a mix of sin waves
          const magnitude = Math.abs(
            Math.sin(i * 0.2 + time) * 0.4 + 
            Math.sin(i * 0.5 - time * 1.5) * 0.3 + 
            Math.cos(i * 0.1 + time * 0.8) * 0.3
          );
          
          const barHeight = Math.max(4, magnitude * height * 0.85);
          
          // Color gradient from glowing red to dark crimson or monochrome silver/white
          const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
          if (isMonochrome) {
            gradient.addColorStop(0, '#27272a'); // Zinc 800
            gradient.addColorStop(0.5, '#a1a1aa'); // Zinc 400
            gradient.addColorStop(1, '#ffffff'); // White
          } else {
            gradient.addColorStop(0, '#7f1d1d'); // Dark Red
            gradient.addColorStop(0.5, '#ef4444'); // Red 500
            gradient.addColorStop(1, '#f87171'); // Light Red
          }

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(i * (barWidth + gap), height - barHeight, barWidth, barHeight, 4);
          ctx.fill();
        }
      } else {
        // Idle state: Flat subtle waves
        ctx.strokeStyle = isMonochrome ? 'rgba(255, 255, 255, 0.15)' : 'rgba(239, 68, 68, 0.2)';
        ctx.beginPath();
        for (let x = 0; x < width; x++) {
          const y = height / 2 + Math.sin(x * 0.03) * 2;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      localFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(localFrameId);
    };
  }, [isPlaying, isMonochrome]);

  // Handle seeking
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      const newTime = parseFloat(e.target.value);
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Simulate downloading the FLAC track
  const triggerDownload = (track: Track) => {
    if (downloadingTrackId) return; // Only download one at a time
    setDownloadingTrackId(track.id);
    setDownloadProgress(0);

    const interval = setInterval(() => {
      setDownloadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            // Trigger actual browser file download for the preview URL
            const a = document.createElement('a');
            a.href = track.previewUrl;
            a.download = `${track.artist} - ${track.title} [Monochrome Lossless].flac`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            setDownloadingTrackId(null);
          }, 600);
          return 100;
        }
        return prev + Math.floor(Math.random() * 15) + 5;
      });
    }, 150);
  };

  return (
    <div className="space-y-8 animate-fadeIn pb-24">
      {/* Music Search Input Bar */}
      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 shadow-lg max-w-3xl">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input 
            type="text"
            placeholder="Search Monochrome.tf for tracks, albums, or artists..."
            className={`w-full pl-11 pr-4 py-3 bg-white/5 border rounded-xl text-sm text-white placeholder-white/30 outline-none transition-colors
              ${isMonochrome 
                ? 'border-white/5 focus:border-white' 
                : 'border-white/5 focus:border-red-500'}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {query && (
          <button 
            onClick={() => setQuery('')}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white rounded-xl text-xs font-semibold tracking-wider uppercase transition-all shrink-0 cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      
      {/* Tabs UI */}
      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8 border-b border-white/10 pb-4">
        <button 
          onClick={() => setActiveTab('tracks')} 
          className={`pb-2 text-sm font-bold tracking-wider uppercase transition-colors cursor-pointer ${activeTab === 'tracks' ? 'text-white border-b-2 border-white' : 'text-white/40 hover:text-white/80'}`}
        >
          Tracks
        </button>
        <button 
          onClick={() => setActiveTab('artists')} 
          className={`pb-2 text-sm font-bold tracking-wider uppercase transition-colors cursor-pointer ${activeTab === 'artists' ? 'text-white border-b-2 border-white' : 'text-white/40 hover:text-white/80'}`}
        >
          Artists
        </button>
        <button 
          onClick={() => setActiveTab('albums')} 
          className={`pb-2 text-sm font-bold tracking-wider uppercase transition-colors cursor-pointer ${activeTab === 'albums' ? 'text-white border-b-2 border-white' : 'text-white/40 hover:text-white/80'}`}
        >
          Albums
        </button>
        <button 
          onClick={() => setActiveTab('videos')} 
          className={`pb-2 text-sm font-bold tracking-wider uppercase transition-colors cursor-pointer ${activeTab === 'videos' ? 'text-white border-b-2 border-white' : 'text-white/40 hover:text-white/80'}`}
        >
          Videos
        </button>
        <button 
          onClick={() => setActiveTab('playlists')} 
          className={`pb-2 text-sm font-bold tracking-wider uppercase transition-colors cursor-pointer ${activeTab === 'playlists' ? 'text-white border-b-2 border-white' : 'text-white/40 hover:text-white/80'}`}
        >
          Playlists
        </button>
      </div>

            {/* Inline Video Player */}
      {playingTrack?.type === 'video' && (
        <div className="w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl mb-6 relative group border border-white/10 flex items-center justify-center">
          <ReactPlayer 
            url={playingTrack.previewUrl} 
            playing={isPlaying} 
            controls={true}
            width="100%" 
            height="100%" 
            volume={isMuted ? 0 : volume}
            onProgress={({ playedSeconds }) => {
              if (Math.abs(playedSeconds - currentTime) > 1) {
                setCurrentTime(playedSeconds);
              }
            }}
            onDuration={(d) => setDuration(d)}
            onEnded={() => {
              // Create a synthetic event or simply call playNextTrackInQueue logic manually
              const e = new CustomEvent('playNextTrackInQueue');
              window.dispatchEvent(e);
            }}
            style={{ position: 'absolute', top: 0, left: 0 }}
          />
        </div>
      )}

      {/* Main Tracks Content Layout */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <div className="flex items-center gap-2">
            <ListMusic className={`w-5 h-5 transition-all duration-300 ${isMonochrome ? 'text-white' : 'text-red-500'}`} />
            <h3 className="text-lg font-medium tracking-tight text-white">
              {debouncedQuery ? `Search Results for "${debouncedQuery}"` : 'Studio Masters Recommended'}
            </h3>
          </div>
          <span className="text-xs text-white/40 font-mono">
            {tracksToRender.length} tracks cataloged
          </span>
        </div>

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-white">
            <div className={`w-8 h-8 border-2 border-t-transparent rounded-full animate-spin ${isMonochrome ? 'border-white' : 'border-red-500'}`}></div>
            <span className="text-sm font-medium text-white/70">{activeTab === 'videos' ? 'Searching YouTube Videos...' : 'Connecting to Monochrome.tf stream index...'}</span>
          </div>
        )}

        {isError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center text-sm text-red-400">
            Failed to connect to Monochrome.tf. Please check your connection.
          </div>
        )}

        {!isLoading && !isError && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {(activeTab === 'tracks' || activeTab === 'videos') && !selectedArtist && tracksToRender.map((track) => {
              const isCurrent = playingTrack?.id === track.id;
              const isFav = favorites.includes(track.id);

              return (
                <div 
                  key={track.id}
                  className={`p-4 bg-white/5 border rounded-2xl transition-all flex gap-4 items-center group relative overflow-hidden shadow-md hover:scale-[1.02]
                    ${isCurrent 
                      ? (isMonochrome 
                          ? 'border-white/40 bg-white/10 shadow-white/5' 
                          : 'border-red-500 bg-red-950/10 shadow-red-500/5') 
                      : 'border-white/5 hover:border-white/10'}`}
                >
                  <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 relative shadow bg-slate-800">
                    <img 
                      src={track.artwork} 
                      alt={track.title} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity
                      ${isLoadingPreview === track.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      {isLoadingPreview === track.id ? (
                        <div className={`w-5 h-5 border-2 border-t-transparent rounded-full animate-spin ${isMonochrome ? 'border-white' : 'border-red-500'}`} />
                      ) : (
                        <button 
                          onClick={() => playTrack(track)}
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-white shadow hover:scale-110 active:scale-95 transition-all cursor-pointer
                            ${isMonochrome ? 'bg-white text-black' : 'bg-red-600 text-white'}`}
                        >
                          {isCurrent && isPlaying 
                            ? <Pause className={`w-4 h-4 ${isMonochrome ? 'fill-black text-black' : 'fill-white text-white'}`} /> 
                            : <Play className={`w-4 h-4 ml-0.5 ${isMonochrome ? 'fill-black text-black' : 'fill-white text-white'}`} />}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <p className={`text-sm font-bold truncate transition-colors ${isCurrent ? (isMonochrome ? 'text-white font-medium' : 'text-red-400') : 'text-white'}`}>
                      {track.title}
                    </p>
                    <p className="text-xs text-white/60 truncate">{track.artist}</p>
                    <p className="text-[10px] text-white/40 truncate italic">{track.album}</p>

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className={`px-1.5 py-0.5 text-[9px] font-black rounded border font-mono tracking-wider uppercase transition-colors duration-300
                        ${isMonochrome 
                          ? 'bg-white/10 text-white border-white/20' 
                          : 'bg-red-600/10 text-red-400 border-red-500/20'}`}>
                        {track.bitDepth}
                      </span>
                      <span className="px-1.5 py-0.5 bg-white/5 text-white/70 text-[9px] font-bold rounded border border-white/5 font-mono">
                        {track.sampleRate}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    <button 
                      onClick={() => toggleFavorite(track.id)}
                      className={`p-1.5 rounded-lg border transition-all cursor-pointer hover:scale-105
                        ${isFav 
                          ? (isMonochrome 
                              ? 'bg-white/10 text-white border-white/30' 
                              : 'bg-red-600/10 text-red-400 border-red-500/20') 
                          : 'bg-white/5 text-white/40 border-white/5 hover:text-white/80'}`}
                      title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Heart className={`w-3.5 h-3.5 ${isFav ? (isMonochrome ? 'fill-white text-white' : 'fill-red-500 text-red-500') : ''}`} />
                    </button>
                    
                    {(() => {
                      const isArtistSaved = savedArtists.some(a => a.artistName.toLowerCase() === track.artist.toLowerCase());
                      return (
                        <button 
                          onClick={() => toggleSaveArtist(track.artist, track.artwork)}
                          className={`p-1.5 rounded-lg border transition-all cursor-pointer hover:scale-105
                            ${isArtistSaved 
                              ? (isMonochrome 
                                  ? 'bg-white/10 text-white border-white/30' 
                                  : 'bg-red-600/10 text-red-400 border-red-500/20') 
                              : 'bg-white/5 text-white/40 border-white/5 hover:text-white/80'}`}
                          title={isArtistSaved ? 'Remove artist from library' : 'Add artist to library'}
                        >
                          {isArtistSaved ? <UserCheck className="w-3.5 h-3.5 text-green-500" /> : <UserPlus className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })()}

                    <button 
                      onClick={() => setShowPlaylistModalForTrack(track)}
                      className="p-1.5 rounded-lg bg-white/5 text-white/50 hover:text-white hover:bg-white/10 border border-white/5 transition-all cursor-pointer hover:scale-105"
                      title="Add to Playlist"
                    >
                      <ListPlus className="w-3.5 h-3.5" />
                    </button>

                    <button 
                      onClick={() => triggerDownload(track)}
                      disabled={downloadingTrackId !== null}
                      className="p-1.5 rounded-lg bg-white/5 text-white/50 hover:text-white hover:bg-white/10 border border-white/5 transition-all cursor-pointer disabled:opacity-50 hover:scale-105"
                      title="Download Lossless FLAC"
                    >
                      {downloadingTrackId === track.id ? (
                        <RefreshCw className={`w-3.5 h-3.5 animate-spin ${isMonochrome ? 'text-white' : 'text-red-500'}`} />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
            
            {!selectedArtist && activeTab === 'artists' && Array.from(new Set(tracksToRender.map(t => t.artist))).map(artistName => {
              const track = tracksToRender.find(t => t.artist === artistName);
              const isSaved = savedArtists.some(a => a.artistName.toLowerCase() === artistName.toLowerCase());
              return (
                <div 
                  key={artistName} 
                  onClick={() => setSelectedArtist(artistName)}
                  className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center gap-4 group hover:border-white/10 transition-all shadow-md hover:scale-[1.02] cursor-pointer"
                >
                  <img src={track?.artwork} alt={artistName} className="w-16 h-16 rounded-full object-cover shadow bg-slate-800" referrerPolicy="no-referrer" />
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-white truncate group-hover:underline">{artistName}</p>
                    <p className="text-xs text-white/50">Artist</p>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); track && toggleSaveArtist(artistName, track.artwork); }} 
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors cursor-pointer"
                    title={isSaved ? 'Remove artist from library' : 'Add artist to library'}
                  >
                    {isSaved ? <UserCheck className="w-4 h-4 text-green-500" /> : <UserPlus className="w-4 h-4" />}
                  </button>
                </div>
              );
            })}

            {!selectedArtist && activeTab === 'albums' && Array.from(new Set(tracksToRender.map(t => t.album))).map(albumName => {
              const track = tracksToRender.find(t => t.album === albumName);
              return (
                <div 
                  key={albumName} 
                  onClick={() => { setSelectedArtist(track?.artist || null); setSelectedAlbum(albumName); }}
                  className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center gap-4 group hover:border-white/10 transition-all shadow-md hover:scale-[1.02] cursor-pointer"
                >
                  <img src={track?.artwork} alt={albumName} className="w-16 h-16 rounded-lg object-cover shadow bg-slate-800" referrerPolicy="no-referrer" />
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-white truncate group-hover:underline">{albumName}</p>
                    <p className="text-xs text-white/50 truncate">{track?.artist}</p>
                  </div>
                </div>
              );
            })}

            {selectedArtist && !selectedAlbum && (
              <div className="col-span-full">
                <button 
                  onClick={() => setSelectedArtist(null)}
                  className="mb-4 text-sm text-white/50 hover:text-white transition-colors"
                >
                  &larr; Back to Artists
                </button>
                <h3 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                  <img 
                    src={tracksToRender.find(t => t.artist === selectedArtist)?.artwork} 
                    className="w-12 h-12 rounded-full object-cover shadow-lg"
                  />
                  {selectedArtist}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {Array.from(new Set(tracksToRender.filter(t => t.artist === selectedArtist).map(t => t.album))).map(albumName => {
                    const track = tracksToRender.find(t => t.album === albumName && t.artist === selectedArtist);
                    return (
                      <div 
                        key={albumName} 
                        onClick={() => setSelectedAlbum(albumName)}
                        className="p-4 bg-white/5 border border-white/5 rounded-2xl flex flex-col items-center gap-3 group hover:border-white/10 transition-all shadow-md hover:scale-[1.02] cursor-pointer"
                      >
                        <img src={track?.artwork} alt={albumName} className="w-full aspect-square rounded-xl object-cover shadow bg-slate-800" referrerPolicy="no-referrer" />
                        <div className="w-full text-center">
                          <p className="text-sm font-bold text-white truncate w-full group-hover:underline">{albumName}</p>
                          <p className="text-xs text-white/50 truncate w-full">{track?.year}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedArtist && selectedAlbum && (
              <div className="col-span-full">
                <button 
                  onClick={() => setSelectedAlbum(null)}
                  className="mb-4 text-sm text-white/50 hover:text-white transition-colors"
                >
                  &larr; Back to {selectedArtist} Albums
                </button>
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6 mb-8 p-6 bg-white/5 rounded-2xl border border-white/10">
                  <img 
                    src={tracksToRender.find(t => t.album === selectedAlbum)?.artwork} 
                    className="w-32 h-32 rounded-xl shadow-2xl bg-slate-800"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex-1">
                    <h3 className="text-3xl font-black text-white">{selectedAlbum}</h3>
                    <p className="text-white/60 mb-4">{selectedArtist}</p>
                    <button 
                      onClick={() => {
                        const albumTracks = tracksToRender.filter(t => t.album === selectedAlbum);
                        setAudioQueue(albumTracks);
                        playTrack(albumTracks[0]);
                      }}
                      className={`px-6 py-2.5 rounded-full font-bold transition-all shadow-lg hover:scale-105 active:scale-95 flex items-center gap-2
                        ${isMonochrome ? 'bg-white text-black' : 'bg-red-600 text-white'}`}
                    >
                      <Play className={`w-4 h-4 ${isMonochrome ? 'fill-black' : 'fill-white'}`} />
                      Play Album
                    </button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  {tracksToRender.filter(t => t.album === selectedAlbum).map((track, idx) => {
                    const isCurrent = playingTrack?.id === track.id;
                    const isFav = favorites.includes(track.id);
                    return (
                      <div 
                        key={track.id}
                        className={`p-3 bg-white/5 rounded-xl transition-all flex gap-4 items-center group relative overflow-hidden shadow-sm hover:bg-white/10 border
                          ${isCurrent ? (isMonochrome ? 'border-white/40 bg-white/10' : 'border-red-500/50 bg-red-900/20') : 'border-transparent hover:border-white/10'}`}
                      >
                        <div className="w-8 text-center text-white/40 font-mono text-sm">{idx + 1}</div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold truncate ${isCurrent ? (isMonochrome ? 'text-white' : 'text-red-400') : 'text-white/90 group-hover:text-white'}`}>
                            {track.title}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100">
                          <button 
                            onClick={() => { setAudioQueue([track]); playTrack(track); }} 
                            className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
                          >
                            {isCurrent && isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                          </button>
                          <button 
                            onClick={() => toggleFavorite(track.id)}
                            className={`p-2 rounded-lg transition-colors 
                              ${isFav ? (isMonochrome ? 'text-white' : 'text-red-500') : 'text-white/50 hover:text-white hover:bg-white/20'}`}
                            title="Favorite"
                          >
                            <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                          </button>
                          <button 
                            onClick={() => setShowPlaylistModalForTrack(track)} 
                            className="p-2 hover:bg-white/20 text-white/50 hover:text-white rounded-lg transition-colors" 
                            title="Add to Playlist"
                          >
                            <ListPlus className="w-4 h-4" />
                          </button>
                        </div>
                        {isCurrent && (
                          <div className="w-8 flex justify-center shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {tracksToRender.length === 0 && !isLoading && (
          <div className="bg-white/5 border border-white/5 rounded-2xl p-12 text-center max-w-lg mx-auto space-y-4">
            <Music className="w-12 h-12 text-white/20 mx-auto" />
            <h4 className="text-white font-medium text-base">No tracks found</h4>
            <p className="text-white/40 text-xs">
              We couldn't locate any high-fidelity tracks for "{query}" on Monochrome.tf. Try searching for other key terms.
            </p>
          </div>
        )}
      </div>

      {/* Simulated FLAC Download Progress Overlay */}
      {downloadingTrackId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-[#0c0c12] border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4 text-center">
            <div className={`w-16 h-16 border rounded-full flex items-center justify-center mx-auto animate-pulse transition-colors duration-300
              ${isMonochrome ? 'bg-white/5 border-white/20 text-white' : 'bg-red-600/10 border-red-500/20 text-red-500'}`}>
              <FileAudio className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">Monochrome Lossless Downloader</h4>
              <p className="text-xs text-white/50">Extracting high-fidelity FLAC audio stream...</p>
            </div>
            <div className="space-y-2">
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                <div 
                  className={`h-full rounded-full transition-all duration-150 ${isMonochrome ? 'bg-white' : 'bg-red-600'}`}
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-white/40">
                <span>Lossless FLAC</span>
                <span>{downloadProgress}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Audio Player Bar */}
      {playingTrack && (
        <div className="fixed bottom-0 left-20 right-0 z-40 bg-[#0c0c12]/95 border-t border-white/10 backdrop-blur-xl px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xl animate-slideUp">
          {/* Metadata Block */}
          <div className="flex items-center gap-3.5 min-w-0 w-full sm:w-auto">
            <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-slate-800 border border-white/5 relative group shadow-md">
              <img 
                src={playingTrack.artwork} 
                alt={playingTrack.title} 
                className={`w-full h-full object-cover ${isPlaying ? 'animate-spin' : ''}`}
                style={{ animationDuration: '8s' }}
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <Disc className={`w-4 h-4 text-white/70 ${isPlaying ? 'animate-spin' : ''}`} />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-white truncate leading-tight">{playingTrack.title}</p>
                <span className={`px-1 py-0.5 text-[8px] font-black rounded border font-mono tracking-wider transition-colors duration-300
                  ${isMonochrome ? 'bg-white/10 text-white border-white/20' : 'bg-red-600/10 text-red-400 border-red-500/20'}`}>
                  FLAC
                </span>
              </div>
              <p className="text-xs text-white/60 truncate mt-0.5">{playingTrack.artist}</p>
            </div>
          </div>

          {/* Player controls */}
          <div className="flex flex-col items-center gap-2 flex-1 max-w-xl w-full">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => playTrack(playingTrack)}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow hover:scale-105 active:scale-95 cursor-pointer
                  ${isMonochrome ? 'bg-white text-black hover:bg-neutral-200' : 'bg-red-600 hover:bg-red-500 text-white'}`}
              >
                {isLoadingPreview === playingTrack.id ? (
                  <div className={`w-5 h-5 border-2 border-t-transparent rounded-full animate-spin ${isMonochrome ? 'border-black' : 'border-white'}`} />
                ) : isPlaying ? (
                  <Pause className={`w-5 h-5 ${isMonochrome ? 'fill-black text-black' : 'fill-white text-white'}`} /> 
                ) : (
                  <Play className={`w-5 h-5 ml-0.5 ${isMonochrome ? 'fill-black text-black' : 'fill-white text-white'}`} />
                )}
              </button>
            </div>

            {/* Timeline slider */}
            <div className="flex items-center gap-2.5 w-full text-[10px] font-mono text-white/40">
              <span className="w-8 text-right">{formatTime(currentTime)}</span>
              <input 
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className={`flex-1 h-1.5 bg-white/5 border border-white/5 hover:border-white/10 rounded-full appearance-none cursor-pointer outline-none transition-colors duration-300
                  ${isMonochrome ? 'accent-white' : 'accent-red-600'}`}
              />
              <span className="w-8">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Extra utility controls */}
          <div className="hidden md:flex items-center gap-4 min-w-48 justify-end text-white/60">
            {audioQueue.length > 0 && playingTrack && (
              <div className="flex flex-col items-end mr-4 opacity-70 hover:opacity-100 transition-opacity">
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/50">Up Next</span>
                {(() => {
                  const currentIdx = audioQueue.findIndex(t => t.id === playingTrack.id);
                  if (currentIdx !== -1 && currentIdx < audioQueue.length - 1) {
                    const next = audioQueue[currentIdx + 1];
                    return <span className="text-xs font-medium text-white truncate max-w-[150px]" title={next.title}>{next.title}</span>;
                  }
                  return <span className="text-[10px] font-medium text-white/30 italic">End of Album</span>;
                })()}
              </div>
            )}

            <div className="flex items-center gap-1.5 text-[10px] font-mono border border-white/5 bg-white/[0.01] px-2 py-1 rounded">
              <Gauge className={`w-3 h-3 ${isMonochrome ? 'text-white' : 'text-red-500'}`} />
              <span>{playingTrack.bitrate}</span>
            </div>

            {/* Volume slider */}
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className="hover:text-white transition-colors cursor-pointer"
              >
                {isMuted ? <VolumeX className={`w-4 h-4 ${isMonochrome ? 'text-white' : 'text-red-500'}`} /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input 
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
                className={`w-16 h-1 bg-white/10 rounded-full appearance-none cursor-pointer transition-colors duration-300
                  ${isMonochrome ? 'accent-white' : 'accent-red-600'}`}
              />
            </div>
          </div>
        </div>
      )}

      {/* Playlist Selector Modal */}
      {showPlaylistModalForTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0c0c12] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ListMusic className="w-5 h-5 text-red-500" />
                Add to Playlist
              </h3>
              <button 
                onClick={() => setShowPlaylistModalForTrack(null)}
                className="text-white/40 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <p className="text-xs text-white/60">
              Add <span className="text-white font-semibold">{showPlaylistModalForTrack.title}</span> by <span className="text-white font-semibold">{showPlaylistModalForTrack.artist}</span> to one of your playlists:
            </p>

            {/* Playlists list */}
            <div className="max-h-48 overflow-y-auto space-y-2 custom-scrollbar">
              {playlists.map((playlist) => {
                const isTrackInPlaylist = playlist.tracks?.some((t: any) => t.id === showPlaylistModalForTrack.id);
                return (
                  <button
                    key={playlist.id}
                    onClick={() => addTrackToPlaylist(playlist.id, showPlaylistModalForTrack)}
                    className={`w-full text-left p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer
                      ${isTrackInPlaylist 
                        ? 'bg-red-600/10 border-red-500/30 text-red-400' 
                        : 'bg-white/5 border-white/5 hover:bg-white/10 text-white'}`}
                  >
                    <div>
                      <div className="font-bold text-sm">{playlist.name}</div>
                      <div className="text-[10px] text-white/40">{playlist.tracks?.length || 0} tracks</div>
                    </div>
                    {isTrackInPlaylist ? (
                      <Check className="w-4 h-4 text-red-400" />
                    ) : (
                      <Plus className="w-4 h-4 text-white/40" />
                    )}
                  </button>
                );
              })}
              
              {playlists.length === 0 && (
                <div className="text-center py-6 text-xs text-white/40">
                  You don't have any playlists yet.
                </div>
              )}
            </div>

            {/* Create New Playlist Form */}
            <div className="border-t border-white/5 pt-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white/50">Create New Playlist</h4>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Playlist Name" 
                  className="flex-1 px-3 py-2 bg-white/5 border border-white/5 rounded-xl text-xs text-white outline-none placeholder-white/30 focus:border-red-500"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                />
                <button
                  onClick={() => createPlaylist(newPlaylistName, '')}
                  disabled={!newPlaylistName.trim()}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shrink-0 cursor-pointer"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
