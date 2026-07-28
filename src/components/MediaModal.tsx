import { useState, useEffect } from 'react';
import { fetchStreamsForMovie, fetchStreamsForTvSeries } from '../services/torboxSearchApi';
import { getTvSeriesDetails, getTvSeasonDetails, getMpaaRating, getMediaCreditsAndDetails } from '../services/tmdbApi';
import { Bookmark, BookmarkCheck, X, Star, Database, Download, Sparkles, Search, Check, RefreshCw } from 'lucide-react';

import { collection, addDoc, query, where, getDocs, deleteDoc, doc, updateDoc, serverTimestamp } from '../lib/localDb';
import { db } from '../lib/localDb';
import { useAuth } from './Auth';
import { useSettings } from '../lib/settings';
import SpatialNavigation from 'spatial-navigation-js';

function getTorrentRequestDlUrl(torrentMatch: any, apiKey: string): string {
  let fileIdStr = '';
  if (torrentMatch && torrentMatch.files && torrentMatch.files.length > 0) {
      const videoFiles = torrentMatch.files.filter((f: any) => f.mimetype && f.mimetype.startsWith('video/'));
      if (videoFiles.length > 0) {
          const largest = videoFiles.sort((a: any, b: any) => b.size - a.size)[0];
          fileIdStr = `&file_id=${largest.id}`;
      } else {
          fileIdStr = `&file_id=${torrentMatch.files[0].id}`;
      }
  }
  return `https://api.torbox.app/v1/api/torrents/requestdl?token=${apiKey}&torrent_id=${torrentMatch.id}&zip_link=false&redirect=true${fileIdStr}`;
}

export default function MediaModal({ 
  movie, 
  onClose, 
  onPlay,
  onActorSearch,
  isHidden
}: { 
  movie: any, 
  onClose: () => void, 
  onPlay: (url: string, channelLogoUrl?: string, resumeTime?: number, context?: any) => void,
  onActorSearch?: (actorName: string) => void,
  isHidden?: boolean
}) {
  const [streams, setStreams] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { systemSettings, userSettings } = useSettings();
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
    imdbId?: string | null;
  } | null>(null);
  const [extraLoading, setExtraLoading] = useState(false);
  const [savedProgress, setSavedProgress] = useState<any>(null);
  const [resumePromptStream, setResumePromptStream] = useState<string | null>(null);

  useEffect(() => {
    if (isHidden) {
      SpatialNavigation.remove('media-modal');
      SpatialNavigation.enable('');
      SpatialNavigation.focus('');
      return;
    }

    SpatialNavigation.add('media-modal', {
      selector: '#media-modal .focusable, #media-modal button, #media-modal input, #media-modal select, #media-modal [tabindex="0"]',
      restrict: 'self-only',
      enterTo: 'last-focused'
    });
    SpatialNavigation.makeFocusable('media-modal');
    SpatialNavigation.focus('media-modal');
    SpatialNavigation.disable('');

    return () => {
      SpatialNavigation.remove('media-modal');
      SpatialNavigation.enable('');
      SpatialNavigation.focus('');
    };
  }, [isHidden]);

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const triggerPlay = (dlUrl: string, targetStream?: any) => {
    if (!isFavorite) {
      toggleFavorite();
    }
    const posterOrLogo = movie?.poster || movie?.backupPoster || undefined;
    if (savedProgress && savedProgress.currentTime > 0 && savedProgress.percentage < 95) {
      setResumePromptStream(dlUrl);
    } else {
      const isHevcMatch = /hevc|x265|h265|10bit|2160p|4k|hdr|remux/i.test(targetStream?.name || movie?.filePath || movie?.title || movie?.name || '');
      const context = { type: isSeries ? 'tv' : 'movie', id: movie.id, season: selectedSeason, episode: selectedEpisode, isHevc: isHevcMatch };
      onPlay(dlUrl, posterOrLogo, 0, context);
    }
  };



  const isSeries = movie?.type === 'series' || !!movie?.first_air_date;

  useEffect(() => {
    if (resumePromptStream) {
      SpatialNavigation.add('resume-modal', {
        selector: '#resume-modal .focusable',
        restrict: 'self-only',
        enterTo: 'last-focused'
      });
      SpatialNavigation.makeFocusable('resume-modal');
      SpatialNavigation.focus('resume-modal');
      SpatialNavigation.disable('media-modal');
      
      return () => {
        SpatialNavigation.remove('resume-modal');
        if (!isHidden) {
          SpatialNavigation.enable('media-modal');
          SpatialNavigation.focus('media-modal');
        }
      };
    }
  }, [resumePromptStream, isHidden]);

  useEffect(() => {
    if (movie) {
      setStreams([]);
      setExtraLoading(true);
      getMediaCreditsAndDetails(movie.id, isSeries).then(details => {
        setExtraDetails(details);
        setExtraLoading(false);
      });
    } else {
      setExtraDetails(null);
      setStreams([]);
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

  useEffect(() => {
    if (!user || !movie) return;
    const q = query(collection(db, 'user_progress'), where('userId', '==', user.uid), where('mediaId', '==', movie.id));
    getDocs(q).then(snapshot => {
      const docs = snapshot.docs.map(d => d.data());
      const prog = docs.find(d => 
        (isSeries ? d.season === selectedSeason && d.episode === selectedEpisode : true)
      );
      setSavedProgress(prog || null);
    });
  }, [user, movie, selectedSeason, selectedEpisode, isSeries]);
  
  const [prevMovieId, setPrevMovieId] = useState(movie?.id);
  if (movie?.id !== prevMovieId) {
    setPrevMovieId(movie?.id);
    setStreams([]);
    setSelectedSeason(null);
    setSelectedEpisode(null);
    setSeasons([]);
    setEpisodes([]);
  }
  const [seriesDetailsLoading, setSeriesDetailsLoading] = useState(false);
  const [pollingActive, setPollingActive] = useState(false);

  // Fix Match Modal State
  const [showFixMatchModal, setShowFixMatchModal] = useState(false);
  const [fixMatchQuery, setFixMatchQuery] = useState('');
  const [fixMatchResults, setFixMatchResults] = useState<any[]>([]);
  const [fixMatchSearching, setFixMatchSearching] = useState(false);
  const [fixMatchSaving, setFixMatchSaving] = useState<string | null>(null);

  const handleOpenFixMatch = () => {
    setShowFixMatchModal(true);
    const initialQ = movie?.title || movie?.name || '';
    setFixMatchQuery(initialQ);
    if (initialQ) {
      executeFixMatchSearch(initialQ);
    }
  };

  const executeFixMatchSearch = async (queryStr: string) => {
    if (!queryStr || queryStr.trim().length < 2) return;
    setFixMatchSearching(true);
    try {
      const apiKey = systemSettings.tmdbKey || '841059f71aab310b4d4c4f3a7e28328e';
      const searchUrl = `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(queryStr.trim())}`;
      const res = await fetch(searchUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.results && Array.isArray(data.results)) {
          const formatted = data.results.map((r: any) => {
            const relDate = r.release_date || r.first_air_date || '';
            const yr = relDate ? relDate.split('-')[0] : '';
            const isTv = r.media_type === 'tv' || r.first_air_date || (r.name && !r.title);
            const titleStr = r.title || r.name || 'Untitled';
            const imgPath = r.poster_path || r.backdrop_path;
            const posterUrl = imgPath ? `https://image.tmdb.org/t/p/w500${imgPath}` : '';
            return {
              tmdbId: r.id,
              title: titleStr,
              year: yr,
              poster: posterUrl,
              overview: r.overview || '',
              rating: r.vote_average ? r.vote_average.toFixed(1) : 'NR',
              type: isTv ? 'series' : 'movie'
            };
          });
          setFixMatchResults(formatted);
        }
      }
    } catch (err) {
      console.error("Fix match search error:", err);
    } finally {
      setFixMatchSearching(false);
    }
  };

  const selectFixMatchCandidate = async (candidate: any) => {
    setFixMatchSaving(candidate.tmdbId);
    try {
      await fetch('/api/local-media/fix-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: movie.id,
          filePath: movie.filePath,
          streamUrl: movie.streamUrl,
          title: candidate.title,
          year: candidate.year,
          poster: candidate.poster,
          overview: candidate.overview,
          rating: candidate.rating,
          type: candidate.type,
          realTmdbId: candidate.tmdbId
        })
      }).catch(() => null);


      movie.title = candidate.title;
      movie.name = candidate.title;
      if (candidate.year) movie.year = candidate.year;
      if (candidate.poster) movie.poster = candidate.poster;
      if (candidate.overview) movie.overview = candidate.overview;
      if (candidate.rating) movie.rating = candidate.rating;
      if (candidate.type) movie.type = candidate.type;
      movie.realTmdbId = candidate.tmdbId;

      window.dispatchEvent(new Event('refresh-local-library'));
      setShowFixMatchModal(false);
    } catch (err: any) {
      alert("Failed to save match: " + err.message);
    } finally {
      setFixMatchSaving(null);
    }
  };


  useEffect(() => {
    let intervalId: any;
    const apiKey = systemSettings.torboxApiKey;

    async function pollDownloads() {
      if (!apiKey) return;
      try {
        const tRes = await fetch('/api/torbox/torrents', { headers: { Authorization: `Bearer ${apiKey}` } }).catch(() => null);
        let uRes = null;
        if (systemSettings.enableUsenetSearch !== false) {
          await new Promise(r => setTimeout(r, 500));
          uRes = await fetch('/api/torbox/usenet/list', { headers: { Authorization: `Bearer ${apiKey}` } }).catch(() => null);
        }

        let activeTorrents: any[] = [];
        let activeUsenet: any[] = [];

        if (tRes && tRes.ok) {
          const tData = await tRes.json();
          if (tData && tData.success && tData.data) activeTorrents = tData.data;
        }
        if (uRes && uRes.ok) {
          const uData = await uRes.json();
          if (uData && uData.success && uData.data) activeUsenet = uData.data;
        }

        let playUrlToTrigger: string | null = null;

        setStreams(prevStreams => {
          return prevStreams.map(stream => {
            let updatedStream = { ...stream };

            // ── Torrent updates ──
            if (stream.type === 'torrent') {
              const match = activeTorrents.find(t => {
                if (stream.id !== undefined && String(t.id) === String(stream.id)) return true;
                if (stream.torboxId !== undefined && String(t.id) === String(stream.torboxId)) return true;
                if (stream.hash && t.hash && t.hash.toLowerCase() === stream.hash.toLowerCase()) return true;
                return false;
              });

              if (match) {
                const progress = Math.round(match.progress * 100);
                const state = match.download_state || '';
                const isNowComplete = progress >= 100 && (state === 'completed' || state === 'cached' || state === 'downloaded' || state === 'seeding' || !state);

                updatedStream.downloadProgress = progress;
                updatedStream.downloadState = state;
                updatedStream.downloadSpeed = match.download_speed || 0;
                updatedStream.isCached = isNowComplete;
                updatedStream.id = match.id;
                updatedStream.torboxId = match.id;
                updatedStream.isTorBox = true;

                // Always keep url pointing to the real requestdl link (not magnet)
                const dlUrl = getTorrentRequestDlUrl(match, apiKey);
                updatedStream.url = dlUrl;

                // Fire auto-play if this poll is the one that observed completion
                if (isNowComplete && stream.downloadProgress !== undefined && stream.downloadProgress < 100) {
                  playUrlToTrigger = dlUrl;
                }
              }
            }

            // ── Usenet updates ──
            if (stream.type === 'usenet') {
              const match = activeUsenet.find(u => {
                // Prefer ID match — most reliable (String comparison for string vs number)
                if (stream.id !== undefined && String(u.id) === String(stream.id)) return true;
                if (stream.torboxId !== undefined && String(u.id) === String(stream.torboxId)) return true;
                // Fall back to name comparison
                if (!u.name || !stream.name) return false;
                const sName = stream.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                const uName = u.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (uName.length < 5 || sName.length < 5) return uName === sName;
                return uName === sName || sName.includes(uName) || uName.includes(sName);
              });

              if (match) {
                const progress = Math.round(match.progress * 100);
                const state = match.download_state || '';
                const isNowComplete = progress >= 100 && (state === 'completed' || state === 'cached' || state === 'downloaded' || !state);

                updatedStream.downloadProgress = progress;
                updatedStream.downloadState = state;
                updatedStream.downloadSpeed = match.download_speed || 0;
                updatedStream.isCached = isNowComplete;
                updatedStream.id = match.id;
                updatedStream.torboxId = match.id;
                updatedStream.isTorBox = true;

                // Always keep url pointing to the live requestdl link
                const dlUrl = `https://api.torbox.app/v1/api/usenet/requestdl?token=${apiKey}&usenet_id=${match.id}&zip_link=false&redirect=true`;
                updatedStream.url = dlUrl;

                if (isNowComplete && stream.downloadProgress !== undefined && stream.downloadProgress < 100) {
                  playUrlToTrigger = dlUrl;
                }
              }
            }

            return updatedStream;
          });
        });

        if (playUrlToTrigger) {
          console.log("[Auto-Play] Triggering playback for finished download:", playUrlToTrigger);
          triggerPlay(playUrlToTrigger);
        }

        // Automatically stop polling if no downloads are currently in progress
        const hasInProgress = streams.some(s => s.isAdding || (s.downloadProgress !== undefined && s.downloadProgress < 100));
        if (!hasInProgress) {
          setPollingActive(false);
        }
      } catch (err) {
        console.error("Error polling TorBox downloads:", err);
      }
    }


    if (pollingActive && apiKey) {
      intervalId = setInterval(pollDownloads, 12000);
      pollDownloads(); 
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [pollingActive, streams]);


  useEffect(() => {
    let isActive = true;
    if (movie) {
      if (isSeries) {
        setSeriesDetailsLoading(true);
        
        (async () => {
          let targetTmdbId = movie.realTmdbId || movie.tmdbId;
          const isLocalId = typeof movie.id === 'string' && movie.id.startsWith('local_');

          if (!targetTmdbId && !isLocalId && typeof movie.id === 'number') {
            targetTmdbId = movie.id;
          }

          // If local item with no tmdbId yet, search TMDB for show title
          if (!targetTmdbId) {
            try {
              const cleanTitle = (movie.title || movie.name || '').replace(/\b(remastered|extended|uncut|1080p|720p|4k)\b/gi, '').trim();
              const apiKey = localStorage.getItem('tmdbKey') || '841059f71aab310b4d4c4f3a7e28328e';
              const searchRes = await fetch(`https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(cleanTitle)}`).then(r => r.json()).catch(() => null);
              if (searchRes?.results?.[0]?.id) {
                targetTmdbId = searchRes.results[0].id;
                movie.realTmdbId = targetTmdbId;
              }
            } catch (e) {}
          }

          let tmdbSeasons: any[] = [];
          if (targetTmdbId) {
            const details = await getTvSeriesDetails(targetTmdbId);
            if (details && details.seasons) {
              tmdbSeasons = details.seasons.filter((s: any) => s.season_number > 0);
            }
          }

          // Also check for local files & seasons in shared folder
          let localSeasons: any[] = [];
          if (movie.isNetworkShare || movie.folderPath || movie.filePath) {
            try {
              const epRes = await fetch(`/api/local-media/episodes?folderPath=${encodeURIComponent(movie.folderPath || '')}&filePath=${encodeURIComponent(movie.filePath || '')}`).then(r => r.json()).catch(() => null);
              if (epRes?.success && Array.isArray(epRes.seasons) && epRes.seasons.length > 0) {
                localSeasons = epRes.seasons;
              }
            } catch (e) {}
          }

          if (!isActive) return;

          const combinedSeasonsMap = new Map<number, any>();
          tmdbSeasons.forEach(s => combinedSeasonsMap.set(s.season_number, s));
          localSeasons.forEach(s => {
            if (!combinedSeasonsMap.has(s.season_number)) {
              combinedSeasonsMap.set(s.season_number, s);
            }
          });

          const finalSeasons = Array.from(combinedSeasonsMap.values()).sort((a, b) => a.season_number - b.season_number);
          setSeasons(finalSeasons);
          if (finalSeasons.length > 0) {
            setSelectedSeason(finalSeasons[0].season_number);
          }
          setSeriesDetailsLoading(false);
        })();
      } else {
        setLoading(true);
        setStreams([]);
        (async () => {
          const apiKey = systemSettings.torboxApiKey;
          let activeTorrents = [];
          let activeUsenet = [];
          
          if (apiKey) {
              try {
                  const tRes = await fetch('/api/torbox/torrents', { headers: { Authorization: `Bearer ${apiKey}` } }).catch(() => null);
                  let uRes = null;
                  if (systemSettings.enableUsenetSearch !== false) {
                      await new Promise(r => setTimeout(r, 1000));
                      uRes = await fetch('/api/torbox/usenet/list', { headers: { Authorization: `Bearer ${apiKey}` } }).catch(() => null);
                  }
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

          if (!isActive) return;

          const matchedTorboxIds = new Set();
          const initialData = [];
          const normalizedTitle = (movie.title || movie.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const year = movie.year || (movie.release_date ? movie.release_date.split('-')[0] : '');
          
          activeTorrents.forEach(t => {
              const normalizedTorrentName = (t.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              if (normalizedTorrentName.includes(normalizedTitle) && (!year || normalizedTorrentName.includes(year))) {
                  const progress = Math.round(t.progress * 100);
                  const state = t.download_state || '';
                  const isCached = progress >= 100 && (state === 'completed' || state === 'cached' || state === 'downloaded' || !state);
                  if (isCached) {
                      matchedTorboxIds.add(t.id);
                      initialData.push({
                          name: t.name, title: t.name, fullDescription: t.name,
                          quality: t.name.includes('4K') || t.name.includes('2160p') ? '4K' : (t.name.includes('1080p') ? '1080p' : '720p'),
                          sizeBytes: t.size, sizeStr: (t.size / 1024 / 1024 / 1024).toFixed(2) + ' GB',
                          type: 'torrent', hash: t.hash, downloadState: state, isCached, downloadProgress: progress, downloadSpeed: t.download_speed || 0,
                          url: getTorrentRequestDlUrl(t, apiKey), isTorBox: true, id: t.id, availability: 'Cached'
                      });
                  }
              }
          });

          activeUsenet.forEach(u => {
              const normalizedUsenetName = (u.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              if (normalizedUsenetName.includes(normalizedTitle) && (!year || normalizedUsenetName.includes(year))) {
                  const progress = Math.round(u.progress * 100);
                  const state = u.download_state || '';
                  const isCached = progress >= 100 && (state === 'completed' || state === 'cached' || state === 'downloaded' || !state);
                  if (isCached) {
                      matchedTorboxIds.add(u.id);
                      initialData.push({
                          name: u.name, title: u.name, fullDescription: u.name,
                          quality: u.name.includes('4K') || u.name.includes('2160p') ? '4K' : (u.name.includes('1080p') ? '1080p' : '720p'),
                          sizeBytes: u.size, sizeStr: (u.size / 1024 / 1024 / 1024).toFixed(2) + ' GB',
                          type: 'usenet', downloadState: state, isCached, downloadProgress: progress, downloadSpeed: u.download_speed || 0,
                          url: `https://api.torbox.app/v1/api/usenet/requestdl?token=${apiKey}&usenet_id=${u.id}&zip_link=false&redirect=true`, isTorBox: true, id: u.id, availability: 'Cached'
                      });
                  }
              }
          });

          if (movie.isNetworkShare || movie.streamUrl || movie.filePath) {

            const locUrl = movie.streamUrl || `/api/local-media/stream?path=${encodeURIComponent(movie.filePath)}`;
            initialData.unshift({
              name: `⚡ Local Network Share: ${movie.title || movie.name}`,
              title: movie.title || movie.name,
              fullDescription: `Direct Local Playback (${movie.filePath || 'Local Storage'})`,
              quality: '1080p',
              sizeStr: 'Local Storage',
              type: 'local',
              url: locUrl,
              isCached: true,
              availability: 'Instant Direct Stream'
            });
          }

          const getStreamPriorityRank = (s: any): number => {

            if (s.type === 'local') return 1; // 1. Network Share
            if (s.type === 'iptv') return 2;  // 2. IPTV Provider
            if (s.isCached) return 3;         // 3. TorBox Cached Files
            return 4;                         // 4. TorBox Usenet / Torrent Search
          };

          let allowedRes = userSettings?.resolutions || ['4K', '1080p', '720p'];
          const applyFiltersAndSort = (streams: any[]) => {
              const seenUrls = new Set<string>();
              const uniqueStreams = streams.filter(s => {
                if (!s || !s.url) return false;
                const normUrl = decodeURIComponent(s.url).toLowerCase().trim();
                if (seenUrls.has(normUrl)) return false;
                seenUrls.add(normUrl);
                return true;
              });

              const filtered = uniqueStreams.filter(s => {
                  const desc = (s.name || '') + ' ' + (s.fullDescription || '');
                  if (desc.includes('4K') || desc.includes('2160p')) return allowedRes.includes('4K');
                  if (desc.includes('1080p')) return allowedRes.includes('1080p');
                  if (desc.includes('720p')) return allowedRes.includes('720p');
                  return true;
              });
              return filtered.sort((a, b) => {
                  const rankA = getStreamPriorityRank(a);
                  const rankB = getStreamPriorityRank(b);
                  if (rankA !== rankB) return rankA - rankB;
                  return (b.seeds || 0) - (a.seeds || 0);
              });
          };



          if (initialData.length > 0) {
              setStreams(applyFiltersAndSort(initialData));
          }

          const iptvPromise = fetch(`/api/iptv/vod/search?title=${encodeURIComponent(movie.title || movie.name)}&type=movie`)
            .then(r => r.json())
            .catch(() => null);

          const movieYear = movie.year || (movie.release_date ? movie.release_date.split('-')[0] : '');
          const localMediaPromise = fetch(`/api/local-media/search?title=${encodeURIComponent(movie.title || movie.name)}&type=movie${movieYear ? `&year=${encodeURIComponent(movieYear)}` : ''}`)
            .then(r => r.json())
            .catch(() => null);

          Promise.all([
            fetchStreamsForMovie(movie.title || movie.name, movie.year, extraDetails?.imdbId || undefined),
            iptvPromise,
            localMediaPromise
          ]).then(([data, iptvRes, localRes]) => {
              if (!isActive) return;
              
              const updatedData = [...initialData];

              if (localRes?.success && Array.isArray(localRes.data)) {
                localRes.data.forEach((localStream: any) => {
                  updatedData.unshift(localStream);
                });
              }

              if (iptvRes?.success && Array.isArray(iptvRes.data)) {
                iptvRes.data.forEach((iptvStream: any) => {
                  updatedData.unshift(iptvStream);
                });
              }

              
              (data || []).forEach((stream) => {
                  const matchTorrent = activeTorrents.find(t => stream.hash && t.hash && t.hash.toLowerCase() === stream.hash.toLowerCase());
                  const matchUsenet = activeUsenet.find(u => {
                      if (!u.name || !stream.name) return false;
                      const sName = stream.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                      const uName = u.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                      if (uName.length < 10 || sName.length < 10) if (uName !== sName) return false;
                      const nameMatch = uName === sName || sName.includes(uName) || uName.includes(sName);
                      let sizeMatch = true;
                      if (stream.sizeBytes && u.size) sizeMatch = Math.abs(u.size - stream.sizeBytes) < (stream.sizeBytes * 0.05);
                      else if (uName !== sName) return false;
                      return nameMatch && sizeMatch;
                  });

                  let mappedStream = { ...stream };
                  if (matchTorrent) {
                      if (matchedTorboxIds.has(matchTorrent.id)) return;
                      matchedTorboxIds.add(matchTorrent.id);
                      const progress = Math.round(matchTorrent.progress * 100);
                      const state = matchTorrent.download_state || '';
                      mappedStream.downloadState = state;
                      mappedStream.isCached = progress >= 100 && (state === 'completed' || state === 'cached' || state === 'downloaded' || !state);
                      mappedStream.downloadProgress = progress;
                      mappedStream.downloadSpeed = matchTorrent.download_speed || 0;
                      mappedStream.id = matchTorrent.id;
                      mappedStream.isTorBox = true;
                      mappedStream.url = getTorrentRequestDlUrl(matchTorrent, apiKey);
                      updatedData.push(mappedStream);
                  } else if (matchUsenet) {
                      if (matchedTorboxIds.has(matchUsenet.id)) return;
                      matchedTorboxIds.add(matchUsenet.id);
                      const progress = Math.round(matchUsenet.progress * 100);
                      const state = matchUsenet.download_state || '';
                      mappedStream.downloadState = state;
                      mappedStream.isCached = progress >= 100 && (state === 'completed' || state === 'cached' || state === 'downloaded' || !state);
                      mappedStream.downloadProgress = progress;
                      mappedStream.downloadSpeed = matchUsenet.download_speed || 0;
                      mappedStream.id = matchUsenet.id;
                      mappedStream.isTorBox = true;
                      mappedStream.url = `https://api.torbox.app/v1/api/usenet/requestdl?token=${apiKey}&usenet_id=${matchUsenet.id}&zip_link=false&redirect=true`;
                      updatedData.push(mappedStream);
                  } else {
                      updatedData.push(mappedStream);
                  }
              });

              const hasActive = updatedData.some((s: any) => s.isAdding || (s.downloadProgress !== undefined && s.downloadProgress < 100));
              setStreams(applyFiltersAndSort(updatedData));
              setLoading(false);
              setPollingActive(hasActive);
          });
        })();


      }
    }
    return () => { isActive = false; };
  }, [movie, isSeries, userSettings]);

  // Load TV Season Details (Episodes list) when selectedSeason changes
  useEffect(() => {
    let isActive = true;
    if (isSeries && selectedSeason !== null && movie) {
      (async () => {
        let targetTmdbId = movie.realTmdbId || movie.tmdbId;
        if (!targetTmdbId && typeof movie.id === 'number') {
          targetTmdbId = movie.id;
        }

        let tmdbEpisodes: any[] = [];
        if (targetTmdbId) {
          const seasonData = await getTvSeasonDetails(targetTmdbId, selectedSeason);
          if (seasonData && seasonData.episodes) {
            tmdbEpisodes = seasonData.episodes;
          }
        }

        let localEpisodes: any[] = [];
        if (movie.isNetworkShare || movie.folderPath || movie.filePath) {
          try {
            const epRes = await fetch(`/api/local-media/episodes?folderPath=${encodeURIComponent(movie.folderPath || '')}&filePath=${encodeURIComponent(movie.filePath || '')}`).then(r => r.json()).catch(() => null);
            if (epRes?.success && Array.isArray(epRes.seasons)) {
              const matchedSeason = epRes.seasons.find((s: any) => s.season_number === selectedSeason) || epRes.seasons[0];
              if (matchedSeason && Array.isArray(matchedSeason.episodes)) {
                localEpisodes = matchedSeason.episodes;
              }
            }
          } catch (e) {}
        }

        if (!isActive) return;

        const epMap = new Map<number, any>();
        tmdbEpisodes.forEach(e => epMap.set(e.episode_number, e));
        localEpisodes.forEach(e => {
          if (!epMap.has(e.episode_number)) {
            epMap.set(e.episode_number, e);
          } else {
            // merge local stream URL into existing TMDB episode object!
            epMap.get(e.episode_number)!.streamUrl = e.streamUrl;
            epMap.get(e.episode_number)!.filePath = e.filePath;
          }
        });

        const finalEpisodes = Array.from(epMap.values()).sort((a, b) => a.episode_number - b.episode_number);
        setEpisodes(finalEpisodes);

        if (finalEpisodes.length > 0) {
          setSelectedEpisode(prevEp => {
            const epExists = finalEpisodes.some((e: any) => e.episode_number === prevEp);
            return epExists ? prevEp : finalEpisodes[0].episode_number;
          });
        }
      })();
    }
    return () => { isActive = false; };
  }, [isSeries, selectedSeason, movie]);

  // Fetch Streams for selected TV Season & Episode
  useEffect(() => {
    let isActive = true;
    if (isSeries && selectedSeason !== null && selectedEpisode !== null && movie) {
      setLoading(true);
      setStreams([]);

      const iptvPromise = fetch(`/api/iptv/vod/search?title=${encodeURIComponent(movie.title || movie.name)}&type=series&season=${selectedSeason}&episode=${selectedEpisode}`)
        .then(r => r.json())
        .catch(() => null);

      const localMediaPromise = fetch(`/api/local-media/search?title=${encodeURIComponent(movie.title || movie.name)}&type=series&season=${selectedSeason}&episode=${selectedEpisode}`)
        .then(r => r.json())
        .catch(() => null);

      Promise.all([
        fetchStreamsForTvSeries(movie.title || movie.name, selectedSeason, selectedEpisode, extraDetails?.imdbId || undefined),
        iptvPromise,
        localMediaPromise
      ]).then(async ([data, iptvRes, localRes]) => {
        if (!isActive) return;
        
        const apiKey = systemSettings.torboxApiKey;
        let activeTorrents: any[] = [];
        let activeUsenet: any[] = [];
        
        if (apiKey) {
            try {
                const tRes = await fetch('/api/torbox/torrents', { headers: { Authorization: `Bearer ${apiKey}` } }).catch(() => null);
                let uRes = null;
                if (systemSettings.enableUsenetSearch !== false) {
                    await new Promise(r => setTimeout(r, 1000));
                    uRes = await fetch('/api/torbox/usenet/list', { headers: { Authorization: `Bearer ${apiKey}` } }).catch(() => null);
                }
                
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

        const matchedTorboxIds = new Set<number>();
        const updatedData: any[] = [];

        if (localRes?.success && Array.isArray(localRes.data)) {
          localRes.data.forEach((localStream: any) => {
            updatedData.push(localStream);
          });
        }

        if (iptvRes?.success && Array.isArray(iptvRes.data)) {
          iptvRes.data.forEach((iptvStream: any) => {
            updatedData.push(iptvStream);
          });
        }


        (data || []).forEach((stream: any) => {

            const matchTorrent = activeTorrents.find(t => {
                if (stream.hash && t.hash && t.hash.toLowerCase() === stream.hash.toLowerCase()) return true;
                return false;
            });
            const matchUsenet = activeUsenet.find(u => {
                if (!u.name || !stream.name) return false;
                const sName = stream.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                const uName = u.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                
                if (uName.length < 10 || sName.length < 10) {
                    if (uName !== sName) return false;
                }
                
                const nameMatch = uName === sName || sName.includes(uName) || uName.includes(sName);
                
                let sizeMatch = true;
                if (stream.sizeBytes && u.size) {
                    sizeMatch = Math.abs(u.size - stream.sizeBytes) < (stream.sizeBytes * 0.05);
                } else {
                    if (uName !== sName) return false;
                }
                
                return nameMatch && sizeMatch;
            });

            let mappedStream = { ...stream };

            if (matchTorrent) {
              matchedTorboxIds.add(matchTorrent.id);
              const progress = Math.round(matchTorrent.progress * 100);
              const state = matchTorrent.download_state || '';
              mappedStream.downloadState = state;
              mappedStream.isCached = progress >= 100 && (state === 'completed' || state === 'cached' || state === 'downloaded' || state === 'seeding' || state === 'paused' || state === '');
              mappedStream.downloadProgress = progress;
              mappedStream.downloadSpeed = matchTorrent.download_speed || 0;
              mappedStream.id = matchTorrent.id;
              mappedStream.isTorBox = true;
              mappedStream.url = getTorrentRequestDlUrl(matchTorrent, apiKey);
            } else if (matchUsenet) {
              matchedTorboxIds.add(matchUsenet.id);
              const progress = Math.round(matchUsenet.progress * 100);
              const state = matchUsenet.download_state || '';
              mappedStream.downloadState = state;
              mappedStream.isCached = progress >= 100 && (state === 'completed' || state === 'cached' || state === 'downloaded' || state === 'seeding' || state === 'paused' || state === '');
              mappedStream.downloadProgress = progress;
              mappedStream.downloadSpeed = matchUsenet.download_speed || 0;
              mappedStream.id = matchUsenet.id;
              mappedStream.isTorBox = true;
              mappedStream.url = `https://api.torbox.app/v1/api/usenet/requestdl?token=${apiKey}&usenet_id=${matchUsenet.id}&zip_link=false&redirect=true`;
            }

            updatedData.push(mappedStream);
        });


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
                        url: getTorrentRequestDlUrl(t, apiKey),
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

        const getStreamPriorityRank = (s: any): number => {
          if (s.type === 'local') return 1; // 1. Network Share
          if (s.type === 'iptv') return 2;  // 2. IPTV Provider
          if (s.isCached) return 3;         // 3. TorBox Cached Files
          return 4;                         // 4. TorBox Usenet / Torrent Search
        };

        let allowedRes = userSettings?.resolutions || ['4K', '1080p', '720p'];
        const seenUrls = new Set<string>();
        const uniqueData = updatedData.filter((s: any) => {
          if (!s || !s.url) return false;
          const normUrl = decodeURIComponent(s.url).toLowerCase().trim();
          if (seenUrls.has(normUrl)) return false;
          seenUrls.add(normUrl);
          return true;
        });

        let filteredData = uniqueData.filter((s: any) => {
            const desc = (s.name || '') + ' ' + (s.fullDescription || '');
            if (desc.includes('4K') || desc.includes('2160p')) return allowedRes.includes('4K');
            if (desc.includes('1080p')) return allowedRes.includes('1080p');
            if (desc.includes('720p')) return allowedRes.includes('720p');
            return true;
        });

        filteredData.sort((a: any, b: any) => {
          const rankA = getStreamPriorityRank(a);
          const rankB = getStreamPriorityRank(b);
          if (rankA !== rankB) return rankA - rankB;
          return (b.seeds || 0) - (a.seeds || 0);
        });


        if (!isActive) return;
        setStreams(filteredData);

        const hasActive = filteredData.some((s: any) => s.isAdding || (s.downloadProgress !== undefined && s.downloadProgress < 100));
        setLoading(false);
        setPollingActive(hasActive);


        if (user && movie) {
            const q = query(collection(db, 'favorites'), where('userId', '==', user.uid), where('tmdbId', '==', movie.id));
            getDocs(q).then(snapshot => {
                if (snapshot.docs.length > 0) {
                    const bestStream = filteredData.length > 0 ? filteredData[0] : null;
                    if (bestStream) {
                        updateDoc(doc(db, 'favorites', snapshot.docs[0].id), {
                            streamInfo: {
                                name: bestStream.name,
                                url: bestStream.url,
                                quality: bestStream.quality
                            }
                        }).catch(err => console.error("Failed to update favorite streamInfo", err));
                    }
                }
            }).catch(err => console.error("Failed to check favorites for streamInfo update", err));
        }
      });
    }
    return () => { isActive = false; };
  }, [isSeries, selectedSeason, selectedEpisode, movie, userSettings]);

  useEffect(() => {
    async function checkFavorite() {
      if (!user || !movie) {
        setIsFavorite(false);
        setFavoriteId(null);
        return;
      }

      // Check if item is directly from a local network share
      const isLocalMedia = movie.isNetworkShare || !!movie.filePath || (typeof movie.id === 'string' && movie.id.startsWith('local_'));
      if (isLocalMedia) {
        setIsFavorite(true);
        return;
      }

      // Check if title exists in scanned local library
      try {
        const libRes = await fetch('/api/local-media/library').then(r => r.json()).catch(() => null);
        if (libRes?.success && Array.isArray(libRes.data)) {
          const normTitle = (movie.title || movie.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const inLocalLib = libRes.data.some((i: any) => {
            const itemNorm = (i.title || i.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            return itemNorm && itemNorm === normTitle;
          });
          if (inLocalLib) {
            setIsFavorite(true);
            return;
          }
        }
      } catch (e) {}

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
      alert("Error saving: " + err.message);
    } finally {
      setFavoriteLoading(false);
    }
  };

  if (!movie) return null;

  const renderStream = (stream: any) => {
                                const handleStreamClick = async () => {
                                  if (stream.isAdding) return;
                                  if (stream.downloadProgress !== undefined && stream.downloadProgress < 100) return;

                                  const apiKey = systemSettings.torboxApiKey;
                                  if (!apiKey) {
                                    alert("Please configure your TorBox API Key in Settings to stream or queue downloads.");
                                    return;
                                  }

                                  if (stream.isCached) {
                                    if (stream.id !== 0 || (stream.type === 'usenet' && stream.isCached)) {
                                      triggerPlay(stream.url, stream);
                                      return;
                                    }

                                    const dlEndpoint = stream.type === 'usenet' 
                                      ? `/api/torbox/usenet/list`
                                      : `/api/torbox/torrents`;
                                    
                                    try {
                                      const res = await fetch(dlEndpoint, {
                                        headers: { Authorization: `Bearer ${apiKey}` }
                                      });
                                      if (res.ok) {
                                        const result = await res.json();
                                        const existing = result.data?.find((t: any) => {
                                          if (stream.type === 'torrent' && stream.hash && t.hash) {
                                            return t.hash.toLowerCase() === stream.hash.toLowerCase();
                                          }
                                          
                                          const sName = (stream.name || "").toLowerCase().replace(/[^a-z0-9]/g, '');
                                          const tName = (t.name || "").toLowerCase().replace(/[^a-z0-9]/g, '');
                                          
                                          const isValidNameMatch = (sName.length > 5 && tName.length > 5) && 
                                            (tName === sName || sName.includes(tName) || tName.includes(sName));
                                            
                                          if (stream.type === 'usenet') {
                                            const sizeMatch = stream.sizeBytes && t.size && Math.abs(t.size - stream.sizeBytes) < (stream.sizeBytes * 0.05);
                                            return isValidNameMatch && sizeMatch;
                                          }
                                          
                                          return isValidNameMatch;
                                        });
                                        
                                        if (existing) {
                                          const dlUrl = stream.type === 'torrent' 
                                            ? getTorrentRequestDlUrl(existing, apiKey)
                                            : `https://api.torbox.app/v1/api/usenet/requestdl?token=${apiKey}&usenet_id=${existing.id}&zip_link=false&redirect=true`;
                                          triggerPlay(dlUrl, stream);
                                          return;
                                        }
                                      }

                                    } catch (err) {
                                      console.error("Failed to check active downloads", err);
                                    }

                                    if (stream.type === 'usenet') {
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
                                              const uId = resData.data?.usenet_id || resData.data?.id;
                                              return { ...s, isAdding: false, downloadProgress: 0, isCached: false, id: uId || s.id, torboxId: uId };
                                            }
                                            return s;
                                          }));
                                          setPollingActive(true);
                                          if (!isFavorite) { toggleFavorite(); }
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
                                              return { ...s, isAdding: false, downloadProgress: 0, isCached: false, torboxId: resData.data.torrent_id };
                                            }
                                            return s;
                                          }));
                                          setPollingActive(true);
                                          if (!isFavorite) { toggleFavorite(); }
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
                                              const uId = resData.data?.usenet_id || resData.data?.id;
                                              return { ...s, isAdding: false, downloadProgress: 0, isCached: false, id: uId || s.id, torboxId: uId };
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
                                              return { ...s, isAdding: false, downloadProgress: 0, isCached: false, torboxId: resData.data.torrent_id };
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
                                    tabIndex={0}
                                    className="focusable flex flex-col p-3.5 bg-white/5 border border-white/10 rounded-xl hover:bg-red-950/10 hover:border-red-500/20 transition-all cursor-pointer group focus:bg-red-950/20 focus:border-red-500/50 focus:outline-none focus:scale-[1.02]" 
                                    onClick={handleStreamClick}
                                  >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-xs font-medium text-white group-hover:text-white truncate">{stream.name}</span>
                                            <div className="flex items-center gap-2 mt-1">
                                              <span className="text-[10px] text-white/60 font-mono">Size: {stream.size || stream.sizeStr || 'Unknown'}</span>
                                              {stream.source && (
                                                <span className="text-[10px] text-white/60 font-mono flex items-center gap-1">
                                                  <Database className="w-3 h-3" /> Source: {stream.source}
                                                </span>
                                              )}
                                              {stream.downloadProgress !== undefined && stream.downloadProgress < 100 && stream.downloadSpeed !== undefined && (
                                                <span className="text-[10px] text-indigo-400 font-mono font-semibold flex items-center gap-1">
                                                  <Download className="w-3 h-3" /> {(stream.downloadSpeed / (1024 * 1024)).toFixed(1)} MB/s
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
  };

  return (
    <div id="media-modal" className={`fixed inset-0 z-50 flex items-center justify-center bg-[#0c0c12] animate-fadeIn ${isHidden ? 'hidden' : ''}`}>
      <div className="bg-[#0c0c12] border-0 rounded-none w-full h-full overflow-hidden flex flex-col">
        <div className="relative h-32 sm:h-40 md:h-48 bg-slate-800 shrink-0">
            {movie.poster && <img src={movie.poster} className="w-full h-full object-cover opacity-35" referrerPolicy="no-referrer" />}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c12] via-[#0c0c12]/60 to-transparent"></div>
            <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10 cursor-pointer">
                <X className="w-5 h-5" />
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
                          <Star className="w-3 h-3 text-yellow-500 fill-current" /> <span className="font-mono">{movie.rating}</span>
                      </span>
                      {(isFavorite || movie.isNetworkShare || movie.filePath) && (
                        <span className="flex items-center gap-1 px-2 py-0.5 border border-emerald-500/40 rounded text-[11px] font-bold text-emerald-400 font-mono leading-none tracking-wide uppercase bg-emerald-950/40">
                          <BookmarkCheck className="w-3 h-3 text-emerald-400" /> In Library
                        </span>
                      )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button 
                    onClick={handleOpenFixMatch}
                    className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors bg-white/5 text-white/90 border border-white/10 hover:bg-white/10 hover:text-white"
                    title="Correct title, poster and TMDB match"
                  >
                    <Sparkles className="w-4 h-4 text-red-500" />
                    Fix Match
                  </button>
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
        </div>


        <div className="p-6 overflow-y-auto md:overflow-hidden flex-1 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6 h-full md:overflow-y-auto custom-scrollbar md:pr-4 pb-4">
                {movie.overview && (
                    <p className="text-sm text-white/90 leading-relaxed">
                        {movie.overview}
                    </p>
                )}
                
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
                    {extraDetails.tagline && (
                      <div className="bg-white/[0.02] border-l-2 border-red-500 p-3 rounded-r-lg italic text-xs text-white/80 leading-relaxed">
                        "{extraDetails.tagline}"
                      </div>
                    )}

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
                                tabIndex={0}
                                className="focusable flex items-center gap-3 min-w-0 flex-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/50 rounded-xl"
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

            <div className="flex flex-col gap-6 h-full min-h-0 pb-4">
                {isSeries && (
                  <div className="space-y-4 bg-white/[0.02] border border-white/5 p-4 rounded-xl flex-shrink-0">
                    <h4 className="text-xs font-bold text-white/60 uppercase tracking-wider">Select Episode</h4>
                    {seriesDetailsLoading ? (
                        <div className="text-white/60 text-xs italic">Loading series details...</div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Season</label>
                                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollBehavior: 'smooth' }}>
                                    {seasons.map(s => (
                                        <button 
                                            key={s.season_number} 
                                            onClick={() => { setStreams([]); setSelectedSeason(s.season_number); setSelectedEpisode(null); setEpisodes([]); }}
                                            className={`focusable shrink-0 px-4 py-2 rounded-lg text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 ${selectedSeason === s.season_number ? 'bg-red-600 text-white' : 'bg-[#12121a] text-white/70 hover:bg-white/10'}`}
                                        >
                                            Season {s.season_number}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {episodes.length > 0 && (
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Episode</label>
                                    <div className="flex flex-wrap items-center gap-2 pb-2">
                                        {episodes.map(ep => (
                                            <button 
                                                key={ep.episode_number} 
                                                onClick={() => { setStreams([]); setSelectedEpisode(ep.episode_number); }}
                                                className={`focusable shrink-0 flex flex-col items-center justify-center min-w-[80px] px-3 py-2 rounded-lg text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 ${selectedEpisode === ep.episode_number ? 'bg-red-600 text-white' : 'bg-[#12121a] text-white/70 hover:bg-white/10'}`}
                                            >
                                                <span>Ep {ep.episode_number}</span>
                                                <span className="text-[9px] opacity-70 mt-0.5 max-w-[100px] truncate">{ep.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                  </div>
                )}


                <div className="flex flex-col flex-1 min-h-0 gap-6">
                    {/* Instant Cached & Active Downloads Container */}
                    <div className="flex flex-col shrink-0">
                        <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2">
                            Ready to Play / Active <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        </h3>
                        <div className="flex flex-col gap-3">
                            {streams.filter(s => s.isCached || s.downloadState || s.downloadProgress !== undefined).length > 0 ? (
                                streams.filter(s => s.isCached || s.downloadState || s.downloadProgress !== undefined).map(stream => renderStream(stream))
                            ) : (
                                <div className="text-white/40 text-xs italic py-2">No active downloads or cached items found.</div>
                            )}
                        </div>
                    </div>

                    {/* Search Results Container */}
                    <div className="flex flex-col flex-1 min-h-0">
                        <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2 flex-shrink-0">
                            TorBox Voyager Search Results <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                        </h3>
                        {loading ? (
                            <div className="text-white/60 text-xs italic py-4 flex items-center gap-2 bg-white/[0.01] p-4 rounded-xl border border-white/5">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                              </span>
                              <span>Searching TorBox Voyager Indexers...</span>
                            </div>
                        ) : streams.filter(s => !s.isCached && !s.downloadState && s.downloadProgress === undefined).length === 0 ? (
                            <div className="text-white/60 text-xs italic py-4 bg-white/[0.01] p-4 rounded-xl border border-white/5">No indexed streams found. Ensure your TorBox Pro API key is configured.</div>
                        ) : (
                            <div className="flex flex-col gap-3 flex-1 overflow-y-auto custom-scrollbar pr-1 pb-4">
                                {streams.filter(s => !s.isCached && !s.downloadState && s.downloadProgress === undefined).map(stream => renderStream(stream))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
      </div>
      {resumePromptStream && (
        <div id="resume-modal" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f0f13] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-6">
            <div className="text-center">
              <h3 className="text-xl font-bold text-white mb-2">Resume Playback?</h3>
              <p className="text-white/60 text-sm">You left off at {formatTime(savedProgress.currentTime)}. Would you like to resume from where you stopped?</p>
            </div>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => {
                  const isHevcMatch = typeof stream !== 'undefined' && stream.name ? /hevc|x265|h265/i.test(stream.name) : false;
      const context = { type: isSeries ? 'tv' : 'movie', id: movie.id, season: selectedSeason, episode: selectedEpisode, isHevc: isHevcMatch };
                  onPlay(resumePromptStream, undefined, savedProgress.currentTime, context);
                  setResumePromptStream(null);
                }}
                className="focusable w-full py-3 rounded-lg bg-emerald-600 text-white font-bold tracking-wide hover:bg-emerald-500 transition-colors cursor-pointer focus:outline-none focus:ring-4 focus:ring-emerald-500"
              >
                Resume from {formatTime(savedProgress.currentTime)}
              </button>
              <button 
                onClick={() => {
                  const isHevcMatch = typeof stream !== 'undefined' && stream.name ? /hevc|x265|h265/i.test(stream.name) : false;
      const context = { type: isSeries ? 'tv' : 'movie', id: movie.id, season: selectedSeason, episode: selectedEpisode, isHevc: isHevcMatch };
                  onPlay(resumePromptStream, undefined, 0, context);
                  setResumePromptStream(null);
                }}
                className="focusable w-full py-3 rounded-lg bg-white/5 text-white font-bold tracking-wide hover:bg-white/10 transition-colors cursor-pointer focus:outline-none focus:ring-4 focus:ring-white/50"
              >
                Start Over
              </button>
              <button 
                onClick={() => setResumePromptStream(null)}
                className="focusable w-full py-3 rounded-lg text-white/40 font-bold tracking-wide hover:text-white transition-colors mt-2 cursor-pointer focus:outline-none focus:ring-4 focus:ring-white/50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fix Match Modal Dialog */}
      {showFixMatchModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-red-600/20 text-red-500 border border-red-500/30">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide uppercase">Fix TMDB Match</h3>
                  <p className="text-[11px] text-white/50">Search TMDB database to select the exact title and poster</p>
                </div>
              </div>
              <button 
                onClick={() => setShowFixMatchModal(false)}
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-4 border-b border-white/5 bg-slate-900/50">
              <form 
                onSubmit={(e) => { e.preventDefault(); executeFixMatchSearch(fixMatchQuery); }}
                className="flex gap-2"
              >
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text"
                    value={fixMatchQuery}
                    onChange={(e) => setFixMatchQuery(e.target.value)}
                    placeholder="Type movie or series title..."
                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-white/40 focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={fixMatchSearching}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-lg transition-all"
                >
                  {fixMatchSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  Search
                </button>
              </form>
            </div>

            {/* Candidate List */}
            <div className="p-4 overflow-y-auto flex-1 space-y-3 custom-scrollbar">
              {fixMatchSearching ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-2 text-white/50 text-xs">
                  <RefreshCw className="w-6 h-6 animate-spin text-red-500" />
                  <span>Searching TMDB catalog...</span>
                </div>
              ) : fixMatchResults.length === 0 ? (
                <div className="py-12 text-center text-white/40 text-xs">
                  No TMDB matches found. Try searching with a different title.
                </div>
              ) : (
                fixMatchResults.map((item) => (
                  <div 
                    key={item.tmdbId}
                    onClick={() => selectFixMatchCandidate(item)}
                    className="group flex gap-4 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-red-500/40 cursor-pointer transition-all duration-200"
                  >
                    {/* Poster Preview */}
                    <div className="w-14 h-20 rounded-lg bg-slate-800 overflow-hidden shrink-0 relative border border-white/10 shadow-md">
                      {item.poster ? (
                        <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-white/40 text-center p-1">
                          No Poster
                        </div>
                      )}
                    </div>

                    {/* Content Info */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-white truncate group-hover:text-red-400 transition-colors">{item.title}</span>
                          {item.year && <span className="text-[10px] font-mono text-white/60 bg-white/10 px-1.5 py-0.2 rounded">{item.year}</span>}
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {item.type === 'series' ? 'TV SHOW' : 'MOVIE'}
                          </span>
                        </div>
                        {item.overview && (
                          <p className="text-[11px] text-white/60 line-clamp-2 leading-relaxed">
                            {item.overview}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-1 border-t border-white/5">
                        <span className="text-[10px] font-mono text-amber-400 font-semibold flex items-center gap-1">
                          ★ {item.rating}
                        </span>
                        <button 
                          disabled={fixMatchSaving === item.tmdbId}
                          className="px-3.5 py-1 bg-red-600/80 group-hover:bg-red-600 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 shadow transition-all"
                        >
                          {fixMatchSaving === item.tmdbId ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                          Select Match
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>

  );
}
