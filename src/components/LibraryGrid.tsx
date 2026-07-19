import React, { useEffect, useState, useRef } from 'react';
import { collection, query, where, getDocs, onSnapshot, addDoc, deleteDoc, doc, updateDoc, arrayRemove, serverTimestamp } from '../lib/localDb';
import { db } from '../lib/localDb';
import { useAuth } from './Auth';
import { Music, Plus, Play, Pause, Trash2, ChevronLeft, Disc, Volume2, ListMusic, Users, Check } from 'lucide-react';

interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  previewUrl: string;
  durationMs: number;
  sampleRate?: string;
  bitDepth?: string;
  bitrate?: string;
  fileSize?: string;
  year?: string;
}

export function LibraryGrid({ onSelectMedia, onHoverMedia }: { onSelectMedia: (media: any) => void, onHoverMedia?: (posterUrl: string) => void }) {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<any[]>([]);
  const [savedArtists, setSavedArtists] = useState<any[]>([]);
  const [playlists, setPlaylists] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'movies' | 'series' | 'music'>('movies');
  const [musicSubTab, setMusicSubTab] = useState<'artists' | 'playlists'>('artists');
  
  const [selectedPlaylist, setSelectedPlaylist] = useState<any | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
  
  // Audio state
  const [playingTrack, setPlayingTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoadingPreview, setIsLoadingPreview] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize Audio
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

  const getPlayableUrl = async (trackId: string, artist: string, title: string): Promise<string> => {
    try {
      const cleanId = trackId.replace('mono-', '');
      if (trackId.startsWith('mono-') || !isNaN(Number(cleanId))) {
        const res = await fetch(`https://api.monochrome.tf/track?id=${cleanId}`);
        if (res.ok) {
          const json = await res.json();
          if (json.data?.manifest) {
            const manifestXml = atob(json.data.manifest);
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
              }
              
              const chunks: ArrayBuffer[] = [];
              const initRes = await fetch(initUrl);
              if (initRes.ok) {
                chunks.push(await initRes.arrayBuffer());
              }
              
              const segPromises = Array.from({ length: numSegments }, (_, idx) => {
                const segNum = idx + 1;
                const segmentUrl = mediaTemplate.replace('$Number$', String(segNum));
                return fetch(segmentUrl)
                  .then(r => r.ok ? r.arrayBuffer() : null)
                  .catch(() => null);
              });
              
              const segResults = await Promise.all(segPromises);
              for (const s of segResults) {
                if (s) chunks.push(s);
              }
              
              if (chunks.length > 1) {
                const blob = new Blob(chunks, { type: 'audio/mp4' });
                return URL.createObjectURL(blob);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('Failed to build lossless stream, falling back to iTunes...', err);
    }
    
    try {
      const searchTerm = `${artist} ${title}`;
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&media=music&limit=1`);
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results[0]?.previewUrl) {
          return data.results[0].previewUrl;
        }
      }
    } catch (err) {
      console.error('Error finding playable preview URL:', err);
    }
    return '';
  };

  const playTrack = async (track: Track) => {
    if (!audioRef.current) return;

    if (playingTrack?.id === track.id) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().catch(err => console.error(err));
        setIsPlaying(true);
      }
    } else {
      let url = track.previewUrl;
      if (!url) {
        setIsLoadingPreview(track.id);
        url = await getPlayableUrl(track.id, track.artist, track.title);
        track.previewUrl = url;
        setIsLoadingPreview(null);
      }

      audioRef.current.src = url;
      audioRef.current.load();
      setPlayingTrack(track);
      setIsPlaying(true);
      audioRef.current.play().catch(err => console.error(err));
    }
  };

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

  // Listen to Favorites (Movies/Series)
  useEffect(() => {
    if (!user) {
      setFavorites([]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'favorites'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      items.sort((a: any, b: any) => (b.addedAt?.toMillis?.() || 0) - (a.addedAt?.toMillis?.() || 0));
      
      const mappedItems = items.map((item: any) => ({
        id: item.tmdbId,
        title: item.title,
        poster: item.poster,
        year: item.year,
        rating: item.rating,
        resolution: item.resolution,
        overview: item.overview || '',
        type: item.type,
        favoriteId: item.id
      }));
      setFavorites(mappedItems);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching favorites:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Listen to Saved Artists
  useEffect(() => {
    if (!user) {
      setSavedArtists([]);
      return;
    }

    const q = query(collection(db, 'saved_artists'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSavedArtists(items);
    }, (error) => {
      console.error('Error fetching saved artists:', error);
    });

    return () => unsubscribe();
  }, [user]);

  // Listen to Playlists
  useEffect(() => {
    if (!user) {
      setPlaylists([]);
      return;
    }

    const q = query(collection(db, 'music_playlists'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPlaylists(items);
      
      // Update currently viewed playlist if it changed
      if (selectedPlaylist) {
        const updated = items.find(p => p.id === selectedPlaylist.id);
        if (updated) {
          setSelectedPlaylist(updated);
        } else {
          setSelectedPlaylist(null);
        }
      }
    }, (error) => {
      console.error('Error fetching music playlists:', error);
    });

    return () => unsubscribe();
  }, [user, selectedPlaylist]);

  const handleUnfollowArtist = async (artistId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'saved_artists', artistId));
    } catch (err) {
      console.error('Error unfollowing artist:', err);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!user || !newPlaylistName.trim()) return;
    try {
      await addDoc(collection(db, 'music_playlists'), {
        userId: user.uid,
        name: newPlaylistName.trim(),
        description: newPlaylistDesc.trim() || '',
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

  const handleDeletePlaylist = async (playlistId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    if (!window.confirm("Are you sure you want to delete this playlist?")) return;
    try {
      await deleteDoc(doc(db, 'music_playlists', playlistId));
      if (selectedPlaylist?.id === playlistId) {
        setSelectedPlaylist(null);
      }
    } catch (err) {
      console.error('Error deleting playlist:', err);
    }
  };

  const handleRemoveTrackFromPlaylist = async (playlistId: string, track: Track) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'music_playlists', playlistId), {
        tracks: arrayRemove(track),
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error('Error removing track:', err);
    }
  };

  if (loading) {
    return <div className="text-white text-sm mt-8">Loading library...</div>;
  }

  if (!user) {
    return <div className="text-white text-sm mt-8">Please log in to view your library.</div>;
  }

  const filteredFavorites = favorites.filter(item => {
    if (activeTab === 'movies') return item.type === 'movie';
    if (activeTab === 'series') return item.type === 'series';
    return false;
  });

  return (
    <div className="mt-8 relative pb-24">
      {/* Tab Selectors */}
      <div className="flex gap-6 mb-6 border-b border-white/10 pb-4">
        <button 
          onClick={() => { setActiveTab('movies'); setSelectedPlaylist(null); }}
          className={`text-sm font-bold tracking-widest uppercase transition-colors ${activeTab === 'movies' ? 'text-red-500 border-b-2 border-red-500 pb-4 -mb-[18px]' : 'text-white/60 hover:text-white pb-4'}`}
        >
          Movies
        </button>
        <button 
          onClick={() => { setActiveTab('series'); setSelectedPlaylist(null); }}
          className={`text-sm font-bold tracking-widest uppercase transition-colors ${activeTab === 'series' ? 'text-red-500 border-b-2 border-red-500 pb-4 -mb-[18px]' : 'text-white/60 hover:text-white pb-4'}`}
        >
          TV Series
        </button>
        <button 
          onClick={() => { setActiveTab('music'); }}
          className={`text-sm font-bold tracking-widest uppercase transition-colors ${activeTab === 'music' ? 'text-red-500 border-b-2 border-red-500 pb-4 -mb-[18px]' : 'text-white/60 hover:text-white pb-4'}`}
        >
          Music Library
        </button>
      </div>

      {/* Movies / Series content */}
      {activeTab !== 'music' && (
        <>
          {filteredFavorites.length === 0 ? (
            <div className="text-white/50 text-sm py-12 text-center bg-white/[0.02] border border-white/5 rounded-2xl max-w-md mx-auto">
              Your {activeTab === 'movies' ? 'movies' : 'TV series'} library is empty.
            </div>
          ) : (
            <section className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4">
              {filteredFavorites.map((item: any) => (
                <div 
                  key={item.favoriteId} 
                  className="group cursor-pointer" 
                  onClick={() => onSelectMedia(item)}
                  onMouseEnter={() => onHoverMedia?.(item.poster)}
                  onMouseLeave={() => onHoverMedia?.('')}
                >
                  <div className="aspect-[2/3] bg-slate-800 rounded-xl overflow-hidden mb-3 relative border border-white/5 shadow-2xl group-hover:scale-105 group-hover:border-red-600 group-hover:ring-2 group-hover:ring-red-600/50 transition-all duration-500">
                    {item.poster ? (
                      <img src={item.poster} alt={item.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60"></div>
                    <div className="absolute bottom-3 left-3 flex flex-col">
                      <span className="text-sm font-medium leading-tight text-white">{item.title}</span>
                    </div>
                    <div className="absolute top-3 left-3 bg-red-600/80 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                      {item.type === 'movie' ? 'MOVIE' : 'TV'}
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs text-white/90">{item.year || 'N/A'}</span>
                    <span className="text-xs bg-black/40 text-white px-1.5 py-0.5 rounded border border-white/10">{item.rating || '0.0'}</span>
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {/* Music Library Tab Content */}
      {activeTab === 'music' && !selectedPlaylist && (
        <div className="space-y-6">
          {/* Sub Tab Selectors */}
          <div className="flex gap-4 items-center bg-white/[0.02] border border-white/5 p-1 rounded-xl w-fit">
            <button
              onClick={() => setMusicSubTab('artists')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-1.5
                ${musicSubTab === 'artists' ? 'bg-red-600 text-white shadow' : 'text-white/60 hover:text-white'}`}
            >
              <Users className="w-3.5 h-3.5" />
              Saved Artists
            </button>
            <button
              onClick={() => setMusicSubTab('playlists')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-1.5
                ${musicSubTab === 'playlists' ? 'bg-red-600 text-white shadow' : 'text-white/60 hover:text-white'}`}
            >
              <ListMusic className="w-3.5 h-3.5" />
              Music Playlists
            </button>
          </div>

          {/* Saved Artists list */}
          {musicSubTab === 'artists' && (
            <div>
              {savedArtists.length === 0 ? (
                <div className="text-white/50 text-sm py-12 text-center bg-white/[0.02] border border-white/5 rounded-2xl max-w-md mx-auto space-y-3">
                  <Users className="w-10 h-10 mx-auto text-white/20" />
                  <p>You haven't added any artists to your library yet.</p>
                  <p className="text-xs text-white/40 leading-relaxed">Browse tracks in the Music tab and click the add artist button to save artists here.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-6">
                  {savedArtists.map((artist) => (
                    <div key={artist.id} className="flex flex-col items-center text-center group relative">
                      <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-zinc-800 border border-white/5 relative shadow-xl hover:scale-105 hover:border-red-600 hover:ring-4 hover:ring-red-600/30 transition-all duration-300">
                        <img 
                          src={artist.artwork || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=300&h=300"} 
                          alt={artist.artistName} 
                          className="w-full h-full object-cover" 
                          referrerPolicy="no-referrer"
                        />
                        <button 
                          onClick={() => handleUnfollowArtist(artist.id)}
                          className="absolute inset-0 bg-black/75 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-red-500 font-bold text-xs cursor-pointer"
                        >
                          Unfollow
                        </button>
                      </div>
                      <span className="text-xs font-semibold mt-3 text-white truncate max-w-full">{artist.artistName}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Playlists view */}
          {musicSubTab === 'playlists' && (
            <div className="space-y-6">
              {/* Creator Form */}
              <div className="bg-[#0c0c12] border border-white/10 rounded-2xl p-5 max-w-lg space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-white">Create Music Playlist</h4>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input 
                    type="text" 
                    placeholder="e.g. Late Night Jazz, Workout Beats..." 
                    className="flex-1 px-3 py-2 bg-white/5 border border-white/5 rounded-xl text-xs text-white outline-none placeholder-white/30 focus:border-red-500"
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                  />
                  <button
                    onClick={handleCreatePlaylist}
                    disabled={!newPlaylistName.trim()}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shrink-0 cursor-pointer"
                  >
                    Create
                  </button>
                </div>
              </div>

              {playlists.length === 0 ? (
                <div className="text-white/50 text-sm py-12 text-center bg-white/[0.02] border border-white/5 rounded-2xl max-w-md mx-auto space-y-3">
                  <ListMusic className="w-10 h-10 mx-auto text-white/20" />
                  <p>You haven't created any playlists yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {playlists.map((playlist) => (
                    <div 
                      key={playlist.id}
                      onClick={() => setSelectedPlaylist(playlist)}
                      className="p-5 bg-white/5 border border-white/5 hover:border-white/10 rounded-2xl cursor-pointer transition-all hover:scale-[1.02] flex flex-col justify-between h-40 group relative overflow-hidden"
                    >
                      <div className="space-y-2">
                        <div className="w-10 h-10 rounded-lg bg-red-600/15 border border-red-500/20 flex items-center justify-center text-red-500">
                          <ListMusic className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-base leading-snug truncate pr-6">{playlist.name}</h3>
                          <p className="text-xs text-white/40 truncate mt-0.5">{playlist.description || "Custom Playlist"}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-4">
                        <span className="text-[10px] font-mono text-white/50 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                          {playlist.tracks?.length || 0} tracks
                        </span>
                        
                        <button
                          onClick={(e) => handleDeletePlaylist(playlist.id, e)}
                          className="text-white/40 hover:text-red-500 transition-colors p-1 rounded hover:bg-white/5 cursor-pointer"
                          title="Delete Playlist"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Playlist Inspector Detail View */}
      {activeTab === 'music' && selectedPlaylist && (
        <div className="space-y-6">
          <button 
            onClick={() => setSelectedPlaylist(null)}
            className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white bg-white/5 border border-white/5 px-3 py-1.5 rounded-lg font-bold tracking-wider uppercase cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Playlists
          </button>

          <div className="flex flex-col md:flex-row gap-6 items-start md:items-end justify-between border-b border-white/5 pb-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-red-600/10 border border-red-500/20 flex items-center justify-center text-red-500 shrink-0">
                <ListMusic className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-2xl font-bold text-white tracking-tight">{selectedPlaylist.name}</h3>
                <p className="text-xs text-white/50">{selectedPlaylist.tracks?.length || 0} Tracks • Saved Playlist</p>
              </div>
            </div>
          </div>

          {selectedPlaylist.tracks?.length === 0 ? (
            <div className="text-white/50 text-sm py-12 text-center bg-white/[0.02] border border-white/5 rounded-2xl max-w-md mx-auto space-y-3">
              <Music className="w-10 h-10 mx-auto text-white/20" />
              <p>This playlist is currently empty.</p>
              <p className="text-xs text-white/40 leading-relaxed">Go to the Music tab, search for tracks, and click the add to playlist button to fill this up!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {selectedPlaylist.tracks.map((track: Track) => {
                const isCurrent = playingTrack?.id === track.id;
                return (
                  <div 
                    key={track.id}
                    className={`p-4 bg-white/5 border rounded-2xl transition-all flex gap-4 items-center group relative overflow-hidden shadow-md hover:scale-[1.02]
                      ${isCurrent ? 'border-red-500 bg-red-950/10 shadow-red-500/5' : 'border-white/5 hover:border-white/10'}`}
                  >
                    <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 relative shadow bg-slate-800">
                      <img src={track.artwork} alt={track.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => playTrack(track)}
                          className="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center shadow hover:scale-110 active:scale-95 transition-all cursor-pointer"
                        >
                          {isCurrent && isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 ml-0.5 fill-white" />}
                        </button>
                      </div>
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <p className={`text-sm font-bold truncate transition-colors ${isCurrent ? 'text-red-400' : 'text-white'}`}>
                        {track.title}
                      </p>
                      <p className="text-xs text-white/60 truncate">{track.artist}</p>
                      <div className="flex gap-1.5 mt-2">
                        <span className="px-1 py-0.5 bg-red-600/10 text-red-400 text-[8px] font-black rounded border border-red-500/20 font-mono tracking-wider uppercase">
                          {track.bitDepth || '16-bit'}
                        </span>
                        <span className="px-1.5 py-0.5 bg-white/5 text-white/70 text-[8px] font-bold rounded border border-white/5 font-mono">
                          {track.sampleRate || '44.1 kHz'}
                        </span>
                      </div>
                    </div>

                    <button 
                      onClick={() => handleRemoveTrackFromPlaylist(selectedPlaylist.id, track)}
                      className="p-1.5 rounded-lg bg-white/5 text-white/40 hover:text-red-500 hover:bg-red-500/10 border border-white/5 hover:border-red-500/20 transition-all cursor-pointer shrink-0"
                      title="Remove track from playlist"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Floating Audio Player Bar for Library View */}
      {playingTrack && (
        <div className="fixed bottom-0 left-20 right-0 z-40 bg-[#0c0c12]/95 border-t border-white/10 backdrop-blur-xl px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xl animate-slideUp">
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
                <span className="px-1 py-0.5 text-[8px] font-black rounded border border-red-500/20 bg-red-600/10 text-red-400 font-mono tracking-wider">
                  FLAC
                </span>
              </div>
              <p className="text-xs text-white/60 truncate mt-0.5">{playingTrack.artist}</p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 flex-1 max-w-xl w-full">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => playTrack(playingTrack)}
                className="w-10 h-10 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-all shadow hover:scale-105 active:scale-95 cursor-pointer"
              >
                {isLoadingPreview === playingTrack.id ? (
                  <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin border-white" />
                ) : isPlaying ? (
                  <Pause className="w-5 h-5 fill-white" /> 
                ) : (
                  <Play className="w-5 h-5 ml-0.5 fill-white" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2.5 w-full text-[10px] font-mono text-white/40">
              <span className="w-8 text-right">{formatTime(currentTime)}</span>
              <input 
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-1.5 bg-white/5 border border-white/5 hover:border-white/10 rounded-full appearance-none cursor-pointer outline-none accent-red-600"
              />
              <span className="w-8">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4 w-48 justify-end text-white/60">
            <div className="flex items-center gap-1.5 text-[10px] font-mono border border-white/5 bg-white/[0.01] px-2 py-1 rounded">
              <span>{playingTrack.bitrate || '1411 kbps'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LibraryGrid;
