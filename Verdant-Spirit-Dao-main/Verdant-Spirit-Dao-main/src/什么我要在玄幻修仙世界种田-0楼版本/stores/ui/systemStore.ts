import { defineStore } from 'pinia';
import { computed } from 'vue';
import { useWorldStore } from '../core/worldStore';
//import { logger } from '@/什么我要在玄幻修仙世界种田-0楼版本/core/logger';

export const useSystemStore = defineStore('system', () => {
  const worldStore = useWorldStore();

  /**
   * 响应式地获取当前激活的系统名称。
   * 数据源自 worldStore，确保了单向数据流。
   */
  const activeSystem = computed(() => worldStore.world?.当前激活系统?.名称 || '无');
  //logger("info","Systems","The active system is:",activeSystem)
  return {
    activeSystem,
  };
});
