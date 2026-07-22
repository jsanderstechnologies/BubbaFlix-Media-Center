import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  getTrendingMovies, 
  getPopularMovies, 
  getTopRatedMovies, 
  getPopularTvSeries, 
  getTopRatedTvSeries 
} from '../services/tmdbApi';
import { useSettings } from '../lib/settings';
import { Play, Info, Flame, Trophy, Film, Tv, Star, Cpu } from 'lucide-react';

interface HomePanelProps {
  onSelectMedia: (media: any) => void;
  onHoverMedia?: (posterUrl: string) => void;
}

export default function HomePanel({ onSelectMedia, onHoverMedia }: HomePanelProps) {
  const { systemSettings } = useSettings();
  const [encoder, setEncoder] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/system/encoder')
      .then(res => res.json())
      .then(data => setEncoder(data.encoder))
      .catch(() => {});
  }, []);

  // Fetch multiple sections in parallel
  const { data: trendingMovies, isLoading: loadingTrending } = useQuery({
    queryKey: ['home-trending-movies', systemSettings.tmdbKey],
    queryFn: () => getTrendingMovies(),
  });

  const { data: popularMovies, isLoading: loadingPopularMovies } = useQuery({
    queryKey: ['home-popular-movies', systemSettings.tmdbKey],
    queryFn: getPopularMovies,
  });

  const { data: topRatedMovies, isLoading: loadingTopRatedMovies } = useQuery({
    queryKey: ['home-top-rated-movies', systemSettings.tmdbKey],
    queryFn: getTopRatedMovies,
  });

  const { data: popularTv, isLoading: loadingPopularTv } = useQuery({
    queryKey: ['home-popular-tv', systemSettings.tmdbKey],
    queryFn: getPopularTvSeries,
  });

  const { data: topRatedTv, isLoading: loadingTopRatedTv } = useQuery({
    queryKey: ['home-top-rated-tv', systemSettings.tmdbKey],
    queryFn: getTopRatedTvSeries,
  });

  const isLoading = loadingTrending || loadingPopularMovies || loadingTopRatedMovies || loadingPopularTv || loadingTopRatedTv;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-white">
        <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm font-medium">Loading home experience...</span>
      </div>
    );
  }

  // Choose the spotlights for both TV Series and Movies
  const tvHeroItem = popularTv?.[0] || topRatedTv?.[0];
  const movieHeroItem = trendingMovies?.[0] || popularMovies?.[0];

  const sections = [
    { title: 'Trending This Week', icon: <Flame className="w-4 h-4 text-orange-500" />, items: trendingMovies },
    { title: 'Popular Blockbusters', icon: <Film className="w-4 h-4 text-sky-500" />, items: popularMovies },
    { title: 'Top Rated Movies', icon: <Trophy className="w-4 h-4 text-amber-500" />, items: topRatedMovies },
    { title: 'Popular TV Shows', icon: <Tv className="w-4 h-4 text-purple-500" />, items: popularTv },
    { title: 'Top Rated TV Series', icon: <Star className="w-4 h-4 text-emerald-500" />, items: topRatedTv },
  ];

  return (
    <div className="space-y-12 pb-16">
      {/* Side-by-Side Spotlights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: TV Series Spotlight */}
        {tvHeroItem && (
          <div className="relative rounded-2xl overflow-hidden border border-white/5 bg-slate-900/40 shadow-2xl flex flex-col justify-between h-full group hover:border-red-600/30 transition-all duration-300">
            {/* Backdrop image */}
            <div className="absolute inset-0 z-0">
              {tvHeroItem.poster && (
                <img 
                  src={tvHeroItem.poster} 
                  alt={tvHeroItem.title} 
                  className="w-full h-full object-cover opacity-20 filter blur-sm scale-110 group-hover:scale-105 transition-transform duration-700" 
                  referrerPolicy="no-referrer"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#050507] via-[#050507]/90 to-transparent" />
            </div>

            <div className="relative z-10 px-6 py-8 sm:px-8 flex flex-row gap-6 items-center flex-1">
              {/* Poster Thumbnail */}
              {tvHeroItem.poster && (
                <div className="w-24 sm:w-28 shrink-0 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl border border-white/10 select-none">
                  <img 
                    src={tvHeroItem.poster} 
                    alt={tvHeroItem.title} 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}

               {/* Title & Info */}
              <div className="flex-1 text-left space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[9px] bg-red-600/90 text-white font-bold tracking-widest px-2 py-0.5 rounded shadow-sm">
                      TV SHOW SPOTLIGHT
                    </span>
                    {encoder && (
                      <span className="text-[9px] bg-slate-800 text-slate-300 font-bold tracking-widest px-2 py-0.5 rounded shadow-sm flex items-center gap-1 border border-white/10" title="Active Transcoding Engine">
                        <Cpu className="w-3 h-3" />
                        HW: {encoder.toUpperCase()}
                      </span>
                    )}
                    <span className="text-xs text-white/90 font-mono">{tvHeroItem.year}</span>
                  <span className="flex items-center gap-1 text-xs text-amber-400 font-semibold font-mono">
                    ★ {tvHeroItem.rating}
                  </span>
                </div>

                <h2 className="text-xl sm:text-2xl font-light text-white tracking-tight leading-tight line-clamp-1">
                  {tvHeroItem.title}
                </h2>

                {tvHeroItem.overview && (
                  <p className="text-xs text-white/80 max-w-md line-clamp-2 leading-relaxed">
                    {tvHeroItem.overview}
                  </p>
                )}

                <div className="flex flex-wrap gap-2.5 pt-1">
                  <button 
                    onClick={() => onSelectMedia(tvHeroItem)}
                    className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-full flex items-center gap-1.5 text-xs shadow-lg hover:shadow-red-600/20 active:scale-95 transition-all duration-300"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" /> Play
                  </button>
                  <button 
                    onClick={() => onSelectMedia(tvHeroItem)}
                    className="px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium rounded-full flex items-center gap-1.5 text-xs active:scale-95 transition-all duration-300"
                  >
                    <Info className="w-3.5 h-3.5" /> Details
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Right: Movie Spotlight */}
        {movieHeroItem && (
          <div className="relative rounded-2xl overflow-hidden border border-white/5 bg-slate-900/40 shadow-2xl flex flex-col justify-between h-full group hover:border-red-600/30 transition-all duration-300">
            {/* Backdrop image */}
            <div className="absolute inset-0 z-0">
              {movieHeroItem.poster && (
                <img 
                  src={movieHeroItem.poster} 
                  alt={movieHeroItem.title} 
                  className="w-full h-full object-cover opacity-20 filter blur-sm scale-110 group-hover:scale-105 transition-transform duration-700" 
                  referrerPolicy="no-referrer"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#050507] via-[#050507]/90 to-transparent" />
            </div>

            <div className="relative z-10 px-6 py-8 sm:px-8 flex flex-row gap-6 items-center flex-1">
              {/* Poster Thumbnail */}
              {movieHeroItem.poster && (
                <div className="w-24 sm:w-28 shrink-0 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl border border-white/10 select-none">
                  <img 
                    src={movieHeroItem.poster} 
                    alt={movieHeroItem.title} 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}               {/* Title & Info */}
              <div className="flex-1 text-left space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[9px] bg-red-600/90 text-white font-bold tracking-widest px-2 py-0.5 rounded shadow-sm">
                      MOVIE SPOTLIGHT
                    </span>
                    {encoder && (
                      <span className="text-[9px] bg-slate-800 text-slate-300 font-bold tracking-widest px-2 py-0.5 rounded shadow-sm flex items-center gap-1 border border-white/10" title="Active Transcoding Engine">
                        <Cpu className="w-3 h-3" />
                        HW: {encoder.toUpperCase()}
                      </span>
                    )}
                    <span className="text-xs text-white/90 font-mono">{movieHeroItem.year}</span>
                  <span className="flex items-center gap-1 text-xs text-amber-400 font-semibold font-mono">
                    ★ {movieHeroItem.rating}
                  </span>
                </div>

                <h2 className="text-xl sm:text-2xl font-light text-white tracking-tight leading-tight line-clamp-1">
                  {movieHeroItem.title}
                </h2>

                {movieHeroItem.overview && (
                  <p className="text-xs text-white/80 max-w-md line-clamp-2 leading-relaxed">
                    {movieHeroItem.overview}
                  </p>
                )}

                <div className="flex flex-wrap gap-2.5 pt-1">
                  <button 
                    onClick={() => onSelectMedia(movieHeroItem)}
                    className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-full flex items-center gap-1.5 text-xs shadow-lg hover:shadow-red-600/20 active:scale-95 transition-all duration-300"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" /> Play
                  </button>
                  <button 
                    onClick={() => onSelectMedia(movieHeroItem)}
                    className="px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium rounded-full flex items-center gap-1.5 text-xs active:scale-95 transition-all duration-300"
                  >
                    <Info className="w-3.5 h-3.5" /> Details
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Discover Categorized Rows */}
      <div className="space-y-10">
        {sections.map((sec, idx) => {
          if (!sec.items || sec.items.length === 0) return null;
          return (
            <div key={idx} className="space-y-4">
              <div className="flex items-center gap-2">
                {sec.icon}
                <h3 className="text-md sm:text-lg font-medium tracking-tight text-white">
                  {sec.title}
                </h3>
              </div>

              {/* Scrolling Strip */}
              <div className="relative">
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20 scroll-smooth px-1">
                  {sec.items.map((item) => (
                    <div 
                      key={item.id} 
                      className="w-36 sm:w-44 shrink-0 group cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-600 rounded-xl"
                      onClick={() => onSelectMedia(item)}
                      onMouseEnter={() => onHoverMedia?.(item.poster)}
                      onMouseLeave={() => onHoverMedia?.('')}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') onSelectMedia(item); }}
                    >
                      <div className="aspect-[2/3] bg-slate-800 rounded-xl overflow-hidden mb-2 relative border border-white/5 shadow-lg group-hover:scale-105 group-hover:border-red-600 group-hover:ring-2 group-hover:ring-red-600/50 transition-all duration-500">
                        {item.poster ? (
                          <img 
                            src={item.poster} 
                            alt={item.title} 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer" 
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white text-xs text-center p-4">
                            No Poster
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60"></div>
                        <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-col">
                          <span className="text-xs sm:text-sm font-medium leading-tight text-white truncate">
                            {item.title}
                          </span>
                        </div>
                        {/* Rating overlay badge */}
                        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-[10px] font-mono text-amber-400 font-semibold px-1.5 py-0.5 rounded border border-white/10">
                          ★ {item.rating}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
