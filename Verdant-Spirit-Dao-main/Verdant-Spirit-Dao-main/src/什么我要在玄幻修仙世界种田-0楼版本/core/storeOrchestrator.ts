import { watch } from 'vue';
import { logger } from './logger';
import { events } from './reactiveMessageBus';

// Core Stores
import { useCharacterStore } from '../stores/facades/characterStore';
import { useItemStore } from '../stores/facades/itemStore';
import { useWorldStore } from '../stores/core/worldStore';

// System Stores
import { useQuestStore } from '../stores/systems/questStore';
import { useSkillStore } from '../stores/systems/skillStore';
import { useTimeStore } from '../stores/systems/timeStore';
import { useAchievementStore } from '../stores/systems/achievementStore';
import { useBarterStore } from '../stores/systems/barterStore';
import { useSignInStore } from '../stores/systems/signInStore';
import { useRumorStore } from '../stores/systems/rumorStore';
import { useWeatherStore } from '../stores/systems/weatherStore';
import { useShelterStore } from '../stores/systems/shelterStore';
import { useMapStore } from '../stores/systems/mapStore';
import { usePokedexStore } from '../stores/systems/pokedexStore';
import { useRelationsStore } from '../stores/systems/relationsStore';
import { useAdventureStore } from '../stores/systems/adventureStore';

// Module Stores
import { useSearchStore } from '../stores/modules/searchStore';

// UI Stores
// import { useSystemStore } from '../stores/ui/systemStore';

/**
 * @file Store 编排器 (StoreOrchestrator)
 * @description 监听 reactiveMessageBus 中的事件，并调用相应的 Pinia store actions。
 * 这是连接事件总线和状态管理的唯一桥梁，确保了清晰的单向数据流。
 */

let isInitialized = false;

/**
 * 初始化所有需要从酒馆变量中读取初始状态的 Store。
 */
export async function initializeAllStores() {
  logger('log', 'StoreOrchestrator', 'Initializing all stores...');

  // --- Core Stores ---
  const characterStore = useCharacterStore();
  const itemStore = useItemStore();
  const worldStore = useWorldStore();
  const shelterStore = useShelterStore();
 
  // --- Dependency Injection ---
  // Break the circular dependency between worldStore and shelterStore
  await worldStore.initialize(shelterStore);
  shelterStore.initialize(worldStore);
 
  // characterStore is a facade and does not need initialization.
  // itemStore is now a facade and does not need direct initialization.
 
  // --- Module Stores (must be initialized after core stores) ---
  const searchStore = useSearchStore();
  searchStore.initialize();
 
  // --- System Stores ---
  const questStore = useQuestStore();
  const skillStore = useSkillStore();
  const achievementStore = useAchievementStore();
  const barterStore = useBarterStore();
  const signInStore = useSignInStore();
  const timeStore = useTimeStore();
  const rumorStore = useRumorStore();
  const weatherStore = useWeatherStore();
  const mapStore = useMapStore();
  const pokedexStore = usePokedexStore();
  const relationsStore = useRelationsStore();
  const adventureStore = useAdventureStore();
 
  // Initialize stores that need to register event handlers
  questStore.initialize();
  weatherStore.initialize();
  adventureStore.initialize();
  pokedexStore.initialize();

  // These stores are now fully reactive and will be initialized via watchers

  // --- Final Step: Enable Event Processing ---
  // Now that all stores have registered their event handlers,
  // we can safely tell the worldStore to start processing the event log.
  worldStore.startEventProcessing();
}

/**
 * 初始化 Store 编排监听器。
 * 这个函数应该在应用启动时（例如在 index.ts 中）被调用一次。
 */
export function initializeStoreOrchestrator() {
  if (isInitialized) {
    logger('warn', 'StoreOrchestrator', 'Store orchestrator already initialized.');
    return;
  }

  const timeStore = useTimeStore();

  // 监听时间变化事件
  watch(() => events.timeChanged, (event) => {
    if (event) {
      logger('log', 'StoreOrchestrator', '`timeChanged` event received, updating timeStore.', event.payload);
      timeStore.updateTime(event.payload);
    }
  }, { deep: true });

  // 监听变量同步事件，这是重新初始化所有Store的信号
  watch(() => events.variablesSynced, (event) => {
    if (event) {
      logger('log', 'StoreOrchestrator', '`variablesSynced` event received, re-initializing all stores.');
      initializeAllStores();
    }
  }, { deep: true });

  // 在这里为其他事件添加监听器
  const rumorStore = useRumorStore();
  watch(() => events.newDayStarted, (event) => {
    if (event) {
      logger('log', 'StoreOrchestrator', '`newDayStarted` event received, calling rumorStore.onNewDay.', event.payload);
      rumorStore.onNewDay(event.payload);
    }
  }, { deep: true });

  const itemStore = useItemStore();
  watch(() => events.awardItem, (event) => {
    if (event) {
      logger('log', 'StoreOrchestrator', '`awardItem` event received, dispatching as a standard "物品变化" event.', event.payload);
      const { itemName, quantity } = event.payload;
      const newEvent = {
        type: '物品变化',
        payload: { '获得': [{ '名称': itemName, '数量': quantity }] },
        // Add other necessary event fields if needed
      };
      // This assumes you have a way to get the eventLogStore here
      // or you might need to pass it in. For now, we'll assume it's accessible.
      const { useEventLogStore } = require('../stores/core/eventLogStore');
      const eventLogStore = useEventLogStore();
      eventLogStore.addEvents([newEvent]);
    }
  }, { deep: true });

  // 首次加载时，不再手动调用初始化。
  // 初始化将由 `variablesSynced` 事件或页面加载逻辑触发。
  // initializeAllStores();

  const worldStore = useWorldStore();
  watch(() => events.weatherCalculated, (event) => {
    if (event) {
      logger('log', 'StoreOrchestrator', '`weatherCalculated` event received, updating worldStore.', event.payload);
      worldStore.updateWorldState('天气', event.payload.newState);
    }
  }, { deep: true });

  isInitialized = true;
  logger('log', 'StoreOrchestrator', 'Store orchestrator initialized.');
}
