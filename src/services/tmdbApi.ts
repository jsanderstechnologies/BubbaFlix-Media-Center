// Phase 3: TMDB API integration for metadata
const getApiKey = () => {
  if (typeof window !== 'undefined') {
    const localKey = localStorage.getItem('tmdbKey');
    if (localKey) return localKey;
  }
  return (import.meta as any).env.VITE_TMDB_API_KEY || '';
};
const BASE_URL = 'https://api.themoviedb.org/3';


const applyFilters = (results: any[], isSearch: boolean = false) => {
  // Deduplicate results by ID to avoid React duplicate key warnings
  const seen = new Set();
  const uniqueResults = results.filter(m => {
    if (!m || !m.id) return false;
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  if (typeof window === 'undefined') return uniqueResults;
  const filterAnime = localStorage.getItem('filterAnime') === 'true';
  const preferredLanguage = localStorage.getItem('preferredLanguage') || '';
  
  return uniqueResults.filter(m => {
    if (filterAnime && m.original_language === 'ja' && (m.genre_ids?.includes(16) || m.genre_ids?.includes(10759))) {
      return false;
    }
    // Bypassed for explicit search queries so international productions (e.g. The Fifth Element, original_language: fr) are returned
    if (!isSearch && preferredLanguage && preferredLanguage !== 'all' && m.original_language !== preferredLanguage) {
      return false;
    }
    return true;
  });
};

export const getTrendingMovies = async (genreId: number = 0) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[Frontend] No VITE_TMDB_API_KEY found, using fallback mock data for preview.");
    const mockMovies = [
      { id: 1, title: 'The Creator', year: '2023', rating: '8.2', resolution: '4K HDR', poster: 'https://image.tmdb.org/t/p/w500/vBZ0qvaRxqEhZwl6LWmruUqNP8.jpg', overview: 'Amid a future war between the human race and the forces of artificial intelligence, a hardened ex-special forces agent grieving the disappearance of his wife, is recruited to hunt down and kill the Creator.', genres: [28, 878, 53], type: 'movie' },
      { id: 2, title: 'Dune: Part Two', year: '2024', rating: '9.1', resolution: '1080P', poster: 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2JGqqBTrw.jpg', overview: 'Paul Atreides unites with Chani and the Fremen while on a warpath of revenge against the conspirators who destroyed his family.', genres: [28, 12, 878], type: 'movie' },
      { id: 3, title: 'Poor Things', year: '2023', rating: '7.9', resolution: '4K', poster: 'https://image.tmdb.org/t/p/w500/kCGlIMHnOm8JPXq3rXM3c5wOX91.jpg', overview: 'Brought back to life by an unorthodox scientist, a young woman runs off with a debauched lawyer on a whirlwind adventure across the continents.', genres: [35, 14, 10749], type: 'movie' },
      { id: 4, title: 'Saltburn', year: '2023', rating: '7.5', resolution: 'HDR10', poster: 'https://image.tmdb.org/t/p/w500/qjhahNLSZ705B5JP92IXymSmPIX.jpg', overview: 'Struggling to find his place at Oxford University, student Oliver Quick finds himself drawn into the world of the charming and aristocratic Felix Catton.', genres: [18, 9648, 53], type: 'movie' },
      { id: 5, title: 'Argylle', year: '2024', rating: '5.8', resolution: 'SD', poster: 'https://image.tmdb.org/t/p/w500/siduVKgOnABO4WH4lOwPQwaGwAL.jpg', overview: 'When the plots of reclusive author Elly Conway\'s fictional espionage novels begin to mirror the covert actions of a real-life spy organization, quiet evenings at home become a thing of the past.', genres: [28, 35, 53], type: 'movie' }
    ];
    if (genreId > 0) {
      const filtered = mockMovies.filter(m => m.genres && m.genres.includes(genreId));
      return filtered.length > 0 ? filtered : mockMovies;
    }
    return mockMovies;
  }

  try {
    const endpoint = genreId > 0 
      ? `${BASE_URL}/discover/movie?api_key=${apiKey}&with_genres=${genreId}&sort_by=popularity.desc`
      : `${BASE_URL}/trending/movie/week?api_key=${apiKey}`;

    const pages = await Promise.all([
      fetch(`${endpoint}&page=1`).then(r => r.json()),
      fetch(`${endpoint}&page=2`).then(r => r.json()),
      fetch(`${endpoint}&page=3`).then(r => r.json())
    ]);
    let results = pages.flatMap(p => p.results || []);
    results = applyFilters(results);
    return results.slice(0, 50).map((m: any) => ({
      id: m.id,
      title: m.title,
      year: m.release_date?.substring(0, 4) || 'N/A',
      rating: m.vote_average?.toFixed(1) || '0.0',
      resolution: '4K', // TMDB doesn't have stream info, so we mock it
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
      overview: m.overview,
      genres: m.genre_ids || [],
      type: 'movie'
    }));
  } catch (error) {
    console.error("[Frontend] TMDB API Error:", error);
    throw error;
  }
};

export const searchMovies = async (query: string) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[Frontend] No VITE_TMDB_API_KEY found, using fallback mock data for search.");
    return [
      { id: 6, title: `Search result: ${query}`, year: '2024', rating: '8.0', resolution: '4K', poster: null, overview: 'Mock search result.' }
    ];
  }

  try {
    // 1. Search movies by title
    const pages = await Promise.all([
      fetch(`${BASE_URL}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}&page=1`).then(r => r.json()),
      fetch(`${BASE_URL}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}&page=2`).then(r => r.json())
    ]);
    let movieResults = pages.flatMap(p => p.results || []);

    // Apply filters (pass isSearch = true so preferredLanguage filter does not hide title search matches)
    let combined = applyFilters(movieResults, true);

    return combined.slice(0, 50).map((m: any) => ({
      id: m.id,
      title: m.title || m.name,
      year: (m.release_date || m.first_air_date)?.substring(0, 4) || 'N/A',
      rating: m.vote_average?.toFixed(1) || '0.0',
      resolution: '4K',
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
      overview: m.overview,
      genres: m.genre_ids || [],
      type: 'movie'
    }));
  } catch (error) {
    console.error("[Frontend] TMDB API Search Error:", error);
    throw error;
  }
};

export const getTvSeriesDetails = async (seriesId: number) => {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  try {
    const res = await fetch(`${BASE_URL}/tv/${seriesId}?api_key=${apiKey}`);
    if (!res.ok) throw new Error("Failed to fetch tv series details");
    return await res.json();
  } catch (error) {
    console.error("[Frontend] TMDB API TV Details Error:", error);
    return null;
  }
};

export const getTvSeasonDetails = async (seriesId: number, seasonNumber: number) => {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  try {
    const res = await fetch(`${BASE_URL}/tv/${seriesId}/season/${seasonNumber}?api_key=${apiKey}`);
    if (!res.ok) throw new Error("Failed to fetch tv season details");
    return await res.json();
  } catch (error) {
    console.error("[Frontend] TMDB API TV Season Error:", error);
    return null;
  }
};

export const getTrendingTvSeries = async (genreId: number = 0) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    const mockTv = [
      { id: 101, title: 'Shōgun', year: '2024', rating: '8.6', resolution: '4K HDR', poster: 'https://image.tmdb.org/t/p/w500/7O4iVfOMQmdCSxhOg1WNzG1Syj.jpg', overview: 'In Japan in the year 1600, at the dawn of a century-defining civil war, Lord Yoshii Toranaga is fighting for his life as his enemies on the Council of Regents unite against him.', genres: [18, 10768], type: 'series' },
      { id: 102, title: 'Fallout', year: '2024', rating: '8.4', resolution: '4K HDR', poster: 'https://image.tmdb.org/t/p/w500/A3s3AOWI1356oU02Z0ZETa9w8vW.jpg', overview: 'The story of haves and have-nots in a world in which there’s almost nothing left to have. 200 years after the apocalypse, the gentle denizens of luxury fallout shelters are forced to return to the irradiated hellscape their ancestors left behind.', genres: [10765, 28, 12, 18], type: 'series' },
      { id: 103, title: '3 Body Problem', year: '2024', rating: '7.6', resolution: '4K', poster: 'https://image.tmdb.org/t/p/w500/YKZptD9tQjA05oQdtaB8gW8cMh.jpg', overview: 'Across continents and decades, five brilliant friends make earth-shattering discoveries as the laws of science unravel and an existential threat emerges.', genres: [10765, 9648, 18], type: 'series' },
      { id: 104, title: 'True Detective', year: '2014', rating: '8.3', resolution: '1080p', poster: 'https://image.tmdb.org/t/p/w500/cuV2O5Zy6GLBsz0dBJC5AQpZl10.jpg', overview: 'An American anthology police detective series utilizing multiple timelines in which investigations seem to unearth personal and professional secrets of those involved, both within or outside the law.', genres: [18, 80, 9648], type: 'series' },
      { id: 105, title: 'The Bear', year: '2022', rating: '8.3', resolution: '4K', poster: 'https://image.tmdb.org/t/p/w500/o7y1BGEy2X3yN5QJ0E5XwOIfU1Q.jpg', overview: 'Carmen Berzatto, a brilliant young chef from the fine-dining world is forced to return to run his family sandwich shop.', genres: [35, 18], type: 'series' }
    ];
    if (genreId > 0) {
      const filtered = mockTv.filter(m => m.genres && m.genres.includes(genreId));
      return filtered.length > 0 ? filtered : mockTv;
    }
    return mockTv;
  }

  try {
    const endpoint = genreId > 0
      ? `${BASE_URL}/discover/tv?api_key=${apiKey}&with_genres=${genreId}&sort_by=popularity.desc`
      : `${BASE_URL}/trending/tv/week?api_key=${apiKey}`;

    const pages = await Promise.all([
      fetch(`${endpoint}&page=1`).then(r => r.json()),
      fetch(`${endpoint}&page=2`).then(r => r.json()),
      fetch(`${endpoint}&page=3`).then(r => r.json())
    ]);
    let results = pages.flatMap(p => p.results || []);
    results = applyFilters(results);
    return results.slice(0, 50).map((m: any) => ({
      id: m.id,
      title: m.name,
      year: m.first_air_date?.substring(0, 4) || 'N/A',
      rating: m.vote_average?.toFixed(1) || '0.0',
      resolution: '4K',
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
      overview: m.overview,
      genres: m.genre_ids || [],
      type: 'series'
    }));
  } catch (error) {
    console.error("[Frontend] TMDB API Error:", error);
    throw error;
  }
};

export const searchTvSeries = async (query: string) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return [
      { id: 106, title: `Search result: ${query}`, year: '2024', rating: '8.0', resolution: '4K', poster: null, overview: 'Mock search result.' }
    ];
  }

  try {
    // 1. Search TV by title
    const pages = await Promise.all([
      fetch(`${BASE_URL}/search/tv?api_key=${apiKey}&query=${encodeURIComponent(query)}&page=1`).then(r => r.json()),
      fetch(`${BASE_URL}/search/tv?api_key=${apiKey}&query=${encodeURIComponent(query)}&page=2`).then(r => r.json())
    ]);
    let tvResults = pages.flatMap(p => p.results || []);

    // Apply filters (pass isSearch = true so preferredLanguage filter does not hide title search matches)
    let combined = applyFilters(tvResults, true);

    return combined.slice(0, 50).map((m: any) => ({
      id: m.id,
      title: m.name || m.title,
      year: (m.first_air_date || m.release_date)?.substring(0, 4) || 'N/A',
      rating: m.vote_average?.toFixed(1) || '0.0',
      resolution: '4K',
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
      overview: m.overview,
      genres: m.genre_ids || [],
      type: 'series'
    }));
  } catch (error) {
    console.error("[Frontend] TMDB API Search Error:", error);
    throw error;
  }
};

export const getMpaaRating = async (id: number, isSeries: boolean): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    const ratings = isSeries ? ['TV-MA', 'TV-14', 'TV-PG', 'TV-G'] : ['R', 'PG-13', 'PG', 'G'];
    return ratings[id % ratings.length];
  }
  try {
    if (isSeries) {
      const res = await fetch(`${BASE_URL}/tv/${id}/content_ratings?api_key=${apiKey}`);
      if (res.ok) {
        const data = await res.json();
        const usRating = data.results?.find((r: any) => r.iso_3166_1 === 'US');
        if (usRating?.rating) return usRating.rating;
        if (data.results?.[0]?.rating) return data.results[0].rating;
      }
    } else {
      const res = await fetch(`${BASE_URL}/movie/${id}/release_dates?api_key=${apiKey}`);
      if (res.ok) {
        const data = await res.json();
        const usRelease = data.results?.find((r: any) => r.iso_3166_1 === 'US');
        if (usRelease) {
          const cert = usRelease.release_dates?.find((d: any) => d.certification)?.certification;
          if (cert) return cert;
        }
        for (const r of data.results || []) {
          const cert = r.release_dates?.find((d: any) => d.certification)?.certification;
          if (cert) return cert;
        }
      }
    }
  } catch (error) {
    console.error("[Frontend] TMDB MPAA Rating Error:", error);
  }
  return isSeries ? 'TV-14' : 'PG-13';
};

export const getPopularMovies = async (): Promise<any[]> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return [
      { id: 2, title: 'Dune: Part Two', year: '2024', rating: '9.1', poster: 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2JGqqBTrw.jpg', overview: 'Paul Atreides unites with Chani and the Fremen while on a warpath of revenge against the conspirators who destroyed his family.', type: 'movie' },
      { id: 4, title: 'Saltburn', year: '2023', rating: '7.5', poster: 'https://image.tmdb.org/t/p/w500/qjhahNLSZ705B5JP92IXymSmPIX.jpg', overview: 'Struggling to find his place at Oxford University, student Oliver Quick finds himself drawn into the world of the charming and aristocratic Felix Catton.', type: 'movie' }
    ];
  }
  try {
    const res = await fetch(`${BASE_URL}/movie/popular?api_key=${apiKey}&page=1`);
    if (!res.ok) throw new Error("Failed to fetch popular movies");
    const data = await res.json();
    return applyFilters(data.results || []).slice(0, 20).map((m: any) => ({
      id: m.id,
      title: m.title,
      year: m.release_date?.substring(0, 4) || 'N/A',
      rating: m.vote_average?.toFixed(1) || '0.0',
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
      overview: m.overview,
      genres: m.genre_ids || [],
      type: 'movie'
    }));
  } catch (e) {
    console.error(e);
    return [];
  }
};

export const getTopRatedMovies = async (): Promise<any[]> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return [
      { id: 3, title: 'Poor Things', year: '2023', rating: '7.9', poster: 'https://image.tmdb.org/t/p/w500/kCGlIMHnOm8JPXq3rXM3c5wOX91.jpg', overview: 'Brought back to life by an unorthodox scientist, a young woman runs off with a debauched lawyer on a whirlwind adventure across the continents.', type: 'movie' },
      { id: 1, title: 'The Creator', year: '2023', rating: '8.2', poster: 'https://image.tmdb.org/t/p/w500/vBZ0qvaRxqEhZwl6LWmruUqNP8.jpg', overview: 'Amid a future war between the human race and the forces of artificial intelligence, a hardened ex-special forces agent grieving the disappearance of his wife, is recruited to hunt down and kill the Creator.', type: 'movie' }
    ];
  }
  try {
    const res = await fetch(`${BASE_URL}/movie/top_rated?api_key=${apiKey}&page=1`);
    if (!res.ok) throw new Error("Failed to fetch top rated movies");
    const data = await res.json();
    return applyFilters(data.results || []).slice(0, 20).map((m: any) => ({
      id: m.id,
      title: m.title,
      year: m.release_date?.substring(0, 4) || 'N/A',
      rating: m.vote_average?.toFixed(1) || '0.0',
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
      overview: m.overview,
      genres: m.genre_ids || [],
      type: 'movie'
    }));
  } catch (e) {
    console.error(e);
    return [];
  }
};

export const getPopularTvSeries = async (): Promise<any[]> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return [
      { id: 102, title: 'Fallout', year: '2024', rating: '8.4', poster: 'https://image.tmdb.org/t/p/w500/A3s3AOWI1356oU02Z0ZETa9w8vW.jpg', overview: 'The story of haves and have-nots in a world in which there’s almost nothing left to have. 200 years after the apocalypse, the gentle denizens of luxury fallout shelters are forced to return to the irradiated hellscape their ancestors left behind.', type: 'series' },
      { id: 105, title: 'The Bear', year: '2022', rating: '8.3', poster: 'https://image.tmdb.org/t/p/w500/o7y1BGEy2X3yN5QJ0E5XwOIfU1Q.jpg', overview: 'Carmen Berzatto, a brilliant young chef from the family sandwich shop is forced to return to run his family sandwich shop.', type: 'series' }
    ];
  }
  try {
    const res = await fetch(`${BASE_URL}/tv/popular?api_key=${apiKey}&page=1`);
    if (!res.ok) throw new Error("Failed to fetch popular tv series");
    const data = await res.json();
    return applyFilters(data.results || []).slice(0, 20).map((m: any) => ({
      id: m.id,
      title: m.name,
      year: m.first_air_date?.substring(0, 4) || 'N/A',
      rating: m.vote_average?.toFixed(1) || '0.0',
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
      overview: m.overview,
      genres: m.genre_ids || [],
      type: 'series'
    }));
  } catch (e) {
    console.error(e);
    return [];
  }
};

export const getTopRatedTvSeries = async (): Promise<any[]> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return [
      { id: 101, title: 'Shōgun', year: '2024', rating: '8.6', poster: 'https://image.tmdb.org/t/p/w500/7O4iVfOMQmdCSxhOg1WNzG1Syj.jpg', overview: 'In Japan in the year 1600, at the dawn of a century-defining civil war, Lord Yoshii Toranaga is fighting for his life as his enemies on the Council of Regents unite against him.', type: 'series' },
      { id: 103, title: '3 Body Problem', year: '2024', rating: '7.6', poster: 'https://image.tmdb.org/t/p/w500/YKZptD9tQjA05oQdtaB8gW8cMh.jpg', overview: 'Across continents and decades, five brilliant friends make earth-shattering discoveries as the laws of science unravel and an existential threat emerges.', type: 'series' }
    ];
  }
  try {
    const res = await fetch(`${BASE_URL}/tv/top_rated?api_key=${apiKey}&page=1`);
    if (!res.ok) throw new Error("Failed to fetch top rated tv series");
    const data = await res.json();
    return applyFilters(data.results || []).slice(0, 20).map((m: any) => ({
      id: m.id,
      title: m.name,
      year: m.first_air_date?.substring(0, 4) || 'N/A',
      rating: m.vote_average?.toFixed(1) || '0.0',
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
      overview: m.overview,
      genres: m.genre_ids || [],
      type: 'series'
    }));
  } catch (e) {
    console.error(e);
    return [];
  }
};

export const getMediaCreditsAndDetails = async (id: number, isSeries: boolean) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    const mockCast = [
      { id: 1, name: 'Pedro Pascal', character: 'Joel Miller', profilePath: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150&h=150' },
      { id: 2, name: 'Florence Pugh', character: 'Yelena Belova', profilePath: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150&h=150' },
      { id: 3, name: 'Zendaya', character: 'Chani', profilePath: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150&h=150' },
      { id: 4, name: 'Timothée Chalamet', character: 'Paul Atreides', profilePath: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=150&h=150' },
      { id: 5, name: 'Austin Butler', character: 'Feyd-Rautha Harkonnen', profilePath: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=150&h=150' }
    ];
    return {
      directors: ['Denis Villeneuve'],
      producers: ['Mary Parent', 'Cale Boyter'],
      releaseDate: isSeries ? 'First Aired: April 11, 2024' : 'Released: March 1, 2024',
      cast: mockCast,
      genres: ['Action', 'Sci-Fi', 'Adventure'],
      tagline: 'The saga continues.'
    };
  }

  try {
    const type = isSeries ? 'tv' : 'movie';
    const [detailsRes, creditsRes] = await Promise.all([
      fetch(`${BASE_URL}/${type}/${id}?api_key=${apiKey}`),
      fetch(`${BASE_URL}/${type}/${id}/credits?api_key=${apiKey}`)
    ]);

    const details = detailsRes.ok ? await detailsRes.json() : {};
    const credits = creditsRes.ok ? await creditsRes.json() : { cast: [], crew: [] };

    const directors: string[] = [];
    const producers: string[] = [];

    if (isSeries) {
      if (details.created_by && details.created_by.length > 0) {
        details.created_by.forEach((creator: any) => directors.push(creator.name));
      }
      credits.crew?.forEach((member: any) => {
        if (member.job === 'Executive Producer' || member.job === 'Producer') {
          if (producers.length < 3 && !producers.includes(member.name)) {
            producers.push(member.name);
          }
        }
        if (member.job === 'Director' || member.job === 'Series Director') {
          if (directors.length < 2 && !directors.includes(member.name)) {
            directors.push(member.name);
          }
        }
      });
    } else {
      credits.crew?.forEach((member: any) => {
        if (member.job === 'Director') {
          directors.push(member.name);
        } else if (member.job === 'Producer') {
          if (producers.length < 3 && !producers.includes(member.name)) {
            producers.push(member.name);
          }
        }
      });
    }

    const cast = (credits.cast || []).slice(0, 10).map((member: any) => ({
      id: member.id,
      name: member.name,
      character: member.character,
      profilePath: member.profile_path ? `https://image.tmdb.org/t/p/w185${member.profile_path}` : null
    }));

    return {
      directors,
      producers,
      releaseDate: isSeries 
        ? (details.first_air_date ? `First Aired: ${details.first_air_date}` : 'N/A')
        : (details.release_date ? `Released: ${details.release_date}` : 'N/A'),
      cast,
      genres: details.genres?.map((g: any) => g.name) || [],
      tagline: details.tagline || '',
      imdbId: details.imdb_id || details.external_ids?.imdb_id || null
    };
  } catch (error) {
    console.error("[Frontend] Error fetching media credits and details:", error);
    return {
      directors: [],
      producers: [],
      releaseDate: 'N/A',
      cast: []
    };
  }
};

export const searchActors = async (query: string) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    const mockActors = [
      { id: 1, name: 'Pedro Pascal', knownFor: 'The Last of Us, The Mandalorian', profilePath: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150&h=150' },
      { id: 2, name: 'Florence Pugh', knownFor: 'Dune: Part Two, Oppenheimer', profilePath: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150&h=150' },
      { id: 3, name: 'Zendaya', knownFor: 'Dune, Euphoria, Spider-Man', profilePath: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150&h=150' },
      { id: 4, name: 'Timothée Chalamet', knownFor: 'Dune, Wonka, Call Me by Your Name', profilePath: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=150&h=150' },
      { id: 5, name: 'Cillian Murphy', knownFor: 'Oppenheimer, Peaky Blinders', profilePath: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=150&h=150' }
    ];
    return mockActors.filter(actor => actor.name.toLowerCase().includes(query.toLowerCase()));
  }

  try {
    const res = await fetch(`${BASE_URL}/search/person?api_key=${apiKey}&query=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).slice(0, 15).map((p: any) => ({
      id: p.id,
      name: p.name,
      knownFor: p.known_for?.map((m: any) => m.title || m.name).join(', ') || 'N/A',
      profilePath: p.profile_path ? `https://image.tmdb.org/t/p/w185${p.profile_path}` : null
    }));
  } catch (e) {
    console.error("[Frontend] Error searching actors:", e);
    return [];
  }
};



