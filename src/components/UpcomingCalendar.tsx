import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar as CalendarIcon, Film, Tv, Star, Clock, Sparkles, Filter, ChevronRight } from 'lucide-react';
import { getUpcomingMovies, getUpcomingTvSeries } from '../services/tmdbApi';
import { useSettings } from '../lib/settings';
import { prefetchMediaItems } from '../lib/prefetchCache';

interface UpcomingCalendarProps {
  defaultType?: 'movie' | 'tv' | 'all';
  hideModeSelector?: boolean;
  onSelectMedia: (media: any) => void;
  onHoverMedia?: (posterUrl: string) => void;
  filterGenre?: number;
}

export default function UpcomingCalendar({
  defaultType = 'all',
  hideModeSelector = false,
  onSelectMedia,
  onHoverMedia,
  filterGenre = 0
}: UpcomingCalendarProps) {
  const [activeMode, setActiveMode] = useState<'movie' | 'tv' | 'all'>(defaultType);
  const [failedPosters, setFailedPosters] = useState<Record<string, boolean>>({});
  const { systemSettings } = useSettings();

  const { data: upcomingMovies, isLoading: loadingMovies } = useQuery({
    queryKey: ['upcoming_movies', filterGenre, systemSettings.tmdbKey],
    queryFn: () => getUpcomingMovies(filterGenre),
    enabled: activeMode === 'movie' || activeMode === 'all'
  });

  const { data: upcomingTv, isLoading: loadingTv } = useQuery({
    queryKey: ['upcoming_tv', filterGenre, systemSettings.tmdbKey],
    queryFn: () => getUpcomingTvSeries(filterGenre),
    enabled: activeMode === 'tv' || activeMode === 'all'
  });

  useEffect(() => {
    const list: any[] = [];
    if (upcomingMovies) list.push(...upcomingMovies);
    if (upcomingTv) list.push(...upcomingTv);
    if (list.length > 0) prefetchMediaItems(list);
  }, [upcomingMovies, upcomingTv]);

  const isLoading = (activeMode === 'movie' && loadingMovies) ||
                    (activeMode === 'tv' && loadingTv) ||
                    (activeMode === 'all' && (loadingMovies || loadingTv));

  // Merge and sort upcoming items by release date
  let items: any[] = [];
  if (activeMode === 'movie') {
    items = upcomingMovies || [];
  } else if (activeMode === 'tv') {
    items = upcomingTv || [];
  } else {
    items = [...(upcomingMovies || []), ...(upcomingTv || [])];
  }

  // Sort ascending by release date
  items.sort((a, b) => {
    const dateA = a.releaseDate || '9999-12-31';
    const dateB = b.releaseDate || '9999-12-31';
    return dateA.localeCompare(dateB);
  });

  // Group items by timeframes (Today, Tomorrow, This Week, Next Week, Later)
  const todayStr = new Date().toISOString().split('T')[0];
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const in7Days = new Date(now);
  in7Days.setDate(now.getDate() + 7);

  const in14Days = new Date(now);
  in14Days.setDate(now.getDate() + 14);

  const grouped: { title: string; subtitle: string; items: any[] }[] = [
    { title: 'Airing Today', subtitle: 'Releasing today', items: [] },
    { title: 'Tomorrow', subtitle: 'Releasing tomorrow', items: [] },
    { title: 'This Week', subtitle: 'Releasing within 7 days', items: [] },
    { title: 'Next Week', subtitle: 'Releasing within 14 days', items: [] },
    { title: 'Coming Soon', subtitle: 'Scheduled future releases', items: [] }
  ];

  items.forEach(item => {
    const rDate = item.releaseDate;
    if (!rDate) {
      grouped[4].items.push(item);
      return;
    }

    if (rDate === todayStr) {
      grouped[0].items.push(item);
    } else if (rDate === tomorrowStr) {
      grouped[1].items.push(item);
    } else {
      const itemDate = new Date(rDate);
      if (itemDate <= in7Days) {
        grouped[2].items.push(item);
      } else if (itemDate <= in14Days) {
        grouped[3].items.push(item);
      } else {
        grouped[4].items.push(item);
      }
    }
  });

  const formatDateLabel = (dateStr?: string) => {
    if (!dateStr) return 'TBA';
    try {
      const parts = dateStr.split('-').map(p => parseInt(p, 10));
      if (parts.length < 3) return dateStr;
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Sub-Tab Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-red-500" />
          <h2 className="text-lg font-bold text-white tracking-tight">
            {activeMode === 'movie' ? 'Upcoming Movies Release Calendar' : activeMode === 'tv' ? 'Upcoming TV Series & Episode Airings' : 'TMDB Release Calendar'}
          </h2>
        </div>

        {!hideModeSelector && (
          <div className="flex items-center gap-2 bg-black/40 border border-white/10 p-1 rounded-xl">
            <button
              onClick={() => setActiveMode('all')}
              className={`focusable px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 ${
                activeMode === 'all' ? 'bg-red-600 text-white shadow-lg' : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              All Upcoming
            </button>
            <button
              onClick={() => setActiveMode('movie')}
              className={`focusable flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 ${
                activeMode === 'movie' ? 'bg-red-600 text-white shadow-lg' : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              Upcoming Movies
            </button>
            <button
              onClick={() => setActiveMode('tv')}
              className={`focusable flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 ${
                activeMode === 'tv' ? 'bg-red-600 text-white shadow-lg' : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              Upcoming Episodes
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-white/50">
          <Sparkles className="w-8 h-8 text-red-500 animate-spin" />
          <span className="text-xs font-mono tracking-widest uppercase animate-pulse">Fetching TMDB Release Schedule...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center text-white/50 bg-white/[0.02] border border-white/5 rounded-2xl">
          No upcoming releases found matching your criteria.
        </div>
      ) : (
        <div className="space-y-10">
          {grouped.map((group, gIdx) => {
            if (group.items.length === 0) return null;
            return (
              <div key={gIdx} className="space-y-4">
                <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">{group.title}</h3>
                    <span className="text-xs text-white/50">{group.subtitle} ({group.items.length})</span>
                  </div>
                </div>

                <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-4 sm:gap-6 py-2 px-1">
                  {group.items.map((item) => (
                    <div
                      key={`${item.type}_${item.id}`}
                      tabIndex={0}
                      className="focusable group cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-600 focus:scale-105 rounded-xl transition-all duration-200"
                      onClick={() => onSelectMedia(item)}
                      onMouseEnter={() => onHoverMedia?.(item.poster)}
                      onMouseLeave={() => onHoverMedia?.('')}
                      onKeyDown={(e) => {
                        if (['Enter', ' ', 'Select', 'Accept'].includes(e.key) || e.keyCode === 13 || e.keyCode === 32 || e.keyCode === 29443) {
                          e.preventDefault();
                          e.stopPropagation();
                          onSelectMedia(item);
                        }
                      }}
                    >
                      <div className="aspect-[2/3] bg-slate-800 rounded-xl overflow-hidden mb-2.5 relative border border-white/5 shadow-lg group-hover:scale-105 group-hover:border-red-600 group-hover:ring-2 group-hover:ring-red-600/50 transition-all duration-300">
                        {item.poster && !failedPosters[`${item.type}_${item.id}`] ? (
                          <img
                            src={item.poster}
                            alt={item.title}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                            onError={() => setFailedPosters(prev => ({ ...prev, [`${item.type}_${item.id}`]: true }))}
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-purple-950/40 to-slate-900 p-4 text-center">
                            <Film className="w-8 h-8 text-white/30 mb-2" />
                            <span className="text-xs font-bold text-white/80 line-clamp-2">{item.title}</span>
                            <span className="text-[10px] text-purple-300 font-mono mt-1">{formatDateLabel(item.releaseDate)}</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-70"></div>

                        {/* Top Release Date Badge */}
                        <div className="absolute top-2 left-2 bg-purple-950/80 backdrop-blur-md text-[10px] font-mono text-purple-200 font-bold px-2 py-0.5 rounded border border-purple-500/40 flex items-center gap-1 shadow-md">
                          <CalendarIcon className="w-3 h-3 text-purple-400" />
                          {formatDateLabel(item.releaseDate)}
                        </div>

                        {/* Rating Badge */}
                        {item.rating && item.rating !== '0.0' && (
                          <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-[10px] font-mono text-amber-400 font-semibold px-1.5 py-0.5 rounded border border-white/10">
                            ★ {item.rating}
                          </div>
                        )}

                        {/* Media Type / Episode Tag */}
                        <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-col gap-1">
                          <span className="text-xs sm:text-sm font-bold text-white truncate drop-shadow-md">{item.title}</span>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                              item.type === 'series' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-red-500/20 text-red-300 border-red-500/40'
                            }`}>
                              {item.type === 'series' ? 'TV Series' : 'Movie'}
                            </span>
                            {item.nextEpisode && (
                              <span className="text-[10px] font-mono text-white/80 bg-white/10 px-1.5 py-0.5 rounded">
                                {item.nextEpisode}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
