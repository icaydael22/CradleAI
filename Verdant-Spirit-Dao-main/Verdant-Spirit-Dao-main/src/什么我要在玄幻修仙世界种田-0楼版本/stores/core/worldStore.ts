import _ from 'lodash';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { z } from 'zod';
import { logger } from '../../core/logger';
import { PokedexEntry, PokedexType } from '../../core/pokedex';
import { emit } from '../../core/reactiveMessageBus';
import { isRecalculating } from '../../core/state';
import { dateToAbsoluteDays, parseTimeDetailsFromString } from '../../core/time';
import { getVariables, updateVariables } from '../../core/variables';
import { AdventureStateSchema, CharactersContainerSchema, ShelterSchema, TimeStateSchema, WeatherSchema, type ITimeState } from '../../types';
import { useEventLogStore, type GameEvent } from './eventLogStore';
 
 // #region Zod Schemas
 
 const RegionSchema = z.object({
  region_id: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.enum(['visited', 'unvisited']),
  tags: z.array(z.string()),
  properties: z.object({
    has_npc: z.boolean().optional(),
    weather_influence: z.string().optional(),
    reward_potential: z.number(),
  }).passthrough(),
  risk_level: z.number(),
});

const ConnectionSchema = z.object({
  from_region: z.string(),
  to_region: z.string(),
  description: z.string(),
  direction: z.string(),
  is_visible: z.boolean(),
  conditions: z.array(z.string()),
  travel_time: z.number(),
  risk_level: z.number(),
});

const MapSchema = z.object({
  regions: z.record(z.string(), RegionSchema),
  connections: z.array(ConnectionSchema),
  currentPlayerLocation: z.string(),
});

const SignInSchema = z.object({
  签到记录: z.record(z.string(), z.array(z.number())).optional(),
  连续签到天数: z.number().optional(),
  今日已签到: z.boolean().optional(),
  月卡: z.object({
    状态: z.string(),
    activatedDate: z.number().nullable(),
  }).optional(),
  名称: z.string().optional(),
});

const CurrentDateSchema = z.object({
  年: z.number(),
  月: z.number(),
  日: z.number(),
});

const ActiveSystemSchema = z.object({
  名称: z.string(),
});

const AchievementSchema = z.object({
  id: z.string(),
  名称: z.string(),
  描述: z.string(),
  完成时间: z.string(),
}).passthrough();

const RewardSchema = z.object({
  id: z.string(),
  名称: z.string(),
  描述: z.string(),
  消耗点数: z.number(),
  库存: z.number(),
}).passthrough();

const AchievementStateSchema = z.object({
  成就点数: z.number().default(0),
  completed: z.record(z.string(), AchievementSchema).default({}),
  奖励列表: z.array(RewardSchema).optional(),
  上次刷新天数: z.number().optional(),
}).passthrough();

// Schemas for Worldview Module
const PokedexEntrySchema = z.object({
  名称: z.string(),
  类别: z.string(),
  描述: z.string(),
  习性: z.string().optional(),
  status: z.enum(['undiscovered', 'known']).default('undiscovered'),
}).passthrough();

const AdventureHookSchema = z.object({
  描述: z.string(),
  触发条件: z.string(),
}).passthrough();

const RumorSchema = z.object({
  id: z.string(),
  content: z.string(),
  source_location: z.string().optional().nullable(),
  related_entities: z.array(z.string()),
  type: z.enum(['flavor', 'lore', 'hook', 'worldview']),
  created_date: z.string(),
  expiry_date: z.string().optional().or(z.literal('')).nullable(),
  status: z.enum(['undiscovered', 'known', 'active', 'inactive', 'resolved']),
}).passthrough();

const WorldviewSchema = z.object({
  rumors: z.array(RumorSchema).optional(),
  pokedex_entries: z.array(PokedexEntrySchema).optional(),
  adventure_hooks: z.array(AdventureHookSchema).optional(),
}).passthrough();

const PokedexStateSchema = z.object({
    妖兽: z.array(PokedexEntrySchema).default([]),
    植物: z.array(PokedexEntrySchema).default([]),
    物品: z.array(PokedexEntrySchema).default([]),
    书籍: z.array(PokedexEntrySchema).default([]),
}).passthrough();

const BarterStateSchema = z.object({
    名称: z.string().optional(),
    可换取的物品: z.array(z.any()).default([]),
    上次刷新天数: z.number().optional(),
}).passthrough();

const WorldStateSchema = z.object({
  时间: TimeStateSchema.optional(),
  地点: z.string().optional(),
  天气: WeatherSchema.optional(),
  庇护所: ShelterSchema.optional(),
  地图: MapSchema.optional(),
  当前日期: CurrentDateSchema.optional(),
  签到: SignInSchema.optional(),
  成就: AchievementStateSchema.optional(),
  世界观: WorldviewSchema.optional(),
  图鉴: PokedexStateSchema.optional(),
  以物换物: BarterStateSchema.optional(),
  当前激活系统: ActiveSystemSchema.optional(),
  事件列表: z.array(z.any()).optional(),
  角色: CharactersContainerSchema.optional(),
  奇遇: AdventureStateSchema.optional(),
  任务列表: z.array(z.any()).optional(), // Placeholder, will be refined by questStore
}).passthrough();

export type WorldState = z.infer<typeof WorldStateSchema>;
export type Worldview = z.infer<typeof WorldviewSchema>;
// #endregion

// Minimal facade for the shelter store to break circular dependency
interface ShelterStoreFacade {
  recentlyDamagedComponent: string | null;
  clearRecentlyDamagedComponent: () => void;
}

// Helper function to determine season from absolute day
const getSeasonInfo = (absoluteDay: number): { season: '春' | '夏' | '秋' | '冬'; solarTerm: string } => {
    const dayOfYear = (absoluteDay - 1) % 360;
    if (dayOfYear < 90) return { season: '春', solarTerm: '立春' }; // Simplified for now
    if (dayOfYear < 180) return { season: '夏', solarTerm: '立夏' };
    if (dayOfYear < 270) return { season: '秋', solarTerm: '立秋' };
    return { season: '冬', solarTerm: '立冬' };
};

export const useWorldStore = defineStore('world', () => {
  // #region State
  const world = ref<WorldState>({});
  const isInitialized = ref(false);
  const eventHandlers = new Map<string, (event: GameEvent, worldState: any) => void>();
  let processedEventCount = 0;
  let isProcessingEvents = false; // Lock to prevent re-entrant processing
  // #endregion

  // #region Stores
  const eventLogStore = useEventLogStore();
  let shelterStore: ShelterStoreFacade;
  // #endregion

  // #region Getters (Facade)
  const weather = computed(() => world.value?.天气 || null);
  const shelter = computed(() => world.value?.庇护所 || null);
  const time = computed(() => world.value?.时间 || { day: 0, timeOfDay: '未知', season: '未知', solarTerm: '未知' });
  const location = computed(() => world.value?.地点 || '未知');
  const allRumors = computed(() => world.value?.世界观?.rumors || []);
  // #endregion

  // #region Actions
  async function initialize(providedShelterStore: ShelterStoreFacade) {
    shelterStore = providedShelterStore;
    try {
      let vars;
      try {
        vars = await getVariables({ type: 'chat' });
      } catch (error: any) {
        if (error.name === 'DataCloneError') {
          logger('warn', 'WorldStore', 'Failed to get variables due to a DataCloneError. This might happen during branch switching. Aborting initialization.', error);
          return;
        }
        throw error;
      }
      const worldData = _.get(vars, '世界', {});

      // Pre-process time data for backwards compatibility before Zod validation
      if (typeof worldData.时间 === 'string') {
        const originalTimeString = worldData.时间;
        logger('info', 'WorldStore', '[Time Conversion] Old string format detected.', { original: originalTimeString });
        
        const parsedTime = parseTimeDetailsFromString(originalTimeString);
        if (import.meta.env.MODE === 'test'){
      console.log('parsedTime:',parsedTime);
    }
        if (parsedTime) {
          // If the string is parsable, convert it
          logger('log', 'WorldStore', '[Time Conversion] Standard string format recognized. Parsing result:', parsedTime);
          const defaultTime = TimeStateSchema.parse({});
          worldData.时间 = {
            ...defaultTime,
            day: parsedTime.relativeDay,
            timeOfDay: `${parsedTime.hourName}时`,
          };
           logger('info', 'WorldStore', '[Time Conversion] Successfully converted standard time string.', { result: worldData.时间 });
        } else if (originalTimeString.includes(' · ')) {
          // Handle the specific non-standard initial state string for Day 1.
          logger('warn', 'WorldStore', `[Time Conversion] Legacy "season · time" format detected: "${originalTimeString}". Converting to Day 1 state.`);
          const parts = originalTimeString.split(' · ');
          const timeOfDay = parts[1];
          
          let seasonInfo = { season: '春' as '春' | '夏' | '秋' | '冬', solarTerm: '立春' };

          // Use precise start date to determine the correct starting season.
          if (worldData.当前日期 && typeof worldData.当前日期 === 'object') {
            const startAbsoluteDay = dateToAbsoluteDays(worldData.当前日期);
            seasonInfo = getSeasonInfo(startAbsoluteDay);
            logger('info', 'WorldStore', '[Time Conversion] Using precise start date to determine initial season.', { startDate: worldData.当前日期, seasonInfo });
          } else {
            logger('warn', 'WorldStore', '[Time Conversion] Precise start date not found. Season may be inaccurate.');
          }

          const newTimeObject = {
            day: 1, // Legacy string always represents the first day.
            timeOfDay: timeOfDay,
            season: seasonInfo.season,
            solarTerm: seasonInfo.solarTerm,
          };
          
          logger('log', 'WorldStore', '[Time Conversion] Calculated new time object for Day 1.', { result: newTimeObject });

          worldData.时间 = TimeStateSchema.parse(newTimeObject);
          logger('info', 'WorldStore', '[Time Conversion] Successfully converted legacy time string to Day 1 state.', { final: worldData.时间 });
        } else {
            logger('warn', 'WorldStore', `[Time Conversion] Could not parse old time string "${originalTimeString}". Validation will likely fail.`);
        }
      }
      
      // Defensive initialization for new games
      if (!worldData.天气 || _.isEmpty(worldData.天气)) {
        logger('warn', 'WorldStore', 'Weather data is missing. Initializing with default state.');
        worldData.天气 = {
            "当前天气": "晴朗",
            "天气描述": "万里无云，是个好天气。",
            "季节": "春",
            "节气": "立春",
            "特殊天象": null,
            "效果": [],
            "天气影响": []
        };
      }
      if (!worldData.庇护所 || _.isEmpty(worldData.庇护所)) {
        logger('warn', 'WorldStore', 'Shelter data is missing. Initializing with default state.');
        worldData.庇护所 = {
            "名称": "未命名",
            "规模": "无",
            "状态": "尚未建立",
            "舒适度": "无",
            "防御力": "无",
            "功能": [],
            "组件": {
                "围墙": { "规模": "未布置", "材料": "无", "耐久度": "0%", "防御加成": "无", "状态": "未建造" },
                "屋顶": { "规模": "未布置", "材料": "无", "耐久度": "0%", "防雨加成": "无", "状态": "未建造" },
                "农田": { "id": "farm_001", "规模": "未开垦", "状态": "未建造", "作物": null, "产出效率": "无" },
                "药园": { "id": "herb_001", "规模": "未开垦", "状态": "未建造", "药材": null, "产出效率": "无" },
                "防御阵法": { "规模": "未布置", "状态": "未激活", "灵力消耗": "无", "防御加成": "无" }
            },
            "事件日志": []
        };
      }

      const parsedWorld = WorldStateSchema.safeParse(worldData);
      if (parsedWorld.success) {
        world.value = parsedWorld.data;
        logger('info', 'WorldStore', 'Successfully initialized and validated world state.');
      } else {
        logger('error', 'WorldStore', 'Failed to validate world state:', parsedWorld.error);
        
        // (v4.6) Zod校验失败后的自动修复逻辑
        const genesisState = _.get(worldData, '初始状态');
        if (genesisState) {
            logger('warn', 'WorldStore', 'Attempting to restore from genesis snapshot due to validation failure...');
            
            // (v4.8) 恢复深层合并逻辑，以保留LLM可能添加的额外键值
            const restoredData = _.merge({}, genesisState, worldData);
            const reparsedWorld = WorldStateSchema.safeParse(restoredData);

            // (v4.8) 识别并警告多余的键
            const knownKeys = new Set(Object.keys(WorldStateSchema.shape));
            const actualKeys = Object.keys(worldData);
            const extraKeys = actualKeys.filter(key => !knownKeys.has(key));
            if (extraKeys.length > 0) {
                toastr.warning(`存档中存在非标准数据，可能由LLM生成。已保留但建议检查：<br>- ${extraKeys.join('<br>- ')}`);
                logger('warn', 'WorldStore', 'Detected extra keys in world state, possibly from LLM:', extraKeys);
            }

            if (reparsedWorld.success) {
                world.value = reparsedWorld.data;
                logger('info', 'WorldStore', 'Successfully restored and validated world state from genesis snapshot.');
                toastr.info('检测到存档数据损坏或不完整，已从创世快照中自动修复。');
            } else {
                world.value = worldData; // 即使修复失败，也保留原始数据
                logger('error', 'WorldStore', 'Failed to restore from genesis snapshot. The snapshot itself might be invalid.', reparsedWorld.error);
                toastr.error('自动修复存档失败，创世快照可能已损坏。');
            }
        } else {
            world.value = worldData; // 没有创世快照，只能使用原始数据
            logger('error', 'WorldStore', 'Cannot restore state, genesis snapshot is missing.');
        }
      }

      emit('worldStoreInitialized', undefined);
      logger('info', 'WorldStore', 'Emitted worldStoreInitialized signal.');

      // Register core event handlers
      registerEventHandler('上下文更新', (event, worldState) => {
        const payload = event.payload;
        if (payload.地点) {
          worldState.地点 = payload.地点;
        }
        if (payload.时间) {
          const { useTimeStore } = require('../systems/timeStore');
          const timeStore = useTimeStore();
          const currentTimeState = worldState.时间;
          let newRelativeDay = currentTimeState.day;
          let newTimeOfDay = currentTimeState.timeOfDay;
          if (typeof payload.时间 === 'string') {
            const parsed = parseTimeDetailsFromString(payload.时间);
            if (parsed) {
              newRelativeDay = parsed.relativeDay;
              newTimeOfDay = `${parsed.hourName}时`;
            }
          } else if (typeof payload.时间 === 'object' && payload.时间 !== null) {
            const timeUpdate = payload.时间 as Partial<ITimeState>;
            if (timeUpdate.day !== undefined) newRelativeDay = timeUpdate.day;
            if (timeUpdate.timeOfDay !== undefined) newTimeOfDay = timeUpdate.timeOfDay;
          }
          // This should ideally emit an internal event that the orchestrator picks up
          // For now, direct call for simplicity until timeStore is fully refactored.
          timeStore.updateTime({ toDay: newRelativeDay, toTimeOfDay: newTimeOfDay });
        }
      });

      registerEventHandler('世界观条目状态更新', (event, worldState) => {
        updateWorldviewEntryStatus(event.payload);
      });

      registerEventHandler('新图鉴发现', (event, worldState) => {
        const payload = event.payload as { 类型: PokedexType; 数据: PokedexEntry | PokedexEntry[] };
        if (!worldState.图鉴) {
          worldState.图鉴 = { 妖兽: [], 植物: [], 物品: [], 书籍: [] };
        }
        const { 类型: type, 数据: data } = payload;
        const entries = Array.isArray(data) ? data : [data];
        if (!worldState.图鉴[type]) {
          worldState.图鉴[type] = [];
        }
        for (const entry of entries) {
          if (!entry.类别) {
            entry.类别 = type;
          }
          const targetArray = worldState.图鉴[type] as PokedexEntry[];
          const existingEntry = targetArray.find((e: PokedexEntry) => e.名称 === entry.名称);
          if (!existingEntry) {
            targetArray.push(entry);
          } else if (!_.isEqual(existingEntry, entry)) {
            Object.assign(existingEntry, entry);
          }
        }
      });

      registerEventHandler('可换取物品更新', (event, worldState) => {
        if (!worldState.以物换物) {
          worldState.以物换物 = { 可换取的物品: [], 上次刷新天数: 0 };
        }
        worldState.以物换物.可换取的物品 = event.payload;
        if (worldState.时间) {
          worldState.以物换物.上次刷新天数 = worldState.时间.day;
        }
      });

      registerEventHandler('交易完成', (event, worldState) => {
        const { useBarterStore } = require('../systems/barterStore');
        const barterStore = useBarterStore();
        barterStore.resetSelections();
      });

      registerEventHandler('角色更新', (event, worldState) => {
        const { 姓名: charName, 更新: updates } = event.payload;
        if (!charName || !updates) {
          logger('warn', 'worldStore', 'Invalid character update event payload.', event.payload);
          return;
        }
        if (!worldState.角色) {
          worldState.角色 = {};
        }
        if (worldState.角色[charName]) {
          _.merge(worldState.角色[charName], updates);
        } else {
          worldState.角色[charName] = { 姓名: charName, ...updates };
        }
      });

      registerEventHandler('物品变化', (event, worldState) => {
        const { useCharacterStore } = require('../facades/characterStore');
        const characterStore = useCharacterStore();
        const mainCharName = characterStore.mainCharacterName;
        if (!mainCharName || !worldState.角色?.[mainCharName]) return;

        const mainCharacter = worldState.角色[mainCharName];
        if (!mainCharacter.物品) mainCharacter.物品 = [];
        const newItemList = mainCharacter.物品;

        const payload = event.payload;
        if (payload.获得) {
          for (const itemToAdd of payload.获得) {
            const existingItem = newItemList.find((i: any) => i.名称 === itemToAdd.名称);
            if (existingItem) {
              existingItem.数量 = (existingItem.数量 || 1) + (itemToAdd.数量 || 1);
            } else {
              newItemList.push({ ...itemToAdd, 数量: itemToAdd.数量 || 1 });
            }
          }
        }
        if (payload.失去) {
          for (const itemToRemove of payload.失去) {
            const existingItem = newItemList.find((i: any) => i.名称 === itemToRemove.名称);
            if (existingItem) {
              existingItem.数量 = (existingItem.数量 || 1) - (itemToRemove.数量 || 1);
              if (existingItem.数量 <= 0) {
                _.remove(newItemList, (i: any) => i.名称 === itemToRemove.名称);
              }
            }
          }
        }
        if (payload.更新) {
          for (const itemToUpdate of payload.更新) {
            const existingItem = newItemList.find((i: any) => i.名称 === itemToUpdate.名称);
            if (existingItem) {
              // Use Object.assign for reliable reactive updates.
              Object.assign(existingItem, itemToUpdate.更新);
            }
          }
        }
      });

      registerEventHandler('物品条目更新', (event, worldState) => {
        const { useCharacterStore } = require('../facades/characterStore');
        const characterStore = useCharacterStore();
        const mainCharName = characterStore.mainCharacterName;
        if (!mainCharName || !worldState.角色?.[mainCharName]?.物品) return;

        const newItemList = worldState.角色[mainCharName].物品;
        const { originalName, updatedData } = event.payload;
        const itemIndex = newItemList.findIndex((i: any) => i.名称 === originalName);
        if (itemIndex !== -1) {
          // Use Object.assign to merge properties into the existing object
          // This is safer as it preserves the object reference and handles partial updates correctly.
          Object.assign(newItemList[itemIndex], updatedData);
        }
      });

      // Map Event Handlers
      registerEventHandler('新区域发现', (event, worldState) => {
        if (!worldState.地图) worldState.地图 = { regions: {}, connections: [], currentPlayerLocation: '' };
        const { new_region, connection } = event.payload;
        if (new_region && connection && new_region.region_id) {
          worldState.地图.regions[new_region.region_id] = new_region;
          worldState.地图.connections.push(connection);
        }
      });

      registerEventHandler('地图已更新', (event, worldState) => {
        if (!worldState.地图) return;
        const { region_id, changes } = event.payload;
        if (region_id && worldState.地图.regions[region_id] && changes) {
          _.merge(worldState.地图.regions[region_id], changes);
        }
      });

      registerEventHandler('路径更新', (event, worldState) => {
        if (!worldState.地图) return;
        const { connection, new_region } = event.payload;
        if (connection && connection.from_region && connection.direction) {
          if (new_region && new_region.region_id) {
            worldState.地图.regions[new_region.region_id] = new_region;
          }
          const existingConnectionIndex = worldState.地图.connections.findIndex(
            (c: any) => c.from_region === connection.from_region && c.direction === connection.direction
          );
          if (existingConnectionIndex > -1) {
            worldState.地图.connections[existingConnectionIndex] = { ...worldState.地图.connections[existingConnectionIndex], ...connection };
          } else {
            worldState.地图.connections.push(connection);
          }
        }
      });

      registerEventHandler('关系变化', (event, worldState) => {
        const { 角色, 目标, 变化值 } = event.payload;
        if (!角色 || !目标 || typeof 变化值 !== 'number') {
          logger('warn', 'worldStore', 'Invalid "关系变化" event payload.', event.payload);
          return;
        }
        if (!worldState.角色?.[角色]) {
          logger('warn', 'worldStore', `Character "${角色}" not found for relationship change.`);
          return;
        }
        if (!worldState.角色[角色].关系) {
          worldState.角色[角色].关系 = {};
        }
        const currentRelation = worldState.角色[角色].关系[目标] || 0;
        worldState.角色[角色].关系[目标] = currentRelation + 变化值;
      });

    } catch (error) {
      logger('error', 'WorldStore', 'Failed to initialize world state from variables.', error);
    }
  }

  function startEventProcessing() {
    if (isInitialized.value) {
      logger('warn', 'worldStore', 'Event processing already started.');
      return;
    }
    isInitialized.value = true;
    logger('info', 'worldStore', 'Event processing is now enabled.');
  }

  async function persistWorldState() {
    if (isRecalculating.value) {
      logger('log', 'worldStore', 'State recalculation in progress. Skipping persistence.');
      return;
    }
    if (!world.value) {
      logger('error', 'worldStore', 'Cannot persist null world data.');
      return;
    }
    try {
      await updateVariables({ '世界': _.cloneDeep(world.value) });
      logger('info', 'worldStore', 'Successfully persisted consolidated world data.');
    } catch (error) {
      logger('error', 'worldStore', 'Failed to persist world data.', error);
    }
  }

  async function updateWorldState(path: string, value: any) {
    if (!world.value) {
      logger('warn', 'WorldStore', `Cannot update path "${path}" because world state is not initialized.`);
      return;
    }
    _.set(world.value, path, value);
    await persistWorldState();
  }

  /**
   * Updates the worldview state by merging new elements.
   * @param updates - An object containing arrays of new worldview elements to add.
   */
  function updateWorldview(updates: Partial<Worldview>) {
    if (!world.value) {
      logger('warn', 'WorldStore', 'Cannot update worldview because world state is not initialized.');
      return;
    }
    if (!world.value.世界观) {
      world.value.世界观 = {};
    }

    // Merge rumors, ensuring uniqueness by ID
    if (updates.rumors) {
      const existingRumors = world.value.世界观.rumors || [];
      const existingRumorIds = new Set(existingRumors.map(r => r.id));
      const newUniqueRumors = updates.rumors.filter(r => !existingRumorIds.has(r.id));
      if (newUniqueRumors.length > 0) {
        world.value.世界观.rumors = [...existingRumors, ...newUniqueRumors];
        logger('info', 'WorldStore', `Added ${newUniqueRumors.length} new rumors to worldview.`);
      }
    }

    // Merge pokedex entries, ensuring uniqueness by name
    if (updates.pokedex_entries) {
      const existingEntries = world.value.世界观.pokedex_entries || [];
      const existingEntryNames = new Set(existingEntries.map(e => e.名称));
      const newUniqueEntries = updates.pokedex_entries.filter(e => !existingEntryNames.has(e.名称));
      if (newUniqueEntries.length > 0) {
        world.value.世界观.pokedex_entries = [...existingEntries, ...newUniqueEntries];
        logger('info', 'WorldStore', `Added ${newUniqueEntries.length} new pokedex entries to worldview.`);
      }
    }

    // Merge adventure hooks, ensuring uniqueness by description
    if (updates.adventure_hooks) {
      const existingHooks = world.value.世界观.adventure_hooks || [];
      const existingHookDescriptions = new Set(existingHooks.map(h => h.描述));
      const newUniqueHooks = updates.adventure_hooks.filter(h => !existingHookDescriptions.has(h.描述));
      if (newUniqueHooks.length > 0) {
        world.value.世界观.adventure_hooks = [...existingHooks, ...newUniqueHooks];
        logger('info', 'WorldStore', `Added ${newUniqueHooks.length} new adventure hooks to worldview.`);
      }
    }

    persistWorldState();
  }

  function updateWorldviewEntryStatus({ 类型, 名称, 新状态 }: { 类型: string; 名称: string; 新状态: string }) {
    if (!world.value?.世界观) {
      logger('warn', 'WorldStore', 'Cannot update worldview entry status because worldview is not initialized.');
      return;
    }

    let updated = false;
    switch (类型) {
      case '传闻': {
        const rumors = world.value.世界观.rumors || [];
        const rumor = rumors.find(r => r.content === 名称);
        if (rumor) {
          // @ts-expect-error We are confident that newStatus is a valid status
          rumor.status = 新状态;
          updated = true;
          logger('info', 'WorldStore', `Updated status of rumor "${名称}" to "${新状态}".`);
        }
        break;
      }
      case '图鉴条目': {
        const entries = world.value.世界观.pokedex_entries || [];
        const entry = entries.find(e => e.名称 === 名称);
        if (entry) {
          // @ts-expect-error We are confident that newStatus is a valid status
          entry.status = 新状态;
          updated = true;
          logger('info', 'WorldStore', `Updated status of pokedex entry "${名称}" to "${新状态}".`);
        }
        break;
      }
      default:
        logger('warn', 'WorldStore', `Unknown worldview entry type "${类型}" for status update.`);
        return;
    }

    if (updated) {
      persistWorldState();
    } else {
      logger('warn', 'WorldStore', `Could not find worldview entry of type "${类型}" with name "${名称}" to update.`);
    }
  }
  // #endregion

  // #region Watchers
  /**
   * Registers a handler for a specific event type.
   * @param eventType The type of the event to handle.
   * @param handler The function to execute when the event is processed.
   */
  function registerEventHandler(eventType: string, handler: (event: GameEvent, worldState: any) => void) {
    // Overwriting handlers is an expected and safe behavior during re-initialization,
    // as the same store instances are re-registering their handlers.
    eventHandlers.set(eventType, handler);
    logger('log', 'worldStore:registerEventHandler', `Registered/updated handler for event type: ${eventType}`);
  }

  function processEvent(event: GameEvent) {
    if (!world.value) {
      logger('error', 'worldStore', 'processEvent called before world is initialized.');
      return;
    }
    try {
      const handler = eventHandlers.get(event.type);
      if (handler) {
        //console.log(`[DEBUG] worldStore: BEFORE event '${event.type}'. State:`, JSON.stringify(world.value, null, 2));
        //console.log(`[DEBUG] worldStore: Processing event payload:`, JSON.stringify(event.payload, null, 2));
        handler(event, world.value);
        //console.log(`[DEBUG] worldStore: AFTER event '${event.type}'. State:`, JSON.stringify(world.value, null, 2));
      } else {
        //console.log(`[DEBUG] worldStore: No handler found for event type '${event.type}'.`);
      }
    } catch (error) {
      logger('error', 'WorldStore', `Error processing event ${event.type}:`, { event, error });
    }
  }

  function _dangerouslyProcessEvents(eventsToProcess: GameEvent[]) {
    if (!world.value) {
        logger('error', 'worldStore', '_dangerouslyProcessEvents called before world is initialized.');
        return;
    }

    if (!world.value.事件列表) {
        world.value.事件列表 = [];
    }
    world.value.事件列表.push(..._.cloneDeep(eventsToProcess));

    const eventQueue = [...eventsToProcess];
    let currentEvent = eventQueue.shift();

    while (currentEvent) {
      // Special handling for adventure events to unwrap the inner event
      if (currentEvent.type === '奇遇' && currentEvent.payload?.事件) {
        const innerEvent = currentEvent.payload.事件;
        // Add the inner event to the front of the queue to be processed next
        eventQueue.unshift(innerEvent);
      }
      
      processEvent(currentEvent);
      currentEvent = eventQueue.shift();
    }
  }

  // Watch for new events and process them once the world is initialized.
  // This is the central point for processing events from the event log.
  watch(
    () => eventLogStore.allEvents,
    (allEvents) => {
      if (!isInitialized.value || isProcessingEvents) {
        logger('log', 'worldStore', 'Skipping event processing (not initialized or already processing).');
        return;
      }

      if (allEvents.length > processedEventCount) {
        isProcessingEvents = true; // Set lock
        try {
          const newEventsSlice = allEvents.slice(processedEventCount);
          logger('info', 'worldStore', `Detected ${newEventsSlice.length} new events to process.`);
          _dangerouslyProcessEvents(newEventsSlice);
          processedEventCount = allEvents.length;
        } finally {
          isProcessingEvents = false; // Release lock
        }
      }
    },
    { deep: true },
  );
  // #endregion

  function _dangerouslySetState(newState: WorldState) {
    logger('warn', 'worldStore', 'Setting world state directly. This should only be used during state recalculation.', newState);
    world.value = newState;
  }

  return {
    world,
    character: computed(() => world.value?.角色 || {}), // Add this for testability
    isInitialized,
    weather,
    shelter,
    time,
    location,
    allRumors,
    initialize,
    startEventProcessing,
    updateWorldState,
    updateWorldview,
    updateWorldviewEntryStatus,
    _dangerouslySetState,
    _dangerouslyProcessEvents, // Keep for recalculation logic
    processEvents(eventsToProcess: GameEvent[]) {
      if (!world.value) {
        logger('error', 'worldStore', 'processEvents called before world is initialized.');
        return;
      }
      logger('info', 'worldStore', `[Action] Processing ${eventsToProcess.length} events.`);
      for (const event of eventsToProcess) {
        processEvent(event);
      }
    },
    registerEventHandler,
    processEvent, // Expose the new method
    /**
     * Re-dispatches a single event to be processed by the registered handlers.
     * This is useful for nested events, like those in an "Adventure" event payload.
     * @param event The event to re-dispatch.
     */
    redispatchEvent(event: GameEvent) {
       if (!world.value) return;
       const handler = eventHandlers.get(event.type);
       if (handler) {
           handler(event, world.value);
       }
    },
    // Expose child store's specific refs and methods if needed, e.g.:
    recentlyDamagedComponent: computed(() => {
        // Safely access the store only after it has been initialized.
        return shelterStore ? shelterStore.recentlyDamagedComponent : null;
    }),
    clearRecentlyDamagedComponent: () => {
        // Safely access the store only after it has been initialized.
        if (shelterStore) {
            shelterStore.clearRecentlyDamagedComponent();
        }
    },
  };
});
