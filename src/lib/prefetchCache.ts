/**
 * Background Media Cache Service for BubbaFlix
 * Prefetches metadata, posters, logos, MPAA ratings, cast/crew, and all-season TIDB v3 skip segments
 * in background batches across all screens (Home, Catalog, TV Series, Search, Library, Upcoming).
 */

const requestedKeys = new Set<string>();
const prefetchQueue: Array<{ tmdbId: number; type: string; title: string }> = [];
let isProcessingQueue = false;

const processQueue = async () => {
  if (isProcessingQueue || prefetchQueue.length === 0) return;
  isProcessingQueue = true;

  while (prefetchQueue.length > 0) {
    const item = prefetchQueue.shift();
    if (!item) break;

    const cacheKey = `${item.type}_${item.tmdbId}`;
    if (requestedKeys.has(cacheKey)) continue;
    requestedKeys.add(cacheKey);

    try {
      await fetch('/api/media/prefetch-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tmdbId: item.tmdbId,
          type: item.type,
          title: item.title
        })
      });
    } catch (e) {}

    // Throttle 150ms between requests to maintain zero impact on UI smoothness
    await new Promise(res => setTimeout(res, 150));
  }

  isProcessingQueue = false;
};

export function prefetchMediaItems(items: any[]) {
  if (!Array.isArray(items) || items.length === 0) return;

  items.forEach((item) => {
    if (!item) return;
    const tmdbId = item.realTmdbId || (typeof item.id === 'number' && item.id > 0 ? item.id : item.tmdbId);
    if (!tmdbId || isNaN(Number(tmdbId))) return;

    const type = (item.type === 'series' || item.type === 'tv' || item.type === 'show' || !!item.first_air_date) ? 'tv' : 'movie';
    const cacheKey = `${type}_${tmdbId}`;

    if (!requestedKeys.has(cacheKey)) {
      prefetchQueue.push({
        tmdbId: Number(tmdbId),
        type,
        title: item.title || item.name || ''
      });
    }
  });

  processQueue();
}
