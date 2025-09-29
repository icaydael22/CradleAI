import { defineStore } from 'pinia';
import { computed, watch } from 'vue';
import { logger } from '../../core/logger';
import { useAdventureStore } from '../systems/adventureStore';
import { useSystemStore } from '../ui/systemStore';
import { useWorldStore } from '../core/worldStore';
// ... import 其他需要的 stores

export const usePromptStore = defineStore('prompt', () => {
  const worldStore = useWorldStore();
  const systemStore = useSystemStore();
  const adventureStore = useAdventureStore();

  const weatherFragment = computed(() => {
    const data = worldStore.weather;
    if (!data) return '';
    return `当前天气为${data.当前天气}，${data.天气描述}。`;
  });

  const shelterStatusFragment = computed(() => {
    const data = worldStore.shelter;
    if (!data || !data.状态) return '';
    return `你的庇护所状态更新为：${data.状态}。`;
  });

  const shelterDamageQuestHintFragment = computed(() => {
    const componentId = worldStore.recentlyDamagedComponent;
    const activeSystem = systemStore.activeSystem;

    if (componentId && activeSystem === '任务系统') {
      return `你的庇護所組件「${componentId}」已受損，或許可以發布一個相關的維修任務。`;
    }
    return '';
  });

  // ... 其他片段的 computed ...

  const solarTermFragment = computed(() => {
    const solarTerm = worldStore.weather?.节气;
    if (!solarTerm) return '';
    return `当前节气已变为${solarTerm}。`;
  });

  const celestialEventFragment = computed(() => {
    const celestialEvent = worldStore.weather?.特殊天象;
    // 只有在奇遇系统就绪时，才发送由天象触发的强引导提示
    if (!celestialEvent || !adventureStore.isAdventureReady) return '';
    // 根据规范，这是一个高优先级的提示，用于引导奇遇
    return `天空中出现了特殊天象：${celestialEvent}！这似乎预示着什么不寻常的事情即将发生...`;
  });

  // ... 其他片段的 computed ...

  const dynamicFragments = computed(() => {
    const fragments = new Map<string, string>();
    if (weatherFragment.value) fragments.set('weather', weatherFragment.value);
    if (solarTermFragment.value) fragments.set('solarTerm', solarTermFragment.value);
    if (shelterStatusFragment.value) fragments.set('shelterStatus', shelterStatusFragment.value);
    
    // 特殊提示分开处理
    if (shelterDamageQuestHintFragment.value) fragments.set('shelterDamageQuestHint', shelterDamageQuestHintFragment.value);
    if (celestialEventFragment.value) fragments.set('adventureHint', celestialEventFragment.value);
    
    // ... set 其他片段 ...
    return fragments;
  });

  // 當提示生成後，清除一次性事件狀態
  watch(shelterDamageQuestHintFragment, (newValue) => {
    if (newValue) {
      logger('log', 'promptStore', `Generated shelter damage hint, clearing the state from worldStore.`);
      worldStore.clearRecentlyDamagedComponent();
    }
  });

  return { dynamicFragments };
});
