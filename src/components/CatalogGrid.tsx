import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { getTrendingMovies, searchMovies } from '../services/tmdbApi';
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

export default function CatalogGrid({ onSelectMovie, onHoverMedia, searchQuery, sortOption = 'default', filterGenre = 0 }: { onSelectMovie: (movie: any) => void, onHoverMedia?: (posterUrl: string) => void, searchQuery: string, sortOption?: string, filterGenre?: number }) {
  const debouncedSearchQuery = useDebounce(searchQuery, 500);
  const { systemSettings } = useSettings();

  const [forceReady, setForceReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setForceReady(true), 2500);
    return () => clearTimeout(timer);
  }, [debouncedSearchQuery, filterGenre]);

  const { data: movies, isLoading: queryLoading } = useQuery({
    queryKey: ['movies', debouncedSearchQuery, filterGenre, systemSettings.tmdbKey],
    queryFn: () => debouncedSearchQuery ? searchMovies(debouncedSearchQuery) : getTrendingMovies(filterGenre),
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  useEffect(() => {
    if (!debouncedSearchQuery && movies && movies.length > 0) {
      prefetchMediaItems(movies);
    }
  }, [movies, debouncedSearchQuery]);

  const handleSelectMovie = (movie: any) => {
    if (movie) prefetchMediaItems([movie]);
    onSelectMovie(movie);
  };

  const isLoading = !forceReady && !movies && queryLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-28 gap-4 text-white min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm font-medium text-white/70">Loading movie catalog...</span>
      </div>
    );
  }
  if (!movies || movies.length === 0) return <div className="text-white text-sm">No results found for "{searchQuery}".</div>;

  let processedMovies = [...(movies || [])];
  
  if (filterGenre > 0) {
    processedMovies = processedMovies.filter((m: any) => m.genre_ids?.includes(filterGenre));
  }

  const getSortableTitle = (title?: string) => {
    if (!title) return '';
    return title.trim().replace(/^(the|a|an)\s+/i, '').trim();
  };

  if (sortOption === 'year_desc' || sortOption === 'newest') {
    processedMovies.sort((a, b) => parseInt(b.year || '0', 10) - parseInt(a.year || '0', 10));
  } else if (sortOption === 'year_asc' || sortOption === 'oldest') {
    processedMovies.sort((a, b) => parseInt(a.year || '0', 10) - parseInt(b.year || '0', 10));
  } else if (sortOption === 'rating_desc' || sortOption === 'rating') {
    processedMovies.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));
  } else if (sortOption === 'rating_low') {
    processedMovies.sort((a, b) => parseFloat(a.rating) - parseFloat(b.rating));
  } else if (sortOption === 'title_asc' || sortOption === 'title' || sortOption === 'name') {
    processedMovies.sort((a: any, b: any) => getSortableTitle(a.title || a.name).localeCompare(getSortableTitle(b.title || b.name), undefined, { sensitivity: 'base', numeric: true }));
  } else if (sortOption === 'title_desc') {
    processedMovies.sort((a: any, b: any) => getSortableTitle(b.title || b.name).localeCompare(getSortableTitle(a.title || a.name), undefined, { sensitivity: 'base', numeric: true }));
  }

  if (processedMovies.length === 0) {
     return <div className="text-white text-sm">No results match your filters.</div>;
  }

  return (
    <section id="catalog-grid-container" className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-4 sm:gap-6 py-2 px-1">
      {processedMovies?.map((movie: any, idx: number) => (
        <div 
          key={movie.id} 
          id={idx === 0 ? 'catalog-first-poster' : undefined}
          className="focusable group cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-600 focus:scale-105 rounded-xl transition-all duration-200" 
          onClick={() => handleSelectMovie(movie)}
          onMouseEnter={() => onHoverMedia?.(movie.poster)}
          onMouseLeave={() => onHoverMedia?.('')}
          tabIndex={0}
          onKeyDown={(e) => {
            if (['Enter', ' ', 'Select', 'Accept'].includes(e.key) || e.keyCode === 13 || e.keyCode === 32 || e.keyCode === 29443) {
              e.preventDefault();
              e.stopPropagation();
              handleSelectMovie(movie);
            }
          }}
        >
          <div className="aspect-[2/3] bg-slate-800 rounded-xl overflow-hidden mb-2 relative border border-white/5 shadow-lg group-hover:scale-105 group-hover:border-red-600 group-hover:ring-2 group-hover:ring-red-600/50 transition-all duration-500">
            {movie.poster ? (
              <img src={movie.poster} alt={movie.title} className="w-full h-full object-cover pointer-events-none select-none" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-xs text-center p-4 pointer-events-none select-none">
                No Poster
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60 pointer-events-none"></div>
            <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-col pointer-events-none select-none">
              <span className="text-xs sm:text-sm font-medium leading-tight text-white truncate">{movie.title}</span>
            </div>
            {movie.rating && (
              <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-[10px] font-mono text-amber-400 font-semibold px-1.5 py-0.5 rounded border border-white/10 pointer-events-none select-none">
                ★ {movie.rating}
              </div>
            )}
          </div>
          {movie.year && (
            <div className="px-1 pointer-events-none select-none">
              <span className="text-xs text-white/70 font-mono">{movie.year}</span>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
