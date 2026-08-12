/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { QueryClient, QueryClientProvider, useIsFetching } from '@tanstack/react-query';
import ReactPlayer from 'react-player';
import { Play, Search, Tv, Clapperboard, MonitorPlay, Settings, History, Check, Bookmark, Home, X, Music , ArrowLeft, Subtitles, AudioLines, Info, FastForward, Rewind, Database, Loader2, CloudSun, Newspaper, Download, HardDrive, Zap, Bot, Calendar as CalendarIcon, Film, SkipForward } from 'lucide-react';
import { searchMovies, searchTvSeries, getTrendingMovies, getTrendingTvSeries, getTvSeasonDetails, getCachedImageUrl } from './services/tmdbApi';
import { collection, query, where, onSnapshot, setDoc, deleteDoc, serverTimestamp } from './lib/localDb';
import { db } from './lib/localDb';
import { logger } from './lib/logger';
import { useSettings } from './lib/settings';
import CatalogGrid from './components/CatalogGrid';
import TvSeriesGrid from './components/TvSeriesGrid';
import IptvGuide from './components/IptvGuide';
import MediaModal from './components/MediaModal';
import SettingsPanel from './components/SettingsPanel';
import { AuthButton, AuthModal, useAuth } from './components/Auth';
import LibraryGrid from './components/LibraryGrid';
import { VirtualKeyboard } from './components/VirtualKeyboard';
import HomePanel from './components/HomePanel';
import SearchPanel from './components/SearchPanel';
import MusicPanel from './components/MusicPanel';
import WeatherPanel from './components/WeatherPanel';
import NewsPanel from './components/NewsPanel';
import WeatherAlertModal from './components/WeatherAlertModal';
import { fetchActiveWeatherAlerts, WeatherAlert } from './lib/weatherAlerts';
import SpatialNavigation from 'spatial-navigation-js';
import { detectDeviceCapabilities } from './lib/deviceDetection';
import UpcomingCalendar from './components/UpcomingCalendar';


const queryClient = new QueryClient();


const formatTime = (secs: number) => {
  if (!secs) return "00:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

function MainApp() {
  const isFetching = useIsFetching();
  const isPageLoading = isFetching > 0;
  const { user } = useAuth();
  const { systemSettings, userSettings, zoom } = useSettings();

  const [selectedMovie, setSelectedMovie] = useState<any>(null);

  const [playerStatus, setPlayerStatus] = useState<string>('STREAM READY');
  const [isTranscoding, setIsTranscoding] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingUrl, setPlayingUrl] = useState<string>('');
  const [playingContext, setPlayingContext] = useState<any>(null);
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [mediaInfo, setMediaInfo] = useState<any>(null);
  const [openSubtitles, setOpenSubtitles] = useState<any[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number>(0);
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState<string | number | null>(null);
  const [selectedSubtitleIsOS, setSelectedSubtitleIsOS] = useState<boolean>(false);
  const [subtitleOffset, setSubtitleOffset] = useState<number>(0);
  const [showMediaInfo, setShowMediaInfo] = useState(false);

  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [totalDuration, setTotalDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [bufferedSeconds, setBufferedSeconds] = useState<number>(0);
  const [streamOffset, setStreamOffset] = useState<number>(0);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [skipSegments, setSkipSegments] = useState<Array<{ type: string; start: number; end: number; label: string }>>([]);
  const [activeSkipSegment, setActiveSkipSegment] = useState<{ type: string; start: number; end: number; label: string } | null>(null);
  const [lastAutoSkippedSeg, setLastAutoSkippedSeg] = useState<string | null>(null);

  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(true);
  const [isVideoLoaded, setIsVideoLoaded] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isIdle, setIsIdle] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [movieSearchQuery, setMovieSearchQuery] = useState<string>('');
  const [seriesSearchQuery, setSeriesSearchQuery] = useState<string>('');
  const [musicSearchQuery, setMusicSearchQuery] = useState<string>('');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('home');
  const [sortOption, setSortOption] = useState<string>('newest');
  const [filterGenre, setFilterGenre] = useState<number>(0);
  const [showFilters, setShowFilters] = useState(false);
  const [movieViewMode, setMovieViewMode] = useState<'grid' | 'calendar'>('grid');
  const [seriesViewMode, setSeriesViewMode] = useState<'grid' | 'calendar'>('grid');

  const [favorites, setFavorites] = useState<any[]>([]);
  const [backgroundPoster, setBackgroundPoster] = useState<string>('');
  const [hoveredPoster, setHoveredPoster] = useState<string>('');
  const [firstAdminPassword, setFirstAdminPassword] = useState<string | null>(
    () => sessionStorage.getItem('firstAdminPassword')
  );

  const [activeWeatherAlert, setActiveWeatherAlert] = useState<WeatherAlert | null>(null);
  const [hasModalOpen, setHasModalOpen] = useState(false);

  const isSectionAllowed = (sectionId: string): boolean => {
    if (!user) return true;
    if (user.role === 'admin') return true;
    const allowed = user.allowedSections || ['tv', 'music', 'weather', 'news'];
    return allowed.includes(sectionId);
  };

  useEffect(() => {
    if (user && user.role !== 'admin') {
      const restrictedTabs = ['tv', 'music', 'weather', 'news'];
      if (restrictedTabs.includes(activeTab) && !isSectionAllowed(activeTab)) {
        setActiveTab('home');
      }
    }
  }, [user, activeTab]);

  // When a navbar tab is selected, automatically move focus to the first poster/card on the page
  useEffect(() => {
    const timer = setTimeout(() => {
      const firstPoster = document.querySelector('main .focusable, #main-content-view .focusable, main button, main [tabindex="0"]') as HTMLElement;
      if (firstPoster) {
        firstPoster.focus({ preventScroll: false });
        firstPoster.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [activeTab]);

  // Listen for custom tab navigation events (e.g. from Avatar dropdown)
  useEffect(() => {
    const handleNavTab = (e: any) => {
      if (e.detail) setActiveTab(e.detail);
    };
    window.addEventListener('navigate-tab', handleNavTab);
    return () => window.removeEventListener('navigate-tab', handleNavTab);
  }, []);

  // Ensure SpatialNavigation focus resets cleanly whenever exiting a modal or details screen
  useEffect(() => {
    if (!selectedMovie && !isPlaying) {
      try {
        SpatialNavigation.remove('media-modal');
        SpatialNavigation.remove('resume-modal');
        SpatialNavigation.remove('fix-match-modal');
        SpatialNavigation.enable('');
        SpatialNavigation.makeFocusable();
      } catch (e) {}
      
      const timer = setTimeout(() => {
        try {
          SpatialNavigation.enable('');
          SpatialNavigation.makeFocusable();
        } catch (e) {}

        const activeNavEl = document.getElementById(`nav-tab-${activeTab}`) || document.getElementById('nav-tab-home');
        const firstMainFocusable = document.querySelector('main .focusable, #main-content-view .focusable, main button, main [tabindex="0"]') as HTMLElement;
        
        if (firstMainFocusable) {
          firstMainFocusable.focus({ preventScroll: false });
        } else if (activeNavEl) {
          activeNavEl.focus({ preventScroll: false });
        }

        try {
          SpatialNavigation.focus();
        } catch (e) {}
      }, 50);

      return () => clearTimeout(timer);
    }
  }, [selectedMovie, isPlaying, activeTab]);

  // Monitor National Weather Service alerts for user location every 3 minutes
  useEffect(() => {
    let isMounted = true;
    const checkAlerts = async () => {
      const locStr = userSettings.weatherLocation || 'Austin, TX';
      try {
        let lat: number | null = null;
        let lon: number | null = null;
        const isZip = /^\d{5}(-\d{4})?$/.test(locStr.trim());
        if (isZip) {
          const zipRes = await fetch(`https://api.zippopotam.us/us/${locStr.trim()}`).then(r => r.json()).catch(() => null);
          if (zipRes && zipRes.places?.[0]) {
            lat = parseFloat(zipRes.places[0].latitude);
            lon = parseFloat(zipRes.places[0].longitude);
          }
        }
        if (lat === null || lon === null) {
          const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locStr.trim())}&count=1&language=en&format=json`).then(r => r.json()).catch(() => null);
          if (geoRes && geoRes.results?.[0]) {
            lat = geoRes.results[0].latitude;
            lon = geoRes.results[0].longitude;
          }
        }
        if (lat !== null && lon !== null && isMounted) {
          const alerts = await fetchActiveWeatherAlerts(lat, lon);
          if (alerts.length > 0 && isMounted) {
            setActiveWeatherAlert(alerts[0]);
          }
        }
      } catch (err) {
        console.error('Weather alert check error:', err);
      }
    };

    checkAlerts();
    const interval = setInterval(checkAlerts, 3 * 60 * 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [userSettings.weatherLocation]);

  useEffect(() => {
    let lastActiveState = false;
    const checkModals = () => {
      const isPlayerActive = !!(isPlaying && playingUrl);
      const isMediaModalActive = !!selectedMovie;
      const isUserSettingsActive = !!document.getElementById('user-settings-modal');
      const isAuthModalActive = !!document.getElementById('auth-modal');
      const isKeyboardActive = isKeyboardOpen;
      
      const active = isPlayerActive || isMediaModalActive || isUserSettingsActive || isAuthModalActive || isKeyboardActive;
      if (active !== lastActiveState) {
        lastActiveState = active;
        setHasModalOpen(active);
      }
    };

    checkModals();
    const observer = new MutationObserver(checkModals);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'id'] });

    return () => observer.disconnect();
  }, [isPlaying, playingUrl, selectedMovie, isKeyboardOpen]);

  useEffect(() => {
    SpatialNavigation.init();
    SpatialNavigation.add({
      selector: 'button, a, input, select, textarea, .focusable, [tabindex="0"]',
      straightOnly: false,
      rememberSource: true,
      enterTo: 'last-focused'
    });
    SpatialNavigation.makeFocusable();
    SpatialNavigation.focus();
    
    let isUsingKeyboard = false;
    const handleKeyDown = (e: KeyboardEvent) => { 
      isUsingKeyboard = true; 
      
      // Top-level focus guard: Ensure focus stays strictly inside the top-most active modal / overlay / player
      const playerEl = document.getElementById('player-container');
      const userSettingsEl = document.getElementById('user-settings-modal');
      const authModalEl = document.getElementById('auth-modal');
      const resumeModalEl = document.getElementById('resume-modal');
      const fixMatchModalEl = document.getElementById('fix-match-modal');
      const mediaModalEl = document.getElementById('media-modal');

      const topOverlay = playerEl || userSettingsEl || authModalEl || resumeModalEl || fixMatchModalEl || (mediaModalEl && !mediaModalEl.classList.contains('hidden') ? mediaModalEl : null);

      if (topOverlay) {
        const isBackKey = 
          ['Escape', 'Back', 'GoBack', 'BrowserBack', 'U+001B', 'SoftLeft', 'HistoryBack', 'NavigateBack', 'AndroidBack'].includes(e.key) ||
          ['Escape', 'Back', 'Backspace', 'GoBack', 'BrowserBack'].includes(e.code) ||
          [4, 27, 8, 10009, 461, 283, 166, 167, 198, 219, 220].includes(e.keyCode) ||
          [4, 27, 8, 10009, 461, 283, 166, 167, 198, 219, 220].includes(e.which) ||
          (e.key === 'Backspace' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA');

        if (isBackKey) {
          if (topOverlay === fixMatchModalEl) {
            e.preventDefault();
            e.stopPropagation();
            const closeBtn = fixMatchModalEl.querySelector('.close-fix-match') as HTMLElement;
            if (closeBtn) closeBtn.click();
            return;
          }
          if (topOverlay === playerEl) {
            e.preventDefault();
            e.stopPropagation();
            closePlayer();
            return;
          }
        }

        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          const dirMap: Record<string, string> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
          const dir = dirMap[e.key];
          if (dir) {
            e.preventDefault();
            SpatialNavigation.move(dir);
          }
        }
        return;
      }

      // Check D-Pad navigation between Sidebar and Main Content View
      const activeEl = document.activeElement as HTMLElement;
      const sidebarEl = document.getElementById('sidebar-nav');
      const isInsideSidebar = sidebarEl && activeEl && sidebarEl.contains(activeEl);

      if (isInsideSidebar) {
        if (e.key === 'ArrowUp') {
          // If at top of sidebar tabs (Home tab or first tab), move up to User Avatar button
          if (activeEl.id === 'nav-tab-home' || activeEl === sidebarEl.querySelector('.focusable, [tabindex="0"]')) {
            const userAvatarEl = document.getElementById('auth-user-button');
            if (userAvatarEl) {
              e.preventDefault();
              e.stopPropagation();
              userAvatarEl.focus();
            }
          }
        } else if (e.key === 'ArrowRight') {
          // Move from sidebar directly back into current active screen main content
          const mainViewEl = document.getElementById('main-content-view');
          if (mainViewEl) {
            const firstMainFocusable = mainViewEl.querySelector('.focusable, button, input, select, [tabindex="0"]') as HTMLElement;
            if (firstMainFocusable) {
              e.preventDefault();
              e.stopPropagation();
              firstMainFocusable.focus();
            }
          }
        }
      } else {
        // Currently inside main content view
        if (e.key === 'ArrowLeft') {
          const mainViewEl = document.getElementById('main-content-view');
          if (mainViewEl && activeEl && mainViewEl.contains(activeEl)) {
            const activeRect = activeEl.getBoundingClientRect();
            const mainRect = mainViewEl.getBoundingClientRect();
            // If focused item is on leftmost edge of main view (within 60px of container left)
            if (activeRect.left - mainRect.left < 60) {
              const currentTabEl = document.getElementById(`nav-tab-${activeTab}`) || document.getElementById('nav-tab-home');
              if (currentTabEl) {
                e.preventDefault();
                e.stopPropagation();
                currentTabEl.focus();
              }
            }
          }
        }
      }

      // Global fix for input type="range" trapping Android TV D-Pad Up/Down keys
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && document.activeElement?.tagName === 'INPUT') {
        const input = document.activeElement as HTMLInputElement;
        if (input.type === 'range') {
          e.preventDefault();
          SpatialNavigation.move(e.key === 'ArrowUp' ? 'up' : 'down');
        }
      }
    };
    const handleMouseDown = () => { isUsingKeyboard = false; };

    const handleGlobalFocus = (e: FocusEvent) => {
      // Only scroll into view if navigation is coming from keyboard/remote D-pad!
      // Prevent screen jumping and missed clicks when clicking with mouse/pointer!
      if (!isUsingKeyboard) return;

      const target = e.target as HTMLElement;
      if (target && target.scrollIntoView && target.tagName !== 'VIDEO' && target.id !== 'root') {
        try {
          target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        } catch (err) {}
      }
    };
    
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('focus', handleGlobalFocus, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('focus', handleGlobalFocus, true);
      SpatialNavigation.uninit();
    };
  }, [activeTab]);

  // Exit Toast state for Remote Back button handler
  const [showExitToast, setShowExitToast] = useState(false);
  const backPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastBackPressTimeRef = useRef<number>(0);

  // Remote Back Button Handler
  useEffect(() => {
    const handleRemoteBack = (e: KeyboardEvent) => {
      const isBackKey = 
        e.key === 'Escape' || 
        e.key === 'Back' || 
        e.key === 'BrowserBack' || 
        e.key === 'GoBack' || 
        e.keyCode === 27 || 
        e.keyCode === 461 || 
        e.keyCode === 10009 || 
        (e.keyCode === 8 && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement));

      if (!isBackKey) return;

      e.preventDefault();
      e.stopPropagation();

      // 1. If Video Player is open, exit video player
      if (playingUrl || isPlaying) {
        closePlayer();
        return;
      }

      // 2. If Media Modal is open, close media modal
      if (selectedMovie) {
        setSelectedMovie(null);
        return;
      }

      // 3. If Virtual Keyboard is open, close virtual keyboard
      if (isKeyboardOpen) {
        setIsKeyboardOpen(false);
        return;
      }

      // 4. If any Modal / Settings / Auth / Dropdown is open, close it
      const modalElement = document.querySelector('#user-settings-modal, #auth-modal, #auth-dropdown');
      if (modalElement) {
        const closeBtn = modalElement.querySelector('button[title="Close"], button.close-btn, button:has(svg)') as HTMLElement;
        if (closeBtn) {
          closeBtn.click();
        } else {
          window.dispatchEvent(new CustomEvent('closeActiveModal'));
        }
        return;
      }

      // 5. Check if active focus is currently inside the left navigation sidebar
      const activeEl = document.activeElement as HTMLElement;
      const sidebarEl = document.getElementById('sidebar-nav');
      const isInsideSidebar = sidebarEl && activeEl && sidebarEl.contains(activeEl);

      if (!isInsideSidebar) {
        // We are inside main content / grid -> Move focus directly to left navigation menu!
        const targetNavId = `nav-tab-${activeTab}`;
        const targetNavEl = document.getElementById(targetNavId) || document.getElementById('nav-tab-home');
        if (targetNavEl) {
          targetNavEl.focus();
        }
        return;
      }

      // 6. Focus is ALREADY inside left sidebar -> Double-press to exit handler!
      const now = Date.now();
      if (now - lastBackPressTimeRef.current < 3000) {
        // Pressed twice within 3 seconds -> Exit application!
        try {
          if ((window as any).electron?.close) {
            (window as any).electron.close();
          } else if (window.close) {
            window.close();
          }
        } catch (err) {}
      } else {
        // First press -> Show double-click to exit toast!
        lastBackPressTimeRef.current = now;
        setShowExitToast(true);
        if (backPressTimerRef.current) clearTimeout(backPressTimerRef.current);
        backPressTimerRef.current = setTimeout(() => {
          setShowExitToast(false);
        }, 3000);
      }
    };

    window.addEventListener('keydown', handleRemoteBack, true);
    return () => {
      window.removeEventListener('keydown', handleRemoteBack, true);
      if (backPressTimerRef.current) clearTimeout(backPressTimerRef.current);
    };
  }, [playingUrl, selectedMovie, isKeyboardOpen, activeTab]);

  const activePoster = activeTab === 'music' ? '/music_backdrop.jpg' : (hoveredPoster || (selectedMovie?.poster) || backgroundPoster);

  const selectRandomBackdrop = (itemsList: any[]) => {
    if (itemsList.length > 0) {
      const randomIndex = Math.floor(Math.random() * itemsList.length);
      const randomItem = itemsList[randomIndex];
      if (randomItem && randomItem.poster) {
        setBackgroundPoster(randomItem.poster);
      }
    } else {
      setBackgroundPoster('');
    }
  };

  useEffect(() => {
    if (!user) {
      setFavorites([]);
      setBackgroundPoster('');
      return;
    }

    const q = query(collection(db, 'favorites'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => doc.data());
      setFavorites(items);
      selectRandomBackdrop(items);
    }, (error) => {
      console.error('Error in onSnapshot for background backdrop:', error);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (favorites.length > 0) {
      selectRandomBackdrop(favorites);
    }
  }, [activeTab]);


  
  useEffect(() => {
    let timeout: any;
    const handleMouseMove = () => {
      setIsIdle(false);
      clearTimeout(timeout);
      timeout = setTimeout(() => setIsIdle(true), 6000);
    };
    if (isPlaying) {
      window.addEventListener('mousemove', handleMouseMove);
      timeout = setTimeout(() => setIsIdle(true), 6000);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(timeout);
    };
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying && selectedMovie) {
      const type = (selectedMovie.type === 'series' || !!selectedMovie.first_air_date) ? 'tv' : 'movie';
      const realId = selectedMovie.realTmdbId || (typeof selectedMovie.id === 'number' || (!isNaN(Number(selectedMovie.id)) && !String(selectedMovie.id).startsWith('local_')) ? selectedMovie.id : null);

      const fetchLogoForId = (tmdbId: any) => {
        const url = `https://api.themoviedb.org/3/${type}/${tmdbId}/images?api_key=b4d4dfa06829b83e3a8b08fc89372a9d&include_image_language=en,null`;
        fetch(url)
          .then(res => res.json())
          .then(data => {
            const logo = data.logos?.find((l: any) => l.iso_639_1 === 'en') || data.logos?.[0];
            if (logo) {
              setLogoUrl(getCachedImageUrl(logo.file_path) || '');
            } else {
              setLogoUrl(selectedMovie.poster || selectedMovie.backupPoster || '');
            }
          }).catch(() => { setLogoUrl(selectedMovie.poster || selectedMovie.backupPoster || ''); });
      };

      if (realId) {
        fetchLogoForId(realId);
      } else if (selectedMovie.title || selectedMovie.name) {
        // Resolve numeric TMDB ID by searching title for local items
        const cleanTitle = (selectedMovie.title || selectedMovie.name).replace(/\(.*?\)/g, '').trim();
        fetch(`https://api.themoviedb.org/3/search/${type}?api_key=b4d4dfa06829b83e3a8b08fc89372a9d&query=${encodeURIComponent(cleanTitle)}`)
          .then(res => res.json())
          .then(data => {
            const tmdbMatch = data.results?.[0];
            if (tmdbMatch?.id) {
              fetchLogoForId(tmdbMatch.id);
            } else {
              setLogoUrl(selectedMovie.poster || selectedMovie.backupPoster || '');
            }
          }).catch(() => setLogoUrl(selectedMovie.poster || selectedMovie.backupPoster || ''));
      } else {
        setLogoUrl(selectedMovie.poster || selectedMovie.backupPoster || '');
      }
    } else {
      setLogoUrl('');
    }
  }, [isPlaying, selectedMovie]);


  
  const applySeek = (newTime: number, immediate: boolean = false) => {
    setSeekTarget(newTime);
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    
    seekTimeoutRef.current = setTimeout(() => {
      setStreamOffset(Math.floor(newTime));
      setCurrentTime(0);
      setBufferedSeconds(0);
      setSeekTarget(null);
      setPlayerStatus('BUFFERING...');
    }, immediate ? 50 : 500);
  };

  const handleSeek = (secondsToAdd: number) => {
    if (!totalDuration) return;
    
    const baseTime = seekTarget !== null 
      ? seekTarget 
      : streamOffset + (videoRef.current?.currentTime || 0);
      
    let newTime = baseTime + secondsToAdd;
    if (newTime < 0) newTime = 0;
    if (newTime > totalDuration) newTime = totalDuration;
    
    applySeek(newTime);
  };

  useEffect(() => {
    if (!isPlaying) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') {
        handleSeek(30);
      } else if (e.key === 'ArrowLeft') {
        handleSeek(-15);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPlaying, totalDuration]);

  const handleVideoTimeUpdate = (currentTimeInVideo: number) => {
    if (currentTimeInVideo > 0) setIsVideoLoaded(true);
    setCurrentTime(currentTimeInVideo);

    const currentSec = streamOffset + currentTimeInVideo;
    if (skipSegments.length > 0) {
      const activeSeg = skipSegments.find(s => currentSec >= s.start && currentSec < s.end);
      setActiveSkipSegment(activeSeg || null);

      if (activeSeg) {
        const segId = `${activeSeg.type}_${activeSeg.start}_${activeSeg.end}`;
        const isIntro = activeSeg.type.includes('intro') || activeSeg.type.includes('recap');
        const isCredits = activeSeg.type.includes('credit') || activeSeg.type.includes('outro');

        if (isIntro && userSettings.autoSkipIntros && lastAutoSkippedSeg !== segId) {
          setLastAutoSkippedSeg(segId);
          logger.info(`[TIDB Auto-Skip] Automatically skipping intro segment to ${activeSeg.end}s`);
          console.log(`[TIDB Auto-Skip] Skipped segment:`, activeSeg);
          setActiveSkipSegment(null);
          if (videoRef.current) {
            try {
              videoRef.current.currentTime = Math.max(0, activeSeg.end - streamOffset);
            } catch (e) {}
          }
          applySeek(activeSeg.end, true);
        } else if (isCredits && userSettings.autoSkipCredits && lastAutoSkippedSeg !== segId) {
          setLastAutoSkippedSeg(segId);
          logger.info(`[TIDB Auto-Skip] Automatically skipping credits segment to ${activeSeg.end}s`);
          console.log(`[TIDB Auto-Skip] Skipped segment:`, activeSeg);
          setActiveSkipSegment(null);
          if (videoRef.current) {
            try {
              videoRef.current.currentTime = Math.max(0, activeSeg.end - streamOffset);
            } catch (e) {}
          }
          applySeek(activeSeg.end, true);
        }
      }
    }
  };

  const savePlaybackProgress = (explicitTime?: number) => {
    if (!playingContext || !user || !playingContext.id || playingContext.isLive) return;

    const currentAbsoluteTime = explicitTime !== undefined 
      ? explicitTime 
      : streamOffset + (videoRef.current?.currentTime || 0);
    const total = totalDuration || 0;

    if (currentAbsoluteTime <= 0) return;

    const progressRef = { collectionName: 'user_progress', id: `${user.uid}_${playingContext.id}` };

    if (total > 0 && (currentAbsoluteTime >= total * 0.90 || currentAbsoluteTime >= total - 15)) {
      deleteDoc(progressRef).catch(err => console.error("Failed to delete finished progress:", err));
      const watchedId = playingContext.type === 'tv'
        ? `${user.uid}_${playingContext.id}_s${playingContext.season}_e${playingContext.episode}`
        : `${user.uid}_${playingContext.id}`;
      setDoc({ collectionName: 'user_watched', id: watchedId }, {
        userId: user.uid,
        mediaId: playingContext.id,
        type: playingContext.type,
        season: playingContext.season || null,
        episode: playingContext.episode || null,
        watched: true,
        updatedAt: serverTimestamp()
      }, { merge: true }).catch(err => console.error("Failed to save watched status:", err));
    } else {
      setDoc(progressRef, {
        userId: user.uid,
        mediaId: playingContext.id,
        type: playingContext.type,
        season: playingContext.season || null,
        episode: playingContext.episode || null,
        currentTime: currentAbsoluteTime,
        totalDuration: total,
        updatedAt: serverTimestamp(),
        percentage: total > 0 ? (currentAbsoluteTime / total) * 100 : 0
      }, { merge: true }).catch(err => console.error("Failed to save progress:", err));
    }
  };

  const closePlayer = () => {
    savePlaybackProgress();

    setIsPlaying(false); 
    setIsVideoLoaded(false);
    setPlayerStatus('STREAM READY'); 
    setPlayingUrl('');
    setPlayingContext(null);
    setStreamOffset(0);
    setCurrentTime(0);
    setBufferedSeconds(0);
    setTotalDuration(0);
    setSelectedAudioTrack(0);
    setSelectedSubtitleTrack(null);
    setMediaInfo(null);
  };

  useEffect(() => {
    if (isPlaying) {
      setIsVideoLoaded(false);
    }
  }, [isPlaying, playingUrl]);

  // Periodically save playback progress
  useEffect(() => {
    if (!isPlaying || !playingContext || !user) return;
    
    const interval = setInterval(() => {
      savePlaybackProgress();
    }, 10000); // Save every 10 seconds

    return () => clearInterval(interval);
  }, [isPlaying, playingContext, streamOffset, totalDuration, user]);

  useEffect(() => {
    if (isPlaying && playingUrl) {
      const abortController = new AbortController();
      let probeTimeout: ReturnType<typeof setTimeout>;

      if (playingContext?.isLive) {
        setTotalDuration(0); // Live streams don't have a fixed duration
      } else {
        const isLocalMedia = playingUrl.startsWith('/') || playingUrl.includes('/api/local-media/stream');
        const probeDelay = isLocalMedia ? 50 : 3000;

        probeTimeout = setTimeout(() => {
          fetch(`/api/duration?url=${encodeURIComponent(playingUrl)}`, { signal: abortController.signal })
            .then(res => res.json())
            .then(data => {
              if (data.duration) setTotalDuration(Number(data.duration));
              
              // Fetch media info immediately after duration
              return fetch(`/api/media-info?url=${encodeURIComponent(playingUrl)}`, { signal: abortController.signal });
            })
            .then(res => res ? res.json() : null)
            .then(data => {
              if (data) setMediaInfo(data);
            })
            .catch(e => {
              if (e.name !== 'AbortError') console.error("Metadata fetch error:", e);
            });
        }, probeDelay);

          
        if (playingContext?.id) {
          let osUrl = `/api/opensubtitles/search?tmdb_id=${playingContext.id}&type=${playingContext.type}`;
          if (selectedMovie?.title || selectedMovie?.name) {
            osUrl += `&title=${encodeURIComponent(selectedMovie.title || selectedMovie.name)}`;
          }
          if (playingContext.type === 'tv') {
            osUrl += `&season=${playingContext.season}&episode=${playingContext.episode}`;
          }
          fetch(osUrl, { signal: abortController.signal })
            .then(res => res.json())
            .then(data => {
              if (data.subtitles) setOpenSubtitles(data.subtitles);
            }).catch(e => {
              if (e.name !== 'AbortError') console.error("OpenSubtitles fetch error:", e);
            });
        }

      }

      return () => {
        clearTimeout(probeTimeout);
        abortController.abort();
      };
    }
  }, [isPlaying, playingUrl, playingContext]);

  // Spatial Navigation for Player
  useEffect(() => {
    if (isPlaying && (!(window as any).mediaAPI || userSettings.playerPath === 'builtin')) {
      SpatialNavigation.add('player-container', {
        selector: '#player-container .focusable',
        restrict: 'self-first',
        enterTo: 'last-focused'
      });
      SpatialNavigation.makeFocusable('player-container');
      SpatialNavigation.focus('player-container');
      
      return () => {
        SpatialNavigation.remove('player-container');
      };
    }
  }, [isPlaying, userSettings.playerPath]);

  const handlePlayStream = async (url: string, channelLogoUrl?: string, resumeTime?: number, context?: any) => {
    logger.info("Built-in Player: Requesting to play stream", { url });
    
    // Auto-detect live streams (IPTV/HLS) if not explicitly set
    let finalContext = context || {};
    if (!finalContext.isLive && (url.includes('.m3u8') || url.includes('.ts') || url.includes('/ts/stream'))) {
      finalContext = { ...finalContext, isLive: true };
    }
    setPlayingContext(finalContext);

    if (finalContext?.movie && !selectedMovie) {
      setSelectedMovie(finalContext.movie);
    }

    // If starting from beginning (resumeTime is 0 or not provided), delete any existing progress record in DB
    if ((!resumeTime || resumeTime === 0) && finalContext?.id && user?.uid) {
      const progressRef = { collectionName: 'user_progress', id: `${user.uid}_${finalContext.id}` };
      deleteDoc(progressRef).catch(err => console.error("Failed to reset progress:", err));
    }

    setStreamOffset(resumeTime || 0);

    // Native Android TV ExoPlayer integration
    if ((window as any).AndroidBridge || (window as any).playNativeMedia) {
      const fullStreamUrl = url.startsWith('/') ? `${window.location.origin}${url}` : url;
      const mediaTitle = selectedMovie?.title || selectedMovie?.name || finalContext?.title || 'BubbaFlix Stream';
      const mediaId = finalContext?.id || selectedMovie?.id || '';
      const startMs = (resumeTime || 0) * 1000;
      if ((window as any).playNativeMedia && (window as any).playNativeMedia(fullStreamUrl, mediaTitle, mediaId, startMs, '')) {
        return;
      }
    }
    
    setCurrentTime(0);
    setBufferedSeconds(0);
    setTotalDuration(0);
    setSelectedAudioTrack(0);
    setSelectedSubtitleTrack(null);
    setSelectedSubtitleIsOS(false);
    setOpenSubtitles([]);
    setMediaInfo(null);
    setPlayerStatus('BUFFERING...');
    
    setSkipSegments([]);
    setActiveSkipSegment(null);
    setLastAutoSkippedSeg(null);

    const targetMediaId = selectedMovie?.realTmdbId || selectedMovie?.tmdbId || selectedMovie?.id || finalContext?.id;
    const isTv = finalContext?.type === 'tv' || selectedMovie?.type === 'series';
    const seasonNum = finalContext?.season;
    const episodeNum = finalContext?.episode;

    if (targetMediaId && !finalContext?.isLive) {
      logger.info(`[TIDB] Querying intro/credit skip segments for TMDB #${targetMediaId}...`);
      fetch(`/api/skip-segments?tmdbId=${targetMediaId}&type=${isTv ? 'tv' : 'movie'}${seasonNum ? `&season=${seasonNum}` : ''}${episodeNum ? `&episode=${episodeNum}` : ''}${systemSettings.tidbApiKey ? `&apiKey=${encodeURIComponent(systemSettings.tidbApiKey)}` : ''}`)
        .then(r => r.json())
        .then(data => {
          if (data?.success && Array.isArray(data.segments) && data.segments.length > 0) {
            if (data.isAiGenerated) {
              logger.info(`[TIDB AI Fallback] Generated ${data.segments.length} skip segment(s) using AI Media Analysis Engine`);
              console.log('[TIDB AI Fallback] AI Analysis generated segments:', data.segments);
            } else {
              logger.info(`[TIDB] Successfully loaded ${data.segments.length} segment(s) from TheIntroDB database`);
              console.log('[TIDB] Skip segments retrieved:', data.segments);
            }
            setSkipSegments(data.segments);
          } else {
            logger.info(`[TIDB] No skip segments available for TMDB #${targetMediaId}`);
          }
        })
        .catch(err => {
          logger.error(`[TIDB Error] Failed to fetch skip segments for TMDB #${targetMediaId}:`, err);
        });
    }

    if (channelLogoUrl) {
      setLogoUrl(channelLogoUrl);
    } else if (activeTab === 'tv') {
      setLogoUrl('');
    }
    
    setIsPlaying(true);
    setPlayingUrl(url);
    
    let savedPlayer = 'mpv';
    if (url.includes('127.0.0.1')) {
      savedPlayer = userSettings.playerPath || 'mpv';
    }

    if ((window as any).mediaAPI && savedPlayer !== 'builtin') {
      try {
        (window as any).mediaAPI.playStream(url);
        setPlayerStatus('PLAYING 4K HDR');
      } catch (e) {
        setPlayerStatus('ERROR SPAWNING MPV');
      }
    }
  };

  return (
    <>
      <AuthModal />
      {firstAdminPassword && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-lg px-4">
          <div className="bg-amber-950/95 border border-amber-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-md flex gap-4 items-start">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-amber-300 font-bold text-sm mb-1">Your Admin Password (save this now!)</p>
              <p className="text-white/60 text-xs mb-2">This is the only time your auto-generated password will be shown.</p>
              <code className="block bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-amber-300 font-mono text-lg font-bold tracking-widest select-all">{firstAdminPassword}</code>
            </div>
            <button
              onClick={() => { setFirstAdminPassword(null); sessionStorage.removeItem('firstAdminPassword'); }}
              className="text-white/30 hover:text-white transition-colors shrink-0 mt-0.5"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
      <div 
        className="bg-[#050507] text-white font-sans flex overflow-hidden select-none relative w-full h-full"
      >
      {isPlaying && (!(window as any).mediaAPI || userSettings.playerPath === 'builtin') && (
        <div id="player-container" className="fixed inset-0 z-[100] bg-black flex flex-col">
          <div className={`absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-[110] bg-gradient-to-b from-black/80 to-transparent pointer-events-none transition-opacity duration-500 ${isIdle ? 'opacity-0' : 'opacity-100'}`}>
            <div className="flex gap-4 pointer-events-auto items-center">
              <button 
                onClick={closePlayer}
                className="focusable p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-colors shadow-lg focus:outline-none focus:ring-4 focus:ring-white/50"
                title="Go Back"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              {logoUrl ? (
                <img 
                  src={logoUrl} 
                  alt="Logo" 
                  className="h-28 object-contain filter drop-shadow-2xl" 
                  onError={() => {
                    if (selectedMovie?.poster && logoUrl !== selectedMovie.poster) {
                      setLogoUrl(selectedMovie.poster);
                    } else {
                      setLogoUrl('');
                    }
                  }}
                />
              ) : selectedMovie ? (
                <div className="flex flex-col">
                  <h1 className="text-white text-2xl font-black tracking-wide drop-shadow-md">{selectedMovie.title || selectedMovie.name}</h1>
                  {selectedMovie.year && <span className="text-xs text-white/70 font-semibold">{selectedMovie.year} • Local Media File</span>}
                </div>
              ) : null}

            </div>
              {showMediaInfo && mediaInfo && (
                <div className="absolute top-24 right-10 bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 min-w-72 shadow-2xl z-[120] pointer-events-auto transform transition-all animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-3">
                    <h2 className="text-white font-bold text-lg flex items-center gap-2"><Info className="w-5 h-5 text-red-500"/> Media Info</h2>
                    <button onClick={() => setShowMediaInfo(false)} className="focusable text-white/40 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"><X className="w-5 h-5"/></button>
                  </div>
                  <div className="flex flex-col gap-3 text-sm">
                    <div className="flex justify-between items-center"><span className="text-white/50 font-medium">Transcoder</span> <span className="text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded text-xs font-bold">{mediaInfo.activeTranscoder || (detectDeviceCapabilities().canDirectPlay ? `Direct Play (${detectDeviceCapabilities().deviceName})` : (playingContext?.isHevc ? (systemSettings.intelTranscoding ? 'Intel VAAPI (GPU)' : 'FFmpeg (CPU)') : 'Direct Stream Pass-through'))}</span></div>
                    <div className="flex justify-between items-center"><span className="text-white/50 font-medium">Container</span> <span className="text-white font-mono bg-white/5 px-2 py-1 rounded">{(mediaInfo.format?.format_name || '').split(',')[0].toUpperCase()}</span></div>
                    <div className="flex justify-between items-center"><span className="text-white/50 font-medium">Bitrate</span> <span className="text-white font-mono bg-white/5 px-2 py-1 rounded">{Math.round((mediaInfo.format?.bit_rate || 0)/1000)} kbps</span></div>
                    {mediaInfo.streams?.filter((s: any) => s.codec_type === 'video')[0] && (
                      <>
                        <div className="flex justify-between items-center"><span className="text-white/50 font-medium">Video Codec</span> <span className="text-white font-mono bg-white/5 px-2 py-1 rounded">{mediaInfo.streams.find((s: any) => s.codec_type === 'video').codec_name?.toUpperCase() || 'N/A'}</span></div>
                        <div className="flex justify-between items-center"><span className="text-white/50 font-medium">Resolution</span> <span className="text-white font-mono bg-white/5 px-2 py-1 rounded">{mediaInfo.streams.find((s: any) => s.codec_type === 'video').width}x{mediaInfo.streams.find((s: any) => s.codec_type === 'video').height}</span></div>
                      </>
                    )}

                    {mediaInfo.streams?.filter((s: any) => s.codec_type === 'audio').length > 0 && (
                      <div className="flex justify-between items-center"><span className="text-white/50 font-medium">Audio Tracks</span> <span className="text-white font-mono bg-white/5 px-2 py-1 rounded">{mediaInfo.streams.filter((s: any) => s.codec_type === 'audio').length}</span></div>
                    )}
                    {mediaInfo.streams?.filter((s: any) => s.codec_type === 'subtitle').length > 0 && (
                      <div className="flex justify-between items-center"><span className="text-white/50 font-medium">Subtitles</span> <span className="text-white font-mono bg-white/5 px-2 py-1 rounded">{mediaInfo.streams.filter((s: any) => s.codec_type === 'subtitle').length}</span></div>
                    )}
                  {bufferedSeconds > 0 && (
                    <div className="flex justify-between items-center"><span className="text-white/50 font-medium">Stream Buffer</span> <span className="text-white font-mono bg-white/5 px-2 py-1 rounded">{Math.round(bufferedSeconds)}s</span></div>
                  )}
                  </div>
                </div>
              )}
          </div>
          <div className="flex-1 w-full h-full relative flex items-center justify-center bg-black overflow-hidden">
            {/* Glowing Loader & TMDB Backdrop Player Overlay while video is loading/buffering */}
            {!isVideoLoaded && (
              <div className="absolute inset-0 z-40 bg-[#06060a] flex flex-col items-center justify-center pointer-events-none">
                {playingContext?.activePoster && (
                  <div className="absolute inset-0 overflow-hidden opacity-35">
                    <img 
                      src={playingContext.activePoster} 
                      alt="" 
                      className="w-full h-full object-cover blur-sm scale-105"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#06060a] via-[#06060a]/60 to-[#06060a]/80"></div>
                  </div>
                )}
                <div className="relative z-10 flex flex-col items-center gap-4 text-center px-4">
                  <Loader2 className="w-12 h-12 text-red-500 animate-spin drop-shadow-[0_0_15px_rgba(239,68,68,0.6)]" />
                  <span className="text-white/80 font-mono text-sm tracking-wider uppercase animate-pulse font-semibold">
                    {playerStatus || 'Loading Stream...'}
                  </span>
                  {selectedMovie && (
                    <div className="flex flex-col items-center gap-1 mt-2 max-w-lg">
                      <span className="text-white text-xl font-bold tracking-tight truncate drop-shadow-lg">{selectedMovie.title || selectedMovie.name}</span>
                      {selectedMovie.year && <span className="text-white/60 text-xs font-mono">{selectedMovie.year}</span>}
                    </div>
                  )}
                </div>
              </div>
            )}

          {playingUrl ? (
            <>
              {playingContext?.isLive ? (
                <video 
                  key={`${playingUrl}-${playingContext?.backupIndex || 0}`}
                  ref={videoRef}
                  src={playingUrl}
                  autoPlay
                  className="w-full h-full object-contain absolute top-0 left-0"
                  onError={(e) => {
                    const error = e.currentTarget.error;
                    console.error("Built-in Player Error (Live TV)", { 
                      code: error?.code, 
                      message: error?.message, 
                      src: e.currentTarget.src 
                    });

                    // Automatic IPTV Stream Failover to Backup URL
                    if (playingContext?.backupUrls && Array.isArray(playingContext.backupUrls) && playingContext.backupUrls.length > 0) {
                      const nextBackupIndex = (playingContext.backupIndex || 0);
                      if (nextBackupIndex < playingContext.backupUrls.length) {
                        const backupUrl = playingContext.backupUrls[nextBackupIndex];
                        console.warn(`[Stream Failover] Main stream failed. Automatically switching to Backup #${nextBackupIndex + 1}: ${backupUrl}`);
                        
                        setPlayingContext({
                          ...playingContext,
                          backupIndex: nextBackupIndex + 1
                        });
                        setPlayingUrl(backupUrl);
                        setPlayerStatus(`SWITCHING TO BACKUP #${nextBackupIndex + 1}...`);
                        return;
                      }
                    }

                    setPlayerStatus("ERROR: Video failed to load.");
                  }}
                  onPlay={() => { 
                    setIsVideoPlaying(true); 
                    setIsVideoLoaded(true);
                    setPlayerStatus(""); // Clear buffering text when playing
                  }}
                  onCanPlay={() => {
                    setIsVideoLoaded(true);
                  }}
                  onPause={() => { 
                    setIsVideoPlaying(false); 
                  }}
                  onEnded={closePlayer}
                  onWaiting={() => { 
                    setPlayerStatus("BUFFERING..."); 
                  }}
                />
              ) : selectedSubtitleTrack !== null ? (
                <video 
                  key={`${playingUrl}-${selectedAudioTrack}-${selectedSubtitleTrack}-${subtitleOffset}`}
                  ref={videoRef}
                  src={`/api/transcode/stream.mp4?url=${encodeURIComponent(playingUrl)}&start=${streamOffset}&hevc=${playingContext?.isHevc === true}&audio=${encodeURIComponent(selectedAudioTrack || userSettings.audioLanguage || 'eng')}&sub=${encodeURIComponent(userSettings.ccLanguage || 'eng')}&autoCC=${userSettings.autoCC !== false}&leveling=${userSettings.enableAudioLeveling !== false}&bufsize=${Math.max(16, Math.round((15000000 * parseInt(systemSettings.streamBufferSeconds || '60', 10)) / 8000000))}M&intel=${systemSettings.intelTranscoding === true}&live=${playingContext?.isLive ? 'true' : 'false'}&direct=${detectDeviceCapabilities().canDirectPlay}`}
                  autoPlay
                  className="w-full h-full object-contain absolute top-0 left-0"
                  onTimeUpdate={(e) => {
                    handleVideoTimeUpdate(e.currentTarget.currentTime);
                    if (e.currentTarget.buffered.length > 0) {
                      setBufferedSeconds(e.currentTarget.buffered.end(e.currentTarget.buffered.length - 1));
                    }
                  }}
                  onProgress={(e) => {
                    if (e.currentTarget.buffered.length > 0) {
                      setBufferedSeconds(e.currentTarget.buffered.end(e.currentTarget.buffered.length - 1));
                    }
                  }}
                  onError={(e) => {
                    const error = e.currentTarget.error;
                    console.error("Built-in Player Error", { 
                      code: error?.code, 
                      message: error?.message, 
                      src: e.currentTarget.src 
                    });
                    setPlayerStatus("ERROR: Video failed to load.");
                  }}
                  onPlay={() => { 
                    setIsVideoPlaying(true); 
                    setIsVideoLoaded(true);
                    setPlayerStatus("PLAYING 4K HDR"); 
                  }}
                  onCanPlay={() => {
                    setIsVideoLoaded(true);
                  }}
                  onPause={() => { 
                    setIsVideoPlaying(false); 
                    savePlaybackProgress();
                  }}
                  onEnded={closePlayer}
                  onWaiting={() => { 
                    setPlayerStatus("BUFFERING..."); 
                  }}
                >
                  <track 
                    kind="subtitles" 
                    src={selectedSubtitleIsOS ? `/api/opensubtitles/download?url=${encodeURIComponent(selectedSubtitleTrack as string)}&start=${streamOffset}&delay=${subtitleOffset}` : `/api/transcode/subtitle.vtt?url=${encodeURIComponent(playingUrl)}&track=${selectedSubtitleTrack}&start=${streamOffset}&delay=${subtitleOffset}`} 
                    srcLang="en" 
                    default 
                  />
                </video>

              ) : (
                <video 
                  key={`${playingUrl}-${selectedAudioTrack}`}
                  ref={videoRef}
                  src={`/api/transcode/stream.mp4?url=${encodeURIComponent(playingUrl)}&start=${streamOffset}&hevc=${playingContext?.isHevc === true}&audio=${encodeURIComponent(selectedAudioTrack || userSettings.audioLanguage || 'eng')}&sub=${encodeURIComponent(userSettings.ccLanguage || 'eng')}&autoCC=${userSettings.autoCC !== false}&leveling=${userSettings.enableAudioLeveling !== false}&bufsize=${Math.max(16, Math.round((15000000 * parseInt(systemSettings.streamBufferSeconds || '60', 10)) / 8000000))}M&intel=${systemSettings.intelTranscoding === true}&live=${playingContext?.isLive ? 'true' : 'false'}&direct=${detectDeviceCapabilities().canDirectPlay}`}
                  autoPlay
                  className="w-full h-full object-contain absolute top-0 left-0"
                  onTimeUpdate={(e) => {
                    handleVideoTimeUpdate(e.currentTarget.currentTime);
                    if (e.currentTarget.buffered.length > 0) {
                      setBufferedSeconds(e.currentTarget.buffered.end(e.currentTarget.buffered.length - 1));
                    }
                  }}
                  onProgress={(e) => {
                    if (e.currentTarget.buffered.length > 0) {
                      setBufferedSeconds(e.currentTarget.buffered.end(e.currentTarget.buffered.length - 1));
                    }
                  }}
                  onError={(e) => {
                    const error = e.currentTarget.error;
                    console.error("Built-in Player Error", { 
                      code: error?.code, 
                      message: error?.message, 
                      src: e.currentTarget.src 
                    });

                    // Automatic IPTV Stream Failover to Backup URL
                    if (playingContext?.backupUrls && Array.isArray(playingContext.backupUrls) && playingContext.backupUrls.length > 0) {
                      const nextBackupIndex = (playingContext.backupIndex || 0);
                      if (nextBackupIndex < playingContext.backupUrls.length) {
                        const backupUrl = playingContext.backupUrls[nextBackupIndex];
                        console.warn(`[Stream Failover] Main stream failed. Automatically switching to Backup #${nextBackupIndex + 1}: ${backupUrl}`);
                        
                        setPlayingContext({
                          ...playingContext,
                          backupIndex: nextBackupIndex + 1
                        });
                        setPlayingUrl(backupUrl);
                        setPlayerStatus(`SWITCHING TO BACKUP #${nextBackupIndex + 1}...`);
                        return;
                      }
                    }

                    setPlayerStatus("ERROR: Video failed to load.");
                  }}
                  onPlay={() => { 
                    setIsVideoPlaying(true); 
                    setIsVideoLoaded(true);
                    setPlayerStatus("PLAYING 4K HDR"); 
                  }}
                  onCanPlay={() => {
                    setIsVideoLoaded(true);
                  }}
                  onPause={() => { 
                    setIsVideoPlaying(false); 
                    savePlaybackProgress();
                  }}
                  onEnded={closePlayer}
                  onWaiting={() => { 
                    setPlayerStatus("BUFFERING..."); 
                  }}
                />
              )}

              {/* TheIntroDB Skip Segment Interactive Overlay Button */}
              {(() => {
                if (!activeSkipSegment) return null;
                const isIntroSeg = activeSkipSegment.type.includes('intro') || activeSkipSegment.type.includes('recap');
                const isCreditsSeg = activeSkipSegment.type.includes('credit') || activeSkipSegment.type.includes('outro');
                const isAutoSkipActive = (isIntroSeg && userSettings.autoSkipIntros) || (isCreditsSeg && userSettings.autoSkipCredits);
                
                if (isAutoSkipActive) return null;

                return (
                  <div className="absolute bottom-28 right-8 z-[140] animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <button
                      onClick={() => {
                        const targetSeg = activeSkipSegment;
                        logger.info(`[TIDB Manual-Skip] User clicked ${targetSeg.label} to skip to ${targetSeg.end}s`);
                        console.log(`[TIDB Manual-Skip] Skipped segment:`, targetSeg);
                        setActiveSkipSegment(null);
                        if (videoRef.current) {
                          try {
                            videoRef.current.currentTime = Math.max(0, targetSeg.end - streamOffset);
                          } catch (e) {}
                        }
                        applySeek(targetSeg.end, true);
                      }}
                      className="focusable flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm tracking-wide shadow-2xl backdrop-blur-md border border-white/20 hover:scale-105 transition-all cursor-pointer focus:outline-none focus:ring-4 focus:ring-red-400"
                    >
                      <SkipForward className="w-5 h-5" />
                      <span>{activeSkipSegment.label}</span>
                    </button>
                  </div>
                );
              })()}
              <div className={`absolute bottom-0 left-0 right-0 p-8 pb-12 flex flex-col gap-4 z-[110] bg-gradient-to-t from-black/90 to-transparent pointer-events-none transition-opacity duration-500 ${isIdle ? 'opacity-0' : 'opacity-100'}`}>
                <div className="flex items-center gap-6 pointer-events-auto w-full max-w-5xl mx-auto">
                  <button 
                    onClick={() => handleSeek(-15)}
                    className="focusable p-3 rounded-full hover:bg-white/10 text-white transition-colors focus:outline-none focus:ring-4 focus:ring-white/50"
                    title="Rewind 15s"
                  >
                    <Rewind className="w-6 h-6" />
                  </button>
                  <button 
                    onClick={() => {
                      if (videoRef.current) {
                        if (isVideoPlaying) videoRef.current.pause();
                        else videoRef.current.play();
                      }
                    }}
                    className="focusable p-4 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-colors focus:outline-none focus:ring-4 focus:ring-white/50"
                  >
                    {isVideoPlaying ? <span className="font-bold text-lg leading-none">||</span> : <Play className="w-6 h-6 fill-current" />}
                  </button>
                  <button 
                    onClick={() => handleSeek(30)}
                    className="focusable p-3 rounded-full hover:bg-white/10 text-white transition-colors focus:outline-none focus:ring-4 focus:ring-white/50"
                    title="Forward 30s"
                  >
                    <FastForward className="w-6 h-6" />
                  </button>
                  <div className="text-white text-sm font-mono font-medium drop-shadow-md">
                    {formatTime(seekTarget !== null ? seekTarget : streamOffset + currentTime)}
                  </div>
                  <div 
                    className="flex-1 bg-white/20 h-3 rounded-full overflow-hidden relative shadow-inner cursor-pointer"
                    onClick={(e) => {
                      if (!totalDuration) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const percentage = x / rect.width;
                      const newTime = percentage * totalDuration;
                      applySeek(newTime);
                    }}
                  >
                    <div 
                      className="absolute top-0 left-0 bottom-0 bg-white/30 transition-all duration-300 pointer-events-none" 
                      style={{ width: `${totalDuration > 0 ? ((streamOffset + bufferedSeconds) / totalDuration) * 100 : 0}%` }}
                    />
                    <div 
                      className="absolute top-0 left-0 bottom-0 bg-red-500 transition-all duration-300 pointer-events-none" 
                      style={{ width: `${totalDuration > 0 ? ((seekTarget !== null ? seekTarget : streamOffset + currentTime) / totalDuration) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="text-white/80 text-sm font-mono font-medium drop-shadow-md mr-4">
                    {formatTime(totalDuration)}
                  </div>
                  <div className="flex items-center gap-2 border-l border-white/20 pl-6 relative">
                    <button onClick={() => { setShowSubtitleMenu(!showSubtitleMenu); setShowAudioMenu(false); }} className={`focusable text-white/70 hover:text-white p-2 rounded-full transition-colors ${showSubtitleMenu ? 'bg-white/20 text-white' : 'hover:bg-white/10'} focus:outline-none focus:ring-4 focus:ring-white/50`} title="Subtitles / CC">
                      <Subtitles className="w-5 h-5" />
                    </button>
                    <button onClick={() => { setShowAudioMenu(!showAudioMenu); setShowSubtitleMenu(false); }} className={`focusable text-white/70 hover:text-white p-2 rounded-full transition-colors ${showAudioMenu ? 'bg-white/20 text-white' : 'hover:bg-white/10'} focus:outline-none focus:ring-4 focus:ring-white/50`} title="Audio Track">
                      <AudioLines className="w-5 h-5" />
                    </button>
                    <button onClick={() => setShowMediaInfo(!showMediaInfo)} className={`focusable text-white/70 hover:text-white p-2 rounded-full transition-colors ${showMediaInfo ? 'bg-white/20 text-white' : 'hover:bg-white/10'} focus:outline-none focus:ring-4 focus:ring-white/50`} title="Media Info (Codec, Bitrate)">
                      <Info className="w-5 h-5" />
                    </button>
                    
                    {/* Popover Menus */}
                    {(showSubtitleMenu || showAudioMenu) && (
                      <div className="absolute bottom-16 right-0 bg-black/95 border border-white/20 rounded-xl p-4 min-w-64 shadow-2xl flex flex-col gap-2 max-h-64 overflow-y-auto z-[130] backdrop-blur-xl">
                        {showAudioMenu && mediaInfo && (
                          <>
                            <h3 className="text-white/50 font-bold text-xs uppercase tracking-wider border-b border-white/20 pb-2 mb-2">Audio Tracks</h3>
                            {mediaInfo.streams?.filter((s: any) => s.codec_type === 'audio').map((stream: any, idx: number) => (
                              <button 
                                key={idx}
                                tabIndex={0}
                                onClick={() => { setSelectedAudioTrack(stream.index); setShowAudioMenu(false); }}
                                className={`focusable text-left text-sm px-3 py-2 rounded transition-colors ${selectedAudioTrack === stream.index ? 'bg-red-600 text-white font-medium shadow-lg' : 'text-white/80 hover:bg-white/10 hover:text-white'} focus:outline-none focus:ring-2 focus:ring-red-500`}
                              >
                                {stream.tags?.language ? stream.tags.language.toUpperCase() : 'Track'} {idx + 1} - {stream.codec_name?.toUpperCase() || 'UNKNOWN'} {stream.channels ? `(${stream.channels}ch)` : ''}
                              </button>
                            ))}
                          </>
                        )}
                        {showSubtitleMenu && (
                            <>
                              <h3 className="text-white/50 font-bold text-xs uppercase tracking-wider border-b border-white/20 pb-2 mb-2">Subtitles</h3>
                              <button 
                                  tabIndex={0}
                                  onClick={() => { setSelectedSubtitleTrack(null); setSelectedSubtitleIsOS(false); setShowSubtitleMenu(false); }}
                                  className={`focusable text-left text-sm px-3 py-2 rounded transition-colors ${selectedSubtitleTrack === null ? 'bg-red-600 text-white font-medium shadow-lg' : 'text-white/80 hover:bg-white/10 hover:text-white'} focus:outline-none focus:ring-2 focus:ring-red-500`}
                                >
                                  None (Off)
                                </button>

                              {/* Embedded Video Subtitles */}
                              {mediaInfo?.streams?.filter((s: any) => s.codec_type === 'subtitle').length > 0 && (
                                <>
                                  <h4 className="text-white/40 font-semibold text-[10px] uppercase tracking-wider mt-3 mb-1">Embedded File Tracks</h4>
                                  {mediaInfo.streams.filter((s: any) => s.codec_type === 'subtitle').map((stream: any, subIdx: number) => {
                                    const lang = stream.tags?.language ? stream.tags.language.toUpperCase() : `Track ${subIdx + 1}`;
                                    const title = stream.tags?.title ? `(${stream.tags.title})` : '';
                                    const codec = stream.codec_name ? stream.codec_name.toUpperCase() : '';
                                    const isSelected = selectedSubtitleTrack === subIdx && !selectedSubtitleIsOS;
                                    return (
                                      <button 
                                        key={`emb-${subIdx}`}
                                        tabIndex={0}
                                        onClick={() => { 
                                          setSelectedSubtitleTrack(subIdx); 
                                          setSelectedSubtitleIsOS(false); 
                                          setShowSubtitleMenu(false); 
                                        }}
                                        className={`focusable text-left text-sm px-3 py-2 rounded transition-colors ${isSelected ? 'bg-red-600 text-white font-medium shadow-lg' : 'text-white/80 hover:bg-white/10 hover:text-white'} focus:outline-none focus:ring-2 focus:ring-red-500`}
                                      >
                                        {lang} {title} - {codec}
                                      </button>
                                    );
                                  })}
                                </>
                              )}

                              {/* OpenSubtitles Community */}
                              {openSubtitles?.length > 0 && (
                                <>
                                  <h4 className="text-white/40 font-semibold text-[10px] uppercase tracking-wider mt-3 mb-1">OpenSubtitles</h4>
                                  {openSubtitles.map((sub, idx) => (
                                    <button 
                                      key={`os-${idx}`}
                                      tabIndex={0}
                                      onClick={() => { setSelectedSubtitleTrack(sub.url); setSelectedSubtitleIsOS(true); setShowSubtitleMenu(false); }}
                                      className={`focusable text-left text-sm px-3 py-2 rounded transition-colors ${selectedSubtitleTrack === sub.url ? 'bg-red-600 text-white font-medium shadow-lg' : 'text-white/80 hover:bg-white/10 hover:text-white'} focus:outline-none focus:ring-2 focus:ring-red-500`}
                                    >
                                      {sub.lang} - Community ({sub.id})
                                    </button>
                                  ))}
                                </>
                              )}

                              {/* Subtitle Sync Offset Controls */}
                              {selectedSubtitleTrack !== null && (
                                <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-white/20">
                                  <div className="flex justify-between items-center text-xs text-white/60 font-medium">
                                    <span>Sync Offset</span>
                                    <span className="font-mono text-red-400 font-bold">{subtitleOffset > 0 ? `+${subtitleOffset}s` : `${subtitleOffset}s`}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {[-3, -2, -1, 0, 1, 2, 3].map((sec) => (
                                      <button
                                        key={sec}
                                        tabIndex={0}
                                        onClick={() => setSubtitleOffset(sec)}
                                        className={`focusable flex-1 py-1 text-[11px] rounded font-semibold transition-all ${subtitleOffset === sec ? 'bg-red-600 text-white shadow-md' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
                                      >
                                        {sec > 0 ? `+${sec}` : sec}s
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          )}


                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            null
          )}

          </div>
        </div>
      )}

      <div id="app-main-content" inert={hasModalOpen ? true : undefined} className="flex-1 flex w-full h-full overflow-hidden relative">
        {/* Sidebar */}
        <div id="sidebar-nav" className="w-20 bg-black/60 border-r border-white/10 flex flex-col items-center py-6 gap-6 z-20 shrink-0">
          <div className="select-none cursor-pointer flex items-center justify-center hover:scale-110 transition-transform duration-300" title="BUBBAFLIX">
            <img src="https://raw.githubusercontent.com/jsanderstechnologies/BubbaFlix-Media-Center/main/public/icon.svg" alt="BubbaFlix Icon" className="w-9 h-9 drop-shadow-lg" />
          </div>
          <div className="flex flex-col gap-3.5 text-white/60 w-full px-2">
            <div 
              id="nav-tab-home"
              tabIndex={0}
              onClick={() => { setActiveTab('home'); setSearchQuery(''); }}
              onKeyDown={(e) => { if (['Enter', ' ', 'Select', 'Accept'].includes(e.key) || e.keyCode === 13 || e.keyCode === 32 || e.keyCode === 29443) { e.preventDefault(); setActiveTab('home'); setSearchQuery(''); } }}
              className={`focusable hover:text-white transition-colors cursor-pointer flex flex-col items-center gap-1 focus:scale-110 focus:text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 rounded-lg p-1.5 ${activeTab === 'home' ? 'text-red-500' : ''}`}
              title="Home"
            >
              <Home className="w-5 h-5" />
              <span className="text-[9px] uppercase tracking-wider font-medium">Home</span>
            </div>
            {isSectionAllowed('tv') && (
              <div 
                id="nav-tab-tv"
                tabIndex={0}
                onClick={() => { setActiveTab('tv'); setSearchQuery(''); }}
                onKeyDown={(e) => { if (['Enter', ' ', 'Select', 'Accept'].includes(e.key) || e.keyCode === 13 || e.keyCode === 32 || e.keyCode === 29443) { e.preventDefault(); setActiveTab('tv'); setSearchQuery(''); } }}
                className={`focusable hover:text-white transition-colors cursor-pointer flex flex-col items-center gap-1 focus:scale-110 focus:text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 rounded-lg p-1.5 ${activeTab === 'tv' ? 'text-red-500' : ''}`}
                title="Live TV"
              >
                <MonitorPlay className="w-5 h-5" />
                <span className="text-[9px] uppercase tracking-wider font-medium">Live</span>
              </div>
            )}
            <div 
              id="nav-tab-series"
              tabIndex={0}
              onClick={() => { setActiveTab('series'); setSearchQuery(''); }}
              onKeyDown={(e) => { if (['Enter', ' ', 'Select', 'Accept'].includes(e.key) || e.keyCode === 13 || e.keyCode === 32 || e.keyCode === 29443) { e.preventDefault(); setActiveTab('series'); setSearchQuery(''); } }}
              className={`focusable hover:text-white transition-colors cursor-pointer flex flex-col items-center gap-1 focus:scale-110 focus:text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 rounded-lg p-1.5 ${activeTab === 'series' ? 'text-red-500' : ''}`}
              title="TV Series"
            >
              <Tv className="w-5 h-5" />
              <span className="text-[9px] uppercase tracking-wider font-medium">Series</span>
            </div>
            <div 
              id="nav-tab-catalog"
              tabIndex={0}
              onClick={() => { setActiveTab('catalog'); setSearchQuery(''); }}
              onKeyDown={(e) => { if (['Enter', ' ', 'Select', 'Accept'].includes(e.key) || e.keyCode === 13 || e.keyCode === 32 || e.keyCode === 29443) { e.preventDefault(); setActiveTab('catalog'); setSearchQuery(''); } }}
              className={`focusable hover:text-white transition-colors cursor-pointer flex flex-col items-center gap-1 focus:scale-110 focus:text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 rounded-lg p-1.5 ${activeTab === 'catalog' ? 'text-red-500' : ''}`}
              title="Movies"
            >
              <Clapperboard className="w-5 h-5" />
              <span className="text-[9px] uppercase tracking-wider font-medium">Movies</span>
            </div>
            {isSectionAllowed('music') && (
              <div 
                id="nav-tab-music"
                tabIndex={0}
                onClick={() => { setActiveTab('music'); setSearchQuery(''); }}
                onKeyDown={(e) => { if (['Enter', ' ', 'Select', 'Accept'].includes(e.key) || e.keyCode === 13 || e.keyCode === 32 || e.keyCode === 29443) { e.preventDefault(); setActiveTab('music'); setSearchQuery(''); } }}
                className={`focusable hover:text-white transition-colors cursor-pointer flex flex-col items-center gap-1 focus:scale-110 focus:text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 rounded-lg p-1.5 ${activeTab === 'music' ? 'text-red-500' : ''}`}
                title="Music Search"
              >
                <Music className="w-5 h-5" />
                <span className="text-[9px] uppercase tracking-wider font-medium">Music</span>
              </div>
            )}
            <div 
              id="nav-tab-library"
              tabIndex={0}
              onClick={() => { setActiveTab('library'); setSearchQuery(''); }}
              onKeyDown={(e) => { if (['Enter', ' ', 'Select', 'Accept'].includes(e.key) || e.keyCode === 13 || e.keyCode === 32 || e.keyCode === 29443) { e.preventDefault(); setActiveTab('library'); setSearchQuery(''); } }}
              className={`focusable hover:text-white transition-colors cursor-pointer flex flex-col items-center gap-1 focus:scale-110 focus:text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 rounded-lg p-1.5 ${activeTab === 'library' ? 'text-red-500' : ''}`}
              title="Library / Favorites"
            >
              <Bookmark className="w-5 h-5" />
              <span className="text-[9px] uppercase tracking-wider font-medium">Library</span>
            </div>
            {isSectionAllowed('weather') && (
              <div 
                id="nav-tab-weather"
                tabIndex={0}
                onClick={() => { setActiveTab('weather'); setSearchQuery(''); }}
                onKeyDown={(e) => { if (['Enter', ' ', 'Select', 'Accept'].includes(e.key) || e.keyCode === 13 || e.keyCode === 32 || e.keyCode === 29443) { e.preventDefault(); setActiveTab('weather'); setSearchQuery(''); } }}
                className={`focusable hover:text-white transition-colors cursor-pointer flex flex-col items-center gap-1 focus:scale-110 focus:text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 rounded-lg p-1.5 ${activeTab === 'weather' ? 'text-red-500' : ''}`}
                title="Weather & Radar"
              >
                <CloudSun className="w-5 h-5" />
                <span className="text-[9px] uppercase tracking-wider font-medium">Weather</span>
              </div>
            )}
            {isSectionAllowed('news') && (
              <div 
                id="nav-tab-news"
                tabIndex={0}
                onClick={() => { setActiveTab('news'); setSearchQuery(''); }}
                onKeyDown={(e) => { if (['Enter', ' ', 'Select', 'Accept'].includes(e.key) || e.keyCode === 13 || e.keyCode === 32 || e.keyCode === 29443) { e.preventDefault(); setActiveTab('news'); setSearchQuery(''); } }}
                className={`focusable hover:text-white transition-colors cursor-pointer flex flex-col items-center gap-1 focus:scale-110 focus:text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 rounded-lg p-1.5 ${activeTab === 'news' ? 'text-red-500' : ''}`}
                title="News & Sports"
              >
                <Newspaper className="w-5 h-5" />
                <span className="text-[9px] uppercase tracking-wider font-medium">News</span>
              </div>
            )}
            <div 
              id="nav-tab-settings"
              tabIndex={0}
              onClick={() => { setActiveTab('settings'); setSearchQuery(''); }}
              onKeyDown={(e) => { if (['Enter', ' ', 'Select', 'Accept'].includes(e.key) || e.keyCode === 13 || e.keyCode === 32 || e.keyCode === 29443) { e.preventDefault(); setActiveTab('settings'); setSearchQuery(''); } }}
              className={`focusable hover:text-white transition-colors cursor-pointer flex flex-col items-center gap-1 focus:scale-110 focus:text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 rounded-lg p-1.5 ${activeTab === 'settings' ? 'text-red-500' : ''}`}
              title="Settings"
            >
              <Settings className="w-5 h-5" />
              <span className="text-[9px] uppercase tracking-wider font-medium">Settings</span>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div id="main-content-view" className="flex-1 flex flex-col h-full bg-[#050507] overflow-hidden relative z-0">
          {activePoster && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10">
              <div 
                className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-in-out scale-100"
                style={{ backgroundImage: `url(${activePoster})`, opacity: 0.45 }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050507] via-[#050507]/60 to-black/30" />
            </div>
          )}
          {!activePoster && (
            <div className="absolute inset-0 bg-gradient-to-br from-[#0c0c12] to-[#050507] pointer-events-none -z-10" />
          )}
          
          {/* Header */}
          <header className="h-20 shrink-0 flex items-center justify-between px-10 border-b border-white/5 bg-black/80 backdrop-blur-md z-10">
            <div className="flex items-center gap-5">
              <svg 
                viewBox="0 0 320 70" 
                className="w-44 h-12 select-none cursor-pointer hover:scale-105 transition-transform duration-300 drop-shadow-[0_0_15px_rgba(229,9,20,0.25)]" 
                onClick={() => setActiveTab('home')}
              >
                <defs>
                  <path id="bubbaflix-curve" d="M 12,56 Q 160,20 308,56" fill="none" />
                  <linearGradient id="bubbaflix-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#ff4d4d" />
                    <stop offset="35%" stopColor="#e50914" />
                    <stop offset="75%" stopColor="#b30000" />
                    <stop offset="100%" stopColor="#7a0000" />
                  </linearGradient>
                  <filter id="bubbaflix-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.95"/>
                    <feDropShadow dx="0" dy="0" stdDeviation="5.5" floodColor="#e50914" floodOpacity="0.45"/>
                  </filter>
                </defs>
                <text 
                  fontFamily="'Bebas Neue', 'Impact', sans-serif" 
                  fontSize="56" 
                  fontWeight="900" 
                  fill="url(#bubbaflix-gradient)" 
                  stroke="url(#bubbaflix-gradient)" 
                  strokeWidth="2.8" 
                  strokeLinejoin="round"
                  letterSpacing="-1.2"
                  filter="url(#bubbaflix-glow)"
                >
                  <textPath href="#bubbaflix-curve" startOffset="50%" textAnchor="middle">
                    BUBBAFLIX
                  </textPath>
                </text>
              </svg>
              <div className="w-px h-6 bg-white/10 hidden sm:block" />
              <div className="flex items-center gap-4">
                {activeTab === 'home' && <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white"><span className="text-red-500 font-medium italic">Home</span></h1>}
                {activeTab === 'search' && <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white"><span className="text-red-500 font-medium italic">Search</span></h1>}
                {activeTab === 'catalog' && <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white">Movie <span className="text-red-500 font-medium italic">Catalog</span></h1>}
                {activeTab === 'series' && <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white">TV <span className="text-red-500 font-medium italic">Series</span></h1>}
                {activeTab === 'music' && <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white">Music <span className="text-red-500 font-medium italic">Search</span></h1>}
                {activeTab === 'library' && <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white">My <span className="text-red-500 font-medium italic">Library</span></h1>}
                {activeTab === 'tv' && <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white">Live <span className="text-emerald-400 font-medium italic">TV Guide</span></h1>}
                {activeTab === 'settings' && <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white"><span className="text-red-500 font-medium italic">Settings</span></h1>}
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                {isPlaying && (
                  <div 
                    className={`flex items-center gap-2 bg-black/40 border px-3 py-1.5 rounded-full select-none transition-all duration-300 ${
                      playerStatus.includes('BUFFERING') 
                        ? 'border-red-500/20 text-red-400 bg-red-950/10' 
                        : 'border-emerald-500/20 text-emerald-400 bg-emerald-950/10'
                    }`}
                  >
                    <span className="relative flex h-2 w-2">
                      {playerStatus.includes('BUFFERING') && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>}
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${playerStatus.includes('BUFFERING') ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                    </span>
                    <span className="text-[10px] font-mono font-semibold tracking-widest uppercase">{playerStatus.includes('BUFFERING') ? 'STREAM BUFFERING' : 'STREAM PLAYING'}</span>
                  </div>
                )}
                {isPageLoading && (
                  <div className="flex items-center gap-2 bg-black/40 border border-indigo-500/20 px-3 py-1.5 rounded-full select-none text-indigo-400 bg-indigo-950/10 transition-all duration-300">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                    </span>
                    <span className="text-[10px] font-mono font-semibold tracking-widest uppercase animate-pulse">LOADING CONTENT</span>
                  </div>
                )}
              </div>



              {/* API Integrations Active Icons */}
              <div className="flex items-center gap-3 opacity-70 shrink-0 mx-2 hidden sm:flex">
                {systemSettings.tmdbKey && (
                  <img src="/images/tmdb-logo.png" alt="TMDB API" className="h-4 object-contain brightness-110" title="TMDB API Active" />
                )}
                {systemSettings.tidbApiKey && (
                  <img src="https://theintrodb.org/logo.svg" alt="TheIntroDB API" className="h-4 object-contain brightness-110" title="TheIntroDB Skip Timestamps Engine Active" />
                )}
                {systemSettings.premiumizeApiKey && (
                  <img src="https://www.premiumize.me/icon_normal.svg" alt="Premiumize" className="h-4 object-contain brightness-110" title="Premiumize.me Instant 4K Debrid Engine Active" />
                )}
                {systemSettings.geminiApiKey && (
                  <img src="https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg" alt="Gemini AI API" className="h-4 object-contain brightness-110" title="Gemini AI Smart Filtering Active" />
                )}
                {systemSettings.groqApiKey && (
                  <img src="https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-avatar/avatars/groq.webp" alt="Groq AI" className="h-4 object-contain brightness-110 rounded-full" title="Groq High-Speed LPU AI Engine Active" />
                )}
                {systemSettings.openRouterApiKey && (
                  <img src="https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/dark/openrouter-color.png" alt="OpenRouter AI" className="h-4 object-contain brightness-110" title="OpenRouter AI Engine Active" />
                )}
                {systemSettings.intelTranscoding === true && (
                  <img src="/images/intel-logo.png" alt="Intel QSV" className="h-4 object-contain brightness-110" title="Intel Quick Sync Hardware Transcoding Active" />
                )}
              </div>

              <AuthButton />
            </div>
          </header>
          {/* Main View */}
          <main className={`flex-1 min-h-0 p-6 sm:p-10 overflow-y-auto flex flex-col gap-8 custom-scrollbar ${isKeyboardOpen ? 'pb-80' : ''}`}>
            
            {activeTab === 'home' ? (
              <HomePanel onSelectMedia={setSelectedMovie} onHoverMedia={setHoveredPoster} />
            ) : activeTab === 'catalog' ? (
              <>
                <div className="flex flex-wrap items-center justify-between shrink-0 gap-4 bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                  <div className="relative flex-1 min-w-[200px] max-w-md">
                    <Search className="w-4 h-4 text-white/50 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={movieSearchQuery}
                      onChange={(e) => setMovieSearchQuery(e.target.value)}
                      placeholder="Search Movies..."
                      className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-9 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20 transition-all"
                    />
                    {movieSearchQuery && (
                      <button onClick={() => setMovieSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-black/40 border border-white/10 p-1 rounded-xl mr-2">
                      <button
                        type="button"
                        onClick={() => setMovieViewMode('grid')}
                        className={`focusable px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 ${
                          movieViewMode === 'grid' ? 'bg-red-600 text-white shadow' : 'text-white/70 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        Movies Catalog
                      </button>
                      <button
                        type="button"
                        onClick={() => setMovieViewMode('calendar')}
                        className={`focusable flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 ${
                          movieViewMode === 'calendar' ? 'bg-red-600 text-white shadow' : 'text-white/70 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <CalendarIcon className="w-3.5 h-3.5" />
                        Release Calendar
                      </button>
                    </div>

                    {showFilters && (
                      <div className="flex gap-2 mr-2">
                        <select 
                          value={filterGenre} 
                          onChange={(e) => setFilterGenre(Number(e.target.value))}
                          className="bg-black/40 border border-white/10 text-white text-xs rounded px-2 py-1.5 outline-none"
                        >
                          <option value={0} className="bg-slate-900 text-white">All Genres</option>
                          {MOVIE_GENRES.map(g => (
                            <option key={g.id} value={g.id} className="bg-slate-900 text-white">{g.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <button 
                      onClick={() => setShowFilters(!showFilters)}
                      className={`px-4 py-1.5 rounded text-xs font-bold tracking-wider transition-colors ${showFilters ? 'bg-indigo-600' : 'bg-white/5 border border-white/10 hover:bg-white/10'}`}
                    >
                      FILTERS
                    </button>
                    <select 
                      value={sortOption} 
                      onChange={(e) => setSortOption(e.target.value)}
                      className="px-4 py-1.5 bg-white/5 rounded text-xs font-bold tracking-wider border border-white/10 outline-none appearance-none cursor-pointer hover:bg-white/10"
                    >
                      <option value="default" className="bg-slate-900 text-white">SORT: DEFAULT</option>
                      <option value="newest" className="bg-slate-900 text-white">SORT: NEWEST</option>
                      <option value="oldest" className="bg-slate-900 text-white">SORT: OLDEST</option>
                      <option value="rating_high" className="bg-slate-900 text-white">SORT: RATING (HIGH)</option>
                      <option value="rating_low" className="bg-slate-900 text-white">SORT: RATING (LOW)</option>
                    </select>
                  </div>
                </div>

                {movieViewMode === 'grid' ? (
                  <CatalogGrid onSelectMovie={setSelectedMovie} onHoverMedia={setHoveredPoster} searchQuery={movieSearchQuery} sortOption={sortOption} filterGenre={filterGenre} />
                ) : (
                  <UpcomingCalendar defaultType="movie" hideModeSelector={true} onSelectMedia={setSelectedMovie} onHoverMedia={setHoveredPoster} filterGenre={filterGenre} />
                )}
              </>
            ) : activeTab === 'series' ? (
              <>
                <div className="flex flex-wrap items-center justify-between shrink-0 gap-4 bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                  <div className="relative flex-1 min-w-[200px] max-w-md">
                    <Search className="w-4 h-4 text-white/50 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={seriesSearchQuery}
                      onChange={(e) => setSeriesSearchQuery(e.target.value)}
                      placeholder="Search TV Series..."
                      className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-9 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20 transition-all"
                    />
                    {seriesSearchQuery && (
                      <button onClick={() => setSeriesSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-black/40 border border-white/10 p-1 rounded-xl mr-2">
                      <button
                        type="button"
                        onClick={() => setSeriesViewMode('grid')}
                        className={`focusable px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 ${
                          seriesViewMode === 'grid' ? 'bg-red-600 text-white shadow' : 'text-white/70 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        TV Series
                      </button>
                      <button
                        type="button"
                        onClick={() => setSeriesViewMode('calendar')}
                        className={`focusable flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 ${
                          seriesViewMode === 'calendar' ? 'bg-red-600 text-white shadow' : 'text-white/70 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <CalendarIcon className="w-3.5 h-3.5" />
                        Airings Calendar
                      </button>
                    </div>

                    {showFilters && (
                      <div className="flex gap-2 mr-2">
                        <select 
                          value={filterGenre} 
                          onChange={(e) => setFilterGenre(Number(e.target.value))}
                          className="bg-black/40 border border-white/10 text-white text-xs rounded px-2 py-1.5 outline-none"
                        >
                          <option value={0} className="bg-slate-900 text-white">All Genres</option>
                          {TV_GENRES.map(g => (
                            <option key={g.id} value={g.id} className="bg-slate-900 text-white">{g.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <button 
                      onClick={() => setShowFilters(!showFilters)}
                      className={`px-4 py-1.5 rounded text-xs font-bold tracking-wider transition-colors ${showFilters ? 'bg-indigo-600' : 'bg-white/5 border border-white/10 hover:bg-white/10'}`}
                    >
                      FILTERS
                    </button>
                    <select 
                      value={sortOption} 
                      onChange={(e) => setSortOption(e.target.value)}
                      className="px-4 py-1.5 bg-white/5 rounded text-xs font-bold tracking-wider border border-white/10 outline-none appearance-none cursor-pointer hover:bg-white/10"
                    >
                      <option value="default" className="bg-slate-900 text-white">SORT: DEFAULT</option>
                      <option value="newest" className="bg-slate-900 text-white">SORT: NEWEST</option>
                      <option value="oldest" className="bg-slate-900 text-white">SORT: OLDEST</option>
                      <option value="rating_high" className="bg-slate-900 text-white">SORT: RATING (HIGH)</option>
                      <option value="rating_low" className="bg-slate-900 text-white">SORT: RATING (LOW)</option>
                    </select>
                  </div>
                </div>

                {seriesViewMode === 'grid' ? (
                  <TvSeriesGrid onSelectSeries={setSelectedMovie} onHoverMedia={setHoveredPoster} searchQuery={seriesSearchQuery} sortOption={sortOption} filterGenre={filterGenre} />
                ) : (
                  <UpcomingCalendar defaultType="tv" hideModeSelector={true} onSelectMedia={setSelectedMovie} onHoverMedia={setHoveredPoster} filterGenre={filterGenre} />
                )}
              </>
            ) : activeTab === 'search' ? (
              <SearchPanel 
                query={searchQuery}
                onSelectMedia={setSelectedMovie}
                onHoverMedia={setHoveredPoster}
                onSelectSuggestion={(term) => {
                  setSearchQuery(term);
                  setActiveTab('search');
                }}
                onActorSearchClick={(actorName) => {
                  setSearchQuery(actorName);
                  setActiveTab('search');
                }}
                onBack={() => {
                  setSearchQuery('');
                  setActiveTab('home');
                }}
              />
            ) : activeTab === 'library' ? (
              <>
                <LibraryGrid onSelectMedia={setSelectedMovie} onPlayMedia={handlePlayStream} onHoverMedia={setHoveredPoster} />
              </>
            ) : activeTab === 'music' ? (
              <MusicPanel initialQuery={musicSearchQuery} onSelectMedia={setSelectedMovie} />
            ) : activeTab === 'weather' ? (
              <WeatherPanel />
            ) : activeTab === 'news' ? (
              <NewsPanel onPlayStream={handlePlayStream} />
            ) : activeTab === 'tv' ? (
              <IptvGuide onPlayStream={handlePlayStream} />
            ) : activeTab === 'settings' ? (
              <SettingsPanel />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
                  <Tv className="w-10 h-10 text-white/50" />
                </div>
                <div>
                  <h2 className="text-2xl font-light tracking-tight text-white capitalize">{activeTab}</h2>
                  <p className="text-white/60 text-sm mt-2">This section is not yet implemented.</p>
                </div>
              </div>
            )}

          </main>
        </div>
      </div>

      <MediaModal 
        movie={selectedMovie} 
        onClose={() => setSelectedMovie(null)} 
        onPlay={handlePlayStream} 
        onActorSearch={(actorName) => {
          setSearchQuery(actorName);
          setActiveTab('search');
          setSelectedMovie(null);
        }}
        isHidden={!!playingUrl}
      />

      <VirtualKeyboard
        value={searchQuery}
        onChange={setSearchQuery}
        onClose={() => setIsKeyboardOpen(false)}
        isOpen={isKeyboardOpen}
      />

      {/* Double-Click Back to Exit Toast Popup */}
      {showExitToast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100000] bg-zinc-900/95 border border-white/20 text-white text-sm font-bold px-6 py-3 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span>Click Back again to exit BubbaFlix</span>
        </div>
      )}

      {/* Global Emergency Severe Weather Alert Modal Overlay */}
      {activeWeatherAlert && (
        <WeatherAlertModal
          alert={activeWeatherAlert}
          onDismiss={() => setActiveWeatherAlert(null)}
          onGoToWeather={() => {
            setActiveWeatherAlert(null);
            setPlayingUrl('');
            setPlayingContext(null);
            setIsPlaying(false);
            setActiveTab('weather');
          }}
        />
      )}
    </div>
    </>
  );
}

const MOVIE_GENRES = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Family' },
  { id: 14, name: 'Fantasy' },
  { id: 36, name: 'History' },
  { id: 27, name: 'Horror' },
  { id: 10402, name: 'Music' },
  { id: 9648, name: 'Mystery' },
  { id: 10749, name: 'Romance' },
  { id: 878, name: 'Science Fiction' },
  { id: 10770, name: 'TV Movie' },
  { id: 53, name: 'Thriller' },
  { id: 10752, name: 'War' },
  { id: 37, name: 'Western' }
];

const TV_GENRES = [
  { id: 10759, name: 'Action & Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Family' },
  { id: 10762, name: 'Kids' },
  { id: 9648, name: 'Mystery' },
  { id: 10763, name: 'News' },
  { id: 10764, name: 'Reality' },
  { id: 10765, name: 'Sci-Fi & Fantasy' },
  { id: 10766, name: 'Soap' },
  { id: 10767, name: 'Talk' },
  { id: 10768, name: 'War & Politics' },
  { id: 37, name: 'Western' }
];

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MainApp />
    </QueryClientProvider>
  );
}

