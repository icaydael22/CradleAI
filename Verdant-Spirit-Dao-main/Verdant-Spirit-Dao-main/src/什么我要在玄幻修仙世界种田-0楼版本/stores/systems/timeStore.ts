import { defineStore } from 'pinia';
import { computed } from 'vue';
import { logger } from '../../core/logger';
import { useWorldStore } from '../core/worldStore';
import { ITimeState } from '../../types';

export const useTimeStore = defineStore('time', () => {
  // #region Stores
  const worldStore = useWorldStore();
  // #endregion

  // #region Getters (Facade)
  const state = computed(() => worldStore.time);

  const day = computed(() => state.value?.day ?? 1);
  const timeOfDay = computed(() => state.value?.timeOfDay ?? '卯时');

  const currentDateString = computed(() => `第 ${day.value} 天 ${timeOfDay.value}`);
  const dayOfYear = computed(() => (day.value - 1) % 360);
  // #endregion

  // #region Actions
  /**
   * This action is called by the storeOrchestrator in response to an internal 'timeChanged' event.
   * It delegates the state update to the central worldStore.
   * @param payload The new time data.
   */
  function updateTime(payload: { toDay: number; toTimeOfDay: string }) {
    logger('log', 'TimeStore', 'Received request to update time. Delegating to worldStore.', payload);
    if (state.value) {
      const newState: ITimeState = {
        ...state.value,
        day: payload.toDay,
        timeOfDay: payload.toTimeOfDay,
      };
      worldStore.updateWorldState('时间', newState);
    }
  }
  // #endregion

  return {
    state,
    day,
    timeOfDay,
    updateTime,
    currentDateString,
    dayOfYear,
  };
});
