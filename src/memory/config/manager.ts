import { MemoryConfig } from '../types';

/**
 * 默认记忆系统配置
 */
const DEFAULT_CONFIG: MemoryConfig = {
  embedder: {
    provider: 'mobile_openai',
    config: {
      apiKey: '',
      model: 'text-embedding-3-small',
    },
  },
  vectorStore: {
    provider: 'mobile_sqlite',
    config: {
      collectionName: 'memories',
      dimension: 1536,
      dbName: 'vector_store.db',
    },
  },
  llm: {
    provider: 'mobile_llm',
    config: {
      apiKey: '',
      model: 'gpt-4-turbo',
    },
  },
  historyDbPath: 'memory_history.db',
  version: 'v1.0',
};

/**
 * 配置管理器
 * 用于合并和验证记忆系统配置
 */
export class ConfigManager {
  /**
   * 合并用户配置与默认配置
   * @param userConfig 用户提供的配置
   * @returns 合并后的配置
   */
  static mergeConfig(userConfig: Partial<MemoryConfig> = {}): MemoryConfig {
    const config = {
      ...DEFAULT_CONFIG,
      ...userConfig,
      embedder: {
        ...DEFAULT_CONFIG.embedder,
        ...(userConfig.embedder || {}),
        config: {
          ...DEFAULT_CONFIG.embedder.config,
          ...(userConfig.embedder?.config || {}),
        },
      },
      vectorStore: {
        ...DEFAULT_CONFIG.vectorStore,
        ...(userConfig.vectorStore || {}),
        config: {
          ...DEFAULT_CONFIG.vectorStore.config,
          ...(userConfig.vectorStore?.config || {}),
        },
      },
      llm: {
        ...DEFAULT_CONFIG.llm,
        ...(userConfig.llm || {}),
        config: {
          ...DEFAULT_CONFIG.llm.config,
          ...(userConfig.llm?.config || {}),
        },
      },
    };

    // 验证必要配置
    this.validateConfig(config);

    return config;
  }

  /**
   * 验证配置的有效性
   * @param config 需要验证的配置
   * @throws 如果配置无效则抛出错误
   */
  static validateConfig(config: MemoryConfig): void {
    // 验证向量存储配置
    if (!config.vectorStore.config.collectionName) {
      throw new Error("必须提供向量存储集合名称");
    }

    // 可以添加更多验证...
  }
}
