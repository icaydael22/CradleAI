/**
 * @file 状态更新器 (StateUpdater)
 * @description 包含处理来自LLM的事件并更新应用状态的核心逻辑。
 */

import { logger } from './logger';
import { findNonCloneable } from '../core/utils';
import {
  normalizeEvent,
  getVariables,
  getRecalculationInputs,
  overwriteAllChatVariables,
  saveStateSnapshot,
  GameEvent,
} from './variables';
import { emit } from './reactiveMessageBus';
import { useEventLogStore } from '../stores/core/eventLogStore';
import { ChatHistoryManager } from './history';
import { isRecalculating } from './state';
import { useCharacterStore } from '../stores/facades/characterStore';
import { useWorldStore } from '../stores/core/worldStore';
// import { useTimeStore } from '../stores/systems/timeStore';
// import { useWeatherStore } from '../stores/systems/weatherStore';
// import { useShelterStore } from '../stores/systems/shelterStore';
// import { useItemStore } from '../stores/facades/itemStore';

// @ts-ignore
declare const _: any;
// @ts-ignore
declare const toastr: any;
// @ts-ignore
declare const getChatMessages: () => Promise<Array<{ id: string; role: 'user' | 'assistant'; content: string; variables?: any }>>;

/**
 * 同步变量的主函数。它将新消息产生的事件分发给 EventManager。
 * @param statusbarData - 从状态栏解析出的完整JSON对象。
 * @param messageId - 生成此状态栏的消息的唯一ID。
 */
export async function syncVariables(statusbarData: any, messageId: string, worldStoreInstance?: any, eventLogStoreInstance?: any) {
  ////console.log("statusbarData and messageId",statusbarData,messageId)
  if (!statusbarData || !messageId) {
    //console.log("No statusbarData and messageId")
    return;
  }
  //logger('info', 'StateUpdater', `[syncVariables] Called for messageId: ${messageId}`, _.cloneDeep(statusbarData));
  //console.log(`[DEBUG] syncVariables called for messageId: ${messageId}`, statusbarData);

  try {
    const eventList = statusbarData['事件列表'];
    if (!Array.isArray(eventList) || eventList.length === 0) {
      //logger('log', 'StateUpdater', `[syncVariables] No '事件列表' found or it's empty. Aborting.`);
      return;
    }

    const newEvents = eventList
      .map((event: any) => {
        const normalizedEvent = normalizeEvent(event);
        return {
          ...normalizedEvent,
          sourceMessageId: messageId,
          eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        };
      })
      .filter((event: any): event is any => { // HACK: Fix type later
        if (!event.type) {
          //logger('warn', 'StateUpdater', `[syncVariables] Filtered out an event with no type.`, event);
          return false;
        }
        return true;
      });

    const pokedexEvents = newEvents.filter(e => e.type === '新图鉴发现');
    if (pokedexEvents.length > 0) {
      //logger('info', 'StateUpdater', `[Pokedex] Found ${pokedexEvents.length} '新图鉴发现' events in the current message.`, _.cloneDeep(pokedexEvents));
    }

    //logger('log', 'StateUpdater', `[syncVariables] Normalized ${newEvents.length} new events to be dispatched.`, _.cloneDeep(newEvents));

    const eventLogStore = eventLogStoreInstance || useEventLogStore();
    await eventLogStore.addEvents(newEvents);
    //logger('info', 'StateUpdater', `[syncVariables] Added ${newEvents.length} new events to EventLogStore.`);

    // --- 核心修复：在集成测试中手动触发事件处理 ---
    // 在正常的应用流程中，worldStore 会通过 watch 自动处理新事件。
    // 但在测试环境中，我们需要手动调用它来确保事件被同步处理。
    // Use the injected store instance in a test environment, otherwise get the real one.
    const worldStore = worldStoreInstance || useWorldStore();
    if (worldStore && typeof worldStore._dangerouslyProcessEvents === 'function') {
      // In the test environment, the mock function returns the new state.
      const newState = worldStore._dangerouslyProcessEvents(newEvents);
      //console.log("[DEBUG]newState:", newState)
      // If we are in a test environment (worldStoreInstance is provided) and newState is returned,
      // explicitly set the store's state to ensure the test sees the update.
      if (worldStoreInstance && newState) {
        worldStoreInstance._dangerouslySetState(newState);
        //console.log("[DEBUG]worldStoreInstance.world.value:", worldStoreInstance.world.value)
      }
      //logger('info', 'StateUpdater', `[syncVariables] Manually processed ${newEvents.length} events via ${worldStoreInstance ? 'mock' : 'real'} store.`);
    }
    // --- 修复结束 ---

    //const finalVars = getVariables({ type: 'chat' });
    //logger('log', 'StateUpdater', '[POST-SYNC] Current chat variables:', _.cloneDeep(finalVars));

    //emit('variablesSynced', undefined);

  } catch (error) {
    //logger('error', 'StateUpdater', '`syncVariables` failed.', error);
    toastr.error('事件同步失败，请查看控制台获取详情。');
  }
}

export async function recalculateAndApplyState(
  historyManager: ChatHistoryManager,
  targetMessageId: string,
  worldStoreOverride?: any,
  characterStoreOverride?: any,
  eventLogStoreOverride?: any,
  recalculationInputs?: { startState: any; eventsToReplay: any[] }
): Promise<any> {
  //console.log(`[RECALC_DEBUG] === STATE RECALCULATION STARTED for messageId: ${targetMessageId} ===`);

  isRecalculating.value = true;
  let initialVars = null;
  let genesisState = null;
  try {
    // (v4.2.2) 防御性检查：在重算开始前验证L3缓存是否存在
    if (!worldStoreOverride) {
      initialVars = getVariables({ type: 'chat' });
    }
    //console.log(`[RECALC_DEBUG] === Is worldStoreOverride: ${!worldStoreOverride} ===`);
    if (!worldStoreOverride) {
      if (!_.has(initialVars, '世界.初始状态') || !_.has(initialVars, '备份.初始状态备份')) {
        /*
        logger('error', 'StateUpdater', 'L3 cache (Genesis Snapshot) is missing before recalculation! Attempting recovery from history.', {
          hasInitialState: _.has(initialVars, '世界.初始状态'),
          hasBackup: _.has(initialVars, '备份.初始状态备份'),
        });
        */
        // (v4.2.3) 修复：使用 getChatMessages 从酒馆原生历史记录中获取创世消息
        const allMessages = await getChatMessages();
        const genesisMessage = allMessages[0]; // Get the first message from the array
        if (genesisMessage && genesisMessage.variables) {
          const recoveredInitialState = _.get(genesisMessage.variables, '世界.初始状态');
          const recoveredBackup = _.get(genesisMessage.variables, '备份');
          if (recoveredInitialState && recoveredBackup) {
            const recoveryState = {
              ...initialVars, // 保留现有变量
              世界: {
                ...(initialVars.世界 || {}),
                初始状态: recoveredInitialState,
              },
              备份: recoveredBackup,
            };
            //logger('warn', 'StateUpdater', '[PRE-WRITE-RECOVERY] About to overwrite variables during recovery.', _.cloneDeep(recoveryState));
            await overwriteAllChatVariables(recoveryState);
            toastr.warning('检测到并已自动修复了严重的状态数据丢失问题。');
            //logger('warn', 'StateUpdater', 'Successfully recovered L3 cache from genesis message.');
            initialVars = getVariables({ type: 'chat' }); // 修复后重新读取
          } else {
            toastr.error('检测到严重的状态数据丢失，且无法自动恢复！');
            throw new Error('CRITICAL: L3 cache is missing and could not be recovered from genesis message.');
          }
        } else {
          toastr.error('检测到严重的状态数据丢失，且无法自动恢复！');
          throw new Error('CRITICAL: L3 cache is missing and no genesis message found for recovery.');
        }
      }
    }

    // (v4.5) Fallback机制：检查顶级变量键是否缺失，如果缺失则从L3快照恢复
    if (!worldStoreOverride) {
      genesisState = _.get(initialVars, '世界.初始状态')
    }
    //console.log(`[RECALC_DEBUG] === genesisState: ${genesisState} ===`);
    if (genesisState && !worldStoreOverride) {
      const hasMissingKeys = (source: Record<string, any>, template: Record<string, any>): boolean => {
        for (const key in template) {
          if (!_.has(source, key)) {
            return true;
          }
          if (_.isObject(template[key]) && !_.isArray(template[key]) && _.isObject(source[key])) {
            if (hasMissingKeys(source[key], template[key])) {
              return true;
            }
          }
        }
        return false;
      };

      const worldMissing = !_.has(initialVars, '世界') || hasMissingKeys(_.get(initialVars, '世界', {}), _.get(genesisState, '世界', {}));
      const characterMissing = !_.has(initialVars, '角色') || hasMissingKeys(_.get(initialVars, '角色', {}), _.get(genesisState, '角色', {}));

      if (worldMissing || characterMissing) {
        //logger('warn', 'StateUpdater', 'Missing keys detected in top-level variables. Restoring from L3 snapshot.', { worldMissing, characterMissing });
        const restoredState = _.merge({}, genesisState, initialVars);
        await overwriteAllChatVariables(restoredState);
        toastr.info('检测到存档数据结构缺失，已从创世快照中恢复。');
        //logger('info', 'StateUpdater', 'Successfully restored state from L3 snapshot.');
      }
    }

    let inputs;
    if (recalculationInputs) {
      inputs = recalculationInputs;
    } else {
      inputs = await getRecalculationInputs(historyManager, targetMessageId);
      if (!inputs) {
        throw new Error('Failed to get inputs for state recalculation.');
      }
    }
    const { startState, eventsToReplay } = inputs;

    /*console.log('[RECALC_DEBUG] Inputs received:', {
      startState: JSON.parse(JSON.stringify(startState)),
      eventsToReplay: JSON.parse(JSON.stringify(eventsToReplay)),
    });
    */

    const worldStore = worldStoreOverride || useWorldStore();
    const characterStore = characterStoreOverride || useCharacterStore();
    const eventLogStore = eventLogStoreOverride || useEventLogStore();

    // The worldStore is now the single source of truth.
    // We set its entire state, which includes the character data.
    const stateToSet = {
      ...(startState.世界 || {}),
      角色: startState.角色 || {},
    };
    //console.log('[RECALC_DEBUG] About to set worldStore state with:', JSON.parse(JSON.stringify(stateToSet)));
    worldStore._dangerouslySetState(stateToSet);
    // Process events directly on the worldStore which now manages all world-related state.
    //console.log('[RECALC_DEBUG] stateUpdater: About to process events. World state BEFORE:', JSON.parse(JSON.stringify(worldStore.world.value)));
    worldStore._dangerouslyProcessEvents(eventsToReplay);
    //console.log('[RECALC_DEBUG] stateUpdater: Finished processing events. World state AFTER:', JSON.parse(JSON.stringify(worldStore.world.value)));
    //logger('info', 'StateCalc', `[Manual Sync] Manually processed ${eventsToReplay.length} events.`);

    // (v4.3) 响应式重构：插件的状态重算逻辑已移至 index.ts，以彻底解耦

    // (v4.3) 响应式重构：不再手动从各个子store中拉取状态。
    // worldStore 和 characterStore 现在是“单一事实来源”，它们内部的 watcher
    // 会监听事件并自动、响应式地更新所有相关的衍生状态（如时间、天气等）。
    // 我们只需要信任这个过程会自动完成，然后直接从这两个核心store中获取最终的、完全计算好的状态即可。
    const finalWorldState = _.cloneDeep(worldStore.world);
    const finalCharactersState = _.cloneDeep(characterStore.characters);

    const finalState = _.cloneDeep({
      '世界': finalWorldState,
      '角色': finalCharactersState,
    });

    // (v4.2.2) 核心修复：在覆盖变量前，将L2和L3缓存重新注入到最终状态中
    const currentVars = getVariables({ type: 'chat' });
    const preservedInitialState = _.get(currentVars, '世界.初始状态');
    const preservedSnapshots = _.get(currentVars, '世界.状态快照');
    const preservedBackup = _.get(currentVars, '备份');

    // 最终修复：彻底重构缓存注入逻辑，避免任何引用问题
    if (preservedInitialState) {
      _.set(finalState, '世界.初始状态', preservedInitialState);
    }

    const coords = historyManager.getRawHistory().metadata[targetMessageId];
    const currentBranchId = coords ? coords.branchId : null;

    if (preservedSnapshots) {
      const finalSnapshots: any = {}; // 修复 TS 错误
      // 遍历所有分支
      for (const branchId in preservedSnapshots) {
        if (branchId !== currentBranchId) {
          // 只保留其他分支的快照
          finalSnapshots[branchId] = _.cloneDeep(preservedSnapshots[branchId]);
        }
      }
      // 确保当前分支的键存在且为空对象
      if (currentBranchId) {
        finalSnapshots[currentBranchId] = {};
        //logger('warn', 'StateUpdater', `Cleared old snapshots for branch '${currentBranchId}' during recalculation.`);
      }
      _.set(finalState, '世界.状态快照', finalSnapshots);
    }

    if (preservedBackup) {
      _.set(finalState, '备份', preservedBackup);
    }

    logger('info', 'StateUpdater', 'Re-injecting L2/L3 caches before overwriting variables.', {
      hasInitialState: !!preservedInitialState,
      hasSnapshots: !!preservedSnapshots,
      hasBackup: !!preservedBackup,
    });


    //logger('warn', 'StateUpdater', '[PRE-WRITE-FINAL] About to overwrite all variables with final calculated state.', _.cloneDeep(finalState));
    const finalStateProblems = findNonCloneable(finalState);
    if (finalStateProblems.length > 0) {
      //logger('error', 'StateUpdater', 'CRITICAL: Non-cloneable properties found in finalState before overwriting variables!', finalStateProblems);
    }
    //console.log('[RECALC_DEBUG] PRE-WRITE-FINAL: About to overwrite all variables with final calculated state.', JSON.parse(JSON.stringify(finalState)));
    await overwriteAllChatVariables(finalState);
    const writtenState = getVariables({ type: 'chat' });
    //console.log('[RECALC_DEBUG] POST-WRITE-FINAL: State after writing to variables.', JSON.parse(JSON.stringify(writtenState)));
    //logger('info', 'StateUpdater', '[SWIPE_DEBUG] Reactive event replay finished. ');

    //logger('warn', 'StateUpdater', '[PRE-WRITE-SNAPSHOT] About to save state snapshot.', _.cloneDeep(writtenState));
    const snapshotProblems = findNonCloneable(writtenState);
    if (snapshotProblems.length > 0) {
      //logger('error', 'StateUpdater', 'CRITICAL: Non-cloneable properties found in state before saving snapshot!', snapshotProblems);
    }
    // (v4.3) 周期性地创建状态快照 (L2缓存)
    const turnIndex = historyManager.getMessageIndex(targetMessageId);
    // 检查是否需要创建快照
    if (turnIndex > 0 && turnIndex % 20 === 0) {
      //logger('info', 'StateUpdater', `到达第 ${turnIndex} 回合，创建状态快照...`);
      await saveStateSnapshot(targetMessageId, writtenState, historyManager);
    }

    // (v4.4) 追溯性快照生成：如果快照为空但回合数已超过20，则追溯生成所有缺失的快照
    const branchId = _.get(historyManager.getRawHistory().metadata, `${targetMessageId}.branchId`);
    const snapshotsForBranch = _.get(writtenState, `世界.状态快照.${branchId}`, {});
    if (turnIndex > 20 && _.isEmpty(snapshotsForBranch)) {
      //logger('warn', 'StateUpdater', `检测到状态快照为空，但已进行 ${turnIndex} 回合。开始追溯性生成快照...`);
      const allMessages = historyManager.getActiveMessagesUntil(targetMessageId);
      if (allMessages) {
        for (let i = 20; i < turnIndex; i += 20) {
          const messageForSnapshot = allMessages[i];
          if (messageForSnapshot) {
            //logger('info', 'StateUpdater', `[追溯] 正在为第 ${i} 回合 (messageId: ${messageForSnapshot.id}) 创建快照...`);
            // 注意：这里我们为历史消息创建快照，但使用的是当前计算出的最终状态。
            // 这是一个简化处理，理想情况下应该为每个历史点重新计算一次状态。
            // 但考虑到性能和复杂性，暂时使用当前状态作为近似值。
            await saveStateSnapshot(messageForSnapshot.id, writtenState, historyManager);
          }
        }
      }
      //logger('warn', 'StateUpdater', '追溯性快照生成完成。');
    }

    //console.log(`[RECALC_DEBUG] === STATE RECALCULATION FINISHED for message ${targetMessageId} ===`);
    toastr.success('游戏状态已同步至当前消息页。');

  } catch (error) {
    //logger('error', 'StateUpdater', '`recalculateAndApplyState` failed.', error);
    toastr.error('状态重算失败，请查看控制台获取详情。');
    return null; // 返回null表示失败
  } finally {
    isRecalculating.value = false;
  }
  // 关键修复：返回最终计算出的纯净状态对象
  const finalVars = getVariables({ type: 'chat' });
  //console.log('[RECALC_DEBUG] Function returning final variables:', JSON.parse(JSON.stringify(finalVars)));
  return _.cloneDeep(finalVars);
}
