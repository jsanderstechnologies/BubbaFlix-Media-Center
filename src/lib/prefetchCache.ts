/**
 * Background Media Cache Service for BubbaFlix
 * Low-priority background prefetching for metadata, posters, logos, and TIDB skip segments.
 * Automatically pauses whenever detail screens are active to guarantee 100% top priority for user requests.
 */

const requestedKeys = new Set<string>();
const prefetchQueue: Array<{ tmdbId: number; type: string; title: string }> = [];
let isProcessingQueue = false;
let isPrefetchPaused = false;

export function pausePrefetchQueue(paused: boolean) {
  isPrefetchPaused = paused;
  if (!paused) {
    scheduleNextProcess();
  }
}

const scheduleNextProcess = () => {
  if (isPrefetchPaused || prefetchQueue.length === 0 || isProcessingQueue) return;
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => processQueue(), { timeout: 3000 });
  } else {
    setTimeout(() => processQueue(), 500);
  }
};

const processQueue = async () => {
  if (isProcessingQueue || isPrefetchPaused || prefetchQueue.length === 0) return;
  isProcessingQueue = true;

  while (prefetchQueue.length > 0 && !isPrefetchPaused) {
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
        }),
        priority: 'low'
      } as any);
    } catch (e) {}

    // Throttle 400ms between requests to maintain zero impact on UI & active user detail requests
    await new Promise(res => setTimeout(res, 400));
  }

  isProcessingQueue = false;
  if (!isPrefetchPaused && prefetchQueue.length > 0) {
    scheduleNextProcess();
  }
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

  scheduleNextProcess();
}
