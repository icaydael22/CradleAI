/**
 * Settings Helper
 * 
 * Provides utilities to make user settings accessible globally
 */

import { GlobalSettings } from '@/shared/types';

let cloudServiceEnabled = false;
const cloudServiceListeners: Array<(enabled: boolean) => void> = [];

/**
 * Update the cloud service status and notify listeners.
 */
export function updateCloudServiceStatus(enabled: boolean): void {
  cloudServiceEnabled = enabled;
  console.log(`[CloudServiceTracker] 云服务状态更新为: ${enabled ? '启用' : '禁用'}`);
  cloudServiceListeners.forEach(listener => listener(enabled));
}

/**
 * Get the current cloud service status.
 */
export function getCloudServiceStatus(): boolean {
  return cloudServiceEnabled;
}

/**
 * Add a listener for cloud service status changes.
 */
export function addCloudServiceStatusListener(listener: (enabled: boolean) => void): () => void {
  cloudServiceListeners.push(listener);
  return () => {
    const index = cloudServiceListeners.indexOf(listener);
    if (index !== -1) {
      cloudServiceListeners.splice(index, 1);
    }
  };
}

/**
 * Store user settings in a global variable for easy access
 * across the application, especially for services
 */
export function storeUserSettingsGlobally(settings: GlobalSettings): void {
  try {
    // Store in global object for React Native environment
    if (typeof global !== 'undefined') {
      (global as any).__USER_SETTINGS = settings;
      if (settings.chat?.OpenAIcompatible?.endpoint) {
        (global as any).__OPENAI_COMPATIBLE_ENDPOINT = settings.chat.OpenAIcompatible.endpoint;
      }
    }
    
    // Store in localStorage for web environment
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('user_settings', JSON.stringify(settings));
      if (settings.chat?.OpenAIcompatible?.endpoint) {
        localStorage.setItem('openai_compatible_endpoint', settings.chat.OpenAIcompatible.endpoint);
      }
    }

    // 新增：同步Brave Search API Key到AsyncStorage（React Native环境）
    if (settings.search?.braveSearchApiKey) {
      // 动态导入AsyncStorage，避免web端报错
      try {
        // @ts-ignore
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        AsyncStorage.setItem('brave_search_api_key', settings.search.braveSearchApiKey);
      } catch (e) {
        // 忽略web端或require失败
      }
    }
    
    // 新增：同步zhipuApiKey到AsyncStorage和localStorage
    if (settings.chat?.zhipuApiKey) {
      try {
        // @ts-ignore
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        AsyncStorage.setItem('zhipu_api_key', settings.chat.zhipuApiKey);
      } catch (e) {
        // 忽略web端或require失败
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('zhipu_api_key', settings.chat.zhipuApiKey);
      }
    }

    // 新增：同步NovelAI自定义端点到AsyncStorage（React Native环境）
    if (settings.chat?.novelai?.customEndpoint) {
      try {
        // @ts-ignore
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        AsyncStorage.setItem('novelai_custom_endpoint', settings.chat.novelai.customEndpoint);
      } catch (e) {}
    }
    if (settings.chat?.novelai?.customToken) {
      try {
        // @ts-ignore
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        AsyncStorage.setItem('novelai_custom_token', settings.chat.novelai.customToken);
      } catch (e) {}
    }
    
    // 新增：同步豆包TTS配置到AsyncStorage和localStorage
    if (settings.tts?.appid && settings.tts?.token) {
      try {
        // @ts-ignore
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        AsyncStorage.setItem('doubao_tts_appid', settings.tts.appid);
        AsyncStorage.setItem('doubao_tts_token', settings.tts.token);
        AsyncStorage.setItem('doubao_tts_config', JSON.stringify(settings.tts));
      } catch (e) {
        // 忽略web端或require失败
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('doubao_tts_appid', settings.tts.appid);
        localStorage.setItem('doubao_tts_token', settings.tts.token);
        localStorage.setItem('doubao_tts_config', JSON.stringify(settings.tts));
      }
    }
    // 新增：同步 minimax TTS 配置到 AsyncStorage/localStorage
    if (settings.tts?.minimaxApiToken) {
      try {
        // @ts-ignore
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        AsyncStorage.setItem('minimax_tts_api_token', settings.tts.minimaxApiToken);
      } catch (e) {}
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('minimax_tts_api_token', settings.tts.minimaxApiToken);
      }
    }
    if (settings.tts?.minimaxModel) {
      try {
        // @ts-ignore
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        AsyncStorage.setItem('minimax_tts_model', settings.tts.minimaxModel);
      } catch (e) {}
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('minimax_tts_model', settings.tts.minimaxModel);
      }
    }
    
    console.log('[SettingsHelper] User settings stored globally');
    
    // Update cloud service status when settings are updated
    if (settings.chat && settings.chat.useCloudService !== undefined) {
      updateCloudServiceStatus(settings.chat.useCloudService);
    }
  } catch (error) {
    console.error('[SettingsHelper] Failed to store settings globally:', error);
  }
}

/**
 * Get user settings from global storage
 */
export function getUserSettingsGlobally(): GlobalSettings | null {
  try {
    // Try to get from global object first (React Native)
    if (typeof global !== 'undefined' && (global as any).__USER_SETTINGS) {
      const settings = (global as any).__USER_SETTINGS;
      if (settings.chat?.OpenAIcompatible?.endpoint === undefined && (global as any).__OPENAI_COMPATIBLE_ENDPOINT) {
        settings.chat.OpenAIcompatible = settings.chat.OpenAIcompatible || {};
        settings.chat.OpenAIcompatible.endpoint = (global as any).__OPENAI_COMPATIBLE_ENDPOINT;
      }
      return settings;
    }
    
    // Try to get from localStorage (web)
    if (typeof localStorage !== 'undefined') {
      const settingsStr = localStorage.getItem('user_settings');
      if (settingsStr) {
        const settings = JSON.parse(settingsStr);
        if (settings.chat?.OpenAIcompatible?.endpoint === undefined) {
          const endpoint = localStorage.getItem('openai_compatible_endpoint');
          if (endpoint) {
            settings.chat.OpenAIcompatible = settings.chat.OpenAIcompatible || {};
            settings.chat.OpenAIcompatible.endpoint = endpoint;
          }
        }
        return settings;
      }
    }
    
    console.warn('[SettingsHelper] No user settings found in global storage');
    return null;
  } catch (error) {
    console.error('[SettingsHelper] Failed to get global settings:', error);
    return null;
  }
}

/**
 * Get API settings for Circle Service
 */
export function getApiSettings(): {
  apiKey: string | undefined;
  apiProvider: string;
  openrouter?: {
    enabled: boolean;
    apiKey?: string;
    model?: string;
  };
  OpenAIcompatible?: {
    enabled: boolean;
    apiKey?: string;
    model?: string;
    endpoint?: string;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
  };
  useCloudService: boolean;
  useGeminiKeyRotation?: boolean;
  useGeminiModelLoadBalancing?: boolean;
  additionalGeminiKeys?: string[];
  cloudModel?: string;
  geminiPrimaryModel?: string;
  geminiBackupModel?: string;
  retryDelay?: number;
  geminiTemperature?: number; // 新增
  geminiMaxTokens?: number;   // 新增
  useZhipuEmbedding?: boolean;
  zhipuApiKey?: string;
} {
  const settings = getUserSettingsGlobally();
  if (!settings || !settings.chat) {
    // Return default settings if none found
    return {
      apiKey: undefined,
      apiProvider: 'gemini',
      useCloudService: false,
      openrouter: {
        enabled: false
      },
      OpenAIcompatible: {
        enabled: false
      }
    };
  }

  // 互斥逻辑：只返回当前 provider 的参数
  const { apiProvider, characterApiKey, openrouter, OpenAIcompatible, useCloudService = false, additionalGeminiKeys, useGeminiKeyRotation, useGeminiModelLoadBalancing, cloudModel, geminiPrimaryModel, geminiBackupModel, retryDelay, geminiTemperature, geminiMaxTokens, useZhipuEmbedding, zhipuApiKey } = settings.chat;

  // --- 修正：同步OpenAIcompatible的流式参数等 ---
  let openAICompatibleConfig: any = { enabled: false };
  if (apiProvider === 'openai-compatible' && OpenAIcompatible?.enabled) {
    let provider = OpenAIcompatible;
    // 如果有多渠道，优先取selectedProviderId
    if (OpenAIcompatible.providers && Array.isArray(OpenAIcompatible.providers) && OpenAIcompatible.selectedProviderId) {
      const selected = OpenAIcompatible.providers.find((p: any) => p.id === OpenAIcompatible.selectedProviderId);
      if (selected) {
        provider = { ...selected, enabled: true };
      }
    }
    openAICompatibleConfig = {
      enabled: true,
      apiKey: provider.apiKey,
      model: provider.model,
      endpoint: provider.endpoint,
      stream: provider.stream,
      temperature: provider.temperature,
      max_tokens: provider.max_tokens
    };
  }

  return {
    apiKey: characterApiKey,
    apiProvider: apiProvider || 'gemini',
    openrouter: apiProvider === 'openrouter'
      ? {
          enabled: true,
          apiKey: openrouter?.apiKey,
          model: openrouter?.model || 'openai/gpt-3.5-turbo'
        }
      : { enabled: false },
    OpenAIcompatible: openAICompatibleConfig,
    useCloudService,
    additionalGeminiKeys,
    useGeminiKeyRotation,
    useGeminiModelLoadBalancing,
    cloudModel,
    geminiPrimaryModel,
    geminiBackupModel,
    retryDelay,
    geminiTemperature, // 新增
    geminiMaxTokens,   // 新增
    useZhipuEmbedding,
    zhipuApiKey
  };
}

/**
 * Get TTS settings for Doubao TTS Service
 */
export function getTTSSettings(): {
  enabled: boolean;
  provider?: 'doubao' | 'minimax' | 'cosyvoice';
  appid?: string;
  token?: string;
  voiceType?: string;
  encoding?: 'wav' | 'pcm' | 'ogg_opus' | 'mp3';
  speedRatio?: number;
  transport?: 'stream' | 'http';
  minimaxApiToken?: string;
  minimaxModel?: string;
  // 新增cosyvoice相关字段
  cosyvoiceServerUrl?: string;
  useRealtimeUpdates?: boolean;
  // 新增：CosyVoice 使用与 Minimax 共享的 Replicate token
  replicateApiToken?: string;
  cosyvoiceReplicateModel?: string;
} {
  const settings = getUserSettingsGlobally();
  if (!settings || !settings.tts) {
    return { enabled: false };
  }
  const { enabled, provider, appid, token, voiceType, encoding, speedRatio, transport, minimaxApiToken, minimaxModel, cosyvoiceServerUrl, useRealtimeUpdates } = settings.tts;
  return {
    enabled: enabled || false,
    provider: provider || 'doubao',
    appid,
    token,
    voiceType,
    encoding,
    speedRatio,
    transport,
    minimaxApiToken,
    minimaxModel,
    cosyvoiceServerUrl,
    useRealtimeUpdates,
    // CosyVoice 使用与 Minimax 共享的 Replicate token
    replicateApiToken: minimaxApiToken,
    cosyvoiceReplicateModel: 'chenxwh/cosyvoice2-0.5b:669b1cd618f2747d2237350e868f5c313f3b548fc803ca4e57adfaba778b042d'
  };
}

/**
 * Update TTS configuration directly
 */
export async function updateTTSSettings(ttsConfig: {
  enabled: boolean;
  appid?: string;
  token?: string;
  voiceType?: string;
  encoding?: 'wav' | 'pcm' | 'ogg_opus' | 'mp3';
  speedRatio?: number;
  transport?: 'stream' | 'http';
  minimaxApiToken?: string;
  minimaxModel?: string;
  // 新增cosyvoice相关字段
  cosyvoiceServerUrl?: string;
  useRealtimeUpdates?: boolean;
}): Promise<void> {
  try {
    // 1. 更新全局设置
    const currentSettings = getUserSettingsGlobally();
    if (currentSettings) {
      const updatedSettings = {
        ...currentSettings,
        tts: ttsConfig
      };
      storeUserSettingsGlobally(updatedSettings);
    }
    // 2. 直接更新到AsyncStorage（React Native环境）
    try {
      // @ts-ignore
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      AsyncStorage.setItem('doubao_tts_config', JSON.stringify(ttsConfig));
      if (ttsConfig.appid) AsyncStorage.setItem('doubao_tts_appid', ttsConfig.appid);
      if (ttsConfig.token) AsyncStorage.setItem('doubao_tts_token', ttsConfig.token);
      if (ttsConfig.voiceType) AsyncStorage.setItem('doubao_tts_voice_type', ttsConfig.voiceType);
      AsyncStorage.setItem('doubao_tts_transport', ttsConfig.transport || 'stream');
      AsyncStorage.setItem('doubao_tts_enabled', String(!!ttsConfig.enabled));
      // 新增 minimax 字段
      if (ttsConfig.minimaxApiToken) AsyncStorage.setItem('minimax_tts_api_token', ttsConfig.minimaxApiToken);
      if (ttsConfig.minimaxModel) AsyncStorage.setItem('minimax_tts_model', ttsConfig.minimaxModel);
      // 新增 cosyvoice 字段
      if (ttsConfig.cosyvoiceServerUrl) AsyncStorage.setItem('cosyvoice_server_url', ttsConfig.cosyvoiceServerUrl);
      AsyncStorage.setItem('cosyvoice_use_realtime_updates', ttsConfig.useRealtimeUpdates ? 'true' : 'false');
      console.log('[SettingsHelper] TTS设置已保存到AsyncStorage');
    } catch (e) {}
    // 3. 直接更新到localStorage（Web环境）
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('doubao_tts_config', JSON.stringify(ttsConfig));
      if (ttsConfig.appid) localStorage.setItem('doubao_tts_appid', ttsConfig.appid);
      if (ttsConfig.token) localStorage.setItem('doubao_tts_token', ttsConfig.token);
      if (ttsConfig.voiceType) localStorage.setItem('doubao_tts_voice_type', ttsConfig.voiceType);
      localStorage.setItem('doubao_tts_transport', ttsConfig.transport || 'stream');
      localStorage.setItem('doubao_tts_enabled', String(!!ttsConfig.enabled));
      // 新增 minimax 字段
      if (ttsConfig.minimaxApiToken) localStorage.setItem('minimax_tts_api_token', ttsConfig.minimaxApiToken);
      if (ttsConfig.minimaxModel) localStorage.setItem('minimax_tts_model', ttsConfig.minimaxModel);
      // 新增 cosyvoice 字段
      if (ttsConfig.cosyvoiceServerUrl) localStorage.setItem('cosyvoice_server_url', ttsConfig.cosyvoiceServerUrl);
      localStorage.setItem('cosyvoice_use_realtime_updates', ttsConfig.useRealtimeUpdates ? 'true' : 'false');
      console.log('[SettingsHelper] TTS设置已保存到localStorage');
    }

    // 新增：通知统一TTS服务重新初始化
    try {
      const { unifiedTTSService } = require('@/services/unified-tts');
      await unifiedTTSService.updateConfig({});
      console.log('[SettingsHelper] 统一TTS服务已重新初始化');
    } catch (error) {
      console.warn('[SettingsHelper] 统一TTS服务重新初始化失败:', error);
    }
  } catch (error) {
    console.error('[SettingsHelper] Failed to update TTS settings:', error);
  }
}

/**
 * Get TTS configuration from AsyncStorage/localStorage (fallback method)
 */
export async function getTTSSettingsAsync(): Promise<{
  enabled: boolean;
  provider?: 'doubao' | 'minimax' | 'cosyvoice';
  appid?: string;
  token?: string;
  voiceType?: string;
  encoding?: 'wav' | 'pcm' | 'ogg_opus' | 'mp3';
  speedRatio?: number;
  transport?: 'stream' | 'http';
  minimaxApiToken?: string;
  minimaxModel?: string;
  // 新增cosyvoice相关字段
  cosyvoiceServerUrl?: string;
  useRealtimeUpdates?: boolean;
  // 新增：CosyVoice 使用与 Minimax 共享的 Replicate token
  replicateApiToken?: string;
  cosyvoiceReplicateModel?: string;
}> {
  try {
    // 1. 先尝试从全局设置中获取
    const settings = getUserSettingsGlobally();
    if (settings?.tts) {
      console.log('[SettingsHelper] 从全局设置中获取TTS配置');
      return {
        ...settings.tts,
        // CosyVoice 使用与 Minimax 共享的 Replicate token
        replicateApiToken: settings.tts.minimaxApiToken,
        cosyvoiceReplicateModel: 'chenxwh/cosyvoice2-0.5b:669b1cd618f2747d2237350e868f5c313f3b548fc803ca4e57adfaba778b042d'
      };
    }
    
    // 2. 尝试从AsyncStorage获取完整配置（React Native）
    try {
      // @ts-ignore
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const configStr = await AsyncStorage.getItem('doubao_tts_config');
      if (configStr) {
        const config = JSON.parse(configStr);
        // 新增 minimax 字段补全
        config.minimaxApiToken = config.minimaxApiToken || (await AsyncStorage.getItem('minimax_tts_api_token')) || undefined;
        config.minimaxModel = config.minimaxModel || (await AsyncStorage.getItem('minimax_tts_model')) || undefined;
        // 新增cosyvoice字段补全
        config.cosyvoiceServerUrl = config.cosyvoiceServerUrl || (await AsyncStorage.getItem('cosyvoice_server_url')) || undefined;
        config.useRealtimeUpdates = config.useRealtimeUpdates !== undefined ? config.useRealtimeUpdates : (await AsyncStorage.getItem('cosyvoice_use_realtime_updates')) === 'true';
        console.log('[SettingsHelper] 从AsyncStorage获取TTS完整配置');
        return config;
      }
      
      // 尝试从AsyncStorage单独字段构建配置
      const appid = await AsyncStorage.getItem('doubao_tts_appid');
      const token = await AsyncStorage.getItem('doubao_tts_token');
      
      if (appid && token) {
        console.log('[SettingsHelper] 从AsyncStorage单独字段构建TTS配置');
        const voiceType = await AsyncStorage.getItem('doubao_tts_voice_type') || 'zh_male_M392_conversation_wvae_bigtts';
        const transport = await AsyncStorage.getItem('doubao_tts_transport') || 'stream';
        const enabledStr = await AsyncStorage.getItem('doubao_tts_enabled') || 'false';
        
        return {
          enabled: enabledStr === 'true',
          appid,
          token,
          voiceType,
          encoding: 'mp3',
          speedRatio: 1.0,
          transport: transport === 'http' ? 'http' : 'stream'
        };
      }
      
      // 新增 minimax 字段单独读取
      const minimaxApiToken = await AsyncStorage.getItem('minimax_tts_api_token');
      const minimaxModel = await AsyncStorage.getItem('minimax_tts_model');
      
      return {
        enabled: false,
        minimaxApiToken: minimaxApiToken || undefined,
        minimaxModel: minimaxModel || undefined,
        // 新增cosyvoice字段
        cosyvoiceServerUrl: await AsyncStorage.getItem('cosyvoice_server_url') || undefined,
        useRealtimeUpdates: (await AsyncStorage.getItem('cosyvoice_use_realtime_updates')) === 'true',
        // CosyVoice 使用与 Minimax 共享的 Replicate token
        replicateApiToken: minimaxApiToken || undefined,
        cosyvoiceReplicateModel: 'chenxwh/cosyvoice2-0.5b:669b1cd618f2747d2237350e868f5c313f3b548fc803ca4e57adfaba778b042d'
    };
    } catch (e) {
      // 忽略AsyncStorage不可用的错误
    }
    
    // 3. 尝试从localStorage获取完整配置（Web）
    if (typeof localStorage !== 'undefined') {
      const configStr = localStorage.getItem('doubao_tts_config');
      if (configStr) {
        const config = JSON.parse(configStr);
        // 新增 minimax 字段补全
        config.minimaxApiToken = config.minimaxApiToken || localStorage.getItem('minimax_tts_api_token') || undefined;
        config.minimaxModel = config.minimaxModel || localStorage.getItem('minimax_tts_model') || undefined;
        // 新增cosyvoice字段补全
        config.cosyvoiceServerUrl = config.cosyvoiceServerUrl || localStorage.getItem('cosyvoice_server_url') || undefined;
        config.useRealtimeUpdates = config.useRealtimeUpdates !== undefined ? config.useRealtimeUpdates : localStorage.getItem('cosyvoice_use_realtime_updates') === 'true';
        console.log('[SettingsHelper] 从localStorage获取TTS完整配置');
        return config;
      }
      
      // 尝试从localStorage单独字段构建配置
      const appid = localStorage.getItem('doubao_tts_appid');
      const token = localStorage.getItem('doubao_tts_token');
      
      if (appid && token) {
        console.log('[SettingsHelper] 从localStorage单独字段构建TTS配置');
        const voiceType = localStorage.getItem('doubao_tts_voice_type') || 'zh_male_M392_conversation_wvae_bigtts';
        const transport = localStorage.getItem('doubao_tts_transport') || 'stream';
        const enabledStr = localStorage.getItem('doubao_tts_enabled') || 'false';
        
        return {
          enabled: enabledStr === 'true',
          appid,
          token,
          voiceType,
          encoding: 'mp3',
          speedRatio: 1.0,
          transport: transport === 'http' ? 'http' : 'stream'
        };
      }
      
      // 新增 minimax 字段单独读取
      const minimaxApiToken = localStorage.getItem('minimax_tts_api_token');
      const minimaxModel = localStorage.getItem('minimax_tts_model');
      
      return {
        enabled: false,
        minimaxApiToken: minimaxApiToken || undefined,
        minimaxModel: minimaxModel || undefined,
        // 新增cosyvoice字段
        cosyvoiceServerUrl: localStorage.getItem('cosyvoice_server_url') || undefined,
        useRealtimeUpdates: localStorage.getItem('cosyvoice_use_realtime_updates') === 'true',
        // CosyVoice 使用与 Minimax 共享的 Replicate token
        replicateApiToken: minimaxApiToken || undefined,
        cosyvoiceReplicateModel: 'chenxwh/cosyvoice2-0.5b:669b1cd618f2747d2237350e868f5c313f3b548fc803ca4e57adfaba778b042d'
      };
    }
    
    // 4. 返回同步方法结果
    return getTTSSettings();
  } catch (error) {
    console.error('[SettingsHelper] Failed to get TTS settings async:', error);
    return {
      enabled: false
    };
  }
}
