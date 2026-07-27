import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { getTrendingMovies, searchMovies } from '../services/tmdbApi';
import { useSettings } from '../lib/settings';

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

  const { data: movies, isLoading } = useQuery({
    queryKey: ['movies', debouncedSearchQuery, filterGenre, systemSettings.tmdbKey],
    queryFn: () => debouncedSearchQuery ? searchMovies(debouncedSearchQuery) : getTrendingMovies(filterGenre),
  });

  if (isLoading) return <div className="text-white text-sm">Loading TMDB catalog...</div>;
  if (!movies || movies.length === 0) return <div className="text-white text-sm">No results found for "{searchQuery}".</div>;

  let processedMovies = [...movies];
  
  if (filterGenre > 0) {
    processedMovies = processedMovies.filter((m: any) => m.genres && m.genres.includes(filterGenre));
  }

  const getSortableTitle = (title?: string) => {
    if (!title) return '';
    return title.trim().replace(/^(the|a|an)\s+/i, '').trim();
  };

  if (sortOption === 'newest') {
    processedMovies.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
  } else if (sortOption === 'oldest') {
    processedMovies.sort((a, b) => (parseInt(a.year) || 0) - (parseInt(b.year) || 0));
  } else if (sortOption === 'rating_high') {
    processedMovies.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));
  } else if (sortOption === 'rating_low') {
    processedMovies.sort((a, b) => parseFloat(a.rating) - parseFloat(b.rating));
  } else if (sortOption === 'title_asc' || sortOption === 'title' || sortOption === 'name') {
    processedMovies.sort((a, b) => getSortableTitle(a.title || a.name).localeCompare(getSortableTitle(b.title || b.name), undefined, { sensitivity: 'base', numeric: true }));
  } else if (sortOption === 'title_desc') {
    processedMovies.sort((a, b) => getSortableTitle(b.title || b.name).localeCompare(getSortableTitle(a.title || a.name), undefined, { sensitivity: 'base', numeric: true }));
  }

  if (processedMovies.length === 0) {
     return <div className="text-white text-sm">No results match your filters.</div>;
  }

  return (
    <section className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-4 sm:gap-6">
      {processedMovies?.map((movie: any) => (
        <div 
          key={movie.id} 
          className="group cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-600 rounded-xl" 
          onClick={() => onSelectMovie(movie)}
          onMouseEnter={() => onHoverMedia?.(movie.poster)}
          onMouseLeave={() => onHoverMedia?.('')}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') onSelectMovie(movie); }}
        >
          <div className="aspect-[2/3] bg-slate-800 rounded-xl overflow-hidden mb-2 relative border border-white/5 shadow-lg group-hover:scale-105 group-hover:border-red-600 group-hover:ring-2 group-hover:ring-red-600/50 transition-all duration-500">
            {movie.poster ? (
              <img src={movie.poster} alt={movie.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-xs text-center p-4">
                No Poster
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60"></div>
            <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-col">
              <span className="text-xs sm:text-sm font-medium leading-tight text-white truncate">{movie.title}</span>
            </div>
            {movie.rating && (
              <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-[10px] font-mono text-amber-400 font-semibold px-1.5 py-0.5 rounded border border-white/10">
                ★ {movie.rating}
              </div>
            )}
          </div>
          {movie.year && (
            <div className="px-1">
              <span className="text-xs text-white/70 font-mono">{movie.year}</span>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
