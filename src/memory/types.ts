/**
 * 消息类型
 */
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string | any;
  name?: string;
}

/**
 * 搜索过滤器
 */
export type SearchFilters = Record<string, any>;

/**
 * 记忆项
 */
export interface MemoryItem {
  id: string;
  memory: string;
  hash?: string;
  createdAt?: string;
  updatedAt?: string;
  score?: number;
  metadata?: Record<string, any>;
  userId?: string;
  agentId?: string;
  runId?: string;
}

/**
 * 搜索结果
 */
export interface SearchResult {
  results: MemoryItem[];
}

/**
 * Embedder 配置
 */
export interface EmbeddingConfig {
  apiKey: string;
  model?: string;
  url?: string;
  [key: string]: any;
}

/**
 * LLM 配置
 */
export interface LLMConfig {
  apiKey: string;
  model?: string;
  url?: string;
  apiProvider?: string; // 添加：API提供商字段
  openrouter?: {        // 添加：OpenRouter特定配置
    enabled?: boolean;
    apiKey?: string;
    model?: string;
    useBackupModels?: boolean;
    backupModels?: string[];
  };
  config?: Record<string, any>;
  [key: string]: any;
}

/**
 * 向量存储配置
 */
export interface VectorStoreConfig {
  collectionName: string;
  [key: string]: any;
}

/**
 * 记忆系统配置
 */
export interface MemoryConfig {
  embedder: {
    provider: string;
    config: EmbeddingConfig;
  };
  vectorStore: {
    provider: string;
    config: VectorStoreConfig;
  };
  llm: {
    provider: string;
    config: LLMConfig;
  };
  customPrompt?: string;
  historyDbPath?: string;
  version?: string;
  useZhipuEmbedding?: boolean; // 新增：是否使用智谱嵌入
  zhipuApiKey?: string; // 新增：智谱API密钥
}
