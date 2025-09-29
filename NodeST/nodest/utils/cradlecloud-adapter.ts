import axios from 'axios';
import { ChatMessage } from '@/shared/types';
import { discordAuthService } from '@/services/discordAuthService';
import { getApiSettings } from '@/utils/settings-helper';
import { getCharacterTablesData } from '@/src/memory/plugins/table-memory/api';
// @ts-ignore - 类型声明在自定义d.ts中提供
import EventSource from 'react-native-event-source';

// 定义OpenAI消息格式类型（与CradleCloud兼容）
type OpenAIMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
};

interface GeneratedContent {
    text?: string;
    images?: string[]; // Base64 encoded images
}

export interface CradleCloudConfig {
  baseURL: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
}

export class CradleCloudAdapter {
  private conversationHistory: Array<{ role: string; content: string }> = [];
  private readonly BASE_URL = 'https://api.cradleintro.top';

  // getter: 动态获取配置
  private get baseURL(): string {
    return this.BASE_URL;
  }
  
  private get model(): string {
    const apiSettings = getApiSettings();
    return apiSettings.cradlecloud?.model || 'gemini-2.0-flash-exp';
  }
  
  private get temperature(): number {
    const apiSettings = getApiSettings();
    return typeof apiSettings.cradlecloud?.temperature === 'number'
      ? apiSettings.cradlecloud.temperature
      : 0.7;
  }
  
  private get max_tokens(): number {
    const apiSettings = getApiSettings();
    return typeof apiSettings.cradlecloud?.max_tokens === 'number'
      ? apiSettings.cradlecloud.max_tokens
      : 32000;
  }

  // Available models mapping
  private availableModels = [
    "gemini-2.0-flash-exp",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gpt-4o",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
    "claude-3-opus",
    "claude-3-sonnet",
    "claude-3-haiku"
  ];

  constructor(config?: CradleCloudConfig) {
    console.log(`[CradleCloudAdapter] 初始化，baseURL: ${this.baseURL}, model: ${this.model}`);
  }

  /**
   * Clean up resources when adapter is no longer needed
   */
  public dispose(): void {
    // No cleanup needed for CradleCloud adapter
  }

  /**
   * Update API settings
   */
  public updateSettings(config: Partial<CradleCloudConfig>): void {
    console.log('[CradleCloudAdapter] updateSettings已废弃，所有设置自动从settings-helper获取');
  }

  /**
   * Check if JWT token is available
   */
  public async isTokenAvailable(): Promise<boolean> {
    try {
      const token = await discordAuthService.getToken();
      return !!token;
    } catch (error) {
      console.error('[CradleCloudAdapter] Failed to check token availability:', error);
      return false;
    }
  }

  /**
   * Get available models list
   */
  public getAvailableModels(): string[] {
    return [...this.availableModels];
  }

  /**
   * Convert ChatMessage format to OpenAI format
   */
  private convertToOpenAIFormat(messages: ChatMessage[]): OpenAIMessage[] {
    return messages.map(msg => {
      if (msg.role && typeof msg.content === 'string') {
        return {
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content
        };
      } else if (msg.parts) {
        // Convert Gemini format to OpenAI format
        const content = msg.parts.map(part => part.text).join(' ');
        return {
          role: (msg.role || 'user') as 'user' | 'assistant' | 'system',
          content: content
        };
      } else {
        return {
          role: 'user',
          content: JSON.stringify(msg)
        };
      }
    });
  }

  /**
   * 修正消息数组中的非法role，将model自动转为assistant
   */
  private fixInvalidRoles(messages: Array<{ role: string; content: any }>): Array<{ role: string; content: any }> {
    return messages.map(msg => {
      if (msg.role === 'model') {
        return { ...msg, role: 'assistant' };
      }
      return msg;
    });
  }

  /**
   * Main chat completion method (支持流式SSE)
   */
  async chatCompletion(
    messages: Array<{ role: string; content: string | any[] }>,
    options?: {
      temperature?: number;
      max_tokens?: number;
      stream?: boolean;
      [key: string]: any;
      memoryResults?: any;
      characterId?: string;
      onStream?: (delta: string) => void;
      abortSignal?: AbortSignal; // 新增：中止信号
    }
  ) {
    try {
      // 修正非法role
      const fixedMessages = this.fixInvalidRoles(messages);
      // 打印完整的请求消息内容，便于调试
      try {
        console.log('[CradleCloudAdapter] 请求消息 (fixedMessages):', JSON.stringify(fixedMessages, null, 2));
      } catch (e) {
        console.log('[CradleCloudAdapter] 请求消息打印失败', e);
      }
      // First try to get JWT token from settings
      let authHeader = null as null | { Authorization: string };
      const apiSettings = getApiSettings();
      const manualJwtToken = apiSettings.cradlecloud?.jwtToken;
      
      if (manualJwtToken && manualJwtToken.trim()) {
        console.log(`[CradleCloudAdapter] 使用手动输入的JWT Token`);
        authHeader = { Authorization: `Bearer ${manualJwtToken}` };
      } else {
        // Fallback to Discord service
        console.log(`[CradleCloudAdapter] 尝试从Discord服务获取JWT Token`);
        authHeader = await discordAuthService.getAuthHeader() as any;
      }
      
      if (!authHeader) {
        throw new Error('JWT token not available. Please enter JWT token manually in API settings.');
      }

      // Get raw token for debugging (only show if manual token)
      if (manualJwtToken) {
        console.log(`[CradleCloudAdapter] 手动JWT Token状态:`, {
          hasToken: !!manualJwtToken,
          tokenLength: manualJwtToken?.length || 0,
          tokenPrefix: manualJwtToken?.substring(0, 20) + '...'
        });
      }

      // If memoryResults provided, construct combinedPrompt and inject into messages
      if (options?.memoryResults && options.memoryResults.results && options.memoryResults.results.length > 0) {
        try {
          const memoryResults = options.memoryResults;
          // Build table memory text if possible
          let tableMemoryText = '';
          try {
            let characterId = memoryResults.characterId || memoryResults.agentId || memoryResults.results?.[0]?.characterId || memoryResults.results?.[0]?.agentId || options.characterId;
            let conversationId = memoryResults.conversationId || memoryResults.results?.[0]?.conversationId;
            if (!characterId && fixedMessages && fixedMessages.length > 0) {
              // try to infer from first message if it contains a characterId field (best-effort)
              // nothing to do here in CradleCloud adapter since messages are plain OpenAI format
            }
            if (characterId) {
              const tableData = await getCharacterTablesData(characterId as string, conversationId as string);
              if (tableData && tableData.success && Array.isArray(tableData.tables) && tableData.tables.length > 0) {
                tableMemoryText += `[角色长期记忆表格]\n`;
                tableData.tables.forEach((table: any) => {
                  const headerRow = '| ' + (table.headers || []).join(' | ') + ' |';
                  const sepRow = '| ' + (table.headers || []).map(() => '---').join(' | ') + ' |';
                  const dataRows = (table.rows || []).map((row: any) => '| ' + row.join(' | ') + ' |').join('\n');
                  tableMemoryText += `表格：${table.name}\n${headerRow}\n${sepRow}\n${dataRows}\n\n`;
                });
              }
            }
          } catch (e) {
            console.warn('[CradleCloudAdapter] 获取表格记忆失败:', e);
          }

          // Build memory section
          let memorySection = `<mem>\n系统检索到的记忆内容：\n`;
          options.memoryResults.results.forEach((item: any, idx: number) => {
            memorySection += `${idx + 1}. ${item.memory}\n`;
          });
          memorySection += `</mem>\n\n`;

          // Response guidelines
          const guidelines = `<response_guidelines>\n- 除了对{{user}}消息的回应之外，结合记忆内容进行回复。\n- 结合表格记忆的内容回复（如果有），但不输出表格的具体内容，仅将表格作为内心记忆。\n</response_guidelines>`;

          // Combined prompt: table memory first, then memorySection, then guidelines
          const combinedPrompt = `${tableMemoryText ? tableMemoryText + '\n' : ''}${memorySection}${guidelines}`;

          // Insert combinedPrompt into fixedMessages before the last user message if any
          let lastUserIndex = -1;
          for (let i = fixedMessages.length - 1; i >= 0; i--) {
            if (fixedMessages[i].role === 'user') { lastUserIndex = i; break; }
          }
          const combinedMessage: OpenAIMessage = { role: 'user', content: combinedPrompt };
          if (lastUserIndex >= 0) {
            fixedMessages.splice(lastUserIndex, 0, combinedMessage);
          } else {
            // no user message found, prepend
            fixedMessages.unshift(combinedMessage);
          }
          console.log('[CradleCloudAdapter] 已将 memoryResults 注入到请求消息，combinedPrompt 长度:', combinedPrompt.length);
        } catch (e) {
          console.warn('[CradleCloudAdapter] 构建 combinedPrompt 时发生错误，继续发送原始消息:', e);
        }
      }

      // Prepare OpenAI-compatible request
      const requestData = {
        model: this.model,
        messages: fixedMessages,
        temperature: options?.temperature ?? this.temperature,
        max_tokens: options?.max_tokens ?? this.max_tokens,
        stream: options?.stream ?? true // 默认开启流式
      };

      // 打印最终发送的 requestData（含 messages）
      try {
        console.log('[CradleCloudAdapter] 最终请求数据 requestData:', JSON.stringify(requestData, null, 2));
      } catch (e) {
        console.log('[CradleCloudAdapter] requestData 打印失败', e);
      }

      console.log(`[CradleCloudAdapter] 发送请求到 ${this.baseURL}/jwt/gemini/chat/completions`);
      console.log(`[CradleCloudAdapter] 请求参数:`, {
        model: requestData.model,
        messagesCount: requestData.messages.length,
        temperature: requestData.temperature,
        max_tokens: requestData.max_tokens,
        stream: requestData.stream
      });

      const url = `${this.baseURL}/jwt/gemini/chat/completions`;
      const headers: Record<string, string> = {
        'Authorization': authHeader.Authorization,
        'Content-Type': 'application/json'
      };

      // 如果不是流式，直接走一次性响应
      if (!requestData.stream) {
        const nonStreamResp = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestData),
          signal: options?.abortSignal
        });
        if (!nonStreamResp.ok) {
          let errText = nonStreamResp.statusText;
          try {
            const errJson = await nonStreamResp.json();
            errText = JSON.stringify(errJson);
          } catch {}
          throw new Error(`CradleCloud API请求失败: HTTP ${nonStreamResp.status}: ${errText}`);
        }
        const data = await nonStreamResp.json();
        if (data && data.choices && data.choices.length > 0) {
          const content = data.choices[0].message?.content || '';
          console.log(`[CradleCloudAdapter] 非流式响应内容:`, content); // 新增日志
          console.log(`[CradleCloudAdapter] 非流式请求成功，响应长度: ${content.length}`);
          return content;
        }
        console.error('[CradleCloudAdapter] 响应格式错误:', data);
        throw new Error('Invalid response format from CradleCloud API');
      }

      // 流式模式（SSE样式）使用 react-native-event-source
      return await new Promise<string>((resolve, reject) => {
        let resultText = '';
        let done = false;
        let aborted = false;
        let eventSource: EventSource | null = null;

        // 处理中止信号
        if (options?.abortSignal) {
          options.abortSignal.addEventListener('abort', () => {
            aborted = true;
            if (eventSource) eventSource.close();
            reject(new Error('REQUEST_ABORTED'));
          });
        }

        eventSource = new EventSource(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestData),
        });

        eventSource.addEventListener('message', (event: any) => {
          if (aborted) return;
          const data = event.data;
          console.log('[CradleCloudAdapter] SSE流响应块:', data); // 新增日志
          if (data === '[DONE]') {
            done = true;
            eventSource.close();
            resolve(resultText);
            return;
          }
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content || '';
            if (delta) {
              resultText += delta;
              if (typeof options?.onStream === 'function') {
                options.onStream(delta);
              }
            }
          } catch (err) {
            console.log(`[CradleCloudAdapter] SSE JSON解析异常:`, err, data);
          }
        });

        eventSource.addEventListener('error', (err: any) => {
          if (aborted) return;
          eventSource.close();
          reject(new Error('CradleCloud API流式请求失败: ' + (err?.message || 'Unknown error')));
        });
      });
    } catch (error) {
      console.error('[CradleCloudAdapter] 请求失败:', error);
      // 检查是否为中止错误
      if ((error as any)?.name === 'AbortError') {
        console.log('[CradleCloudAdapter] 请求被用户中止');
        throw new Error('REQUEST_ABORTED');
      }

      if ((error as any)?.response) {
        const err = error as any;
        console.error('[CradleCloudAdapter] 错误详情:', {
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data
        });
        if (err.response?.status === 401) {
          throw new Error('JWT token验证失败，请检查API设置中的JWT token是否正确');
        } else if (err.response?.status === 403) {
          throw new Error('权限不足，请检查您的Discord身份组');
        } else if (err.response?.status === 429) {
          throw new Error('请求频率过高，请稍后再试');
        } else {
          const errorMsg = err.response?.data?.error || err.response?.data?.message || err.response?.statusText;
          throw new Error(`CradleCloud API请求失败: ${err.response?.status} ${errorMsg}`);
        }
      }

      throw new Error(`网络错误: ${(error as Error).message || 'Unknown error'}`);
    }
  }

  /**
   * 与 GeminiAdapter 对齐的多模态生成接口
   * 支持传入 base64 图片数据或 URL，当前仅使用 base64 data + mimeType
   */
  async generateMultiModalContent(
    prompt: string,
    options: {
      includeImageOutput?: boolean;
      temperature?: number;
      images?: Array<{ data?: string; mimeType?: string; url?: string }>;
    } = {}
  ): Promise<GeneratedContent> {
    try {
      const image = options.images && options.images.length > 0 ? options.images[0] : undefined;
      let content: any[] = [
        { type: 'text', text: prompt }
      ];

      if (image && image.data && image.mimeType) {
        // OpenAI 兼容格式：image_url + base64 data URL
        const dataUrl = `data:${image.mimeType};base64,${image.data}`;
        content.push({
          type: 'image_url',
          image_url: { url: dataUrl }
        });
      } else if (image && image.url) {
        // 如果仅有 URL，也以 image_url 传递
        content.push({ type: 'image_url', image_url: { url: image.url } });
      }

      const resultText = await this.chatCompletion(
        [
          {
            role: 'user',
            content
          }
        ],
        {
          stream: false,
          temperature: options.temperature ?? this.temperature,
          max_tokens: this.max_tokens
        }
      );

      return { text: resultText };
    } catch (error) {
      console.error('[CradleCloudAdapter] generateMultiModalContent failed:', error);
      throw error;
    }
  }

  /**
   * Generate content using CradleCloud API (compatibility with existing interface)
   */
  async generateContent(
    messages: ChatMessage[], 
    characterId?: string,
    memoryResults?: any,
    abortSignal?: AbortSignal,
    onStream?: (delta: string) => void
  ): Promise<string> {
    try {
      // Convert ChatMessage format to OpenAI format
      const openAIMessages = this.convertToOpenAIFormat(messages);
      
      const result = await this.chatCompletion(openAIMessages, {
        characterId,
        memoryResults,
        abortSignal, // 传递中止信号
        onStream,
        stream: false
      });
      
      return result;
    } catch (error) {
      console.error('[CradleCloudAdapter] generateContent failed:', error);
      throw error;
    }
  }

  /**
   * Test connection to CradleCloud API
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const authHeader = await discordAuthService.getAuthHeader();
      if (!authHeader) {
        return {
          success: false,
          message: 'JWT token not available. Please authenticate with Discord first.'
        };
      }

      const testMessage = [
        {
          role: 'user',
          content: 'This is a test message. Please respond with "OK" if you receive this.'
        }
      ];

      const response = await this.chatCompletion(testMessage);
      
      return {
        success: true,
        message: `连接成功！响应: ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '连接测试失败'
      };
    }
  }

  /**
   * Test connection to CradleCloud API with manual JWT token
   */
  async testConnectionWithToken(jwtToken: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!jwtToken || !jwtToken.trim()) {
        return {
          success: false,
          message: 'JWT token is required'
        };
      }

      const testMessage = [
        {
          role: 'user',
          content: 'This is a test message. Please respond with "OK" if you receive this.'
        }
      ];

      // Prepare OpenAI-compatible request
      const requestData = {
        model: this.model,
        messages: testMessage,
        temperature: this.temperature,
        max_tokens: this.max_tokens,
        stream: false
      };

      console.log(`[CradleCloudAdapter] 测试连接到 ${this.baseURL}/jwt/gemini/chat/completions`);
      console.log(`[CradleCloudAdapter] 使用手动JWT Token进行测试`);

      const response = await axios.post(
        `${this.baseURL}/jwt/gemini/chat/completions`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const content = response.data.choices[0].message?.content || '';
        console.log(`[CradleCloudAdapter] 测试成功，响应长度: ${content.length}`);
        return {
          success: true,
          message: `连接成功！模型: ${this.model}\n响应: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`
        };
      } else {
        console.error('[CradleCloudAdapter] 测试响应格式错误:', response.data);
        return {
          success: false,
          message: 'Invalid response format from CradleCloud API'
        };
      }
    } catch (error) {
      console.error('[CradleCloudAdapter] 测试连接失败:', error);
      
      if (axios.isAxiosError(error)) {
        console.error('[CradleCloudAdapter] Axios错误详情:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });
        
        if (error.response?.status === 401) {
          return {
            success: false,
            message: 'JWT token验证失败，请检查token是否正确'
          };
        } else if (error.response?.status === 403) {
          return {
            success: false,
            message: '权限不足，请检查您的Discord身份组'
          };
        } else if (error.response?.status === 429) {
          return {
            success: false,
            message: '请求频率过高，请稍后再试'
          };
        } else {
          const errorMsg = error.response?.data?.error || error.response?.data?.message || error.response?.statusText;
          return {
            success: false,
            message: `CradleCloud API测试失败: ${error.response?.status} ${errorMsg}`
          };
        }
      } else {
        return {
          success: false,
          message: `网络错误: ${(error as Error).message || 'Unknown error'}`
        };
      }
    }
  }
}

// Export default instance
export const cradleCloudAdapter = new CradleCloudAdapter();
export default CradleCloudAdapter;
