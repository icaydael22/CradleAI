import { Embedder } from './base';
import { getApiSettings } from '@/utils/settings-helper'; // 新增

/**
 * 智谱嵌入器 - 用于向量嵌入的服务
 */
export class ZhipuEmbedder implements Embedder {
  private apiKey: string;
  private model: string;
  private endpoint: string;
  private initialized: boolean = false;
  private retryCount: number = 3;
  private dimensions: number = 1024;
  private fallbackVector: number[] | null = null;

  constructor(config: { apiKey?: string; model?: string; url?: string; dimensions?: number }) {
    // 优先从 settings-helper 获取 apiKey
    const apiSettings = getApiSettings();
    this.apiKey = apiSettings.zhipuApiKey || config.apiKey || '';
    this.model = config.model || 'embedding-3';
    this.endpoint = config.url || 'https://open.bigmodel.cn/api/paas/v4/embeddings';
    this.dimensions = config.dimensions || 1024;

    if (!this.apiKey) {
      console.warn('[ZhipuEmbedder] 初始化时未提供API密钥，需要后续设置');
      this.initialized = false;
      this.createFallbackVector();
    } else {
      console.log('[ZhipuEmbedder] 使用API密钥初始化，密钥长度:', this.apiKey.length);
      this.initialized = true;
    }
  }

  /**
   * 创建备用向量（在API调用失败时使用）
   */
  private createFallbackVector(): void {
    if (!this.fallbackVector) {
      this.fallbackVector = Array(this.dimensions).fill(0).map(() => 0.4 + Math.random() * 0.2);
      // 归一化向量
      const magnitude = Math.sqrt(this.fallbackVector.reduce((sum, val) => sum + val * val, 0));
      this.fallbackVector = this.fallbackVector.map(val => val / magnitude);
      console.log(`[ZhipuEmbedder] 已创建${this.dimensions}维备用向量`);
    }
  }

  /**
   * 更新API密钥
   * @param apiKey 新的API密钥
   */
  updateApiKey(apiKey: string): void {
    if (!apiKey) {
      console.warn('[ZhipuEmbedder] 尝试用空API密钥更新，忽略更新');
      return;
    }
    if (this.apiKey === apiKey) {
      console.log('[ZhipuEmbedder] 相同的API密钥，跳过更新');
      return;
    }
    console.log('[ZhipuEmbedder] 更新API密钥，新密钥长度:', apiKey.length);
    this.apiKey = apiKey;
    this.initialized = true;
    if (this.fallbackVector) {
      console.log('[ZhipuEmbedder] 密钥已更新，清除备用向量');
      this.fallbackVector = null;
    }
    // 不再保存到本地存储，由settings-helper负责持久化
  }

  /**
   * 生成文本嵌入向量
   * @param text 输入文本
   * @returns 向量数组
   */
  async embed(text: string): Promise<number[]> {
    // 每次调用都从 settings-helper 获取最新的 apiKey
    const apiSettings = getApiSettings();
    if (!apiSettings.zhipuApiKey && !this.apiKey) {
      throw new Error('[ZhipuEmbedder] 智谱嵌入API密钥未设置');
    }
    if (apiSettings.zhipuApiKey && apiSettings.zhipuApiKey !== this.apiKey) {
      this.apiKey = apiSettings.zhipuApiKey;
      this.initialized = true;
    }
    if (!this.apiKey) {
      throw new Error('[ZhipuEmbedder] 智谱嵌入API密钥未设置');
    }

    // 确保文本不为空
    if (!text || text.trim() === '') {
      throw new Error('[ZhipuEmbedder] 嵌入文本为空');
    }

    try {
      const textPreview = text.length > 50 ? `${text.substring(0, 50)}...` : text;
      console.log(`[ZhipuEmbedder] 尝试嵌入文本: "${textPreview}"`);

      // 准备请求体
      const requestBody = {
        model: this.model,
        input: text,
        dimensions: this.dimensions
      };

      // 执行请求
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorInfo = "";
        try {
          errorInfo = JSON.stringify(JSON.parse(errorText));
        } catch {
          errorInfo = errorText;
        }
        throw new Error(`智谱API错误: ${response.status} ${errorInfo.substring(0, 100)}`);
      }

      const data = await response.json();

      // 验证响应格式
      if (!data.data || !data.data[0] || !data.data[0].embedding) {
        throw new Error('智谱API返回了无效的嵌入格式');
      }

      const embedding = data.data[0].embedding;
      console.log(`[ZhipuEmbedder] 成功获取嵌入向量，维度: ${embedding.length}`);
      return embedding;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[ZhipuEmbedder] 嵌入失败: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * 批量生成文本嵌入向量
   * @param texts 输入文本数组
   * @returns 向量数组的数组
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    // 过滤空文本
    const validTexts = texts.filter(text => text && text.trim() !== '');
    
    if (validTexts.length === 0) {
      console.warn('[ZhipuEmbedder] 批量嵌入的所有文本都为空，返回空结果');
      return [];
    }
    
    console.log(`[ZhipuEmbedder] 批量嵌入 ${validTexts.length} 个文本...`);
    
    // 使用Promise.all并行处理每个文本
    const results = await Promise.all(
      validTexts.map(async (text, index) => {
        try {
          const embedding = await this.embed(text);
          console.log(`[ZhipuEmbedder] 文本 #${index + 1} 嵌入成功，维度: ${embedding.length}`);
          return embedding;
        } catch (error) {
          console.error(`[ZhipuEmbedder] 文本 #${index + 1} 嵌入失败:`, error);
          throw error;
        }
      })
    );
    
    return results;
  }
}
