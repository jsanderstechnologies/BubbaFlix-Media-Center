import React, { useEffect, useState, useRef } from 'react';
import { collection, query, where, getDocs, onSnapshot, addDoc, deleteDoc, doc, updateDoc, arrayRemove, serverTimestamp } from '../lib/localDb';
import { db } from '../lib/localDb';
import { getCachedImageUrl } from '../services/tmdbApi';
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

const tmdbPosterCache = new Map<string, string>();
const tmdbRatingCache = new Map<string, string>();
const omdbRatingCache = new Map<string, string>();
const movieCollectionCache = new Map<string, any>();

function LibraryCardItem({
  item,
  itemKey,
  onSelectMedia,
  onPlayMedia,
  onHoverMedia
}: {
  item: any;
  itemKey: string;
  onSelectMedia: (media: any) => void;
  onPlayMedia?: (url: string, logo?: string, resumeTime?: number, context?: any) => void;
  onHoverMedia?: (posterUrl: string) => void;
}) {
  const rawTitle = item.title || item.name || '';
  const cleanTitle = rawTitle.replace(/\b(remastered|extended|uncut|1080p|720p|4k|bluray)\b/gi, '').trim();

  const [posterUrl, setPosterUrl] = useState<string>(() => {
    if (item.poster) return item.poster;
    if (item.backupPoster) return item.backupPoster;
    if (cleanTitle && tmdbPosterCache.has(cleanTitle)) return tmdbPosterCache.get(cleanTitle) || '';
    return '';
  });
  const [imgFailed, setImgFailed] = useState(false);
  const [rating, setRating] = useState<string>(() => {
    if (item.rating) return item.rating;
    if (cleanTitle && omdbRatingCache.has(cleanTitle)) return omdbRatingCache.get(cleanTitle) || '';
    if (cleanTitle && tmdbRatingCache.has(cleanTitle)) return tmdbRatingCache.get(cleanTitle) || '';
    return '';
  });

  // Fetch OMDB rating once if missing
  useEffect(() => {
    if (!cleanTitle || cleanTitle.length < 2) return;
    if (rating && rating !== '0' && rating !== '0.0' && rating !== 'SHARE') return;
    if (omdbRatingCache.has(cleanTitle)) return;

    fetch(`https://www.omdbapi.com/?apikey=trilogy&t=${encodeURIComponent(cleanTitle)}${item.year ? `&y=${item.year}` : ''}`)
      .then(r => r.json())
      .then(data => {
        if (data?.imdbRating && data.imdbRating !== 'N/A') {
          omdbRatingCache.set(cleanTitle, data.imdbRating);
          setRating(data.imdbRating);
        }
      })
      .catch(() => null);
  }, [cleanTitle]);

  // Fetch TMDB poster once if missing/failed
  useEffect(() => {
    if (!cleanTitle || cleanTitle.length < 2) return;
    if (posterUrl && !imgFailed) return;
    if (tmdbPosterCache.has(cleanTitle)) {
      const cached = tmdbPosterCache.get(cleanTitle);
      if (cached) setPosterUrl(cached);
      return;
    }

    const apiKey = localStorage.getItem('tmdbKey') || '841059f71aab310b4d4c4f3a7e28328e';
    const endpoint = item.type === 'series' ? 'tv' : 'movie';
    
    fetch(`https://api.themoviedb.org/3/search/${endpoint}?api_key=${apiKey}&query=${encodeURIComponent(cleanTitle)}`)
      .then(r => r.json())
      .then(data => {
        const match = data.results?.find((r: any) => r.poster_path || r.backdrop_path);
        if (match) {
          const pPath = match.poster_path || match.backdrop_path;
          const fullUrl = getCachedImageUrl(pPath) || `https://image.tmdb.org/t/p/w500${pPath}`;
          tmdbPosterCache.set(cleanTitle, fullUrl);
          setPosterUrl(fullUrl);
          setImgFailed(false);
          if (match.vote_average) {
            const rStr = match.vote_average.toFixed(1);
            tmdbRatingCache.set(cleanTitle, rStr);
            setRating(rStr);
          }
        }
      })
      .catch(() => null);
  }, [cleanTitle, imgFailed]);

  return (
    <div 
      key={itemKey} 
      className="focusable group cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-600 focus:scale-105 rounded-xl transition-all duration-200" 
      onClick={() => onSelectMedia({ ...item, poster: posterUrl || item.poster })}
      onMouseEnter={() => onHoverMedia?.(posterUrl || item.poster)}
      onMouseLeave={() => onHoverMedia?.('')}
      tabIndex={0}
      onKeyDown={(e) => {
        if (['Enter', ' ', 'Select', 'Accept'].includes(e.key) || e.keyCode === 13 || e.keyCode === 32 || e.keyCode === 29443) {
          e.preventDefault();
          e.stopPropagation();
          onSelectMedia({ ...item, poster: posterUrl || item.poster });
        }
      }}
    >
      <div className="aspect-[2/3] bg-slate-800 rounded-xl overflow-hidden mb-2 relative border border-white/5 shadow-lg group-hover:scale-105 group-hover:border-red-600 group-hover:ring-2 group-hover:ring-red-600/50 transition-all duration-500">
        {posterUrl && !imgFailed ? (
          <img 
            src={posterUrl} 
            alt={item.title} 
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover" 
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-between p-4 text-center bg-gradient-to-b from-indigo-950 via-slate-900 to-black relative overflow-hidden border border-white/10">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center mt-6 shadow-inner">
              <Disc className="w-6 h-6 text-indigo-400 animate-pulse" />
            </div>
            <div className="space-y-1 my-auto">
              <span className="text-xs font-black text-white tracking-wide uppercase line-clamp-3 drop-shadow">{item.title}</span>
              {item.year && <span className="text-[10px] text-indigo-300/80 font-bold block">{item.year}</span>}
            </div>
            <span className="text-[8px] font-black px-2 py-0.5 rounded bg-white/10 text-white/60 uppercase tracking-widest border border-white/5 mb-2">LOCAL MEDIA</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60"></div>
        
        {/* Hover Play Button */}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (item.streamUrl && onPlayMedia) {
                onPlayMedia(item.streamUrl, undefined, 0, { ...item, poster: posterUrl || item.poster });
              } else {
                onSelectMedia({ ...item, poster: posterUrl || item.poster });
              }
            }}
            className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all cursor-pointer"
            title="Play Shared File"
          >
            <Play className="w-6 h-6 ml-0.5 fill-white" />
          </button>
        </div>

        <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-col pointer-events-none">
          <span className="text-xs sm:text-sm font-medium leading-tight text-white drop-shadow truncate">{item.title}</span>
        </div>

        <div className="absolute top-2 left-2 flex gap-1 items-center">
          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shadow tracking-wider uppercase border ${item.isNetworkShare ? 'bg-indigo-600/90 text-white border-indigo-400/40' : 'bg-red-600/90 text-white border-red-400/40'}`}>
            {item.isNetworkShare ? 'LOCAL' : (item.type === 'movie' ? 'MOVIE' : 'TV')}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-white/70 font-mono">{item.year || 'N/A'}</span>
        {Boolean(rating && rating !== 'SHARE' && !isNaN(parseFloat(rating))) && (
          <span className="text-xs bg-black/40 text-amber-400 font-mono px-1.5 py-0.5 rounded border border-white/10">★ {rating}</span>
        )}
      </div>
    </div>
  );
}

export function LibraryGrid({ 
  onSelectMedia, 
  onPlayMedia, 
  onHoverMedia 
}: { 
  onSelectMedia: (media: any) => void, 
  onPlayMedia?: (url: string, logo?: string, resumeTime?: number, context?: any) => void,
  onHoverMedia?: (posterUrl: string) => void 
}) {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<any[]>([]);
  const [networkShareItems, setNetworkShareItems] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem('cached_network_share_items');
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      return [];
    }
  });
  const [savedArtists, setSavedArtists] = useState<any[]>([]);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [failedPosters, setFailedPosters] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (networkShareItems.length > 0) {
      try {
        localStorage.setItem('cached_network_share_items', JSON.stringify(networkShareItems));
      } catch (e) {}
    }
  }, [networkShareItems]);

  const loadNetworkShareItems = (forceRescan = false) => {
    fetch(`/api/local-media/library${forceRescan ? '?rescan=true' : ''}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.success && Array.isArray(data.data)) {
          setNetworkShareItems(data.data);
          try {
            localStorage.setItem('cached_network_share_items', JSON.stringify(data.data));
          } catch (e) {}
          if (data.data.some((i: any) => !i.poster)) {
            setTimeout(() => {
              fetch('/api/local-media/library')
                .then(r => r.json())
                .then(d2 => {
                  if (d2?.success && Array.isArray(d2.data)) {
                    setNetworkShareItems(d2.data);
                    try {
                      localStorage.setItem('cached_network_share_items', JSON.stringify(d2.data));
                    } catch (e) {}
                  }
                }).catch(() => null);
            }, 3000);
          }
        }
      })
      .catch(err => console.error("Error loading network share library:", err));
  };


  useEffect(() => {
    loadNetworkShareItems();
    const handleRefresh = () => loadNetworkShareItems(true);
    window.addEventListener('refresh-local-library', handleRefresh);
    return () => window.removeEventListener('refresh-local-library', handleRefresh);
  }, []);

  const [loading, setLoading] = useState(() => networkShareItems.length === 0);
  const [activeTab, setActiveTab] = useState<'movies' | 'series' | 'collections' | 'music'>('movies');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [collections, setCollections] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem('cached_movie_collections');
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      return [];
    }
  });
  const [selectedCollection, setSelectedCollection] = useState<any | null>(null);
  const [fullCollectionMovies, setFullCollectionMovies] = useState<any[]>([]);
  const [isLoadingFullCollection, setIsLoadingFullCollection] = useState(false);
  const [isResolvingCollections, setIsResolvingCollections] = useState(false);

  const handleSelectCollection = async (col: any) => {
    setSelectedCollection(col);
    setFullCollectionMovies(col.movies || []);
    setIsLoadingFullCollection(true);

    const apiKey = localStorage.getItem('tmdbKey') || '841059f71aab310b4d4c4f3a7e28328e';
    if (col && col.id) {
      try {
        const res = await fetch(`https://api.themoviedb.org/3/collection/${col.id}?api_key=${apiKey}`).then(r => r.json()).catch(() => null);
        if (res && Array.isArray(res.parts)) {
          const existingMovies = [...(col.movies || [])];

          const mergedMovies = res.parts.map((part: any) => {
            const partYear = part.release_date ? part.release_date.split('-')[0] : '';
            const match = existingMovies.find((m: any) => {
              if (m.realTmdbId && String(m.realTmdbId) === String(part.id)) return true;
              if (m.id && String(m.id) === String(part.id)) return true;
              const mClean = (m.title || m.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              const pClean = (part.title || part.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              const mYear = m.year || (m.release_date ? m.release_date.split('-')[0] : '');
              return mClean === pClean && (!partYear || !mYear || partYear === mYear);
            });

            if (match) return match;

            return {
              id: part.id,
              tmdbId: part.id,
              realTmdbId: part.id,
              title: part.title || part.name,
              name: part.title || part.name,
              year: partYear,
              poster: getCachedImageUrl(part.poster_path) || '',
              backdrop: getCachedImageUrl(part.backdrop_path) || '',
              rating: part.vote_average ? part.vote_average.toFixed(1) : '',
              overview: part.overview || '',
              type: 'movie'
            };
          });

          existingMovies.forEach((m: any) => {
            if (!mergedMovies.some((p: any) => p.id === m.id || p.title === m.title)) {
              mergedMovies.push(m);
            }
          });

          mergedMovies.sort((a: any, b: any) => {
            const yrA = parseInt(a.year || (a.release_date ? a.release_date.split('-')[0] : '9999'), 10) || 9999;
            const yrB = parseInt(b.year || (b.release_date ? b.release_date.split('-')[0] : '9999'), 10) || 9999;
            if (yrA !== yrB) return yrA - yrB;
            const tA = (a.title || a.name || '').toLowerCase();
            const tB = (b.title || b.name || '').toLowerCase();
            return tA.localeCompare(tB);
          });

          setFullCollectionMovies(mergedMovies);
        }
      } catch (e) {
        console.warn('Error fetching TMDB collection details:', e);
      } finally {
        setIsLoadingFullCollection(false);
      }
    } else {
      setIsLoadingFullCollection(false);
    }
  };

  useEffect(() => {
    if (collections.length > 0) {
      try {
        localStorage.setItem('cached_movie_collections', JSON.stringify(collections));
      } catch (e) {}
    }
  }, [collections]);

  useEffect(() => {
    setSelectedLetter(null);
  }, [activeTab]);

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

  // Resolve TMDB Collections for movies in user's library
  useEffect(() => {
    const isMovieItem = (item: any) => {
      if (!item) return false;
      const t = (item.type || item.mediaType || '').toLowerCase();
      if (t === 'movie' || t === 'movies') return true;
      if (t === 'series' || t === 'tv' || t === 'show' || t === 'tvseries' || t === 'shows') return false;
      return !Boolean(item.first_air_date || item.number_of_seasons || item.seasons);
    };

    const allMovies = [...networkShareItems, ...favorites].filter(isMovieItem);
    if (allMovies.length === 0) {
      setCollections([]);
      return;
    }

    let isActive = true;
    setIsResolvingCollections(true);

    const apiKey = localStorage.getItem('tmdbKey') || '841059f71aab310b4d4c4f3a7e28328e';

    (async () => {
      const collectionsMap = new Map<string, { id: any; name: string; poster: string; movies: any[] }>();

      const moviePromises = allMovies.map(async (movie) => {
        let tmdbId = movie.realTmdbId || (typeof movie.id === 'number' ? movie.id : null);
        let colInfo = movie.collectionInfo;
        const movieKey = movie.realTmdbId || movie.id || movie.title;
        if (movieCollectionCache.has(movieKey)) {
          colInfo = movieCollectionCache.get(movieKey);
          movie.collectionInfo = colInfo;
        } else {
          if (!tmdbId && typeof movie.id === 'string' && movie.id.startsWith('local_')) {
            try {
              const cleanTitle = (movie.title || movie.name || '').replace(/\b(remastered|extended|uncut|1080p|720p|4k)\b/gi, '').trim();
              const sRes = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(cleanTitle)}${movie.year ? `&year=${movie.year}` : ''}`).then(r => r.json()).catch(() => null);
              if (sRes?.results?.[0]?.id) {
                tmdbId = sRes.results[0].id;
                movie.realTmdbId = tmdbId;
              }
            } catch (e) {}
          }

          if (tmdbId && !colInfo) {
            try {
              const details = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}`).then(r => r.json()).catch(() => null);
              if (details?.belongs_to_collection) {
                const b = details.belongs_to_collection;
                colInfo = {
                  id: b.id,
                  name: b.name,
                  poster: getCachedImageUrl(b.poster_path) || getCachedImageUrl(b.backdrop_path) || movie.poster
                };
                movie.collectionInfo = colInfo;
              }
            } catch (e) {}
          }
          movieCollectionCache.set(movieKey, colInfo || null);
        }

        if (colInfo && colInfo.name) {
          const key = String(colInfo.id || colInfo.name);
          if (!collectionsMap.has(key)) {
            collectionsMap.set(key, {
              id: colInfo.id || key,
              name: colInfo.name,
              poster: colInfo.poster || movie.poster,
              movies: []
            });
          }
          const col = collectionsMap.get(key)!;
          if (!col.movies.some(m => m.id === movie.id || (m.title && m.title === movie.title))) {
            col.movies.push(movie);
          }
        }
      });

      await Promise.allSettled(moviePromises);

      if (!isActive) return;

      const resultCollections = Array.from(collectionsMap.values())
        .filter(c => c.movies.length > 0)
        .map(c => {
          c.movies.sort((a: any, b: any) => {
            const yrA = parseInt(a.year || (a.release_date ? a.release_date.split('-')[0] : '9999'), 10) || 9999;
            const yrB = parseInt(b.year || (b.release_date ? b.release_date.split('-')[0] : '9999'), 10) || 9999;
            if (yrA !== yrB) return yrA - yrB;
            const tA = (a.title || a.name || '').toLowerCase();
            const tB = (b.title || b.name || '').toLowerCase();
            return tA.localeCompare(tB);
          });
          return c;
        })
        .sort((a, b) => {
          const getSortableName = (name?: string) => (name || '').trim().replace(/^(the|a|an)\s+/i, '').trim();
          return getSortableName(a.name).localeCompare(getSortableName(b.name), undefined, { sensitivity: 'base', numeric: true });
        });

      setCollections(resultCollections);
      setIsResolvingCollections(false);
    })();

    return () => { isActive = false; };
  }, [networkShareItems, favorites]);

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

  const selectedPlaylistRef = useRef(selectedPlaylist);
  useEffect(() => {
    selectedPlaylistRef.current = selectedPlaylist;
  }, [selectedPlaylist]);

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
      if (selectedPlaylistRef.current) {
        const updated = items.find(p => p.id === selectedPlaylistRef.current?.id);
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
  }, [user]);

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

  const isMatchSeries = (item: any) => {
    if (!item) return false;
    const t = (item.type || item.mediaType || '').toLowerCase();
    if (t === 'series' || t === 'tv' || t === 'show' || t === 'tvseries' || t === 'shows') return true;
    if (t === 'movie' || t === 'movies') return false;
    return Boolean(item.first_air_date || item.number_of_seasons || item.seasons);
  };

  const isMatchMovie = (item: any) => {
    if (!item) return false;
    const t = (item.type || item.mediaType || '').toLowerCase();
    if (t === 'movie' || t === 'movies') return true;
    if (t === 'series' || t === 'tv' || t === 'show' || t === 'tvseries' || t === 'shows') return false;
    return !isMatchSeries(item);
  };

  const userFavs = favorites.filter(item => {
    if (activeTab === 'movies') return isMatchMovie(item);
    if (activeTab === 'series') return isMatchSeries(item);
    return false;
  });

  const shareMedia = networkShareItems.filter(item => {
    if (activeTab === 'movies') return isMatchMovie(item);
    if (activeTab === 'series') return isMatchSeries(item);
    return false;
  });

  const getItemKey = (item: any, index: number) => {
    if (item.favoriteId) return `fav_${item.favoriteId}`;
    if (item.filePath) return `path_${item.filePath}`;
    if (item.id) return `item_${item.id}`;
    return `idx_${index}_${item.title || item.name}`;
  };

  const getSortableTitle = (title?: string) => {
    if (!title) return '';
    return title.trim().replace(/^(the|a|an)\s+/i, '').trim();
  };

  // Deduplicate items by unique tmdbId / title / filePath and sort alphabetically
  const rawMedia = [...shareMedia, ...userFavs];
  const seenKeys = new Set<string>();
  const filteredMedia = rawMedia.filter((item) => {
    const normTitle = (item.title || item.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const idKey = item.tmdbId ? `tmdb_${item.tmdbId}` : (item.id ? `id_${item.id}` : (item.filePath ? `path_${item.filePath}` : `title_${normTitle}`));
    const key = `${item.type || 'media'}_${idKey}_${normTitle}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  filteredMedia.sort((a, b) => {
    const tA = getSortableTitle(a.title || a.name);
    const tB = getSortableTitle(b.title || b.name);
    return tA.localeCompare(tB, undefined, { sensitivity: 'base', numeric: true });
  });

  const getItemFirstChar = (item: any): string => {
    const title = getSortableTitle(item.title || item.name);
    if (!title) return '#';
    const firstChar = title.charAt(0).toUpperCase();
    if (/[0-9]/.test(firstChar)) return '#';
    if (/[A-Z]/.test(firstChar)) return firstChar;
    return '#';
  };

  const alphabetList = ['ALL', '#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
  const availableLetters = new Set(filteredMedia.map(getItemFirstChar));

  const [displayCount, setDisplayCount] = useState(60);

  useEffect(() => {
    setDisplayCount(60);
  }, [activeTab, selectedLetter]);

  const displayMedia = selectedLetter && selectedLetter !== 'ALL'
    ? filteredMedia.filter(item => getItemFirstChar(item) === selectedLetter)
    : filteredMedia;

  const visibleMedia = displayMedia.slice(0, displayCount);

  const movieCount = networkShareItems.filter(i => isMatchMovie(i)).length + favorites.filter(i => isMatchMovie(i)).length;
  const seriesCount = networkShareItems.filter(i => isMatchSeries(i)).length + favorites.filter(i => isMatchSeries(i)).length;

  return (
    <div className="mt-8 relative pb-24">
      {/* Tab Selectors */}
      <div className="flex gap-6 mb-6 border-b border-white/10 pb-4">
        <button 
          onClick={() => { setActiveTab('movies'); setSelectedPlaylist(null); setSelectedCollection(null); setSelectedLetter(null); }}
          className={`text-sm font-bold tracking-widest uppercase transition-colors ${activeTab === 'movies' ? 'text-red-500 border-b-2 border-red-500 pb-4 -mb-[18px]' : 'text-white/60 hover:text-white pb-4'}`}
        >
          Movies ({movieCount})
        </button>
        <button 
          onClick={() => { setActiveTab('series'); setSelectedPlaylist(null); setSelectedCollection(null); setSelectedLetter(null); }}
          className={`text-sm font-bold tracking-widest uppercase transition-colors ${activeTab === 'series' ? 'text-red-500 border-b-2 border-red-500 pb-4 -mb-[18px]' : 'text-white/60 hover:text-white pb-4'}`}
        >
          TV Series ({seriesCount})
        </button>
        <button 
          onClick={() => { setActiveTab('collections'); setSelectedPlaylist(null); setSelectedCollection(null); setSelectedLetter(null); }}
          className={`text-sm font-bold tracking-widest uppercase transition-colors ${activeTab === 'collections' ? 'text-red-500 border-b-2 border-red-500 pb-4 -mb-[18px]' : 'text-white/60 hover:text-white pb-4'}`}
        >
          Collections ({collections.length})
        </button>
      </div>

      {/* Movies / Series / Collections content */}
      {activeTab === 'collections' ? (
        <div>
          {isResolvingCollections && collections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <span className="text-xs font-mono text-white/60 uppercase tracking-widest animate-pulse">Scanning TMDB Movie Collections...</span>
            </div>
          ) : selectedCollection ? (
            <div>
              <div className="flex items-center gap-4 mb-6">
                <button 
                  onClick={() => setSelectedCollection(null)}
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/80 hover:text-white transition-colors bg-white/5 border border-white/10 px-3.5 py-2 rounded-xl cursor-pointer"
                >
                  ← Back to Collections
                </button>
                <h3 className="text-lg font-bold text-white tracking-wide">{selectedCollection.name} ({fullCollectionMovies.length} Movies)</h3>
              </div>
              <section className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-4 sm:gap-6">
                {fullCollectionMovies.map((item: any, idx: number) => (
                  <LibraryCardItem
                    key={getItemKey(item, idx)}
                    item={item}
                    itemKey={getItemKey(item, idx)}
                    onSelectMedia={onSelectMedia}
                    onPlayMedia={onPlayMedia}
                    onHoverMedia={onHoverMedia}
                  />
                ))}
              </section>
            </div>
          ) : collections.length === 0 ? (
            <div className="text-white/50 text-sm py-12 text-center bg-white/[0.02] border border-white/5 rounded-2xl max-w-md mx-auto">
              No movie collections found. Add franchise movies to your library to view automatically grouped collections!
            </div>
          ) : (
            <section className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-4 sm:gap-6">
              {collections.map((col: any) => (
                <div
                  key={col.id}
                  onClick={() => handleSelectCollection(col)}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSelectCollection(col); }}
                  className="group cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-600 rounded-xl"
                >
                  <div className="aspect-[2/3] bg-slate-800 rounded-xl overflow-hidden mb-2 relative border border-white/5 shadow-lg group-hover:scale-105 group-hover:border-red-600 group-hover:ring-2 group-hover:ring-red-600/50 transition-all duration-500">
                    <img 
                      src={col.poster} 
                      alt={col.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-2 left-2 flex gap-1 items-center">
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded shadow tracking-wider uppercase border bg-red-600/90 text-white border-red-400/40">
                        COLLECTION
                      </span>
                    </div>
                    <div className="absolute top-2 right-2 flex gap-1 items-center">
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded shadow tracking-wider uppercase border bg-black/80 text-white border-white/20 font-mono">
                        {col.movies.length} {col.movies.length === 1 ? 'MOVIE' : 'MOVIES'}
                      </span>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                      <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Franchise</span>
                      <span className="text-xs font-bold text-white leading-tight">{col.name}</span>
                      <span className="text-[10px] text-white/70 font-mono mt-1">{col.movies.length} {col.movies.length === 1 ? 'Movie' : 'Movies'} in Library</span>
                    </div>
                  </div>
                  <h3 className="text-xs font-medium text-white/90 truncate group-hover:text-red-400 transition-colors">
                    {col.name}
                  </h3>
                </div>
              ))}
            </section>
          )}
        </div>
      ) : (
        <>
          {/* Quick-Jump Alphabet Index Bar */}
          {filteredMedia.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 mb-6 py-2 px-3 bg-white/[0.03] backdrop-blur-md rounded-xl border border-white/10">
              <span className="text-[10px] font-black uppercase text-white/40 tracking-wider mr-1 sm:mr-2">Jump To:</span>
              {alphabetList.map((letter) => {
                const isAll = letter === 'ALL';
                const isActive = isAll ? !selectedLetter || selectedLetter === 'ALL' : selectedLetter === letter;
                const hasItems = isAll ? true : availableLetters.has(letter);

                return (
                  <button
                    key={letter}
                    disabled={!hasItems && !isAll}
                    onClick={() => setSelectedLetter(isActive ? null : letter)}
                    className={`focusable px-2 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-red-600 focus:text-white focus:scale-110 relative z-20 ${
                      isActive
                        ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 scale-105'
                        : hasItems
                        ? 'bg-white/5 text-white/80 hover:bg-white/15 hover:text-white'
                        : 'bg-transparent text-white/20 cursor-not-allowed opacity-40'
                    }`}
                    title={hasItems || isAll ? `Show items starting with ${letter}` : `No items starting with ${letter}`}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          )}

          {displayMedia.length === 0 ? (
            <div className="text-white/50 text-sm py-12 text-center bg-white/[0.02] border border-white/5 rounded-2xl max-w-md mx-auto">
              {selectedLetter ? `No ${activeTab === 'movies' ? 'movies' : 'TV series'} found starting with "${selectedLetter}".` : `Your ${activeTab === 'movies' ? 'movies' : 'TV series'} library is empty. Add a network share folder in Settings or bookmark media!`}
            </div>
          ) : (
            <>
              <section key={activeTab} className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-4 sm:gap-6">
                {visibleMedia.map((item: any, idx: number) => (
                  <LibraryCardItem
                    key={getItemKey(item, idx)}
                    item={item}
                    itemKey={getItemKey(item, idx)}
                    onSelectMedia={onSelectMedia}
                    onPlayMedia={onPlayMedia}
                    onHoverMedia={onHoverMedia}
                  />
                ))}
              </section>
              {displayMedia.length > displayCount && (
                <div className="mt-8 text-center">
                  <button
                    onClick={() => setDisplayCount(prev => prev + 60)}
                    className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-lg hover:scale-105 cursor-pointer"
                  >
                    Load More ({displayMedia.length - displayCount} Remaining)
                  </button>
                </div>
              )}
            </>
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
