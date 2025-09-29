import { defineStore } from 'pinia';
import { ref } from 'vue';
import { logger } from '../../core/logger';

/**
 * 全局应用状态管理。
 * 这个 Store 用于处理不属于任何特定功能模块的顶级状态，
 * 例如，作为核心数据加载完成的信号中心。
 */
export const useAppStore = defineStore('app', () => {
  /**
   * 当前正在操作的消息楼层 ID。
   */
  const floorId = ref(0);

  /**
   * 核心状态更新计数器。
   * 每当 `recalculateAndApplyState` 完成后，这个计数器就会增加。
   * 其他 stores 可以监听此状态的变化，以触发它们的数据刷新。
   * 使用递增的数字可以确保每次信号发出时，Vue 的响应式系统都能检测到变化，
   * 从而解决了之前使用布尔值时，从 true -> true 不会触发 watch 的问题。
   */
  const coreStateUpdateCount = ref(0);

  const isLoading = ref(false);
  const loadingMessage = ref('');
  const error = ref<string | null>(null);

  function setLoading(status: boolean, message = '') {
    isLoading.value = status;
    loadingMessage.value = message;
    if (status) {
      // Clear previous errors when a new loading process starts
      error.value = null;
    }
  }

  function setError(errorMessage: string | null) {
    error.value = errorMessage;
    isLoading.value = false; // Stop loading on error
  }

  /**
   * 发出核心状态已更新的信号。
   * 这会触发所有监听 `coreStateUpdateCount` 的 store 刷新其数据。
   */
  function signalCoreStateReady() {
    logger('info', 'AppStore', `Core state is ready. Incrementing update counter from ${coreStateUpdateCount.value} to ${coreStateUpdateCount.value + 1}.`);
    coreStateUpdateCount.value++;
  }

  return {
    floorId,
    coreStateUpdateCount,
    signalCoreStateReady,
    isLoading,
    loadingMessage,
    error,
    setLoading,
    setError,
  };
});
