// TorBox Search API client integration

const getAuthHeaders = () => {
  const token = localStorage.getItem('torboxApiKey');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

export interface TorBoxSearchResult {
  id: string;
  name: string;
  isCached: boolean;
  quality: string;
  size: string;
  sizeBytes?: number;
  url: string;
  type: 'torrent' | 'usenet';
  fullDescription: string;
  hash?: string;
  source?: string;
}

const formatBytes = (bytes: number, decimals = 2) => {
  if (!bytes || isNaN(bytes)) return "Unknown Size";
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

const mapResults = (items: any[], type: 'torrent' | 'usenet', originalTitle?: string): TorBoxSearchResult[] => {
  if (!items || !Array.isArray(items)) return [];
  
  const badExts = ['.exe', '.zip', '.rar', '.7z', '.txt', '.nfo', '.srt', '.sub', '.iso', '.pdf', '.apk', '.bin'];
  
  return items
    .filter((item: any) => {
      const name = (item.name || item.title || "").toLowerCase();
      if (badExts.some(ext => name.endsWith(ext))) return false;
      
      if (originalTitle) {
          const cleanTitle = originalTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '');
          const cleanName = name.replace(/[\._]/g, ' ').replace(/[^a-z0-9\s]/g, '');
          
          const words = cleanTitle.split(' ').filter((w: string) => w.length > 2 && w !== 'the' && w !== 'and');
          if (words.length > 0) {
              const primaryWord = words[0];
              const regex = new RegExp(`\\b${primaryWord}\\b`, 'i');
              if (!regex.test(cleanName)) {
                  return false;
              }
          }
      }
      
      return true;
    })
    .map((item: any, index: number) => {
    const name = item.name || item.title || "Unknown Download";
    const size = item.size ? formatBytes(item.size) : "Unknown Size";
    const hash = item.hash || item.info_hash || "";
    
    let quality = "HD";
    const resolutionMatch = name.match(/(4K|2160p|1080p|720p|SD)/i);
    if (resolutionMatch) {
      quality = resolutionMatch[1];
    }

    const url = item.magnet || item.link || item.download || "";
    const source = item.source || "";

    return {
      id: `${type}-${index}-${hash || name}`,
      name,
      isCached: item.cached === true || item.is_cached === true,
      quality,
      size,
      sizeBytes: item.size || 0,
      url,
      type,
      hash,
      source,
      fullDescription: `Source: TorBox Voyager Search (${type.toUpperCase()})${source ? ` (${source})` : ''}\nSeeders/Peers: ${item.seeds || 0}/${item.peers || 0}\nHash/Id: ${hash || 'N/A'}`
    };
  });
};

export const fetchStreamsForTvSeries = async (title: string, season: number, episode: number, imdbId?: string): Promise<TorBoxSearchResult[]> => {
  const queryStr = `${title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
  console.log(`[TorBox Search] Searching TV Series: "${queryStr}" (IMDB: ${imdbId || 'N/A'})`);
  
  const headers = getAuthHeaders();
  
  const performSearch = async (): Promise<TorBoxSearchResult[]> => {
    const enableUsenet = localStorage.getItem('enableUsenetSearch') !== 'false';
    const enableTorrent = localStorage.getItem('enableTorrentSearch') !== 'false';

    const [usenetResults, torrentResults] = await Promise.all([
      (async () => {
        if (!enableUsenet) return [];
        try {
          const res = await fetch(`/api/torbox/search?q=${encodeURIComponent(queryStr)}`, { headers });
          const json = res.ok ? await res.json() : null;
          return (json?.success && json?.data) ? mapResults(json.data, 'usenet', title) : [];
        } catch (e) {
          console.error("[TorBox Search] Usenet query error:", e);
          return [];
        }
      })(),
      (async () => {
        if (!enableTorrent) return [];
        try {
          const imdbParam = imdbId ? `&imdbId=${encodeURIComponent(imdbId)}` : '';
          const res = await fetch(`/api/torbox/torrents/search?q=${encodeURIComponent(queryStr)}${imdbParam}`, { headers });
          const json = res.ok ? await res.json() : null;
          return (json?.success && json?.data) ? mapResults(json.data, 'torrent', title) : [];
        } catch (e) {
          console.error("[TorBox Search] Torrent query error:", e);
          return [];
        }
      })()
    ]);
    
    return [...usenetResults, ...torrentResults];
  };

  try {
    return await performSearch();
  } catch (error) {
    console.error("[TorBox Search] Error querying TV series streams:", error);
    return [];
  }
};

export const fetchStreamsForMovie = async (title: string, year?: string, imdbId?: string): Promise<TorBoxSearchResult[]> => {
  const queryStr = (year && year !== 'N/A') ? `${title} ${year}` : title;
  console.log(`[TorBox Search] Searching Movie: "${queryStr}" (IMDB: ${imdbId || 'N/A'})`);
  
  const headers = getAuthHeaders();
  
  const performSearch = async (): Promise<TorBoxSearchResult[]> => {
    const enableUsenet = localStorage.getItem('enableUsenetSearch') !== 'false';
    const enableTorrent = localStorage.getItem('enableTorrentSearch') !== 'false';

    const [usenetResults, torrentResults] = await Promise.all([
      (async () => {
        if (!enableUsenet) return [];
        try {
          const res = await fetch(`/api/torbox/search?q=${encodeURIComponent(queryStr)}`, { headers });
          const json = res.ok ? await res.json() : null;
          return (json?.success && json?.data) ? mapResults(json.data, 'usenet', title) : [];
        } catch (e) {
          console.error("[TorBox Search] Usenet query error:", e);
          return [];
        }
      })(),
      (async () => {
        if (!enableTorrent) return [];
        try {
          const imdbParam = imdbId ? `&imdbId=${encodeURIComponent(imdbId)}` : '';
          const res = await fetch(`/api/torbox/torrents/search?q=${encodeURIComponent(queryStr)}${imdbParam}`, { headers });
          const json = res.ok ? await res.json() : null;
          return (json?.success && json?.data) ? mapResults(json.data, 'torrent', title) : [];
        } catch (e) {
          console.error("[TorBox Search] Torrent query error:", e);
          return [];
        }
      })()
    ]);
    
    return [...usenetResults, ...torrentResults];
  };

  try {
    return await performSearch();
  } catch (error) {
    console.error("[TorBox Search] Error querying movie streams:", error);
    return [];
  }
};

export const fetchStreamsForMusic = async (query: string): Promise<TorBoxSearchResult[]> => {
  // Append audio search terms if not already present to target albums
  let searchTerms = query.trim();
  if (!/(flac|mp3|320|lossless|cd|album|discography|aac|alac)/i.test(searchTerms)) {
    searchTerms = `${searchTerms} FLAC MP3`;
  }
  console.log(`[TorBox Search] Searching Music: "${searchTerms}"`);
  
  const headers = getAuthHeaders();
  
  const performSearch = async (): Promise<TorBoxSearchResult[]> => {
    const enableUsenet = localStorage.getItem('enableUsenetSearch') !== 'false';
    const enableTorrent = localStorage.getItem('enableTorrentSearch') !== 'false';

    const [usenetResults, torrentResults] = await Promise.all([
      (async () => {
        if (!enableUsenet) return [];
        try {
          const res = await fetch(`/api/torbox/search?q=${encodeURIComponent(searchTerms)}`, { headers });
          const json = res.ok ? await res.json() : null;
          return (json?.success && json?.data) ? mapResults(json.data, 'usenet', undefined) : [];
        } catch (e) {
          console.error("[TorBox Search] Usenet query error:", e);
          return [];
        }
      })(),
      (async () => {
        if (!enableTorrent) return [];
        try {
          const res = await fetch(`/api/torbox/torrents/search?q=${encodeURIComponent(searchTerms)}`, { headers });
          const json = res.ok ? await res.json() : null;
          return (json?.success && json?.data) ? mapResults(json.data, 'torrent', undefined) : [];
        } catch (e) {
          console.error("[TorBox Search] Torrent query error:", e);
          return [];
        }
      })()
    ]);
    const combined = [...usenetResults, ...torrentResults];
    
    // Filter out video/DVD/software releases so only music albums remain
    const videoTerms = /(1080p|720p|2160p|4k|bluray|webrip|hdtv|x264|x265|hevc|xvid|divx|s\d\de\d\d|season \d|\.mkv|\.mp4|\.avi|\.wmv|camrip|ts|dvdrip|bdrip|dvd|dvdr|iso|vob|video_ts|video|movie|concert|live at|live in|pal|ntsc|bluray-rip)/i;
    
    return combined.filter(res => {
      // If it has video/DVD terms, hide it from music search
      if (videoTerms.test(res.name)) return false;
      return true;
    });
  };

  try {
    return await performSearch();
  } catch (error) {
    console.error("[TorBox Search] Error querying music streams:", error);
    return [];
  }
};

