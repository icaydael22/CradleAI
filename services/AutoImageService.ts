import { Character, Message } from '@/shared/types';
import { InputImagen } from '@/services/InputImagen';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Key prefix for storing processed message IDs
const AUTO_IMAGE_PROCESSED_IDS_KEY_PREFIX = 'autoImageProcessedIds-';

interface AutoImageGenerationState {
  isGenerating: boolean;
  taskId: string | null;
  error: string | null;
  aborted: boolean;
}

interface GenerationTaskResult {
  success: boolean;
  imageId?: string;
  prompt?: string;
  error?: string;
}

export class AutoImageService {
  private static instance: AutoImageService;
  private taskCounter: number = 0;
  private processedMessageIds: Map<string, Set<string>> = new Map();
  private states: Map<string, AutoImageGenerationState> = new Map();
  private lastGenerationTime: Map<string, number> = new Map(); // Track last generation time
  private cooldownPeriod: number = 10000; // 10 seconds cooldown
  private processingMessageIds: Set<string> = new Set(); // Track messages currently being processed

  private constructor() {}

  public static getInstance(): AutoImageService {
    if (!AutoImageService.instance) {
      AutoImageService.instance = new AutoImageService();
    }
    return AutoImageService.instance;
  }

  public getCurrentState(characterId: string): AutoImageGenerationState {
    return { ...(this.states.get(characterId) || {
      isGenerating: false,
      taskId: null,
      error: null,
      aborted: false
    }) };
  }

  public abortCurrentTask(characterId: string): void {
    const state = this.states.get(characterId);
    if (state && state.isGenerating && state.taskId) {
      state.aborted = true;
      this.states.set(characterId, { ...state });
      console.log('[AutoImageService] 当前任务已标记为中止:', state.taskId);
    }
  }

  public async loadProcessedMessageIds(characterId: string): Promise<void> {
    try {
      const key = `${AUTO_IMAGE_PROCESSED_IDS_KEY_PREFIX}${characterId}`;
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) {
          this.processedMessageIds.set(characterId, new Set(arr));
          return;
        }
      }
      this.processedMessageIds.set(characterId, new Set());
    } catch (e) {
      console.error('[AutoImageService] Failed to load processed message IDs:', e);
      this.processedMessageIds.set(characterId, new Set());
    }
  }

  public async saveProcessedMessageIds(characterId: string): Promise<void> {
    try {
      if (!this.processedMessageIds.has(characterId)) {
        return;
      }

      const messageIds = this.processedMessageIds.get(characterId);
      const key = `${AUTO_IMAGE_PROCESSED_IDS_KEY_PREFIX}${characterId}`;
      await AsyncStorage.setItem(key, JSON.stringify(Array.from(messageIds || [])));
    } catch (e) {
      console.error('[AutoImageService] Failed to save processed message IDs:', e);
    }
  }

  public hasProcessedMessage(characterId: string, messageId: string): boolean {
    const set = this.processedMessageIds.get(characterId);
    return !!set && set.has(messageId);
  }

  public addProcessedMessage(characterId: string, messageId: string): void {
    if (!this.processedMessageIds.has(characterId)) {
      this.processedMessageIds.set(characterId, new Set());
    }
    this.processedMessageIds.get(characterId)?.add(messageId);
  }

  /**
   * Trigger automatic image generation based on character settings
   * @param character The character object
   * @param messages List of messages in the conversation
   * @param onImageGenerated Callback when image is generated successfully
   * @returns Promise with generation result
   */
  public async triggerAutoImageGeneration(
    character: Character,
    messages: Message[],
    onImageGenerated: (imageId: string, prompt: string) => void
  ): Promise<GenerationTaskResult> {
    const characterId = character.id;
    
    // Validate prerequisites
    if (!character) {
      console.log('[AutoImageService] 不触发：character 不存在');
      return { success: false, error: 'Character not found' };
    }
    
    if (!character.autoImageEnabled && !character.customImageEnabled) {
      console.log('[AutoImageService] 不触发：自动生成图片和自定义生成图片均未启用');
      return { success: false, error: 'Auto image generation not enabled' };
    }
    
    // Check if there are messages
    if (!messages || messages.length === 0) {
      console.log('[AutoImageService] 不触发：没有消息');
      return { success: false, error: 'No messages available' };
    }

    // Get the last bot message
    const lastBotMessageIndex = [...messages].reverse().findIndex(msg => 
      msg.sender === 'bot' && !msg.isLoading && !msg.metadata?.isErrorMessage
    );
    
    if (lastBotMessageIndex === -1) {
      console.log('[AutoImageService] 不触发：没有找到AI回复消息');
      return { success: false, error: 'No bot message found' };
    }
    
    const lastBotMessage = messages[messages.length - 1 - lastBotMessageIndex];
    
    // Check if message is already processed
    if (this.hasProcessedMessage(characterId, lastBotMessage.id)) {
      console.log('[AutoImageService] 消息ID已处理过，跳过:', lastBotMessage.id);
      return { success: false, error: 'Message already processed' };
    }

    // Check if message is currently being processed
    if (this.processingMessageIds.has(lastBotMessage.id)) {
      console.log('[AutoImageService] 消息ID正在处理中，跳过:', lastBotMessage.id);
      return { success: false, error: 'Message is currently being processed' };
    }
    
    // Also check if we've already processed any message in the last 5 seconds
    const currentTime = Date.now();
    const recentlyProcessedMessages = [...messages]
      .filter(msg => msg.sender === 'bot' && !msg.isLoading)
      .filter(msg => {
        const set = this.processedMessageIds.get(characterId);
        return set && set.has(msg.id);
      })
      .filter(msg => {
        // Check if message timestamp is within the last 5 seconds
        return msg.timestamp && (currentTime - msg.timestamp < 5000);
      });

    if (recentlyProcessedMessages.length > 0) {
      console.log('[AutoImageService] 最近5秒内已处理过消息，跳过生成');
      return { success: false, error: 'Recently processed messages' };
    }

    // Check cooldown period
    const lastGenTime = this.lastGenerationTime.get(characterId) || 0;
    if (currentTime - lastGenTime < this.cooldownPeriod) {
      console.log(`[AutoImageService] 冷却时间未到，跳过生成 (${Math.floor((currentTime - lastGenTime) / 1000)}/${Math.floor(this.cooldownPeriod / 1000)}秒)`);
      return { success: false, error: 'Cooldown period not elapsed' };
    }

    // Start new generation task
    const taskId = `task-${++this.taskCounter}-${Date.now()}`;
    const state: AutoImageGenerationState = {
      isGenerating: true,
      taskId,
      error: null,
      aborted: false
    };
    this.states.set(characterId, state);
    
    // Add message to processing set
    this.processingMessageIds.add(lastBotMessage.id);
    
    console.log(`[AutoImageService] 开始新的图片生成任务: ${taskId}`);

    try {
      let result: GenerationTaskResult;
      
      if (character.customImageEnabled) {
        // Custom image generation mode - only use scene description
        console.log('[AutoImageService] 使用自定义生成图片模式');
        
        // Generate scene description
        const sceneDescription = await InputImagen.generateSceneDescription(character.id);
        if (!sceneDescription) {
          throw new Error('Failed to generate scene description');
        }
        
        // Generate image with random seed
        const customSeed = Math.floor(Math.random() * 2 ** 32);
        const novelAIConfig = InputImagen.getNovelAIConfig(character);
        
        const genResult = await InputImagen.generateImage(
          novelAIConfig,
          sceneDescription,
          customSeed
        );
        
        result = {
          success: genResult.success,
          imageId: genResult.imageId,
          prompt: sceneDescription,
          error: genResult.error
        };
      } else {
        // Auto image generation mode - use background config
        console.log('[AutoImageService] 使用自动生成图片模式');
        
        const genResult = await InputImagen.autoGenerateImage(
          character,
          character.id,
          { useBackgroundConfig: true }
        );
        
        // Get scene description for prompt
        const sceneDescription = await InputImagen.generateSceneDescription(character.id);
        
        result = {
          success: genResult.success,
          imageId: genResult.imageId,
          prompt: sceneDescription || '自动生成的图片',
          error: genResult.error
        };
      }
      
      // Update state based on result
      if (result.success && result.imageId) {
        // Add message ID to processed set
        this.addProcessedMessage(character.id, lastBotMessage.id);
        await this.saveProcessedMessageIds(character.id);
        console.log('[AutoImageService] 消息ID已添加到已处理集合:', lastBotMessage.id);
        
        // Update last generation time
        this.lastGenerationTime.set(characterId, Date.now());
        
        // Call the callback
        if (onImageGenerated && result.imageId) {
          onImageGenerated(result.imageId, result.prompt || '');
        }
        
        // Update state
        this.states.set(characterId, {
          isGenerating: false,
          taskId,
          error: null,
          aborted: false
        });
        
        return result;
      } else {
        // Failed
        const errMsg = result.error || '生成失败';
        this.states.set(characterId, {
          isGenerating: false,
          taskId,
          error: errMsg,
          aborted: false
        });
        
        console.error('[AutoImageService] 图片生成失败:', errMsg);
        return { success: false, error: errMsg };
      }
    } catch (error: any) {
      const errMsg = error?.message || 'Unknown error occurred';
      this.states.set(characterId, {
        isGenerating: false,
        taskId,
        error: errMsg,
        aborted: false
      });
      
      console.error('[AutoImageService] 执行过程中出现异常:', error);
      return { success: false, error: errMsg };
    } finally {
      // Remove message from processing set
      this.processingMessageIds.delete(lastBotMessage.id);
    }
  }

  public reset(characterId: string): void {
    this.states.set(characterId, {
      isGenerating: false,
      taskId: null,
      error: null,
      aborted: false
    });
    this.lastGenerationTime.delete(characterId);
  }

  public resetCooldown(characterId: string): void {
    this.lastGenerationTime.delete(characterId);
    console.log(`[AutoImageService] 已重置角色 ${characterId} 的冷却时间`);
  }

  public clearProcessedMessages(characterId: string): void {
    this.processedMessageIds.set(characterId, new Set());
    this.saveProcessedMessageIds(characterId).catch(console.error);
    this.lastGenerationTime.delete(characterId);
  }
}

export default AutoImageService; 