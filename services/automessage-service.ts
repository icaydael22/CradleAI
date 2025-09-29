import { Character, Message } from '@/shared/types';
import { unifiedGenerateContent } from '@/services/unified-api';
import { getApiSettings } from '@/utils/settings-helper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';

const STORAGE_KEY = 'auto_message_prompt_config';

interface AutoMessagePromptConfig {
  inputText: string;
  presetJson: string;
  worldBookJson: string;
  adapterType: 'gemini' | 'openrouter' | 'openai-compatible';
  messageArray: any[];
  autoMessageInterval?: number; // 新增
}

export interface AutoMessageConfig {
  enabled: boolean;
  intervalMinutes: number;
  characterId: string;
  conversationId: string;
  character: Character;
  user: any;
  messages: Message[];
  onMessageAdded: (conversationId: string, message: Message) => Promise<void>;
  onUnreadCountUpdate: (count: number) => void;
  onMessagesRefresh?: (conversationId: string) => Promise<void>; // 新增
}

class AutoMessageService {
  private static instance: AutoMessageService;
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private lastMessageTimes: Map<string, number> = new Map();
  private waitingForUserReply: Map<string, boolean> = new Map();
  private configs: Map<string, AutoMessageConfig> = new Map();

  private constructor() {}

  static getInstance(): AutoMessageService {
    if (!AutoMessageService.instance) {
      AutoMessageService.instance = new AutoMessageService();
    }
    return AutoMessageService.instance;
  }

  /**
   * Setup auto message for a character
   */
  setupAutoMessage(config: AutoMessageConfig): void {
    const { characterId, enabled, character } = config;
    
    // Clear existing timer
    this.clearAutoMessage(characterId);
    
    if (!enabled || !character.autoMessage) {
      return;
    }

    // Store config
    this.configs.set(characterId, config);
    
    // Initialize state
    this.lastMessageTimes.set(characterId, Date.now());
    this.waitingForUserReply.set(characterId, false);
    
    // Start timer
    this.startTimer(characterId);
  }

  /**
   * Clear auto message for a character
   */
  clearAutoMessage(characterId: string): void {
    const timer = this.timers.get(characterId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(characterId);
    }
    
    this.configs.delete(characterId);
    this.lastMessageTimes.delete(characterId);
    this.waitingForUserReply.delete(characterId);
  }

  /**
   * Update when user sends a message
   */
  onUserMessage(characterId: string): void {
    this.waitingForUserReply.set(characterId, false);
    this.lastMessageTimes.set(characterId, Date.now());
    this.restartTimer(characterId);
  }

  /**
   * Update when any message is sent (reset timer)
   */
  onAnyMessage(characterId: string): void {
    this.lastMessageTimes.set(characterId, Date.now());
    this.restartTimer(characterId);
  }

  /**
   * Check if waiting for user reply
   */
  isWaitingForUserReply(characterId: string): boolean {
    return this.waitingForUserReply.get(characterId) || false;
  }

  /**
   * Start timer for character
   */
  private async startTimer(characterId: string): Promise<void> {
    const config = this.configs.get(characterId);
    if (!config || !config.enabled || !config.character.autoMessage) {
      return;
    }

    if (this.waitingForUserReply.get(characterId)) {
      return;
    }

    // === 新增：优先读取utilsettings的autoMessageInterval ===
    let intervalMinutes = config.character.autoMessageInterval || config.intervalMinutes || 5;
    try {
      const savedConfig = await this.loadAutoMessageConfig();
      if (savedConfig && typeof savedConfig.autoMessageInterval === 'number' && savedConfig.autoMessageInterval > 0) {
        intervalMinutes = savedConfig.autoMessageInterval;
      }
    } catch (e) {
      // ignore
    }
    const intervalMs = intervalMinutes * 60 * 1000;

    console.log(`[AutoMessageService] [${characterId}] 启动自动消息计时器，间隔: ${intervalMinutes} 分钟 (${intervalMs} ms)`);

    const timer = setTimeout(async () => {
      console.log(`[AutoMessageService] [${characterId}] 自动消息计时器到达，准备发送自动消息`);
      await this.sendAutoMessage(characterId);
    }, intervalMs);

    this.timers.set(characterId, timer);
  }

  /**
   * Restart timer for character
   */
  private restartTimer(characterId: string): void {
    const timer = this.timers.get(characterId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(characterId);
    }
    // 修改：startTimer 现在是 async
    this.startTimer(characterId);
  }

  /**
   * Send auto message using unified-api
   */
  private async sendAutoMessage(characterId: string): Promise<void> {
    const config = this.configs.get(characterId);
    if (!config) {
      console.log(`[AutoMessageService] [${characterId}] 未找到配置，取消自动消息发送`);
      return;
    }

    const { character, conversationId, user, messages, onMessageAdded, onUnreadCountUpdate, onMessagesRefresh } = config;

    try {
      // 读取保存的自动消息提示词配置
      const savedConfig = await this.loadAutoMessageConfig();
      if (!savedConfig || !savedConfig.messageArray || savedConfig.messageArray.length === 0) {
        console.warn(`[AutoMessageService] [${characterId}] 未找到保存的自动消息提示词配置，自动消息未发送`);
        return;
      }

      // 获取适配器类型和API设置
      const chatSettings = getApiSettings();
      const adapterType = this.getAdapterType(chatSettings?.apiProvider);
      const apiKey = chatSettings?.apiKey || '';

      // 构建统一API选项
      const apiOptions = {
        adapter: adapterType,
        apiKey,
        characterId,
        modelId: this.getModelId(adapterType, chatSettings),
        openrouterConfig: chatSettings?.openrouter,
        geminiConfig: {
          additionalKeys: chatSettings?.additionalGeminiKeys,
          useKeyRotation: chatSettings?.useGeminiKeyRotation,
          useModelLoadBalancing: chatSettings?.useGeminiModelLoadBalancing
        }
      };

      // === 修改：先将inputText作为用户消息写入storage-adapter ===
      if (savedConfig.inputText) {
        try {
          await StorageAdapter.addUserMessage(conversationId, savedConfig.inputText);
          
          // 立即创建用户消息对象并添加到消息列表（但在 filteredMessages 中会被过滤）
          const userMessageId = `auto-user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          const userMessage: Message = {
            id: userMessageId,
            text: savedConfig.inputText,
            sender: 'user',
            timestamp: Date.now(),
            metadata: {
              isAutoMessageInput: true,
              autoMessageCreatedAt: Date.now()
            }
          };
          await onMessageAdded(conversationId, userMessage);
          
        } catch (e) {
          console.warn('[AutoMessageService] addUserMessage failed:', e);
        }
      }

      // 调用统一API生成内容
      const responseText = await unifiedGenerateContent(
        savedConfig.messageArray,
        apiOptions
      );

      if (responseText) {
        const uniqueAutoMsgId = `auto-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const aiMessageCount = messages.filter(m => m.sender === 'bot' && !m.isLoading).length;

        const autoMessage: Message = {
          id: uniqueAutoMsgId,
          text: responseText,
          sender: 'bot',
          timestamp: Date.now(),
          metadata: {
            isAutoMessageResponse: true,
            aiIndex: aiMessageCount,
            autoMessageCreatedAt: Date.now()
          }
        };

        // === 修改：将AI回复写入storage-adapter ===
        try {
          await StorageAdapter.addAiMessage(conversationId, responseText);
        } catch (e) {
          console.warn('[AutoMessageService] addAiMessage failed:', e);
        }

        // 将AI回复添加到index的messages
        await onMessageAdded(conversationId, autoMessage);

        // === 新增：强制刷新消息列表 ===
        if (onMessagesRefresh) {
          try {
            await onMessagesRefresh(conversationId);
            console.log(`[AutoMessageService] [${characterId}] 消息列表已刷新`);
          } catch (e) {
            console.warn('[AutoMessageService] 刷新消息列表失败:', e);
          }
        }

        this.lastMessageTimes.set(characterId, Date.now());
        this.waitingForUserReply.set(characterId, true);

        if (character.notificationEnabled === true) {
          onUnreadCountUpdate(1);
        }
        console.log(`[AutoMessageService] [${characterId}] 自动消息已发送: ${responseText.slice(0, 40)}...`);
      } else {
        console.warn(`[AutoMessageService] [${characterId}] 自动消息未发送，unifiedGenerateContent无响应`);
      }
    } catch (error) {
      console.error(`[AutoMessageService] [${characterId}] 自动消息发送出错:`, error);
    } finally {
      // Remove timer reference
      this.timers.delete(characterId);
    }
  }

  /**
   * Load saved auto message prompt configuration
   */
  private async loadAutoMessageConfig(): Promise<AutoMessagePromptConfig | null> {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('[AutoMessageService] 加载自动消息配置失败:', e);
    }
    return null;
  }

  /**
   * Get adapter type from API provider setting
   */
  private getAdapterType(apiProvider?: string): 'gemini' | 'openrouter' | 'openai-compatible' {
    if (!apiProvider) return 'gemini';
    
    const provider = apiProvider.toLowerCase();
    if (provider.includes('gemini')) {
      return 'gemini';
    } else if (provider.includes('openrouter')) {
      return 'openrouter';
    } else if (provider.includes('openai')) {
      return 'openai-compatible';
    }
    return 'gemini';
  }

  /**
   * Get model ID based on adapter type and settings
   */
  private getModelId(adapterType: string, chatSettings: any): string | undefined {
    switch (adapterType) {
      case 'gemini':
        return chatSettings?.geminiPrimaryModel || 'gemini-1.5-flash';
      case 'openrouter':
        return chatSettings?.openrouter?.model || 'openai/gpt-3.5-turbo';
      case 'openai-compatible':
        return chatSettings?.OpenAIcompatible?.model || 'gpt-3.5-turbo';
      default:
        return undefined;
    }
  }

  /**
   * Clear all timers (cleanup)
   */
  clearAll(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    this.configs.clear();
    this.lastMessageTimes.clear();
    this.waitingForUserReply.clear();
  }
}

export default AutoMessageService;
