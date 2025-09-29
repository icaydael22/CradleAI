import { Character } from '@/shared/types';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';
import { DEFAULT_NEGATIVE_PROMPTS, DEFAULT_POSITIVE_PROMPTS } from '@/constants/defaultPrompts';
import NovelAIService from '@/components/NovelAIService';
import ImageManager from '@/utils/ImageManager';
import { getApiSettings, getUserSettingsGlobally } from '@/utils/settings-helper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { unifiedGenerateContent } from '@/services/unified-api';

export interface NovelAIGenerationConfig {
  seed?: number;
  positiveTags: string[];
  negativeTags: string[];
  sizePreset?: { width: number; height: number };
  model: string;
  steps: number;
  scale: number;
  sampler: string;
  noiseSchedule: string;
  characterPrompts: { prompt: string; positions: { x: number; y: number }[] }[];
  useCoords: boolean;
  useOrder: boolean;
}

export interface GenerationResult {
  success: boolean;
  imageId?: string; // Changed from imageUrl to imageId
  error?: string;
}

export class InputImagen {
  /**
   * Get NovelAI generation configuration from character
   */
  static getNovelAIConfig(character: Character): NovelAIGenerationConfig {
    // Default config
    const defaultConfig: NovelAIGenerationConfig = {
      positiveTags: [...DEFAULT_POSITIVE_PROMPTS],
      negativeTags: [...DEFAULT_NEGATIVE_PROMPTS],
      sizePreset: { width: 832, height: 1216 },
      model: 'NAI Diffusion V4 Curated',
      steps: 28,
      scale: 5,
      sampler: 'k_euler_ancestral',
      noiseSchedule: 'karras',
      characterPrompts: [],
      useCoords: false,
      useOrder: true
    };

    if (!character || !character.backgroundImageConfig) {
      return defaultConfig;
    }

    // Get NovelAI settings from character
    const novelaiConfig = character.backgroundImageConfig?.novelaiSettings || {};
    
    // Handle seed value
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

    // Merge tags
    const positiveTags = [
      ...(character.backgroundImageConfig?.genderTags || []),
      ...(character.backgroundImageConfig?.characterTags || []),
      ...(character.backgroundImageConfig?.qualityTags || []),
      ...(character.backgroundImageConfig?.positiveTags || []),
      ...DEFAULT_POSITIVE_PROMPTS
    ].filter(Boolean);

    const negativeTags = [
      ...DEFAULT_NEGATIVE_PROMPTS,
      ...(character.backgroundImageConfig?.negativeTags || [])
    ].filter(Boolean);

    // Add character prompts
    let characterPrompts: { prompt: string; positions: { x: number; y: number }[] }[] = [];
    if (character.backgroundImageConfig?.characterTags && character.backgroundImageConfig.characterTags.length > 0) {
      characterPrompts = [
        {
          prompt: character.backgroundImageConfig.characterTags.join(', '),
          positions: [{ x: 0, y: 0 }]
        }
      ];
    }

    // Size settings
    const sizePreset = character.backgroundImageConfig?.sizePreset || { width: 832, height: 1216 };

    return {
      seed,
      positiveTags,
      negativeTags,
      characterPrompts,
      model: novelaiConfig.model || 'NAI Diffusion V4 Curated',
      steps: novelaiConfig.steps || 28,
      scale: novelaiConfig.scale || 5,
      sampler: novelaiConfig.sampler || 'k_euler_ancestral',
      noiseSchedule: novelaiConfig.noiseSchedule || 'karras',
      sizePreset,
      useCoords: typeof novelaiConfig.useCoords === 'boolean' ? novelaiConfig.useCoords : false,
      useOrder: typeof novelaiConfig.useOrder === 'boolean' ? novelaiConfig.useOrder : true
    };
  }

  /**
   * Generate a scene description from the last bot message
   * Now uses the imagegen_prompt_config from UtilSettings and unified-api
   */
  static async generateSceneDescription(characterId: string): Promise<string> {
    try {
      // Get recent conversation context (last 10 messages)
      const contextMessages = await StorageAdapter.exportConversation(characterId);
      const recentMessages = contextMessages.slice(-10);

      if (recentMessages.length === 0) {
        return '';
      }

      // 读取UtilSettings中图像生成提示词配置
      const savedConfigStr = await AsyncStorage.getItem('imagegen_prompt_config');
      if (!savedConfigStr) {
        console.warn('[InputImagen] 未找到图像生成提示词配置');
        return '';
      }
      const savedConfig = JSON.parse(savedConfigStr);

      // 获取消息数组和inputText
      let { messageArray, inputText, adapterType } = savedConfig || {};
      if (!Array.isArray(messageArray) || messageArray.length === 0 || !inputText) {
        console.warn('[InputImagen] 图像生成提示词配置不完整');
        return '';
      }

      // 用recentMessages填充inputText变量（如有[recentMessages]或recentMessages变量）
      // 这里假定inputText中包含"recentMessages"变量，直接替换
      const recentMessagesStr = recentMessages.map(m => `${m.role}: ${m.content}`).join('\n');
      const inputTextWithRecent = inputText.replace(/\[?recentMessages\]?/gi, recentMessagesStr);

      // 重新构建消息数组，将inputTextWithRecent作为第一个用户消息
      // 其余消息结构保持不变（如preset、worldbook等）
      // 只替换第一个user消息的内容
      let patchedMessageArray = messageArray.map((msg: any, idx: number) => {
        if (idx === 0 && msg.role === 'user') {
          if ('content' in msg) {
            return { ...msg, content: inputTextWithRecent };
          } else if ('parts' in msg) {
            return { ...msg, parts: [{ text: inputTextWithRecent }] };
          }
        }
        return msg;
      });

      // 获取API设置
      const apiSettings = getApiSettings();
      const options = {
        ...apiSettings,
        adapter: adapterType || apiSettings.apiProvider || 'gemini'
      };

      // 调用unified-api生成内容
      const result = await unifiedGenerateContent(patchedMessageArray, options);
      return (result || '').replace(/[\r\n]+/g, ' ').trim();
    } catch (error) {
      console.error('[InputImagen] Error generating scene description:', error);
      return '';
    }
  }

  /**
   * Generate an image using NovelAI with the provided parameters
   */
  static async generateImage(
    config: NovelAIGenerationConfig,
    customPrompt: string = '',
    customSeed?: number
  ): Promise<GenerationResult> {
    try {
      console.log('[InputImagen] Starting image generation with config:', {
        model: config.model,
        width: config.sizePreset?.width ?? 832, 
        height: config.sizePreset?.height ?? 1216,
        steps: config.steps, 
        scale: config.scale,
        sampler: config.sampler,
        seed: customSeed || config.seed,
        noiseSchedule: config.noiseSchedule,
        hasCharacterPrompts: config.characterPrompts?.length > 0,
        useCoords: config.useCoords,
        useOrder: config.useOrder
      });

      // Get NovelAI token and custom endpoint settings from settings
      const settings = getUserSettingsGlobally();
      let novelaiToken = settings?.chat?.novelai?.token || '';
      let apiEndpoint: string | undefined = undefined;
      
      // Check for custom endpoint settings
      if (settings?.chat?.novelai) {
        const useCustomEndpoint = !!settings.chat.novelai.useCustomEndpoint;
        const customEndpoint = settings.chat.novelai.customEndpoint || '';
        const customToken = settings.chat.novelai.customToken || '';
        
        if (useCustomEndpoint && customEndpoint && customToken) {
          novelaiToken = customToken;
          // Automatically append /generate-image suffix if needed
          apiEndpoint = customEndpoint.endsWith('/generate-image')
            ? customEndpoint
            : customEndpoint.replace(/\/+$/, '') + '/generate-image';
          
          console.log(`[InputImagen] Using custom endpoint: ${apiEndpoint}`);
        }
      }

      if (!novelaiToken) {
        throw new Error("NovelAI令牌未设置，请在设置中配置");
      }

      // Create the positive prompt combining all tags
      let positivePromptText = config.positiveTags.join(', ');
      if (customPrompt && customPrompt.trim()) {
        positivePromptText = positivePromptText + ', ' + customPrompt.trim();
      }

      // Create negative prompt
      const negativePromptText = config.negativeTags.join(', ');
      
      // Generate the image using NovelAIService
      const result = await NovelAIService.generateImage({
        token: novelaiToken,
        prompt: positivePromptText,
        characterPrompts: config.characterPrompts?.length ? config.characterPrompts : undefined,
        negativePrompt: negativePromptText,
        model: config.model,
        width: config.sizePreset?.width ?? 832, 
        height: config.sizePreset?.height ?? 1216,
        steps: config.steps,
        scale: config.scale,
        sampler: config.sampler,
        seed: customSeed || config.seed,
        noiseSchedule: config.noiseSchedule,
        useCoords: config.useCoords,
        useOrder: config.useOrder,
        ...(apiEndpoint ? { endpoint: apiEndpoint } : {})
      });

      // 只处理本地PNG文件路径，不处理base64
      if (result && result.imageUrls) {
        const imagePath = result.imageUrls[0];
        if (typeof imagePath === 'string' && imagePath.startsWith('file://')) {
          console.log('[InputImagen] NovelAI returned local PNG file, caching image file...');
          const cacheResult = await ImageManager.cacheImageFile(
            imagePath,
            'image/png'
          );
          return {
            success: true,
            imageId: cacheResult.id
          };
        } else {
          return {
            success: false,
            error: 'NovelAI返回的不是本地PNG文件路径，无法缓存'
          };
        }
      } else {
        return {
          success: false,
          error: 'No image data returned from NovelAI'
        };
      }
    } catch (error: any) {
      console.error('[InputImagen] Error generating image:', error);
      
      // Check for 429 error and provide specific message
      if (error.message && typeof error.message === 'string' && error.message.includes('429')) {
        return {
          success: false,
          error: 'Rate limit exceeded. Please wait before generating another image (Error 429)'
        };
      }
      
      return {
        success: false,
        error: error?.message || 'Unknown error generating image'
      };
    }
  }

  /**
   * Auto-generate an image using scene description and NovelAI
   * This method combines generateSceneDescription and generateImage to create an image without manual input
   * It supports two modes:
   * 1. Using character's background image config (similar to PostChatService background generation)
   * 2. Using custom prompt and seed (more flexible approach)
   * 
   * @param character The character object
   * @param conversationId The conversation ID
   * @param options Optional settings:
   *   - customPrompt: Additional prompt to combine with scene description
   *   - customSeed: Optional seed for image generation
   *   - useBackgroundConfig: Whether to use NovelAI settings from background image (default: true)
   * @returns Promise with generation result
   */
  static async autoGenerateImage(
    character: Character,
    conversationId: string,
    options?: {
      customPrompt?: string;
      customSeed?: number;
      useBackgroundConfig?: boolean;
    }
  ): Promise<GenerationResult> {
    try {
      console.log(`[InputImagen] Starting auto image generation for character ${character.id}`);
      
      // Default options
      const useBackgroundConfig = options?.useBackgroundConfig !== false;
      const customPrompt = options?.customPrompt || '';
      const customSeed = options?.customSeed;
      
      // Generate scene description
      console.log('[InputImagen] Generating scene description');
      const sceneDescription = await InputImagen.generateSceneDescription(character.id);
      
      if (!sceneDescription || sceneDescription.trim() === '') {
        return {
          success: false,
          error: "Failed to generate scene description"
        };
      }
      
      console.log(`[InputImagen] Scene description generated: ${sceneDescription}`);
      
      // Determine which mode to use based on options and character config
      if (useBackgroundConfig && character.backgroundImageConfig?.isNovelAI) {
        // Mode 1: Use settings from background image config (similar to PostChatService)
        console.log('[InputImagen] Using background image config for generation');
        
        // Get NovelAI configuration from character
        const novelAIConfig = InputImagen.getNovelAIConfig(character);
        
        // Combine scene description with existing positive tags
        // Similar to how PostChatService does it
        const finalPositiveTags = [
          ...novelAIConfig.positiveTags,
          sceneDescription
        ];
        
        if (customPrompt && customPrompt.trim()) {
          finalPositiveTags.push(customPrompt.trim());
        }
        
        // Generate the image
        console.log('[InputImagen] Generating image with background config and scene description');
        return await InputImagen.generateImage(
          novelAIConfig,
          finalPositiveTags.join(', '),
          customSeed || novelAIConfig.seed
        );
      } else {
        // Mode 2: More flexible approach with custom prompt and seed
        console.log('[InputImagen] Using flexible mode for generation');
        
        // Get default NovelAI configuration
        const novelAIConfig = InputImagen.getNovelAIConfig(character);
        
        // Combine custom prompt with scene description
        let finalPrompt = sceneDescription;
        if (customPrompt && customPrompt.trim()) {
          finalPrompt = `${customPrompt.trim()}, ${sceneDescription}`;
        }
        
        // Generate the image
        console.log('[InputImagen] Generating image with scene description and custom prompt');
        return await InputImagen.generateImage(
          novelAIConfig,
          finalPrompt,
          customSeed || Math.floor(Math.random() * 2 ** 32)
        );
      }
    } catch (error: any) {
      console.error('[InputImagen] Error in autoGenerateImage:', error);
      return {
        success: false,
        error: error?.message || 'Unknown error in auto image generation'
      };
    }
  }
}

export default InputImagen;
