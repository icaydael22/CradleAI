import { CharacterStorageService } from '@/services/CharacterStorageService';

/**
 * Storage monitoring and debugging utilities
 */
export class StorageMonitor {
  private static instance: StorageMonitor;
  
  static getInstance(): StorageMonitor {
    if (!StorageMonitor.instance) {
      StorageMonitor.instance = new StorageMonitor();
    }
    return StorageMonitor.instance;
  }
  
  /**
   * Get detailed storage statistics
   */
  async getDetailedStats() {
    const storageService = CharacterStorageService.getInstance();
    const stats = await storageService.getStorageStats();
    
    return {
      ...stats,
      indexSizeKB: Math.round(stats.indexSize / 1024 * 100) / 100,
      totalStorageSizeKB: Math.round(stats.totalStorageSize / 1024 * 100) / 100,
      averageCharacterSizeKB: Math.round(stats.averageCharacterSize / 1024 * 100) / 100,
      timestamp: Date.now()
    };
  }
  
  /**
   * Check if storage is healthy (no corrupted files, reasonable sizes)
   */
  async checkStorageHealth(): Promise<{
    healthy: boolean;
    warnings: string[];
    errors: string[];
  }> {
    const warnings: string[] = [];
    const errors: string[] = [];
    
    try {
      const stats = await this.getDetailedStats();
      
      // Check for excessively large index
      if (stats.indexSizeKB > 1000) { // 1MB
        warnings.push(`Index file is large (${stats.indexSizeKB}KB). Consider optimization.`);
      }
      
      // Check for excessively large average character size
      if (stats.averageCharacterSizeKB > 500) { // 500KB
        warnings.push(`Average character size is large (${stats.averageCharacterSizeKB}KB). May contain embedded binary data.`);
      }
      
      // Check total storage size
      if (stats.totalStorageSizeKB > 100000) { // 100MB
        warnings.push(`Total storage size is large (${stats.totalStorageSizeKB}KB). Consider cleanup.`);
      }
      
    } catch (error) {
      errors.push(`Failed to check storage health: ${error}`);
    }
    
    return {
      healthy: errors.length === 0,
      warnings,
      errors
    };
  }
  
  /**
   * Performance test for storage operations
   */
  async runPerformanceTest() {
    const storageService = CharacterStorageService.getInstance();
    const results: any = {};
    
    try {
      // Test index loading time
      const indexStart = Date.now();
      await storageService.getAllCharacterEntries();
      results.indexLoadTime = Date.now() - indexStart;
      
      // Test character loading time
      const allCharactersStart = Date.now();
      const characters = await storageService.getAllCharacters();
      results.allCharactersLoadTime = Date.now() - allCharactersStart;
      results.characterCount = characters.length;
      
      if (characters.length > 0) {
        // Test single character load time
        const singleCharStart = Date.now();
        await storageService.getCharacter(characters[0].id);
        results.singleCharacterLoadTime = Date.now() - singleCharStart;
      }
      
    } catch (error) {
      results.error = error instanceof Error ? error.message : String(error);
    }
    
    return results;
  }
  
  /**
   * Log storage statistics to console (for debugging)
   */
  async logStorageStats() {
    try {
      const stats = await this.getDetailedStats();
      const health = await this.checkStorageHealth();
      const performance = await this.runPerformanceTest();
      
      console.log('📊 [StorageMonitor] Storage Statistics:');
      console.log(`  Characters: ${stats.totalCharacters}`);
      console.log(`  Index Size: ${stats.indexSizeKB}KB`);
      console.log(`  Total Storage: ${stats.totalStorageSizeKB}KB`);
      console.log(`  Avg Character Size: ${stats.averageCharacterSizeKB}KB`);
      
      console.log('🏥 [StorageMonitor] Health Check:');
      console.log(`  Healthy: ${health.healthy}`);
      if (health.warnings.length > 0) {
        console.log(`  Warnings: ${health.warnings.join(', ')}`);
      }
      if (health.errors.length > 0) {
        console.log(`  Errors: ${health.errors.join(', ')}`);
      }
      
      console.log('⚡ [StorageMonitor] Performance:');
      console.log(`  Index Load: ${performance.indexLoadTime}ms`);
      console.log(`  All Characters Load: ${performance.allCharactersLoadTime}ms`);
      if (performance.singleCharacterLoadTime !== undefined) {
        console.log(`  Single Character Load: ${performance.singleCharacterLoadTime}ms`);
      }
      
    } catch (error) {
      console.error('❌ [StorageMonitor] Failed to log storage stats:', error);
    }
  }
}

/**
 * Development helper to quickly check storage status
 */
export async function debugStorage() {
  const monitor = StorageMonitor.getInstance();
  await monitor.logStorageStats();
}

/**
 * Hook for React components to monitor storage health
 */
export function useStorageMonitor() {
  const monitor = StorageMonitor.getInstance();
  
  return {
    getStats: () => monitor.getDetailedStats(),
    checkHealth: () => monitor.checkStorageHealth(),
    runPerformanceTest: () => monitor.runPerformanceTest(),
    logStats: () => monitor.logStorageStats()
  };
}