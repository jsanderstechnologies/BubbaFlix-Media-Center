// Phase 3: TMDB API integration for metadata
const getApiKey = () => {
  if (typeof window !== 'undefined') {
    const localKey = localStorage.getItem('tmdbKey');
    if (localKey) return localKey;
  }
  return (import.meta as any).env.VITE_TMDB_API_KEY || '841059f71aab310b4d4c4f3a7e28328e';
};
const BASE_URL = 'https://api.themoviedb.org/3';

export const getCachedImageUrl = (pathOrUrl: string | null | undefined): string | null => {
  if (!pathOrUrl) return null;
  const fullUrl = pathOrUrl.startsWith('http') ? pathOrUrl : `https://image.tmdb.org/t/p/w500${pathOrUrl}`;
  return `/api/image-proxy?url=${encodeURIComponent(fullUrl)}`;
};


const applyFilters = (results: any[], isSearch: boolean = false, isCalendar: boolean = false) => {
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
  const hideUnreleasedMedia = localStorage.getItem('hideUnreleasedMedia') !== 'false';
  
  const today = new Date().toISOString().split('T')[0];

  return uniqueResults.filter(m => {
    if (!isCalendar && hideUnreleasedMedia) {
      const isTv = !!(m.first_air_date || m.name);
      if (isTv) {
        // TV Series: Only filter out if first air date is in the future, or if status is Rumored/Planned without a past air date
        if (m.first_air_date && m.first_air_date > today) {
          return false;
        }
        if (m.status && ['Rumored', 'Planned'].includes(m.status) && (!m.first_air_date || m.first_air_date > today)) {
          return false;
        }
      } else {
        // Movies: Filter out if release date is in the future or in production/upcoming
        const releaseDate = m.release_date;
        if (releaseDate && releaseDate > today) {
          return false;
        }
        if (m.status && ['Rumored', 'Planned', 'In Production', 'Post Production', 'Upcoming'].includes(m.status)) {
          return false;
        }
      }
    }

    // Strict Calendar rules: Filter out non-English, Asian, Indian, or foreign productions
    if (isCalendar) {
      const lang = (m.original_language || '').toLowerCase();
      const EXCLUDED_LANGS = [
        'hi', 'ta', 'te', 'ml', 'kn', 'bn', 'pa', 'gu', 'mr', 'or', 'ur', // Indian languages
        'ja', 'ko', 'zh', 'cn', 'th', 'vi', 'id', 'tl', 'my', 'km', 'lo', // Asian languages
        'tr', 'ar', 'fa', 'he', 'ru', 'uk', 'pl', 'cs', 'sk', 'hu', 'ro', 'bg', 'el'
      ];
      if (EXCLUDED_LANGS.includes(lang)) {
        return false;
      }
      if (lang !== 'en' && preferredLanguage !== 'all' && preferredLanguage !== lang) {
        return false;
      }
      if (m.origin_country && Array.isArray(m.origin_country) && m.origin_country.length > 0) {
        const hasUS = m.origin_country.includes('US') || m.origin_country.includes('GB') || m.origin_country.includes('CA');
        const hasAsianOrIndian = m.origin_country.some((c: string) => ['IN', 'JP', 'KR', 'CN', 'HK', 'TW', 'TH', 'VN', 'ID', 'PH', 'MY', 'PK', 'BD'].includes(c));
        if (hasAsianOrIndian || !hasUS) {
          return false;
        }
      }
    }

    // Anime filter rule
    if (filterAnime && (m.original_language === 'ja' || m.origin_country?.includes('JP')) && (m.genre_ids?.includes(16) || m.genre_ids?.includes(10759))) {
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
  const today = new Date().toISOString().split('T')[0];
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
      ? `${BASE_URL}/discover/movie?api_key=${apiKey}&with_genres=${genreId}&sort_by=popularity.desc&primary_release_date.lte=${today}`
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
      poster: getCachedImageUrl(m.poster_path),
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
      fetch(`${BASE_URL}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}&page=1`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE_URL}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}&page=2`).then(r => r.json()).catch(() => ({}))
    ]);
    let movieResults = pages.flatMap(p => p?.results || []);

    // 2. Also search if query is an actor/person name to return movies starring that person
    try {
      const personRes = await fetch(`${BASE_URL}/search/person?api_key=${apiKey}&query=${encodeURIComponent(query)}`).then(r => r.json()).catch(() => ({}));
      if (personRes?.results && personRes.results.length > 0) {
        const topPersonId = personRes.results[0].id;
        const creditsRes = await fetch(`${BASE_URL}/person/${topPersonId}/movie_credits?api_key=${apiKey}`).then(r => r.json()).catch(() => ({}));
        if (creditsRes?.cast && Array.isArray(creditsRes.cast)) {
          movieResults = [...movieResults, ...creditsRes.cast];
        }
      }
    } catch (e) {}

    // Apply filters (pass isSearch = true so preferredLanguage filter does not hide title search matches)
    let combined = applyFilters(movieResults, true);

    return combined.slice(0, 50).map((m: any) => ({
      id: m.id,
      title: m.title || m.name,
      year: (m.release_date || m.first_air_date)?.substring(0, 4) || 'N/A',
      rating: m.vote_average?.toFixed(1) || '0.0',
      resolution: '4K',
      poster: getCachedImageUrl(m.poster_path),
      overview: m.overview,
      genres: m.genre_ids || [],
      type: 'movie'
    }));
  } catch (error) {
    console.error("[Frontend] TMDB API Search Error:", error);
    throw error;
  }
};

export const fetchTvdbFallbackImage = async (title: string, tvdbId?: number): Promise<{ poster: string | null; backdrop: string | null }> => {
  try {
    const tvdbApiKey = (typeof window !== 'undefined' && (localStorage.getItem('tvdbApiKey') || '')) || '';
    const res = await fetch(`/api/tvdb/images?title=${encodeURIComponent(title)}${tvdbId ? `&tvdbId=${tvdbId}` : ''}${tvdbApiKey ? `&apiKey=${encodeURIComponent(tvdbApiKey)}` : ''}`)
      .then(r => r.json())
      .catch(() => null);

    if (res?.success && (res.poster || res.backdrop)) {
      return {
        poster: getCachedImageUrl(res.poster),
        backdrop: getCachedImageUrl(res.backdrop)
      };
    }
  } catch (e) {
    console.error("Error fetching TVDB fallback image:", e);
  }
  return { poster: null, backdrop: null };
};

export const getTvSeriesDetails = async (seriesId: number) => {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  try {
    const res = await fetch(`${BASE_URL}/tv/${seriesId}?api_key=${apiKey}&append_to_response=external_ids`);
    if (!res.ok) throw new Error("Failed to fetch tv series details");
    const data = await res.json();

    // Fallback to TVDB for poster or backdrop if TMDB images are missing
    if (data && (!data.poster_path || !data.backdrop_path)) {
      const tvdbImages = await fetchTvdbFallbackImage(data.name || data.original_name, data.external_ids?.tvdb_id);
      if (!data.poster_path && tvdbImages.poster) {
        data.poster_path = tvdbImages.poster;
      }
      if (!data.backdrop_path && tvdbImages.backdrop) {
        data.backdrop_path = tvdbImages.backdrop;
      }
    }
    return data;
  } catch (error) {
    console.error("[Frontend] TMDB API TV Details Error:", error);
    return null;
  }
};

export const getTvSeasonDetails = async (seriesId: number, seasonNumber: number) => {
  const apiKey = getApiKey();
  const tvdbApiKey = (typeof window !== 'undefined' && (localStorage.getItem('tvdbApiKey') || '')) || '';

  // 1. If TMDB Key is present, query TMDB with explicit en-US language for official localized episode titles
  if (apiKey) {
    try {
      const res = await fetch(`${BASE_URL}/tv/${seriesId}/season/${seasonNumber}?api_key=${apiKey}&language=en-US`);
      if (res.ok) {
        const tmdbData = await res.json();
        if (tmdbData && Array.isArray(tmdbData.episodes) && tmdbData.episodes.length > 0) {
          tmdbData.episodes = tmdbData.episodes.map((e: any) => ({
            ...e,
            name: e.name || e.title || `Episode ${e.episode_number}`
          }));
          return tmdbData;
        }
      }
    } catch (e) {
      console.warn("[Frontend] TMDB Season Fetch Warning:", e);
    }
  }

  // 2. Fallback to TVDB for enhanced season/episode metadata
  if (tvdbApiKey) {
    try {
      const tvdbRes = await fetch(`/api/tvdb/season?seriesId=${seriesId}&season=${seasonNumber}&apiKey=${encodeURIComponent(tvdbApiKey)}`).then(r => r.json()).catch(() => null);
      if (tvdbRes?.success && Array.isArray(tvdbRes.episodes) && tvdbRes.episodes.length > 0) {
        return tvdbRes;
      }
    } catch (e) {}
  }

  return null;
};

export const getTrendingTvSeries = async (genreId: number = 0) => {
  const apiKey = getApiKey();
  const today = new Date().toISOString().split('T')[0];
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
      ? `${BASE_URL}/discover/tv?api_key=${apiKey}&with_genres=${genreId}&sort_by=popularity.desc&first_air_date.lte=${today}`
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
      poster: getCachedImageUrl(m.poster_path),
      overview: m.overview,
      genres: m.genre_ids || [],
      type: 'series'
    }));
  } catch (error) {
    console.error("[Frontend] TMDB API Error:", error);
    throw error;
  }
};

export const getUpcomingMovies = async (genreId: number = 0) => {
  const apiKey = getApiKey();
  const today = new Date().toISOString().split('T')[0];
  if (!apiKey) return [];

  try {
    const genreParam = genreId > 0 ? `&with_genres=${genreId}` : '';
    const pages = await Promise.all([
      fetch(`${BASE_URL}/movie/upcoming?api_key=${apiKey}&region=US&page=1${genreParam}`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE_URL}/movie/upcoming?api_key=${apiKey}&region=US&page=2${genreParam}`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE_URL}/movie/upcoming?api_key=${apiKey}&region=US&page=3${genreParam}`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE_URL}/discover/movie?api_key=${apiKey}&region=US&with_origin_country=US&with_original_language=en&primary_release_date.gte=${today}&sort_by=primary_release_date.asc${genreParam}&page=1`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE_URL}/discover/movie?api_key=${apiKey}&region=US&with_origin_country=US&with_original_language=en&primary_release_date.gte=${today}&sort_by=primary_release_date.asc${genreParam}&page=2`).then(r => r.json()).catch(() => ({}))
    ]);

    const rawResults = pages.flatMap(p => p.results || []).filter(m => m && m.id && m.release_date && m.release_date >= today);
    const filtered = applyFilters(rawResults, false, true);

    return filtered.slice(0, 80).map((m: any) => ({
      id: m.id,
      title: m.title,
      year: m.release_date?.substring(0, 4) || 'N/A',
      releaseDate: m.release_date,
      rating: m.vote_average?.toFixed(1) || '0.0',
      poster: getCachedImageUrl(m.poster_path),
      backdrop: getCachedImageUrl(m.backdrop_path),
      overview: m.overview,
      genres: m.genre_ids || [],
      type: 'movie'
    }));
  } catch (err) {
    console.error("[Frontend] TMDB Upcoming Movies Error:", err);
    return [];
  }
};

export const getUpcomingTvSeries = async (genreId: number = 0) => {
  const apiKey = getApiKey();
  const today = new Date().toISOString().split('T')[0];
  if (!apiKey) return [];

  try {
    const genreParam = genreId > 0 ? `&with_genres=${genreId}` : '';
    const pages = await Promise.all([
      fetch(`${BASE_URL}/discover/tv?api_key=${apiKey}&with_origin_country=US&with_original_language=en&air_date.gte=${today}&sort_by=popularity.desc${genreParam}&page=1`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE_URL}/discover/tv?api_key=${apiKey}&with_origin_country=US&with_original_language=en&air_date.gte=${today}&sort_by=popularity.desc${genreParam}&page=2`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE_URL}/discover/tv?api_key=${apiKey}&with_origin_country=US&with_original_language=en&first_air_date.gte=${today}&sort_by=first_air_date.asc${genreParam}&page=1`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE_URL}/discover/tv?api_key=${apiKey}&with_origin_country=US&with_original_language=en&first_air_date.gte=${today}&sort_by=first_air_date.asc${genreParam}&page=2`).then(r => r.json()).catch(() => ({}))
    ]);

    const rawResults = pages
      .flatMap(p => p.results || [])
      .filter(m => {
        if (!m || !m.id) return false;
        const isEnglish = !m.original_language || m.original_language === 'en';
        const isUSOrigin = !m.origin_country || m.origin_country.length === 0 || m.origin_country.includes('US');
        return isEnglish && isUSOrigin;
      });

    const filtered = applyFilters(rawResults, false, true);

    return filtered.slice(0, 80).map((m: any) => ({
      id: m.id,
      title: m.name,
      year: (m.first_air_date || m.next_episode_to_air?.air_date)?.substring(0, 4) || 'N/A',
      releaseDate: m.next_episode_to_air?.air_date || m.first_air_date || today,
      nextEpisode: m.next_episode_to_air ? `S${m.next_episode_to_air.season_number}E${m.next_episode_to_air.episode_number}` : undefined,
      rating: m.vote_average?.toFixed(1) || '0.0',
      poster: getCachedImageUrl(m.poster_path),
      backdrop: getCachedImageUrl(m.backdrop_path),
      overview: m.overview,
      genres: m.genre_ids || [],
      type: 'series'
    }));
  } catch (err) {
    console.error("[Frontend] TMDB Upcoming TV Series Error:", err);
    return [];
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
      fetch(`${BASE_URL}/search/tv?api_key=${apiKey}&query=${encodeURIComponent(query)}&page=1`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE_URL}/search/tv?api_key=${apiKey}&query=${encodeURIComponent(query)}&page=2`).then(r => r.json()).catch(() => ({}))
    ]);
    let tvResults = pages.flatMap(p => p?.results || []);

    // 2. Also search if query is an actor/person name to return TV series starring that person
    try {
      const personRes = await fetch(`${BASE_URL}/search/person?api_key=${apiKey}&query=${encodeURIComponent(query)}`).then(r => r.json()).catch(() => ({}));
      if (personRes?.results && personRes.results.length > 0) {
        const topPersonId = personRes.results[0].id;
        const creditsRes = await fetch(`${BASE_URL}/person/${topPersonId}/tv_credits?api_key=${apiKey}`).then(r => r.json()).catch(() => ({}));
        if (creditsRes?.cast && Array.isArray(creditsRes.cast)) {
          tvResults = [...tvResults, ...creditsRes.cast];
        }
      }
    } catch (e) {}

    // Apply filters (pass isSearch = true so preferredLanguage filter does not hide title search matches)
    let combined = applyFilters(tvResults, true);

    return combined.slice(0, 50).map((m: any) => ({
      id: m.id,
      title: m.name || m.title,
      year: (m.first_air_date || m.release_date)?.substring(0, 4) || 'N/A',
      rating: m.vote_average?.toFixed(1) || '0.0',
      resolution: '4K',
      poster: getCachedImageUrl(m.poster_path),
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
    const [detailsRes, creditsRes, videosRes] = await Promise.all([
      fetch(`${BASE_URL}/${type}/${id}?api_key=${apiKey}`),
      fetch(`${BASE_URL}/${type}/${id}/credits?api_key=${apiKey}`),
      fetch(`${BASE_URL}/${type}/${id}/videos?api_key=${apiKey}`)
    ]);

    const details = detailsRes.ok ? await detailsRes.json() : {};
    const credits = creditsRes.ok ? await creditsRes.json() : { cast: [], crew: [] };
    const videos = videosRes.ok ? await videosRes.json() : { results: [] };

    const youtubeVideos = (videos.results || []).filter((v: any) => v.site === 'YouTube');
    const trailerObj = youtubeVideos.find((v: any) => v.type === 'Trailer' && v.official) ||
                       youtubeVideos.find((v: any) => v.type === 'Trailer') ||
                       youtubeVideos.find((v: any) => v.type === 'Teaser') ||
                       youtubeVideos[0];

    const trailerKey = trailerObj ? trailerObj.key : null;
    const trailers = youtubeVideos.map((v: any) => ({
      name: v.name,
      key: v.key,
      type: v.type,
      site: v.site
    }));

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
      profilePath: getCachedImageUrl(member.profile_path)
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
      imdbId: details.imdb_id || details.external_ids?.imdb_id || null,
      trailerKey,
      trailers
    };
  } catch (error) {
    console.error("[Frontend] Error fetching media credits and details:", error);
    return {
      directors: [],
      producers: [],
      releaseDate: 'N/A',
      cast: [],
      trailerKey: null,
      trailers: []
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
      profilePath: getCachedImageUrl(p.profile_path)
    }));
  } catch (e) {
    console.error("[Frontend] Error searching actors:", e);
    return [];
  }
};



