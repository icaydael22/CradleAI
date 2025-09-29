import { type IFuseOptions } from 'fuse.js';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { ChatHistoryManager, MessagePage } from '../../core/history';
import { logger } from '../../core/logger';
import { PokedexEntry, PokedexManager, PokedexType, RemotePokedexData, ShareableType } from '../../core/pokedex';
import { generateWithSecondaryApi } from '../../core/secondaryLlmApi';
import { isRecalculating } from '../../core/state';
import { assignVariables, getVariables } from '../../core/variables';
import { useAppStore } from '../app/appStore';
import { GameEvent, useEventLogStore } from '../core/eventLogStore';
import { useItemStore } from '../facades/itemStore';
import { useWorldStore } from '../core/worldStore';
import { useSearchStore } from '../modules/searchStore';
import { useDetailsStore } from '../ui/detailsStore';

// The global pokedexManager instance is assumed to be available.
// In index.ts, it will be attached to the window object for Vue components to access.
declare const _: any;
declare const toastr: any;
declare const updateVariablesWith: (updater: any, options: any) => Promise<any>;
declare const replaceVariables: (variables: Record<string, any>, options?: any) => Promise<Record<string, any>>;


export const usePokedexStore = defineStore('pokedex', () => {
    const worldStore = useWorldStore();

    // --- PURE GETTERS FOR TESTING ---
    const pokedexData = computed(() => worldStore.world?.图鉴);

    const allEntries = computed(() => {
        if (!pokedexData.value) return [];
        return (Object.values(pokedexData.value) as PokedexEntry[][]).flat();
    });

    const knownEntries = computed(() => {
        return allEntries.value.filter(entry => entry.status === 'known');
    });

    const getEntriesByType = (type: PokedexType) => {
        return pokedexData.value?.[type] || [];
    };

    const discoveryProgress = computed(() => {
        const progress = {
            妖兽: { known: 0, total: 0 },
            植物: { known: 0, total: 0 },
            物品: { known: 0, total: 0 },
            书籍: { known: 0, total: 0 },
        };
        if (!pokedexData.value) return progress;

        for (const type of Object.keys(progress) as PokedexType[]) {
            const entries = pokedexData.value[type] || [];
            progress[type].total = entries.length;
            progress[type].known = entries.filter((e: PokedexEntry) => e.status === 'known').length;
        }
        return progress;
    });


    // --- ACTIONS WITH SIDE EFFECTS (to be mocked in tests) ---
    const getPokedexManager = (): PokedexManager => (window as any).pokedexManager;
    const eventLogStore = useEventLogStore();
    const appStore = useAppStore();
    const lastProcessedEventIndex = ref(-1);

    const getGenerationContext = async (): Promise<{ summary: string; recentHistory: string }> => {
        try {
            const historyManager = (window as any).chatHistoryManager as ChatHistoryManager;
            if (!historyManager) return { summary: '无', recentHistory: '无' };

            const allMessages = historyManager.getMessagesForPrompt();
            const lastSummary = allMessages.findLast(m => m.role === 'summary');
            const recentMessages = allMessages.slice(-5); // Get last 5 messages for recent context

            const recentHistoryText = recentMessages.map((msg: MessagePage) => {
                const roleName = msg.role === 'user' ? '玩家' : '旁白';
                const content = msg.content.replace(/<statusbar>[\s\S]*?<\/statusbar>/g, '').trim();
                return `${roleName}: ${content}`;
            }).join('\n');

            return {
                summary: lastSummary ? lastSummary.content : '无',
                recentHistory: recentHistoryText,
            };
        } catch (error) {
            logger('error', 'PokedexStore', 'Failed to get generation context.', error);
            return { summary: '无', recentHistory: '无' };
        }
    };

    /**
     * Sanitizes and parses a JSON string that is expected to be an array of pokedex entries.
     * @param responseJson The raw string from the LLM API.
     * @returns A parsed array of objects, or an empty array if parsing fails.
     */
    const sanitizeAndParsePokedexArray = (responseJson: any): any[] => {
        if (typeof responseJson !== 'string') {
            logger('error', 'PokedexStore', 'Invalid input to sanitizeAndParsePokedexArray: not a string.', responseJson);
            return [];
        }

        try {
            // More robustly find the JSON part, whether it's in a code block or not
            let jsonStringToParse = responseJson;
            const match = responseJson.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
            if (match) {
                jsonStringToParse = match[0];
            }

            // Clean up potential trailing commas before closing brackets/braces
            jsonStringToParse = jsonStringToParse.trim().replace(/,\s*(?=}|])/g, "");
            
            const parsedData = JSON.parse(jsonStringToParse);

            if (!Array.isArray(parsedData)) {
                logger('warn', 'PokedexStore', 'Parsed JSON is not an array.', parsedData);
                // Attempt to handle single object case
                if (typeof parsedData === 'object' && parsedData !== null) {
                    return [parsedData];
                }
                return [];
            }

            return parsedData;
        } catch (error) {
            logger('error', 'PokedexStore', 'Failed to parse JSON array.', { error, responseJson });
            return [];
        }
    };

    // --- STATE ---
    const isManagerModalOpen = ref(false);
    const isRemoteSyncModalOpen = ref(false);
    const isRewardsModalOpen = ref(false);

    // Data state
    // This ref is for the GLOBAL pokedex data, not the player's discovered entries.
    const globalPokedex = ref<{ [key in PokedexType]: PokedexEntry[] }>({ 妖兽: [], 植物: [], 物品: [], 书籍: [] });
    const achievements = ref<any[]>([]);
    const achievementPoints = ref(0);
    const newDiscoveries = ref<{ type: PokedexType, entry: PokedexEntry }[]>([]);
    const pendingReviewItems = ref<{ type: PokedexType, entry: PokedexEntry }[]>([]);

    // New type for diff items to include selection state for the UI
    type DiffItem = { type: ShareableType; entry: PokedexEntry; selected: boolean };
    const localDiff = ref<DiffItem[]>([]);
    const remoteDiff = ref<DiffItem[]>([]);
    let remoteDataCache: RemotePokedexData | null = null;

    // UI state
    const isLoading = ref(false);
    const managerTab = ref<'view' | 'add'>('view');
    const addMode = ref<'form' | 'json'>('form');
    const remoteSyncTab = ref<'submit' | 'fetch'>('submit');
    const providerName = ref('');

    /**
     * Recursively traverses an object or array and replaces all occurrences of a string.
     * @param obj The object or array to traverse.
     * @param oldStr The string to replace.
     * @param newStr The new string.
     */
    const deepReplace = (obj: any, oldStr: string, newStr: string) => {
      if (obj === null || typeof obj !== 'object') {
        return;
      }

      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key];
          if (typeof value === 'string') {
            obj[key] = value.replace(new RegExp(oldStr, 'g'), newStr);
          } else if (typeof value === 'object') {
            deepReplace(value, oldStr, newStr);
          }
        }
      }
    };

    const updatePowerSystemNameInPokedex = (oldName: string, newName: string) => {
      if (oldName === newName) return;
      logger('info', 'PokedexStore', `Updating power system name in pokedex from "${oldName}" to "${newName}".`);
      const mutablePokedex = _.cloneDeep(globalPokedex.value);
      deepReplace(mutablePokedex, oldName, newName);
      globalPokedex.value = mutablePokedex;
      // Also update the search index with the new data
      initializeKnowledgeSearchIndex();
      toastr.info(`已将图鉴中的“${oldName}”更新为“${newName}”。`);
    };

    /**
     * 根据物品的基础价值推断其品阶。
     * 用于兼容缺少品阶字段的旧版存档数据。
     * @param baseValue 物品的`价值.基础价值`。
     * @returns 推断出的品阶字符串，例如 "凡品中阶"。
     */
    const inferRankFromValue = (baseValue: number): string => {
      if (baseValue <= 5) return '凡品下阶';
      if (baseValue <= 15) return '凡品中阶';
      if (baseValue <= 30) return '凡品上阶';
      if (baseValue <= 50) return '凡品绝品';
      if (baseValue <= 100) return '灵品下阶';
      if (baseValue <= 200) return '灵品中阶';
      if (baseValue <= 350) return '灵品上阶';
      if (baseValue <= 500) return '灵品绝品';
      return '法品下阶'; // 默认值
    };

    // --- ACTIONS ---

    /**
     * Fetches all necessary data from variables and pokedexManager to populate the store.
     */
    const initializeKnowledgeSearchIndex = () => {
        const searchStore = useSearchStore();
        const allKnowledge: (PokedexEntry & { id: string })[] = [];

        // Flatten all pokedex entries and add a unique ID and type
        for (const type of Object.keys(globalPokedex.value) as PokedexType[]) {
            globalPokedex.value[type].forEach(entry => {
                allKnowledge.push({ ...entry, id: `世界.图鉴.${type}.${entry.名称}`, type: type });
            });
        }

        // Add achievements with a type
        achievements.value.forEach(ach => {
            allKnowledge.push({ ...ach, id: `世界.成就.${ach.名称}`, type: '成就' });
        });

        const knowledgeOptions: IFuseOptions<any> = {
            keys: [
                { name: '名称', weight: 0.5 },
                { name: 'type', weight: 0.3 },
                { name: 'tags', weight: 0.2 },
                { name: 'dynamicKeywords', weight: 0.2 },
                { name: '描述', weight: 0.1 },
            ],
            includeScore: true,
            minMatchCharLength: 1,
            ignoreLocation: false,
            threshold: 0.3,
        };

        searchStore.initializeSearchIndex('knowledge', allKnowledge, knowledgeOptions);
    };

    const refreshAllData = async () => {
        const pokedexManager = getPokedexManager();
        if (!pokedexManager) {
            logger('error', 'PokedexStore', 'PokedexManager not available on window.');
            toastr.error('图鉴管理器未初始化，请刷新页面。');
            return;
        }
        isLoading.value = true;
        logger('log', 'PokedexStore', 'Refreshing all pokedex data...');
        try {
            // 1. Fetch global pokedex data and store it in our mutable state
            // This should only happen once or when a full refresh is needed.
            const freshPokedexData = await pokedexManager.getPokedexData();
            // On initialization, we might also need to apply the currently saved power system name
            let chatVars;
            try {
                chatVars = getVariables({ type: 'chat' });
            } catch (error: any) {
                if (error.name === 'DataCloneError') {
                    logger('warn', 'PokedexStore', 'DataCloneError while getting chatVars for power system name. Using defaults.', error);
                    chatVars = {};
                } else {
                    throw error;
                }
            }
            const savedWorldview = _.get(chatVars, '世界.世界观.固定世界信息');
            if (savedWorldview && savedWorldview.powerSystem.name !== '灵气') {
              logger('info', 'PokedexStore', `Applying custom power system name "${savedWorldview.powerSystem.name}" to initial pokedex data.`);
              deepReplace(freshPokedexData, '灵气', savedWorldview.powerSystem.name);
            }
            globalPokedex.value = freshPokedexData;


            // 2. Fetch achievements data
            const systemData = await pokedexManager.getSystemData();
            achievements.value = systemData.已完成 || [];
            achievementPoints.value = systemData.成就点数 || 0;

            // 3. Fetch pending review items from global variables
            let allGlobalVars;
            try {
                allGlobalVars = getVariables({ type: 'global' });
            } catch (error: any) {
                if (error.name === 'DataCloneError') {
                    logger('warn', 'PokedexStore', 'DataCloneError while getting global vars. Pending items may be missing.', error);
                    allGlobalVars = {};
                } else {
                    throw error;
                }
            }
            // Sanitize the data to remove proxies before assigning to reactive state
            pendingReviewItems.value = _.get(JSON.parse(JSON.stringify(allGlobalVars)), '世界.系统.待审核图鉴', []);

            // 4. Check for new discoveries in the current message by comparing against the global pokedex
            const floorId = appStore.floorId;
            let messageVars;
            try {
                messageVars = getVariables({ type: 'message', message_id: floorId });
            } catch (error: any) {
                if (error.name === 'DataCloneError') {
                    logger('warn', 'PokedexStore', 'DataCloneError while getting message vars. New discoveries may not be detected.', error);
                    messageVars = {};
                } else {
                    throw error;
                }
            }
            // Sanitize the data to remove proxies
            const messagePokedex = _.get(JSON.parse(JSON.stringify(messageVars)), '世界.图鉴', {});
            const discoveries: { type: PokedexType, entry: PokedexEntry }[] = [];
            const types: PokedexType[] = ['妖兽', '植物', '物品', '书籍'];

            types.forEach(type => {
                const messageEntries = messagePokedex[type] || [];
                // Compare against the global pokedex data stored in globalPokedex.value
                const globalNames = new Set(globalPokedex.value[type].map(e => e.名称));
                const diffEntries = messageEntries.filter((e: PokedexEntry) => e.名称 && !globalNames.has(e.名称));
                diffEntries.forEach((entry: PokedexEntry) => discoveries.push({ type, entry }));
            });
            newDiscoveries.value = discoveries;
            logger('info', 'PokedexStore', `Found ${newDiscoveries.value.length} new discoveries.`);

            // 5. Initialize the search index
            initializeKnowledgeSearchIndex();

        } catch (error) {
            logger('error', 'PokedexStore', 'Failed to refresh pokedex data.', error);
            toastr.error('加载图鉴数据失败。');
        } finally {
            isLoading.value = false;
        }
    };

    const initialize = async () => {
        // This function is no longer needed as worldStore handles all state initialization.
        logger('info', 'PokedexStore', 'Initialization is now handled by worldStore.');
    };

    const openManagerModal = async () => {
        isManagerModalOpen.value = true;
        await refreshAllData();
    };

    const closeManagerModal = () => {
        isManagerModalOpen.value = false;
    };

    const openRemoteSyncModal = () => {
        isRemoteSyncModalOpen.value = true;
    };

    const closeRemoteSyncModal = () => {
        isRemoteSyncModalOpen.value = false;
    };

    const approveDiscoveries = async (selectedItems: { type: PokedexType, name: string }[]) => {
        if (selectedItems.length === 0) {
            toastr.warning('请至少选择一个要收录的条目。');
            return;
        }
        logger('log', 'PokedexStore', `Approving ${selectedItems.length} discoveries...`, selectedItems);

        let successCount = 0;
        const pokedexManager = getPokedexManager();
        for (const item of selectedItems) {
            const discovery = newDiscoveries.value.find(d => d.type === item.type && d.entry.名称 === item.name);
            if (discovery) {
                if (await pokedexManager.createPokedexEntry(discovery.type, discovery.entry)) {
                    successCount++;
                }
            }
        }

        if (successCount > 0) {
            toastr.success(`成功收录了 ${successCount} 个新条目！`);
            await refreshAllData();
        }
    };
    
    const approvePendingItem = async (index: number) => {
        const pokedexManager = getPokedexManager();
        const itemToApprove = pendingReviewItems.value[index];
        if (!itemToApprove) return;

        logger('log', 'PokedexStore', 'Approving pending item:', itemToApprove);
        const success = await pokedexManager.createPokedexEntry(itemToApprove.type, itemToApprove.entry);
        if (success) {
            const updatedPendingItems = [...pendingReviewItems.value];
            updatedPendingItems.splice(index, 1);
            await assignVariables({ '世界.系统.待审核图鉴': updatedPendingItems }, { type: 'global' });
            toastr.info(`“${itemToApprove.entry.名称}”已审核通过。`);
            await refreshAllData();
        }
    };

    const deleteEntry = async (type: PokedexType | '成就', name: string) => {
        const pokedexManager = getPokedexManager();
        if (confirm(`确定要删除 ${type} 图鉴中的 “${name}” 吗？此操作不可撤销。`)) {
            logger('warn', 'PokedexStore', `Attempting to delete entry: [${type}] ${name}`);
            let success = false;
            if (type === '成就') {
                success = await pokedexManager.deleteAchievement(name);
            } else {
                success = await pokedexManager.deletePokedexEntry(type, name);
            }
            if (success) {
                await refreshAllData();
            }
        }
    };

    const injectEntries = async (selectedItems: { type: PokedexType, name: string }[]) => {
        if (selectedItems.length === 0) {
            toastr.warning('请至少选择一个要注入的条目。');
            return;
        }
        logger('log', 'PokedexStore', `Injecting ${selectedItems.length} entries to current message...`, selectedItems);

        const pokedexManager = getPokedexManager();
        const selectedEntries: { [key in PokedexType]?: PokedexEntry[] } = {};
        const pokedexData = await pokedexManager.getPokedexData();

        selectedItems.forEach(item => {
            const entry = pokedexData[item.type].find(e => e.名称 === item.name);
            if (entry) {
                if (!selectedEntries[item.type]) {
                    selectedEntries[item.type] = [];
                }
                selectedEntries[item.type]!.push(entry);
            }
        });

        if (_.isEmpty(selectedEntries)) return;

        const floorId = appStore.floorId;
        try {
            const options = { type: 'message', message_id: floorId };
            const currentVars = getVariables(options) || {};
            const newVars = _.cloneDeep(currentVars);

            logger('log', 'PokedexStore', `Updating message [${floorId}] variables. Current 图鉴:`, _.get(newVars, '世界.图鉴'));
            for (const [type, entries] of Object.entries(selectedEntries)) {
                const path = `世界.图鉴.${type}`;
                const existingEntries = _.get(newVars, path, []);
                // Use a Set for efficient checking of existing names
                const existingNames = new Set(existingEntries.map((e: PokedexEntry) => e.名称));
                const newEntries = entries.filter(e => !existingNames.has(e.名称));
                if (newEntries.length > 0) {
                    _.set(newVars, path, [...existingEntries, ...newEntries]);
                    logger('info', 'PokedexStore', `Injecting ${newEntries.length} new entries into ${type}.`, newEntries);
                }
            }
            logger('log', 'PokedexStore', `Message [${floorId}] variables after update:`, _.get(newVars, '世界.图鉴'));
            
            await replaceVariables(newVars, options);

            toastr.success(`成功注入 ${selectedItems.length} 个条目到当前楼层！`);
            closeManagerModal();
        } catch (error) {
            logger('error', 'PokedexStore', 'Failed to inject entries.', error);
            toastr.error('注入条目失败。');
        }
    };

    const createOrUpdateEntry = async (
        type: PokedexType | '成就',
        entry: PokedexEntry,
        originalName?: string
    ) => {
        const pokedexManager = getPokedexManager();
        const isUpdate = !!originalName;
        logger('log', 'PokedexStore', `${isUpdate ? 'Updating' : 'Creating'} entry...`, { type, entry, originalName });
        if (isUpdate) {
            if (type === '成就') {
                await pokedexManager.updateAchievement(originalName, entry);
            } else {
                await pokedexManager.updatePokedexEntry(type as PokedexType, originalName, entry);
            }
            toastr.success(`成功更新条目: ${entry.名称}`);
        } else if (type === '成就') {
            await pokedexManager.createAchievement(entry);
        } else {
            await pokedexManager.createPokedexEntry(type as PokedexType, entry);
        }
        await refreshAllData();
    };

    const editPokedexEntry = (type: PokedexType | '成就', name: string) => {
        const detailsStore = useDetailsStore();
        const eventLogStore = useEventLogStore();
        const appStore = useAppStore();

        let entry;
        if (type === '成就') {
            entry = achievements.value.find(a => a.名称 === name);
        } else {
            entry = worldStore.world?.图鉴?.[type]?.find((e: PokedexEntry) => e.名称 === name);
        }

        if (!entry) {
            toastr.error(`在 ${type} 中未找到名为 "${name}" 的条目。`);
            return;
        }

        const saveCallback = async (updatedData: PokedexEntry) => {
            const newEvent = {
                eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                sourceMessageId: String(appStore.floorId),
                type: '图鉴条目更新',
                payload: {
                    type: type,
                    originalName: name,
                    updatedData: updatedData,
                },
            };
            await eventLogStore.addEvents([newEvent]);
            // The watcher will handle the actual update and persistence.
        };

        detailsStore.showDetails(entry, saveCallback);
    };

    // --- REMOTE SYNC ACTIONS ---

    const calculateLocalDiff = async () => {
        const pokedexManager = getPokedexManager();
        isLoading.value = true;
        logger('log', 'PokedexStore', 'Calculating local diff...');
        const localPokedex = await pokedexManager.getPokedexData();
        const localAchievements = await pokedexManager.getAchievements();
        const remote = remoteDataCache || await pokedexManager.getRemotePokedex();
        if (remote) remoteDataCache = remote;

        const diffs: DiffItem[] = [];
        const types: ShareableType[] = ['妖兽', '植物', '物品', '成就'];

        types.forEach(type => {
            const localEntries = type === '成就' ? localAchievements : localPokedex[type as PokedexType];
            const remoteEntries = remote ? (remote[type as keyof RemotePokedexData] || []) : [];
            const remoteNames = new Set(remoteEntries.map((e: PokedexEntry) => e.名称));
            const diffEntries = localEntries.filter((e: PokedexEntry) => !remoteNames.has(e.名称));
            diffEntries.forEach(entry => diffs.push({ type, entry, selected: false }));
        });
        localDiff.value = diffs;
        logger('info', 'PokedexStore', `Found ${diffs.length} local entries not on remote.`);
        isLoading.value = false;
    };

    const calculateRemoteDiff = async () => {
        const pokedexManager = getPokedexManager();
        isLoading.value = true;
        logger('log', 'PokedexStore', 'Calculating remote diff...');
        const localPokedex = await pokedexManager.getPokedexData();
        const localAchievements = await pokedexManager.getAchievements();
        const remote = await pokedexManager.getRemotePokedex();
        if (!remote) {
            toastr.error('获取社区图鉴失败。');
            isLoading.value = false;
            return;
        }
        remoteDataCache = remote;

        const diffs: DiffItem[] = [];
        const types: ShareableType[] = ['妖兽', '植物', '物品', '成就'];

        types.forEach(type => {
            const localEntries = type === '成就' ? localAchievements : localPokedex[type as PokedexType];
            const localNames = new Set(localEntries.map((e: PokedexEntry) => e.名称));
            const remoteEntries = remote[type as keyof RemotePokedexData] || [];
            const diffEntries = remoteEntries.filter((e: PokedexEntry) => !localNames.has(e.名称));
            diffEntries.forEach(entry => diffs.push({ type, entry, selected: false }));
        });
        remoteDiff.value = diffs;
        logger('info', 'PokedexStore', `Found ${diffs.length} remote entries not in local.`);
        isLoading.value = false;
    };

    const submitToRemote = async (items: { type: ShareableType, name: string }[]) => {
        const pokedexManager = getPokedexManager();
        const localPokedex = await pokedexManager.getPokedexData();
        const localAchievements = await pokedexManager.getAchievements();
        let successCount = 0;

        for (const item of items) {
            const entry = item.type === '成就'
                ? localAchievements.find((e: PokedexEntry) => e.名称 === item.name)
                : localPokedex[item.type as PokedexType].find((e: PokedexEntry) => e.名称 === item.name);
            
            if (entry) {
                await pokedexManager.submitToHuggingFace(item.type, entry, providerName.value || undefined);
                successCount++;
            }
        }
        
        if (successCount > 0) {
            toastr.success(`成功分享了 ${successCount} 个条目！`);
            remoteDataCache = null; // Invalidate cache
            await calculateLocalDiff();
        }
    };

    const importFromRemote = async (items: { type: ShareableType, name: string }[]) => {
        if (!remoteDataCache) {
            toastr.error('远程数据缓存丢失，请重新获取。');
            return;
        }
        const pokedexManager = getPokedexManager();
        let successCount = 0;
        for (const item of items) {
            const entry = (remoteDataCache[item.type as keyof RemotePokedexData] || []).find((e: PokedexEntry) => e.名称 === item.name);
            if (entry) {
                const success = item.type === '成就'
                    ? await pokedexManager.createAchievement(entry)
                    : await pokedexManager.createPokedexEntry(item.type as PokedexType, entry);
                if (success) successCount++;
            }
        }

        if (successCount > 0) {
            toastr.success(`成功导入了 ${successCount} 个新条目！`);
            closeRemoteSyncModal();
            await refreshAllData(); // Refresh main view
        }
    };


    // Watch for new events from the event log to handle state recalculation and live updates
    const handlePokedexCompletion = async (eventsToProcess: GameEvent[]) => {
        // Use a local, async function with dynamic import to completely break the dependency cycle.
        // 循环依赖警告：暂时移除
        // const getStoryStore = async () => {
        //     const { useStoryStore } = await import('../ui/storyStore');
        //     return useStoryStore();
        // };

        const getSettingsStore = async () => {
            const { useSettingsStore } = await import('../ui/settingsStore');
            return useSettingsStore();
        };

        const settingsStore = await getSettingsStore();
        if (!settingsStore.settings.autoCompletePokedex) {
            return;
        }

        const itemEvents = eventsToProcess.filter(e => e.type === '物品变化' && e.payload.获得);
        if (itemEvents.length === 0) return;

        const newPokedexEventNames = new Set(
            eventsToProcess
                .filter(e => e.type === '新图鉴发现')
                .flatMap(e => {
                    const data = e.payload.数据;
                    return Array.isArray(data) ? data.map(d => d.名称) : [data.名称];
                })
        );

        const itemsToComplete: string[] = [];
        for (const event of itemEvents) {
            for (const item of event.payload.获得) {
                const isKnown = worldStore.world?.图鉴?.物品?.some((entry: PokedexEntry) => entry.名称 === item.名称);
                if (!isKnown && !newPokedexEventNames.has(item.名称)) {
                    itemsToComplete.push(item.名称);
                }
            }
        }

        if (itemsToComplete.length === 0) return;

        logger('warn', 'PokedexStore', `[Auto Completion] Found ${itemsToComplete.length} items missing pokedex entries.`, itemsToComplete);
        toastr.info(`检测到 ${itemsToComplete.length} 个缺失的图鉴条目，将在5秒后尝试后台补全...`);

        setTimeout(async () => {
            logger('warn', 'PokedexStore', `[Auto Completion] Starting delayed completion for ${itemsToComplete.length} items.`);
            // Use a local, async function with dynamic import to completely break the dependency cycle for ESLint's static analysis.
            // const getStoryContext = async (): Promise<string> => {
            //     try {
            //         const storyStore = await getStoryStore();
            //         return storyStore.editText;
            //     } catch (e) {
            //         logger('error', 'PokedexStore', 'Failed to dynamically import storyStore', e);
            //         return '无'; // Fallback context
            //     }
            // };

            const contextSummary = '无'; // 暂时使用默认值

            for (const itemName of itemsToComplete) {
                try {
                    const prompt = `你是一个游戏世界设定生成器。请为一个名为“${itemName}”的物品生成图鉴条目。
                    当前的游戏背景摘要是：${contextSummary}
                    请严格按照以下JSON格式返回，不要包含任何额外的解释或Markdown标记：
                    { "类型": "物品", "数据": { "名称": "${itemName}", "品阶": "凡品下阶", "描述": "...", "价值": { "基础价值": 3, "价值标签": ["..."] } } }`;

                    const responseJson = await generateWithSecondaryApi({
                        method: 'generateRaw',
                        config: {
                            user_input: prompt,
                            ordered_prompts: ['user_input'],
                        },
                        profileId: settingsStore.settings.pokedexCompletionProfileId || undefined,
                    });

                    logger('warn', 'PokedexStore', `[Auto Completion] Raw LLM Response for "${itemName}":`, responseJson);
                    const completionDataArray = sanitizeAndParsePokedexArray(responseJson);
                    if (completionDataArray.length === 0) {
                        throw new Error('LLM did not return a valid JSON object or array.');
                    }
                    // The function is designed to return a single object in a prompt.
                    // sanitizeAndParsePokedexArray might wrap it in an array. We take the first valid element.
                    const completionData = completionDataArray[0];
                    if (!completionData || !completionData.类型 || !completionData.数据) {
                        throw new Error('Parsed LLM response is missing required fields (类型/数据).');
                    }
                    const newEvent: GameEvent = {
                        eventId: `evt_auto_${Date.now()}_${itemName}`,
                        sourceMessageId: String(appStore.floorId),
                        type: '新图鉴发现',
                        payload: completionData, // This should now be a single object { 类型, 数据 }
                    };

                    await eventLogStore.addEvents([newEvent]);
                    logger('info', 'PokedexStore', `[Auto Completion] Successfully generated and injected pokedex entry for "${itemName}".`);
                    toastr.success(`成功补全图鉴条目：“${itemName}”！`);
                } catch (error) {
                    logger('error', 'PokedexStore', `[Auto Completion] Failed to complete pokedex entry for "${itemName}".`, error);
                    toastr.error(`后台补全图鉴条目“${itemName}”失败。`);
                }
            }
        }, 5000);
    };

    watch(() => eventLogStore.allEvents, (newEvents, oldEvents) => {
        if (oldEvents === undefined || newEvents.length < oldEvents.length) {
            lastProcessedEventIndex.value = -1;
            logger('info', 'PokedexStore', '[Event Watcher] Event list has been reset. Recalculation mode activated.');
        }

        const eventsToProcess = newEvents.slice(lastProcessedEventIndex.value + 1);
        if (eventsToProcess.length === 0) return;

        logger('log', 'PokedexStore', `[Event Watcher] Processing ${eventsToProcess.length} new events.`);
        
        // The actual state update is now handled by worldStore's watcher.
        // This watcher remains to trigger side effects that don't directly modify the world state,
        // such as auto-completion.

        // The actual state update is now handled by worldStore's watcher.
        // This watcher remains to trigger side effects that don't directly modify the world state,
        // such as auto-completion.

        // The actual state update is now handled by worldStore's watcher.
        // This watcher remains to trigger side effects that don't directly modify the world state,
        // such as auto-completion.
        
        if (!isRecalculating.value) {
            handlePokedexCompletion(eventsToProcess);
        }

        lastProcessedEventIndex.value = newEvents.length - 1;
    }, { deep: true, immediate: true });

    async function handlePokedexEvent(event: GameEvent, worldState: any) {
       if (event.type === '图鉴条目更新') {
          logger('info', 'PokedexStore', 'Processing "图鉴条目更新" event via worldStore handler:', event);
          const { type, originalName, updatedData } = event.payload;
          // This still calls a method that modifies global state directly, which is correct for meta-operations.
          await createOrUpdateEntry(type, updatedData, originalName);
       }
    }

    // This watcher is removed to prevent re-initialization from overwriting event-driven state.
    // The state should be built SOLELY from the event log after the initial load.
    // watch(() => events.variablesSynced, () => {
    //     logger('info', 'PokedexStore', 'variablesSynced event received, fetching chat pokedex data.');
    //     initialize();
    // }, { deep: true });


    return {
        // Pure Getters
        allEntries,
        knownEntries,
        getEntriesByType,
        discoveryProgress,

        // State
        isManagerModalOpen,
        isRemoteSyncModalOpen,
        isRewardsModalOpen,
        globalPokedex,
        achievements,
        achievementPoints,
        newDiscoveries,
        pendingReviewItems,
        localDiff,
        remoteDiff,
        isLoading,
        managerTab,
        addMode,
        remoteSyncTab,
        providerName,
        lastProcessedEventIndex,

        // Actions
        openManagerModal,
        closeManagerModal,
        openRemoteSyncModal,
        closeRemoteSyncModal,
        refreshAllData,
        initialize,
        handlePokedexEvent,
        approveDiscoveries,
        approvePendingItem,
        deleteEntry,
        injectEntries,
        createOrUpdateEntry, // Expose for spying in tests
        editPokedexEntry,
        calculateLocalDiff,
        calculateRemoteDiff,
        submitToRemote,
        importFromRemote,
        updatePowerSystemNameInPokedex,
        scanAndCompleteMissingPokedex,
    };

    async function scanAndCompleteMissingPokedex() {
        logger('info', 'PokedexStore', 'Starting scan for missing pokedex entries...');
        
        // Use dynamic imports to avoid cycle dependencies at the module level
        const { useSettingsStore } = await import('../ui/settingsStore');
        const settingsStore = useSettingsStore();
        const itemStore = useItemStore();

        if (!settingsStore.settings.autoCompletePokedex) {
            logger('info', 'PokedexStore', 'Auto-completion is disabled. Aborting scan.');
            return;
        }

        const allPlayerItems = itemStore.items;
        const knownPokedexItems = new Set(worldStore.world?.图鉴?.物品?.map((item: PokedexEntry) => item.名称));
        
        const missingItems = allPlayerItems.filter((playerItem: any) => !knownPokedexItems.has(playerItem.名称));

        if (missingItems.length === 0) {
            logger('info', 'PokedexStore', 'No missing pokedex entries found.');
            toastr.info('图鉴数据完整，无需补全。');
            return;
        }

        logger('warn', 'PokedexStore', `Found ${missingItems.length} missing entries.`, missingItems.map((item: any) => item.名称));
        toastr.info(`发现 ${missingItems.length} 个缺失的图鉴条目，将在5秒后尝试后台批量补全...`);

        setTimeout(async () => {
            const { summary, recentHistory } = await getGenerationContext();
            const itemNamesList = missingItems.map((playerItem: any) => `- ${playerItem.名称}`).join('\n');

            const prompt = `你是一个严谨的游戏数据生成器。你的任务是为给定的物品名称列表生成对应的图鉴条目。你必须严格按照用户指定的JSON格式返回一个数组，不能包含任何额外的解释、注释或Markdown标记。

<过往剧情摘要>
${summary}
</过往剧情摘要>

<近期对话历史>
${recentHistory}
</近期对话历史>

物品列表:
${itemNamesList}

请严格根据以上背景故事，为列表中的所有物品生成符合当前世界观和剧情氛围的图鉴条目。
**核心要求：智能分类**
首先，你需要根据事物的名称和下面的背景故事，判断它最可能属于哪个图鉴类型。可用的类型有：["妖兽", "植物", "物品", "书籍"]。
例如，“《元初草木图鉴》”应被分类为“书籍”，“龙血草”应被分类为“植物”。

请严格按照以下JSON格式返回一个包含所有物品图鉴条目的JSON数组：
[
  {
    "类型": "...",
    "数据": {
      "名称": "物品名称1",
      "品阶": "...",
      "描述": "...",
      "价值": { "基础价值": ..., "价值标签": ["..."] }
    }
  }
]`;

            try {
                const responseJson = await generateWithSecondaryApi({
                    method: 'generateRaw',
                    config: {
                        user_input: prompt,
                        ordered_prompts: ['user_input'],
                    },
                    profileId: settingsStore.settings.pokedexCompletionProfileId || undefined,
                });

                logger('warn', 'PokedexStore', `[Scan] Raw LLM Response for batch completion:`, responseJson);
                const completionDataArray = sanitizeAndParsePokedexArray(responseJson);

                if (!Array.isArray(completionDataArray) || completionDataArray.length === 0) {
                    throw new Error('LLM did not return a valid JSON array.');
                }

                const newEvents: GameEvent[] = completionDataArray.map(item => ({
                    eventId: `evt_scan_complete_${Date.now()}_${item.数据?.名称 || 'unknown'}`,
                    sourceMessageId: String(appStore.floorId),
                    type: '新图鉴发现',
                    payload: {
                        类型: item.类型 || '物品', // Fallback to '物品' if type is missing
                        数据: item.数据,
                    },
                }));

                if (newEvents.length > 0) {
                    await eventLogStore.addEvents(newEvents);
                }
                logger('info', 'PokedexStore', `[Scan] Successfully generated and injected ${completionDataArray.length} pokedex entries.`);
                toastr.success(`成功补全了 ${completionDataArray.length} 个图鉴条目！`);

            } catch (error) {
                logger('error', 'PokedexStore', `[Scan] Failed to complete pokedex entries.`, error);
                toastr.error('后台批量补全图鉴失败。');
            }
        }, 5000);
    }
});
