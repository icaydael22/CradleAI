import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import _ from 'lodash';
import { logger } from '../../core/logger';
import { useApiProfileStore } from '../app/apiProfileStore';
import { getVariables, updateVariables } from '../../core/variables';
import { useWorldStore } from '../core/worldStore';
import { useHistoryStore } from '../ui/historyStore';
import { analyzeSingleEntry, analyzeAllEntries, analyzeUnlearnedEntries } from '../../modules/smartContext/contextLinker';
import { useSearchStore } from './searchStore';
import type { MessagePage } from '../../core/history';

// Zod schemas can be added here for validation if needed

export const useSmartContextStore = defineStore('smartContext', () => {
  // --- STATE ---
  const knowledgeStats = ref<any>({});
  const linkerProfile = ref<any>({});
  const lastUserInput = ref('');
  const worldStore = useWorldStore();
  const historyStore = useHistoryStore();
  
  // Main settings
  const isEnabled = ref(false);
  const selectedApiProfileId = ref<string | null>(null);
  const disabledAtTurn = ref<number | null>(null);
  const isAnalyzingAll = ref(false);

  const apiProfileStore = useApiProfileStore();

  const injectionParams = ref({
    highFreqThreshold: 10,
    mediumFreqThreshold: 3,
    mediumFreqCooldown: 3,
    lowFreqCooldown: 10,
  });

  // --- ACTIONS ---

  /**
   * Initializes or updates the store's state from the main variables object.
   * This is now primarily for loading settings, as the core state is rebuilt from history.
   */
  async function updateStatsFromVariables() {
    const vars = await getVariables({ type: 'chat' });
    // knowledgeStats and linkerProfile are now derived from history, not loaded directly.
    
    const mainSettings = _.get(vars, 'plugin_storage.smart_context_main', {});
    isEnabled.value = mainSettings.isEnabled ?? false;
    selectedApiProfileId.value = mainSettings.selectedApiProfileId ?? null;
    disabledAtTurn.value = mainSettings.disabledAtTurn ?? null;

    const savedParams = _.get(vars, 'plugin_storage.smart_context_params');
    if (savedParams) {
      injectionParams.value = { ...injectionParams.value, ...savedParams };
    }
    logger('log', 'smartContextStore', 'Stats, profile, and settings updated from variables.');
  }

  /**
   * Updates the injection parameters and saves them to variables.
   * @param params Partial object of parameters to update.
   */
  async function updateInjectionParams(params: Partial<typeof injectionParams.value>) {
    injectionParams.value = { ...injectionParams.value, ...params };
    const vars = await getVariables({ type: 'chat' });
    _.set(vars, 'plugin_storage.smart_context_params', injectionParams.value);
    await updateVariables({ 'plugin_storage': vars.plugin_storage });
    logger('log', 'smartContextStore', 'Injection parameters updated.', injectionParams.value);
  }

  async function persistMainSettings() {
    const settings = {
      isEnabled: isEnabled.value,
      selectedApiProfileId: selectedApiProfileId.value,
      disabledAtTurn: disabledAtTurn.value,
    };
    const vars = await getVariables({ type: 'chat' });
    _.set(vars, 'plugin_storage.smart_context_main', settings);
    await updateVariables({ 'plugin_storage': vars.plugin_storage });
    logger('log', 'smartContextStore', 'Main settings persisted.', settings);
  }

  async function setEnabled(enabled: boolean) {
    isEnabled.value = enabled;
    const currentTurn = historyStore.turns.length;
    if (!enabled) {
      disabledAtTurn.value = currentTurn;
      logger('log', 'smartContextStore', `Disabled at turn ${currentTurn}.`);
    } else {
      if (disabledAtTurn.value !== null) {
        const turnsMissed = currentTurn - disabledAtTurn.value;
        if (turnsMissed > 0) {
          toastr.info(`智能上下文已重新启用。错过了 ${turnsMissed} 回合的自动学习。`);
        }
      }
      disabledAtTurn.value = null;

      // Cold-start: 当首次启用或重新启用时，执行一次“未学习条目”的初始语义学习
      const profileIdToUse = apiProfileIdToUse.value;
      if (!profileIdToUse) {
        // 没有选择或激活任何次级LLM配置时，提示但不阻塞启用
        toastr.warning('智能上下文已启用，但未选择用于学习的次级LLM配置，已跳过初始学习。请在上方选择一个配置后，点击“立即更新所有条目”。');
      } else if (!isAnalyzingAll.value) {
        isAnalyzingAll.value = true;
        try {
          toastr.info('智能上下文已启用，正在进行一次初始关键词学习（仅针对未学习的条目）...');
          await analyzeUnlearnedEntries();
          await updateStatsFromVariables();
          logger('log', 'smartContextStore', 'Cold-start initial learning finished.');
        } catch (error) {
          logger('error', 'smartContextStore', 'Error during cold-start initial learning:', error);
          toastr.error('初始学习失败，请检查次级LLM配置或网络。');
        } finally {
          isAnalyzingAll.value = false;
        }
      } else {
        toastr.info('初始学习任务已在进行中。');
      }
    }
    await persistMainSettings();
  }

  async function setApiProfileId(profileId: string | null) {
    selectedApiProfileId.value = profileId;
    await persistMainSettings();
  }

  /**
   * Triggers a forced, on-demand analysis for a single knowledge entry.
   * @param entryId The full ID of the entry to analyze.
   */
  async function forceAnalyzeEntry(entryId: string) {
    try {
      await analyzeSingleEntry(entryId);
      // After analysis, refresh the linker profile to reflect changes
      await updateStatsFromVariables();
    } catch (error) {
      logger('error', 'smartContextStore', `Error during force analysis of ${entryId}:`, error);
      toastr.error(`分析条目 ${entryId} 时发生错误。`);
    }
  }

  async function forceAnalyzeAllEntries() {
    if (isAnalyzingAll.value) {
      toastr.warning('分析已经在进行中。');
      return;
    }
    isAnalyzingAll.value = true;
    try {
      await analyzeAllEntries();
      await updateStatsFromVariables();
    } catch (error) {
      logger('error', 'smartContextStore', 'Error during force analysis of all entries:', error);
      toastr.error('分析所有条目时发生错误。');
    } finally {
      isAnalyzingAll.value = false;
    }
  }

  /**
   * Processes the latest user input to find and track knowledge references.
   * This replaces the logic from promptManager.findAndTrackKnowledgeReferences.
   * @param userInput The user's input string.
   */
  function processUserInput(userInput: string) {
    lastUserInput.value = userInput;
    const searchStore = useSearchStore();
    searchStore.search('knowledge', userInput);

    // The stats are now updated in memory during the live session.
    // During a state recalculation, rebuildStateFromHistory will handle this deterministically.
    const referencedIds = referencedIdsThisTurn.value;
    if (referencedIds.size === 0) {
      return;
    }

    const newStats = _.cloneDeep(knowledgeStats.value);
    referencedIds.forEach(id => {
      if (!newStats[id]) {
        newStats[id] = { frequency: 0, lastSentTurn: -999 };
      }
      newStats[id].frequency = (newStats[id].frequency || 0) + 1;
    });
    knowledgeStats.value = newStats;
    // Persistence is removed, as this is now a derived state.
  }

  /**
   * Rebuilds the entire state of the store from a given history.
   * This is the core of making the plugin compatible with state recalculation.
   * @param messages The list of message pages to process.
   */
  function rebuildStateFromHistory(messages: MessagePage[]) {
    const newLinkerProfile: { [key: string]: any } = {};
    const newKnowledgeStats: { [key: string]: any } = {};
    let turnCounter = 0;

    // Helper to build a keyword map on the fly based on the current state of the profile being rebuilt.
    // This is crucial for handling the chronological nature of history.
    const calculateTempKeywordsMap = (profile: any) => {
      const keywordMap = new Map<string, Set<string>>();
      const allEntries = worldStore.world?.图鉴;
      if (!allEntries) return keywordMap;

      const addKeyword = (keyword: string, id: string) => {
        if (!keywordMap.has(keyword)) keywordMap.set(keyword, new Set());
        keywordMap.get(keyword)!.add(id);
      };

      for (const type in allEntries) {
        if (Object.prototype.hasOwnProperty.call(allEntries, type)) {
          const entries = (allEntries as any)[type];
          for (const entry of entries) {
            const entryId = `世界.图鉴.${type}.${entry.名称}`;
            addKeyword(entry.名称, entryId);
            const entryProfile = profile[entryId];
            if (entryProfile && entryProfile.dynamicKeywords) {
              entryProfile.dynamicKeywords.forEach((k: string) => addKeyword(k, entryId));
            }
          }
        }
      }
      return keywordMap;
    };

    for (const message of messages) {
      if (message.role === 'user') {
        turnCounter++;
        // IMPORTANT: We must calculate the keyword map based on the *current state* of the rebuilding profile.
        const currentKeywordMap = calculateTempKeywordsMap(newLinkerProfile);
        const tempReferencedIds = new Set<string>();
        if (message.content) {
          for (const [keyword, entryIds] of currentKeywordMap.entries()) {
            if (message.content.includes(keyword)) {
              entryIds.forEach(id => tempReferencedIds.add(id));
            }
          }
        }
        
        tempReferencedIds.forEach(id => {
          if (!newKnowledgeStats[id]) {
            newKnowledgeStats[id] = { frequency: 0, lastSentTurn: -999 };
          }
          newKnowledgeStats[id].frequency++;
        });
      }

      if (message.pluginEvents) {
        for (const event of message.pluginEvents) {
          if (event.type === 'ContextLinkerRan') {
            const linkerEvent = event; // Type assertion
            const updatesMap = new Map(linkerEvent.updates.map(u => [u.id, u.newKeywords]));
            for (const entryId of linkerEvent.analyzedIds) {
              const entryProfile = newLinkerProfile[entryId] || { dynamicKeywords: [], missCount: 0 };
              const newKeywords = updatesMap.get(entryId);

              entryProfile.lastAnalyzedTurn = linkerEvent.turn;
              if (newKeywords && newKeywords.length > 0) {
                entryProfile.dynamicKeywords = _.uniq([...entryProfile.dynamicKeywords, ...newKeywords]);
                entryProfile.missCount = 0;
              } else {
                entryProfile.missCount = (entryProfile.missCount || 0) + 1;
              }
              newLinkerProfile[entryId] = entryProfile;
            }
          }
        }
      }
    }

    linkerProfile.value = newLinkerProfile;
    knowledgeStats.value = newKnowledgeStats;
    logger('log', 'smartContextStore', 'State rebuilt from history.');
  }

  // --- GETTERS ---

  /**
   * A computed map of all keywords for efficient searching.
   * Maps a keyword string to a Set of Pokedex entry IDs.
   */
  const allKeywordsMap = computed(() => {
    const keywordMap = new Map<string, Set<string>>();
    const allEntries = worldStore.world?.图鉴;

    if (!allEntries) return keywordMap;

    // Helper to add a keyword to the map
    const addKeyword = (keyword: string, id: string) => {
      if (!keywordMap.has(keyword)) {
        keywordMap.set(keyword, new Set());
      }
      keywordMap.get(keyword)!.add(id);
    };

    // Process all entries from the player's discovered pokedex
    for (const type in allEntries) {
      if (Object.prototype.hasOwnProperty.call(allEntries, type)) {
        const entries = (allEntries as any)[type];
        for (const entry of entries) {
          const entryId = `世界.图鉴.${type}.${entry.名称}`;
          
          // Add the entry name itself as a keyword
          addKeyword(entry.名称, entryId);

          // Add dynamic keywords from the linker profile
          const profile = linkerProfile.value[entryId];
          if (profile && profile.dynamicKeywords) {
            for (const keyword of profile.dynamicKeywords) {
              addKeyword(keyword, entryId);
            }
          }
        }
      }
    }
    
    logger('log', 'smartContextStore', `allKeywordsMap recalculated, found ${keywordMap.size} unique keywords.`);
    return keywordMap;
  });

  /**
   * A computed set of knowledge IDs that are directly referenced in the last user input.
   */
  const referencedIdsThisTurn = computed(() => {
    const searchStore = useSearchStore();
    const results = searchStore.search('knowledge', lastUserInput.value);
    
    // Apply a score threshold to filter for high-relevance items.
    // This threshold can be made configurable in the future.
    const relevantResults = results
      .filter(result => result.score < 0.4)
      .map(result => result.item.id);

    const ids = new Set<string>(relevantResults);

    if (ids.size > 0) {
      logger('log', 'smartContextStore', `Found ${ids.size} referenced knowledge IDs via fuzzy search.`, Array.from(ids));
    }
    
    return ids;
  });

  /**
   * The core computed property that determines which knowledge entries to inject.
   */
  const injectedKnowledge = computed(() => {
    const toInject = new Map<string, any>();
    const currentTurn = historyStore.turns.length;

    // 1. Force inject entries referenced this turn
    referencedIdsThisTurn.value.forEach(id => {
      const entry = findPokedexEntryById(id);
      if (entry) {
        toInject.set(id, entry);
      }
    });

    // 2. Frequency inject other entries
    for (const id in knowledgeStats.value) {
      if (toInject.has(id)) continue; // Already added

      const stats = knowledgeStats.value[id];
      const freq = stats.frequency || 0;
      const lastSent = stats.lastSentTurn || -999;
      const params = injectionParams.value;

      let shouldInject = false;
      if (freq > params.highFreqThreshold) { // High frequency
        shouldInject = true;
      } else if (freq > params.mediumFreqThreshold && currentTurn - lastSent > params.mediumFreqCooldown) { // Medium frequency
        shouldInject = true;
      } else if (freq <= params.mediumFreqThreshold && currentTurn - lastSent > params.lowFreqCooldown) { // Low frequency
        shouldInject = true;
      }

      if (shouldInject) {
        const entry = findPokedexEntryById(id);
        if (entry) {
          toInject.set(id, entry);
        }
      }
    }
    
    // Update lastSentTurn for all injected entries
    if (toInject.size > 0) {
      const newStats = _.cloneDeep(knowledgeStats.value);
      toInject.forEach((_, id) => {
        if (newStats[id]) {
          newStats[id].lastSentTurn = currentTurn;
        }
      });
      knowledgeStats.value = newStats;
      // Persistence is removed.
    }

    const result = Array.from(toInject.values());
    logger('log', 'smartContextStore', `injectedKnowledge recalculated. Injecting ${result.length} entries.`);
    return result;
  });

  /**
   * A computed object providing detailed injection status for each knowledge entry.
   * Useful for debugging and UI display.
   */
  const apiProfileIdToUse = computed(() => {
    return selectedApiProfileId.value ?? apiProfileStore.activeProfileId;
  });

  const injectionProbabilityTable = computed(() => {
    const table: { [id: string]: { freq: number; lastSent: number; status: string; reason: string } } = {};
    const currentTurn = historyStore.turns.length;
    const params = injectionParams.value;

    for (const id in knowledgeStats.value) {
      const stats = knowledgeStats.value[id];
      const freq = stats.frequency || 0;
      const lastSent = stats.lastSentTurn || -999;
      let status = 'Idle';
      let reason = '';

      if (referencedIdsThisTurn.value.has(id)) {
        status = 'Injecting';
        reason = '强制注入 (本回合被引用)';
      } else if (freq > params.highFreqThreshold) {
        status = 'Injecting';
        reason = `高频注入 (>${params.highFreqThreshold})`;
      } else if (freq > params.mediumFreqThreshold && currentTurn - lastSent > params.mediumFreqCooldown) {
        status = 'Injecting';
        reason = `中频注入 (冷却完毕, >${params.mediumFreqCooldown}回合)`;
      } else if (freq > params.mediumFreqThreshold) {
        status = 'Cooling Down';
        reason = `中频冷却中 (还需${params.mediumFreqCooldown - (currentTurn - lastSent) + 1}回合)`;
      } else if (currentTurn - lastSent > params.lowFreqCooldown) {
        status = 'Injecting';
        reason = `低频注入 (冷却完毕, >${params.lowFreqCooldown}回合)`;
      } else {
        status = 'Cooling Down';
        reason = `低频冷却中 (还需${params.lowFreqCooldown - (currentTurn - lastSent) + 1}回合)`;
      }
      table[id] = { freq, lastSent, status, reason };
    }
    return table;
  });

  // --- Helper Functions ---

  /**
   * A pure function to get referenced IDs for a given input string.
   * Used by both live processing and history rebuilding.
   */
  /**
   * A pure function to get referenced IDs for a given input string.
   * Used by both live processing and history rebuilding.
   * @deprecated This function is problematic for history rebuilding due to its reliance on a computed property.
   * The logic is now inlined within `rebuildStateFromHistory` for chronological accuracy.
   */
  function getReferencedIdsForInput(input: string): Set<string> {
    const ids = new Set<string>();
    if (!input || allKeywordsMap.value.size === 0) {
      return ids;
    }
    for (const [keyword, entryIds] of allKeywordsMap.value.entries()) {
      if (input.includes(keyword)) {
        entryIds.forEach(id => ids.add(id));
      }
    }
    return ids;
  }

  function findPokedexEntryById(id: string) {
    const parts = id.split('.');
    if (parts.length < 4) return null;
    const type = parts[2];
    const name = parts.slice(3).join('.');
    
    const entries = (worldStore.world?.图鉴 as any)?.[type];
    if (entries) {
      return entries.find((e: any) => e.名称 === name) || null;
    }
    return null;
  }


  return {
    // State
    knowledgeStats,
    linkerProfile,
    lastUserInput,
    isEnabled,
    selectedApiProfileId,
    disabledAtTurn,
    isAnalyzingAll,
    injectionParams,
    // Actions
    updateStatsFromVariables,
    processUserInput,
    rebuildStateFromHistory,
    updateInjectionParams,
    forceAnalyzeEntry,
    forceAnalyzeAllEntries,
    setEnabled,
    setApiProfileId,
    // Getters
    apiProfileIdToUse,
    allKeywordsMap,
    referencedIdsThisTurn,
    injectedKnowledge,
    injectionProbabilityTable,
  };
});
