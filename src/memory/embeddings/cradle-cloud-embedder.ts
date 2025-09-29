import { Embedder } from './base';
import { discordAuthService } from '@/services/discordAuthService';
import { getApiSettings } from '@/utils/settings-helper';

/**
 * Cradle Cloud 嵌入器 - 使用 Cradle Cloud API 的向量嵌入服务
 */
export class CradleCloudEmbedder implements Embedder {
  private model: string;
  private endpoint: string;
  private dimensions: number = 3072;
  private retryCount: number = 3;

  constructor(config: { model?: string; url?: string; dimensions?: number } = {}) {
    this.model = config.model || 'gemini-embedding-001';
    this.endpoint = config.url || 'https://api.cradleintro.top';
    this.dimensions = config.dimensions || 3072;

    console.log(`[CradleCloudEmbedder] 初始化，model: ${this.model}, endpoint: ${this.endpoint}`);
  }

  /**
   * 获取认证 Header
   * @returns Authorization header 或 null
   */
  private async getAuthHeader(): Promise<{ Authorization: string } | null> {
    try {
      // 优先使用手动输入的 JWT Token
      const apiSettings = getApiSettings();
      const manualJwtToken = apiSettings.cradlecloud?.jwtToken;
      
      if (manualJwtToken && manualJwtToken.trim()) {
        console.log('[CradleCloudEmbedder] 使用手动输入的JWT Token');
        return { Authorization: `Bearer ${manualJwtToken}` };
      }

      // 回退到 Discord 服务获取 Token
      console.log('[CradleCloudEmbedder] 尝试从Discord服务获取JWT Token');
      const token = await discordAuthService.getToken();
      
      if (!token) {
        throw new Error('JWT token not available');
      }

      return { Authorization: `Bearer ${token}` };
    } catch (error) {
      console.error('[CradleCloudEmbedder] 获取认证头失败:', error);
      return null;
    }
  }

  /**
   * 生成文本嵌入向量
   * @param text 输入文本
   * @returns 向量数组
   */
  async embed(text: string): Promise<number[]> {
    if (!text || text.trim() === '') {
      throw new Error('[CradleCloudEmbedder] 嵌入文本为空');
    }

    const authHeader = await this.getAuthHeader();
    if (!authHeader) {
      throw new Error('[CradleCloudEmbedder] 无法获取认证信息，请配置JWT Token或登录Discord');
    }

    let lastError: Error | null = null;
    
    // 重试机制
    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        const textPreview = text.length > 50 ? `${text.substring(0, 50)}...` : text;
        console.log(`[CradleCloudEmbedder] 尝试嵌入文本 (第${attempt}次): "${textPreview}"`);

        // 构建请求体 - 单个文本嵌入
        // 使用与 testCradleCloudEmbedding 相同的格式：
        // - model 为模型名（不带前缀）
        // - content 为一个对象（而非数组）
        // - embedding_config 包含 task_type 和 output_dimensionality
        const requestBody = {
          model: this.model,
          content: {
            parts: [
              {
                text: text
              }
            ]
          },
          embedding_config: {
            task_type: 'SEMANTIC_SIMILARITY',
            output_dimensionality: this.dimensions
          }
        };

        const url = `${this.endpoint}/jwt/v1/v1beta/models/${this.model}/embedContent`;
        console.log(`[CradleCloudEmbedder] 发送请求到: ${url}`);
        // 打印请求详情（掩码 Authorization），并限制 body 预览长度
        try {
          const maskedHeaders = { ...authHeader } as any;
          if (maskedHeaders.Authorization) maskedHeaders.Authorization = 'Bearer *****';
          const bodyString = JSON.stringify(requestBody);
          const bodyPreview = bodyString.length > 65536 ? bodyString.slice(0, 65536) + '\n...[truncated]' : bodyString;
          console.log('[CradleCloudEmbedder] 请求详情:', { url, headers: maskedHeaders, bodyPreview });
        } catch (logErr) {
          console.warn('[CradleCloudEmbedder] 无法序列化请求体以打印:', logErr);
        }
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeader
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorInfo = "";
          try {
            const errorData = JSON.parse(errorText);
            errorInfo = errorData.error?.message || errorText;
          } catch {
            errorInfo = errorText;
          }
          throw new Error(`Cradle Cloud API错误: ${response.status} ${errorInfo.substring(0, 200)}`);
        }

        const data = await response.json();

        // 验证响应格式
        if (!data.embedding || !data.embedding.values) {
          throw new Error('Cradle Cloud API返回了无效的嵌入格式');
        }

        const embedding = data.embedding.values;
        console.log(`[CradleCloudEmbedder] 成功获取嵌入向量，维度: ${embedding.length}`);
        return embedding;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`[CradleCloudEmbedder] 第${attempt}次尝试失败:`, lastError.message);
        
        if (attempt < this.retryCount) {
          // 等待一段时间后重试
          const delay = Math.pow(2, attempt) * 1000; // 指数退避
          console.log(`[CradleCloudEmbedder] ${delay}ms后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // 所有重试都失败了
    throw lastError || new Error('[CradleCloudEmbedder] 嵌入失败，已达到最大重试次数');
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
      console.warn('[CradleCloudEmbedder] 批量嵌入的所有文本都为空，返回空结果');
      return [];
    }

    const authHeader = await this.getAuthHeader();
    if (!authHeader) {
      throw new Error('[CradleCloudEmbedder] 无法获取认证信息，请配置JWT Token或登录Discord');
    }

    console.log(`[CradleCloudEmbedder] 批量嵌入 ${validTexts.length} 个文本...`);

    let lastError: Error | null = null;
    
    // 重试机制
    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        // 构建请求体 - 批量文本嵌入
        // contents 为数组，每项与单条 content 的结构一致
        const requestBody = {
          model: this.model,
          contents: validTexts.map(text => ({
            parts: [
              {
                text: text
              }
            ]
          })),
          embedding_config: {
            task_type: 'RETRIEVAL_QUERY',
            output_dimensionality: this.dimensions
          }
        };

        const url = `${this.endpoint}/jwt/v1/v1beta/models/${this.model}/embedContent`;
        console.log(`[CradleCloudEmbedder] 发送批量请求到: ${url} (第${attempt}次)`);
        try {
          const maskedHeaders = { ...authHeader } as any;
          if (maskedHeaders.Authorization) maskedHeaders.Authorization = 'Bearer *****';
          const bodyString = JSON.stringify(requestBody);
          const bodyPreview = bodyString.length > 65536 ? bodyString.slice(0, 65536) + '\n...[truncated]' : bodyString;
          console.log('[CradleCloudEmbedder] 请求详情:', { url, headers: maskedHeaders, bodyPreview });
        } catch (logErr) {
          console.warn('[CradleCloudEmbedder] 无法序列化请求体以打印:', logErr);
        }
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeader
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorInfo = "";
          try {
            const errorData = JSON.parse(errorText);
            errorInfo = errorData.error?.message || errorText;
          } catch {
            errorInfo = errorText;
          }
          throw new Error(`Cradle Cloud API错误: ${response.status} ${errorInfo.substring(0, 200)}`);
        }

        const data = await response.json();

        // 验证响应格式
        if (!data.embeddings || !Array.isArray(data.embeddings)) {
          throw new Error('Cradle Cloud API返回了无效的批量嵌入格式');
        }

        const embeddings = data.embeddings.map((item: any) => {
          if (!item.values) {
            throw new Error('批量嵌入响应中缺少向量值');
          }
          return item.values;
        });

        console.log(`[CradleCloudEmbedder] 成功获取 ${embeddings.length} 个嵌入向量`);
        return embeddings;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`[CradleCloudEmbedder] 批量嵌入第${attempt}次尝试失败:`, lastError.message);
        
        if (attempt < this.retryCount) {
          // 等待一段时间后重试
          const delay = Math.pow(2, attempt) * 1000; // 指数退避
          console.log(`[CradleCloudEmbedder] ${delay}ms后重试批量嵌入...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // 批量嵌入失败，回退到逐个处理
    console.warn('[CradleCloudEmbedder] 批量嵌入失败，回退到逐个处理');
    try {
      const results = await Promise.all(
        validTexts.map(async (text, index) => {
          try {
            const embedding = await this.embed(text);
            console.log(`[CradleCloudEmbedder] 文本 #${index + 1} 嵌入成功，维度: ${embedding.length}`);
            return embedding;
          } catch (error) {
            console.error(`[CradleCloudEmbedder] 文本 #${index + 1} 嵌入失败:`, error);
            throw error;
          }
        })
      );
      
      return results;
    } catch (error) {
      throw lastError || error;
    }
  }

  /**
   * 更新API密钥（对于CradleCloud，这个方法不适用，因为使用JWT Token）
   * @param apiKey 不使用，保留以兼容接口
   */
  updateApiKey?(apiKey: string): void {
    console.warn('[CradleCloudEmbedder] updateApiKey方法不适用于CradleCloud，请通过settings-helper配置JWT Token');
  }
}
