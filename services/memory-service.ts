import { ChatHistoryEntity, ChatMessage, GeminiMessage } from '@/shared/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiSettings } from '@/utils/settings-helper';
import { unifiedGenerateContent } from '@/services/unified-api';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';

const MEMORY_SUMMARY_STORAGE_KEY = 'memory_summary_prompt_config';
const SCRIPT_SUMMARY_STORAGE_KEY = 'script_summary_prompt_config'; // New storage key for script summaries
const MEMORY_SERVICE_STORAGE_KEY = 'memory_service_config';
const SUMMARIES_STORAGE_PREFIX = 'conversation_summaries_'; // New storage key prefix for summaries

interface MemorySummarySettings {
  enabled: boolean;
  summaryThreshold: number; // Number of characters to trigger summary
  summaryLength: number;    // Max length of the summary in characters
  lastSummarizedAt: number; // Timestamp of last summarization
}

interface MemoryServiceConfig {
  summaryThreshold: number;
  summaryLength: number;
  summaryRangePercent: { start: number; end: number } | null;
}

interface SummaryData {
  summary: string;
  isMemorySummary: true;
  timestamp: number;
  originalMessagesRange: {
    start: number;
    end: number;
  };
}

interface MemorySummaryPromptConfig {
  inputText: string;
  presetJson: string;
  worldBookJson: string;
  adapterType: 'gemini' | 'openrouter' | 'openai-compatible' | 'cradlecloud';
  messageArray: any[];
}

export class MemoryService {
  private static instance: MemoryService;
  
  // Private constructor - singleton pattern
  private constructor() {}
  
  // Get singleton instance
  public static getInstance(): MemoryService {
    if (!MemoryService.instance) {
      MemoryService.instance = new MemoryService();
    }
    return MemoryService.instance;
  }
  
  // Get memory settings storage key
  private getSettingsKey(characterId: string): string {
    return `memory_settings_${characterId}`;
  }
  
  // Get memory summary storage key
  private getSummaryKey(conversationId: string): string {
    return `memory_summary_${conversationId}`;
  }
  
  // Save memory settings
  public async saveSettings(characterId: string, settings: MemorySummarySettings): Promise<void> {
    try {
      await AsyncStorage.setItem(
        this.getSettingsKey(characterId),
        JSON.stringify(settings)
      );
      console.log(`[MemoryService] Saved settings for character ${characterId}:`, settings);
    } catch (error) {
      console.error(`[MemoryService] Failed to save settings for character ${characterId}:`, error);
      throw error;
    }
  }
  
  // Load memory settings
  public async loadSettings(characterId: string): Promise<MemorySummarySettings> {
    try {
      const data = await AsyncStorage.getItem(this.getSettingsKey(characterId));
      
      if (data) {
        const settings = JSON.parse(data) as MemorySummarySettings;
        return settings;
      }
      
      // Return default settings if none found
      return {
        enabled: false,
        summaryThreshold: 6000, // Default: 6000 characters
        summaryLength: 1000,    // Default: 1000 characters
        lastSummarizedAt: 0
      };
    } catch (error) {
      console.error(`[MemoryService] Failed to load settings for character ${characterId}:`, error);
      
      // Return default settings on error
      return {
        enabled: false,
        summaryThreshold: 6000,
        summaryLength: 1000,
        lastSummarizedAt: 0
      };
    }
  }
  
  /**
   * Load memory service configuration from storage
   */
  private async loadMemoryServiceConfig(): Promise<MemoryServiceConfig | null> {
    try {
      const saved = await AsyncStorage.getItem(MEMORY_SERVICE_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('[MemoryService] 加载记忆服务配置失败:', e);
    }
    // Fallback to UtilSettings defaults when never saved
    try {
      const { defaultMemoryServiceConfig } = require('@/constants/utilDefaults');
      return defaultMemoryServiceConfig as MemoryServiceConfig;
    } catch {}
    return null;
  }

  // Check if chat history needs summarization
  public async checkAndSummarize(
    conversationId: string,
    characterId: string,
    chatHistory: ChatHistoryEntity,
    apiKey: string,
    apiSettings?: {
      apiProvider: 'gemini' | 'openrouter' | 'openai-compatible',
      openrouter?: {
        enabled?: boolean;
        apiKey?: string;
        model?: string;
      }
    },
    summaryRangePercent?: { start: number, end: number } 
  ): Promise<ChatHistoryEntity> {
    try {
      const settings = await this.loadSettings(characterId);
      if (!settings.enabled) {
        return chatHistory;
      }
      const memoryServiceConfig = await this.loadMemoryServiceConfig();
      const summaryThreshold = memoryServiceConfig?.summaryThreshold || settings.summaryThreshold;

      // Use StorageAdapter.getCleanChatHistory to get messages
      const cleanMessages = await StorageAdapter.getCleanChatHistory(conversationId);
      const totalTextLength = cleanMessages.reduce((sum, msg) => sum + (msg.parts?.[0]?.text?.length || 0), 0);
      console.log(`[MemoryService] Chat history length: ${totalTextLength} characters`);

      if (totalTextLength < summaryThreshold) {
        console.log(`[MemoryService] Below summarization threshold (${summaryThreshold}), skipping`);
        return chatHistory;
      }

      const finalSummaryRangePercent = memoryServiceConfig?.summaryRangePercent || summaryRangePercent;

      // Reconstruct ChatHistoryEntity for summarization
      const cleanChatHistory: ChatHistoryEntity = {
        ...chatHistory,
        parts: cleanMessages
      };

      return await this.generateSummary(
        conversationId,
        cleanChatHistory,
        settings,
        apiKey,
        apiSettings,
        finalSummaryRangePercent,
        false // 非强制模式
      );
    } catch (error) {
      console.error(`[MemoryService] Error in checkAndSummarize for ${conversationId}:`, error);
      return chatHistory;
    }
  }
  
  // Calculate total length of chat history (excluding summaries)
  private calculateChatHistoryLength(chatHistory: ChatHistoryEntity): number {
    let totalLength = 0;
    
    for (const message of chatHistory.parts) {
      // Skip summary messages
      if (message.parts?.[0]?.text && !(message as any).isMemorySummary) {
        totalLength += message.parts[0].text.length;
      }
    }
    
    return totalLength;
  }
  
  /**
   * Load saved memory summary prompt configuration (for character conversations)
   */
  private async loadMemorySummaryConfig(): Promise<MemorySummaryPromptConfig | null> {
    try {
      const saved = await AsyncStorage.getItem(MEMORY_SUMMARY_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('[MemoryService] 加载记忆总结提示词配置失败:', e);
    }
    // Fallback to UtilSettings defaults when never saved
    try {
      const { defaultMemorySummaryPromptConfig } = require('@/constants/utilDefaults');
      return defaultMemorySummaryPromptConfig as MemorySummaryPromptConfig;
    } catch {}
    return null;
  }

  /**
   * Load saved script summary prompt configuration (for scripts)
   */
  private async loadScriptSummaryConfig(): Promise<MemorySummaryPromptConfig | null> {
    try {
      const saved = await AsyncStorage.getItem(SCRIPT_SUMMARY_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('[MemoryService] 加载剧本总结提示词配置失败:', e);
    }
    // Fallback to UtilSettings defaults when never saved
    try {
      const { defaultScriptSummaryPromptConfig } = require('@/constants/utilDefaults');
      return defaultScriptSummaryPromptConfig as MemorySummaryPromptConfig;
    } catch {}
    return null;
  }

  /**
   * Get adapter type from API provider setting
   */
  private getAdapterType(apiProvider?: string): 'gemini' | 'openrouter' | 'openai-compatible' | 'cradlecloud' {
    if (!apiProvider) return 'gemini';
    const provider = apiProvider.toLowerCase();
    if (provider.includes('cradlecloud')) {
      return 'cradlecloud';
    } else if (provider.includes('gemini')) {
      return 'gemini';
    } else if (provider.includes('openrouter')) {
      return 'openrouter';
    } else if (provider.includes('openai')) {
      return 'openai-compatible';
    }
    return 'gemini';
  }



  // Check if a message is a memory summary
  public isMemorySummary(message: any): boolean {
    return message && message.isMemorySummary === true;
  }

  /**
   * Generate summary of chat history for a specified message range.
   * @param conversationId 会话ID
   * @param chatHistory 聊天历史
   * @param settings 摘要设置
   * @param apiKey API密钥
   * @param apiSettings API设置
   * @param summaryRangePercent 可选，指定需要摘要的消息区间（如 {start: 30, end: 70} 表示30%到70%的消息）
   * @param forceGenerate 可选，是否强制生成总结（跳过长度检查）
   */
  public async generateSummary(
    conversationId: string,
    chatHistory: ChatHistoryEntity, 
    settings: MemorySummarySettings,
    apiKey: string,
    apiSettings?: {
      apiProvider: 'gemini' | 'openrouter' | 'openai-compatible',
      openrouter?: {
        enabled?: boolean;
        apiKey?: string;
        model?: string;
      }
    },
    summaryRangePercent?: { start: number, end: number },
    forceGenerate?: boolean
  ): Promise<ChatHistoryEntity> {
    try {
      console.log(`[MemoryService] generateSummary called with forceGenerate=${forceGenerate}`);
      
      // Always use clean chat history from StorageAdapter
      const cleanMessages = await StorageAdapter.getCleanChatHistory(conversationId);
      const messages = cleanMessages;

      // Load memory service config to get updated settings
      const memoryServiceConfig = await this.loadMemoryServiceConfig();
      const summaryLength = memoryServiceConfig?.summaryLength || settings.summaryLength;
      const finalSummaryRangePercent = memoryServiceConfig?.summaryRangePercent || summaryRangePercent;

      const totalTextLength = messages.reduce((sum, msg) => sum + (msg.parts?.[0]?.text?.length || 0), 0);
      console.log(`[MemoryService] Chat history total length: ${totalTextLength} characters`);
      console.log(`[MemoryService] finalSummaryRangePercent:`, finalSummaryRangePercent);

      let startIdx: number, endIdx: number;
      
      // 新的百分比计算逻辑
      if (finalSummaryRangePercent && typeof finalSummaryRangePercent.start === 'number' && typeof finalSummaryRangePercent.end === 'number') {
        const startPercent = finalSummaryRangePercent.start;
        const endPercent = finalSummaryRangePercent.end;

        // 验证百分比范围的有效性
        if (startPercent < 0 || endPercent > 100 || startPercent >= endPercent) {
          console.warn(`[MemoryService] Invalid percentage range [${startPercent}, ${endPercent}], falling back to default.`);
          // 回退到默认逻辑
          if (messages.length <= 6 || forceGenerate) {
            startIdx = 0;
            endIdx = messages.length;
          } else {
            startIdx = 3;
            endIdx = messages.length - 3;
          }
        } else {
          console.log(`[MemoryService] Using percentage summary range: [${startPercent}%, ${endPercent}%]`);
          startIdx = Math.floor(messages.length * (startPercent / 100));
          endIdx = Math.ceil(messages.length * (endPercent / 100));

          // 确保索引在安全范围内
          if (startIdx < 0) startIdx = 0;
          if (endIdx > messages.length) endIdx = messages.length;
          
          console.log(`[MemoryService] Calculated indices from percentages: startIdx=${startIdx}, endIdx=${endIdx} (total messages: ${messages.length})`);
        }
      } else {
        // 保留原有的默认总结逻辑（当未设置自定义区间时）
        if (messages.length <= 6 || forceGenerate) {
          startIdx = 0;
          endIdx = messages.length;
          console.log(`[MemoryService] ${forceGenerate ? 'Force generate mode' : 'Few messages detected'}, summarizing all ${messages.length} messages`);
        } else {
          startIdx = 3;
          endIdx = messages.length - 3;
          console.log(`[MemoryService] Using default summary range: [${startIdx}, ${endIdx - 1}]`);
        }
      }

      // 后续逻辑（如检查区间大小等）
      if (endIdx - startIdx < 1 && !forceGenerate) {
        console.log(`[MemoryService] summaryRange too small, skipping`);
        return { ...chatHistory, parts: messages };
      }
      
      // 如果forceGenerate为true，即使范围很小也要强制生成
      if (forceGenerate && endIdx - startIdx < 1) {
        startIdx = 0;
        endIdx = messages.length;
        console.log(`[MemoryService] Force generate mode with small range, summarizing all ${messages.length} messages`);
      }

      const messagesToSummarize = messages.slice(startIdx, endIdx);

      if (messagesToSummarize.length === 0) {
        console.log(`[MemoryService] No messages to summarize after range selection, skipping`);
        return { ...chatHistory, parts: messages };
      }

  const formattedMessages = messagesToSummarize.map(msg => {
        const role = msg.role === 'user' ? 'User' : 'Character';
        return `${role}: ${msg.parts?.[0]?.text || ''}`;
      }).join('\n\n');

      // 读取保存的记忆总结提示词配置
  const savedConfig = await this.loadMemorySummaryConfig();
  if (!savedConfig || !savedConfig.messageArray || savedConfig.messageArray.length === 0) {
        console.warn('[MemoryService] 未找到保存的记忆总结提示词配置，使用默认方式');
        // Fallback to original method
        // === 优化：支持 openai-compatible 和 cradlecloud 适配器 ===
        const chatSettings = getApiSettings();
        let adapter: any;
        const provider = (apiSettings?.apiProvider || chatSettings.apiProvider) as 'gemini' | 'openrouter' | 'openai-compatible' | 'cradlecloud';
        if (
          provider === 'cradlecloud' &&
          chatSettings?.cradlecloud?.enabled
        ) {
          const { CradleCloudAdapter } = require('@/NodeST/nodest/utils/cradlecloud-adapter');
          adapter = new CradleCloudAdapter();
          console.log('[MemoryService] Using CradleCloud API for summary generation');
        } else if (
          provider === 'openrouter' &&
          apiSettings?.openrouter?.enabled &&
          apiSettings?.openrouter?.apiKey
        ) {
          const OpenRouterAdapter = require('@/utils/openrouter-adapter').OpenRouterAdapter;
          adapter = new OpenRouterAdapter(
            apiSettings.openrouter.apiKey,
            apiSettings.openrouter.model || 'openai/gpt-3.5-turbo'
          );
          console.log('[MemoryService] Using OpenRouter API for summary generation');
        } else if (
          provider === 'openai-compatible'
        ) {
          // 优先从 settings-helper 获取 openai-compatible 配置
          const { OpenAIcompatible } = chatSettings;
          const OpenAIAdapter = require('@/NodeST/nodest/utils/openai-adapter').OpenAIAdapter;
          adapter = new OpenAIAdapter({
            endpoint: OpenAIcompatible?.endpoint || '',
            apiKey: OpenAIcompatible?.apiKey || '',
            model: OpenAIcompatible?.model || 'gpt-3.5-turbo',
            stream: OpenAIcompatible?.stream,
            temperature: OpenAIcompatible?.temperature,
            max_tokens: OpenAIcompatible?.max_tokens
          });
          console.log('[MemoryService] Using OpenAI-compatible API for summary generation');
        } else {
          const GeminiAdapter = require('@/NodeST/nodest/utils/gemini-adapter').GeminiAdapter;
          adapter = new GeminiAdapter(apiKey);
          console.log('[MemoryService] Using Gemini API for summary generation');
        }

        const prompt: GeminiMessage[] = [
          {
            role: "user",
            parts: [{
              text: `Please create a concise summary of the following conversation. Your summary should:
1. Extract the key information, events, topics discussed, and important details
2. Maintain continuity of the narrative without using vague references
3. Preserve character intentions, emotions, and any important commitments or plans mentioned
4. Be no longer than approximately ${summaryLength} characters
5. Focus on facts and content, rather than meta-descriptions of the conversation
6. Make the summary helpful for continuing the conversation

Here is the conversation to summarize:

${formattedMessages}`
            }]
          }
        ];

        let summaryText: string;
        if (provider === 'cradlecloud') {
          // cradlecloud 适配器直接用 ChatMessage 格式
          summaryText = await adapter.generateContent(prompt);
        } else {
          summaryText = await adapter.generateContent(prompt);
        }

        // 构造摘要消息
        const summaryMessage: ChatMessage & SummaryData = {
          role: "user",
          parts: [{
            text: `--- CONVERSATION SUMMARY (AI-GENERATED, NOT VISIBLE TO USER) ---\n${summaryText}\n--- END OF SUMMARY ---`
          }],
          summary: summaryText,
          isMemorySummary: true,
          timestamp: Date.now(),
          originalMessagesRange: {
            start: startIdx,
            end: endIdx - 1
          }
        };
        console.log(`[MemoryService] Generated summary: ${summaryText}`);
        // 组装新的聊天历史
        const newMessages = [
          ...messages.slice(0, startIdx),
          summaryMessage,
          ...messages.slice(endIdx)
        ];

        // 更新设置
        settings.lastSummarizedAt = Date.now();
        await this.saveSettings(conversationId, settings);

        // === 修复点：保存摘要到专用存储 ===
        await this.saveSummaryToStorage(conversationId, summaryMessage);

        console.log(`[MemoryService] Successfully generated summary using fallback method, reducing ${messagesToSummarize.length} messages to 1 summary`);

        return {
          ...chatHistory,
          parts: newMessages
        };
      }

      // 获取适配器类型和API设置
      const chatSettings = getApiSettings();
      const adapterType = this.getAdapterType(chatSettings?.apiProvider) as 'gemini' | 'openrouter' | 'openai-compatible';

      // === 优化：openai-compatible 时优先用 OpenAIcompatible 字段的 apiKey ===
      const apiKeyToUse =
        adapterType === 'openai-compatible'
          ? chatSettings?.OpenAIcompatible?.apiKey || apiKey
          : chatSettings?.apiKey || apiKey;

      // 构建统一API选项
      const apiOptions = {
        adapter: adapterType,
        apiKey: apiKeyToUse,
        characterId: conversationId,
        openrouterConfig: chatSettings?.openrouter,
        openaiConfig: chatSettings?.OpenAIcompatible, // 修正字段名称以匹配接口
        geminiConfig: {
          additionalKeys: chatSettings?.additionalGeminiKeys,
          useKeyRotation: chatSettings?.useGeminiKeyRotation,
          useModelLoadBalancing: chatSettings?.useGeminiModelLoadBalancing
        }
      };

      // 为消息数组添加实际对话内容
  const messageArrayWithContent = [...savedConfig.messageArray];
      // 将对话内容添加到最后一个用户消息中
      if (messageArrayWithContent.length > 0) {
        const lastMessageIndex = messageArrayWithContent.length - 1;
        const lastMessage = messageArrayWithContent[lastMessageIndex];
        if (lastMessage.role === 'user') {
          if ('content' in lastMessage) {
    lastMessage.content = (lastMessage.content || '').replace('<INPUT_TEXT>', '') + `\n\n对话内容：\n${formattedMessages}`;
          } else if (lastMessage.parts && lastMessage.parts[0]) {
    lastMessage.parts[0].text = (lastMessage.parts[0].text || '').replace('<INPUT_TEXT>', '') + `\n\n对话内容：\n${formattedMessages}`;
          }
        } else {
          // 如果最后一条不是用户消息，添加新的用户消息
          messageArrayWithContent.push({
            role: 'user',
            content: `对话内容：\n${formattedMessages}`
          });
        }
      } else {
        // 如果没有消息数组，创建默认消息
        messageArrayWithContent.push({
          role: 'user',
          content: `请总结以下对话：\n${formattedMessages}`
        });
      }

      // 调用统一API生成内容
      console.log(`[MemoryService] Requesting summary from unified API for ${messagesToSummarize.length} messages with custom settings`);
      const summaryText = await unifiedGenerateContent(
        messageArrayWithContent,
        apiOptions
      );

      // 构造摘要消息
      const summaryMessage: ChatMessage & SummaryData = {
        role: "user",
        parts: [{ 
          text: `--- CONVERSATION SUMMARY (AI-GENERATED, NOT VISIBLE TO USER) ---\n${summaryText}\n--- END OF SUMMARY ---` 
        }],
        summary: summaryText,
        isMemorySummary: true,
        timestamp: Date.now(),
        originalMessagesRange: {
          start: startIdx,
          end: endIdx - 1
        }
      };

      // 保存摘要到专用存储
      await this.saveSummaryToStorage(conversationId, summaryMessage);

      // 组装新的聊天历史
      const newMessages = [
        ...messages.slice(0, startIdx),
        summaryMessage,
        ...messages.slice(endIdx)
      ];

      settings.lastSummarizedAt = Date.now();
      await this.saveSettings(conversationId, settings);

      return {
        ...chatHistory,
        parts: newMessages
      };
    } catch (error) {
      console.error(`[MemoryService] Error generating summary:`, error);
      return chatHistory;
    }
  }

  /**
   * 立即总结记忆：基于UtilSetting设置和当前聊天记录，强制执行总结
   * @param conversationId 会话ID
   * @param characterId 角色ID
   * @param apiKey API密钥
   * @param apiSettings API设置
   * @param summaryRangePercent 可选，指定需要摘要的消息区间百分比
   * @returns 是否成功
   */
  public async summarizeMemoryNow(
    conversationId: string,
    characterId: string,
    apiKey?: string,
    apiSettings?: {
      apiProvider: 'gemini' | 'openrouter' | 'openai-compatible',
      openrouter?: {
        enabled?: boolean;
        apiKey?: string;
        model?: string;
      }
    },
    summaryRangePercent?: { start: number, end: number }
  ): Promise<boolean> {
    try {
      // Use StorageAdapter.getCleanChatHistory to get messages
      const cleanMessages = await StorageAdapter.getCleanChatHistory(conversationId);
      if (!cleanMessages || cleanMessages.length === 0) throw new Error('未找到聊天历史');
      // Reconstruct ChatHistoryEntity
      const chatHistory: ChatHistoryEntity = {
        parts: cleanMessages
      } as any;

      // 加载角色记忆设置
      const settings = await this.loadSettings(characterId);

      // 强制调用 generateSummary，使用 memory service config 的设置
      const summarized = await this.generateSummary(
        conversationId,
        chatHistory,
        settings,
        apiKey || '',
        apiSettings,
        summaryRangePercent,
        true // 强制模式
      );

      // 保存新历史（优先保存到 expo-file-system）
      try {
        const fileKey = `nodest_${conversationId}_history`;
        const filePath = (await import('expo-file-system')).default.documentDirectory + `nodest_characters/${fileKey}.json`;
        await (await import('expo-file-system')).default.writeAsStringAsync(filePath, JSON.stringify(summarized));
      } catch (e) {
        const storageKey = `nodest_${conversationId}_history`;
        await AsyncStorage.setItem(storageKey, JSON.stringify(summarized));
      }
      return true;
    } catch (e) {
      console.error('[MemoryService] summarizeMemoryNow error:', e);
      return false;
    }
  }

  /**
   * 获取所有summary消息（按timestamp倒序）
   */
  public async getAllSummaries(conversationId: string): Promise<(ChatMessage & SummaryData)[]> {
    try {
      // 首先从专用存储中获取摘要
      const storageKey = `${SUMMARIES_STORAGE_PREFIX}${conversationId}`;
      const storedSummaries = await this.getSummariesFromStorage(conversationId);
      
      // 然后从聊天历史中读取可能的遗留摘要
      const cleanMessages = await StorageAdapter.getCleanChatHistory(conversationId);
      const historySummaries = cleanMessages.filter(msg => this.isMemorySummary(msg)) as (ChatMessage & SummaryData)[];
      
      // 合并两种来源的摘要，并确保没有重复（基于timestamp）
      const timestampSet = new Set(storedSummaries.map(s => s.timestamp));
      const uniqueHistorySummaries = historySummaries.filter(s => !timestampSet.has(s.timestamp));
      
      // 合并摘要
      const allSummaries = [...storedSummaries, ...uniqueHistorySummaries];
      
      // 确保所有摘要都包含ChatMessage所需的属性
      const validSummaries = allSummaries.map(summary => ({
        role: 'user',
        parts: [{ text: `--- CONVERSATION SUMMARY ---\n${summary.summary}\n--- END OF SUMMARY ---` }],
        ...summary
      }));
      
      // 按timestamp倒序
      return validSummaries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } catch (error) {
      console.error(`[MemoryService] Error getting summaries:`, error);
      return [];
    }
  }

  /**
   * 删除指定timestamp的summary消息
   */
  public async deleteSummary(conversationId: string, summaryTimestamp: number): Promise<boolean> {
    try {
      // 1. 从专用存储中删除
      const summaries = await this.getSummariesFromStorage(conversationId);
      const filteredSummaries = summaries.filter(summary => summary.timestamp !== summaryTimestamp);
      
      if (filteredSummaries.length !== summaries.length) {
        // 找到并删除了摘要
        const storageKey = `${SUMMARIES_STORAGE_PREFIX}${conversationId}`;
        await AsyncStorage.setItem(storageKey, JSON.stringify(filteredSummaries));
        console.log(`[MemoryService] Deleted summary from dedicated storage with timestamp ${summaryTimestamp}`);
      }
      
      // 2. 从聊天历史中删除（向后兼容）
      const cleanMessages = await StorageAdapter.getCleanChatHistory(conversationId);
      const filteredMessages = cleanMessages.filter(msg => !(msg.isMemorySummary && msg.timestamp === summaryTimestamp));
      
      if (filteredMessages.length !== cleanMessages.length) {
        // 构建新的聊天历史实体
        const updatedHistory: ChatHistoryEntity = {
          parts: filteredMessages
        } as any;
        
        // 保存回存储（优先文件系统）
        try {
          const fileKey = `nodest_${conversationId}_history`;
          const FileSystem = (await import('expo-file-system')).default;
          const filePath = FileSystem.documentDirectory + `nodest_characters/${fileKey}.json`;
          await FileSystem.writeAsStringAsync(filePath, JSON.stringify(updatedHistory));
          console.log(`[MemoryService] Successfully deleted summary from chat history and saved to file system`);
        } catch (fsError) {
          console.log(`[MemoryService] Falling back to AsyncStorage`, fsError);
          const storageKey = `nodest_${conversationId}_history`;
          await AsyncStorage.setItem(storageKey, JSON.stringify(updatedHistory));
        }
      }
      
      return true;
    } catch (error) {
      console.error(`[MemoryService] Error deleting summary:`, error);
      return false;
    }
  }

  /**
   * 为剧本服务提供的专用总结方法
   * 直接对文本内容进行总结，不进行楼层区间判断
   * @param scriptId 剧本ID
   * @param contentToSummarize 待总结的文本内容
   * @param apiKey API密钥
   * @param apiSettings API设置
   * @returns 总结后的文本内容
   */
  public async summarizeScriptContent(
    scriptId: string,
    contentToSummarize: string,
    apiKey?: string,
    apiSettings?: {
      apiProvider: 'gemini' | 'openrouter' | 'openai-compatible',
      openrouter?: {
        enabled?: boolean;
        apiKey?: string;
        model?: string;
      }
    }
  ): Promise<string> {
    try {
      console.log(`[MemoryService] summarizeScriptContent called for script ${scriptId}`);
      console.log(`[MemoryService] Content length: ${contentToSummarize.length} characters`);

      if (!contentToSummarize || contentToSummarize.trim().length === 0) {
        console.warn(`[MemoryService] No content to summarize for script ${scriptId}`);
        return '';
      }

      // 读取保存的记忆总结提示词配置
      const savedConfig = await this.loadMemorySummaryConfig();
      if (!savedConfig || !savedConfig.messageArray || savedConfig.messageArray.length === 0) {
        console.warn('[MemoryService] 未找到保存的记忆总结提示词配置，使用默认方式');
        
        // 使用默认的总结逻辑
        const chatSettings = getApiSettings();
        let adapter: any;
        const provider = (apiSettings?.apiProvider || chatSettings.apiProvider) as 'gemini' | 'openrouter' | 'openai-compatible' | 'cradlecloud';
        
        if (
          provider === 'cradlecloud' &&
          chatSettings?.cradlecloud?.enabled
        ) {
          const { CradleCloudAdapter } = require('@/NodeST/nodest/utils/cradlecloud-adapter');
          adapter = new CradleCloudAdapter();
          console.log('[MemoryService] Using CradleCloud API for script content summary');
        } else if (
          provider === 'openrouter' &&
          apiSettings?.openrouter?.enabled &&
          apiSettings?.openrouter?.apiKey
        ) {
          const OpenRouterAdapter = require('@/utils/openrouter-adapter').OpenRouterAdapter;
          adapter = new OpenRouterAdapter(
            apiSettings.openrouter.apiKey,
            apiSettings.openrouter.model || 'openai/gpt-3.5-turbo'
          );
          console.log('[MemoryService] Using OpenRouter API for script content summary');
        } else if (
          provider === 'openai-compatible'
        ) {
          const { OpenAIcompatible } = chatSettings;
          const OpenAIAdapter = require('@/NodeST/nodest/utils/openai-adapter').OpenAIAdapter;
          adapter = new OpenAIAdapter({
            endpoint: OpenAIcompatible?.endpoint || '',
            apiKey: OpenAIcompatible?.apiKey || '',
            model: OpenAIcompatible?.model || 'gpt-3.5-turbo',
            stream: OpenAIcompatible?.stream,
            temperature: OpenAIcompatible?.temperature,
            max_tokens: OpenAIcompatible?.max_tokens
          });
          console.log('[MemoryService] Using OpenAI-compatible API for script content summary');
        } else {
          const GeminiAdapter = require('@/NodeST/nodest/utils/gemini-adapter').GeminiAdapter;
          adapter = new GeminiAdapter(apiKey || chatSettings?.apiKey || '');
          console.log('[MemoryService] Using Gemini API for script content summary');
        }

        const prompt: GeminiMessage[] = [
          {
            role: "user",
            parts: [{
              text: `请对以下剧本内容进行总结。你的总结应该：
1. 提取关键剧情发展、人物行为和事件
2. 保持剧情的连贯性和逻辑关系
3. 保留重要的角色互动和情感变化
4. 简洁明了，便于后续剧情发展使用
5. 长度控制在1000字符以内

待总结的剧本内容：

${contentToSummarize}`
            }]
          }
        ];

        const summaryText = await adapter.generateContent(prompt);
        console.log(`[MemoryService] Generated script summary using fallback method: ${summaryText.substring(0, 100)}...`);
        return summaryText;
      }

      // 获取适配器类型和API设置
      const chatSettings = getApiSettings();
      const adapterType = this.getAdapterType(chatSettings?.apiProvider) as 'gemini' | 'openrouter' | 'openai-compatible';

      // 优先用 OpenAIcompatible 字段的 apiKey
      const apiKeyToUse =
        adapterType === 'openai-compatible'
          ? chatSettings?.OpenAIcompatible?.apiKey || apiKey || ''
          : chatSettings?.apiKey || apiKey || '';

      // 构建统一API选项
      const apiOptions = {
        adapter: adapterType,
        apiKey: apiKeyToUse,
        characterId: scriptId,
        openrouterConfig: chatSettings?.openrouter,
        openaiConfig: chatSettings?.OpenAIcompatible,
        geminiConfig: {
          additionalKeys: chatSettings?.additionalGeminiKeys,
          useKeyRotation: chatSettings?.useGeminiKeyRotation,
          useModelLoadBalancing: chatSettings?.useGeminiModelLoadBalancing
        }
      };

      // 为消息数组添加剧本内容
      const messageArrayWithContent = [...savedConfig.messageArray];
      
      // 将剧本内容添加到最后一个用户消息中
      if (messageArrayWithContent.length > 0) {
        const lastMessageIndex = messageArrayWithContent.length - 1;
        const lastMessage = messageArrayWithContent[lastMessageIndex];
        if (lastMessage.role === 'user') {
          if ('content' in lastMessage) {
            lastMessage.content = (lastMessage.content || '').replace('<INPUT_TEXT>', '') + `\n\n待总结的剧本内容：\n${contentToSummarize}`;
          } else if (lastMessage.parts && lastMessage.parts[0]) {
            lastMessage.parts[0].text = (lastMessage.parts[0].text || '').replace('<INPUT_TEXT>', '') + `\n\n待总结的剧本内容：\n${contentToSummarize}`;
          }
        } else {
          // 如果最后一条不是用户消息，添加新的用户消息
          messageArrayWithContent.push({
            role: 'user',
            content: `待总结的剧本内容：\n${contentToSummarize}`
          });
        }
      } else {
        // 如果没有消息数组，创建默认消息
        messageArrayWithContent.push({
          role: 'user',
          content: `请总结以下剧本内容：\n${contentToSummarize}`
        });
      }

      // 调用统一API生成内容
      console.log(`[MemoryService] Requesting script summary from unified API with custom settings`);
      const summaryText = await unifiedGenerateContent(
        messageArrayWithContent,
        apiOptions
      );

      console.log(`[MemoryService] Generated script summary: ${summaryText.substring(0, 100)}...`);
      return summaryText;
    } catch (error) {
      console.error(`[MemoryService] Error generating script summary:`, error);
      throw error;
    }
  }

  // New method to save summary to dedicated storage
  private async saveSummaryToStorage(conversationId: string, summary: SummaryData): Promise<void> {
    try {
      const storageKey = `${SUMMARIES_STORAGE_PREFIX}${conversationId}`;
      
      // Get existing summaries for this conversation
      const existingSummaries = await this.getSummariesFromStorage(conversationId);
      
      // Add new summary
      existingSummaries.push(summary);
      
      // Save updated summaries array
      await AsyncStorage.setItem(storageKey, JSON.stringify(existingSummaries));
      
      console.log(`[MemoryService] Saved summary to dedicated storage for conversation ${conversationId}`);
    } catch (error) {
      console.error(`[MemoryService] Failed to save summary to storage for conversation ${conversationId}:`, error);
    }
  }

  // New method to get summaries from dedicated storage
  private async getSummariesFromStorage(conversationId: string): Promise<SummaryData[]> {
    try {
      const storageKey = `${SUMMARIES_STORAGE_PREFIX}${conversationId}`;
      const data = await AsyncStorage.getItem(storageKey);
      
      if (data) {
        return JSON.parse(data) as SummaryData[];
      }
    } catch (error) {
      console.error(`[MemoryService] Failed to get summaries from storage for conversation ${conversationId}:`, error);
    }
    
    return [];
  }
}

// Export singleton instance
export const memoryService = MemoryService.getInstance();
