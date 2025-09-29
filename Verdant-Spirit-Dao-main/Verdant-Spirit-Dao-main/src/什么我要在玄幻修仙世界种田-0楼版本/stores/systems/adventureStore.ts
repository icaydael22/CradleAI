import { defineStore } from 'pinia';
import { computed } from 'vue';
import { logger } from '../../core/logger';
import { useWorldStore } from '../core/worldStore';
import { useTimeStore } from './timeStore';

export const useAdventureStore = defineStore('adventure', () => {
  // #region Stores
  const worldStore = useWorldStore();
  const timeStore = useTimeStore();
  // #endregion

  // #region Getters (Facade)
  const adventureState = computed(() => worldStore.world?.奇遇);
  const currentTime = computed(() => worldStore.world?.时间);

  const isCooldownActive = computed(() => {
    const cooldownDay = adventureState.value?.冷却至天数 ?? 0;
    const currentDay = currentTime.value?.day ?? 0;
    // If cooldownDay is 0 (e.g., new game), we consider it on cooldown until set.
    if (cooldownDay === 0) return true;
    return currentDay < cooldownDay;
  });

  const cooldownDaysRemaining = computed(() => {
    if (!isCooldownActive.value) return 0;
    const cooldownDay = adventureState.value?.冷却至天数 ?? 0;
    const currentDay = currentTime.value?.day ?? 0;
    return Math.max(0, cooldownDay - currentDay);
  });

  /**
   * Determines if an adventure is ready to be triggered based on cooldown and world events.
   */
  const isAdventureReady = computed(() => {
    // Adventure is ready if the cooldown has passed OR a special celestial event is active.
    return !isCooldownActive.value || !!worldStore.weather?.特殊天象;
  });

  /**
   * Provides a hint for the LLM's "director instructions" about the current adventure readiness.
   */
  const adventureHint = computed(() => {
    if (!isAdventureReady.value) {
      return '非奇遇时机。';
    }

    // Prioritize celestial events as a strong hint.
    const celestialEvent = worldStore.weather?.特殊天象;
    if (celestialEvent) {
      return `特殊天象出现：${celestialEvent}，正是奇遇发生之时！`;
    }

    // Generic readiness hint.
    const weatherName = worldStore.weather?.当前天气 ?? '未知';
    // TODO: Integrate with a future rumorStore to get available rumors.
    const rumorPlaceholder = '暂无可用传闻'; 
    return `奇遇事件的CD已经好了，请酌情考虑在某个时间段触发奇遇事件。当前天气为${weatherName}，当前可用的传闻为${rumorPlaceholder}。`;
  });
  // #endregion

  function _handleAdventureEvent(event: any, worldState: any) {
    const timeStore = useTimeStore();
    const adventureState = worldState.奇遇;
    if (!adventureState) return;

    // 1. Cooldown Check
    if (timeStore.day <= (adventureState.冷却至天数 ?? 0)) {
      logger('warn', 'AdventureStore', 'Adventure event received but cooldown is not ready. Ignoring.', {
        currentDay: timeStore.day,
        cooldownDay: adventureState.冷却至天数,
      });
      return;
    }

    // 2. Update cooldown
    const minCooldown = 30;
    const maxCooldown = 90;
    const randomCooldown = Math.floor(Math.random() * (maxCooldown - minCooldown + 1)) + minCooldown;
    adventureState.上次奇遇天数 = timeStore.day;
    adventureState.冷却至天数 = timeStore.day + randomCooldown;
    logger('info', 'AdventureStore', `Adventure cooldown updated. Next adventure possible after day ${adventureState.冷却至天数}.`);
  }

  function initialize() {
    worldStore.registerEventHandler('奇遇', _handleAdventureEvent);
  }

  return {
    adventureHint,
    isAdventureReady,
    isCooldownActive,
    cooldownDaysRemaining,
    initialize,
  };
});
