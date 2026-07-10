import { useEffect } from 'react';
import { collection, query, where, getDocs, updateDoc, doc } from '../lib/localDb';
import { db } from '../lib/localDb';
import { useAuth } from './Auth';
import { fetchStreamsForMovie } from '../services/torboxSearchApi';

// Note: In a production app, this might be handled by a dedicated backend cron job.
// For this preview applet, we handle periodic stream updates client-side.

const UPDATE_INTERVAL = 1000 * 60 * 60; // 1 hour

export function BackgroundUpdater() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const performUpdate = async () => {
      try {
        console.log('[BackgroundUpdater] Starting periodic stream update for favorites...');
        const q = query(collection(db, 'favorites'), where('userId', '==', user.uid));
        const snapshot = await getDocs(q);
        
        for (const document of snapshot.docs) {
          const data = document.data();
          // We currently only support fetching movie streams simply via tmdbId in aiostreamsApi.
          // In a real app we'd fetch series streams too (requires season/episode).
          if (data.type === 'movie') {
             try {
                const streams = await fetchStreamsForMovie(data.tmdbId);
                const bestStream = streams.length > 0 ? streams[0] : null;
                
                if (bestStream && (!data.streamInfo || data.streamInfo.url !== bestStream.url)) {
                   console.log(`[BackgroundUpdater] Updating stream for ${data.title}`);
                   await updateDoc(doc(db, 'favorites', document.id), {
                     streamInfo: {
                        name: bestStream.name,
                        url: bestStream.url,
                        quality: bestStream.quality
                     }
                   });
                }
             } catch (err) {
                console.error(`[BackgroundUpdater] Failed to update stream for ${data.title}`, err);
             }
          }
        }
        console.log('[BackgroundUpdater] Finished stream update.');
      } catch (err) {
        console.error('[BackgroundUpdater] Error in background update:', err);
      }
    };

    // Run once on mount if user is logged in
    performUpdate();

    const intervalId = setInterval(performUpdate, UPDATE_INTERVAL);
    return () => clearInterval(intervalId);
  }, [user]);

  return null; // This component doesn't render anything
}
