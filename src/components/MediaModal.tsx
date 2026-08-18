import { useState, useEffect, useRef, useMemo } from 'react';
import { getTvSeriesDetails, getTvSeasonDetails, getMpaaRating, getMediaCreditsAndDetails, getCachedImageUrl } from '../services/tmdbApi';
import { Bookmark, BookmarkCheck, X, Star, Database, Download, Sparkles, Search, Check, RefreshCw, Cloud, CheckCircle, Eye, EyeOff, Calendar, Video, PlayCircle, Zap, Info, FileVideo, ChevronDown, ChevronUp, Play } from 'lucide-react';

import { collection, addDoc, query, where, getDocs, deleteDoc, doc, updateDoc, setDoc, serverTimestamp, onSnapshot } from '../lib/localDb';
import { db } from '../lib/localDb';
import { useAuth } from './Auth';
import { useSettings } from '../lib/settings';
import { pausePrefetchQueue } from '../lib/prefetchCache';
import SpatialNavigation from 'spatial-navigation-js';

const fetchStreamsForMovie = async (title: string, year?: string, imdbId?: string): Promise<any[]> => {
  try {
    const q = `${title}${year ? ` ${year}` : ''}`;
    const url = `/api/torrents/search?q=${encodeURIComponent(q)}${imdbId ? `&imdbId=${encodeURIComponent(imdbId)}` : ''}`;
    const res = await fetch(url).then(r => r.json());
    if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
      return res.data.map((t: any, idx: number) => ({
        id: t.id || t.hash || `torrent_movie_${idx}_${(t.name || '').replace(/[^a-z0-9]/g, '')}`,
        name: t.name,
        title: t.name,
        type: 'torrent',
        hash: t.hash,
        magnet: t.magnet || t.link,
        url: t.magnet || t.link,
        seeds: t.seeds || 0,
        peers: t.peers || 0,
        sizeStr: t.size ? `${(t.size / 1e9).toFixed(2)} GB` : 'Unknown',
        quality: /2160p|4k/i.test(t.name) ? '4K' : /1080p/i.test(t.name) ? '1080p' : /720p/i.test(t.name) ? '720p' : 'HD',
        source: t.source || 'Torrent'
      }));
    }
    // Fallback: search title without year if year query returned empty
    if (year) {
      const fallbackUrl = `/api/torrents/search?q=${encodeURIComponent(title)}${imdbId ? `&imdbId=${encodeURIComponent(imdbId)}` : ''}`;
      const fallbackRes = await fetch(fallbackUrl).then(r => r.json()).catch(() => null);
      if (fallbackRes?.success && Array.isArray(fallbackRes.data)) {
        return fallbackRes.data.map((t: any, idx: number) => ({
          id: t.id || t.hash || `torrent_movie_fb_${idx}_${(t.name || '').replace(/[^a-z0-9]/g, '')}`,
          name: t.name,
          title: t.name,
          type: 'torrent',
          hash: t.hash,
          magnet: t.magnet || t.link,
          url: t.magnet || t.link,
          seeds: t.seeds || 0,
          peers: t.peers || 0,
          sizeStr: t.size ? `${(t.size / 1e9).toFixed(2)} GB` : 'Unknown',
          quality: /2160p|4k/i.test(t.name) ? '4K' : /1080p/i.test(t.name) ? '1080p' : /720p/i.test(t.name) ? '720p' : 'HD',
          source: t.source || 'Torrent'
        }));
      }
    }
  } catch (e) {
    console.error('Error fetching torrent streams for movie:', e);
  }
  return [];
};

const fetchStreamsForTvSeries = async (title: string, season?: number, episode?: number, imdbId?: string): Promise<any[]> => {
  try {
    const sStr = season ? `S${season.toString().padStart(2, '0')}` : '';
    const eStr = episode ? `E${episode.toString().padStart(2, '0')}` : '';
    const q = `${title} ${sStr}${eStr}`.trim();
    const url = `/api/torrents/search?q=${encodeURIComponent(q)}&title=${encodeURIComponent(title)}${imdbId ? `&imdbId=${encodeURIComponent(imdbId)}` : ''}`;
    const res = await fetch(url).then(r => r.json());
    if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
      return res.data.map((t: any, idx: number) => ({
        id: t.id || t.hash || `torrent_tv_${idx}_${(t.name || '').replace(/[^a-z0-9]/g, '')}`,
        name: t.name,
        title: t.name,
        type: 'torrent',
        hash: t.hash,
        magnet: t.magnet || t.link,
        url: t.magnet || t.link,
        seeds: t.seeds || 0,
        peers: t.peers || 0,
        sizeStr: t.size ? `${(t.size / 1e9).toFixed(2)} GB` : 'Unknown',
        quality: /2160p|4k/i.test(t.name) ? '4K' : /1080p/i.test(t.name) ? '1080p' : /720p/i.test(t.name) ? '720p' : 'HD',
        source: t.source || 'Torrent'
      }));
    }
    // Fallback: search Season pack (e.g. "Game of Thrones S01")
    if (season) {
      const seasonQuery = `${title} ${sStr}`.trim();
      const fallbackUrl = `/api/torrents/search?q=${encodeURIComponent(seasonQuery)}&title=${encodeURIComponent(title)}${imdbId ? `&imdbId=${encodeURIComponent(imdbId)}` : ''}`;
      const fallbackRes = await fetch(fallbackUrl).then(r => r.json()).catch(() => null);
      if (fallbackRes?.success && Array.isArray(fallbackRes.data)) {
        return fallbackRes.data.map((t: any, idx: number) => ({
          id: t.id || t.hash || `torrent_tv_fb_${idx}_${(t.name || '').replace(/[^a-z0-9]/g, '')}`,
          name: t.name,
          title: t.name,
          type: 'torrent',
          hash: t.hash,
          magnet: t.magnet || t.link,
          url: t.magnet || t.link,
          seeds: t.seeds || 0,
          peers: t.peers || 0,
          sizeStr: t.size ? `${(t.size / 1e9).toFixed(2)} GB` : 'Unknown',
          quality: /2160p|4k/i.test(t.name) ? '4K' : /1080p/i.test(t.name) ? '1080p' : /720p/i.test(t.name) ? '720p' : 'HD',
          source: t.source || 'Torrent'
        }));
      }
    }
  } catch (e) {
    console.error('Error fetching torrent streams for TV:', e);
  }
  return [];
};

const fetchStreamsForMusic = async (title: string, artist?: string, album?: string): Promise<any[]> => {
  try {
    const q = `${artist ? `${artist} ` : ''}${album ? `${album} ` : ''}${title}`.trim();
    const url = `/api/torrents/search?q=${encodeURIComponent(q)}&category=music`;
    const res = await fetch(url).then(r => r.json());
    if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
      return res.data.map((t: any, idx: number) => ({
        id: t.id || t.hash || `torrent_music_${idx}_${(t.name || '').replace(/[^a-z0-9]/g, '')}`,
        name: t.name,
        title: t.name,
        type: 'torrent',
        hash: t.hash,
        magnet: t.magnet || t.link,
        url: t.magnet || t.link,
        seeds: t.seeds || 0,
        peers: t.peers || 0,
        sizeStr: t.size ? `${(t.size / (1024 * 1024)).toFixed(1)} MB` : 'Unknown',
        quality: /flac|lossless/i.test(t.name) ? 'FLAC' : /320/i.test(t.name) ? '320kbps' : 'AUDIO',
        source: t.source || 'Music Torrent'
      }));
    }
  } catch (e) {
    console.error('Error fetching torrent streams for music:', e);
  }
  return [];
};

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
  const availableStreams = useMemo(() => {
    return streams.filter(s => {
      if (s.type === 'local' || s.type === 'iptv' || s.type === 'premiumize_cloud' || s.inPersonalCloud) return true;
      return Boolean(s.isPremiumize || s.isCached || s.url);
    });
  }, [streams]);
  const [loading, setLoading] = useState(false);
  const [selectedStreamId, setSelectedStreamId] = useState<string | null>(null);
  const { user } = useAuth();
  const { systemSettings, userSettings } = useSettings();
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [mpaaRating, setMpaaRating] = useState<string>('');
  const [extraDetails, setExtraDetails] = useState<{
    directors: string[];
    writers?: string[];
    producers: string[];
    releaseDate: string;
    cast: { id: number; name: string; character: string; profilePath: string | null }[];
    genres?: string[];
    tagline?: string;
    imdbId?: string | null;
    skipSegments?: any[];
    seasons?: any;
    chapters?: { id: string; title: string; startTime: number; endTime: number }[];
  } | null>(null);
  const [extraLoading, setExtraLoading] = useState(false);
  const [dynamicLogoUrl, setDynamicLogoUrl] = useState<string>('');
  const [dynamicOverview, setDynamicOverview] = useState<string>('');
  const [savedProgress, setSavedProgress] = useState<any>(null);
  const [resumePromptStream, setResumePromptStream] = useState<string | null>(null);
  const [lastPlayedStream, setLastPlayedStream] = useState<any>(null);

  const [isActiveStreamsOpen, setIsActiveStreamsOpen] = useState(true);
  const [isAvailableStreamsOpen, setIsAvailableStreamsOpen] = useState(true);

  // Developer Admin Tools States & Handlers
  const [devSelectedStreamUrl, setDevSelectedStreamUrl] = useState<string>('');
  const [devSkipSegments, setDevSkipSegments] = useState<Array<{ type: string; start: number; end: number; label: string }>>([]);
  const [devScanningSkip, setDevScanningSkip] = useState(false);
  const [devSubmittingTidb, setDevSubmittingTidb] = useState(false);

  const [devChapters, setDevChapters] = useState<Array<{ id: string; title: string; startTime: number; endTime: number }>>([]);
  const [devScanningChapters, setDevScanningChapters] = useState(false);
  const [devSavingChapters, setDevSavingChapters] = useState(false);

  const updateDevSkipSegment = (index: number, patch: Partial<{ type: string; start: number; end: number; label: string }>) => {
    setDevSkipSegments(prev => prev.map((s, i) => i === index ? { ...s, ...patch } : s));
  };
  const addDevSkipSegment = () => {
    setDevSkipSegments(prev => [...prev, { type: 'intro', start: 0, end: 90, label: 'Skip Intro' }]);
  };
  const removeDevSkipSegment = (index: number) => {
    setDevSkipSegments(prev => prev.filter((_, i) => i !== index));
  };

  const updateDevChapter = (index: number, patch: Partial<{ id: string; title: string; startTime: number; endTime: number }>) => {
    setDevChapters(prev => prev.map((c, i) => i === index ? { ...c, ...patch } : c));
  };
  const addDevChapter = () => {
    const nextStart = devChapters.length > 0 ? (devChapters[devChapters.length - 1].startTime + 600) : 0;
    setDevChapters(prev => [...prev, { id: `ch-${prev.length}`, title: `Chapter ${prev.length + 1}`, startTime: nextStart, endTime: nextStart + 600 }]);
  };
  const removeDevChapter = (index: number) => {
    setDevChapters(prev => prev.filter((_, i) => i !== index));
  };

  const sanitizeExtraDetails = (raw: any, fallbackYear?: string | number) => {
    if (!raw) return null;
    const directors = Array.isArray(raw.directors)
      ? raw.directors.map((d: any) => typeof d === 'string' ? d : (d?.name || '')).filter(Boolean)
      : [];
    const writers = Array.isArray(raw.writers)
      ? raw.writers.map((w: any) => typeof w === 'string' ? w : (w?.name || '')).filter(Boolean)
      : [];
    const producers = Array.isArray(raw.producers)
      ? raw.producers.map((p: any) => typeof p === 'string' ? p : (p?.name || '')).filter(Boolean)
      : [];
    const genres = Array.isArray(raw.genres)
      ? raw.genres.map((g: any) => typeof g === 'string' ? g : (g?.name || '')).filter(Boolean)
      : [];
    const cast = Array.isArray(raw.cast)
      ? raw.cast.map((actor: any, idx: number) => {
          if (typeof actor === 'string') {
            return { id: `cast-str-${idx}-${actor}`, name: actor, character: '', profilePath: null };
          }
          return {
            id: actor?.id || `cast-obj-${idx}-${actor?.name || 'unknown'}`,
            name: actor?.name || (typeof actor === 'string' ? actor : 'Unknown'),
            character: actor?.character || '',
            profilePath: actor?.profilePath || actor?.profile_path || null
          };
        })
      : [];
    const releaseDate = typeof raw.releaseDate === 'string' 
      ? raw.releaseDate 
      : (raw.releaseDate ? String(raw.releaseDate) : (fallbackYear ? String(fallbackYear) : ''));
    const tagline = typeof raw.tagline === 'string' ? raw.tagline : '';
    const imdbId = raw.imdbId || null;
    const skipSegments = Array.isArray(raw.skipSegments) ? raw.skipSegments : (raw.skipSegments ? [raw.skipSegments] : []);
    const seasons = raw.seasons || null;
    const chapters: { id: string; title: string; startTime: number; endTime: number }[] = Array.isArray(raw.chapters)
      ? raw.chapters.map((ch: any) => ({ id: ch.id || '', title: ch.title || '', startTime: Number(ch.startTime) || 0, endTime: Number(ch.endTime) || 0 }))
      : [];

    return { directors, writers, producers, releaseDate, cast, genres, tagline, imdbId, skipSegments, seasons, chapters };
  };



  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const triggerPlay = (dlUrl: string, targetStream?: any) => {
    if (targetStream) {
      setLastPlayedStream(targetStream);
      const targetTmdbId = resolvedTmdbId || movie?.realTmdbId || movie?.tmdbId || movie?.id;
      if (targetTmdbId) {
        fetch('/api/media/save-last-played', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tmdbId: targetTmdbId,
            type: (movie?.type === 'series' || movie?.type === 'tv' || !!movie?.first_air_date) ? 'tv' : 'movie',
            season: selectedSeason,
            episode: selectedEpisode,
            stream: targetStream
          })
        }).catch(() => {});
      }
    }
    if (!isFavorite) {
      toggleFavorite().catch(err => console.warn("Auto-favorite on play warning:", err));
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



  const isFutureAirDate = (airDateStr?: string): boolean => {
    if (!airDateStr || typeof airDateStr !== 'string') return false;
    const parts = airDateStr.split('-').map(p => parseInt(p, 10));
    if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return false;

    const epDate = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59);
    const now = new Date();

    return epDate.getTime() > now.getTime();
  };

  const isSeries = movie?.type === 'series' || movie?.type === 'tv' || movie?.type === 'show' || movie?.type === 'tvseries' || !!movie?.first_air_date;
  const [resolvedTmdbId, setResolvedTmdbId] = useState<number | null>(null);

  useEffect(() => {
    let isActive = true;
    if (!movie) {
      setResolvedTmdbId(null);
      return;
    }

    let targetId: number | null = null;
    if (typeof movie.id === 'number' && movie.id > 0) {
      targetId = movie.id;
    } else if (movie.realTmdbId && !isNaN(Number(movie.realTmdbId))) {
      targetId = Number(movie.realTmdbId);
    } else if (movie.tmdbId && !isNaN(Number(movie.tmdbId))) {
      targetId = Number(movie.tmdbId);
    } else if (typeof movie.id === 'string' && !movie.id.startsWith('local_') && !isNaN(Number(movie.id))) {
      targetId = Number(movie.id);
    }

    if (targetId) {
      setResolvedTmdbId(targetId);
      return;
    }

    (async () => {
      const cleanTitle = (movie.title || movie.name || '').replace(/\b(remastered|extended|uncut|1080p|720p|4k|bluray)\b/gi, '').trim();
      if (!cleanTitle || cleanTitle.length < 2) return;
      const apiKey = systemSettings.tmdbKey || localStorage.getItem('tmdbKey') || '841059f71aab310b4d4c4f3a7e28328e';
      const endpoint = isSeries ? 'tv' : 'movie';
      try {
        const searchUrl = `https://api.themoviedb.org/3/search/${endpoint}?api_key=${apiKey}&query=${encodeURIComponent(cleanTitle)}${!isSeries && movie.year ? `&year=${movie.year}` : ''}`;
        const res = await fetch(searchUrl).then(r => r.json()).catch(() => null);
        if (res?.results?.[0]?.id) {
          const foundId = res.results[0].id;
          if (isActive) {
            movie.realTmdbId = foundId;
            setResolvedTmdbId(foundId);
          }
        } else {
          const multiUrl = `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(cleanTitle)}`;
          const multiRes = await fetch(multiUrl).then(r => r.json()).catch(() => null);
          const match = multiRes?.results?.find((r: any) => isSeries ? (r.media_type === 'tv' || r.first_air_date) : (r.media_type === 'movie' || r.release_date));
          if (match?.id && isActive) {
            movie.realTmdbId = match.id;
            setResolvedTmdbId(match.id);
          }
        }
      } catch (e) {
        console.warn('Error resolving TMDB ID for media:', e);
      }
    })();

    return () => { isActive = false; };
  }, [movie, isSeries, systemSettings.tmdbKey]);

  useEffect(() => {
    if (movie && !isHidden) {
      SpatialNavigation.add('media-modal', {
        selector: '#media-modal .focusable, #media-modal button, #media-modal select, #media-modal input, #media-modal [tabindex="0"]',
        restrict: 'self-only',
        enterTo: 'last-focused'
      });
      SpatialNavigation.makeFocusable('media-modal');
      
      const timer = setTimeout(() => {
        try {
          SpatialNavigation.focus('media-modal');
        } catch (e) {
          const firstFocusable = document.querySelector('#media-modal .focusable, #media-modal button, #media-modal select') as HTMLElement;
          if (firstFocusable) firstFocusable.focus();
        }
      }, 50);

      return () => {
        clearTimeout(timer);
        try {
          SpatialNavigation.remove('media-modal');
        } catch (e) {}
      };
    }
  }, [movie, isHidden]);

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
    let isActive = true;
    if (movie) {
      const targetId = resolvedTmdbId || movie.tmdbId || (movie.realTmdbId ? Number(movie.realTmdbId) : (typeof movie.id === 'number' ? movie.id : (!isNaN(Number(movie.id)) ? Number(movie.id) : null)));
      if (targetId) {
        const mediaType = isSeries ? 'tv' : 'movie';
        setExtraLoading(true);

        // 1. INSTANT LOCAL DB LOAD (0ms latency for detail screen open)
        fetch(`/api/media/cached-metadata?tmdbId=${targetId}&type=${mediaType}`)
          .then(r => r.json())
          .then(res => {
            if (!isActive || !res?.success || !res.data) return;
            const cached = res.data;
            if (cached.logoUrl) setDynamicLogoUrl(cached.logoUrl);
            if (cached.mpaaRating) setMpaaRating(cached.mpaaRating);
            if (cached.overview) setDynamicOverview(cached.overview);
            const sanitized = sanitizeExtraDetails(cached, movie.year);
            if (sanitized) {
              setExtraDetails(sanitized);
              setExtraLoading(false); // Display instantly from DB!
            }
          })
          .catch(() => {});

        // 2. BACKGROUND REVALIDATION WITH DATA PROVIDERS ONLINE
        fetch('/api/media/prefetch-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tmdbId: targetId,
            type: mediaType,
            title: movie.title || movie.name,
            revalidate: true
          })
        })
          .then(r => r.json())
          .then(res => {
            if (!isActive || !res?.success || !res.data) return;
            const fresh = res.data;
            if (fresh.logoUrl) setDynamicLogoUrl(fresh.logoUrl);
            if (fresh.mpaaRating) setMpaaRating(fresh.mpaaRating);
            if (fresh.overview) setDynamicOverview(fresh.overview);
            const sanitized = sanitizeExtraDetails(fresh, movie.year);
            if (sanitized) {
              setExtraDetails(sanitized);
            }
            setExtraLoading(false);
          })
          .catch(() => {
            if (isActive) setExtraLoading(false);
          });
      } else {
        setExtraLoading(false);
      }
    } else {
      setExtraDetails(null);
      setStreams([]);
      setMpaaRating('');
    }
    return () => { isActive = false; };
  }, [movie, isSeries, resolvedTmdbId]);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);
  const [watchedDocs, setWatchedDocs] = useState<Record<string, boolean>>({});
  const [showTrailerModal, setShowTrailerModal] = useState(false);
  const [selectedTrailerKey, setSelectedTrailerKey] = useState<string | null>(null);

  const savePersistedStreams = (finalStreamsList: any[]) => {
    const targetTmdbId = resolvedTmdbId || movie?.realTmdbId || movie?.tmdbId || movie?.id;
    if (!targetTmdbId || !Array.isArray(finalStreamsList) || finalStreamsList.length === 0) return;
    fetch('/api/media/save-streams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tmdbId: targetTmdbId,
        type: (movie?.type === 'series' || movie?.type === 'tv' || !!movie?.first_air_date) ? 'tv' : 'movie',
        season: selectedSeason,
        episode: selectedEpisode,
        streams: finalStreamsList
      })
    }).catch(() => {});
  };

  // Load cached streams instantly when media item or episode detail screen opens
  useEffect(() => {
    let isSubscribed = true;
    const targetTmdbId = resolvedTmdbId || movie?.realTmdbId || movie?.tmdbId || movie?.id;
    if (!targetTmdbId) return;

    const mediaType = (movie?.type === 'series' || movie?.type === 'tv' || !!movie?.first_air_date) ? 'tv' : 'movie';
    fetch('/api/media/cached-streams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tmdbId: targetTmdbId,
        type: mediaType,
        season: selectedSeason,
        episode: selectedEpisode
      })
    })
      .then(r => r.json())
      .then(data => {
        if (isSubscribed && data?.success) {
          const lp = data.lastPlayedStream || null;
          if (lp) setLastPlayedStream(lp);
          if (Array.isArray(data.streams) && data.streams.length > 0) {
            console.log(`[MediaModal] Instantly loaded ${data.streams.length} saved stream(s) for ${movie?.title || movie?.name}`);
            setStreams(prev => {
              const combined = [...data.streams, ...prev];
              const seen = new Set<string>();
              const unique = combined.filter(s => {
                if (!s || (!s.url && !s.filePath && !s.magnet)) return false;
                const key = (s.url || s.filePath || s.magnet || s.name || '').toLowerCase().trim();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });
              if (lp) {
                const lpIdx = unique.findIndex(s => {
                  const urlA = (s.url || s.filePath || s.magnet || s.name || '').toLowerCase().trim();
                  const urlB = (lp.url || lp.filePath || lp.magnet || lp.name || '').toLowerCase().trim();
                  return (urlA && urlB && urlA === urlB) || (s.id && lp.id && String(s.id) === String(lp.id));
                });
                if (lpIdx > 0) {
                  const [match] = unique.splice(lpIdx, 1);
                  match.isLastPlayed = true;
                  unique.unshift(match);
                } else if (lpIdx === 0) {
                  unique[0].isLastPlayed = true;
                }
              }
              return unique;
            });
          }
        }
      })
      .catch(() => {});

    return () => { isSubscribed = false; };
  }, [movie, selectedSeason, selectedEpisode, resolvedTmdbId]);

  // Pause background prefetch queue while detail modal is open to ensure 100% top priority for user requests
  useEffect(() => {
    pausePrefetchQueue(true);
    return () => {
      pausePrefetchQueue(false);
    };
  }, []);

  useEffect(() => {
    if (!user || !movie || isHidden) return;
    const targetId = resolvedTmdbId || movie.realTmdbId || movie.tmdbId || movie.id;
    const q = query(
      collection(db, 'user_watched'),
      where('userId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(q, snapshot => {
      const docsMap: Record<string, boolean> = {};
      snapshot.docs.forEach(d => {
        const data = d.data();
        const matchesMedia = (
          String(data.mediaId) === String(targetId) || 
          String(data.mediaId) === String(movie.id) ||
          (movie.title && data.title && data.title.toLowerCase() === movie.title.toLowerCase())
        );
        if (matchesMedia && data.watched !== false) {
          if (data.type === 'tv' && data.season !== undefined && data.episode !== undefined) {
            docsMap[`s${data.season}_e${data.episode}`] = true;
          } else if (data.type === 'movie' || data.type === 'series') {
            docsMap['movie'] = true;
          }
        }
      });
      setWatchedDocs(docsMap);
    }, err => console.error("Error subscribing to user_watched status:", err));

    return () => unsubscribe();
  }, [user, movie, isHidden, resolvedTmdbId]);

  const getNextUnwatchedEpisode = (
    currentS: number,
    currentE: number,
    allSeasons: any[],
    currentEpisodes: any[],
    watchedMap: Record<string, boolean>
  ) => {
    // 1. Search remaining episodes in current season
    const currentSeasonData = allSeasons.find(s => s.season_number === currentS);
    const maxEpCurrentSeason = currentEpisodes.length > 0 && selectedSeason === currentS
      ? Math.max(...currentEpisodes.map(e => e.episode_number))
      : (currentSeasonData?.episode_count || currentE + 20);

    for (let eNum = currentE + 1; eNum <= maxEpCurrentSeason; eNum++) {
      const key = `s${currentS}_e${eNum}`;
      if (!watchedMap[key]) {
        return { season: currentS, episode: eNum };
      }
    }

    // 2. Search next seasons starting from episode 1
    const currentSeasonIdx = allSeasons.findIndex(s => s.season_number === currentS);
    if (currentSeasonIdx !== -1 && currentSeasonIdx < allSeasons.length - 1) {
      for (let sIdx = currentSeasonIdx + 1; sIdx < allSeasons.length; sIdx++) {
        const nextS = allSeasons[sIdx];
        const sNum = nextS.season_number;
        const epCount = nextS.episode_count || nextS.episodes?.length || 20;
        for (let eNum = 1; eNum <= epCount; eNum++) {
          const key = `s${sNum}_e${eNum}`;
          if (!watchedMap[key]) {
            return { season: sNum, episode: eNum };
          }
        }
      }
    }

    // 3. Fallback: if no future unwatched episode, advance to currentE + 1 if within range
    if (currentE < maxEpCurrentSeason) {
      return { season: currentS, episode: currentE + 1 };
    }

    return null;
  };

  const hasInitializedSeasonRef = useRef<Record<string, boolean>>({});

  // Auto-populate to the first unwatched season and episode ONCE when opening series modal
  useEffect(() => {
    if (!isSeries || seasons.length === 0 || isHidden || !movie) return;
    const movieIdKey = String(movie.id || movie.realTmdbId || movie.tmdbId || 'unknown');

    if (!hasInitializedSeasonRef.current[movieIdKey]) {
      hasInitializedSeasonRef.current[movieIdKey] = true;

      let targetSeason = seasons[0].season_number;
      let targetEpisode = 1;
      let foundUnwatched = false;

      for (const s of seasons) {
        const sNum = s.season_number;
        const epCount = s.episode_count || s.episodes?.length || 0;
        for (let eNum = 1; eNum <= epCount; eNum++) {
          const key = `s${sNum}_e${eNum}`;
          if (!watchedDocs[key]) {
            targetSeason = sNum;
            targetEpisode = eNum;
            foundUnwatched = true;
            break;
          }
        }
        if (foundUnwatched) break;
      }

      setSelectedSeason(targetSeason);
      setSelectedEpisode(targetEpisode);
    }
  }, [isSeries, seasons, isHidden, movie, watchedDocs]);

  const toggleWatched = async (type: 'tv' | 'movie', seasonNum?: number, episodeNum?: number) => {
    if (!user || !movie) return;
    const targetId = resolvedTmdbId || movie.realTmdbId || movie.tmdbId || movie.id;

    const docId = type === 'tv' 
      ? `${user.uid}_${targetId}_s${seasonNum}_e${episodeNum}`
      : `${user.uid}_${targetId}`;
    
    const key = type === 'tv' ? `s${seasonNum}_e${episodeNum}` : 'movie';
    const currentlyWatched = !!watchedDocs[key];
    const newWatchedState = !currentlyWatched;

    const updatedDocs = { ...watchedDocs, [key]: newWatchedState };
    setWatchedDocs(updatedDocs);

    // If marking an episode as watched, automatically advance to the next unwatched episode in the dropdown list
    if (type === 'tv' && newWatchedState && seasonNum !== undefined && episodeNum !== undefined) {
      const nextEp = getNextUnwatchedEpisode(seasonNum, episodeNum, seasons, episodes, updatedDocs);
      if (nextEp) {
        setSelectedSeason(nextEp.season);
        setSelectedEpisode(nextEp.episode);
      }
    }

    const docRef = { collectionName: 'user_watched', id: docId };

    try {
      if (newWatchedState) {
        await setDoc(docRef, {
          userId: user.uid,
          mediaId: targetId,
          title: movie.title || movie.name,
          type,
          season: seasonNum ?? null,
          episode: episodeNum ?? null,
          watched: true,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } else {
        await deleteDoc(docRef);
      }
    } catch (err) {
      console.error("Failed to update watched status:", err);
      setWatchedDocs(prev => ({ ...prev, [key]: currentlyWatched }));
    }
  };

  const isSeasonFullyWatched = (seasonNum: number): boolean => {
    const seasonObj = seasons.find(s => s.season_number === seasonNum);
    const epList = episodes.length > 0 && selectedSeason === seasonNum
      ? episodes
      : (seasonObj?.episodes || []);
    
    if (epList.length > 0) {
      return epList.every(e => !!watchedDocs[`s${seasonNum}_e${e.episode_number}`]);
    }
    
    const epCount = seasonObj?.episode_count || 0;
    if (epCount === 0) return false;
    for (let eNum = 1; eNum <= epCount; eNum++) {
      if (!watchedDocs[`s${seasonNum}_e${eNum}`]) return false;
    }
    return true;
  };

  const toggleSeasonWatched = async (seasonNum: number) => {
    if (!user || !movie) return;
    const targetId = resolvedTmdbId || movie.realTmdbId || movie.tmdbId || movie.id;
    const isFullyWatched = isSeasonFullyWatched(seasonNum);
    const targetState = !isFullyWatched;

    const seasonObj = seasons.find(s => s.season_number === seasonNum);
    const epList = episodes.length > 0 && selectedSeason === seasonNum
      ? episodes
      : (seasonObj?.episodes || []);

    let epNumbers: number[] = [];
    if (epList.length > 0) {
      epNumbers = epList.map((e: any) => e.episode_number);
    } else {
      const epCount = seasonObj?.episode_count || 24;
      epNumbers = Array.from({ length: epCount }, (_, i) => i + 1);
    }

    const updatedDocsMap = { ...watchedDocs };
    const promises: Promise<any>[] = [];

    for (const eNum of epNumbers) {
      const key = `s${seasonNum}_e${eNum}`;
      updatedDocsMap[key] = targetState;
      const docId = `${user.uid}_${targetId}_s${seasonNum}_e${eNum}`;
      const docRef = { collectionName: 'user_watched', id: docId };

      if (targetState) {
        promises.push(setDoc(docRef, {
          userId: user.uid,
          mediaId: targetId,
          title: movie.title || movie.name,
          type: 'tv',
          season: seasonNum,
          episode: eNum,
          watched: true,
          updatedAt: serverTimestamp()
        }, { merge: true }));
      } else {
        promises.push(deleteDoc(docRef));
      }
    }

    setWatchedDocs(updatedDocsMap);
    try {
      await Promise.all(promises);
    } catch (err) {
      console.error("Error toggling season watched status:", err);
    }
  };

  useEffect(() => {
    if (!user || !movie || isHidden) return;
    const targetId = resolvedTmdbId || movie.realTmdbId || movie.tmdbId || movie.id;
    const q = query(collection(db, 'user_progress'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, snapshot => {
      const docs = snapshot.docs.map(d => d.data());
      const prog = docs.find(d => 
        (String(d.mediaId) === String(targetId) || String(d.mediaId) === String(movie.id)) &&
        (isSeries ? d.season === selectedSeason && d.episode === selectedEpisode : true)
      );
      setSavedProgress(prog || null);
    });
    return () => unsubscribe();
  }, [user, movie, selectedSeason, selectedEpisode, isSeries, isHidden, resolvedTmdbId]);

  useEffect(() => {
    if (streams.length > 0) {
      const idxNum = Number(selectedStreamId);
      if (selectedStreamId === null || isNaN(idxNum) || idxNum < 0 || idxNum >= streams.length) {
        setSelectedStreamId('0');
      }
    } else {
      setSelectedStreamId(null);
    }
  }, [streams]);
  const currentMovieKey = movie
    ? `${movie.id || ''}_${movie.tmdbId || ''}_${movie.realTmdbId || ''}_${movie.title || movie.name || ''}`
    : null;
  const [prevMovieKey, setPrevMovieKey] = useState<string | null>(null);

  if (currentMovieKey !== prevMovieKey) {
    setPrevMovieKey(currentMovieKey);
    setStreams([]);
    setSelectedStreamId(null);
    setSelectedSeason(null);
    setSelectedEpisode(null);
    setSeasons([]);
    setEpisodes([]);
    setDynamicLogoUrl('');
    setDynamicOverview('');
    setExtraDetails(null);
    setResolvedTmdbId(null);
    setMpaaRating('');
    setSavedProgress(null);
    setResumePromptStream(null);
    setDevSkipSegments([]);
    setDevChapters([]);
    setDevSelectedStreamUrl('');
    setLastPlayedStream(null);
  }
  const [seriesDetailsLoading, setSeriesDetailsLoading] = useState(false);
  const [pollingActive, setPollingActive] = useState(false);

  // Fix Match Modal State
  const [showFixMatchModal, setShowFixMatchModal] = useState(false);
  const [fixMatchQuery, setFixMatchQuery] = useState('');
  const [fixMatchResults, setFixMatchResults] = useState<any[]>([]);
  const [fixMatchSearching, setFixMatchSearching] = useState(false);
  const [fixMatchSaving, setFixMatchSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!showFixMatchModal) {
      SpatialNavigation.remove('fix-match-modal');
      return;
    }

    const handleFixMatchBackKey = (e: KeyboardEvent) => {
      const isBackKey = [
        'Escape', 'Back', 'GoBack', 'BrowserBack', 'U+001B', 'SoftLeft'
      ].includes(e.key) || [4, 27, 8, 10009, 461, 283].includes(e.keyCode) ||
      (e.key === 'Backspace' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA');

      if (isBackKey) {
        e.preventDefault();
        e.stopPropagation();
        setShowFixMatchModal(false);
      }
    };

    window.addEventListener('keydown', handleFixMatchBackKey, true);

    SpatialNavigation.add('fix-match-modal', {
      selector: '#fix-match-modal .focusable, #fix-match-modal button, #fix-match-modal input',
      restrict: 'self-only',
      straightOnly: false,
      enterTo: 'last-focused'
    });
    SpatialNavigation.makeFocusable('fix-match-modal');
    SpatialNavigation.focus('fix-match-modal');

    return () => {
      window.removeEventListener('keydown', handleFixMatchBackKey, true);
      SpatialNavigation.remove('fix-match-modal');
    };
  }, [showFixMatchModal]);

  // Skip Info Modal State
  const [showSkipInfoModal, setShowSkipInfoModal] = useState(false);

  useEffect(() => {
    if (!showSkipInfoModal) {
      SpatialNavigation.remove('skip-info-modal');
      return;
    }

    const handleSkipInfoBackKey = (e: KeyboardEvent) => {
      const isBackKey = [
        'Escape', 'Back', 'GoBack', 'BrowserBack', 'U+001B', 'SoftLeft'
      ].includes(e.key) || [4, 27, 8, 10009, 461, 283].includes(e.keyCode) ||
      (e.key === 'Backspace' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA');

      if (isBackKey) {
        e.preventDefault();
        e.stopPropagation();
        setShowSkipInfoModal(false);
      }
    };

    window.addEventListener('keydown', handleSkipInfoBackKey, true);

    SpatialNavigation.add('skip-info-modal', {
      selector: '#skip-info-modal .focusable, #skip-info-modal button',
      restrict: 'self-only',
      straightOnly: false,
      enterTo: 'last-focused'
    });
    SpatialNavigation.makeFocusable('skip-info-modal');
    SpatialNavigation.focus('skip-info-modal');

    return () => {
      window.removeEventListener('keydown', handleSkipInfoBackKey, true);
      SpatialNavigation.remove('skip-info-modal');
    };
  }, [showSkipInfoModal]);

  const getActiveSkipSegments = () => {
    let segs: any[] = [];
    if (isSeries && selectedSeason !== null && selectedEpisode !== null) {
      segs = (extraDetails as any)?.seasons?.[selectedSeason]?.[selectedEpisode] || (extraDetails as any)?.skipSegments || [];
    } else {
      segs = (extraDetails as any)?.skipSegments || [];
    }
    return Array.isArray(segs) ? segs : [];
  };

  useEffect(() => {
    const activeSegs = getActiveSkipSegments();
    if (activeSegs && activeSegs.length > 0) {
      setDevSkipSegments(activeSegs.map(s => ({
        type: s.type || 'intro',
        start: s.start || 0,
        end: s.end || 0,
        label: s.label || 'Skip'
      })));
    } else {
      setDevSkipSegments([]);
    }

    if (extraDetails?.chapters && Array.isArray(extraDetails.chapters) && extraDetails.chapters.length > 0) {
      setDevChapters(extraDetails.chapters);
    } else {
      setDevChapters([]);
    }
  }, [extraDetails, selectedSeason, selectedEpisode]);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token') || localStorage.getItem('authToken') || (user as any)?.token || '';
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
  };

  const handleDevScanSkipSegments = async () => {
    try {
      setDevScanningSkip(true);
      const targetStream = devSelectedStreamUrl || availableStreams[0]?.url || movie.filePath || '';
      const isLocalPath = targetStream && !targetStream.startsWith('http://') && !targetStream.startsWith('https://') && !targetStream.startsWith('/api/');
      const res = await fetch('/api/admin/scan-skip-segments', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          tmdbId: movie.id,
          mediaType: isSeries ? 'tv' : 'movie',
          season: selectedSeason,
          episode: selectedEpisode,
          filePath: isLocalPath ? targetStream : movie.filePath,
          streamUrl: isLocalPath ? '' : targetStream
        })
      }).then(r => r.json());

      if (res?.success && Array.isArray(res.segments)) {
        setDevSkipSegments(res.segments);
      } else {
        alert(res?.error || 'Failed to scan skip segments.');
      }
    } catch (e: any) {
      console.error('Scan skip segments error:', e);
      alert('Error scanning skip segments.');
    } finally {
      setDevScanningSkip(false);
    }
  };

  const handleDevSubmitTidb = async () => {
    try {
      setDevSubmittingTidb(true);
      const res = await fetch('/api/admin/submit-tidb-segments', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          tmdbId: movie.id,
          imdbId: extraDetails?.imdbId,
          mediaType: isSeries ? 'tv' : 'movie',
          season: selectedSeason,
          episode: selectedEpisode,
          segments: devSkipSegments
        })
      }).then(r => r.json());

      if (res?.success) {
        alert(res.message || 'Successfully submitted segments!');
      } else {
        alert(res?.error || 'Failed to submit segments to TIDB.');
      }
    } catch (e: any) {
      console.error('Submit TIDB error:', e);
      alert('Error submitting segments to TIDB.');
    } finally {
      setDevSubmittingTidb(false);
    }
  };

  const handleDevScanChapters = async () => {
    try {
      setDevScanningChapters(true);
      const targetStream = devSelectedStreamUrl || availableStreams[0]?.url || movie.filePath || '';
      const isLocalPath = targetStream && !targetStream.startsWith('http://') && !targetStream.startsWith('https://') && !targetStream.startsWith('/api/');
      const res = await fetch('/api/admin/scan-chapters', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          tmdbId: movie.id,
          mediaType: isSeries ? 'tv' : 'movie',
          filePath: isLocalPath ? targetStream : movie.filePath,
          streamUrl: isLocalPath ? '' : targetStream,
          title: movie.title || movie.name,
          year: movie.year
        })
      }).then(r => r.json());

      if (res?.success && Array.isArray(res.chapters)) {
        setDevChapters(res.chapters);
      } else {
        alert(res?.error || 'Failed to scan chapters.');
      }
    } catch (e: any) {
      console.error('Scan chapters error:', e);
      alert('Error scanning chapters.');
    } finally {
      setDevScanningChapters(false);
    }
  };

  const handleDevSaveChapters = async () => {
    try {
      setDevSavingChapters(true);
      const res = await fetch('/api/chapters/save', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          tmdbId: movie.id,
          mediaType: isSeries ? 'tv' : 'movie',
          chapters: devChapters
        })
      }).then(r => r.json());

      if (res?.success) {
        alert(res.message || 'Chapters saved to Media Cache!');
      } else {
        alert(res?.error || 'Failed to save chapters.');
      }
    } catch (e: any) {
      console.error('Save chapters error:', e);
      alert('Error saving chapters.');
    } finally {
      setDevSavingChapters(false);
    }
  };

  const handleTestPlayDevTimestamp = (startTime: number) => {
    const streamToPlay = (streams && streams.length > 0) ? (streams[0]?.url || streams[0]?.magnet) : (movie?.filePath || movie?.url);
    if (!streamToPlay) {
      alert('Please search or load streams first to test play.');
      return;
    }
    const posterOrLogo = movie?.poster || movie?.backupPoster || undefined;
    const isHevcMatch = /hevc|x265|h265|10bit|2160p|4k|hdr|remux/i.test(streamToPlay || movie?.filePath || movie?.title || movie?.name || '');
    const context = { type: isSeries ? 'tv' : 'movie', id: movie.id, season: selectedSeason, episode: selectedEpisode, isHevc: isHevcMatch };
    onPlay(streamToPlay, posterOrLogo, startTime, context);
  };

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
            const posterUrl = getCachedImageUrl(imgPath) || '';
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
    let isActive = true;
    if (movie) {
      if (isSeries) {
        setSeriesDetailsLoading(true);
        
        (async () => {
          let targetTmdbId = resolvedTmdbId || movie.realTmdbId || movie.tmdbId;
          const isLocalId = typeof movie.id === 'string' && movie.id.startsWith('local_');

          if (typeof targetTmdbId === 'string' && targetTmdbId.startsWith('local_')) {
            targetTmdbId = null;
          }

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
          if (!isActive) return;

          const initialData: any[] = [];

          if (movie.isNetworkShare || movie.streamUrl || movie.filePath) {
            const locUrl = movie.streamUrl || `/api/local-media/stream?path=${encodeURIComponent(movie.filePath)}`;
            const locPath = movie.filePath || movie.title || movie.name || '';
            const is4k = /4k|2160p|2160|uhd|ultra\s*hd/i.test(locPath);
            const is720 = /720p|720|sd|480p/i.test(locPath);
            initialData.unshift({
              name: `⚡ Local Network Share: ${movie.title || movie.name}`,
              title: movie.title || movie.name,
              fullDescription: `Direct Local Playback (${movie.filePath || 'Local Storage'})`,
              quality: is4k ? '4K' : (is720 ? '720p' : '1080p'),
              sizeStr: 'Local Storage',
              type: 'local',
              url: locUrl,
              isCached: true,
              availability: 'Instant Direct Stream'
            });
          }

          const getStreamPriorityRank = (s: any): number => {
            if (s.type === 'premiumize_cloud' || s.inPersonalCloud) return 0; // 0. Premiumize Cloud (Top Priority!)
            if (s.type === 'local') return 1;            // 1. Network Share
            if (s.type === 'iptv') return 2;             // 2. IPTV Provider
            if (s.isPremiumize) return 3;                // 3. Premiumize Instant Streams
            if (s.isCached) return 3;                    // 3. Cached Streams
            return 4;                                    // 4. Torrent Search
          };

          let allowedRes = userSettings?.resolutions || ['4K', '1080p', '720p'];
          const isSameStream = (a: any, b: any) => {
            if (!a || !b) return false;
            const urlA = (a.url || a.filePath || a.magnet || a.name || '').toLowerCase().trim();
            const urlB = (b.url || b.filePath || b.magnet || b.name || '').toLowerCase().trim();
            if (urlA && urlB && urlA === urlB) return true;
            if (a.id && b.id && String(a.id) === String(b.id)) return true;
            if (a.hash && b.hash && a.hash.toLowerCase() === b.hash.toLowerCase()) return true;
            return false;
          };

          const applyFiltersAndSort = (streams: any[], lpOverride?: any) => {
              const seenIdentifiers = new Set<string>();
              const uniqueStreams = streams.filter(s => {
                if (!s) return false;
                const rawId = s.url || s.magnet || s.hash || s.name || '';
                if (!rawId) return false;
                let normId = rawId.toLowerCase().trim();
                try {
                  normId = decodeURIComponent(rawId).toLowerCase().trim();
                } catch (e) {}
                if (seenIdentifiers.has(normId)) return false;
                seenIdentifiers.add(normId);
                return true;
              });

              const filtered = uniqueStreams.filter(s => {
                  if (s.type === 'local' || s.type === 'iptv' || s.type === 'premiumize_cloud' || s.inPersonalCloud) return true;
                  const desc = (s.name || '') + ' ' + (s.fullDescription || '');
                  if (desc.includes('4K') || desc.includes('2160p')) return allowedRes.includes('4K');
                  if (desc.includes('1080p')) return allowedRes.includes('1080p');
                  if (desc.includes('720p')) return allowedRes.includes('720p');
                  return true;
              });
              const sorted = filtered.sort((a, b) => {
                  const rankA = getStreamPriorityRank(a);
                  const rankB = getStreamPriorityRank(b);
                  if (rankA !== rankB) return rankA - rankB;
                  return (b.seeds || 0) - (a.seeds || 0);
              });

              const targetLP = lpOverride || lastPlayedStream;
              if (targetLP) {
                const lpIdx = sorted.findIndex(s => isSameStream(s, targetLP));
                if (lpIdx > 0) {
                  const [match] = sorted.splice(lpIdx, 1);
                  match.isLastPlayed = true;
                  sorted.unshift(match);
                } else if (lpIdx === 0) {
                  sorted[0].isLastPlayed = true;
                }
              }

              return sorted;
          };



          if (initialData.length > 0) {
              setStreams(applyFiltersAndSort(initialData));
          }

          const movieYear = movie.year || (movie.release_date ? movie.release_date.split('-')[0] : '');
          const iptvPromise = fetch(`/api/iptv/vod/search?title=${encodeURIComponent(movie.title || movie.name)}&type=movie${movieYear ? `&year=${encodeURIComponent(movieYear)}` : ''}`)
            .then(r => r.json())
            .catch(() => null);
          const localMediaPromise = fetch(`/api/local-media/search?title=${encodeURIComponent(movie.title || movie.name)}&type=movie${movieYear ? `&year=${encodeURIComponent(movieYear)}` : ''}`)
            .then(r => r.json())
            .catch(() => null);

          const pmKey = systemSettings.premiumizeApiKey || localStorage.getItem('premiumizeApiKey');
          const pmCloudPromise = fetch('/api/premiumize/cloud/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(pmKey ? { Authorization: `Bearer ${pmKey}` } : {})
            },
            body: JSON.stringify({ title: movie.title || movie.name, year: movieYear, refresh: true })
          }).then(r => r.json()).catch(() => null);

          const torrentSearchPromise = movie.type === 'music'
            ? fetchStreamsForMusic(movie.title || movie.name, movie.artist, movie.album)
            : fetchStreamsForMovie(movie.title || movie.name, movie.year, extraDetails?.imdbId || undefined);

          Promise.all([
            torrentSearchPromise,
            iptvPromise,
            localMediaPromise,
            pmCloudPromise
          ]).then(async ([data, iptvRes, localRes, pmCloudRes]) => {
              if (!isActive) return;
              
              const updatedData = [...initialData];

              if (pmCloudRes?.success && Array.isArray(pmCloudRes.data)) {
                pmCloudRes.data.forEach((pmStream: any) => {
                  updatedData.unshift(pmStream);
                });
              }

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
                  updatedData.push({ ...stream });
              });

              const pmKey = systemSettings.premiumizeApiKey || localStorage.getItem('premiumizeApiKey');
              if (pmKey) {
                const torrentHashes = Array.from(new Set(
                  updatedData
                    .filter((s: any) => s.type === 'torrent' && s.hash)
                    .map((s: any) => s.hash.toLowerCase())
                ));
                if (torrentHashes.length > 0) {
                  try {
                    const pmRes = await fetch('/api/premiumize/cache/check', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pmKey}` },
                      body: JSON.stringify({ hashes: torrentHashes })
                    });
                    if (pmRes.ok) {
                      const pmData = await pmRes.json();
                      const responseArr = pmData.response || [];
                      const cachedSet = new Set<string>();
                      torrentHashes.forEach((h, idx) => {
                        if (responseArr[idx] === true) {
                          cachedSet.add(h.toLowerCase());
                        }
                      });
                      updatedData.forEach((s: any) => {
                        if (s.type === 'torrent' && s.hash && cachedSet.has(s.hash.toLowerCase())) {
                          s.isPremiumize = true;
                          s.isCached = true;
                          s.availability = 'Cached (Premiumize ⚡)';
                        }
                      });
                    }
                  } catch (e) {}
                }
              }

              const hasActive = updatedData.some((s: any) => s.isAdding || (s.downloadProgress !== undefined && s.downloadProgress < 100));
              const finalFilteredMovieStreams = applyFiltersAndSort(updatedData);
              setStreams(finalFilteredMovieStreams);
              savePersistedStreams(finalFilteredMovieStreams);
              setLoading(false);
              setPollingActive(hasActive);
          });
        })();


      }
    }
    return () => { isActive = false; };
  }, [movie, isSeries, userSettings, resolvedTmdbId]);

  // Load TV Season Details (Episodes list) when selectedSeason changes
  useEffect(() => {
    let isActive = true;
    if (isSeries && selectedSeason !== null && movie) {
      // Clear the old season's episodes immediately so stale data isn't shown
      // while the async TMDB fetch for the new season is in flight.
      setEpisodes([]);

      (async () => {
        let targetTmdbId = resolvedTmdbId || movie.realTmdbId || movie.tmdbId;
        
        if (typeof targetTmdbId === 'string' && targetTmdbId.startsWith('local_')) {
            targetTmdbId = null;
        }

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
              const matchedSeason = epRes.seasons.find((s: any) => s.season_number === selectedSeason);
              if (matchedSeason && Array.isArray(matchedSeason.episodes)) {
                localEpisodes = matchedSeason.episodes;
              }
            }
          } catch (e) {}
        }

        if (!isActive) return;

        const epMap = new Map<number, any>();
        tmdbEpisodes.forEach(e => {
          epMap.set(e.episode_number, {
            ...e,
            name: e.name || e.title || `Episode ${e.episode_number}`
          });
        });
        localEpisodes.forEach(e => {
          if (!tmdbEpisodes || tmdbEpisodes.length === 0) {
            // Only add local files as new standalone episode entries if TMDB returned no episodes
            if (!epMap.has(e.episode_number)) {
              epMap.set(e.episode_number, e);
            }
          } else if (epMap.has(e.episode_number)) {
            // Merge local stream URL into existing official TMDB episode object while preserving official episode name!
            const existing = epMap.get(e.episode_number)!;
            existing.streamUrl = e.streamUrl;
            existing.filePath = e.filePath;
            if (!existing.name || existing.name === `Episode ${e.episode_number}`) {
              if (e.name && e.name !== `Episode ${e.episode_number}`) {
                existing.name = e.name;
              }
            }
          }
        });

        const finalEpisodes = Array.from(epMap.values()).sort((a, b) => a.episode_number - b.episode_number);
        setEpisodes(finalEpisodes);

        // Always reset to episode 1 of the new season — never carry over the
        // episode number from another season, since different seasons have
        // different episode counts and this caused ghost episodes to appear.
        if (finalEpisodes.length > 0) {
          if (selectedEpisode === null || !finalEpisodes.some(e => e.episode_number === selectedEpisode)) {
            setSelectedEpisode(finalEpisodes[0].episode_number);
          }
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

      const currentEp = episodes.find(e => e.episode_number === selectedEpisode);
      const initialData: any[] = [];
      const localPath = currentEp?.filePath || null;
      const localStreamUrl = currentEp?.streamUrl || (localPath ? `/api/local-media/stream?path=${encodeURIComponent(localPath)}` : null);

      if (localStreamUrl) {
        const locUrl = localStreamUrl || (localPath ? `/api/local-media/stream?path=${encodeURIComponent(localPath)}` : null);
        if (locUrl) {
          const locStr = (localPath || '') + ' ' + (movie.title || '');
          const is4k = /4k|2160p|2160|uhd|ultra\s*hd/i.test(locStr);
          const is720 = /720p|720|sd|480p/i.test(locStr);
          initialData.unshift({
            id: `local_ep_${selectedSeason}_${selectedEpisode}`,
            name: `⚡ Local Network Share: ${movie.title || movie.name} S${String(selectedSeason).padStart(2, '0')}E${String(selectedEpisode).padStart(2, '0')}`,
            title: `${movie.title || movie.name} S${String(selectedSeason).padStart(2, '0')}E${String(selectedEpisode).padStart(2, '0')}`,
            fullDescription: `Direct Local Playback (${localPath || 'Local Storage'})`,
            quality: is4k ? '4K' : (is720 ? '720p' : '1080p'),
            sizeStr: 'Local Storage',
            type: 'local',
            url: locUrl,
            isCached: true,
            availability: 'Instant Direct Stream'
          });
        }
      }

      let allowedRes = userSettings?.resolutions || ['4K', '1080p', '720p'];
      const getStreamPriorityRank = (s: any): number => {
        if (s.type === 'premiumize_cloud' || s.inPersonalCloud) return 0; // 0. Premiumize Cloud (Top Priority!)
        if (s.type === 'local') return 1;         // 1. Network Share
        if (s.type === 'iptv') return 2;          // 2. IPTV Provider
        if (s.isPremiumize) return 3;             // 3. Premiumize Instant Streams
        if (s.isCached) return 3;                 // 3. Cached Streams
        return 4;                                 // 4. Torrent Search
      };

      const filterAndSortTvStreams = (streamsToFilter: any[], lpOverride?: any) => {
        const seenUrls = new Set<string>();
        const uniqueData = streamsToFilter.filter((s: any) => {
          if (!s || !s.url) return false;
          let normUrl = (s.url || '').toLowerCase().trim();
          try {
            normUrl = decodeURIComponent(s.url).toLowerCase().trim();
          } catch (e) {}
          if (seenUrls.has(normUrl)) return false;
          seenUrls.add(normUrl);
          return true;
        });

        let filteredData = uniqueData.filter((s: any) => {
          if (s.type === 'local') return true;
          const desc = (s.name || '') + ' ' + (s.fullDescription || '');
          if (desc.includes('4K') || desc.includes('2160p')) return allowedRes.includes('4K');
          if (desc.includes('1080p')) return allowedRes.includes('1080p');
          if (desc.includes('720p')) return allowedRes.includes('720p');
          return true;
        });

        const sorted = filteredData.sort((a: any, b: any) => {
          const rankA = getStreamPriorityRank(a);
          const rankB = getStreamPriorityRank(b);
          if (rankA !== rankB) return rankA - rankB;
          return (b.seeds || 0) - (a.seeds || 0);
        });

        const targetLP = lpOverride || lastPlayedStream;
        if (targetLP) {
          const lpIdx = sorted.findIndex((s: any) => {
            const urlA = (s.url || s.filePath || s.magnet || s.name || '').toLowerCase().trim();
            const urlB = (targetLP.url || targetLP.filePath || targetLP.magnet || targetLP.name || '').toLowerCase().trim();
            return (urlA && urlB && urlA === urlB) || (s.id && targetLP.id && String(s.id) === String(targetLP.id));
          });
          if (lpIdx > 0) {
            const [match] = sorted.splice(lpIdx, 1);
            match.isLastPlayed = true;
            sorted.unshift(match);
          } else if (lpIdx === 0) {
            sorted[0].isLastPlayed = true;
          }
        }

        return sorted;
      };

      if (initialData.length > 0) {
        setStreams(filterAndSortTvStreams(initialData));
      }

      if (currentEp?.air_date && isFutureAirDate(currentEp.air_date)) {
        console.log(`[Episode Streams] Skipping stream searches for S${selectedSeason}E${selectedEpisode} - episode air date (${currentEp.air_date}) is in the future.`);
        setLoading(false);
        return;
      }

      const seriesYear = movie.year || (movie.first_air_date ? movie.first_air_date.split('-')[0] : '');
      const iptvPromise = fetch(`/api/iptv/vod/search?title=${encodeURIComponent(movie.title || movie.name)}&type=series&season=${selectedSeason}&episode=${selectedEpisode}${seriesYear ? `&year=${encodeURIComponent(seriesYear)}` : ''}`)
        .then(r => r.json())
        .catch(() => null);

      const localMediaPromise = fetch(`/api/local-media/search?title=${encodeURIComponent(movie.title || movie.name)}&type=series&season=${selectedSeason}&episode=${selectedEpisode}`)
        .then(r => r.json())
        .catch(() => null);

      const pmKey = systemSettings.premiumizeApiKey || localStorage.getItem('premiumizeApiKey');
      const pmCloudPromise = fetch('/api/premiumize/cloud/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(pmKey ? { Authorization: `Bearer ${pmKey}` } : {})
        },
        body: JSON.stringify({ title: movie.title || movie.name, season: selectedSeason, episode: selectedEpisode, year: seriesYear, refresh: true })
      }).then(r => r.json()).catch(() => null);

      setLoading(false);

      let aggregatedStreams: any[] = [...initialData];
      
      const updateProgressiveStreams = (newStreams: any[]) => {
        if (!isActive || !Array.isArray(newStreams) || newStreams.length === 0) return;
        aggregatedStreams = [...aggregatedStreams, ...newStreams];
        const filteredData = filterAndSortTvStreams(aggregatedStreams);
        setStreams(filteredData);
        savePersistedStreams(filteredData);

        const pmKey = systemSettings.premiumizeApiKey || localStorage.getItem('premiumizeApiKey');
        if (pmKey) {
          const torrentHashes = Array.from(new Set(
            filteredData
              .filter((s: any) => s.type === 'torrent' && s.hash && !s.isPremiumizeChecked)
              .map((s: any) => s.hash.toLowerCase())
          ));
          if (torrentHashes.length > 0) {
            fetch('/api/premiumize/cache/check', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pmKey}` },
              body: JSON.stringify({ hashes: torrentHashes })
            }).then(r => r.ok ? r.json() : null).then(pmData => {
              if (!isActive || !pmData?.response) return;
              const responseArr = pmData.response || [];
              const cachedSet = new Set<string>();
              torrentHashes.forEach((h, idx) => {
                if (responseArr[idx] === true) {
                  cachedSet.add(h.toLowerCase());
                }
              });
              filteredData.forEach((s: any) => {
                if (s.type === 'torrent' && s.hash) {
                  s.isPremiumizeChecked = true;
                  if (cachedSet.has(s.hash.toLowerCase())) {
                    s.isPremiumize = true;
                    s.isCached = true;
                    s.availability = 'Cached (Premiumize ⚡)';
                  }
                }
              });
              const finalTvCheckStreams = filterAndSortTvStreams([...filteredData]);
              setStreams(finalTvCheckStreams);
              savePersistedStreams(finalTvCheckStreams);
            }).catch(() => {});
          }
        }
      };

      // 1. Local media streams (Instant <10ms)
      localMediaPromise.then(localRes => {
        if (localRes?.success && Array.isArray(localRes.data)) {
          updateProgressiveStreams(localRes.data);
        }
      });

      // 2. Personal Cloud streams
      pmCloudPromise.then(pmCloudRes => {
        if (pmCloudRes?.success && Array.isArray(pmCloudRes.data)) {
          updateProgressiveStreams(pmCloudRes.data);
        }
      });

      // 3. IPTV VOD streams
      iptvPromise.then(iptvRes => {
        if (iptvRes?.success && Array.isArray(iptvRes.data)) {
          updateProgressiveStreams(iptvRes.data);
        }
      });

      // 4. Torrent indexer search streams
      fetchStreamsForTvSeries(movie.title || movie.name, selectedSeason, selectedEpisode, extraDetails?.imdbId || undefined)
        .then(tData => {
          if (Array.isArray(tData)) {
            updateProgressiveStreams(tData);
          }
        });


        if (user && movie) {
            const q = query(collection(db, 'favorites'), where('userId', '==', user.uid), where('tmdbId', '==', movie.id));
            getDocs(q).then(snapshot => {
                if (snapshot.docs.length > 0) {
                    const bestStream = aggregatedStreams.length > 0 ? aggregatedStreams[0] : null;
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
        const targetId = resolvedTmdbId || (typeof movie.id === 'number' ? movie.id : (movie.realTmdbId ? Number(movie.realTmdbId) : movie.id));
        const q = query(collection(db, 'favorites'), where('userId', '==', user.uid));
        const snapshot = await getDocs(q);

        const normMovieTitle = (movie.title || movie.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        const matchedDoc = snapshot.docs.find((d: any) => {
          const data = d.data();
          if (targetId && data.tmdbId && String(data.tmdbId) === String(targetId)) return true;
          if (movie.id && data.tmdbId && String(data.tmdbId) === String(movie.id)) return true;
          const dataTitleNorm = (data.title || data.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return normMovieTitle && dataTitleNorm && normMovieTitle === dataTitleNorm;
        });

        if (matchedDoc) {
          setIsFavorite(true);
          setFavoriteId(matchedDoc.id);
        } else {
          setIsFavorite(false);
          setFavoriteId(null);
        }
      } catch (err) {
        console.error('Error checking favorite:', err);
      }
    }
    checkFavorite();
  }, [movie, user, resolvedTmdbId]);

  const toggleFavorite = async () => {
    if (!user) {
      alert("Please login to save to library");
      return;
    }
    if (!movie) return;

    setFavoriteLoading(true);
    try {
      const q = query(collection(db, 'favorites'), where('userId', '==', user.uid));
      const snapshot = await getDocs(q);
      const targetId = resolvedTmdbId || (typeof movie.id === 'number' ? movie.id : (movie.realTmdbId ? Number(movie.realTmdbId) : movie.id));
      const normMovieTitle = (movie.title || movie.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      const existingDocs = snapshot.docs.filter((d: any) => {
        const data = d.data();
        if (targetId && data.tmdbId && String(data.tmdbId) === String(targetId)) return true;
        if (movie.id && data.tmdbId && String(data.tmdbId) === String(movie.id)) return true;
        const dataTitleNorm = (data.title || data.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return normMovieTitle && dataTitleNorm && normMovieTitle === dataTitleNorm;
      });

      if (isFavorite || existingDocs.length > 0) {
        // Delete all matching instances to eliminate any existing duplicates
        for (const docItem of existingDocs) {
          await deleteDoc(doc(db, 'favorites', docItem.id));
        }
        if (favoriteId && !existingDocs.some(d => d.id === favoriteId)) {
          await deleteDoc(doc(db, 'favorites', favoriteId)).catch(() => null);
        }
        setIsFavorite(false);
        setFavoriteId(null);
      } else {
        const type = movie.type || (movie.first_air_date ? 'series' : 'movie');
        const bestStream = streams.length > 0 ? streams[0] : null;

        const docRef = await addDoc(collection(db, 'favorites'), {
          userId: user.uid,
          tmdbId: targetId,
          type: type,
          title: movie.title || movie.name,
          poster: movie.poster || movie.backupPoster || null,
          year: movie.year || (movie.release_date ? movie.release_date.split('-')[0] : null),
          rating: movie.rating || null,
          resolution: movie.resolution || null,
          overview: movie.overview || '',
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

  const handleStreamClick = async (stream: any) => {
    if (!stream) return;
    if (stream.isAdding) return;
    if (stream.downloadProgress !== undefined && stream.downloadProgress < 100) return;

    const pmKey = systemSettings.premiumizeApiKey || localStorage.getItem('premiumizeApiKey');
    const targetUrl = stream.url || stream.magnet || '';
    const isMagnet = targetUrl.startsWith('magnet:');

    if (!isMagnet && (stream.type === 'local' || stream.type === 'iptv' || stream.type === 'premiumize_cloud' || stream.inPersonalCloud)) {
      triggerPlay(stream.url, stream);
      return;
    }

    if (isMagnet || stream.type === 'torrent') {
      if (!pmKey) {
        alert("Please configure your Premiumize API Key in Settings to stream torrent magnet links.");
        return;
      }

      const isSameStream = (a: any, b: any) => {
        if (!a || !b) return false;
        if (a.id && b.id) return a.id === b.id;
        if (a.hash && b.hash) return a.hash.toLowerCase() === b.hash.toLowerCase();
        if (a.url && b.url) return a.url === b.url;
        return false;
      };

      // Handle Premiumize resolution & instant playback for all torrents
      setStreams(prev => prev.map(s => isSameStream(s, stream) ? { ...s, isAdding: true } : s));
      try {
        const magnetLink = targetUrl || (stream.hash ? `magnet:?xt=urn:btih:${stream.hash}` : '');
        const pmRes = await fetch('/api/premiumize/transfer/directdl', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${pmKey}`
          },
          body: JSON.stringify({ magnet: magnetLink })
        });
        
        const contentType = pmRes.headers.get('content-type') || '';
        let pmData: any = {};
        if (contentType.includes('application/json')) {
          pmData = await pmRes.json();
        } else {
          const errTxt = await pmRes.text();
          console.error("Non-JSON Premiumize response:", errTxt);
          pmData = { error: `Server error (${pmRes.status}). Please check Premiumize API Key in Settings.` };
        }

        if (pmData.success && pmData.streamUrl) {
          setStreams(prev => prev.map(s => isSameStream(s, stream) ? { ...s, isAdding: false, isPremiumize: true, inPersonalCloud: true } : s));
          triggerPlay(pmData.streamUrl, { ...stream, isPremiumize: true, inPersonalCloud: true });
          if (!isFavorite) { toggleFavorite(); }
          return;
        } else {
          alert("Premiumize Error: " + (pmData.message || pmData.error || "Could not resolve stream URL from magnet link. Ensure item is cached in Premiumize."));
        }
      } catch (err: any) {
        console.error("Failed to resolve stream on Premiumize:", err);
        alert("Failed to resolve stream on Premiumize: " + (err.message || err));
      } finally {
        setStreams(prev => prev.map(s => isSameStream(s, stream) ? { ...s, isAdding: false } : s));
      }
      return;
    }

    if (stream.url && !isMagnet) {
      triggerPlay(stream.url, stream);
    }
  };

  const getSkipBadgeText = () => {
    let segs: any[] = [];
    if (isSeries && selectedSeason !== null && selectedEpisode !== null) {
      segs = (extraDetails as any)?.seasons?.[selectedSeason]?.[selectedEpisode] || (extraDetails as any)?.skipSegments || [];
    } else {
      segs = (extraDetails as any)?.skipSegments || [];
    }
    if (!Array.isArray(segs) || segs.length === 0) return null;
    const labels = Array.from(new Set(segs.map((s: any) => s.label || (s.type === 'credits' ? 'Skip Credits' : 'Skip Intro'))));
    return labels.join(' & ');
  };

  return (
    <div id="media-modal" className={`fixed inset-0 z-50 flex items-center justify-center bg-[#0c0c12] animate-fadeIn ${isHidden ? 'hidden' : ''}`}>
      {/* Full-Screen TMDB Backdrop Image overlay with glassmorphic transparency */}
      {(movie.backdrop || movie.poster || movie.backupPoster) && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <img 
            src={movie.backdrop || movie.poster || movie.backupPoster} 
            alt="" 
            className="w-full h-full object-cover opacity-30 blur-lg scale-105 transition-all duration-700" 
            referrerPolicy="no-referrer" 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c12]/90 via-[#0c0c12]/70 to-[#0c0c12]/60"></div>
        </div>
      )}

      <div inert={resumePromptStream ? true : undefined} className="relative z-10 bg-[#0c0c12]/75 backdrop-blur-2xl border-0 rounded-none w-full h-full overflow-hidden flex flex-col">
        <div className="relative h-32 sm:h-40 md:h-48 shrink-0">
            {movie.poster && <img src={movie.poster} className="w-full h-full object-cover opacity-30 blur-sm" referrerPolicy="no-referrer" />}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c12]/90 via-[#0c0c12]/40 to-transparent"></div>
            <button 
              type="button" 
              onClick={onClose} 
              className="focusable absolute top-4 right-4 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500" 
              title="Close"
            >
                <X className="w-5 h-5" />
            </button>
            <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {dynamicLogoUrl ? (
                    <img 
                      src={dynamicLogoUrl} 
                      alt={movie.title || movie.name} 
                      className="h-12 sm:h-16 md:h-20 w-auto object-contain max-w-[80%] mb-2 filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <h2 className="text-3xl sm:text-4xl font-light tracking-tight text-white mb-2 truncate">{movie.title}</h2>
                  )}
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
                      {getSkipBadgeText() && (
                        <button 
                          type="button"
                          onClick={() => setShowSkipInfoModal(true)}
                          className="focusable flex items-center gap-1.5 px-2.5 py-1 border border-indigo-500/50 rounded-lg text-[11px] font-bold text-indigo-300 font-mono leading-none tracking-wide uppercase bg-indigo-950/60 hover:bg-indigo-900/80 hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all cursor-pointer shadow-md shadow-indigo-950/40 group/badge"
                          title="Click to view exact skip timestamps"
                        >
                          <Zap className="w-3.5 h-3.5 text-indigo-400 fill-indigo-400/20 animate-pulse group-hover/badge:scale-110" />
                          <span>TheIntroDB ({getSkipBadgeText()})</span>
                          <Info className="w-3 h-3 text-indigo-300/70 ml-0.5" />
                        </button>
                      )}
                      {(isFavorite || movie.isNetworkShare || movie.filePath) && (
                        <span className="flex items-center gap-1 px-2 py-0.5 border border-emerald-500/40 rounded text-[11px] font-bold text-emerald-400 font-mono leading-none tracking-wide uppercase bg-emerald-950/40">
                          <BookmarkCheck className="w-3 h-3 text-emerald-400" /> In Library
                        </span>
                      )}
                      {!isSeries && watchedDocs['movie'] && (
                        <span className="flex items-center gap-1 px-2 py-0.5 border border-emerald-500/40 rounded text-[11px] font-bold text-emerald-400 font-mono leading-none tracking-wide uppercase bg-emerald-950/40">
                          <CheckCircle className="w-3 h-3 text-emerald-400 fill-emerald-400/20" /> Watched
                        </span>
                      )}
                  </div>
                </div>
                <div 
                  id="media-modal-header-actions" 
                  className="flex items-center gap-2 shrink-0"
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      e.stopPropagation();
                      const firstBodyEl = document.querySelector('#media-modal-body-content .focusable, #media-modal-body-content select, #media-modal-body-content button') as HTMLElement;
                      if (firstBodyEl) firstBodyEl.focus();
                    }
                  }}
                >
                  <button 
                    onClick={handleOpenFixMatch}
                    className="focusable flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors bg-white/5 text-white/90 border border-white/10 hover:bg-white/10 hover:text-white"
                    title="Correct title, poster and TMDB match"
                  >
                    <Sparkles className="w-4 h-4 text-red-500" />
                    Fix Match
                  </button>
                  {user && !isSeries && (
                    <button 
                      type="button"
                      onClick={() => toggleWatched('movie')}
                      className={`focusable flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors shrink-0 ${
                        watchedDocs['movie']
                          ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-600/30'
                          : 'bg-white/5 text-white border border-white/10 hover:bg-white/10'
                      }`}
                      title={watchedDocs['movie'] ? 'Mark Movie Unwatched' : 'Mark Movie Watched'}
                    >
                      <CheckCircle className={`w-4 h-4 ${watchedDocs['movie'] ? 'text-emerald-400 fill-emerald-400/20' : 'text-white/60'}`} />
                      {watchedDocs['movie'] ? 'Watched' : 'Mark Watched'}
                    </button>
                  )}
                  {user && (
                    <button 
                      onClick={toggleFavorite}
                      disabled={favoriteLoading}
                      className={`focusable flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors shrink-0
                        ${isFavorite 
                          ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30' 
                          : 'bg-white/5 text-white border border-white/10 hover:bg-white/10'}`}
                    >
                      {isFavorite ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                      {isFavorite ? 'In Library' : 'Add To Library'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      const key = (extraDetails as any)?.trailerKey;
                      setSelectedTrailerKey(key || 'search');
                      setShowTrailerModal(true);
                    }}
                    className="focusable flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold tracking-wider uppercase bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 transition-colors shrink-0 cursor-pointer"
                    title="Watch Official YouTube Trailer"
                  >
                    <Video className="w-4 h-4 text-red-400" />
                    Watch Trailer
                  </button>
                </div>
            </div>
        </div>


        <div 
          id="media-modal-body-content" 
          className="p-6 overflow-y-auto md:overflow-hidden flex-1 grid grid-cols-1 md:grid-cols-2 gap-8"
        >
            <div className="space-y-6 h-full md:overflow-y-auto custom-scrollbar md:pr-4 pb-4">
                {(dynamicOverview || movie.overview) && (
                    <p className="text-sm text-white/90 leading-relaxed">
                        {dynamicOverview || movie.overview}
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

                    {(extraDetails.directors.length > 0 || (extraDetails.writers && extraDetails.writers.length > 0) || extraDetails.producers.length > 0) && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 border-b border-white/5 pb-4 text-xs">
                        {extraDetails.directors.length > 0 && (
                          <div>
                            <span className="text-white/60 uppercase font-bold tracking-wider block mb-1 text-[10px]">
                              {isSeries ? 'Creator / Showrunner' : 'Director'}
                            </span>
                            <span className="text-white font-semibold">{extraDetails.directors.slice(0, 3).join(', ')}</span>
                          </div>
                        )}
                        {extraDetails.writers && extraDetails.writers.length > 0 && (
                          <div>
                            <span className="text-white/60 uppercase font-bold tracking-wider block mb-1 text-[10px]">Written By</span>
                            <span className="text-white font-medium truncate block" title={extraDetails.writers.join(', ')}>
                              {extraDetails.writers.slice(0, 3).join(', ')}
                            </span>
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

                    {/* Chapters List */}
                    {extraDetails.chapters && extraDetails.chapters.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-white/5">
                        <h4 className="text-xs font-bold text-white/60 uppercase tracking-wider flex items-center gap-2">
                          <span>📑</span> Chapters ({extraDetails.chapters.length})
                        </h4>
                        <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto pr-1">
                          {extraDetails.chapters.map((ch, idx) => {
                            const h = Math.floor(ch.startTime / 3600);
                            const m = Math.floor((ch.startTime % 3600) / 60);
                            const s = Math.floor(ch.startTime % 60);
                            const timeStr = h > 0
                              ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
                              : `${m}:${String(s).padStart(2, '0')}`;
                            return (
                              <div key={ch.id || idx} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
                                <span className="text-xs text-white/80 truncate">{ch.title}</span>
                                <span className="text-[10px] font-mono text-white/40 shrink-0 ml-2">{timeStr}</span>
                              </div>
                            );
                          })}
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
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Season</label>
                                  {user && selectedSeason !== null && (
                                    <button
                                      type="button"
                                      onClick={() => toggleSeasonWatched(selectedSeason)}
                                      className={`focusable text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                                        isSeasonFullyWatched(selectedSeason)
                                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/60'
                                          : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
                                      }`}
                                      title={isSeasonFullyWatched(selectedSeason) ? 'Mark Season Unwatched' : 'Mark All Episodes in Season Watched'}
                                    >
                                      <CheckCircle className={`w-3.5 h-3.5 ${isSeasonFullyWatched(selectedSeason) ? 'text-emerald-400 fill-emerald-400/20' : 'text-white/40'}`} />
                                      <span>{isSeasonFullyWatched(selectedSeason) ? 'Season Watched' : 'Mark Season Watched'}</span>
                                    </button>
                                  )}
                                </div>
                                <div className="relative">
                                    <select
                                        value={selectedSeason ?? ''}
                                        onChange={(e) => {
                                            const sNum = parseInt(e.target.value, 10);
                                            if (!isNaN(sNum)) {
                                                setStreams([]);
                                                setSelectedSeason(sNum);
                                                setSelectedEpisode(null);
                                                setEpisodes([]);
                                            }
                                        }}
                                        className="focusable w-full bg-[#12121a] text-white border border-white/10 rounded-xl px-4 py-2.5 text-xs font-medium appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all pr-10"
                                    >
                                        {seasons.map(s => (
                                            <option key={s.season_number} value={s.season_number} className="bg-[#12121a] text-white">
                                                Season {s.season_number} ({s.episode_count || s.episodes?.length || 0} Episodes)
                                            </option>
                                        ))}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/50 text-xs">
                                        ▼
                                    </div>
                                </div>
                            </div>
                            {episodes.length > 0 && (
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center justify-between">
                                      <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Episode</label>
                                      {selectedEpisode !== null && (
                                        <span className="text-[10px] font-mono text-white/50 flex items-center gap-1">
                                          <Calendar className="w-3 h-3 text-white/40" />
                                          {episodes.find(e => e.episode_number === selectedEpisode)?.air_date ? `Aired: ${episodes.find(e => e.episode_number === selectedEpisode)?.air_date}` : 'Air date N/A'}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="relative flex-1">
                                          <select
                                              value={selectedEpisode ?? ''}
                                              onChange={(e) => {
                                                  const eNum = parseInt(e.target.value, 10);
                                                  if (!isNaN(eNum)) {
                                                      setStreams([]);
                                                      setSelectedEpisode(eNum);
                                                  }
                                              }}
                                              className="focusable w-full bg-[#12121a] text-white border border-white/10 rounded-xl px-4 py-2.5 text-xs font-medium appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all pr-10"
                                          >
                                              {episodes.map(ep => {
                                                  const isEpWatched = !!watchedDocs[`s${selectedSeason}_e${ep.episode_number}`];
                                                  const airStr = ep.air_date ? ` (Aired: ${ep.air_date})` : '';
                                                  return (
                                                      <option key={ep.episode_number} value={ep.episode_number} className="bg-[#12121a] text-white">
                                                          {isEpWatched ? '✓ ' : ''}E{ep.episode_number} - {ep.name || `Episode ${ep.episode_number}`}{airStr}
                                                      </option>
                                                  );
                                              })}
                                          </select>
                                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/50 text-xs">
                                              ▼
                                          </div>
                                      </div>
                                      {user && selectedSeason !== null && selectedEpisode !== null && (
                                        <button
                                          type="button"
                                          onClick={() => toggleWatched('tv', selectedSeason, selectedEpisode)}
                                          className={`focusable shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                                            watchedDocs[`s${selectedSeason}_e${selectedEpisode}`]
                                              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900/60'
                                              : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
                                          }`}
                                          title={watchedDocs[`s${selectedSeason}_e${selectedEpisode}`] ? 'Mark Episode Unwatched' : 'Mark Episode Watched'}
                                        >
                                          <CheckCircle className={`w-4 h-4 ${watchedDocs[`s${selectedSeason}_e${selectedEpisode}`] ? 'text-emerald-400 fill-emerald-400/20' : 'text-white/40'}`} />
                                          <span>{watchedDocs[`s${selectedSeason}_e${selectedEpisode}`] ? 'Watched' : 'Mark Watched'}</span>
                                        </button>
                                      )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                  </div>
                )}


                <div className="flex flex-col gap-3 bg-white/[0.02] border border-white/5 p-4 rounded-xl">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white/60 uppercase tracking-wider flex items-center gap-2">
                      Stream Results
                      {loading && (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                      )}
                    </label>
                    {streams.length > 0 && (
                      <span className="text-[10px] text-white/50 font-mono">
                        {streams.length} {streams.length === 1 ? 'stream' : 'streams'} available
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <select
                      value={selectedStreamId ?? '0'}
                      disabled={loading || streams.length === 0}
                      onChange={(e) => {
                        setSelectedStreamId(e.target.value);
                      }}
                      className="focusable w-full bg-[#12121a] text-white border border-white/10 rounded-xl px-4 py-3 text-xs font-medium appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all pr-10 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading && streams.length === 0 ? (
                        <option value="" disabled className="bg-[#12121a] text-white/60">
                          Searching Stream Sources...
                        </option>
                      ) : streams.length === 0 ? (
                        <option value="" disabled className="bg-[#12121a] text-white/60">
                          No stream sources found
                        </option>
                      ) : (
                        streams.map((stream, idx) => {
                          const lastPlayedTag = stream.isLastPlayed ? '▶ [LAST PLAYED] ' : '';
                          const qualityTag = stream.quality ? `[${stream.quality}] ` : '';
                          const nameTag = stream.name || stream.title || 'Unknown Stream';
                          const sizeTag = stream.sizeStr || stream.size ? ` (${stream.sizeStr || stream.size})` : '';
                          const sourceTag = stream.source ? ` • ${stream.source}` : '';
                          const statusTag = (stream.type === 'premiumize_cloud' || stream.inPersonalCloud)
                            ? ' ⚡ Cloud'
                            : stream.type === 'local'
                            ? ' ⚡ Local'
                            : stream.isPremiumize || stream.isCached
                            ? ' ⚡ Instant'
                            : stream.seeds
                            ? ` • ${stream.seeds} seeds`
                            : '';
                          
                          return (
                            <option key={idx} value={String(idx)} className="bg-[#12121a] text-white py-1">
                              {`${lastPlayedTag}${qualityTag}${nameTag}${sizeTag}${sourceTag}${statusTag}`}
                            </option>
                          );
                        })
                      )}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/50 text-xs">
                      ▼
                    </div>
                  </div>

                  {streams.length > 0 && (
                    <button
                      onClick={() => {
                        const chosenIndex = Number(selectedStreamId ?? 0);
                        const chosenStream = streams[chosenIndex] || streams[0];
                        if (chosenStream) {
                          handleStreamClick(chosenStream);
                        }
                      }}
                      className="focusable flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs tracking-wider uppercase transition-colors shadow-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-400 mt-1"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      Play Selected Stream
                    </button>
                  )}
                </div>

                {/* Developer Admin Tools Panel (Visible strictly when Admin & Developer Admin Mode is ON) */}
                {user?.role === 'admin' && 
                 (userSettings?.adminMode === true || systemSettings?.adminMode === true || userSettings?.developerAdminMode === true || systemSettings?.developerAdminMode === true) && (
                  <div className="mt-8 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl p-5 shadow-xl space-y-6">
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-indigo-500/20">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-indigo-600/30 border border-indigo-400/40 text-indigo-300">
                          <Zap className="w-5 h-5 fill-indigo-400/20" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-white uppercase tracking-wider font-mono">⚡ Developer Admin Tools</h3>
                          <p className="text-xs text-indigo-300/70 font-mono">FFmpeg & AI Skip Timestamps, TIDB Submission & Chapter Editor</p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono">
                        Admin Only
                      </span>
                    </div>

                    {/* Target Stream / File Selector Dropdown */}
                    <div className="bg-black/60 border border-indigo-500/30 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                          <FileVideo className="w-4 h-4 shrink-0" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-white font-mono uppercase block">Target Processing Source</label>
                          <p className="text-[10px] text-white/50 font-mono">Select specific file or stream for FFmpeg & AI to process</p>
                        </div>
                      </div>
                      <select
                        value={devSelectedStreamUrl || (streams[0]?.url || movie?.filePath || '')}
                        onChange={(e) => setDevSelectedStreamUrl(e.target.value)}
                        className="bg-slate-900 text-indigo-200 border border-indigo-500/40 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-indigo-400 max-w-md w-full truncate cursor-pointer"
                      >
                        {movie?.filePath && (
                          <option value={movie.filePath}>📁 Local File: {movie.filePath}</option>
                        )}
                        {streams.map((s: any, idx: number) => (
                          <option key={idx} value={s.url}>
                            {s.type === 'local' ? '📁' : s.isCached ? '⚡' : '🌐'} {s.name || `Stream #${idx + 1}`} ({s.quality || 'Auto'})
                          </option>
                        ))}
                        {streams.length === 0 && !movie?.filePath && (
                          <option value="">No streams or local files discovered yet</option>
                        )}
                      </select>
                    </div>

                    {/* Section 1: Skip Segments Editor & TIDB Submission */}
                    <div className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-400" /> Intro / Credit Skip Segments
                          </h4>
                          <p className="text-[11px] text-white/50 font-mono">FFmpeg visual/silence scan + AI sequence detection</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={devScanningSkip}
                            onClick={handleDevScanSkipSegments}
                            className="focusable px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
                          >
                            {devScanningSkip ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                            Scan (FFmpeg + AI)
                          </button>
                        </div>
                      </div>

                      {/* Skip Segments List / Editor */}
                      <div className="space-y-2">
                        {devSkipSegments.length === 0 ? (
                          <div className="text-xs text-white/40 italic py-3 text-center bg-white/[0.02] rounded-lg border border-white/5 font-mono">
                            No active skip segments. Click "Scan (FFmpeg + AI)" or add one manually below.
                          </div>
                        ) : (
                          devSkipSegments.map((seg, idx) => (
                            <div key={idx} className="flex flex-wrap items-center gap-2 bg-slate-900/90 border border-white/10 p-2.5 rounded-lg text-xs font-mono">
                              <select
                                value={seg.type || 'intro'}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const labelMap: Record<string, string> = { intro: 'Skip Intro', recap: 'Skip Recap', credits: 'Skip Credits' };
                                  updateDevSkipSegment(idx, { type: val, label: labelMap[val] || 'Skip' });
                                }}
                                className="bg-slate-800 text-white border border-white/15 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-400"
                              >
                                <option value="intro">Intro</option>
                                <option value="recap">Recap</option>
                                <option value="credits">Credits</option>
                              </select>

                              <div className="flex items-center gap-1">
                                <span className="text-white/40 text-[10px]">Start:</span>
                                <input
                                  type="number"
                                  value={seg.start}
                                  onChange={(e) => updateDevSkipSegment(idx, { start: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                  className="w-16 bg-slate-800 text-white border border-white/15 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-400"
                                  placeholder="Sec"
                                />
                                <span className="text-white/40 text-[10px]">({formatTime(seg.start)})</span>
                              </div>

                              <div className="flex items-center gap-1">
                                <span className="text-white/40 text-[10px]">End:</span>
                                <input
                                  type="number"
                                  value={seg.end}
                                  onChange={(e) => updateDevSkipSegment(idx, { end: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                  className="w-16 bg-slate-800 text-white border border-white/15 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-400"
                                  placeholder="Sec"
                                />
                                <span className="text-white/40 text-[10px]">({formatTime(seg.end)})</span>
                              </div>

                              <div className="flex items-center gap-1 ml-auto">
                                <button
                                  type="button"
                                  onClick={() => handleTestPlayDevTimestamp(seg.start)}
                                  className="focusable px-2.5 py-1 bg-emerald-600/80 hover:bg-emerald-500 text-white rounded text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                                  title="Test Play in player at segment start"
                                >
                                  <PlayCircle className="w-3.5 h-3.5" /> Test Play
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeDevSkipSegment(idx)}
                                  className="focusable px-2 py-1 bg-red-600/60 hover:bg-red-600 text-white rounded text-[11px] font-bold transition-all cursor-pointer"
                                  title="Delete Segment"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-white/10">
                          <button
                            type="button"
                            onClick={addDevSkipSegment}
                            className="focusable text-xs px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors font-medium flex items-center gap-1 cursor-pointer"
                          >
                            + Add Segment
                          </button>
                          <button
                            type="button"
                            disabled={devSubmittingTidb || devSkipSegments.length === 0}
                            onClick={handleDevSubmitTidb}
                            className="focusable px-4 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
                          >
                            {devSubmittingTidb ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                            Submit to TheIntroDB (TIDB)
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Movie & Media Chapters Editor */}
                    <div className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                            <Video className="w-4 h-4 text-cyan-400" /> Movie Chapters (FFmpeg Scene Detect)
                          </h4>
                          <p className="text-[11px] text-white/50 font-mono">Extract embedded chapters or scan scene changes with FFmpeg</p>
                        </div>
                        <button
                          type="button"
                          disabled={devScanningChapters}
                          onClick={handleDevScanChapters}
                          className="focusable px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
                        >
                          {devScanningChapters ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          Scan Chapters
                        </button>
                      </div>

                      {/* Chapters Editor */}
                      <div className="space-y-2">
                        {devChapters.length === 0 ? (
                          <div className="text-xs text-white/40 italic py-3 text-center bg-white/[0.02] rounded-lg border border-white/5 font-mono">
                            No active chapters. Click "Scan Chapters" or add custom chapters below.
                          </div>
                        ) : (
                          devChapters.map((ch, idx) => (
                            <div key={idx} className="flex flex-wrap items-center gap-2 bg-slate-900/90 border border-white/10 p-2.5 rounded-lg text-xs font-mono">
                              <input
                                type="text"
                                value={ch.title}
                                onChange={(e) => updateDevChapter(idx, { title: e.target.value })}
                                className="flex-1 min-w-[140px] bg-slate-800 text-white border border-white/15 rounded px-2.5 py-1 text-xs focus:outline-none focus:border-cyan-400 font-bold"
                                placeholder="Chapter Title"
                              />

                              <div className="flex items-center gap-1">
                                <span className="text-white/40 text-[10px]">Start:</span>
                                <input
                                  type="number"
                                  value={ch.startTime}
                                  onChange={(e) => updateDevChapter(idx, { startTime: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                  className="w-16 bg-slate-800 text-white border border-white/15 rounded px-2 py-1 text-xs focus:outline-none focus:border-cyan-400"
                                  placeholder="Sec"
                                />
                                <span className="text-white/40 text-[10px]">({formatTime(ch.startTime)})</span>
                              </div>

                              <div className="flex items-center gap-1 ml-auto">
                                <button
                                  type="button"
                                  onClick={() => handleTestPlayDevTimestamp(ch.startTime)}
                                  className="focusable px-2.5 py-1 bg-emerald-600/80 hover:bg-emerald-500 text-white rounded text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                                  title="Test Play in player at chapter start"
                                >
                                  <PlayCircle className="w-3.5 h-3.5" /> Test Play
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeDevChapter(idx)}
                                  className="focusable px-2 py-1 bg-red-600/60 hover:bg-red-600 text-white rounded text-[11px] font-bold transition-all cursor-pointer"
                                  title="Delete Chapter"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-white/10">
                          <button
                            type="button"
                            onClick={addDevChapter}
                            className="focusable text-xs px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors font-medium flex items-center gap-1 cursor-pointer"
                          >
                            + Add Chapter
                          </button>
                          <button
                            type="button"
                            disabled={devSavingChapters || devChapters.length === 0}
                            onClick={handleDevSaveChapters}
                            className="focusable px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
                          >
                            {devSavingChapters ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Save & Apply Chapters
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
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
                  const isHevcMatch = /hevc|x265|h265|10bit|2160p|4k|hdr|remux/i.test(resumePromptStream || movie?.filePath || movie?.title || '');
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
                  const isHevcMatch = /hevc|x265|h265|10bit|2160p|4k|hdr|remux/i.test(resumePromptStream || movie?.filePath || movie?.title || '');
                  const context = { type: isSeries ? 'tv' : 'movie', id: movie.id, season: selectedSeason, episode: selectedEpisode, isHevc: isHevcMatch };
                  if (user?.uid && movie?.id) {
                    deleteDoc({ collectionName: 'user_progress', id: `${user.uid}_${movie.id}` }).catch(() => null);
                    setSavedProgress(null);
                  }
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
        <div id="fix-match-modal" className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
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
                type="button"
                onClick={() => setShowFixMatchModal(false)}
                className="close-fix-match focusable p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
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
                    className="focusable w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={fixMatchSearching}
                  className="focusable px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-red-500"
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
                    tabIndex={0}
                    onClick={() => selectFixMatchCandidate(item)}
                    className="focusable group flex gap-4 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-red-500/40 cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white/[0.08]"
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
                          type="button"
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

      {/* YouTube Trailer Modal */}
      {showTrailerModal && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-4 sm:p-8 animate-fadeIn">
          <div className="bg-[#0f0f18] border border-white/10 w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <Video className="w-5 h-5 text-red-500" />
                <h3 className="text-sm font-bold text-white tracking-wide truncate">
                  {movie.title || movie.name} - Official Trailer
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTrailerModal(false)}
                className="focusable p-2 text-white/60 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* YouTube IFrame Player */}
            <div className="aspect-video w-full bg-black relative">
              {selectedTrailerKey && selectedTrailerKey !== 'search' ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${selectedTrailerKey}?autoplay=1&rel=0`}
                  title="YouTube Trailer"
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent((movie.title || movie.name) + ' official trailer')}&autoplay=1`}
                  title="YouTube Trailer Search"
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              )}
            </div>

            {/* Multiple Trailers Selector List */}
            {(extraDetails as any)?.trailers && (extraDetails as any).trailers.length > 1 && (
              <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center gap-2 overflow-x-auto custom-scrollbar">
                <span className="text-xs font-bold text-white/50 shrink-0 uppercase tracking-wider">More Trailers:</span>
                {(extraDetails as any).trailers.map((t: any, idx: number) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedTrailerKey(t.key)}
                    className={`focusable text-xs font-semibold px-3 py-1.5 rounded-lg border shrink-0 transition-all cursor-pointer ${
                      selectedTrailerKey === t.key
                        ? 'bg-red-600 text-white border-red-500 shadow'
                        : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {t.name || `${t.type} ${idx + 1}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TheIntroDB Skip Info Modal */}
      {showSkipInfoModal && (
        <div 
          id="skip-info-modal"
          className="fixed inset-0 z-[999999] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="w-full max-w-lg bg-slate-900 border border-indigo-500/40 rounded-3xl overflow-hidden shadow-[0_0_80px_rgba(99,102,241,0.35)] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-indigo-950/90 border-b border-indigo-500/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-600/30 border border-indigo-400/40 text-indigo-300">
                  <Zap className="w-6 h-6 fill-indigo-400/20 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white tracking-wide uppercase">TheIntroDB Skip Timestamps</h3>
                  <p className="text-xs text-indigo-300/80 font-mono mt-0.5">
                    {isSeries && selectedSeason !== null && selectedEpisode !== null 
                      ? `Season ${selectedSeason}, Episode ${selectedEpisode}` 
                      : (movie.title || movie.name)}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowSkipInfoModal(false)}
                className="focusable p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-3.5 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {getActiveSkipSegments().length > 0 ? (
                getActiveSkipSegments().map((seg: any, idx: number) => {
                  const duration = Math.max(0, Math.round(seg.end - seg.start));
                  const durMin = Math.floor(duration / 60);
                  const durSec = duration % 60;
                  const durStr = durMin > 0 ? `${durMin}m ${durSec}s` : `${durSec}s`;

                  return (
                    <div key={idx} className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between gap-4 hover:border-indigo-500/30 transition-all">
                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shrink-0">
                          {seg.label || seg.type}
                        </span>
                        <div>
                          <div className="text-sm font-bold text-white font-mono">
                            {formatTime(seg.start)} → {formatTime(seg.end)}
                          </div>
                          <div className="text-[11px] text-white/50 font-mono mt-0.5">
                            Duration: {durStr}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 shrink-0">
                        <Check className="w-3.5 h-3.5" /> Auto-Skip Ready
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-white/50 font-mono text-xs">
                  No skip timestamps recorded for this item.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-black/80 border-t border-white/10 flex items-center justify-between">
              <span className="text-xs text-white/50 font-mono">Powered by TheIntroDB v3</span>
              <button 
                onClick={() => setShowSkipInfoModal(false)}
                className="focusable px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer shadow-lg shadow-indigo-600/30"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
