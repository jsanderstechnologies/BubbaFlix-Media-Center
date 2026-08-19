import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { getTrendingTvSeries, searchTvSeries } from '../services/tmdbApi';
import { useSettings } from '../lib/settings';
import { prefetchMediaItems } from '../lib/prefetchCache';
import BubbaFlixLogo from './BubbaFlixLogo';

// Custom hook for debouncing
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

export default function TvSeriesGrid({ onSelectSeries, onHoverMedia, searchQuery, sortOption = 'default', filterGenre = 0, customItems }: { onSelectSeries: (series: any) => void, onHoverMedia?: (posterUrl: string) => void, searchQuery: string, sortOption?: string, filterGenre?: number, customItems?: any[] }) {
  const debouncedSearchQuery = useDebounce(searchQuery, 500);
  const { systemSettings } = useSettings();

  const [forceReady, setForceReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setForceReady(true), 2500);
    return () => clearTimeout(timer);
  }, [debouncedSearchQuery, filterGenre]);

  const { data: series, isLoading: queryLoading } = useQuery({
    queryKey: ['tvseries', debouncedSearchQuery, filterGenre, systemSettings.tmdbKey],
    queryFn: () => debouncedSearchQuery ? searchTvSeries(debouncedSearchQuery) : getTrendingTvSeries(filterGenre),
    enabled: !customItems,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  useEffect(() => {
    if (!customItems && !debouncedSearchQuery && series && series.length > 0) {
      prefetchMediaItems(series);
    }
  }, [series, debouncedSearchQuery, customItems]);

  const handleSelectSeries = (item: any) => {
    if (item) prefetchMediaItems([item]);
    onSelectSeries(item);
  };

  const isCustom = Array.isArray(customItems);
  const sourceSeries = isCustom ? customItems : (series || []);
  const isLoading = !isCustom && !forceReady && !series && queryLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-28 gap-4 text-white min-h-[50vh]">
        <BubbaFlixLogo className="w-56 h-16 animate-pulse" idPrefix="tv-loader" />
        <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-xs font-mono text-white/50 tracking-wider animate-pulse">Loading TV catalog...</span>
      </div>
    );
  }

  if (isCustom && sourceSeries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center text-white/70 min-h-[40vh]">
        <p className="text-base sm:text-lg font-medium">No favorite TV series saved yet.</p>
        <p className="text-xs text-white/50">Click "Add To Favorites" on any series detail screen to save it here!</p>
      </div>
    );
  }

  let processedSeries = [...sourceSeries];

  if (debouncedSearchQuery) {
    const q = debouncedSearchQuery.toLowerCase();
    processedSeries = processedSeries.filter((s: any) => 
      (s.title && s.title.toLowerCase().includes(q)) || 
      (s.name && s.name.toLowerCase().includes(q))
    );
  }
  
  if (filterGenre > 0) {
    processedSeries = processedSeries.filter((s: any) => 
      (s.genre_ids && s.genre_ids.includes(filterGenre)) ||
      (s.genres && s.genres.some((g: any) => (typeof g === 'number' ? g : g.id) === filterGenre))
    );
  }

  const getSortableTitle = (title?: string) => {
    if (!title) return '';
    return title.trim().replace(/^(the|a|an)\s+/i, '').trim();
  };

  if (sortOption === 'year_desc' || sortOption === 'newest') {
    processedSeries.sort((a, b) => (parseInt(b.year || '0', 10) || 0) - (parseInt(a.year || '0', 10) || 0));
  } else if (sortOption === 'year_asc' || sortOption === 'oldest') {
    processedSeries.sort((a, b) => (parseInt(a.year || '0', 10) || 0) - (parseInt(b.year || '0', 10) || 0));
  } else if (sortOption === 'rating_desc' || sortOption === 'rating' || sortOption === 'rating_high') {
    processedSeries.sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0));
  } else if (sortOption === 'rating_low') {
    processedSeries.sort((a, b) => parseFloat(a.rating || 0) - parseFloat(b.rating || 0));
  } else if (sortOption === 'title_asc' || sortOption === 'title' || sortOption === 'name' || sortOption === 'alphabetical') {
    processedSeries.sort((a: any, b: any) => getSortableTitle(a.title || a.name).localeCompare(getSortableTitle(b.title || b.name), undefined, { sensitivity: 'base', numeric: true }));
  } else if (sortOption === 'title_desc') {
    processedSeries.sort((a: any, b: any) => getSortableTitle(b.title || b.name).localeCompare(getSortableTitle(a.title || a.name), undefined, { sensitivity: 'base', numeric: true }));
  }

  if (processedSeries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-white/70 min-h-[30vh]">
        <p className="text-base font-medium">
          {debouncedSearchQuery 
            ? `No results found for "${debouncedSearchQuery}".`
            : filterGenre > 0 
              ? 'No TV series match your selected genre filter.'
              : 'No TV series found.'}
        </p>
      </div>
    );
  }

  return (
    <section id="tv-grid-container" className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-4 sm:gap-6 py-2 px-1">
      {processedSeries?.map((item: any, idx: number) => (
        <div 
          key={item.id} 
          id={idx === 0 ? 'tv-first-poster' : undefined}
          className="focusable group cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-600 focus:scale-105 rounded-xl transition-all duration-200" 
          onClick={() => handleSelectSeries(item)}
          onMouseEnter={() => onHoverMedia?.(item.poster)}
          onMouseLeave={() => onHoverMedia?.('')}
          tabIndex={0}
          onKeyDown={(e) => {
            if (['Enter', ' ', 'Select', 'Accept'].includes(e.key) || e.keyCode === 13 || e.keyCode === 32 || e.keyCode === 29443) {
              e.preventDefault();
              e.stopPropagation();
              handleSelectSeries(item);
            }
          }}
        >
          <div className="aspect-[2/3] bg-slate-800 rounded-xl overflow-hidden mb-2 relative border border-white/5 shadow-lg group-hover:scale-105 group-hover:border-red-600 group-hover:ring-2 group-hover:ring-red-600/50 transition-all duration-500">
            {item.poster ? (
              <img src={item.poster} alt={item.title} className="w-full h-full object-cover pointer-events-none select-none" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-xs text-center p-4 pointer-events-none select-none">
                No Poster
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60 pointer-events-none"></div>
            <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-col pointer-events-none select-none">
              <span className="text-xs sm:text-sm font-medium leading-tight text-white truncate">{item.title}</span>
            </div>
            {item.rating && (
              <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-[10px] font-mono text-amber-400 font-semibold px-1.5 py-0.5 rounded border border-white/10 pointer-events-none select-none">
                ★ {item.rating}
              </div>
            )}
          </div>
          {item.year && (
            <div className="px-1 pointer-events-none select-none">
              <span className="text-xs text-white/70 font-mono">{item.year}</span>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
