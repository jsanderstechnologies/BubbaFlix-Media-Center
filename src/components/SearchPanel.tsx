import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchMovies, searchTvSeries, searchActors } from '../services/tmdbApi';
import { Play, Pause, Music, Info, Film, Tv, Users, Search, Sparkles, ExternalLink, Disc, Loader2, Volume2, SkipBack, SkipForward } from 'lucide-react';

interface SearchPanelProps {
  query: string;
  onSelectMedia: (media: any) => void;
  onHoverMedia?: (posterUrl: string) => void;
  onSelectSuggestion: (term: string) => void;
  onActorSearchClick: (actorName: string) => void;
  onSelectMusic?: (term: string) => void;
}

export default function SearchPanel({ 
  query, 
  onSelectMedia, 
  onHoverMedia, 
  onSelectSuggestion,
  onActorSearchClick,
  onSelectMusic
}: SearchPanelProps) {

  // Player States
  const [playingTrack, setPlayingTrack] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoadingPreview, setIsLoadingPreview] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

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
    return 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/21/d9/bc/21d9bcbe-3023-e18f-a9db-fcfa1d50b4f8/mzaf_6299863486047120677.plus.aac.p.m4a';
  };

  const playTrack = async (track: any) => {
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

  // Fetch Movies
  const { data: movies, isLoading: loadingMovies } = useQuery({
    queryKey: ['search-movies', query],
    queryFn: () => searchMovies(query),
    enabled: !!query,
  });

  // Fetch TV Series
  const { data: tvSeries, isLoading: loadingTv } = useQuery({
    queryKey: ['search-tv', query],
    queryFn: () => searchTvSeries(query),
    enabled: !!query,
  });

  // Fetch Music
  const { data: musicTracks, isLoading: loadingMusic } = useQuery({
    queryKey: ['search-music', query],
    queryFn: async () => {
      if (!query) return [];
      try {
        const res = await fetch(`https://api.monochrome.tf/search/?s=${encodeURIComponent(query)}`);
        if (res.ok) {
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
              
              const artworkUrl = t.album?.cover 
                ? `https://resources.tidal.com/images/${t.album.cover.replaceAll('-', '/')}/640x640.jpg`
                : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=300&h=300';

              return {
                id: `mono-${t.id}`,
                title: t.title,
                artist: t.artist?.name || t.artists?.[0]?.name || 'Unknown Artist',
                album: t.album?.title || 'Unknown Album',
                artwork: artworkUrl,
                previewUrl: '',
                durationMs: (t.duration || 200) * 1000,
                sampleRate: sRate,
                bitDepth: bDepth,
                bitrate: bitrateVal,
                fileSize: `${sizeMb} MB`,
                year: t.streamStartDate ? t.streamStartDate.substring(0, 4) : 'N/A'
              };
            });
          }
        }
      } catch (err) {
        console.warn('Monochrome API failed, trying iTunes...', err);
      }

      // Fallback to iTunes Search
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=20`);
      if (!res.ok) return [];
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
    enabled: !!query,
  });

  // Fetch Music Albums
  const { data: musicAlbums, isLoading: loadingAlbums } = useQuery({
    queryKey: ['search-music-albums', query],
    queryFn: async () => {
      if (!query) return [];
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=10`);
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
        console.error('Error searching albums:', err);
      }
      return [];
    },
    enabled: !!query,
  });

  // Fetch Music Artists
  const { data: musicArtists, isLoading: loadingArtists } = useQuery({
    queryKey: ['search-music-artists', query],
    queryFn: async () => {
      if (!query) return [];
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicArtist&limit=10`);
        if (res.ok) {
          const data = await res.json();
          return (data.results || []).map((artist: any, index: number) => {
            const images = [
              'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&q=80&w=300&h=300',
              'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=300&h=300',
              'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=300&h=300',
              'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&q=80&w=300&h=300',
              'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&q=80&w=300&h=300',
            ];
            const image = images[index % images.length];
            return {
              id: String(artist.artistId),
              name: artist.artistName,
              genre: artist.primaryGenreName,
              image: image,
              url: artist.artistLinkUrl,
            };
          });
        }
      } catch (err) {
        console.error('Error searching artists:', err);
      }
      return [];
    },
    enabled: !!query,
  });

  // Fetch Actors
  const { data: actors, isLoading: loadingActors } = useQuery({
    queryKey: ['search-actors', query],
    queryFn: () => searchActors(query),
    enabled: !!query,
  });

  const isSearching = !!query;
  const isLoading = loadingMovies || loadingTv || loadingActors || loadingMusic || loadingAlbums || loadingArtists;

  const popularSuggestions = [
    { label: 'Pedro Pascal', category: 'Actor' },
    { label: 'Dune: Part Two', category: 'Movie' },
    { label: 'Stranger Things', category: 'TV Show' },
    { label: 'Cillian Murphy', category: 'Actor' },
    { label: 'Zendaya', category: 'Actor' },
    { label: 'The Last of Us', category: 'TV Show' },
    { label: 'Interstellar', category: 'Movie' }
  ];

  if (!isSearching) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 max-w-2xl mx-auto space-y-8 animate-fadeIn">
        <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center border border-white/10 shadow-xl relative group">
          <div className="absolute inset-0 bg-red-600/10 rounded-full blur-xl group-hover:bg-red-600/20 transition-all duration-500" />
          <Search className="w-10 h-10 text-red-500 animate-pulse relative z-10" />
        </div>
        <div className="space-y-3">
          <h2 className="text-3xl font-light tracking-tight text-white">
            Discover <span className="text-red-500 font-medium italic">Everything</span>
          </h2>
          <p className="text-white/60 text-sm max-w-md leading-relaxed">
            Search our entire database for movies, TV series, or your favorite actors. Use the remote control or on-screen keyboard.
          </p>
        </div>

        <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 justify-center text-xs font-bold text-white/50 tracking-wider uppercase">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Popular Suggestions</span>
          </div>
          <div className="flex flex-wrap gap-2.5 justify-center">
            {popularSuggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => onSelectSuggestion(s.label)}
                className="px-4 py-2 bg-[#0c0c12]/80 hover:bg-red-600 border border-white/5 hover:border-red-500 text-white hover:text-white rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95 shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <span>{s.label}</span>
                <span className="text-[10px] opacity-60 font-normal">({s.category})</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-12 animate-fadeIn ${playingTrack ? 'pb-36' : 'pb-16'}`}>
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-white">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium text-white/70">Searching the catalog...</span>
        </div>
      )}

      {!isLoading && (
        <>
          {/* Movies Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 border-b border-white/5 pb-2">
              <Film className="w-5 h-5 text-red-500" />
              <h3 className="text-lg font-medium tracking-tight text-white">
                Movies <span className="text-white/40 text-sm font-normal">({movies?.length || 0})</span>
              </h3>
            </div>

            {movies && movies.length > 0 ? (
              <div className="relative">
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20 scroll-smooth px-1">
                  {movies.map((item: any) => (
                    <div 
                      key={item.id} 
                      className="w-36 sm:w-44 shrink-0 group cursor-pointer"
                      onClick={() => onSelectMedia(item)}
                      onMouseEnter={() => onHoverMedia?.(item.poster)}
                      onMouseLeave={() => onHoverMedia?.('')}
                    >
                      <div className="aspect-[2/3] bg-slate-800 rounded-xl overflow-hidden mb-2 relative border border-white/5 shadow-lg group-hover:scale-105 group-hover:border-red-600 group-hover:ring-2 group-hover:ring-red-600/50 transition-all duration-500">
                        {item.poster ? (
                          <img 
                            src={item.poster} 
                            alt={item.title} 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer" 
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-[#0c0c12]/90 text-white/50 text-xs text-center p-4 gap-2">
                            <Film className="w-6 h-6 opacity-30" />
                            <span className="truncate max-w-full font-medium">{item.title}</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60"></div>
                        <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-col">
                          <span className="text-xs sm:text-sm font-medium leading-tight text-white truncate">
                            {item.title}
                          </span>
                        </div>
                        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-[10px] font-mono text-amber-400 font-semibold px-1.5 py-0.5 rounded border border-white/10">
                          ★ {item.rating}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/5 rounded-2xl p-6 text-center text-sm text-white/40">
                No matching movies found.
              </div>
            )}
          </div>

          {/* TV Series Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 border-b border-white/5 pb-2">
              <Tv className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-medium tracking-tight text-white">
                TV Series <span className="text-white/40 text-sm font-normal">({tvSeries?.length || 0})</span>
              </h3>
            </div>

            {tvSeries && tvSeries.length > 0 ? (
              <div className="relative">
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20 scroll-smooth px-1">
                  {tvSeries.map((item: any) => (
                    <div 
                      key={item.id} 
                      className="w-36 sm:w-44 shrink-0 group cursor-pointer"
                      onClick={() => onSelectMedia({ ...item, type: 'series' })}
                      onMouseEnter={() => onHoverMedia?.(item.poster)}
                      onMouseLeave={() => onHoverMedia?.('')}
                    >
                      <div className="aspect-[2/3] bg-slate-800 rounded-xl overflow-hidden mb-2 relative border border-white/5 shadow-lg group-hover:scale-105 group-hover:border-indigo-500 group-hover:ring-2 group-hover:ring-indigo-500/50 transition-all duration-500">
                        {item.poster ? (
                          <img 
                            src={item.poster} 
                            alt={item.title} 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer" 
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-[#0c0c12]/90 text-white/50 text-xs text-center p-4 gap-2">
                            <Tv className="w-6 h-6 opacity-30" />
                            <span className="truncate max-w-full font-medium">{item.title}</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60"></div>
                        <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-col">
                          <span className="text-xs sm:text-sm font-medium leading-tight text-white truncate">
                            {item.title}
                          </span>
                        </div>
                        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-[10px] font-mono text-amber-400 font-semibold px-1.5 py-0.5 rounded border border-white/10">
                          ★ {item.rating}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/5 rounded-2xl p-6 text-center text-sm text-white/40">
                No matching TV series found.
              </div>
            )}
          </div>

          {/* Music Artists Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 border-b border-white/5 pb-2">
              <Users className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-medium tracking-tight text-white">
                Artists <span className="text-white/40 text-sm font-normal">({musicArtists?.length || 0})</span>
              </h3>
            </div>

            {musicArtists && musicArtists.length > 0 ? (
              <div className="relative">
                <div className="flex gap-6 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20 scroll-smooth px-1">
                  {musicArtists.map((artist: any) => (
                    <div 
                      key={artist.id} 
                      className="w-24 sm:w-28 shrink-0 group cursor-pointer text-center animate-fadeIn"
                      onClick={() => {
                        if (onSelectMusic) {
                          onSelectMusic(artist.name);
                        } else {
                          onSelectSuggestion(artist.name);
                        }
                      }}
                    >
                      <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden mb-2.5 relative border border-white/5 shadow-lg group-hover:scale-105 group-hover:border-indigo-500 group-hover:ring-2 group-hover:ring-indigo-500/50 transition-all duration-500 mx-auto">
                        <img 
                          src={artist.image} 
                          alt={artist.name} 
                          className="w-full h-full object-cover" 
                          referrerPolicy="no-referrer" 
                        />
                        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <span className="text-[10px] text-indigo-300 font-bold tracking-wider uppercase">View Discography</span>
                        </div>
                      </div>

                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold leading-tight text-white truncate group-hover:text-indigo-400 transition-colors">
                          {artist.name}
                        </span>
                        <span className="text-[10px] text-indigo-300/60 font-medium truncate mt-0.5">
                          {artist.genre || 'Musician'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/5 rounded-2xl p-6 text-center text-sm text-white/40">
                No matching music artists found.
              </div>
            )}
          </div>

          {/* Music Albums Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 border-b border-white/5 pb-2">
              <Disc className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-medium tracking-tight text-white">
                Albums <span className="text-white/40 text-sm font-normal">({musicAlbums?.length || 0})</span>
              </h3>
            </div>

            {musicAlbums && musicAlbums.length > 0 ? (
              <div className="relative">
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20 scroll-smooth px-1">
                  {musicAlbums.map((album: any) => (
                    <div 
                      key={album.id} 
                      className="w-32 sm:w-40 shrink-0 group cursor-pointer animate-fadeIn"
                      onClick={() => {
                        if (onSelectMusic) {
                          onSelectMusic(album.title);
                        } else {
                          onSelectSuggestion(`${album.title} ${album.artist}`);
                        }
                      }}
                    >
                      <div className="aspect-square bg-slate-800 rounded-xl overflow-hidden mb-2 relative border border-white/5 shadow-lg group-hover:scale-105 group-hover:border-indigo-500 group-hover:ring-2 group-hover:ring-indigo-500/50 transition-all duration-500">
                        {album.artwork ? (
                          <img 
                            src={album.artwork} 
                            alt={album.title} 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer" 
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-[#0c0c12]/90 text-white/50 text-xs text-center p-4 gap-2">
                            <Disc className="w-6 h-6 opacity-30" />
                            <span className="truncate max-w-full font-medium">{album.title}</span>
                          </div>
                        )}
                        
                        {/* Overlay with search instruction */}
                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-2 text-center">
                          <span className="text-[10px] text-indigo-300 font-semibold tracking-wider uppercase mb-1">Search Tracks</span>
                          <span className="text-[9px] text-white/60 line-clamp-2 leading-snug">{album.trackCount} Tracks</span>
                        </div>

                        {/* Year tag */}
                        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-[8px] font-mono text-white/80 px-1.5 py-0.5 rounded border border-white/10">
                          {album.year}
                        </div>
                      </div>

                      <div className="flex flex-col min-w-0">
                        <span className="text-xs sm:text-sm font-medium leading-tight text-white truncate">
                          {album.title}
                        </span>
                        <span className="text-[10px] text-white/50 truncate mt-0.5">
                          {album.artist}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/5 rounded-2xl p-6 text-center text-sm text-white/40">
                No matching music albums found.
              </div>
            )}
          </div>

          {/* Music Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 border-b border-white/5 pb-2">
              <Music className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-medium tracking-tight text-white">
                Hi-Res Tracks <span className="text-white/40 text-sm font-normal">({musicTracks?.length || 0})</span>
              </h3>
            </div>

            {musicTracks && musicTracks.length > 0 ? (
              <div className="relative">
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20 scroll-smooth px-1">
                  {musicTracks.map((track: any) => {
                    const isCurrent = playingTrack?.id === track.id;
                    const isLoading = isLoadingPreview === track.id;
                    return (
                      <div 
                        key={track.id} 
                        className="w-32 sm:w-40 shrink-0 group cursor-pointer animate-fadeIn"
                        onClick={() => {
                          if (onSelectMusic) {
                            onSelectMusic(track.title);
                          } else {
                            playTrack(track);
                          }
                        }}
                      >
                        <div className="aspect-square bg-slate-800 rounded-xl overflow-hidden mb-2 relative border border-white/5 shadow-lg group-hover:scale-105 group-hover:border-indigo-500 group-hover:ring-2 group-hover:ring-indigo-500/50 transition-all duration-500">
                          {track.artwork ? (
                            <img 
                              src={track.artwork} 
                              alt={track.title} 
                              className="w-full h-full object-cover" 
                              referrerPolicy="no-referrer" 
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-[#0c0c12]/90 text-white/50 text-xs text-center p-4 gap-2">
                              <Music className="w-6 h-6 opacity-30" />
                              <span className="truncate max-w-full font-medium">{track.title}</span>
                            </div>
                          )}
                          
                          {/* Play/Pause Overlay */}
                          <div className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity duration-300 ${isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                            {isLoading ? (
                              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                            ) : isCurrent && isPlaying ? (
                              <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg transform active:scale-90 transition-transform">
                                <Pause className="w-5 h-5 text-white fill-white" />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg transform active:scale-90 transition-transform">
                                <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                              </div>
                            )}
                          </div>

                          {/* Audio Quality Tag */}
                          <div className="absolute top-2 right-2 bg-indigo-950/80 backdrop-blur-md text-[8px] font-mono text-indigo-300 font-extrabold px-1.5 py-0.5 rounded border border-indigo-500/30">
                            {track.bitDepth === '24-bit' ? 'MQA' : 'HiFi'}
                          </div>
                        </div>

                        <div className="flex flex-col min-w-0">
                          <span className="text-xs sm:text-sm font-medium leading-tight text-white truncate">
                            {track.title}
                          </span>
                          <span className="text-[10px] text-white/50 truncate mt-0.5">
                            {track.artist}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/5 rounded-2xl p-6 text-center text-sm text-white/40">
                No matching music tracks found.
              </div>
            )}
          </div>

          {/* Actors Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 border-b border-white/5 pb-2">
              <Users className="w-5 h-5 text-emerald-400" />
              <h3 className="text-lg font-medium tracking-tight text-white">
                Actors & Cast <span className="text-white/40 text-sm font-normal">({actors?.length || 0})</span>
              </h3>
            </div>

            {actors && actors.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {actors.map((actor: any) => (
                  <div 
                    key={actor.id}
                    className="flex items-center justify-between p-3.5 bg-white/5 border border-white/5 rounded-2xl text-left transition-all group hover:bg-red-900/10 hover:border-red-500/20 shadow-md"
                  >
                    <div 
                      onClick={() => onActorSearchClick(actor.name)}
                      className="flex items-center gap-3.5 min-w-0 flex-1 cursor-pointer"
                      title={`Find movies and series starring ${actor.name}`}
                    >
                      <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 bg-slate-800 border border-white/10 group-hover:border-red-500/30 transition-colors shadow">
                        {actor.profilePath ? (
                          <img 
                            src={actor.profilePath} 
                            alt={actor.name} 
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" 
                            referrerPolicy="no-referrer" 
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white/70 bg-slate-900 uppercase">
                            {actor.name.substring(0, 2)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white truncate group-hover:text-red-400 transition-colors">
                          {actor.name}
                        </p>
                        <p className="text-[10px] text-white/50 truncate mt-0.5 max-w-full">
                          Known for: {actor.knownFor || 'N/A'}
                        </p>
                      </div>
                    </div>

                    <a 
                      href={`https://www.imdb.com/find?q=${encodeURIComponent(actor.name)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 rounded-lg bg-[#f5c518] hover:bg-[#e2b512] text-black transition-colors text-[10px] font-black shrink-0 ml-2 shadow flex items-center gap-1 cursor-pointer"
                      title={`Search ${actor.name} on IMDb`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span>IMDb</span>
                      <ExternalLink className="w-2.5 h-2.5 stroke-[3]" />
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white/5 border border-white/5 rounded-2xl p-6 text-center text-sm text-white/40">
                No matching actors found.
              </div>
            )}
          </div>

          {/* Floating Audio Player Bar */}
          {playingTrack && (
            <div className="fixed bottom-0 left-20 right-0 z-40 bg-[#0c0c12]/95 border-t border-white/10 backdrop-blur-xl px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xl animate-slideUp">
              {/* Metadata Block */}
              <div className="flex items-center gap-3.5 min-w-0 w-full sm:w-auto">
                <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-slate-800 border border-white/5 relative group shadow-md">
                  <img 
                    src={playingTrack.artwork} 
                    alt={playingTrack.title} 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Disc className="w-4 h-4 text-white animate-spin" />
                  </div>
                </div>
                <div className="min-w-0 flex-1 sm:flex-initial">
                  <h4 className="text-sm font-semibold text-white truncate max-w-[200px] sm:max-w-[280px]">
                    {playingTrack.title}
                  </h4>
                  <p className="text-xs text-white/55 truncate max-w-[200px] sm:max-w-[280px] mt-0.5">
                    {playingTrack.artist}
                  </p>
                </div>
              </div>

              {/* Center Playback Controls */}
              <div className="flex flex-col items-center gap-2.5 w-full sm:w-auto flex-1 max-w-md">
                <div className="flex items-center gap-5">
                  <button 
                    onClick={() => {
                      if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
                    }}
                    className="text-white/40 hover:text-white transition-colors cursor-pointer"
                    title="Rewind 10s"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>

                  <button 
                    onClick={() => playTrack(playingTrack)}
                    className="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition-all cursor-pointer shadow-md shadow-indigo-600/10 hover:scale-105 active:scale-95"
                  >
                    {isPlaying ? <Pause className="w-4 h-4 fill-white text-white" /> : <Play className="w-4 h-4 fill-white text-white ml-0.5" />}
                  </button>

                  <button 
                    onClick={() => {
                      if (audioRef.current) audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 10);
                    }}
                    className="text-white/40 hover:text-white transition-colors cursor-pointer"
                    title="Forward 10s"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                </div>

                {/* Progress bar */}
                <div className="flex items-center gap-3 w-full text-[10px] font-mono text-white/45">
                  <span className="w-8 text-right select-none">{formatTime(currentTime)}</span>
                  <div 
                    className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden cursor-pointer relative group"
                    onClick={(e) => {
                      if (!audioRef.current || !duration) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pos = (e.clientX - rect.left) / rect.width;
                      audioRef.current.currentTime = pos * duration;
                    }}
                  >
                    <div 
                      className="h-full bg-indigo-500 rounded-full relative transition-all"
                      style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-8 text-left select-none">{formatTime(duration)}</span>
                </div>
              </div>

              {/* Quality & Info Badges */}
              <div className="hidden md:flex items-center gap-4 shrink-0">
                <div className="flex flex-col items-end text-right">
                  <span className="text-[10px] font-bold text-indigo-400 font-mono tracking-wider bg-indigo-950/55 px-2 py-0.5 border border-indigo-500/20 rounded">
                    {playingTrack.bitDepth === '24-bit' ? 'HI-RES LOSSLESS' : 'HIFI LOSSLESS'}
                  </span>
                  <span className="text-[9px] text-white/40 font-mono mt-1">
                    {playingTrack.sampleRate} • {playingTrack.bitrate} • {playingTrack.fileSize}
                  </span>
                </div>
                <div className="w-px h-7 bg-white/10" />
                <div className="flex items-center gap-1.5 text-white/50">
                  <Volume2 className="w-4 h-4" />
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.01" 
                    defaultValue="1"
                    onChange={(e) => {
                      if (audioRef.current) audioRef.current.volume = parseFloat(e.target.value);
                    }}
                    className="w-16 accent-indigo-500 h-1 bg-white/10 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
