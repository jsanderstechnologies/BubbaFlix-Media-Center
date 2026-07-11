import { useState, useEffect } from 'react';
import { fetchStreamsForMovie, fetchStreamsForTvSeries } from '../services/torboxSearchApi';
import { getTvSeriesDetails, getTvSeasonDetails, getMpaaRating, getMediaCreditsAndDetails } from '../services/tmdbApi';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { collection, addDoc, query, where, getDocs, deleteDoc, doc, serverTimestamp } from '../lib/localDb';
import { db } from '../lib/localDb';
import { useAuth } from './Auth';

export default function MediaModal({ 
  movie, 
  onClose, 
  onPlay,
  onActorSearch 
}: { 
  movie: any, 
  onClose: () => void, 
  onPlay: (url: string) => void,
  onActorSearch?: (actorName: string) => void
}) {
  const [streams, setStreams] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [mpaaRating, setMpaaRating] = useState<string>('');
  const [extraDetails, setExtraDetails] = useState<{
    directors: string[];
    producers: string[];
    releaseDate: string;
    cast: { id: number; name: string; character: string; profilePath: string | null }[];
    genres?: string[];
    tagline?: string;
  } | null>(null);
  const [extraLoading, setExtraLoading] = useState(false);

  const isSeries = movie?.type === 'series' || !!movie?.first_air_date;

  useEffect(() => {
    if (movie) {
      setExtraLoading(true);
      getMediaCreditsAndDetails(movie.id, isSeries).then(details => {
        setExtraDetails(details);
        setExtraLoading(false);
      });
    } else {
      setExtraDetails(null);
    }
  }, [movie, isSeries]);

  useEffect(() => {
    if (movie) {
      getMpaaRating(movie.id, isSeries).then(rating => {
        setMpaaRating(rating);
      });
    }
  }, [movie, isSeries]);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);
  const [seriesDetailsLoading, setSeriesDetailsLoading] = useState(false);
  const [pollingActive, setPollingActive] = useState(false);

  useEffect(() => {
    let intervalId: any;
    const apiKey = localStorage.getItem('torboxApiKey');

    async function pollDownloads() {
      if (!apiKey || streams.length === 0) return;
      try {
        const [tRes, uRes] = await Promise.all([
          fetch('/api/torbox/torrents', { headers: { Authorization: `Bearer ${apiKey}` } }),
          fetch('/api/torbox/usenet/list', { headers: { Authorization: `Bearer ${apiKey}` } }).catch(() => null)
        ]);

        let activeTorrents: any[] = [];
        let activeUsenet: any[] = [];

        if (tRes && tRes.ok) {
          const tData = await tRes.json();
          if (tData && tData.success && tData.data) {
            activeTorrents = tData.data;
          }
        }
        if (uRes && uRes.ok) {
          const uData = await uRes.json();
          if (uData && uData.success && uData.data) {
            activeUsenet = uData.data;
          }
        }

        // Check if any matching stream has completed downloading
        let playUrlToTrigger: string | null = null;

        setStreams(prevStreams => {
          return prevStreams.map(stream => {
            let updatedStream = { ...stream };
            
            // Find in torrents
            if (stream.type === 'torrent') {
              const match = activeTorrents.find(t => 
                (stream.hash && t.hash === stream.hash) ||
                t.name === stream.name || 
                stream.name.includes(t.name) || 
                t.name.includes(stream.name)
              );

              if (match) {
                const progress = Math.round(match.progress * 100);
                updatedStream.downloadProgress = progress;
                const state = match.download_state || '';
                updatedStream.downloadState = state;
                updatedStream.isCached = match.progress >= 1 && (state === 'completed' || state === 'cached' || state === ''); // Completed is cached
                updatedStream.downloadSpeed = match.download_speed || 0;

                // Auto-play trigger: transition from downloading to completed
                if (progress >= 100 && stream.downloadProgress !== undefined && stream.downloadProgress < 100) {
                  // Direct token download request
                  playUrlToTrigger = `https://api.torbox.app/v1/api/torrents/requestdl?token=${apiKey}&torrent_id=${match.id}&zip_link=false&redirect=true`;
                }
              }
            }
            
            // Find in Usenet
            if (stream.type === 'usenet') {
              const match = activeUsenet.find(u => {
                const nameMatch = u.name === stream.name || 
                                  stream.name.includes(u.name) || 
                                  u.name.includes(stream.name);
                // Usenet name from TorBox can be a random UUID, so fallback match by size (within 5% delta) using raw sizeBytes
                const sizeMatch = stream.sizeBytes && u.size && Math.abs(u.size - stream.sizeBytes) < (stream.sizeBytes * 0.05);
                return nameMatch || sizeMatch;
              });

              if (match) {
                const progress = Math.round(match.progress * 100);
                updatedStream.downloadProgress = progress;
                const state = match.download_state || '';
                updatedStream.downloadState = state;
                updatedStream.isCached = match.progress >= 1 && (state === 'completed' || state === 'cached' || state === ''); // Completed is cached
                updatedStream.downloadSpeed = match.download_speed || 0;

                // Auto-play trigger: transition from downloading to completed
                if (progress >= 100 && stream.downloadProgress !== undefined && stream.downloadProgress < 100) {
                  // Direct token download request
                  playUrlToTrigger = `https://api.torbox.app/v1/api/usenet/requestdl?token=${apiKey}&usenet_id=${match.id}&zip_link=false&redirect=true`;
                }
              }
            }

            return updatedStream;
          });
        });

        if (playUrlToTrigger) {
          console.log("[Auto-Play] Triggering playback for finished download:", playUrlToTrigger);
          onPlay(playUrlToTrigger);
        }

      } catch (err) {
        console.error("Error polling TorBox downloads:", err);
      }
    }

    if (pollingActive && apiKey) {
      intervalId = setInterval(pollDownloads, 4000);
      pollDownloads(); // Run instantly on mount/enable
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [pollingActive, streams]);

  useEffect(() => {
    if (movie) {
      if (isSeries) {
        setSeriesDetailsLoading(true);
        getTvSeriesDetails(movie.id).then(details => {
          if (details && details.seasons) {
            const validSeasons = details.seasons.filter((s: any) => s.season_number > 0);
            setSeasons(validSeasons);
            if (validSeasons.length > 0) {
              setSelectedSeason(validSeasons[0].season_number);
            }
          }
          setSeriesDetailsLoading(false);
        });
      } else {
        setLoading(true);
        fetchStreamsForMovie(movie.title || movie.name, movie.year).then(async data => {
          
        const apiKey = localStorage.getItem('torboxApiKey');
        let activeTorrents: any[] = [];
        let activeUsenet: any[] = [];
        
        if (apiKey) {
            try {
                const [tRes, uRes] = await Promise.all([
                  fetch('/api/torbox/torrents', { headers: { Authorization: `Bearer ${apiKey}` } }),
                  fetch('/api/torbox/usenet/list', { headers: { Authorization: `Bearer ${apiKey}` } }).catch(() => null)
                ]);
                if (tRes && tRes.ok) {
                    const tData = await tRes.json();
                    if (tData && tData.success && tData.data) {
                        activeTorrents = tData.data;
                    }
                }
                if (uRes && uRes.ok) {
                    const uData = await uRes.json();
                    if (uData && uData.success && uData.data) {
                        activeUsenet = uData.data;
                    }
                }
            } catch (err) {
                console.error("Failed to fetch active torbox lists for cross-reference", err);
            }
        }

        // Cross-reference streams with Torbox active downloads
        const matchedTorboxIds = new Set<number>();
        const updatedData = data.map((stream: any) => {
            const matchTorrent = activeTorrents.find(t => {
                if (stream.hash && t.hash === stream.hash) return true;
                const sName = (stream.name || "").toLowerCase();
                const tName = (t.name || "").toLowerCase();
                return tName === sName || sName.includes(tName) || tName.includes(sName);
            });
            const matchUsenet = activeUsenet.find(u => {
                const sName = (stream.name || "").toLowerCase();
                const uName = (u.name || "").toLowerCase();
                const nameMatch = uName === sName || sName.includes(uName) || uName.includes(sName);
                // Widen to 15% for Usenet unpack/par2 size differences
                const sizeMatch = stream.sizeBytes && u.size && Math.abs(u.size - stream.sizeBytes) < (stream.sizeBytes * 0.15);
                return nameMatch || sizeMatch;
            });

            let mappedStream = { ...stream };

            if (matchTorrent) {
              matchedTorboxIds.add(matchTorrent.id);
              const progress = Math.round(matchTorrent.progress * 100);
              const state = matchTorrent.download_state || '';
              mappedStream.downloadState = state;
              mappedStream.isCached = progress >= 100 && (state === 'completed' || state === 'cached' || state === 'downloaded' || state === '');
              mappedStream.downloadProgress = progress;
              mappedStream.downloadSpeed = matchTorrent.download_speed || 0;
              mappedStream.id = matchTorrent.id;
              mappedStream.isTorBox = true;
              mappedStream.url = `https://api.torbox.app/v1/api/torrents/requestdl?token=${apiKey}&torrent_id=${matchTorrent.id}&zip_link=false&redirect=true`;
            } else if (matchUsenet) {
              matchedTorboxIds.add(matchUsenet.id);
              const progress = Math.round(matchUsenet.progress * 100);
              const state = matchUsenet.download_state || '';
              mappedStream.downloadState = state;
              mappedStream.isCached = progress >= 100 && (state === 'completed' || state === 'cached' || state === 'downloaded' || state === '');
              mappedStream.downloadProgress = progress;
              mappedStream.downloadSpeed = matchUsenet.download_speed || 0;
              mappedStream.id = matchUsenet.id;
              mappedStream.isTorBox = true;
              mappedStream.url = `https://api.torbox.app/v1/api/usenet/requestdl?token=${apiKey}&usenet_id=${matchUsenet.id}&zip_link=false&redirect=true`;
            }

            return mappedStream;
        });

        // Inject any Torbox downloads that match the title but weren't in the search results
        const normalizedTitle = (movie.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        
        activeTorrents.forEach(t => {
            if (!matchedTorboxIds.has(t.id)) {
                const normalizedTorrentName = (t.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                if (normalizedTorrentName.includes(normalizedTitle)) {
                    const progress = Math.round(t.progress * 100);
                    updatedData.push({
                        name: t.name,
                        title: t.name,
                        fullDescription: t.name,
                        quality: t.name.includes('4K') || t.name.includes('2160p') ? '4K' : (t.name.includes('1080p') ? '1080p' : '720p'),
                        sizeBytes: t.size,
                        sizeStr: (t.size / 1024 / 1024 / 1024).toFixed(2) + ' GB',
                        type: 'torrent',
                        hash: t.hash,
                        downloadState: t.download_state || '',
                        isCached: progress >= 100 && ((t.download_state || '') === 'completed' || (t.download_state || '') === 'cached' || (t.download_state || '') === 'downloaded' || !t.download_state),
                        downloadProgress: progress,
                        downloadSpeed: t.download_speed || 0,
                        url: `https://api.torbox.app/v1/api/torrents/requestdl?token=${apiKey}&torrent_id=${t.id}&zip_link=false&redirect=true`,
                        isTorBox: true,
                        id: t.id,
                        availability: 'Cached'
                    });
                }
            }
        });

        activeUsenet.forEach(u => {
            if (!matchedTorboxIds.has(u.id)) {
                const normalizedUsenetName = (u.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                if (normalizedUsenetName.includes(normalizedTitle)) {
                    const progress = Math.round(u.progress * 100);
                    updatedData.push({
                        name: u.name,
                        title: u.name,
                        fullDescription: u.name,
                        quality: u.name.includes('4K') || u.name.includes('2160p') ? '4K' : (u.name.includes('1080p') ? '1080p' : '720p'),
                        sizeBytes: u.size,
                        sizeStr: (u.size / 1024 / 1024 / 1024).toFixed(2) + ' GB',
                        type: 'usenet',
                        downloadState: u.download_state || '',
                        isCached: progress >= 100 && ((u.download_state || '') === 'completed' || (u.download_state || '') === 'cached' || (u.download_state || '') === 'downloaded' || !u.download_state),
                        downloadProgress: progress,
                        downloadSpeed: u.download_speed || 0,
                        url: `https://api.torbox.app/v1/api/usenet/requestdl?token=${apiKey}&usenet_id=${u.id}&zip_link=false&redirect=true`,
                        isTorBox: true,
                        id: u.id,
                        availability: 'Cached'
                    });
                }
            }
        });

        const uSettings = localStorage.getItem('userSettings_' + user?.uid);
        let allowedRes = ['4K', '1080p', '720p'];
        if (uSettings) {
            try { allowedRes = JSON.parse(uSettings).resolutions; } catch(e){}
        }
        let filteredData = updatedData.filter((s: any) => {
            const desc = (s.name || '') + ' ' + (s.fullDescription || '');
            if (desc.includes('4K') || desc.includes('2160p')) return allowedRes.includes('4K');
            if (desc.includes('1080p')) return allowedRes.includes('1080p');
            if (desc.includes('720p')) return allowedRes.includes('720p');
            return true;
        });

        // Sort cached items to the top of the list
        filteredData.sort((a: any, b: any) => {
          if (a.isCached && !b.isCached) return -1;
          if (!a.isCached && b.isCached) return 1;
          return 0;
        });

        setStreams(filteredData);
        setLoading(false);
        setPollingActive(true);
        });
      }
    }
  }, [movie, isSeries]);

  useEffect(() => {
    if (isSeries && selectedSeason !== null && movie) {
      setLoading(true);
      setStreams([]);
      getTvSeasonDetails(movie.id, selectedSeason).then(seasonData => {
        if (seasonData && seasonData.episodes) {
          setEpisodes(seasonData.episodes);
          if (seasonData.episodes.length > 0) {
            setSelectedEpisode(seasonData.episodes[0].episode_number);
          }
        } else {
            setLoading(false);
        }
      });
    }
  }, [isSeries, selectedSeason, movie]);

  useEffect(() => {
    if (isSeries && selectedSeason !== null && selectedEpisode !== null && movie) {
      setLoading(true);
      fetchStreamsForTvSeries(movie.title, selectedSeason, selectedEpisode).then(async data => {
        
        const apiKey = localStorage.getItem('torboxApiKey');
        let activeTorrents: any[] = [];
        let activeUsenet: any[] = [];
        
        if (apiKey) {
            try {
                const [tRes, uRes] = await Promise.all([
                  fetch('/api/torbox/torrents', { headers: { Authorization: `Bearer ${apiKey}` } }),
                  fetch('/api/torbox/usenet/list', { headers: { Authorization: `Bearer ${apiKey}` } }).catch(() => null)
                ]);
                if (tRes && tRes.ok) {
                    const tData = await tRes.json();
                    if (tData && tData.success && tData.data) {
                        activeTorrents = tData.data;
                    }
                }
                if (uRes && uRes.ok) {
                    const uData = await uRes.json();
                    if (uData && uData.success && uData.data) {
                        activeUsenet = uData.data;
                    }
                }
            } catch (err) {
                console.error("Failed to fetch active lists for TV cross-reference", err);
            }
        }

        // Cross-reference streams with Torbox active downloads
        const updatedData = data.map((stream: any) => {
            const matchTorrent = activeTorrents.find(t => 
                (stream.hash && t.hash === stream.hash) ||
                t.name === stream.name || 
                stream.name.includes(t.name) || 
                t.name.includes(stream.name)
            );
            const matchUsenet = activeUsenet.find(u => {
                const nameMatch = u.name === stream.name || 
                                  stream.name.includes(u.name) || 
                                  u.name.includes(stream.name);
                const sizeMatch = stream.sizeBytes && u.size && Math.abs(u.size - stream.sizeBytes) < (stream.sizeBytes * 0.05);
                return nameMatch || sizeMatch;
            });

            let mappedStream = { ...stream };

            if (matchTorrent) {
              const progress = Math.round(matchTorrent.progress * 100);
              const state = matchTorrent.download_state || '';
              mappedStream.downloadState = state;
              mappedStream.isCached = progress >= 100 && (state === 'completed' || state === 'cached' || state === 'downloaded' || state === '');
              mappedStream.downloadProgress = progress;
              mappedStream.downloadSpeed = matchTorrent.download_speed || 0;
            } else if (matchUsenet) {
              const progress = Math.round(matchUsenet.progress * 100);
              const state = matchUsenet.download_state || '';
              mappedStream.downloadState = state;
              mappedStream.isCached = progress >= 100 && (state === 'completed' || state === 'cached' || state === 'downloaded' || state === '');
              mappedStream.downloadProgress = progress;
              mappedStream.downloadSpeed = matchUsenet.download_speed || 0;
            }

            return mappedStream;
        });

        // Inject any Torbox downloads that match the title but weren't in the search results
        const normalizedTitle = (movie.title || movie.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const seasonEpisodeStr = `s${String(selectedSeason).padStart(2, '0')}e${String(selectedEpisode).padStart(2, '0')}`;
        
        activeTorrents.forEach(t => {
            if (!matchedTorboxIds.has(t.id)) {
                const normalizedTorrentName = (t.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                if (normalizedTorrentName.includes(normalizedTitle) && normalizedTorrentName.includes(seasonEpisodeStr)) {
                    const progress = Math.round(t.progress * 100);
                    updatedData.push({
                        name: t.name,
                        title: t.name,
                        fullDescription: t.name,
                        quality: t.name.includes('4K') || t.name.includes('2160p') ? '4K' : (t.name.includes('1080p') ? '1080p' : '720p'),
                        sizeBytes: t.size,
                        sizeStr: (t.size / 1024 / 1024 / 1024).toFixed(2) + ' GB',
                        type: 'torrent',
                        hash: t.hash,
                        downloadState: t.download_state || '',
                        isCached: progress >= 100 && ((t.download_state || '') === 'completed' || (t.download_state || '') === 'cached' || (t.download_state || '') === 'downloaded' || !t.download_state),
                        downloadProgress: progress,
                        downloadSpeed: t.download_speed || 0,
                        url: `https://api.torbox.app/v1/api/torrents/requestdl?token=${apiKey}&torrent_id=${t.id}&zip_link=false&redirect=true`,
                        isTorBox: true,
                        id: t.id,
                        availability: 'Cached'
                    });
                }
            }
        });

        activeUsenet.forEach(u => {
            if (!matchedTorboxIds.has(u.id)) {
                const normalizedUsenetName = (u.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                if (normalizedUsenetName.includes(normalizedTitle) && normalizedUsenetName.includes(seasonEpisodeStr)) {
                    const progress = Math.round(u.progress * 100);
                    updatedData.push({
                        name: u.name,
                        title: u.name,
                        fullDescription: u.name,
                        quality: u.name.includes('4K') || u.name.includes('2160p') ? '4K' : (u.name.includes('1080p') ? '1080p' : '720p'),
                        sizeBytes: u.size,
                        sizeStr: (u.size / 1024 / 1024 / 1024).toFixed(2) + ' GB',
                        type: 'usenet',
                        downloadState: u.download_state || '',
                        isCached: progress >= 100 && ((u.download_state || '') === 'completed' || (u.download_state || '') === 'cached' || (u.download_state || '') === 'downloaded' || !u.download_state),
                        downloadProgress: progress,
                        downloadSpeed: u.download_speed || 0,
                        url: `https://api.torbox.app/v1/api/usenet/requestdl?token=${apiKey}&usenet_id=${u.id}&zip_link=false&redirect=true`,
                        isTorBox: true,
                        id: u.id,
                        availability: 'Cached'
                    });
                }
            }
        });

        const uSettings = localStorage.getItem('userSettings_' + user?.uid);
        let allowedRes = ['4K', '1080p', '720p'];
        if (uSettings) {
            try { allowedRes = JSON.parse(uSettings).resolutions; } catch(e){}
        }
        let filteredData = updatedData.filter((s: any) => {
            const desc = (s.name || '') + ' ' + (s.fullDescription || '');
            if (desc.includes('4K') || desc.includes('2160p')) return allowedRes.includes('4K');
            if (desc.includes('1080p')) return allowedRes.includes('1080p');
            if (desc.includes('720p')) return allowedRes.includes('720p');
            return true;
        });

        // Sort cached items to the top of the list
        filteredData.sort((a: any, b: any) => {
          if (a.isCached && !b.isCached) return -1;
          if (!a.isCached && b.isCached) return 1;
          return 0;
        });

        setStreams(filteredData);
        setLoading(false);
        setPollingActive(true);
      });
    }
  }, [isSeries, selectedSeason, selectedEpisode, movie]);

  useEffect(() => {
    async function checkFavorite() {
      if (!user || !movie) {
        setIsFavorite(false);
        setFavoriteId(null);
        return;
      }
      try {
        const q = query(collection(db, 'favorites'), where('userId', '==', user.uid), where('tmdbId', '==', movie.id));
        const snapshot = await getDocs(q);
        if (snapshot.docs.length > 0) {
          setIsFavorite(true);
          setFavoriteId(snapshot.docs[0].id);
        } else {
          setIsFavorite(false);
          setFavoriteId(null);
        }
      } catch (err) {
        console.error('Error checking favorite:', err);
      }
    }
    checkFavorite();
  }, [movie, user]);

  const toggleFavorite = async () => {
    if (!user) {
      alert("Please login to save to library");
      return;
    }
    if (!movie) return;

    setFavoriteLoading(true);
    try {
      if (isFavorite && favoriteId) {
        await deleteDoc(doc(db, 'favorites', favoriteId));
        setIsFavorite(false);
        setFavoriteId(null);
      } else {
        // Determine type based on where it came from if possible, assuming 'movie' for now if no type
        const type = movie.type || (movie.first_air_date ? 'series' : 'movie');
        const bestStream = streams.length > 0 ? streams[0] : null;

        const docRef = await addDoc(collection(db, 'favorites'), {
          userId: user.uid,
          tmdbId: movie.id,
          type: type,
          title: movie.title,
          poster: movie.poster || null,
          year: movie.year || null,
          rating: movie.rating || null,
          resolution: movie.resolution || null,
          addedAt: serverTimestamp(),
          streamInfo: bestStream ? {
             name: bestStream.name,
             url: bestStream.url,
             quality: bestStream.quality
          } : null
        });
        setIsFavorite(true);
        setFavoriteId(docRef.id);
      }
    } catch (err: any) {
      console.error('Error toggling favorite:', err);
      // For standard handling, we normally throw using the handleFirestoreError logic
      // But a simple alert is fine for preview
      alert("Error saving: " + err.message);
    } finally {
      setFavoriteLoading(false);
    }
  };

  if (!movie) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-0 md:p-6 animate-fadeIn">
      <div className="bg-[#0c0c12] border-0 md:border border-white/10 rounded-none md:rounded-2xl w-full h-full md:max-w-[96vw] md:max-h-[95vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="relative h-64 sm:h-72 md:h-80 bg-slate-800 shrink-0">
            {movie.poster && <img src={movie.poster} className="w-full h-full object-cover opacity-35" referrerPolicy="no-referrer" />}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c12] via-[#0c0c12]/45 to-transparent"></div>
            <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10 cursor-pointer">
                ✕
            </button>
            <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-3xl sm:text-4xl font-light tracking-tight text-white mb-2 truncate">{movie.title}</h2>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="font-mono text-white font-medium">{movie.year}</span>
                      {mpaaRating && (
                        <span className="px-1.5 py-0.5 border border-white/20 rounded text-[11px] font-bold text-white font-mono leading-none tracking-wide uppercase bg-white/5">
                          {mpaaRating}
                        </span>
                      )}
                      <span className="flex items-center gap-1 border border-white/20 rounded px-1.5 py-0.5 text-xs text-white font-mono bg-white/5">
                          ★ <span className="font-mono">{movie.rating}</span>
                      </span>
                  </div>
                  {movie.overview && (
                      <p className="mt-3 text-xs sm:text-sm text-white/80 max-w-xl line-clamp-2 leading-relaxed">{movie.overview}</p>
                  )}
                </div>
                {user && (
                  <button 
                    onClick={toggleFavorite}
                    disabled={favoriteLoading}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors shrink-0
                      ${isFavorite 
                        ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30' 
                        : 'bg-white/5 text-white border border-white/10 hover:bg-white/10'}`}
                  >
                    {isFavorite ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                    {isFavorite ? 'In Library' : 'Add To Library'}
                  </button>
                )}
            </div>
        </div>

        <div className="p-6 overflow-y-auto md:overflow-hidden flex-1 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left Column: Media Details & TMDB Cast */}
            <div className="space-y-6 h-full md:overflow-y-auto custom-scrollbar md:pr-4 pb-4">
                {extraLoading ? (
                  <div className="flex flex-col items-center justify-center py-10 space-y-3 bg-white/[0.01] border border-white/5 rounded-xl">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                    <span className="text-xs font-mono text-white/60 uppercase tracking-widest animate-pulse">Loading Credits...</span>
                  </div>
                ) : extraDetails ? (
                  <div className="space-y-6">
                    {/* Tagline */}
                    {extraDetails.tagline && (
                      <div className="bg-white/[0.02] border-l-2 border-red-500 p-3 rounded-r-lg italic text-xs text-white/80 leading-relaxed">
                        "{extraDetails.tagline}"
                      </div>
                    )}

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-4 border-b border-white/5 pb-4 text-xs">
                      <div>
                        <span className="text-white/60 uppercase font-bold tracking-wider block mb-1 text-[10px]">Release / Air Date</span>
                        <span className="text-white font-medium font-mono">{extraDetails.releaseDate}</span>
                      </div>
                      {extraDetails.genres && extraDetails.genres.length > 0 && (
                        <div>
                          <span className="text-white/60 uppercase font-bold tracking-wider block mb-1 text-[10px]">Genres</span>
                          <span className="text-white/80 font-medium truncate block" title={extraDetails.genres.join(', ')}>
                            {extraDetails.genres.slice(0, 3).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Crew Info */}
                    {(extraDetails.directors.length > 0 || extraDetails.producers.length > 0) && (
                      <div className="grid grid-cols-2 gap-4 border-b border-white/5 pb-4 text-xs">
                        {extraDetails.directors.length > 0 && (
                          <div>
                            <span className="text-white/60 uppercase font-bold tracking-wider block mb-1 text-[10px]">
                              {isSeries ? 'Creator / Showrunner' : 'Director'}
                            </span>
                            <span className="text-white font-semibold">{extraDetails.directors.join(', ')}</span>
                          </div>
                        )}
                        {extraDetails.producers.length > 0 && (
                          <div>
                            <span className="text-white/60 uppercase font-bold tracking-wider block mb-1 text-[10px]">Produced By</span>
                            <span className="text-white font-medium truncate block" title={extraDetails.producers.join(', ')}>
                              {extraDetails.producers.slice(0, 2).join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Cast list with portraits */}
                    {extraDetails.cast && extraDetails.cast.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-white/60 uppercase tracking-wider">Cast & Starring</h4>
                          <span className="text-[10px] text-white/50">Click actor to discover</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {extraDetails.cast.map(actor => (
                            <div 
                              key={actor.id} 
                              className="flex items-center justify-between p-2 bg-white/5 border border-white/5 rounded-xl text-left transition-all group hover:bg-red-900/10 hover:border-red-500/20"
                            >
                              <div 
                                onClick={() => onActorSearch && onActorSearch(actor.name)}
                                className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                                title={`Find media with ${actor.name} inside the app`}
                              >
                                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-slate-800 border border-white/10 group-hover:border-red-500/30 transition-colors">
                                  {actor.profilePath ? (
                                    <img 
                                      src={actor.profilePath} 
                                      alt={actor.name} 
                                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" 
                                      referrerPolicy="no-referrer" 
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white/70 bg-slate-900 uppercase">
                                      {actor.name.substring(0, 2)}
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold text-white truncate group-hover:text-red-400 transition-colors">{actor.name}</p>
                                  <p className="text-[10px] text-white/60 truncate mt-0.5">{actor.character}</p>
                                </div>
                              </div>
                              
                              <a 
                                href={`https://www.imdb.com/find?q=${encodeURIComponent(actor.name)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-1 rounded bg-[#f5c518] hover:bg-[#e2b512] text-black transition-colors text-[10px] font-black shrink-0 ml-1.5 shadow-sm"
                                title={`Search ${actor.name} on IMDb`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                IMDb
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-white/50 text-xs italic py-4">No metadata details available.</div>
                )}
            </div>

            {/* Right Column: Episode Selectors & Sources */}
            <div className="flex flex-col gap-6 h-full min-h-0 pb-4">
                {isSeries && (
                  <div className="space-y-4 bg-white/[0.02] border border-white/5 p-4 rounded-xl flex-shrink-0">
                    <h4 className="text-xs font-bold text-white/60 uppercase tracking-wider">Select Episode</h4>
                    {seriesDetailsLoading ? (
                        <div className="text-white/60 text-xs italic">Loading series details...</div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Season</label>
                                <select 
                                    value={selectedSeason || ''} 
                                    onChange={(e) => { setSelectedSeason(Number(e.target.value)); setSelectedEpisode(null); setEpisodes([]); }}
                                    className="bg-[#12121a] border border-white/10 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-red-500 w-full"
                                >
                                    {seasons.map(s => (
                                        <option key={s.season_number} value={s.season_number}>
                                            Season {s.season_number}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {episodes.length > 0 && (
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Episode</label>
                                    <select 
                                        value={selectedEpisode || ''} 
                                        onChange={(e) => setSelectedEpisode(Number(e.target.value))}
                                        className="bg-[#12121a] border border-white/10 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-red-500 w-full"
                                    >
                                        {episodes.map(ep => (
                                            <option key={ep.episode_number} value={ep.episode_number}>
                                                Ep {ep.episode_number} - {ep.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    )}
                  </div>
                )}

                <div className="flex flex-col flex-1 min-h-0">
                    <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2 flex-shrink-0">
                        TorBox Voyager Sources <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    </h3>
                    {loading ? (
                        <div className="text-white/60 text-xs italic py-4 flex items-center gap-2 bg-white/[0.01] p-4 rounded-xl border border-white/5">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                          </span>
                          <span>Searching TorBox Voyager Indexers...</span>
                        </div>
                    ) : streams.length === 0 ? (
                        <div className="text-white/60 text-xs italic py-4 bg-white/[0.01] p-4 rounded-xl border border-white/5">No indexed streams found. Ensure your TorBox Pro API key is configured.</div>
                    ) : (
                        <div className="flex flex-col gap-3 flex-1 overflow-y-auto custom-scrollbar pr-1">
                            {streams.map(stream => {
                                const handleStreamClick = async () => {
                                  if (stream.isAdding) return;
                                  // Don't re-queue if it's already downloading
                                  if (stream.downloadProgress !== undefined && stream.downloadProgress < 100) return;

                                  const apiKey = localStorage.getItem('torboxApiKey');
                                  if (!apiKey) {
                                    alert("Please configure your TorBox API Key in Settings to stream or queue downloads.");
                                    return;
                                  }

                                  if (stream.isCached) {
                                    // If we already attached the exact download ID during cross-referencing or injection, play it instantly!
                                    if (stream.id && stream.url && stream.url.includes('requestdl')) {
                                      onPlay(stream.url);
                                      return;
                                    }

                                    // Otherwise, this is a search result that TorBox says is cached on their end,
                                    // but it's not in our personal download list yet.
                                    const dlEndpoint = stream.type === 'usenet' 
                                      ? `/api/torbox/usenet/list`
                                      : `/api/torbox/torrents`;
                                    
                                    try {
                                      // Get cached download url
                                      const res = await fetch(dlEndpoint, {
                                        headers: { Authorization: `Bearer ${apiKey}` }
                                      });
                                      if (res.ok) {
                                        const result = await res.json();
                                        // Try to find if this item is already in user downloads list
                                        const existing = result.data?.find((t: any) => {
                                          const sName = (stream.name || "").toLowerCase();
                                          const tName = (t.name || "").toLowerCase();
                                          if (stream.type === 'usenet') {
                                            const nameMatch = tName === sName || sName.includes(tName) || tName.includes(sName);
                                            const sizeMatch = stream.sizeBytes && t.size && Math.abs(t.size - stream.sizeBytes) < (stream.sizeBytes * 0.15);
                                            return nameMatch || sizeMatch;
                                          }
                                          return t.hash === stream.hash || tName === sName;
                                        });
                                        
                                        if (existing) {
                                          const dlUrl = `https://api.torbox.app/v1/api/${stream.type === 'usenet' ? 'usenet' : 'torrents'}/requestdl?token=${apiKey}&${stream.type === 'usenet' ? 'usenet_id' : 'torrent_id'}=${existing.id}&zip_link=false&redirect=true`;
                                          onPlay(dlUrl);
                                          return;
                                        }
                                      }
                                    } catch (err) {
                                      console.error("Failed to check active downloads", err);
                                    }

                                    // If not in downloads list, create download instantly (it will be instant since it's cached)
                                    if (stream.type === 'usenet') {
                                      // Update local state to show 'Adding to provider...' immediately
                                      setStreams(prev => prev.map(s => {
                                        if (s.id === stream.id) {
                                          return { ...s, isAdding: true, isCached: false };
                                        }
                                        return s;
                                      }));

                                      try {
                                        const createRes = await fetch('/api/torbox/usenet/create', {
                                          method: 'POST',
                                          headers: { 
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${apiKey}` 
                                          },
                                          body: JSON.stringify({ link: stream.url })
                                        });
                                        const resData = await createRes.json();
                                        if (resData.success && resData.data) {
                                          setStreams(prev => prev.map(s => {
                                            if (s.id === stream.id) {
                                              return { ...s, isAdding: false, downloadProgress: 0, isCached: false };
                                            }
                                            return s;
                                          }));
                                          const dlUrl = `https://api.torbox.app/v1/api/usenet/requestdl?token=${apiKey}&usenet_id=${resData.data.usenet_id}&zip_link=false&redirect=true`;
                                          onPlay(dlUrl);
                                        } else {
                                          setStreams(prev => prev.map(s => {
                                            if (s.id === stream.id) {
                                              return { ...s, isAdding: false };
                                            }
                                            return s;
                                          }));
                                          const errMsg = typeof resData.detail === 'object' ? JSON.stringify(resData.detail) : (resData.detail || resData.error || "Unknown error");
                                          alert("Failed to queue Usenet download: " + errMsg);
                                        }
                                      } catch (err: any) {
                                        setStreams(prev => prev.map(s => {
                                          if (s.id === stream.id) {
                                            return { ...s, isAdding: false };
                                          }
                                          return s;
                                        }));
                                        alert("Error adding Usenet stream: " + err.message);
                                      }
                                    } else {
                                      // Torrent instant cached add
                                      try {
                                        const createRes = await fetch('/api/torbox/torrents/create', {
                                          method: 'POST',
                                          headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${apiKey}`
                                          },
                                          body: JSON.stringify({ magnet: stream.url })
                                        });
                                        const resData = await createRes.json();
                                        if (resData.success && resData.data) {
                                          const torrentId = resData.data.torrent_id || resData.data.id;
                                          const dlUrl = `https://api.torbox.app/v1/api/torrents/requestdl?token=${apiKey}&torrent_id=${torrentId}&zip_link=false&redirect=true`;
                                          onPlay(dlUrl);
                                        } else {
                                          alert("Failed to add Torrent: " + (resData.detail || "Unknown error"));
                                        }
                                      } catch (err: any) {
                                        alert("Error adding Torrent stream: " + err.message);
                                      }
                                    }
                                  } else {
                                    // Uncached items: Queue download
                                    if (stream.type === 'usenet') {
                                      // Update local state to show 'Adding to provider...' immediately
                                      setStreams(prev => prev.map(s => {
                                        if (s.id === stream.id) {
                                          return { ...s, isAdding: true, isCached: false };
                                        }
                                        return s;
                                      }));

                                      try {
                                        const createRes = await fetch('/api/torbox/usenet/create', {
                                          method: 'POST',
                                          headers: { 
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${apiKey}` 
                                          },
                                          body: JSON.stringify({ link: stream.url })
                                        });
                                        const resData = await createRes.json();
                                        if (resData.success) {
                                          setStreams(prev => prev.map(s => {
                                            if (s.id === stream.id) {
                                              return { ...s, isAdding: false, downloadProgress: 0, isCached: false };
                                            }
                                            return s;
                                          }));
                                          setPollingActive(true);
                                        } else {
                                          setStreams(prev => prev.map(s => {
                                            if (s.id === stream.id) {
                                              return { ...s, isAdding: false };
                                            }
                                            return s;
                                          }));
                                          let errMsg = "Unknown error";
                                          if (resData.detail) {
                                              if (typeof resData.detail === 'string') errMsg = resData.detail;
                                              else if (Array.isArray(resData.detail) && resData.detail.length > 0 && resData.detail[0].msg) errMsg = resData.detail[0].msg;
                                              else errMsg = JSON.stringify(resData.detail);
                                          } else if (resData.error) {
                                              errMsg = resData.error;
                                          }

                                          if (errMsg.toLowerCase().includes('rate limit')) {
                                              alert("TorBox Limit Reached: TorBox strictly limits how many Usenet items you can queue in a short period (usually 15-20 per hour). Please wait a few minutes before queuing more Usenet streams.");
                                          } else {
                                              alert("Failed to queue Usenet download: " + errMsg);
                                          }
                                        }
                                      } catch (err: any) {
                                        setStreams(prev => prev.map(s => {
                                          if (s.id === stream.id) {
                                            return { ...s, isAdding: false };
                                          }
                                          return s;
                                        }));
                                        alert("Error queueing Usenet: " + err.message);
                                      }
                                    } else {
                                      // Queue Torrent
                                      setStreams(prev => prev.map(s => {
                                        if (s.id === stream.id) {
                                          return { ...s, isAdding: true, isCached: false };
                                        }
                                        return s;
                                      }));

                                      try {
                                        const createRes = await fetch('/api/torbox/torrents/create', {
                                          method: 'POST',
                                          headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${apiKey}`
                                          },
                                          body: JSON.stringify({ magnet: stream.url })
                                        });
                                        const resData = await createRes.json();
                                        if (resData.success) {
                                          setStreams(prev => prev.map(s => {
                                            if (s.id === stream.id) {
                                              return { ...s, isAdding: false, downloadProgress: 0, isCached: false };
                                            }
                                            return s;
                                          }));
                                          setPollingActive(true);
                                        } else {
                                          setStreams(prev => prev.map(s => {
                                            if (s.id === stream.id) {
                                              return { ...s, isAdding: false };
                                            }
                                            return s;
                                          }));
                                          let errMsg = "Unknown error";
                                          if (resData.detail) {
                                              if (typeof resData.detail === 'string') errMsg = resData.detail;
                                              else if (Array.isArray(resData.detail) && resData.detail.length > 0 && resData.detail[0].msg) errMsg = resData.detail[0].msg;
                                              else errMsg = JSON.stringify(resData.detail);
                                          } else if (resData.error) {
                                              errMsg = resData.error;
                                          }
                                          alert("Failed to queue Torrent: " + errMsg);
                                        }
                                      } catch (err: any) {
                                        setStreams(prev => prev.map(s => {
                                          if (s.id === stream.id) {
                                            return { ...s, isAdding: false };
                                          }
                                          return s;
                                        }));
                                        alert("Error queueing Torrent: " + err.message);
                                      }
                                    }
                                  }
                                };

                                return (
                                  <div 
                                    key={stream.id} 
                                    className="flex flex-col p-3.5 bg-white/5 border border-white/10 rounded-xl hover:bg-red-950/10 hover:border-red-500/20 transition-all cursor-pointer group" 
                                    onClick={handleStreamClick}
                                  >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-xs font-medium text-white group-hover:text-white truncate">{stream.name}</span>
                                            <div className="flex items-center gap-2 mt-1">
                                              <span className="text-[10px] text-white/60 font-mono">Size: {stream.size}</span>
                                              {stream.downloadProgress !== undefined && stream.downloadProgress < 100 && stream.downloadSpeed !== undefined && (
                                                <span className="text-[10px] text-indigo-400 font-mono font-semibold">
                                                  • {(stream.downloadSpeed / (1024 * 1024)).toFixed(1)} MB/s
                                                </span>
                                              )}
                                            </div>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                          <div className={`px-2 py-0.5 text-[10px] font-bold rounded border whitespace-nowrap uppercase ${stream.isCached ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : (stream.downloadState && stream.downloadState !== 'completed' && stream.downloadState !== 'cached' && stream.downloadState !== 'downloaded' && stream.downloadProgress >= 100 ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : (stream.isAdding || stream.downloadProgress !== undefined ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'))}`}>
                                              {stream.isCached 
                                                ? 'Instant Cached' 
                                                : stream.isAdding 
                                                  ? 'Adding to provider...' 
                                                  : stream.downloadState && stream.downloadState !== 'completed' && stream.downloadState !== 'cached' && stream.downloadState !== 'downloaded' && stream.downloadProgress >= 100
                                                    ? `Processing (${stream.downloadState})`
                                                    : stream.downloadProgress !== undefined 
                                                      ? `Downloading ${stream.downloadProgress}%` 
                                                      : 'Queue Download'}
                                          </div>
                                          <div className="px-2 py-0.5 bg-indigo-600/10 text-indigo-400 text-[10px] font-bold rounded border border-indigo-500/20 whitespace-nowrap uppercase">
                                              {stream.type}
                                          </div>
                                          <div className="px-2 py-0.5 bg-red-600/10 text-red-400 text-[10px] font-bold rounded border border-red-500/20 whitespace-nowrap uppercase">
                                              {stream.quality}
                                          </div>
                                        </div>
                                      </div>
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
  );
}
