/**
 * RenderCache - Simple LRU cache for message render state
 * 
 * This module provides an in-memory cache for storing cleaned text and split paragraphs
 * to avoid repeated regex processing and text splitting operations.
 */

export interface RenderCacheEntry {
  cleanedText: string;
  paragraphs: string[];
  computedAt: number;
}

export class RenderCache {
  private cache: Map<string, RenderCacheEntry>;
  private accessOrder: string[];
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.cache = new Map();
    this.accessOrder = [];
    this.maxSize = maxSize;
  }

  /**
   * Get a cached entry by key
   * Updates access order for LRU eviction
   */
  get(key: string): RenderCacheEntry | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      // Move to end (most recently used)
      this.updateAccessOrder(key);
    }
    return entry;
  }

  /**
   * Set a cache entry
   * Handles LRU eviction if cache is full
   */
  set(key: string, value: RenderCacheEntry): void {
    // If key already exists, update and move to end
    if (this.cache.has(key)) {
      this.cache.set(key, value);
      this.updateAccessOrder(key);
      return;
    }

    // If cache is full, remove least recently used item
    if (this.cache.size >= this.maxSize) {
      this.evictLeastRecentlyUsed();
    }

    // Add new entry
    this.cache.set(key, value);
    this.accessOrder.push(key);
  }

  /**
   * Get cached entry or compute and cache new one
   * This is the main method used by components
   */
  getOrCompute(key: string, computeFn: () => RenderCacheEntry): RenderCacheEntry {
    const cached = this.get(key);
    if (cached) {
      return cached;
    }

    // Compute new value and cache it
    const newValue = computeFn();
    this.set(key, newValue);
    return newValue;
  }

  /**
   * Check if a key exists in cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Remove a specific key from cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
    }
    return deleted;
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Clean up old entries (older than specified age)
   * This helps prevent memory leaks from stale cache entries
   */
  cleanupOldEntries(maxAgeMs: number = 30 * 60 * 1000): number { // Default: 30 minutes
    const now = Date.now();
    let removedCount = 0;
    
    const keysToRemove: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.computedAt > maxAgeMs) {
        keysToRemove.push(key);
      }
    }
    
    for (const key of keysToRemove) {
      this.delete(key);
      removedCount++;
    }
    
    return removedCount;
  }

  /**
   * Force cleanup of oldest entries to get under target size
   * This is used when cache size exceeds memory limits
   */
  cleanupToSize(targetSize: number): number {
    if (this.cache.size <= targetSize) {
      return 0;
    }

    // Sort entries by age (oldest first)
    const entriesWithAge = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      entry,
      age: Date.now() - entry.computedAt
    })).sort((a, b) => b.age - a.age); // Sort by age descending (oldest first)

    const removeCount = this.cache.size - targetSize;
    let removedCount = 0;

    for (let i = 0; i < Math.min(removeCount, entriesWithAge.length); i++) {
      this.delete(entriesWithAge[i].key);
      removedCount++;
    }

    return removedCount;
  }

  /**
   * Get cache statistics for debugging
   */
  getStats(): { size: number; maxSize: number; memoryUsage: string } {
    let totalMemory = 0;
    for (const entry of this.cache.values()) {
      totalMemory += entry.cleanedText.length * 2; // Rough estimate: 2 bytes per character
      totalMemory += entry.paragraphs.reduce((sum, p) => sum + p.length * 2, 0);
    }
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      memoryUsage: `${(totalMemory / 1024).toFixed(1)}KB`
    };
  }

  /**
   * Get current cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Update access order for LRU tracking
   */
  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      // Remove from current position
      this.accessOrder.splice(index, 1);
    }
    // Add to end (most recently used)
    this.accessOrder.push(key);
  }

  /**
   * Remove the least recently used item
   */
  private evictLeastRecentlyUsed(): void {
    if (this.accessOrder.length > 0) {
      const lruKey = this.accessOrder.shift();
      if (lruKey) {
        this.cache.delete(lruKey);
      }
    }
  }
}

// Global cache instance
let globalRenderCache: RenderCache | null = null;

/**
 * Get the global render cache instance
 * Creates one if it doesn't exist
 */
export function getGlobalRenderCache(): RenderCache {
  if (!globalRenderCache) {
    globalRenderCache = new RenderCache(500); // Reduce cache size to 500 messages to save memory
  }
  return globalRenderCache;
}

/**
 * Reset the global cache (useful for testing or memory cleanup)
 */
export function resetGlobalRenderCache(): void {
  globalRenderCache = null;
}

export default RenderCache;