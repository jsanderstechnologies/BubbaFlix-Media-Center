import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { getTrendingMovies, searchMovies } from '../services/tmdbApi';

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

  const { data: movies, isLoading } = useQuery({
    queryKey: ['movies', debouncedSearchQuery, filterGenre],
    queryFn: () => debouncedSearchQuery ? searchMovies(debouncedSearchQuery) : getTrendingMovies(filterGenre),
  });

  if (isLoading) return <div className="text-white text-sm">Loading TMDB catalog...</div>;
  if (!movies || movies.length === 0) return <div className="text-white text-sm">No results found for "{searchQuery}".</div>;

  let processedMovies = [...movies];
  
  if (filterGenre > 0) {
    processedMovies = processedMovies.filter((m: any) => m.genres && m.genres.includes(filterGenre));
  }

  if (sortOption === 'newest') {
    processedMovies.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
  } else if (sortOption === 'oldest') {
    processedMovies.sort((a, b) => (parseInt(a.year) || 0) - (parseInt(b.year) || 0));
  } else if (sortOption === 'rating_high') {
    processedMovies.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));
  } else if (sortOption === 'rating_low') {
    processedMovies.sort((a, b) => parseFloat(a.rating) - parseFloat(b.rating));
  }

  if (processedMovies.length === 0) {
     return <div className="text-white text-sm">No results match your filters.</div>;
  }

  return (
    <section className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4">
      {processedMovies?.map((movie: any) => (
        <div 
          key={movie.id} 
          className="group cursor-pointer" 
          onClick={() => onSelectMovie(movie)}
          onMouseEnter={() => onHoverMedia?.(movie.poster)}
          onMouseLeave={() => onHoverMedia?.('')}
        >
          <div className="aspect-[2/3] bg-slate-800 rounded-xl overflow-hidden mb-3 relative border border-white/5 shadow-2xl group-hover:scale-105 group-hover:border-red-600 group-hover:ring-2 group-hover:ring-red-600/50 transition-all duration-500">
            {movie.poster ? (
                <img src={movie.poster} alt={movie.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60"></div>
            <div className="absolute bottom-3 left-3 flex flex-col">
              <span className="text-sm font-medium leading-tight text-white">{movie.title}</span>
            </div>
          </div>
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-white/90">{movie.year}</span>
            <span className="text-xs bg-black/40 text-white px-1.5 py-0.5 rounded border border-white/10">{movie.rating}</span>
          </div>
        </div>
      ))}
    </section>
  );
}
