import { Embedder } from '../embeddings/base';
import { ZhipuEmbedder } from '../embeddings/zhipu-embedder';
import { VectorStore } from '../vector-stores/base';
import { MobileSQLiteVectorStore } from '../vector-stores/mobile-sqlite';
import { MobileFileVectorStore } from '../vector-stores/mobile-file';
import { 
  EmbeddingConfig, 
  LLMConfig, 
  VectorStoreConfig
} from '../types';
import { MobileLLM } from '../llms/mobile-llm';
import { LLM } from '../llms/base';

/**
 * 嵌入器工厂类
 */
export class EmbedderFactory {
  /**
   * 创建嵌入器实例
   * @param provider 提供商
   * @param config 配置
   */
  static create(provider: string, config: any): any {
    console.log(`[EmbedderFactory] 创建嵌入器: ${provider}`);
    
    switch (provider) {
      case 'mobile_openai':
        // ...existing OpenAI code...
        break;
      case 'zhipu':
        return new ZhipuEmbedder(config);
      default:
        throw new Error(`不支持的嵌入器提供商: ${provider}`);
    }
  }
}

/**
 * 向量存储工厂类
 */
export class VectorStoreFactory {
  /**
   * 创建向量存储实例
   * @param provider 提供商名称
   * @param config 配置
   * @returns 向量存储实例
   */
  static create(provider: string, config: VectorStoreConfig): VectorStore {
    switch (provider.toLowerCase()) {
      case 'mobile_sqlite':
        return new MobileSQLiteVectorStore(config as any);
      case 'mobile_file':
        return new MobileFileVectorStore(config as any);
      default:
        throw new Error(`不支持的向量存储提供商: ${provider}`);
    }
  }
}

/**
 * LLM 工厂类
 */
export class LLMFactory {
  /**
   * 创建 LLM 实例
   * @param provider 提供商名称
   * @param config 配置
   * @returns LLM 实例
   */
  static create(provider: string, config: LLMConfig): LLM {
    // 确保配置包含API提供商和密钥信息
    const sanitizedConfig = {
      ...config,
      apiKey: config.apiKey || '',
      apiProvider: config.apiProvider || 'gemini'
    };
    
    // 记录配置信息（不记录敏感内容）
    console.log(`[LLMFactory] 创建LLM实例: provider=${provider}, apiProvider=${sanitizedConfig.apiProvider}`);
    console.log(`[LLMFactory] API密钥状态: ${sanitizedConfig.apiKey ? '已设置' : '未设置'}`);
    
    switch (provider.toLowerCase()) {
      case 'mobile_llm':
        return new MobileLLM(sanitizedConfig);
      default:
        console.warn(`[LLMFactory] 不支持的LLM提供商: ${provider}，使用默认MobileLLM`);
        return new MobileLLM(sanitizedConfig);
    }
  }
}
