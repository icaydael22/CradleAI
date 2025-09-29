import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { ChatHistoryEntity, ChatMessage, } from '../../../shared/types';
import { CircleMemory } from '../../../shared/types/circle-types';
import { GlobalPresetConfig, GlobalWorldbookConfig, WorldBookJson, PresetJson } from '../../../shared/types';
import { NodeSTCore } from '../core/node-st-core';

/**
 * StorageAdapter provides a clean interface for managing chat-related storage operations,
 * focusing on actual user-AI conversation without exposing framework details.
 */
export class StorageAdapter {
  // 角色数据文件存储目录
  private static characterDataDir = FileSystem.documentDirectory + 'nodest_characters/';

  // 辅助方法：获取角色数据文件路径
  private static getCharacterDataFilePath(key: string): string {
    return StorageAdapter.characterDataDir + key + '.json';
  }

  /**
   * Generates a standardized storage key for a given conversation
   * @param conversationId The conversation identifier
   * @param suffix Optional suffix to specialize the key
   * @returns Formatted storage key
   */
  static getStorageKey(conversationId: string, suffix: string = ''): string {
    return `nodest_${conversationId}${suffix}`;
  }

  /**
   * Save JSON data to AsyncStorage or file (for character data)
   * @param key Storage key
   * @param data Data to store
   */
  static async saveJson<T>(key: string, data: T): Promise<void> {
    try {
      if (key.startsWith('nodest_')) {
        await FileSystem.makeDirectoryAsync(StorageAdapter.characterDataDir, { intermediates: true }).catch(() => { });
        const filePath = StorageAdapter.getCharacterDataFilePath(key);
        await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data));
      } else {
        await AsyncStorage.setItem(key, JSON.stringify(data));
      }
    } catch (error) {
      console.error(`[StorageAdapter] Error saving data for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Load JSON data from AsyncStorage or file (for character data)
   * @param key Storage key
   * @returns Parsed JSON data or null if not found
   */
  static async loadJson<T>(key: string): Promise<T | null> {
    try {
      if (key.startsWith('nodest_')) {
        const filePath = StorageAdapter.getCharacterDataFilePath(key);
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        if (!fileInfo.exists) return null;
        const content = await FileSystem.readAsStringAsync(filePath);
        return content ? JSON.parse(content) : null;
      } else {
        const data = await AsyncStorage.getItem(key);
        return data ? JSON.parse(data) : null;
      }
    } catch (error) {
      console.error(`[StorageAdapter] Error loading data for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Retrieve only the user-AI conversation exchanges from chat history
   * @param conversationId The conversation identifier
   * @returns Array of cleaned chat messages (only user-AI exchanges)
   */
  static async getCleanChatHistory(conversationId: string): Promise<ChatMessage[]> {
    try {
      console.log('[StorageAdapter] Retrieving clean chat history for conversation:', conversationId);

      // Load raw chat history
      const chatHistory = await this.loadJson<ChatHistoryEntity>(
        this.getStorageKey(conversationId, '_history')
      );

      if (!chatHistory || !chatHistory.parts) {
        return [];
      }

      // Filter to include only real user/AI messages (no D-entries, no framework)
      const cleanedMessages = chatHistory.parts
        .filter(message => {
          // Only include actual conversation messages (exclude D entries and system messages)
          return (!message.is_d_entry &&
            (message.role === "user" || message.role === "model" || message.role === "assistant") &&
            message.parts?.[0]?.text);
        })
        .map((message, index) => {
          // Add messageIndex to each message
          return {
            ...message,
            messageIndex: index
          };
        });

      console.log(`[StorageAdapter] Retrieved ${cleanedMessages.length} clean messages`);

      return cleanedMessages;
    } catch (error) {
      console.error('[StorageAdapter] Error getting clean chat history:', error);
      return [];
    }
  }

  /**
   * Retrieve a specified number of recent messages
   * @param conversationId The conversation identifier
   * @param count Maximum number of messages to retrieve (default: 20)
   * @returns Array of recent chat messages
   */
  static async getRecentMessages(conversationId: string, count: number = 10): Promise<ChatMessage[]> {
    const cleanMessages = await this.getCleanChatHistory(conversationId);
    return cleanMessages.slice(Math.max(0, cleanMessages.length - count));
  }

  /**
   * Check if a conversation has any history
   * @param conversationId The conversation identifier
   * @returns True if the conversation has history, false otherwise
   */
  static async hasConversationHistory(conversationId: string): Promise<boolean> {
    const messages = await this.getCleanChatHistory(conversationId);
    return messages.length > 0;
  }

  /**
   * Get the first message (typically the AI greeting) from a conversation
   * @param conversationId The conversation identifier
   * @returns The first message or null if not found
   */
  static async getFirstMessage(conversationId: string): Promise<ChatMessage | null> {
    try {
      const chatHistory = await this.loadJson<ChatHistoryEntity>(
        this.getStorageKey(conversationId, '_history')
      );

      if (!chatHistory || !chatHistory.parts || chatHistory.parts.length === 0) {
        return null;
      }

      // Find the first_mes or the first model/assistant message
      const firstMessage = chatHistory.parts.find(
        msg => msg.is_first_mes ||
          ((msg.role === "model" || msg.role === "assistant") &&
            !msg.is_d_entry && msg.parts?.[0]?.text)
      );

      return firstMessage || null;
    } catch (error) {
      console.error('[StorageAdapter] Error getting first message:', error);
      return null;
    }
  }

  /**
   * Export the conversation as a simple array of alternating user and AI messages
   * Useful for sharing or displaying conversation summaries
   * @param conversationId The conversation identifier
   * @returns Array of {role, content} objects
   */
  static async exportConversation(conversationId: string): Promise<Array<{ role: string, content: string }>> {
    const cleanMessages = await this.getCleanChatHistory(conversationId);
    return cleanMessages.map(msg => ({
      role: msg.role === "model" || msg.role === "assistant" ? "assistant" : "user",
      content: msg.parts?.[0]?.text || ""
    }));
  }

  /**
   * Store a simple user-AI message exchange
   * Note: This doesn't handle D-entries or framework - it's for simple storage needs
   * @param conversationId The conversation identifier 
   * @param userMessage The user message
   * @param aiResponse The AI response
   * @returns True if successful, false otherwise
   */
  static async storeMessageExchange(
    conversationId: string,
    userMessage: string,
    aiResponse: string
  ): Promise<boolean> {
    try {
      // Get existing history
      const chatHistory = await this.loadJson<ChatHistoryEntity>(
        this.getStorageKey(conversationId, '_history')
      );

      if (!chatHistory) {
        console.error('[StorageAdapter] Cannot store message - no chat history found');
        return false;
      }

      // Add messages only if they don't exist already
      let updated = false;
      const userMessageExists = chatHistory.parts.some(
        msg => msg.role === "user" && msg.parts?.[0]?.text === userMessage
      );

      if (!userMessageExists) {
        chatHistory.parts.push({
          role: "user",
          parts: [{ text: userMessage }]
        });
        updated = true;
      }

      const aiResponseExists = chatHistory.parts.some(
        msg => (msg.role === "model" || msg.role === "assistant") &&
          msg.parts?.[0]?.text === aiResponse
      );

      if (!aiResponseExists && aiResponse) {
        chatHistory.parts.push({
          role: "model",
          parts: [{ text: aiResponse }]
        });
        updated = true;
      }

      if (updated) {
        // Save updated history
        await this.saveJson(
          this.getStorageKey(conversationId, '_history'),
          chatHistory
        );
        console.log('[StorageAdapter] Message exchange stored successfully');
      } else {
        console.log('[StorageAdapter] No new messages to store (existing messages)');
      }

      return true;
    } catch (error) {
      console.error('[StorageAdapter] Error storing message exchange:', error);
      return false;
    }
  }

  /**
   * Delete all data for a conversation
   * @param conversationId The conversation identifier
   * @returns True if successful, false otherwise
   */
  static async deleteConversationData(conversationId: string): Promise<boolean> {
    try {
      console.log('[StorageAdapter] Deleting all data for conversation:', conversationId);

      // Define all the keys we need to delete
      const keys = [
        this.getStorageKey(conversationId, '_role'),
        this.getStorageKey(conversationId, '_world'),
        this.getStorageKey(conversationId, '_preset'),
        this.getStorageKey(conversationId, '_note'),
        this.getStorageKey(conversationId, '_history'),
        this.getStorageKey(conversationId, '_contents')
      ];

      // Delete all keys in parallel
      await Promise.all(keys.map(async (key) => {
        try {
          await AsyncStorage.removeItem(key);
        } catch (error) {
          console.error(`[StorageAdapter] Error deleting key ${key}:`, error);
        }
      }));

      return true;
    } catch (error) {
      console.error('[StorageAdapter] Error deleting conversation data:', error);
      return false;
    }
  }

  /**
   * List all conversation IDs in storage
   * @returns Array of conversation IDs
   */
  static async getAllConversationIds(): Promise<string[]> {
    try {
      // 1. 从 AsyncStorage 获取
      const keys = await AsyncStorage.getAllKeys();
      const conversationKeys = keys.filter(key =>
        key.startsWith('nodest_') && key.endsWith('_history')
      );
      const conversationIdsFromAsync = conversationKeys.map(key =>
        key.replace('nodest_', '').replace('_history', '')
      );

      // 2. 从文件系统 nodest_characters/ 目录获取
      let conversationIdsFromFS: string[] = [];
      try {
        const dir = FileSystem.documentDirectory + 'nodest_characters/';
        const files = await FileSystem.readDirectoryAsync(dir);
        conversationIdsFromFS = files
          .filter(f => f.endsWith('_history.json') && f.startsWith('nodest_'))
          .map(f =>
            f.replace(/^nodest_/, '').replace(/_history\.json$/, '')
          );
      } catch (e) {
        // ignore if dir not exists
      }

      // 合并去重
      const allIds = Array.from(new Set([...conversationIdsFromAsync, ...conversationIdsFromFS]));
      return allIds;
    } catch (error) {
      console.error('[StorageAdapter] Error getting all conversation IDs:', error);
      return [];
    }
  }

  /**
   * Retrieve messages from a specific day
   * @param conversationId The conversation identifier
   * @param date The date to retrieve messages from (default: current day)
   * @returns Array of messages from the specified day
   */
  static async getMessagesFromDate(conversationId: string, date: Date = new Date()): Promise<ChatMessage[]> {
    try {
      console.log('[StorageAdapter] Retrieving messages from date for conversation:', conversationId);

      // Set time to start of day
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      // Set time to end of day
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Load raw chat history
      const chatHistory = await this.loadJson<ChatHistoryEntity>(
        this.getStorageKey(conversationId, '_history')
      );

      if (!chatHistory || !chatHistory.parts) {
        return [];
      }

      // Filter to include only real user/AI messages from the specified day
      const messagesFromDay = chatHistory.parts.filter(message => {
        // Only include actual conversation messages with timestamp within the day
        return (!message.is_d_entry &&
          (message.role === "user" || message.role === "model" || message.role === "assistant") &&
          message.parts?.[0]?.text &&
          message.timestamp &&
          message.timestamp >= startOfDay.getTime() &&
          message.timestamp <= endOfDay.getTime());
      });

      console.log(`[StorageAdapter] Retrieved ${messagesFromDay.length} messages from ${date.toDateString()}`);

      return messagesFromDay;
    } catch (error) {
      console.error('[StorageAdapter] Error getting messages from date:', error);
      return [];
    }
  }

  /**
   * Get circle memories for a character
   * @param characterId The character identifier
   * @param limit Maximum number of memories to retrieve (defaults to all)
   * @returns Array of circle memories sorted by timestamp (newest first)
   */
  static async getCircleMemories(characterId: string, limit?: number): Promise<CircleMemory[]> {
    try {
      console.log(`[StorageAdapter] Retrieving circle memories for character: ${characterId}, limit: ${limit || 'none'}`);
      const storageKey = `nodest_${characterId}_circle_memory`;

      // 优先从文件系统读取
      let memoryData: string | null = null;
      const fsDir = FileSystem.documentDirectory + 'nodest_characters/';
      const fsPath = fsDir + storageKey + '.json';
      try {
        const fileInfo = await FileSystem.getInfoAsync(fsPath);
        if (fileInfo.exists) {
          memoryData = await FileSystem.readAsStringAsync(fsPath);
        }
      } catch (e) {
        // ignore, fallback to AsyncStorage
      }

      // 如果文件系统没有，降级用 AsyncStorage
      if (!memoryData) {
        memoryData = await AsyncStorage.getItem(storageKey);
      }

      if (!memoryData) {
        console.log(`[StorageAdapter] No circle memories found for character: ${characterId}`);
        return [];
      }

      const memories: CircleMemory[] = JSON.parse(memoryData);

      // Sort by timestamp (newest first)
      const sortedMemories = memories.sort((a, b) => b.timestamp - a.timestamp);

      // Apply limit if specified
      const limitedMemories = limit ? sortedMemories.slice(0, limit) : sortedMemories;

      console.log(`[StorageAdapter] Retrieved ${limitedMemories.length} circle memories for character: ${characterId}`);

      return limitedMemories;
    } catch (error) {
      console.error(`[StorageAdapter] Error retrieving circle memories for character: ${characterId}`, error);
      return [];
    }
  }

  /**
   * Save circle memories for a character
   * @param characterId The character identifier
   * @param memories The circle memories to save
   */
  static async saveCircleMemories(characterId: string, memories: CircleMemory[]): Promise<void> {
    try {
      console.log(`[StorageAdapter] Saving ${memories.length} circle memories for character: ${characterId}`);

      const storageKey = `nodest_${characterId}_circle_memory`;
      await AsyncStorage.setItem(storageKey, JSON.stringify(memories));

      console.log(`[StorageAdapter] Successfully saved circle memories for character: ${characterId}`);
    } catch (error) {
      console.error(`[StorageAdapter] Error saving circle memories for character: ${characterId}`, error);
      throw error;
    }
  }

  /**
   * 导出角色全部数据（可用于角色迁移/备份/分享）
   * 返回格式与 CharacterImporter.ts 兼容
   */
  static async exportCharacterData(conversationId: string): Promise<{
    roleCard: any;
    worldBook: any;
    preset: any;
    authorNote?: any;
    chatHistory?: any;
    contents?: any;
    originalJson?: string; // 新增
  }> {
    try {
      // 新增：尝试读取originalJson
      let originalJson: string | undefined;
      try {
        // 角色数据文件路径
        const filePath = StorageAdapter.getCharacterDataFilePath(this.getStorageKey(conversationId, ''));
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        if (fileInfo.exists) {
          const content = await FileSystem.readAsStringAsync(filePath);
          // 尝试解析是否有originalJson字段
          const parsed = JSON.parse(content);
          if (typeof parsed.originalJson === 'string') {
            originalJson = parsed.originalJson;
          }
        }
      } catch (e) {
        // ignore
      }
      const [roleCard, worldBook, preset, authorNote, chatHistory, contents] = await Promise.all([
        this.loadJson<any>(this.getStorageKey(conversationId, '_role')),
        this.loadJson<any>(this.getStorageKey(conversationId, '_world')),
        this.loadJson<any>(this.getStorageKey(conversationId, '_preset')),
        this.loadJson<any>(this.getStorageKey(conversationId, '_note')),
        this.loadJson<any>(this.getStorageKey(conversationId, '_history')),
        this.loadJson<any>(this.getStorageKey(conversationId, '_contents')),
      ]);
      if (!roleCard) throw new Error('角色卡数据不存在');
      // worldBook/preset 可为空对象
      return {
        roleCard,
        worldBook: worldBook || { entries: {} },
        preset: preset || { prompts: [], prompt_order: [{ order: [] }] },
        authorNote: authorNote || undefined,
        chatHistory: chatHistory || undefined,
        contents: contents || undefined,
        originalJson // 新增
      };
    } catch (error) {
      console.error('[StorageAdapter] exportCharacterData error:', error);
      throw error;
    }
  }

  // ========== 全局预设功能 ==========

  /**
   * 保存全局预设配置
   */
  static async saveGlobalPresetConfig(config: GlobalPresetConfig): Promise<void> {
    await AsyncStorage.setItem('nodest_global_preset_config', JSON.stringify(config));
  }

  /**
   * 读取全局预设配置
   */
  static async loadGlobalPresetConfig(): Promise<GlobalPresetConfig | null> {
    const data = await AsyncStorage.getItem('nodest_global_preset_config');
    return data ? JSON.parse(data) : null;
  }

  /**
   * 保存全局预设模板列表
   */
  static async saveGlobalPresetList(list: Array<{id: string; name: string; presetJson: PresetJson}>): Promise<void> {
    await AsyncStorage.setItem('nodest_global_preset_list', JSON.stringify(list));
  }

  /**
   * 读取全局预设模板列表
   */
  static async loadGlobalPresetList(): Promise<Array<{id: string; name: string; presetJson: PresetJson}>> {
    const data = await AsyncStorage.getItem('nodest_global_preset_list');
    return data ? JSON.parse(data) : [];
  }

  /**
   * 保存当前选中的全局预设模板ID
   */
  static async saveSelectedGlobalPresetId(id: string): Promise<void> {
    await AsyncStorage.setItem('nodest_selected_global_preset_id', id);
  }

  /**
   * 读取当前选中的全局预设模板ID
   */
  static async loadSelectedGlobalPresetId(): Promise<string | null> {
    return await AsyncStorage.getItem('nodest_selected_global_preset_id');
  }

  /**
   * 批量替换所有角色的 presetjson
   * @param presetJson 新的全局 presetjson
   * @returns 替换的角色ID数组
   */
  static async replaceAllPresets(presetJson: PresetJson): Promise<string[]> {
    const ids = await this.getAllConversationIds();
    await Promise.all(ids.map(async (id) => {
      await this.saveJson(this.getStorageKey(id, '_preset'), presetJson);
    }));
    return ids;
  }

  /**
   * 恢复所有角色的原始 presetjson（需预先备份）
   * @param backupMap 角色ID到presetjson的映射
   */
  static async restoreAllPresets(backupMap: Record<string, PresetJson>): Promise<void> {
    await Promise.all(Object.entries(backupMap).map(async ([id, preset]) => {
      await this.saveJson(this.getStorageKey(id, '_preset'), preset);
    }));
  }

  /**
   * 备份所有角色的 presetjson
   */
  static async backupAllPresets(): Promise<Record<string, PresetJson>> {
    const ids = await this.getAllConversationIds();
    const result: Record<string, PresetJson> = {};
    for (const id of ids) {
      const preset = await this.loadJson<PresetJson>(this.getStorageKey(id, '_preset'));
      if (preset) result[id] = preset;
    }
    return result;
  }

  // ========== 全局世界书功能 ==========

  /**
   * 保存全局世界书配置
   */
  static async saveGlobalWorldbookConfig(config: GlobalWorldbookConfig): Promise<void> {
    await AsyncStorage.setItem('nodest_global_worldbook_config', JSON.stringify(config));
  }

  /**
   * 读取全局世界书配置
   */
  static async loadGlobalWorldbookConfig(): Promise<GlobalWorldbookConfig | null> {
    const data = await AsyncStorage.getItem('nodest_global_worldbook_config');
    return data ? JSON.parse(data) : null;
  }

  /**
   * 保存全局世界书模板列表
   */
  static async saveGlobalWorldbookList(list: Array<{id: string; name: string; worldbookJson: WorldBookJson}>): Promise<void> {
    await AsyncStorage.setItem('nodest_global_worldbook_list', JSON.stringify(list));
  }

  /**
   * 读取全局世界书模板列表
   */
  static async loadGlobalWorldbookList(): Promise<Array<{id: string; name: string; worldbookJson: WorldBookJson}>> {
    const data = await AsyncStorage.getItem('nodest_global_worldbook_list');
    return data ? JSON.parse(data) : [];
  }

  /**
   * 保存当前选中的全局世界书模板ID
   */
  static async saveSelectedGlobalWorldbookId(id: string): Promise<void> {
    await AsyncStorage.setItem('nodest_selected_global_worldbook_id', id);
  }

  /**
   * 读取当前选中的全局世界书模板ID
   */
  static async loadSelectedGlobalWorldbookId(): Promise<string | null> {
    return await AsyncStorage.getItem('nodest_selected_global_worldbook_id');
  }

  /**
   * 备份所有角色的 worldbookjson
   */
  static async backupAllWorldbooks(): Promise<Record<string, WorldBookJson>> {
    const ids = await this.getAllConversationIds();
    const result: Record<string, WorldBookJson> = {};
    for (const id of ids) {
      const worldbook = await this.loadJson<WorldBookJson>(this.getStorageKey(id, '_world'));
      if (worldbook) result[id] = worldbook;
    }
    return result;
  }

  /**
   * 恢复所有角色的原始 worldbookjson（需预先备份）
   * @param backupMap 角色ID到worldbookjson的映射
   */
  static async restoreAllWorldbooks(backupMap: Record<string, WorldBookJson>): Promise<void> {
    await Promise.all(Object.entries(backupMap).map(async ([id, worldbook]) => {
      await this.saveJson(this.getStorageKey(id, '_world'), worldbook);
    }));
  }

  /**
   * 批量追加全局 D 类条目到所有角色 worldbook
   * @param globalDEntries 全局 D 类条目数组
   * @param priority 优先级
   * @returns 角色ID数组
   */
  static async appendGlobalDEntriesToAllWorldbooks(
    globalDEntries: Record<string, any>, // key: entryKey, value: WorldBookEntry
    priority: '全局优先' | '角色优先'
  ): Promise<string[]> {
    const ids = await this.getAllConversationIds();
    await Promise.all(ids.map(async (id) => {
      const worldbook = await this.loadJson<WorldBookJson>(this.getStorageKey(id, '_world')) || { entries: {} };
      // 只处理 D 类条目（position=4）
      const originalEntries = worldbook.entries || {};
      // 过滤已有的全局D类条目（通过特殊标记 _global: true）
      const filteredEntries: Record<string, any> = {};
      Object.entries(originalEntries).forEach(([k, v]) => {
        if (!v || !(v as any)._global) filteredEntries[k] = v;
      });
      // 插入全局D类条目，带 _global 标记
      const globalEntriesWithFlag: Record<string, any> = {};
      Object.entries(globalDEntries).forEach(([k, v]) => {
        globalEntriesWithFlag[k] = { ...v, _global: true };
      });
      // 合并顺序
      let merged: Record<string, any> = {};
      if (priority === '全局优先') {
        // 全局D类条目插入在后（靠近ChatHistory）
        merged = { ...filteredEntries, ...globalEntriesWithFlag };
      } else {
        // 全局D类条目插入在前
        merged = { ...globalEntriesWithFlag, ...filteredEntries };
      }
      worldbook.entries = merged;
      await this.saveJson(this.getStorageKey(id, '_world'), worldbook);
    }));
    return ids;
  }

  /**
   * 删除所有角色 worldbook 中的全局 D 类条目（带 _global 标记）
   */
  static async removeGlobalDEntriesFromAllWorldbooks(): Promise<void> {
    const ids = await this.getAllConversationIds();
    await Promise.all(ids.map(async (id) => {
      const worldbook = await this.loadJson<WorldBookJson>(this.getStorageKey(id, '_world'));
      if (!worldbook || !worldbook.entries) return;
      // 移除 _global 标记的条目
      const filtered: Record<string, any> = {};
      Object.entries(worldbook.entries).forEach(([k, v]) => {
        if (!v || !(v as any)._global) filtered[k] = v;
      });
      worldbook.entries = filtered;
      await this.saveJson(this.getStorageKey(id, '_world'), worldbook);
    }));
  }

  // ========== 全局正则脚本功能 ==========

  /**
   * 保存全局正则脚本组列表（支持绑定字段）
   */
  static async saveGlobalRegexScriptGroups(groups: Array<{id: string; name: string; scripts: any[]; bindType?: string; bindCharacterId?: string}>): Promise<void> {
    try {
      await AsyncStorage.setItem('nodest_global_regex_groups', JSON.stringify(groups));
    } catch (e) {
      // ignore
    }
  }

  /**
   * 读取全局正则脚本组列表（支持绑定字段）
   */
  static async loadGlobalRegexScriptGroups(): Promise<Array<{id: string; name: string; scripts: any[]; bindType?: string; bindCharacterId?: string}>> {
    try {
      const str = await AsyncStorage.getItem('nodest_global_regex_groups');
      if (!str) return [];
      // 修正：直接返回原始对象，不做任何字段过滤
      const groups = JSON.parse(str);
      // 增加调试日志，确保字段完整
      console.log('[StorageAdapter] loadGlobalRegexScriptGroups loaded:', groups);
      return groups;
    } catch (e) {
      return [];
    }
  }

  /**
   * 保存当前选中的全局正则脚本组ID
   */
  static async saveSelectedGlobalRegexGroupId(id: string): Promise<void> {
    await AsyncStorage.setItem('nodest_selected_global_regex_group_id', id);
  }

  /**
   * 读取当前选中的全局正则脚本组ID
   */
  static async loadSelectedGlobalRegexGroupId(): Promise<string | null> {
    return await AsyncStorage.getItem('nodest_selected_global_regex_group_id');
  }

  /**
   * 兼容旧接口：保存全局正则脚本列表（仅保存第一个组的脚本）
   */
  static async saveGlobalRegexScriptList(list: Array<any>): Promise<void> {
    // 兼容旧接口，仅保存第一个组
    const groups = await this.loadGlobalRegexScriptGroups();
    if (groups.length > 0) {
      groups[0].scripts = list;
      await this.saveGlobalRegexScriptGroups(groups);
    } else {
      await this.saveGlobalRegexScriptGroups([{ id: `group_${Date.now()}`, name: '默认脚本组', scripts: list }]);
    }
  }

  /**
   * 兼容旧接口：读取全局正则脚本列表（读取第一个组的脚本）
   */
  static async loadGlobalRegexScriptList(): Promise<Array<any>> {
    const groups = await this.loadGlobalRegexScriptGroups();
    return groups.length > 0 ? groups[0].scripts : [];
  }

  /**
   * 获取所有启用的全局正则脚本（所有组合并，过滤disabled）
   */
  static async getAllEnabledGlobalRegexScripts(): Promise<Array<any>> {
    const groups = await this.loadGlobalRegexScriptGroups();
    const enabled: any[] = [];
    groups.forEach(group => {
      if (Array.isArray(group.scripts)) {
        enabled.push(...group.scripts.filter(s => !s.disabled));
      }
    });
    return enabled;
  }

  /**
   * 保存当前选中的全局正则脚本ID（兼容组模式，实际仅用于单脚本操作）
   */
  static async saveSelectedGlobalRegexScriptId(id: string): Promise<void> {
    await AsyncStorage.setItem('nodest_selected_global_regex_script_id', id);
  }

  /**
   * 读取当前选中的全局正则脚本ID
   */
  static async loadSelectedGlobalRegexScriptId(): Promise<string | null> {
    return await AsyncStorage.getItem('nodest_selected_global_regex_script_id');
  }

  /**
   * 删除指定 AI 消息及其对应的用户消息
   */
  static async deleteAiMessageByIndex(conversationId: string, messageIndex: number, apiKey: string, apiSettings?: any): Promise<boolean> {
    const core = new NodeSTCore(apiKey, apiSettings);
    return await core.deleteAiMessageByIndex(conversationId, messageIndex);
  }

  /**
   * 编辑指定 AI 消消息内容
   */
  static async editAiMessageByIndex(conversationId: string, messageIndex: number, newContent: string, apiKey: string, apiSettings?: any): Promise<boolean> {
    const core = new NodeSTCore(apiKey, apiSettings);
    return await core.editAiMessageByIndex(conversationId, messageIndex, newContent);
  }

  /**
   * 重生成指定 AI 消息
   */
  static async regenerateAiMessageByIndex(
    conversationId: string,
    messageIndex: number,
    apiKey: string,
    characterId?: string,
    customUserName?: string,
    apiSettings?: any,
    onStream?: (delta: string) => void
  ): Promise<string | null> {
    const core = new NodeSTCore(apiKey, apiSettings);
    return await core.regenerateFromMessage(conversationId, messageIndex, apiKey, characterId, customUserName, apiSettings, onStream);
  }

  /**
   * 删除指定用户消息及其对应的AI消息
   */
  static async deleteUserMessageByIndex(conversationId: string, messageIndex: number, apiKey: string, apiSettings?: any): Promise<boolean> {
    const core = new NodeSTCore(apiKey, apiSettings);
    return await core.deleteUserMessageByIndex(conversationId, messageIndex);
  }

  /**
   * 编辑指定用户消息内容
   */
  static async editUserMessageByIndex(conversationId: string, messageIndex: number, newContent: string, apiKey: string, apiSettings?: any): Promise<boolean> {
    const core = new NodeSTCore(apiKey, apiSettings);
    return await core.editUserMessageByIndex(conversationId, messageIndex, newContent);
  }

  /**
   * 备份指定会话的聊天历史到带时间戳的备份文件
   * @param conversationId 会话ID
   * @param timestamp 备份时间戳（建议为Date.now()）
   * @returns true/false
   */
  static async backupChatHistory(conversationId: string, timestamp: number): Promise<boolean> {
    // 这里无需API key，仅做本地文件操作
    const core = new NodeSTCore('');
    return await core.backupChatHistory(conversationId, timestamp);
  }

  /**
   * 通过conversationId和时间戳，从备份文件恢复聊天历史
   * @param conversationId 会话ID
   * @param timestamp 备份时间戳
   * @returns true/false
   */
  static async restoreChatHistoryFromBackup(conversationId: string, timestamp: number): Promise<boolean> {
    try {
      const backupKey = `nodest_${conversationId}_history_backup_${timestamp}`;
      const filePath = StorageAdapter.characterDataDir + backupKey + '.json';
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        console.error(`[StorageAdapter] restoreChatHistoryFromBackup: 备份文件不存在: ${filePath}`);
        return false;
      }
      const content = await FileSystem.readAsStringAsync(filePath);
      const chatHistory = JSON.parse(content);

      // === 新增：打印备份文件内容的消息数量和摘要 ===
      if (chatHistory && Array.isArray(chatHistory.parts)) {
        console.log(`[StorageAdapter] 备份文件消息数: ${chatHistory.parts.length}`);
        chatHistory.parts.slice(0, 3).forEach((msg: any, idx: number) => {
          console.log(`[StorageAdapter] 备份消息#${idx + 1}: ${msg.role} - ${msg.parts?.[0]?.text?.substring(0, 50)}`);
        });
      }
      // ===

      const core = new NodeSTCore('');
      return await core.restoreChatHistory(conversationId, chatHistory);
    } catch (error) {
      console.error('[StorageAdapter] restoreChatHistoryFromBackup error:', error);
      return false;
    }
  }

  /**
   * 向指定会话的聊天历史末尾添加一条用户消息
   * @param conversationId 会话ID
   * @param userMessage 用户消息内容
   * @returns true/false
   */
  static async addUserMessage(conversationId: string, userMessage: string): Promise<boolean> {
    return await NodeSTCore.addUserMessage(conversationId, userMessage);
  }

  /**
   * 向指定会话的聊天历史末尾添加一条AI消息
   * @param conversationId 会话ID
   * @param aiMessage AI消息内容
   * @returns true/false
   */
  static async addAiMessage(conversationId: string, aiMessage: string): Promise<boolean> {
    return await NodeSTCore.addAiMessage(conversationId, aiMessage);
  }

  /**
   * 获取指定会话的角色开场白（first_mes）
   * @param conversationId 会话ID
   * @returns first_mes 字符串或 null
   */
  static async getFirstMes(conversationId: string): Promise<string | null> {
    return await NodeSTCore.getFirstMes(conversationId);
  }

  // ========== 测试功能 ==========

  /**
   * 创建测试用的聊天历史数据（用于验证索引查找功能）
   * @param conversationId 会话ID
   * @param messageCount 要创建的消息数量
   * @returns 创建的消息列表
   */
  static async createTestChatHistory(conversationId: string, messageCount: number = 61): Promise<ChatMessage[]> {
    try {
      console.log(`[StorageAdapter] 开始创建 ${messageCount} 条测试消息到会话 ${conversationId}`);

      // 创建标准的ChatHistoryEntity结构
      const chatHistory: ChatHistoryEntity = {
        name: 'test-conversation',
        role: 'conversation',
        parts: []
      };

      const testMessages: ChatMessage[] = [];
      const baseTimestamp = Date.now() - (messageCount * 60000); // 从1小时前开始

      // 创建交替的用户和AI消息
      for (let i = 1; i <= messageCount; i++) {
        const isUserMessage = i % 2 === 1;
        const messageTimestamp = baseTimestamp + (i * 60000); // 每条消息间隔1分钟
        
        const message: ChatMessage = {
          role: isUserMessage ? "user" : "model",
          parts: [{
            text: isUserMessage ? `测试用户消息 #${Math.ceil(i/2)}` : `测试AI回复 #${Math.floor(i/2)}`
          }],
          timestamp: messageTimestamp,
          messageIndex: i - 1, // 全局索引
          is_d_entry: false
        };

        chatHistory.parts.push(message);
        testMessages.push(message);
      }

      // 保存到存储
      await this.saveJson(this.getStorageKey(conversationId, '_history'), chatHistory);
      
      console.log(`[StorageAdapter] 成功创建 ${messageCount} 条测试消息`);
      return testMessages;
    } catch (error) {
      console.error('[StorageAdapter] 创建测试消息失败:', error);
      throw error;
    }
  }

  /**
   * 验证消息索引查找功能
   * @param conversationId 会话ID
   * @param messageId 消息ID（时间戳格式）
   * @param role 消息角色
   * @returns 验证结果
   */
  static async verifyMessageIndexLookup(
    conversationId: string, 
    messageId: string, 
    role: 'user' | 'model'
  ): Promise<{
    success: boolean;
    globalIndex: number;
    roleIndex: number;
    totalMessages: number;
    totalRoleMessages: number;
    message?: ChatMessage;
    error?: string;
  }> {
    try {
      console.log(`[StorageAdapter] 验证消息索引查找: ${messageId}, role: ${role}`);

      // 获取完整的聊天历史
      const completeHistory = await this.getCleanChatHistory(conversationId);
      
      if (completeHistory.length === 0) {
        return {
          success: false,
          globalIndex: -1,
          roleIndex: -1,
          totalMessages: 0,
          totalRoleMessages: 0,
          error: '没有找到聊天历史'
        };
      }

      // 解析messageId中的时间戳
      const timestampMatch = messageId.match(/^(\d+)-/);
      if (!timestampMatch) {
        return {
          success: false,
          globalIndex: -1,
          roleIndex: -1,
          totalMessages: completeHistory.length,
          totalRoleMessages: completeHistory.filter(m => m.role === role && !m.is_first_mes).length,
          error: 'messageId格式无效'
        };
      }

      const targetTimestamp = parseInt(timestampMatch[1]);
      
      // 查找匹配的消息（排除 first_mes，与 message-service.ts 的逻辑保持一致）
      let foundMessage: ChatMessage | undefined;
      let globalIndex = -1;

      for (let i = 0; i < completeHistory.length; i++) {
        const msg = completeHistory[i];
        if (msg.role === role && !msg.is_first_mes && msg.timestamp && 
            Math.abs(msg.timestamp - targetTimestamp) < 1000) { // 允许1秒误差
          foundMessage = msg;
          globalIndex = i;
          break;
        }
      }

      if (!foundMessage || globalIndex === -1) {
        return {
          success: false,
          globalIndex: -1,
          roleIndex: -1,
          totalMessages: completeHistory.length,
          totalRoleMessages: completeHistory.filter(m => m.role === role && !m.is_first_mes).length,
          error: `未找到匹配的${role}消息`
        };
      }

      // 计算在同类型消息中的索引（1-based，与 NodeSTCore 期望一致，排除 first_mes）
      let roleIndex = 0;
      for (let i = 0; i <= globalIndex; i++) {
        if (completeHistory[i].role === role && !completeHistory[i].is_first_mes) {
          if (i === globalIndex) {
            roleIndex++; // 包含当前消息，使其成为 1-based
            break;
          }
          roleIndex++;
        }
      }

      const totalRoleMessages = completeHistory.filter(m => m.role === role && !m.is_first_mes).length;

      console.log(`[StorageAdapter] 索引查找结果: globalIndex=${globalIndex}, roleIndex=${roleIndex}`);

      return {
        success: true,
        globalIndex,
        roleIndex,
        totalMessages: completeHistory.length,
        totalRoleMessages,
        message: foundMessage
      };

    } catch (error) {
      console.error('[StorageAdapter] 验证索引查找失败:', error);
      return {
        success: false,
        globalIndex: -1,
        roleIndex: -1,
        totalMessages: 0,
        totalRoleMessages: 0,
        error: `验证过程出错: ${error}`
      };
    }
  }

  /**
   * 获取测试用的消息索引映射表
   * @param conversationId 会话ID
   * @returns 消息索引映射
   */
  static async getTestMessageIndexMap(conversationId: string): Promise<{
    userMessages: Array<{ globalIndex: number; roleIndex: number; timestamp: number; text: string }>;
    aiMessages: Array<{ globalIndex: number; roleIndex: number; timestamp: number; text: string }>;
    totalMessages: number;
  }> {
    try {
      const completeHistory = await this.getCleanChatHistory(conversationId);
      
      const userMessages: Array<{ globalIndex: number; roleIndex: number; timestamp: number; text: string }> = [];
      const aiMessages: Array<{ globalIndex: number; roleIndex: number; timestamp: number; text: string }> = [];
      
      let userCount = 0;
      let aiCount = 0;

      completeHistory.forEach((msg, globalIndex) => {
        const text = msg.parts?.[0]?.text || '';
        const timestamp = msg.timestamp || 0;

        // 过滤掉 first_mes，与 message-service.ts 的逻辑保持一致
        if (msg.role === 'user' && !msg.is_first_mes) {
          userMessages.push({
            globalIndex,
            roleIndex: userCount + 1, // 改为 1-based，与 NodeSTCore 期望一致
            timestamp,
            text
          });
          userCount++;
        } else if ((msg.role === 'model' || msg.role === 'assistant') && !msg.is_first_mes) {
          aiMessages.push({
            globalIndex,
            roleIndex: aiCount + 1, // 改为 1-based，与 NodeSTCore 期望一致
            timestamp,
            text
          });
          aiCount++;
        }
      });

      return {
        userMessages,
        aiMessages,
        totalMessages: completeHistory.length
      };

    } catch (error) {
      console.error('[StorageAdapter] 获取测试索引映射失败:', error);
      return {
        userMessages: [],
        aiMessages: [],
        totalMessages: 0
      };
    }
  }

  /**
   * 清理测试数据
   * @param conversationId 会话ID
   * @returns 是否成功
   */
  static async cleanupTestData(conversationId: string): Promise<boolean> {
    try {
      console.log(`[StorageAdapter] 清理测试数据: ${conversationId}`);

      // 删除聊天历史
      const historyKey = this.getStorageKey(conversationId, '_history');
      await this.saveJson(historyKey, { 
        name: 'empty-conversation',
        role: 'conversation',
        parts: []
      });

      console.log(`[StorageAdapter] 测试数据清理完成`);
      return true;
    } catch (error) {
      console.error('[StorageAdapter] 清理测试数据失败:', error);
      return false;
    }
  }
}
