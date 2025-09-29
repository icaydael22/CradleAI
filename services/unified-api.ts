import { GeminiAdapter } from '@/NodeST/nodest/utils/gemini-adapter';
import { OpenAIAdapter, OpenAICompatibleConfig } from '@/NodeST/nodest/utils/openai-adapter';
import { OpenRouterAdapter } from '@/utils/openrouter-adapter';
import { CradleCloudAdapter } from '@/NodeST/nodest/utils/cradlecloud-adapter';
import { getApiSettings } from '@/utils/settings-helper';
import NovelAIService from '@/services/novelai/NovelAIService';

// 支持的适配器类型
type AdapterType = 'gemini' | 'openai-compatible' | 'openrouter' | 'cradlecloud';

// 标准消息格式（兼容OpenAI/Gemini/OpenRouter）
type UnifiedMessage = 
  | { role: string; content: string } // OpenAI/OpenRouter
  | { role: string; parts: { text: string }[] }; // Gemini

interface UnifiedApiOptions {
  adapter?: AdapterType; // 改为可选，如果不提供则从settings自动确定
  apiKey?: string;
  modelId?: string;
  characterId?: string;
  openaiConfig?: Partial<OpenAICompatibleConfig>;
  openrouterConfig?: {
    enabled?: boolean;
    apiKey?: string;
    model?: string;
    additionalKeys?: string[];
    useKeyRotation?: boolean;
    backupModel?: string;
    retryDelay?: number;
  };
  geminiConfig?: {
    additionalKeys?: string[];
    useKeyRotation?: boolean;
    useModelLoadBalancing?: boolean;
    backupModel?: string;
    retryDelay?: number;
  };
  // 其他可扩展参数
}

/**
 * 统一API服务：根据适配器类型和参数，调用对应适配器的文本生成方法
 * @param messages 消息数组（格式兼容OpenAI/Gemini/OpenRouter）
 * @param options 适配器类型及API设置信息（adapter可选，不提供时从设置自动确定）
 * @returns Promise<string> 响应文本
 */
export async function unifiedGenerateContent(
  messages: UnifiedMessage[],
  options: UnifiedApiOptions = {}
): Promise<string> {
  // 如果没有指定adapter，从设置中自动确定
  let { adapter, apiKey, modelId, characterId } = options;
  
  if (!adapter) {
    const apiSettings = getApiSettings();
    const provider = apiSettings.apiProvider?.toLowerCase() || 'gemini';
    
    if (provider.includes('gemini')) {
      adapter = 'gemini';
    } else if (provider.includes('openrouter')) {
      adapter = 'openrouter';
    } else if (provider.includes('openai') || provider === 'openai-compatible') {
      adapter = 'openai-compatible';
    } else if (provider.includes('cradlecloud') || provider === 'cradlecloud') {
      adapter = 'cradlecloud';
    } else {
      adapter = 'gemini'; // 默认fallback
    }
  }

  // 如果没有提供apiKey等信息，从设置中获取
  if (!apiKey || !modelId) {
    const apiSettings = getApiSettings();
    
    if (adapter === 'gemini') {
      apiKey = apiKey || apiSettings.apiKey;
      modelId = modelId || apiSettings.geminiPrimaryModel || 'gemini-pro';
    } else if (adapter === 'openrouter') {
      apiKey = apiKey || apiSettings.openrouter?.apiKey;
      modelId = modelId || apiSettings.openrouter?.model || 'openai/gpt-3.5-turbo';
    } else if (adapter === 'openai-compatible') {
      apiKey = apiKey || apiSettings.OpenAIcompatible?.apiKey;
      modelId = modelId || apiSettings.OpenAIcompatible?.model || 'gpt-3.5-turbo';
    } else if (adapter === 'cradlecloud') {
      // CradleCloud 使用 JWT token，不需要传统的 API key
      apiKey = apiKey || '';
      modelId = modelId || apiSettings.cradlecloud?.model || 'gemini-2.0-flash-exp';
    }
  }

  if (adapter === 'gemini') {
    // GeminiAdapter: 支持OpenAI格式和Gemini格式消息
    // 自动适配消息格式
    let geminiMessages;
    if (messages.length > 0 && (messages[0] as any).parts) {
      geminiMessages = messages as any;
    } else {
      geminiMessages = messages.map(msg => ({
        role: msg.role,
        parts: [{ text: (msg as any).content }]
      }));
    }
    // 支持可选配置
    if (typeof GeminiAdapter.executeDirectGenerateContent === 'function') {
      return await GeminiAdapter.executeDirectGenerateContent(geminiMessages, {
        apiKey,
        characterId,
        modelId
      });
    }
    throw new Error('GeminiAdapter 不支持 executeDirectGenerateContent');
  }

  if (adapter === 'openai-compatible') {
    // OpenAIAdapter: 需要将消息转换为ChatMessage格式
    const chatMessages = messages.map(msg => ({
      role: msg.role,
      parts: [{ text: ('content' in msg ? (msg as any).content : (msg as any).parts?.[0]?.text || '') }]
    }));
    // 支持可选配置
    if (typeof OpenAIAdapter.prototype.generateContent === 'function') {
      // 直接用静态方法（如有），否则实例化
      if (typeof (OpenAIAdapter as any).executeDirectGenerateContent === 'function') {
        return await (OpenAIAdapter as any).executeDirectGenerateContent(chatMessages, {
          apiKey,
          characterId,
          modelId,
          ...(options.openaiConfig || {})
        });
      } else {
        // fallback: 实例化
        const config: OpenAICompatibleConfig = {
          endpoint: options.openaiConfig?.endpoint || '',
          apiKey: apiKey || '',
          model: modelId || options.openaiConfig?.model || 'gpt-3.5-turbo'
        };
        const adapterInstance = new OpenAIAdapter(config);
        return await adapterInstance.generateContent(chatMessages, characterId);
      }
    }
    throw new Error('OpenAIAdapter 不支持 generateContent');
  }

  if (adapter === 'openrouter') {
    // OpenRouterAdapter: 只支持OpenAI/OpenRouter消息格式
    const openrouterMessages = messages.map(msg =>
      'content' in msg ? { role: msg.role, content: (msg as any).content } : {
        role: msg.role,
        content: (msg as any).parts?.[0]?.text || ''
      }
    );
      // fallback: 实例化
      const adapterInstance = new OpenRouterAdapter(
        apiKey || '',
        modelId || 'openai/gpt-3.5-turbo',
      );
      return await adapterInstance.generateContent(openrouterMessages);
    
  }

  if (adapter === 'cradlecloud') {
    // CradleCloudAdapter: 需要 ChatMessage 格式
    const cradlecloudMessages = messages.map(msg => {
      if ('content' in msg) {
        // OpenAI format -> ChatMessage format
        return {
          role: msg.role,
          parts: [{ text: (msg as any).content }]
        };
      } else {
        // Already in ChatMessage format
        return msg;
      }
    });
    
    const adapterInstance = new CradleCloudAdapter();
    return await adapterInstance.generateContent(cradlecloudMessages as any, characterId);
  }

  throw new Error(`不支持的适配器类型: ${adapter}`);
}

// --------------------
// 统一图片生成（首期支持 NovelAI）
// --------------------

export type ImageProvider = 'novelai';

export interface UnifiedImageGenParams {
  provider: ImageProvider;
  // NovelAI 基本参数
  token?: string;
  prompt: string;
  negativePrompt?: string;
  model?: string; // 默认 NAI Diffusion V4.5
  width?: number;
  height?: number;
  steps?: number;
  scale?: number;
  sampler?: string;
  seed?: number;
  endpoint?: string; // 自定义端点
}

export interface UnifiedImageGenResult {
  imageUrls: string[];
  seed: number;
}

export async function unifiedGenerateImage(params: UnifiedImageGenParams): Promise<UnifiedImageGenResult> {
  const provider = params.provider || 'novelai';
  if (provider === 'novelai') {
    const {
      token,
      prompt,
      negativePrompt = '',
      model = 'NAI Diffusion V4.5',
      width = 1024,
      height = 1024,
      steps = 28,
      scale = 5,
      sampler = 'k_euler_ancestral',
      seed,
      endpoint,
    } = params;

    return await NovelAIService.generateImage({
      token: token || '',
      prompt,
      negativePrompt,
      model,
      width,
      height,
      steps,
      scale,
      sampler,
      seed,
      endpoint,
    } as any);
  }

  throw new Error(`未支持的图片生成提供商: ${provider}`);
}
