import { Character, Message } from '@/shared/types';
import { GeminiAdapter } from '@/NodeST/nodest/utils/gemini-adapter';
import { OpenRouterAdapter } from '@/NodeST/nodest/utils/openrouter-adapter';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';
import { DEFAULT_NEGATIVE_PROMPTS, DEFAULT_POSITIVE_PROMPTS } from '@/constants/defaultPrompts';
import NovelAIService from '@/components/NovelAIService';
import { getApiSettings } from '@/utils/settings-helper';
import CloudServiceProviderClass from '@/services/cloud-service-provider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { InputImagen } from '@/services/InputImagen';
import { CharacterLoader } from '@/src/utils/character-loader';

const EXTRA_BG_IDS_KEY_PREFIX = 'extraBgProcessedIds-';

interface BackgroundGenerationState {
  isGenerating: boolean;
  taskId: string | null;
  error: string | null;
  image: string | null;
  aborted: boolean;
}

interface GenerationTaskResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

export class PostChatService {
  private static instance: PostChatService;
  private taskCounter: number = 0;
  private processedMessageIds: Map<string, Set<string>> = new Map();
  private states: Map<string, BackgroundGenerationState> = new Map();

  private constructor() {}

  public static getInstance(): PostChatService {
    if (!PostChatService.instance) {
      PostChatService.instance = new PostChatService();
    }
    return PostChatService.instance;
  }

  public getCurrentState(characterId: string): BackgroundGenerationState {
    return { ...(this.states.get(characterId) || {
      isGenerating: false,
      taskId: null,
      error: null,
      image: null,
      aborted: false
    }) };
  }

  public abortCurrentTask(characterId: string): void {
    const state = this.states.get(characterId);
    if (state && state.isGenerating && state.taskId) {
      state.aborted = true;
      this.states.set(characterId, { ...state });
      console.log('[PostChatService] 当前任务已标记为中止:', state.taskId);
    }
  }

  public async loadProcessedMessageIds(characterId: string): Promise<void> {
    try {
      const key = `${EXTRA_BG_IDS_KEY_PREFIX}${characterId}`;
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
      console.error('[PostChatService] Failed to load processed message IDs:', e);
      this.processedMessageIds.set(characterId, new Set());
    }
  }

  public async saveProcessedMessageIds(characterId: string): Promise<void> {
    try {
      if (!this.processedMessageIds.has(characterId)) {
        return;
      }

      const messageIds = this.processedMessageIds.get(characterId);
      const key = `${EXTRA_BG_IDS_KEY_PREFIX}${characterId}`;
      await AsyncStorage.setItem(key, JSON.stringify(Array.from(messageIds || [])));
    } catch (e) {
      console.error('[PostChatService] Failed to save processed message IDs:', e);
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

  public async triggerBackgroundGeneration(
    character: Character,
    lastBotMessage: string,
    messages: Message[],
    userSettings: any,
    onUpdateCharacterBackground: (characterId: string, imageUrl: string) => Promise<void>
  ): Promise<GenerationTaskResult> {
    const characterId = character.id;
    // Validate prerequisites
    if (!character || !character.backgroundImage) {
      console.log('[PostChatService] 不触发：character/backgroundImage 不存在');
      return { success: false, error: 'Missing character or background image' };
    }
    
    if (!character.enableAutoExtraBackground) {
      console.log('[PostChatService] 不触发：enableAutoExtraBackground 为 false');
      return { success: false, error: 'Auto background generation disabled' };
    }
    
    if (!character.backgroundImageConfig?.isNovelAI) {
      console.log('[PostChatService] 不触发：backgroundImageConfig.isNovelAI 为 false');
      return { success: false, error: 'Not using NovelAI for background generation' };
    }

    // Check if message is already processed
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && this.hasProcessedMessage(character.id, lastMsg.id)) {
      console.log('[PostChatService] 消息ID已处理过，跳过:', lastMsg.id);
      return { success: false, error: 'Message already processed' };
    }

    // Start new generation task
    const taskId = `task-${++this.taskCounter}-${Date.now()}`;
    const state: BackgroundGenerationState = {
      isGenerating: true,
      taskId,
      error: null,
      image: null,
      aborted: false
    };
    this.states.set(characterId, state);
    
    console.log(`[PostChatService] 开始新的背景生成任务: ${taskId}`);

    try {
      // Configure NovelAI parameters
      let novelaiConfig = character.backgroundImageConfig?.novelaiSettings || {};
      
      let seed: number | undefined;
      if (
        character.backgroundImageConfig?.seed !== undefined &&
        character.backgroundImageConfig?.seed !== null &&
        character.backgroundImageConfig?.seed !== ''
      ) {
        seed = Number(character.backgroundImageConfig.seed);
      } else if (
        novelaiConfig.seed !== undefined &&
        novelaiConfig.seed !== null &&
        novelaiConfig.seed !== ''
      ) {
        seed = Number(novelaiConfig.seed);
      } else {
        seed = Math.floor(Math.random() * 2 ** 32);
      }

      // Merge default prompts
      let positiveTags: string[] = [
        ...DEFAULT_POSITIVE_PROMPTS,
        ...(character.backgroundImageConfig?.positiveTags || [])
      ];
      let negativeTags: string[] = [
        ...DEFAULT_NEGATIVE_PROMPTS,
        ...(character.backgroundImageConfig?.negativeTags || [])
      ];

      let fixedTags: string[] = character.backgroundImageConfig?.fixedTags || [];
      let allPositiveTags = [
        ...(character.backgroundImageConfig?.genderTags || []),
        ...(character.backgroundImageConfig?.characterTags || []),
        ...(character.backgroundImageConfig?.qualityTags || []),
        ...(positiveTags || [])
      ];
      let artistTag = character.backgroundImageConfig?.artistPrompt || '';

      // Get recent conversation context
      let contextMessages: {role: string, content: string}[] = [];
      try {
        contextMessages = await StorageAdapter.exportConversation(character.id);
        contextMessages = contextMessages.slice(-10);
        console.log('[PostChatService] 获取到上下文:', contextMessages.length, '条消息');
      } catch (e) {
        contextMessages = [];
        console.warn('[PostChatService] 获取上下文失败:', e);
      }

      // Generate scene description using AI
      let aiSceneDesc = '';
      try {
        // Check if task is aborted
        if (this.states.get(characterId)?.aborted) {
          console.log(`[PostChatService] 任务已被中止: ${taskId}`);
          this.states.set(characterId, { ...state, isGenerating: false, error: 'Task aborted' });
          return { success: false, error: 'Task aborted' };
        }
        
        // Check API settings for available providers
        const apiSettings = getApiSettings();    
        
        if (
          apiSettings.openrouter?.enabled &&
          apiSettings.openrouter.apiKey &&
          apiSettings.openrouter.model
        ) {
          // Use OpenRouterAdapter
          const openrouterAdapter = new OpenRouterAdapter(
            apiSettings.openrouter.apiKey,
            apiSettings.openrouter.model
          );
          const prompt = `请根据以下对话内容，用一句不超过15个英文单词的连贯语句，描述角色当前的表情、动作、场景（时间、地点、画面），不要描述外观、服饰。输出英文短句。对话内容：\n${contextMessages.map(m=>`${m.role}: ${m.content}`).join('\n')}`;
          aiSceneDesc = await openrouterAdapter.generateContent([
            { role: 'user', parts: [{ text: prompt }] }
          ]);
          aiSceneDesc = (aiSceneDesc || '').replace(/[\r\n]+/g, ' ').trim();
          console.log('[PostChatService] OpenRouterAdapter生成场景描述:', aiSceneDesc);
        } else if (apiSettings.OpenAIcompatible?.enabled && apiSettings.OpenAIcompatible.apiKey && apiSettings.OpenAIcompatible.endpoint && apiSettings.OpenAIcompatible.model) {
          // Dynamically import OpenAIAdapter
          const { OpenAIAdapter } = await import('@/NodeST/nodest/utils/openai-adapter');
          const openaiAdapter = new OpenAIAdapter({
            endpoint: apiSettings.OpenAIcompatible.endpoint,
            apiKey: apiSettings.OpenAIcompatible.apiKey,
            model: apiSettings.OpenAIcompatible.model,
          });
          const prompt = `请根据以下对话内容，用一句不超过15个英文单词的连贯语句，描述角色当前的表情、动作、场景（时间、地点、画面），不要描述外观、服饰。输出英文短句。对话内容：\n${contextMessages.map(m=>`${m.role}: ${m.content}`).join('\n')}`;
          aiSceneDesc = await openaiAdapter.generateContent([
            { role: 'user', parts: [{ text: prompt }] }
          ]);
          aiSceneDesc = (aiSceneDesc || '').replace(/[\r\n]+/g, ' ').trim();
          console.log('[PostChatService] OpenAICompatible生成场景描述:', aiSceneDesc);
        } else {
          // Fallback to GeminiAdapter
          const prompt = `请根据以下对话内容，用一句不超过15个英文单词的连贯语句，描述角色当前的表情、动作、场景（时间、地点、画面），不要描述外观、服饰。输出英文短句。对话内容：\n${contextMessages.map(m=>`${m.role}: ${m.content}`).join('\n')}`;
          console.log('[PostChatService] 发送GeminiAdapter prompt:', prompt);
          aiSceneDesc = await GeminiAdapter.executeDirectGenerateContent(prompt);
          aiSceneDesc = (aiSceneDesc || '').replace(/[\r\n]+/g, ' ').trim();
          console.log('[PostChatService] Gemini生成场景描述:', aiSceneDesc);
        }
      } catch (e) {
        aiSceneDesc = '';
        console.warn('[PostChatService] 场景描述生成失败:', e);
        // Check if task is aborted
        if (this.states.get(characterId)?.aborted) {
          console.log(`[PostChatService] 任务已被中止: ${taskId}`);
          this.states.set(characterId, { ...state, isGenerating: false, error: 'Task aborted' });
          return { success: false, error: 'Task aborted' };
        }
        
        // Fallback to CloudServiceProvider
        try {
          const cloudResp = await (CloudServiceProviderClass).generateChatCompletionStatic(
            [
              { role: 'user', content: `Based on the dialogue, describe the character's current expression, action, and setting (time, place, visuals) in one coherent sentence of no more than 20 words. Exclude appearance, clothing, and names. Use "he/she" to refer to the character. Output the sentence enclosed in curly braces: { }. Dialogue:\n${contextMessages.map(m=>`${m.role}: ${m.content}`).join('\n')}` }
            ],
            { max_tokens: 32, temperature: 0.7 }
          );
          if (cloudResp && cloudResp.ok) {
            const data = await cloudResp.json();
            if (data && data.choices && data.choices[0]?.message?.content) {
              aiSceneDesc = data.choices[0].message.content.replace(/[\r\n]+/g, ' ').trim();
              console.log('[PostChatService] CloudServiceProvider生成场景描述:', aiSceneDesc);
            }
          }
        } catch (cloudErr) {
          aiSceneDesc = '';
          console.warn('[PostChatService] CloudServiceProvider生成场景描述失败:', cloudErr);
        }
      }

      // Check if task is aborted
      if (this.states.get(characterId)?.aborted) {
        console.log(`[PostChatService] 任务已被中止: ${taskId}`);
        this.states.set(characterId, { ...state, isGenerating: false, error: 'Task aborted' });
        return { success: false, error: 'Task aborted' };
      }

      // Process normalTags with AI scene description
      let newNormalTags: string[] = [];
      if (fixedTags && fixedTags.length > 0) {
        newNormalTags = [...fixedTags];
        if (aiSceneDesc) newNormalTags.push(aiSceneDesc);
      } else if (aiSceneDesc) {
        newNormalTags = [aiSceneDesc];
      }
      console.log('[PostChatService] 处理后normalTags:', newNormalTags);

      // Build final positive tags
      let finalPositiveTags = [
        ...(character.backgroundImageConfig?.genderTags || []),
        ...(character.backgroundImageConfig?.characterTags || []),
        ...(character.backgroundImageConfig?.qualityTags || []),
        ...(artistTag ? [artistTag] : []),
        ...DEFAULT_POSITIVE_PROMPTS,
        ...newNormalTags
      ].filter(Boolean);

      // Ensure negative prompts aren't empty
      let finalNegativePrompt = [
        ...DEFAULT_NEGATIVE_PROMPTS,
        ...(character.backgroundImageConfig?.negativeTags || [])
      ].filter(Boolean).join(', ');

      // NovelAI parameters
      const novelaiToken = userSettings?.settings?.chat?.novelai?.token || '';
      const sizePreset = character.backgroundImageConfig?.sizePreset || { width: 832, height: 1216 };
      const model = novelaiConfig.model || 'NAI Diffusion V4 Curated';
      const steps = novelaiConfig.steps || 28;
      const scale = novelaiConfig.scale || 5;
      const sampler = novelaiConfig.sampler || 'k_euler_ancestral';
      const noiseSchedule = novelaiConfig.noiseSchedule || 'karras';

      // Character prompts positioning
      let characterPrompts: { prompt: string; positions: { x: number; y: number }[] }[] = [];
      if (character.backgroundImageConfig?.characterTags && character.backgroundImageConfig.characterTags.length > 0) {
        characterPrompts = [
          {
            prompt: character.backgroundImageConfig.characterTags.join(', '),
            positions: [{ x: 0, y: 0 }]
          }
        ];
      }

      // Additional parameters
      const useCoords = typeof novelaiConfig.useCoords === 'boolean' ? novelaiConfig.useCoords : false;
      const useOrder = typeof novelaiConfig.useOrder === 'boolean' ? novelaiConfig.useOrder : true;

      console.log('[PostChatService] NovelAI请求参数:', {
        token: novelaiToken ? '(已设置)' : '(未设置)',
        prompt: finalPositiveTags.join(', '),
        negativePrompt: finalNegativePrompt,
        model, width: sizePreset.width, height: sizePreset.height,
        steps, scale, sampler, seed, noiseSchedule, useCoords, useOrder
      });

      // Function to generate image with retry support
      const generateNovelAIImage = async (): Promise<{ url?: string; error?: any }> => {
        try {
          if (this.states.get(characterId)?.aborted) {
            return { error: 'Task aborted' };
          }
          
          const result = await NovelAIService.generateImage({
            token: novelaiToken,
            prompt: finalPositiveTags.join(', '),
            characterPrompts: characterPrompts.length > 0 ? characterPrompts : undefined,
            negativePrompt: finalNegativePrompt,
            model,
            width: sizePreset.width,
            height: sizePreset.height,
            steps,
            scale,
            sampler,
            seed,
            noiseSchedule,
            useCoords,
            useOrder
          });
          const url = result?.imageUrls?.[0];
          return { url };
        } catch (e: any) {
          return { error: e };
        }
      };

      // Retry logic for 429 errors
      let retryCount = 0;
      let maxRetry = 1; // One retry (2 attempts total)
      let retryDelayMs = 8000;
      let lastError: any = null;
      let url: string | undefined = undefined;

      while (retryCount <= maxRetry) {
        if (this.states.get(characterId)?.aborted) {
          console.log(`[PostChatService] 任务已被中止: ${taskId}`);
          this.states.set(characterId, { ...state, isGenerating: false, error: 'Task aborted' });
          return { success: false, error: 'Task aborted' };
        }
        
        const { url: genUrl, error } = await generateNovelAIImage();
        if (genUrl) {
          url = genUrl;
          break;
        }
        
        // Check for 429 rate limit error
        if (error && error.message && typeof error.message === 'string' && error.message.includes('429')) {
          lastError = error;
          if (retryCount < maxRetry) {
            console.warn(`[PostChatService] NovelAI 429错误，${retryDelayMs / 1000}秒后自动重试...`);
            await new Promise(res => setTimeout(res, retryDelayMs));
            retryCount++;
            continue;
          } else {
            break;
          }
        } else {
          // Other errors, abort immediately
          lastError = error;
          break;
        }
      }

      // Process results
      if (url) {
        const newState: BackgroundGenerationState = {
          ...this.states.get(characterId)!,
          image: url,
          isGenerating: false,
          error: null,
          taskId: this.states.get(characterId)?.taskId || null,
          aborted: this.states.get(characterId)?.aborted || false
        };
        this.states.set(characterId, newState);
        console.log('[PostChatService] 图片生成成功:', url);
        
        // Update character's extrabackgroundimage
        await onUpdateCharacterBackground(character.id, url);
        console.log('[PostChatService] 角色背景已更新:', character.id);
        
        // Add message ID to processed set
        if (lastMsg) {
          this.addProcessedMessage(character.id, lastMsg.id);
          await this.saveProcessedMessageIds(character.id);
          console.log('[PostChatService] 消息ID已添加到已处理集合:', lastMsg.id);
        }
        
        return { success: true, imageUrl: url };
      } else {
        // Failed
        const errMsg = lastError?.message || '生成失败';
        const currentState = this.states.get(characterId);
        this.states.set(characterId, {
          isGenerating: false,
          taskId: currentState?.taskId || null,
          error: errMsg,
          image: currentState?.image || null,
          aborted: currentState?.aborted || false
        });
        console.error('[PostChatService] 图片生成异常:', lastError);
        return { success: false, error: errMsg };
      }
    } catch (error: any) {
      const errMsg = error?.message || 'Unknown error occurred';
      const currentState = this.states.get(characterId);
      this.states.set(characterId, {
        isGenerating: false,
        taskId: currentState?.taskId || null,
        error: errMsg,
        image: currentState?.image || null,
        aborted: currentState?.aborted || false
      });
      console.error('[PostChatService] 执行过程中出现异常:', error);
      return { success: false, error: errMsg };
    }
  }

  public reset(characterId: string): void {
    this.states.set(characterId, {
      isGenerating: false,
      taskId: null,
      error: null,
      image: null,
      aborted: false
    });
  }

  public clearProcessedMessages(characterId: string): void {
    this.processedMessageIds.set(characterId, new Set());
    this.saveProcessedMessageIds(characterId).catch(console.error);
  }

  /**
   * Auto generate an image using scene description and NovelAI
   * @param characterId The character ID
   * @param conversationId The conversation ID
   * @param options Optional settings:
   *   - customPrompt: Additional prompt to combine with scene description
   *   - customSeed: Optional seed for image generation
   *   - useBackgroundConfig: Whether to use NovelAI settings from background (default: true)
   * @param onImageGenerated Callback when image is generated successfully
   * @returns Promise with success status and error or imageId
   */
  public async autoGenerateImage(
    characterId: string,
    conversationId: string,
    options?: {
      customPrompt?: string;
      customSeed?: number;
      useBackgroundConfig?: boolean;
    },
    onImageGenerated?: (imageId: string, prompt: string) => void
  ): Promise<{ success: boolean; imageId?: string; error?: string; prompt?: string }> {
    try {
      console.log(`[PostChatService] Starting auto image generation for character ${characterId}`);
      
      // Find the character using CharacterLoader
      const character = await CharacterLoader.loadCharacterById(characterId);
      
      if (!character) {
        return {
          success: false,
          error: "Character not found"
        };
      }
      
      // Only check for NovelAI config if we're using background config mode
      if (options?.useBackgroundConfig !== false && !character.backgroundImageConfig?.isNovelAI) {
        console.log('[PostChatService] Character does not have NovelAI background configuration, falling back to flexible mode');
        // We'll continue with flexible mode
      }
      
      // Call the InputImagen auto generate method with the provided options
      const result = await InputImagen.autoGenerateImage(
        character,
        conversationId,
        options
      );
      
      if (result.success && result.imageId) {
        // Get the scene description to use as prompt
        const sceneDescription = await InputImagen.generateSceneDescription(characterId);
        
        // Final prompt might include custom prompt
        const finalPrompt = options?.customPrompt 
          ? `${options.customPrompt}, ${sceneDescription || ''}` 
          : (sceneDescription || '场景图片');
        
        // Call the callback if provided
        if (onImageGenerated && result.imageId) {
          onImageGenerated(result.imageId, finalPrompt);
        }
        
        return {
          success: true,
          imageId: result.imageId,
          prompt: finalPrompt
        };
      } else {
        return {
          success: false,
          error: result.error || "Unknown error generating image"
        };
      }
    } catch (error: any) {
      console.error('[PostChatService] Error auto generating image:', error);
      return {
        success: false,
        error: error?.message || "Unknown error in auto generation process"
      };
    }
  }
}

export default PostChatService;
