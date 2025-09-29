import Fuse, { IFuseOptions } from 'fuse.js';
import { defineStore } from 'pinia';
import { watch } from 'vue';
import { useWorldStore } from '../core/worldStore';
import { logger } from '../../core/logger';

interface SearchState {
  fuseInstances: Map<string, Fuse<any>>; // 存储所有Fuse.js实例
  isIndexing: boolean; // 标记是否正在进行大规模索引
}

export const useSearchStore = defineStore('search', {
  state: (): SearchState => ({
    fuseInstances: new Map(),
    isIndexing: false,
  }),
  actions: {
    initialize() {
      const worldStore = useWorldStore();

      watch(() => worldStore.allRumors, (newRumors) => {
        if (newRumors && newRumors.length > 0) {
          logger('info', 'SearchStore', 'Rumors have changed, re-initializing search index.');
          this.initializeSearchIndex('rumors', newRumors, {
            keys: ['content'],
            threshold: 0.4,
          });
        }
      }, { deep: true, immediate: true });
    },

    /**
     * 初始化或重建一个特定数据集的搜索索引。
     * @param indexName - 索引的唯一名称, e.g., 'pokedex', 'knowledge'
     * @param data - 用于建立索引的数据数组
     * @param options - Fuse.js 的配置选项
     */
    initializeSearchIndex(indexName: string, data: any[], options: IFuseOptions<any>) {
      this.isIndexing = true;
      try {
        const newFuseInstance = new Fuse(data, options);
        this.fuseInstances.set(indexName, newFuseInstance);
        console.log(`[SearchStore] Index "${indexName}" initialized with ${data.length} items.`);
      } catch (error) {
        console.error(`[SearchStore] Failed to initialize index "${indexName}":`, error);
      } finally {
        this.isIndexing = false;
      }
    },

    /**
     * 对指定的索引执行搜索。
     * @param indexName - 要搜索的索引名称
     * @param query - 搜索查询字符串
     */
    search(indexName: string, query: string): any[] {
      const fuse = this.fuseInstances.get(indexName);
      if (!fuse) {
        console.warn(`[SearchStore] Search failed: Index "${indexName}" not found.`);
        return [];
      }

      if (!query || query.trim() === '') {
        return [];
      }

      const results = fuse.search(query);
      // logger('log', 'SearchStore', `Search results for "${query}" in index "${indexName}":`, results);
      return results;
    },

    /**
     * 动态地向索引中添加单个文档。
     * @param indexName - 索引名称
     * @param document - 要添加的文档对象
     */
    addToIndex(indexName: string, document: any) {
      const fuse = this.fuseInstances.get(indexName);
      fuse?.add(document);
    },

    /**
     * 根据 ID 从索引中移除单个文档。
     * @param indexName - 索引名称
     * @param documentId - 要移除的文档的唯一标识符
     */
    removeFromIndex(indexName: string, documentId: string) {
      const fuse = this.fuseInstances.get(indexName);
      // Fuse.js 的 remove 方法需要一个判断函数，我们假设文档有 id 字段
      fuse?.remove((doc: any) => doc.id === documentId);
    },
  },
});
