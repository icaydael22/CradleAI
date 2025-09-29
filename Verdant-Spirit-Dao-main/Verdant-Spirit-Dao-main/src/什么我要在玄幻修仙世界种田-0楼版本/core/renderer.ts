// core/renderer.ts

import { useActionStore } from '../stores/ui/actionStore';
import { useAppStore } from '../stores/app/appStore';
import type { ChatHistoryManager, MessagePage } from './history';
import { logger } from './logger';
import { PokedexManager } from './pokedex';
import { isRecalculating } from './state';
import { recalculateAndApplyState, syncVariables } from './stateUpdater';
import { TimeManager } from './time';
import { extractJsonFromStatusBar } from './utils';
import { initializeState, safeInsertOrAssignVariables } from './variables';

// Declare global variables
declare const _: any;
declare const toastr: any;
declare const getVariables: (options: any) => any;

/**
 * StoryRenderer is responsible for orchestrating the application's state updates
 * based on the chat history and AI-generated messages. After the migration to Vue,
 * it no longer handles direct DOM rendering. Instead, it processes data,
 * updates the state via Pinia stores, and manages the core application flow
 * like initialization and state recalculation.
 */
export class StoryRenderer {
  private historyManager: ChatHistoryManager;
  public pokedexManager: PokedexManager;
  private timeManager: TimeManager;
  public jsonData: any = null;
  public rootNodeKey: string | null;

  constructor(historyManager: ChatHistoryManager, pokedexManager: PokedexManager, timeManager: TimeManager) {
    this.historyManager = historyManager;
    this.pokedexManager = pokedexManager;
    this.timeManager = timeManager;
    this.rootNodeKey = null;
  }

  public getPokedexManager(): PokedexManager {
    return this.pokedexManager;
  }

  public getHistoryManager(): ChatHistoryManager {
    return this.historyManager;
  }

  async init() {
    logger('info', 'Renderer', '`init` called. Starting full render process.');
    const appStore = useAppStore();
    appStore.setLoading(true, '正在初始化游戏...');

    try {
      // 1. 确保核心变量结构存在
      await this._ensureVariableIntegrity();

      // 1.5. 初始化状态管理系统
      initializeState(getVariables({ type: 'chat' }));

      // v4.1 CHAT_FLOW_SPEC 修正: 在状态重算前，预先清理 L3 缓存中的 plugin_storage，确保重算逻辑的稳定性
      const currentVars = getVariables({ type: 'chat' });
      const l3History = _.get(currentVars, '世界.初始状态.plugin_storage.llm_history');
      logger('info', 'Renderer', `[L3 Pre-Fix] L3 cache plugin_storage.llm_history now is ${JSON.stringify(l3History, null, 2)}.`);
      if (l3History && Array.isArray(l3History) && l3History.length > 1) {
          logger('warn', 'Renderer', `[L3 Pre-Fix] L3 cache plugin_storage.llm_history contains ${l3History.length} entries. Trimming before recalculation.`);
          await safeInsertOrAssignVariables({
              '世界': {
                  '初始状态': {
                      'plugin_storage': {
                          'llm_history': l3History.slice(0, 1)
                      }
                  }
              }
          });
      }

      // 2. (v2.0) 重算并应用初始状态
      const messages = this.historyManager.getMessagesForPrompt();
      const lastMessage = _.findLast(messages, (m: MessagePage) => m.role === 'assistant');
      if (lastMessage && lastMessage.id) {
        isRecalculating.value = true;
        await recalculateAndApplyState(this.historyManager, lastMessage.id);
        isRecalculating.value = false;

        // 3. 提取最新消息用于UI渲染
        const rawJsonContent = extractJsonFromStatusBar(lastMessage.content);
        if (rawJsonContent) {
            try {
                this.jsonData = this._transformJsonData(JSON.parse(rawJsonContent));
                this.findRootNodeKey();
            } catch (e) {
                this.jsonData = null;
            }
        }
        this.renderAll();

      } else {
        logger('warn', 'Renderer', 'History is empty. Rendering from default variables.');
        this.jsonData = null;
        this.renderAll();
      }

      logger('info', 'Renderer', 'Initialization and rendering completed successfully.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger('error', 'Renderer', 'An unexpected error occurred during `init`.', error);
      appStore.setError(`初始化失败: ${errorMessage}`);
      toastr.error(`初始化失败: ${errorMessage}`);
    } finally {
      appStore.setLoading(false);
    }
  }

  private async _ensureVariableIntegrity() {
    logger('log', 'Renderer', 'Running variable integrity check...');
    const currentVars = getVariables({ type: 'chat' }) || {};
    const updates: Record<string, any> = {};
    const defaultCharacterName = '萧栖雪';

    // 确保核心命名空间存在
    if (!_.has(currentVars, '角色')) updates['角色'] = {};
    if (!_.has(currentVars, '世界')) updates['世界'] = {};

    // 确保主控角色名和角色对象存在
    const mainCharName = _.get(currentVars, '角色.主控角色名', defaultCharacterName);
    if (!_.has(currentVars, `角色.${mainCharName}`)) {
        // 同时初始化物品数组和关系对象
        _.set(updates, `角色.${mainCharName}`, { '物品': [], '关系': {} });
    } else if (!_.has(currentVars, `角色.${mainCharName}.关系`)) {
        // 如果角色已存在，检查是否有关心字段
        _.set(updates, `角色.${mainCharName}.关系`, {});
    }
    if (!_.has(currentVars, '角色.主控角色名')) {
        updates['角色.主控角色名'] = mainCharName;
    }

    // 确保世界子对象存在
    if (!_.has(currentVars, '世界.图鉴')) {
        _.set(updates, '世界.图鉴', { '物品': [], '妖兽': [], '植物': [], '书籍': [] });
    }
    if (!_.has(currentVars, '世界.庇护所')) {
        _.set(updates, '世界.庇护所', { '状态': '尚未建立' });
    }
    // v3.9: 确保奇遇模块的状态存在，以兼容旧存档
    if (!_.has(currentVars, '世界.奇遇')) {
        // 修正：直接在 updates.世界 对象下创建属性
        if (!updates['世界']) {
            updates['世界'] = {};
        }
        updates['世界']['奇遇'] = {
            '冷却至天数': 15, // 允许在游戏早期发生第一次奇遇
            '上次奇遇日期': { '年': 0, '月': 0, '日': 0 }, // 使用一个无效日期作为初始值
            '历史奇遇记录': [],
        };
    }

    if (!_.isEmpty(updates)) {
        logger('warn', 'Renderer', 'One or more core variables were missing. Initializing them.', _.cloneDeep(updates));
        
        // 更新当前聊天变量
        await safeInsertOrAssignVariables(updates, { type: 'chat' });

        // 关键修复：同时更新创世快照，防止状态重算时丢失数据
        const genesisSnapshot = _.get(currentVars, '世界.初始状态');
        if (genesisSnapshot) {
            await safeInsertOrAssignVariables({
                '世界': {
                    '初始状态': updates
                }
            });
            logger('info', 'Renderer', 'Genesis snapshot was also updated to ensure consistency.');
        }

        toastr.warning('部分核心游戏变量缺失，已自动初始化。');
    } else {
        logger('log', 'Renderer', 'Variable integrity check passed. No missing core variables.');
    }
  }

  public _transformJsonData(jsonData: any): any {
    if (!jsonData) return jsonData;

    const rootNodeKey = Object.keys(jsonData).find(key => key.includes('状态总览') || key.includes('角色状态总览')) || Object.keys(jsonData)[0];
    if (!rootNodeKey || !jsonData[rootNodeKey]) return jsonData;

    const rootData = jsonData[rootNodeKey];
    const charListKey = this.findFieldByKeywords(rootData, ['角色', '列表', '人物']);
    if (!charListKey || !Array.isArray(rootData[charListKey])) return jsonData;

    rootData[charListKey].forEach((charDataWrapper: any) => {
        const charDataKey = Object.keys(charDataWrapper).find(k => k.includes('角色'));
        if (charDataKey) {
            const charData = charDataWrapper[charDataKey];
            const coreItemsKey = this.findFieldByKeywords(charData, ['核心物品']);
            if (coreItemsKey && charData[coreItemsKey]) {
                // Use a generic '物品' key, as this is what the inventory renderer expects.
                // This prevents writing a separate '核心物品' variable.
                if (!charData['物品']) {
                    charData['物品'] = charData[coreItemsKey];
                }
                delete charData[coreItemsKey];
            }
        }
    });

    return jsonData;
  }

  findRootNodeKey() {
    if (!this.jsonData) {
        this.rootNodeKey = null;
        return;
    }
    const keys = Object.keys(this.jsonData);
    this.rootNodeKey = keys.find(key => key.includes('状态总览') || key.includes('角色状态总览')) || keys[0];
  }

  findFieldByKeywords(data: any, keywords: string[]) {
    if (!data || typeof data !== 'object') return null;
    const fields = Object.keys(data);
    for (const field of fields) {
      for (const keyword of keywords) {
        if (field.toLowerCase().includes(keyword.toLowerCase())) return field;
      }
    }
    return null;
  }

  /**
   * 使用广度优先搜索（BFS）在嵌套对象中查找第一个包含与关键字匹配的键的对象。
   * @param data 要搜索的顶层对象。
   * @param keywords 一个包含要匹配的关键字的字符串数组。
   * @returns 返回包含匹配键的第一个对象，如果未找到则返回 null。
   */
  public findObjectContainingKey(data: any, keywords: string[]): any | null {
    if (!data || typeof data !== 'object') {
        return null;
    }

    const queue = [data];
    while (queue.length > 0) {
        const current = queue.shift();
        if (!current || typeof current !== 'object') continue;

        const keys = Object.keys(current);
        for (const key of keys) {
            for (const keyword of keywords) {
                // 使用 includes 进行部分匹配，以兼容 emoji 和修饰词
                if (key.includes(keyword)) {
                    return current; // 找到了包含目标键的对象
                }
            }
        }
        
        // 将子对象加入队列以继续搜索
        for (const key of keys) {
            if (typeof current[key] === 'object' && current[key] !== null) {
                queue.push(current[key]);
            }
        }
    }

    return null; // 搜索完整个对象树后仍未找到
  }

  renderAll() {
    logger('info', 'Renderer', '[SWIPE_RENDER] renderAll called. Reading final state from chat variables for rendering.');
    const finalVars = getVariables({ type: 'chat' });
    logger('log', 'Renderer', '[SWIPE_RENDER] State before rendering:', _.cloneDeep(finalVars));

    const messages = this.historyManager.getMessagesForPrompt();
    const lastMessage = _.last(messages);

    this.jsonData = null; // 重置状态

    if (lastMessage) {
      const rawJsonContent = extractJsonFromStatusBar(lastMessage.content);
      if (rawJsonContent) {
        try {
          this.jsonData = this._transformJsonData(JSON.parse(rawJsonContent));
          this.findRootNodeKey();
        } catch (e) {
          logger('warn', 'Renderer', 'Failed to parse JSON in renderAll for last message.', e);
          this.jsonData = null;
        }
      }
    }
    
    // The only remaining "rendering" task is to update the action options store.
    this.renderActionOptions(this.jsonData);
  }

  renderActionOptions(data: any | null) {
    const actionStore = useActionStore();
    logger('log', 'Renderer', '[Vue Migration] Rendering Action Options via Pinia Store.');

    const actionOptionsContainer = data ? this.findObjectContainingKey(data, ['行动选项']) : null;

    if (!actionOptionsContainer) {
      logger('warn', 'Renderer', '[Vue Migration] No action options found. Setting store to empty state.');
      const variables = getVariables({ type: 'chat' });
      const mainCharacterName = _.get(variables, '角色.主控角色名', '你');
      actionStore.setActions(mainCharacterName, []);
      return;
    }

    const actionOptionsKey = this.findFieldByKeywords(actionOptionsContainer, ['行动选项']);
    const actionData = actionOptionsKey ? actionOptionsContainer[actionOptionsKey] : null;

    if (!actionData) {
      logger('warn', 'Renderer', '[Vue Migration] Could not extract actionData. Setting store to empty state.');
      const variables = getVariables({ type: 'chat' });
      const mainCharacterName = _.get(variables, '角色.主控角色名', '你');
      actionStore.setActions(mainCharacterName, []);
      return;
    }

    const optionsKey = this.findFieldByKeywords(actionData, ['可选行动']);
    const optionsRaw = (optionsKey && actionData && Array.isArray(actionData[optionsKey])) ? actionData[optionsKey] : [];
    
    // Clean the options before sending them to the store
    const options = optionsRaw.map((optionText: string) => this.formatNodeName(optionText, true));

    const variables = getVariables({ type: 'chat' });
    const mainCharacterName = _.get(variables, '角色.主控角色名', '你');

    logger('info', 'Renderer', `[Vue Migration] Setting action store with owner: ${mainCharacterName} and options:`, options);
    actionStore.setActions(mainCharacterName, options);
  }

  /**
   * Processes the final, complete AI message to authoritatively update the story,
   * sync variables, and render all UI components. This is the main entry point
   * for both streaming and non-streaming responses once generation is complete.
   * @param storyText The processed, clean story text for rendering.
   * @param message The original, complete message object from the history, including the status bar.
   */
  public async renderStoryAndSyncState(storyText: string, message: MessagePage) {
    logger('info', 'Renderer', '`renderStoryAndSyncState` called for final update.');
    
    const jsonString = extractJsonFromStatusBar(message.content);

    if (jsonString && message.id) {
      try {
        const parsedJson = JSON.parse(jsonString);
        logger('info', 'Renderer', 'Final JSON parsed. Calling `syncVariables`.', _.cloneDeep(parsedJson));
        await syncVariables(parsedJson, message.id);
        logger('info', 'Renderer', 'Final `syncVariables` has completed.');
        
        this.jsonData = this._transformJsonData(parsedJson);
        this.findRootNodeKey();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger('error', 'Renderer', 'Failed to parse or sync final state.', { error, jsonString });
        useAppStore().setError(`状态栏解析或同步失败: ${errorMessage}`);
        toastr.error('状态栏数据解析失败，请检查日志。');
        this.jsonData = null;
      }
    } else {
      logger('warn', 'Renderer', 'No status bar found in the final message. UI will be rendered from existing variables.');
      this.jsonData = null;
    }

    // Perform a full render using the now-synced variables.
    this.renderAll();
    logger('info', 'Renderer', 'Final renderAll complete.');
  }

  public updateWithStreamedData(streamedJson: string, messageId: string) {
    logger('log', 'Renderer', '`updateWithStreamedData` called with new JSON string.');
    try {
      const newState = JSON.parse(streamedJson);
      this.jsonData = this._transformJsonData(newState);
      this.findRootNodeKey();
      if (!this.rootNodeKey) {
        logger('warn', 'Renderer', 'Could not find root node key in streamed JSON.', newState);
        return;
      }
      // During streaming, we only sync variables without a full state recalculation
      // to avoid performance issues. The final state will be calculated once in
      // renderStoryAndSyncState.
      syncVariables(newState, messageId).then(() => {
        logger('log', 'Renderer', 'Variable sync complete, re-rendering side panels from temporary data.');
        // Note: This rendering might not be perfectly accurate but provides immediate feedback.
        this.renderActionOptions(this.jsonData);
      });
    } catch (error) {
      logger('error', 'Renderer', 'Failed to parse or process JSON from stream.', { error, streamedJson });
      toastr.error('流式状态栏数据解析失败。');
    }
  }

  formatNodeName(name: any, removeAllEmoji = false): string {
    if (!_.isString(name) && !_.isNumber(name)) return '';
    let cleanName = _.toString(name);
    cleanName = _.replace(cleanName, /^\d+\.\s*/, '');
    if (removeAllEmoji) {
      const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
      cleanName = _.replace(cleanName, emojiRegex, '');
    }
    return _.trim(cleanName);
  }
}
