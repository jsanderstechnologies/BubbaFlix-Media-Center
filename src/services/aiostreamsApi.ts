// Phase 3: AIOStreams integration
const getManifestUrl = () => {
  if (typeof window !== 'undefined') {
    const localUrl = localStorage.getItem('aiostreamsUrl');
    if (localUrl) return localUrl;
  }
  return "https://aiostreams.elfhosted.com/stremio/7f80cea5-d598-4684-9bd9-1650e2214bf6/eyJpIjoiTEd2b0Q2cmRERS9zY3AvUGxhRGtVUT09IiwiZSI6IkVGUXpncVVjSWFEVlJVSHNneDJyM0s2Qkx2aE1ocUtHNUpEL1diS3ZxNEE9IiwidCI6ImEifQ/manifest.json";
};

export const fetchStreamsForTvSeries = async (tmdbId: number, season: number, episode: number) => {
  console.log(`[Frontend] Requesting real AIOStreams streams for TMDB ID: ${tmdbId}, S${season}E${episode}`);
  
  const baseUrl = getManifestUrl().replace('/manifest.json', '');
  const streamUrl = `${baseUrl}/stream/series/tmdb:${tmdbId}:${season}:${episode}.json`;
  
  try {
    const response = await fetch(streamUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch streams: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.streams || data.streams.length === 0) {
        return [];
    }

    return data.streams.map((stream: any, index: number) => {
      const desc = stream.description || '';
      let size = "Unknown Size";
      let quality = stream.name || "HD";
      
      const sizeMatch = desc.match(/◈\s+([\d.]+)\s+(GB|MB)/);
      if (sizeMatch) {
          size = `${sizeMatch[1]} ${sizeMatch[2]}`;
      }

      const resolutionMatch = (stream.name || '').match(/(4K|1080P|720P|SD)/i);
      if (resolutionMatch) {
          quality = resolutionMatch[1];
      }

      return {
        id: `st${index}`,
        name: stream.name ? stream.name.split('\n')[0].replace(/[^a-zA-Z0-9+ ⚡]/g, '').trim() : 'AIOStreams Source',
        isCached: (stream.name || '').includes('+') || (stream.name || '').includes('⚡') || ((stream.description || '').toLowerCase().includes('cached') && !(stream.description || '').toLowerCase().includes('uncached')),
        quality: quality,
        size: size,
        url: stream.url,
        fullDescription: desc
      };
    });
  } catch (error) {
    console.error("[Frontend] Error fetching from AIOStreams:", error);
    return [];
  }
};

export const fetchStreamsForMovie = async (tmdbId: number) => {
  
  const baseUrl = getManifestUrl().replace('/manifest.json', '');
  const streamUrl = `${baseUrl}/stream/movie/tmdb:${tmdbId}.json`;

  
  try {
    const response = await fetch(streamUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch streams: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.streams || data.streams.length === 0) {
        return [];
    }

    // Map Stremio stream objects to our UI format
    return data.streams.map((stream: any, index: number) => {
      // Parse the description to extract nice display values like quality and size if possible
      // AIOStreams usually formats description heavily.
      const desc = stream.description || '';
      
      // Basic extraction attempt
      let size = "Unknown Size";
      let quality = stream.name || "HD";
      
      const sizeMatch = desc.match(/◈\s+([\d.]+)\s+(GB|MB)/);
      if (sizeMatch) {
          size = `${sizeMatch[1]} ${sizeMatch[2]}`;
      }

      // Try to get a cleaner title (e.g., removing the emojis or picking up the resolution)
      const resolutionMatch = (stream.name || '').match(/(4K|1080P|720P|SD)/i);
      if (resolutionMatch) {
          quality = resolutionMatch[1];
      }

      return {
        id: `st${index}`,
        name: stream.name ? stream.name.split('\n')[0].replace(/[^a-zA-Z0-9+ ⚡]/g, '').trim() : 'AIOStreams Source',
        isCached: (stream.name || '').includes('+') || (stream.name || '').includes('⚡') || ((stream.description || '').toLowerCase().includes('cached') && !(stream.description || '').toLowerCase().includes('uncached')),
        quality: quality,
        size: size,
        url: stream.url,
        fullDescription: desc
      };
    });
  } catch (error) {
    console.error("[Frontend] Error fetching from AIOStreams:", error);
    return [];
  }
};
