import { Embedder } from './base';
import { EmbeddingConfig } from '../types';

/**
 * 重试配置
 */
interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
}

/**
 * 默认重试配置
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffFactor: 2
};

/**
 * 适用于移动端的 OpenAI 嵌入器实现
 * 支持通过反向代理服务器与 OpenAI API 通信
 */
export class MobileOpenAIEmbedder implements Embedder {
  private apiKey: string;
  private model: string;
  private apiEndpoint: string;
  private retryConfig: RetryConfig;

  constructor(config: EmbeddingConfig) {
    this.apiKey = config.apiKey ?? '';
    this.model = config.model || 'text-embedding-3-small';
    this.apiEndpoint = config.url || 'https://api.openai.com/v1/embeddings';
    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...(config.retryConfig || {})
    };
  }

  /**
   * 更新API密钥
   * @param apiKey 新的API密钥
   */
  public updateApiKey(apiKey: string): void {
    if (apiKey && apiKey !== this.apiKey) {
      console.log(`[MobileOpenAIEmbedder] 更新API密钥: ${this.apiKey ? '已设置' : '未设置'} -> ${apiKey ? '已设置' : '未设置'}`);
      this.apiKey = apiKey;
    }
  }

  /**
   * 将单个文本转换为向量
   * @param text 要嵌入的文本
   * @returns 向量表示（浮点数数组）
   */
  async embed(text: string): Promise<number[]> {
    try {
      return await this.executeWithRetry(() => this.embedSingle(text));
    } catch (error) {
      console.error('嵌入文本失败:', error);
      throw error;
    }
  }

  /**
   * 批量将多个文本转换为向量
   * @param texts 要嵌入的文本数组
   * @returns 向量表示数组
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    // 检查是否有文本需要处理
    if (!texts.length) {
      return [];
    }

    try {
      return await this.executeWithRetry(() => this.embedMultiple(texts));
    } catch (error) {
      console.error('批量嵌入文本失败:', error);
      throw error;
    }
  }

  /**
   * 内部方法：执行单个文本嵌入
   */
  private async embedSingle(text: string): Promise<number[]> {
    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        input: text
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`OpenAI API 错误: ${response.status} ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  /**
   * 内部方法：执行多个文本嵌入
   */
  private async embedMultiple(texts: string[]): Promise<number[][]> {
    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        input: texts
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`OpenAI API 错误: ${response.status} ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    return data.data.map((item: any) => item.embedding);
  }

  /**
   * 内部方法：带重试机制的操作执行
   */
  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let delay = this.retryConfig.initialDelayMs;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        // 尝试执行操作
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // 如果已经达到最大重试次数，则抛出错误
        if (attempt >= this.retryConfig.maxRetries) {
          throw lastError;
        }
        
        // 网络错误或服务端错误(5xx)才进行重试
        const shouldRetry = 
          error instanceof TypeError || // 网络错误
          /5\d\d/.test(lastError.message) || // 5xx 服务器错误
          lastError.message.includes('timeout') || // 超时错误
          lastError.message.includes('rate_limit'); // 速率限制错误
        
        if (!shouldRetry) {
          throw lastError;
        }
        
        console.warn(`嵌入请求失败，将在 ${delay}ms 后重试 (${attempt + 1}/${this.retryConfig.maxRetries})`, lastError);
        
        // 等待延迟时间
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // 指数退避策略
        delay = Math.min(delay * this.retryConfig.backoffFactor, this.retryConfig.maxDelayMs);
      }
    }
    
    // 不应该到达这里，但为了类型安全
    throw lastError || new Error('未知嵌入错误');
  }
}
