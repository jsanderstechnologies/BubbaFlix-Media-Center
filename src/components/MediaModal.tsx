import { useState, useEffect } from 'react';
import { getTvSeriesDetails, getTvSeasonDetails, getMpaaRating, getMediaCreditsAndDetails, getCachedImageUrl } from '../services/tmdbApi';
import { Bookmark, BookmarkCheck, X, Star, Database, Download, Sparkles, Search, Check, RefreshCw, Cloud, CheckCircle, Eye, EyeOff, Calendar, Video, PlayCircle } from 'lucide-react';

import { collection, addDoc, query, where, getDocs, deleteDoc, doc, updateDoc, setDoc, serverTimestamp, onSnapshot } from '../lib/localDb';
import { db } from '../lib/localDb';
import { useAuth } from './Auth';
import { useSettings } from '../lib/settings';
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
    const url = `/api/torrents/search?q=${encodeURIComponent(q)}${imdbId ? `&imdbId=${encodeURIComponent(imdbId)}` : ''}`;
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
      const fallbackUrl = `/api/torrents/search?q=${encodeURIComponent(seasonQuery)}${imdbId ? `&imdbId=${encodeURIComponent(imdbId)}` : ''}`;
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

    const handleModalBackKeyDown = (e: KeyboardEvent) => {
      const isBackKey = [
        'Escape', 'Back', 'GoBack', 'BrowserBack', 'U+001B', 'SoftLeft'
      ].includes(e.key) || [4, 27, 8, 10009, 461, 283].includes(e.keyCode) ||
      (e.key === 'Backspace' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA');

      if (isBackKey) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleModalBackKeyDown, true);

    SpatialNavigation.add('media-modal', {
      selector: '#media-modal .focusable, #media-modal button, #media-modal input, #media-modal select',
      restrict: 'self-only',
      straightOnly: false,
      enterTo: 'last-focused'
    });
    SpatialNavigation.makeFocusable('media-modal');
    SpatialNavigation.focus('media-modal');
    SpatialNavigation.disable('');

    // Focus main action elements (Fix Match / Add to Library) instead of top [X] close button
    setTimeout(() => {
      const firstAction = document.querySelector('#media-modal .focusable:not(.no-focus)') as HTMLElement;
      if (firstAction) {
        firstAction.focus();
      }
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleModalBackKeyDown, true);
      SpatialNavigation.remove('media-modal');
      SpatialNavigation.enable('');
      SpatialNavigation.focus('');
    };
  }, [isHidden, onClose]);

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
      setExtraLoading(true);
      const targetId = resolvedTmdbId || (typeof movie.id === 'number' ? movie.id : (movie.realTmdbId ? Number(movie.realTmdbId) : null));
      if (targetId) {
        getMediaCreditsAndDetails(targetId, isSeries).then(details => {
          if (!isActive) return;
          setExtraDetails(details);
          setExtraLoading(false);
          if (details) {
            if (!movie.overview && (details as any).overview) movie.overview = (details as any).overview;
          }
        }).catch(() => {
          if (isActive) setExtraLoading(false);
        });
      } else {
        setExtraLoading(false);
      }
    } else {
      setExtraDetails(null);
      setStreams([]);
    }
    return () => { isActive = false; };
  }, [movie, isSeries, resolvedTmdbId]);

  useEffect(() => {
    let isActive = true;
    if (!movie) { setMpaaRating(''); return; }
    const targetId = resolvedTmdbId || (typeof movie.id === 'number' ? movie.id : (movie.realTmdbId ? Number(movie.realTmdbId) : null));
    if (targetId) {
      getMpaaRating(targetId, isSeries).then(rating => {
        if (isActive) setMpaaRating(rating);
      });
    } else {
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

  // Auto-populate the next unwatched season and episode when opening TV Series
  useEffect(() => {
    if (!isSeries || seasons.length === 0 || isHidden) return;
    if (selectedSeason !== null) return;

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
  }, [isSeries, seasons, watchedDocs, selectedSeason, isHidden]);

  const toggleWatched = async (type: 'tv' | 'movie', seasonNum?: number, episodeNum?: number) => {
    if (!user || !movie) return;
    const targetId = resolvedTmdbId || movie.realTmdbId || movie.tmdbId || movie.id;

    const docId = type === 'tv' 
      ? `${user.uid}_${targetId}_s${seasonNum}_e${episodeNum}`
      : `${user.uid}_${targetId}`;
    
    const key = type === 'tv' ? `s${seasonNum}_e${episodeNum}` : 'movie';
    const currentlyWatched = !!watchedDocs[key];
    const newWatchedState = !currentlyWatched;

    setWatchedDocs(prev => ({ ...prev, [key]: newWatchedState }));

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
    const epCount = episodes.length > 0 && selectedSeason === seasonNum
      ? episodes.length
      : (seasons.find(s => s.season_number === seasonNum)?.episode_count || 0);

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

    const epCount = episodes.length > 0 && selectedSeason === seasonNum
      ? episodes.length
      : (seasons.find(s => s.season_number === seasonNum)?.episode_count || 1);

    const updatedDocsMap = { ...watchedDocs };
    const promises: Promise<any>[] = [];

    for (let eNum = 1; eNum <= epCount; eNum++) {
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
          const applyFiltersAndSort = (streams: any[]) => {
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
                  if (s.type === 'torrent' && !s.isPremiumize && !s.isCached) return false;
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
                      let hashIdx = 0;
                      updatedData.forEach((s: any) => {
                        if (s.type === 'torrent' && s.hash) {
                          if (responseArr[hashIdx] === true) {
                            s.isPremiumize = true;
                            s.isCached = true;
                            s.availability = 'Cached (Premiumize ⚡)';
                          }
                          hashIdx++;
                        }
                      });
                    }
                  } catch (e) {}
                }
              }

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
            const firstUnwatched = finalEpisodes.find(e => !watchedDocs[`s${selectedSeason}_e${e.episode_number}`]);
            setSelectedEpisode(firstUnwatched ? firstUnwatched.episode_number : finalEpisodes[0].episode_number);
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
      const localPath = currentEp?.filePath || (selectedSeason === 1 && selectedEpisode === 1 ? movie.filePath : null);
      const localStreamUrl = currentEp?.streamUrl || movie.streamUrl;

      if (movie.isNetworkShare || localPath || localStreamUrl) {
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

      const filterAndSortTvStreams = (streamsToFilter: any[]) => {
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

        return filteredData.sort((a: any, b: any) => {
          const rankA = getStreamPriorityRank(a);
          const rankB = getStreamPriorityRank(b);
          if (rankA !== rankB) return rankA - rankB;
          return (b.seeds || 0) - (a.seeds || 0);
        });
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

      Promise.all([
        fetchStreamsForTvSeries(movie.title || movie.name, selectedSeason, selectedEpisode, extraDetails?.imdbId || undefined),
        iptvPromise,
        localMediaPromise,
        pmCloudPromise
      ]).then(async ([data, iptvRes, localRes, pmCloudRes]) => {
        if (!isActive) return;
        
        const updatedData: any[] = [...initialData];

        if (pmCloudRes?.success && Array.isArray(pmCloudRes.data)) {
          pmCloudRes.data.forEach((pmStream: any) => {
            updatedData.unshift(pmStream);
          });
        }

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
                let hashIdx = 0;
                updatedData.forEach((s: any) => {
                  if (s.type === 'torrent' && s.hash) {
                    if (responseArr[hashIdx] === true) {
                      s.isPremiumize = true;
                      s.isCached = true;
                      s.availability = 'Cached (Premiumize ⚡)';
                    }
                    hashIdx++;
                  }
                });
              }
            } catch (e) {}
          }
        }

        const filteredData = filterAndSortTvStreams(updatedData);

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

  const renderStream = (stream: any) => {
    if (!stream) return null;

    const handleStreamClick = async () => {
      if (stream.isAdding) return;
      if (stream.downloadProgress !== undefined && stream.downloadProgress < 100) return;

      const pmKey = systemSettings.premiumizeApiKey || localStorage.getItem('premiumizeApiKey');

      if (stream.type === 'local' || stream.type === 'iptv') {
        triggerPlay(stream.url, stream);
        return;
      }
      if (stream.type === 'premiumize_cloud') {
        if (stream.url) {
          triggerPlay(stream.url, stream);
        }
        return;
      }

      if (!pmKey) {
        alert("Please configure your Premiumize API Key in Settings to stream torrents.");
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
        const magnetLink = stream.url || (stream.hash ? `magnet:?xt=urn:btih:${stream.hash}` : '');
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
        } else if (pmData.error) {
          alert("Premiumize Error: " + (pmData.message || pmData.error));
        }
      } catch (err: any) {
        console.error("Failed to resolve stream on Premiumize:", err);
        alert("Failed to resolve stream on Premiumize: " + (err.message || err));
      }
      setStreams(prev => prev.map(s => isSameStream(s, stream) ? { ...s, isAdding: false } : s));
      return;
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
            <div className="flex items-center gap-2">
              {(stream.type === 'premiumize_cloud' || stream.inPersonalCloud) && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold shrink-0 shadow-sm" title="Located in Premiumize Cloud">
                  <Cloud className="w-3 h-3 text-cyan-300 fill-cyan-400/20" /> Cloud
                </span>
              )}
              <span className="text-xs font-medium text-white group-hover:text-white truncate">{stream.name}</span>
            </div>
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
            <div className={`px-2 py-0.5 text-[10px] font-bold rounded border whitespace-nowrap uppercase flex items-center gap-1 ${(stream.type === 'premiumize_cloud' || stream.inPersonalCloud) ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm' : (stream.isPremiumize ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : (stream.isCached ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : (stream.downloadState && stream.downloadState !== 'completed' && stream.downloadState !== 'cached' && stream.downloadState !== 'downloaded' && stream.downloadProgress >= 100 ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : (stream.isAdding || stream.downloadProgress !== undefined ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'))))}`}>
              {(stream.type === 'premiumize_cloud' || stream.inPersonalCloud) && <Cloud className="w-3 h-3 text-cyan-300" />}
              {(stream.type === 'premiumize_cloud' || stream.inPersonalCloud)
                ? 'Premiumize Cloud ⚡'
                : (stream.isPremiumize
                  ? 'Premiumize ⚡'
                  : (stream.isCached 
                    ? 'Instant Stream' 
                    : (stream.downloadState && stream.downloadState !== 'completed' && stream.downloadState !== 'cached' && stream.downloadState !== 'downloaded' && stream.downloadProgress >= 100 
                      ? 'Processing...' 
                      : (stream.isAdding 
                        ? 'Adding...' 
                        : (stream.downloadProgress !== undefined 
                          ? `${stream.downloadProgress}%` 
                          : 'Torrent')))))}
            </div>
            {stream.type !== 'torrent' && (
              <div className="px-2 py-0.5 bg-indigo-600/10 text-indigo-400 text-[10px] font-bold rounded border border-indigo-500/20 whitespace-nowrap uppercase">
                {stream.type}
              </div>
            )}
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
            <div onClick={onClose} className="absolute top-4 right-4 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10 cursor-pointer" title="Close">
                <X className="w-5 h-5" />
            </div>
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
                      {!isSeries && watchedDocs['movie'] && (
                        <span className="flex items-center gap-1 px-2 py-0.5 border border-emerald-500/40 rounded text-[11px] font-bold text-emerald-400 font-mono leading-none tracking-wide uppercase bg-emerald-950/40">
                          <CheckCircle className="w-3 h-3 text-emerald-400 fill-emerald-400/20" /> Watched
                        </span>
                      )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
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


                {(() => {
                  const isReadyOrActive = (s: any) => {
                    if (s.type === 'local' || s.type === 'iptv' || s.type === 'premiumize_cloud' || s.inPersonalCloud) return true;
                    if (s.downloadState || s.downloadProgress !== undefined || s.isAdding) return true;
                    return false;
                  };

                  const activeStreams = streams.filter(isReadyOrActive);
                  // Filter out un-cached plain torrents so only streams that qualify for the Premiumize cached badge (or local/iptv/cloud streams) are displayed
                  const availableStreams = streams.filter(s => {
                    if (isReadyOrActive(s)) return false;
                    if (s.type === 'local' || s.type === 'iptv' || s.type === 'premiumize_cloud' || s.inPersonalCloud) return true;
                    return Boolean(s.isPremiumize || s.isCached);
                  });

                  return (
                    <div className="flex flex-col flex-1 min-h-0 gap-6">
                        {isSeries && isFutureAirDate(episodes.find(e => e.episode_number === selectedEpisode)?.air_date) && (
                          <div className="flex items-center gap-3 p-4 rounded-xl bg-purple-950/40 border border-purple-500/30 text-purple-200 text-xs mb-2">
                            <Calendar className="w-5 h-5 text-purple-400 shrink-0" />
                            <div>
                              <p className="font-bold text-white">Upcoming Episode — Not Aired Yet</p>
                              <p className="text-purple-300/80 mt-0.5">
                                Episode {selectedEpisode} is scheduled to air on <span className="font-mono font-bold text-purple-200">{episodes.find(e => e.episode_number === selectedEpisode)?.air_date}</span>. External stream searches are skipped.
                              </p>
                            </div>
                          </div>
                        )}
                        {/* Instant Cloud, Local & Active Streams Container */}
                        <div className="flex flex-col shrink-0">
                            <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2">
                                Ready to Play / Active <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            </h3>
                            <div className="flex flex-col gap-3">
                                {activeStreams.length > 0 ? (
                                    activeStreams.map(stream => renderStream(stream))
                                ) : (
                                    <div className="text-white/40 text-xs italic py-2">No active cloud storage items or local streams found.</div>
                                )}
                            </div>
                        </div>

                        {/* Search Results Container */}
                        <div className="flex flex-col flex-1 min-h-0">
                            <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2 flex-shrink-0">
                                Available Stream Sources <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                            </h3>
                            {loading ? (
                                <div className="text-white/60 text-xs italic py-4 flex items-center gap-2 bg-white/[0.01] p-4 rounded-xl border border-white/5">
                                  <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                  </span>
                                  <span>Searching Stream Indexers...</span>
                                </div>
                            ) : availableStreams.length === 0 ? (
                                <div className="text-white/60 text-xs italic py-4 bg-white/[0.01] p-4 rounded-xl border border-white/5">No indexed streams found.</div>
                            ) : (
                                <div className="flex flex-col gap-3 flex-1 overflow-y-auto custom-scrollbar pr-1 pb-4">
                                    {availableStreams.map(stream => renderStream(stream))}
                                </div>
                            )}
                        </div>
                    </div>
                  );
                })()}
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
    </div>
  );
}
