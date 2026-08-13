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
    const rawId = item.realTmdbId || item.tmdbId || item.id;
    const numericId = typeof rawId === 'number' ? rawId : (!isNaN(Number(rawId)) ? Number(rawId) : null);
    const title = item.title || item.name || '';

    if (!numericId && (!title || title.length < 2)) return;

    const type = (item.type === 'series' || item.type === 'tv' || item.type === 'show' || !!item.first_air_date) ? 'tv' : 'movie';
    const cacheKey = numericId ? `${type}_${numericId}` : `${type}_title_${title.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    if (!requestedKeys.has(cacheKey)) {
      prefetchQueue.push({
        tmdbId: numericId || 0,
        type,
        title
      });
    }
  });

  processQueue();
}
