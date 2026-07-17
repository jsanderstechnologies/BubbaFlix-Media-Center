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

const mapResults = (items: any[], type: 'torrent' | 'usenet'): TorBoxSearchResult[] => {
  if (!items || !Array.isArray(items)) return [];
  
  const badExts = ['.exe', '.zip', '.rar', '.7z', '.txt', '.nfo', '.srt', '.sub', '.iso', '.pdf', '.apk', '.bin'];
  
  return items
    .filter((item: any) => {
      const name = (item.name || item.title || "").toLowerCase();
      if (badExts.some(ext => name.endsWith(ext))) return false;
      if (item.size && item.size < 20 * 1024 * 1024) return false; // Filter < 20MB
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
      fullDescription: `Source: TorBox Voyager Search (${type.toUpperCase()})\nSeeders/Peers: ${item.seeds || 0}/${item.peers || 0}\nHash/Id: ${hash || 'N/A'}`
    };
  });
};

export const fetchStreamsForTvSeries = async (title: string, season: number, episode: number): Promise<TorBoxSearchResult[]> => {
  const queryStr = `${title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
  console.log(`[TorBox Search] Searching TV Series: "${queryStr}"`);
  
  const headers = getAuthHeaders();
  
  const performSearch = async (): Promise<TorBoxSearchResult[]> => {
    const enableUsenet = localStorage.getItem('enableUsenetSearch') !== 'false';
    const enableTorrent = localStorage.getItem('enableTorrentSearch') !== 'false';

    let usenetResults: TorBoxSearchResult[] = [];
    if (enableUsenet) {
      try {
        const usenetRes = await fetch(`/api/torbox/search?q=${encodeURIComponent(queryStr)}`, { headers });
        if (usenetRes.ok) {
          const parsed = await usenetRes.json();
          if (parsed.success && parsed.data && parsed.data.length > 0) {
            usenetResults = mapResults(parsed.data, 'usenet');
          }
        }
      } catch (e) { console.error("[TorBox Search] Usenet query error:", e); }
      // Delay to prevent Cloudflare 429 IP ban from TorBox
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    let torrentResults: TorBoxSearchResult[] = [];
    if (enableTorrent) {
      try {
        const torrentRes = await fetch(`/api/torbox/torrents/search?q=${encodeURIComponent(queryStr)}`, { headers });
        if (torrentRes.ok) {
          const parsed = await torrentRes.json();
          if (parsed.success && parsed.data) {
            torrentResults = mapResults(parsed.data, 'torrent');
          }
        }
      } catch (e) { console.error("[TorBox Search] Torrent query error:", e); }
    }
    
    return [...usenetResults, ...torrentResults];
  };

  try {
    let results = await performSearch();
    let attempts = 0;
    while (results.length === 0 && attempts < 3) {
        attempts++;
        console.log(`[TorBox Search] 0 results found for "${queryStr}". Retrying in 2.5s to allow background scraper to finish (Attempt ${attempts}/3)...`);
        await new Promise(resolve => setTimeout(resolve, 2500));
        results = await performSearch();
    }
    return results;
  } catch (error) {
    console.error("[TorBox Search] Error querying TV series streams:", error);
    return [];
  }
};

export const fetchStreamsForMovie = async (title: string, year?: string): Promise<TorBoxSearchResult[]> => {
  const queryStr = (year && year !== 'N/A') ? `${title} ${year}` : title;
  console.log(`[TorBox Search] Searching Movie: "${queryStr}"`);
  
  const headers = getAuthHeaders();
  
  const performSearch = async (): Promise<TorBoxSearchResult[]> => {
    const enableUsenet = localStorage.getItem('enableUsenetSearch') !== 'false';
    const enableTorrent = localStorage.getItem('enableTorrentSearch') !== 'false';

    let usenetResults: TorBoxSearchResult[] = [];
    if (enableUsenet) {
      try {
        const usenetRes = await fetch(`/api/torbox/search?q=${encodeURIComponent(queryStr)}`, { headers });
        if (usenetRes.ok) {
          const parsed = await usenetRes.json();
          if (parsed.success && parsed.data && parsed.data.length > 0) {
            usenetResults = mapResults(parsed.data, 'usenet');
          }
        }
      } catch (e) { console.error("[TorBox Search] Usenet query error:", e); }
    }

    let torrentResults: TorBoxSearchResult[] = [];
    if (enableTorrent) {
      try {
        const torrentRes = await fetch(`/api/torbox/torrents/search?q=${encodeURIComponent(queryStr)}`, { headers });
        if (torrentRes.ok) {
          const parsed = await torrentRes.json();
          if (parsed.success && parsed.data) {
            torrentResults = mapResults(parsed.data, 'torrent');
          }
        }
      } catch (e) { console.error("[TorBox Search] Torrent query error:", e); }
    }
    
    return [...usenetResults, ...torrentResults];
  };

  try {
    let results = await performSearch();
    let attempts = 0;
    while (results.length === 0 && attempts < 3) {
        attempts++;
        console.log(`[TorBox Search] 0 results found for "${queryStr}". Retrying in 2.5s to allow background scraper to finish (Attempt ${attempts}/3)...`);
        await new Promise(resolve => setTimeout(resolve, 2500));
        results = await performSearch();
    }
    return results;
  } catch (error) {
    console.error("[TorBox Search] Error querying movie streams:", error);
    return [];
  }
};
