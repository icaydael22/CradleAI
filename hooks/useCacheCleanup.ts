/**
 * Hook to manage render cache cleanup and memory optimization
 */
import { useEffect } from 'react';
import { getGlobalRenderCache } from '@/utils/RenderCache';

export const useCacheCleanup = () => {
  useEffect(() => {
    // Set up periodic cache cleanup
    const cleanupInterval = setInterval(() => {
      const cache = getGlobalRenderCache();
      
      // Clean up entries older than 30 minutes
      const removedCount = cache.cleanupOldEntries(30 * 60 * 1000);
      
      if (__DEV__ && removedCount > 0) {
        const stats = cache.getStats();
        console.log(`[CacheCleanup] Removed ${removedCount} old cache entries. Cache stats:`, stats);
      }
      
      // If cache is still too large, force a more aggressive cleanup
      const stats = cache.getStats();
      if (stats.size > 400) {
        // First try age-based cleanup
        cache.cleanupOldEntries(15 * 60 * 1000); // Clean entries older than 15 minutes
        
        // If still too large, force size-based cleanup
        const newStats = cache.getStats();
        if (newStats.size > 350) {
          const forcedRemovals = cache.cleanupToSize(300);
          if (__DEV__) {
            console.log(`[CacheCleanup] Forced cleanup removed ${forcedRemovals} entries. New size: ${cache.getStats().size}`);
          }
        }
        
        if (__DEV__) {
          console.log('[CacheCleanup] Aggressive cleanup triggered due to cache size:', stats.size, '->', cache.getStats().size);
        }
      }
    }, 5 * 60 * 1000); // Run every 5 minutes

    return () => {
      clearInterval(cleanupInterval);
    };
  }, []);
};