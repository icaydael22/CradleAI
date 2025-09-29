/**
 * OpenRouter Model Manager
 * 管理模型列表缓存和获取
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OpenRouterAdapter } from './openrouter-adapter';

// 缓存键
const OPENROUTER_MODELS_CACHE_KEY = '@openrouter_models_cache';
// 缓存有效期 (24小时)
const CACHE_TTL = 24 * 60 * 60 * 1000;

// 模型接口
interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt?: number;
    completion?: number;
  };
  provider?: {
    id?: string;
    name?: string;
  };
}

// 缓存接口
interface ModelsCache {
  models: OpenRouterModel[];
  timestamp: number;
}

/**
 * 管理OpenRouter API模型的缓存和获取
 */
export class OpenRouterModelManager {
  /**
   * 获取可用模型列表，支持缓存
   * @param apiKey OpenRouter API Key
   * @param forceRefresh 是否强制刷新缓存
   * @returns 模型列表
   */
  static async getModels(apiKey: string, forceRefresh = false): Promise<OpenRouterModel[]> {
    console.log('【OpenRouterModelManager】获取模型列表，强制刷新:', forceRefresh);
    
    if (!apiKey) {
      console.error('【OpenRouterModelManager】缺少API密钥，无法获取模型');
      return [];
    }
    
    try {
      // 检查缓存是否存在且有效，除非要求强制刷新
      if (!forceRefresh) {
        const cachedModels = await this.getModelsFromCache();
        if (cachedModels) {
          console.log(`【OpenRouterModelManager】使用缓存数据，共 ${cachedModels.length} 个模型`);
          return cachedModels;
        }
      }
      
      // 创建适配器并获取最新模型
      console.log('【OpenRouterModelManager】从API获取最新模型列表');
      const adapter = new OpenRouterAdapter(apiKey);
      const models = await adapter.listModels();
      
      // 缓存结果
      await this.saveModelsToCache(models);
      console.log(`【OpenRouterModelManager】已缓存 ${models.length} 个模型`);
      
      return models;
    } catch (error) {
      console.error('【OpenRouterModelManager】获取模型失败:', error);
      
      // 如果获取失败但缓存可用，则使用缓存
      const cachedModels = await this.getModelsFromCache();
      if (cachedModels) {
        console.log('【OpenRouterModelManager】API获取失败，使用缓存数据');
        return cachedModels;
      }
      
      throw error;
    }
  }
  
  /**
   * 从缓存获取模型
   * @returns 缓存的模型列表，如果缓存无效则返回null
   */
  private static async getModelsFromCache(): Promise<OpenRouterModel[] | null> {
    try {
      const cachedData = await AsyncStorage.getItem(OPENROUTER_MODELS_CACHE_KEY);
      if (!cachedData) return null;
      
      const cache: ModelsCache = JSON.parse(cachedData);
      const now = Date.now();
      
      // 检查缓存是否过期
      if (now - cache.timestamp > CACHE_TTL) {
        console.log('【OpenRouterModelManager】缓存已过期');
        return null;
      }
      
      return cache.models;
    } catch (error) {
      console.error('【OpenRouterModelManager】读取缓存失败:', error);
      return null;
    }
  }
  
  /**
   * 保存模型到缓存
   * @param models 要缓存的模型列表
   */
  private static async saveModelsToCache(models: OpenRouterModel[]): Promise<void> {
    try {
      const cache: ModelsCache = {
        models,
        timestamp: Date.now()
      };
      
      await AsyncStorage.setItem(OPENROUTER_MODELS_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.error('【OpenRouterModelManager】保存缓存失败:', error);
    }
  }
  
  /**
   * 清除模型缓存
   */
  static async clearCache(): Promise<void> {
    try {
      await AsyncStorage.removeItem(OPENROUTER_MODELS_CACHE_KEY);
      console.log('【OpenRouterModelManager】模型缓存已清除');
    } catch (error) {
      console.error('【OpenRouterModelManager】清除缓存失败:', error);
    }
  }
  
  /**
   * 格式化模型名称，以便更友好地显示
   */
  static formatModelName(modelId: string): string {
    // 从完整ID (如 "openai/gpt-3.5-turbo") 中提取友好名称
    const parts = modelId.split('/');
    const provider = parts[0];
    const name = parts[1] || modelId;
    
    // 大写提供商名称
    const formattedProvider = provider.charAt(0).toUpperCase() + provider.slice(1);
    
    // 格式化模型名称
    let formattedName = name.replace(/-/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    
    // 特殊处理某些常见模型名称
    switch (name.toLowerCase()) {
      case 'gpt-3.5-turbo':
        formattedName = 'GPT-3.5 Turbo';
        break;
      case 'gpt-4':
        formattedName = 'GPT-4';
        break;
      case 'claude-instant-v1':
        formattedName = 'Claude Instant';
        break;
      case 'claude-2.1':
        formattedName = 'Claude 2.1';
        break;
    }
    
    return `${formattedProvider}: ${formattedName}`;
  }
}
