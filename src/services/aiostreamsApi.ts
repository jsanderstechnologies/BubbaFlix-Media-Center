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
  
  return items.map((item: any, index: number) => {
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
  
  try {
    const headers = getAuthHeaders();
    const [torrentRes, usenetRes] = await Promise.all([
      fetch(`/api/torbox/search?type=torrent&q=${encodeURIComponent(queryStr)}`, { headers }),
      fetch(`/api/torbox/search?type=usenet&q=${encodeURIComponent(queryStr)}`, { headers }).catch(() => null)
    ]);

    let torrents: any[] = [];
    if (torrentRes && torrentRes.ok) {
      const parsed = await torrentRes.json();
      if (parsed.success && parsed.data) {
        torrents = mapResults(parsed.data, 'torrent');
      }
    }

    let usenet: any[] = [];
    if (usenetRes && usenetRes.ok) {
      const parsed = await usenetRes.json();
      if (parsed.success && parsed.data) {
        usenet = mapResults(parsed.data, 'usenet');
      }
    }

    return [...torrents, ...usenet];
  } catch (error) {
    console.error("[TorBox Search] Error querying TV series streams:", error);
    return [];
  }
};

export const fetchStreamsForMovie = async (title: string, year?: string): Promise<TorBoxSearchResult[]> => {
  const queryStr = year ? `${title} ${year}` : title;
  console.log(`[TorBox Search] Searching Movie: "${queryStr}"`);
  
  try {
    const headers = getAuthHeaders();
    const [torrentRes, usenetRes] = await Promise.all([
      fetch(`/api/torbox/search?type=torrent&q=${encodeURIComponent(queryStr)}`, { headers }),
      fetch(`/api/torbox/search?type=usenet&q=${encodeURIComponent(queryStr)}`, { headers }).catch(() => null)
    ]);

    let torrents: any[] = [];
    if (torrentRes && torrentRes.ok) {
      const parsed = await torrentRes.json();
      if (parsed.success && parsed.data) {
        torrents = mapResults(parsed.data, 'torrent');
      }
    }

    let usenet: any[] = [];
    if (usenetRes && usenetRes.ok) {
      const parsed = await usenetRes.json();
      if (parsed.success && parsed.data) {
        usenet = mapResults(parsed.data, 'usenet');
      }
    }

    return [...torrents, ...usenet];
  } catch (error) {
    console.error("[TorBox Search] Error querying movie streams:", error);
    return [];
  }
};
