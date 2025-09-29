import axios from 'axios';
import { ChatMessage } from '@/shared/types';
import { mcpAdapter } from './mcp-adapter';
import { getApiSettings, getUserSettingsGlobally } from '@/utils/settings-helper';
import { getCharacterTablesData } from '@/src/memory/plugins/table-memory/api';



interface GeneratedContent {
    text?: string;
    images?: string[]; // Base64 encoded images
}

interface ImageInput {
    // Base64 encoded image data
    data?: string;
    // MIME type of the image (e.g., "image/jpeg", "image/png")
    mimeType?: string;
    // URL to fetch the image from
    url?: string;
}



export interface OpenAICompatibleConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

// Define interfaces for image handling to match gemini-adapter
interface ImageInput {
  // Base64 encoded image data
  data?: string;
  // MIME type of the image (e.g., "image/jpeg", "image/png")
  mimeType?: string;
  // URL to fetch the image from
  url?: string;
}

interface GeneratedContent {
  text?: string;
  images?: string[]; // Base64 encoded images
}

export class OpenAIAdapter {
  private conversationHistory: Array<{ role: string; content: string }> = [];

  // getter: 动态获取配置
  private get endpoint(): string {
    const apiSettings = getApiSettings();
    return apiSettings.OpenAIcompatible?.endpoint?.replace(/\/$/, '') || '';
  }
  private get apiKey(): string {
    const apiSettings = getApiSettings();
    return apiSettings.OpenAIcompatible?.apiKey || '';
  }
  private get model(): string {
    const apiSettings = getApiSettings();
    return apiSettings.OpenAIcompatible?.model || 'gpt-3.5-turbo';
  }
  private get stream(): boolean {
    const apiSettings = getApiSettings();
    return !!apiSettings.OpenAIcompatible?.stream;
  }
  private get temperature(): number {
    const apiSettings = getApiSettings();
    return typeof apiSettings.OpenAIcompatible?.temperature === 'number'
      ? apiSettings.OpenAIcompatible.temperature
      : 0.7;
  }
  private get max_tokens(): number {
    const apiSettings = getApiSettings();
    return typeof apiSettings.OpenAIcompatible?.max_tokens === 'number'
      ? apiSettings.OpenAIcompatible.max_tokens
      : 320000;
  }


  // Available models mapping from OpenAI naming to internal naming
  private availableModels = [
    "gpt-4-turbo",
    "gpt-4o",
    "gpt-4-vision-preview",
    "gpt-4",
    "gpt-3.5-turbo",
    "claude-3-opus",
    "claude-3-sonnet",
    "claude-3-haiku"
  ];

  constructor(config: OpenAICompatibleConfig) {
    console.log(`[OpenAIAdapter] 初始化，endpoint: ${this.endpoint}, model: ${this.model}`);
  }

  /**
   * Update API settings
   */
  public updateSettings(config: Partial<OpenAICompatibleConfig>): void {
    console.log('[OpenAIAdapter] updateSettings已废弃，所有设置自动从settings-helper获取');
  }
  /**
   * Check if API key is configured
   */
  public isApiKeyConfigured(): boolean {
    return !!this.apiKey;
    
  }

  /**
   * Get available models list
   */
  public getAvailableModels(): string[] {
    return [...this.availableModels];
  }

  async chatCompletion(
    messages: Array<{ role: string; content: string | any[] }>,
    options?: {
      temperature?: number;
      max_tokens?: number;
      stream?: boolean;
      [key: string]: any;
      // 新增参数
      memoryResults?: any;
      characterId?: string;
      // 新增：流式回调
      onStream?: (delta: string) => void;
      // 新增：中止信号
      abortSignal?: AbortSignal;
    }
  ) {
    // === 新增：表格记忆注入逻辑迁移到这里 ===
    let enhancedMessages = [...messages];
    let tableMemoryText = '';
    let effectiveCharacterId: string | undefined = options?.characterId;
    const {
      memoryResults,
      characterId,
      temperature,
      max_tokens,
      stream,
      onStream, // 新增
      abortSignal, // 新增：中止信号
      ...restOptions
    } = options || {};


    // 如果memoryResults存在，优先从memoryResults获取characterId
    if (memoryResults) {
      if (!effectiveCharacterId && messages.length > 0) {
        effectiveCharacterId = (messages[0] as any)?.characterId;
      }
    }

    // 获取表格记忆
    if (effectiveCharacterId) {
      try {
        const tableData = await getCharacterTablesData(effectiveCharacterId);
        if (tableData.success && tableData.tables.length > 0) {
          tableMemoryText += `[角色长期记忆表格]\n`;
          tableData.tables.forEach(table => {
            const headerRow = '| ' + table.headers.join(' | ') + ' |';
            const sepRow = '| ' + table.headers.map(() => '---').join(' | ') + ' |';
            const dataRows = table.rows.map(row => '| ' + row.join(' | ') + ' |').join('\n');
            tableMemoryText += `表格：${table.name}\n${headerRow}\n${sepRow}\n${dataRows}\n\n`;
          });
        }
      } catch (e) {
        console.warn('[OpenAIAdapter] 获取角色表格记忆失败:', e);
      }
    }

    // 如果有表格记忆，将其插入到最后一个user消息前
    if (tableMemoryText) {
      let lastUserIdx = -1;
      for (let i = enhancedMessages.length - 1; i >= 0; i--) {
        if (enhancedMessages[i].role === 'user') {
          lastUserIdx = i;
          break;
        }
      }
      let insertIdx = lastUserIdx !== -1 ? lastUserIdx : enhancedMessages.length;
      enhancedMessages.splice(insertIdx, 0, {
        role: "user",
        content: tableMemoryText + `
<response_guidelines>
- 你会在回复中结合上面的[角色长期记忆表格]内容，表格中记录了重要信息和事实。
- 你会确保回复与[角色长期记忆表格]的信息保持一致，不会捏造表格中不存在的信息。
- 你的回复会自然融入[角色长期记忆表格]的信息，不会生硬地提及"根据表格"之类的字眼。
- 你会确保回复保持角色人设的一致性。
</response_guidelines>`
      });
    }

    // 这里不再自动拼接 /v1/chat/completions，完全以 endpoint 字段为准
    const url = this.endpoint;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };

    const reqTemperature = typeof options?.temperature === 'number'
      ? options.temperature
      : this.temperature;
    const reqMaxTokens = typeof options?.max_tokens === 'number'
      ? options.max_tokens
      : this.max_tokens;
    const reqStream = typeof options?.stream === 'boolean'
      ? options.stream
      : this.stream;

    const data = {
      model: options?.model || this.model,
      messages: enhancedMessages,
      temperature: reqTemperature,
      max_tokens: reqMaxTokens,
      stream: reqStream,
      ...restOptions // 不包含 memoryResults/characterId
    };
    // 新增：详细打印请求内容，包括完整的messages数组
    console.log('[OpenAIAdapter] 发送chatCompletion请求 FULL:', JSON.stringify({
      url,
      headers: { ...headers, Authorization: 'Bearer ***' },
      data
    }, null, 2));
    console.log(`[OpenAIAdapter] 发送chatCompletion请求:`, {
      url,
      headers: { ...headers, Authorization: 'Bearer ***' },
      data
    });

        try {
      if (data.stream) {
        // --- 流式响应处理 ---
        const resp = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(data),
          signal: abortSignal // 新增：添加中止信号
        });
        if (!resp.ok) {
          let errMsg = '';
          try {
            const errJson = await resp.json();
            errMsg = JSON.stringify(errJson);
          } catch {
            errMsg = resp.statusText;
          }
          throw new Error(`OpenAI兼容API流式请求失败: HTTP ${resp.status}: ${errMsg}`);
        }
        // 处理SSE流
        const reader = resp.body?.getReader();
        let resultText = '';
        let done = false;
        let buffer = '';
        while (reader && !done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            buffer += new TextDecoder().decode(value);
            // 按行分割
            let lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              if (trimmed === 'data: [DONE]') {
                done = true;
                break;
              }
              if (trimmed.startsWith('data: ')) {
                try {
                  const json = JSON.parse(trimmed.slice(6));
                  const delta = json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content || '';
                  if (delta) {
                    resultText += delta;
                    // 新增：流式回调
                    if (typeof onStream === 'function') {
                      onStream(delta);
                    }
                  }
                } catch (e) {
                  // ignore parse error
                }
              }
            }
          }
        }
        // 返回模拟的OpenAI响应格式
        return {
          choices: [
            {
              message: { content: resultText }
            }
          ]
        };
      } else {

      const resp = await axios.post(url, data, { 
        headers,
        signal: abortSignal // 新增：添加中止信号到axios
      });
      console.log(`[OpenAIAdapter] 收到响应:`, resp.data);
      return resp.data; }
    } catch (error: any) {
      // 检查是否为中止错误
      if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
        console.log('[OpenAIAdapter] 请求被用户中止');
        throw new Error('REQUEST_ABORTED');
      }
      
      if (error.response) {
        console.error(`[OpenAIAdapter] 请求失败，状态码: ${error.response.status}，响应:`, error.response.data);
        throw new Error(`OpenAI兼容API请求失败: ${error.response.status} ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        console.error(`[OpenAIAdapter] 无服务器响应:`, error.request);
        throw new Error('OpenAI兼容API无服务器响应');
      } else {
        console.error(`[OpenAIAdapter] 请求异常:`, error.message);
        throw new Error(`OpenAI兼容API请求异常: ${error.message}`);
      }
    }
  }

  /**
   * Convert ChatMessage format to OpenAI message format
   */
  private convertToOpenAIMessages(messages: ChatMessage[]): Array<{ role: string; content: any }> {
    return messages.map(message => {

      
            // 优先处理 Gemini 风格的 parts 字段
            if (Array.isArray((message as any).parts) && (message as any).parts.length > 0) {
              // 拼接所有 part.text
              const textContent = (message as any).parts
                .map((part: any) => (typeof part === 'object' && part.text) ? part.text : '')
                .join(' ')
                .trim();
              let role = message.role;
              if (role === 'model') role = 'assistant';
              if (role === 'user') role = 'user';
              if (role === 'system') role = 'system';
              return { role, content: textContent };
            }



      // Handle multimodal content (text + images)
      if (message.parts && Array.isArray(message.parts) && message.parts.length > 0) {
        // Check if there are image parts
        const hasImages = message.parts.some(part =>
          typeof part === 'object' &&
          (
            (part.inlineData && typeof part.inlineData === 'object' && part.inlineData !== null && 'mimeType' in part.inlineData && 'data' in part.inlineData) ||
            (part.fileData && typeof part.fileData === 'object' && part.fileData !== null && 'fileUri' in part.fileData)
          )
        );

        if (hasImages) {
          // Create multimodal content array for OpenAI
          const content: any[] = [];

          message.parts.forEach(part => {
            if (typeof part === 'object') {
              if (part.text) {
                // Add text content
                content.push({
                  type: "text",
                  text: part.text
                });
              }
              // 只在inlineData为对象且有mimeType和data属性时访问
              if (
                part.inlineData &&
                typeof part.inlineData === 'object' &&
                part.inlineData !== null &&
                'mimeType' in part.inlineData &&
                'data' in part.inlineData
              ) {
                content.push({
                  type: "image_url",
                  image_url: {
                    url: `data:${(part.inlineData as any).mimeType};base64,${(part.inlineData as any).data}`
                  }
                });
              }
              // 只在fileData为对象且有fileUri属性时访问
              if (
                part.fileData &&
                typeof part.fileData === 'object' &&
                part.fileData !== null &&
                'fileUri' in part.fileData
              ) {
                content.push({
                  type: "image_url",
                  image_url: {
                    url: (part.fileData as any).fileUri
                  }
                });
              }
            }
          });

          // Map Gemini roles to OpenAI roles
          let role = message.role;
          if (role === 'model') role = 'assistant';
          if (role === 'user') role = 'user';
          if (role === 'system') role = 'system';

          return { role, content };
        }
      }

      // OpenAI风格或兜底
      let textContent = "";
      if (typeof message.content === 'string') {
        textContent = message.content;
      }
      let role = message.role;
      if (role === 'model') role = 'assistant';
      if (role === 'user') role = 'user';
      if (role === 'system') role = 'system';
      return {
        role,
        content: textContent
      };
    });
  }
  
  /**
   * Generate content from messages
   */
  async generateContent(
    contents: ChatMessage[], 
    characterId?: string,
    memoryResults?: any,
    abortSignal?: AbortSignal,
    onStream?: (delta: string) => void
  ): Promise<string> {
    // Check if we have API keys
    const apiKeyAvailable = this.isApiKeyConfigured();
    
    // If no API key, throw error
    if (!apiKeyAvailable) {
      throw new Error("未配置API密钥。请配置API密钥。");
    }
    
    try {
      // ==== 新增：获取角色表格记忆 ====
      let tableMemoryText = '';
      // 统一 characterId 获取逻辑，和 Gemini-adapter 保持一致
      let effectiveCharacterId: string | undefined = undefined;
      let effectiveConversationId: string | undefined = undefined;
      // 检查 memoryResults 结构

      if (typeof arguments[1] === 'object' && arguments[1] !== null && 'results' in arguments[1]) {
        memoryResults = arguments[1];
      }
      if (memoryResults) {
        // 详细日志，和 Gemini-adapter 一致
        console.log('[OpenAIAdapter][表格记忆] memoryResults.characterId:', memoryResults.characterId, typeof memoryResults.characterId);
        console.log('[OpenAIAdapter][表格记忆] memoryResults.agentId:', memoryResults.agentId, typeof memoryResults.agentId);
        console.log('[OpenAIAdapter][表格记忆] memoryResults.results[0]?.characterId:', memoryResults.results?.[0]?.characterId, typeof memoryResults.results?.[0]?.characterId);
        console.log('[OpenAIAdapter][表格记忆] memoryResults.results[0]?.agentId:', memoryResults.results?.[0]?.agentId, typeof memoryResults.results?.[0]?.agentId);
        console.log('[OpenAIAdapter][表格记忆] memoryResults.conversationId:', memoryResults.conversationId, typeof memoryResults.conversationId);
        console.log('[OpenAIAdapter][表格记忆] memoryResults.results[0]?.conversationId:', memoryResults.results?.[0]?.conversationId, typeof memoryResults.results?.[0]?.conversationId);
        effectiveCharacterId =
          memoryResults.characterId ||
          memoryResults.agentId ||
          memoryResults.results?.[0]?.characterId ||
          memoryResults.results?.[0]?.agentId;
        effectiveConversationId =
          memoryResults.conversationId ||
          memoryResults.results?.[0]?.conversationId;
        if (!effectiveCharacterId && contents.length > 0) {
          effectiveCharacterId = (contents[0] as any)?.characterId;
          console.log('[OpenAIAdapter][表格记忆] 尝试从contents[0]获取characterId:', effectiveCharacterId, typeof effectiveCharacterId);
        }
        console.log('[OpenAIAdapter][表格记忆] 最终用于查询的 characterId:', effectiveCharacterId, 'conversationId:', effectiveConversationId);
      } else if (characterId) {
        effectiveCharacterId = characterId;
        console.log('[OpenAIAdapter][表格记忆] characterId参数值:', effectiveCharacterId, typeof effectiveCharacterId);
      }
 
      
      if (effectiveCharacterId) {
        try {
          console.log('[OpenAIAdapter][表格记忆] 调用 getCharacterTablesData 前参数:', { characterId: effectiveCharacterId });
          const tableData = await getCharacterTablesData(effectiveCharacterId);
          console.log('[OpenAIAdapter][表格记忆] getCharacterTablesData 返回:', tableData);
          if (tableData.success && tableData.tables.length > 0) {
            tableMemoryText += `[角色长期记忆表格]\n`;
            tableData.tables.forEach(table => {
              const headerRow = '| ' + table.headers.join(' | ') + ' |';
              const sepRow = '| ' + table.headers.map(() => '---').join(' | ') + ' |';
              const dataRows = table.rows.map(row => '| ' + row.join(' | ') + ' |').join('\n');
              tableMemoryText += `表格：${table.name}\n${headerRow}\n${sepRow}\n${dataRows}\n\n`;
            });
            
            console.log('[OpenAIAdapter][表格记忆] 成功获取表格记忆数据');
          } else {
            console.log('[OpenAIAdapter][表格记忆] 未获取到有效表格数据，success:', tableData.success, 'tables.length:', tableData.tables.length);
          }
        } catch (e) {
          console.warn('[OpenAIAdapter][表格记忆] 获取角色表格记忆失败:', e);
        }
      } else {
        console.log('[OpenAIAdapter][表格记忆] 未提供有效的characterId/agentId，跳过表格记忆注入');
      }
      // ==== 表格记忆获取结束 ====
      
      // 准备请求内容
      let enhancedContents = [...contents];
      
      // 如果获取到有效的表格记忆，将其作为系统消息插入
      if (tableMemoryText) {
        // 构建表格记忆提示词，与gemini-adapter逻辑保持一致
        const tableMemoryPrompt = `${tableMemoryText}\n\n<response_guidelines>
- 你会在回复中结合上面的[角色长期记忆表格]内容，表格中记录了重要信息和事实。
- 你会确保回复与[角色长期记忆表格]的信息保持一致，不会捏造表格中不存在的信息。
- 你的回复会自然融入[角色长期记忆表格]的信息，不会生硬地提及"根据表格"之类的字眼。
- 你会确保回复保持角色人设的一致性。
</response_guidelines>`;

        // 查找最后一个user消息的索引
        let lastUserIdx = -1;
        for (let i = enhancedContents.length - 1; i >= 0; i--) {
          if (enhancedContents[i].role === 'user') {
            lastUserIdx = i;
            break;
          }
        }

        // 如果有user消息，插入到最后一个user消息前；否则插入到最后
        let insertIdx = lastUserIdx !== -1 ? lastUserIdx : enhancedContents.length;
        
        // 插入表格记忆消息
        enhancedContents.splice(insertIdx, 0, {
          role: "user",
          parts: [{ text: tableMemoryPrompt }]
        });

        console.log('[OpenAIAdapter][表格记忆] 已将表格记忆注入到消息中，插入索引:', insertIdx);
      }
      
      // 转换为OpenAI格式的消息
      const openaiMessages = this.convertToOpenAIMessages(enhancedContents);
      
      console.log(`[OpenAIAdapter] 发送请求到API，共 ${openaiMessages.length} 条消息`);
      
      const startTime = Date.now();
      const completion = await this.chatCompletion(openaiMessages, {
        temperature: 0.7,
        max_tokens: 32000,
        abortSignal // 传递中止信号
      });
      const endTime = Date.now();
      
      console.log(`[OpenAIAdapter] API调用完成，耗时: ${endTime - startTime}ms`);
      
      if (completion.choices && completion.choices.length > 0) {
        const responseText = completion.choices[0].message?.content || "";
        
        if (responseText) {
          console.log(`[OpenAIAdapter] 成功接收响应，长度: ${responseText.length}`);
          console.log(`[OpenAIAdapter] 响应前100个字符: ${responseText.substring(0, 100)}...`);
          
          // 将响应添加到对话历史
          this.conversationHistory.push({
            role: "assistant",
            content: responseText
          });
          
          return responseText;
        }
      }
      
      throw new Error("API返回了无效的响应格式");
    } catch (error) {
      console.error(`[OpenAIAdapter] API请求失败:`, error);
      throw new Error(`API请求失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }


  /**
   * 生成包含文本和/或图片的内容
   */
  async generateMultiModalContent(
    prompt: string, 
    options: { 
      includeImageOutput?: boolean;
      temperature?: number;
      images?: ImageInput[];
      abortSignal?: AbortSignal; // 新增：中止信号
    } = {}
  ): Promise<GeneratedContent> {
    // Check if we have API keys
    const apiKeyAvailable = this.isApiKeyConfigured();
    
    // If no API key, throw error
    if (!apiKeyAvailable) {
      throw new Error("未配置API密钥。请配置API密钥。");
    }
    
    try {
      // 检查是否提供了图片输入或需要图片输出
      const isVisionRequest = options.images && options.images.length > 0;
      const requiresVisionModel = isVisionRequest || options.includeImageOutput;
      
      // 选择适合的模型 - 如果需要视觉能力则使用vision模型
      let modelToUse = this.model;
      if (requiresVisionModel) {
        if (!modelToUse.includes('vision') && !modelToUse.includes('gpt-4o')) {
          // 如果当前模型不是vision-capable，切换到vision预览模型
          console.log(`[OpenAIAdapter] 检测到图像处理需求，将模型从 ${modelToUse} 切换到 gpt-4-vision-preview`);
          modelToUse = 'gpt-4-vision-preview';
        } else {
          console.log(`[OpenAIAdapter] 使用现有的视觉模型: ${modelToUse}`);
        }
      }
      
      // 准备消息内容
      let messages = [];
      
      // 如果有图像输入，需要构建多模态消息
      if (isVisionRequest) {
        let messageContent = [];
        
        // 添加文本提示
        if (prompt) {
          messageContent.push({
            type: "text",
            text: prompt
          });
        }
        
        // 处理每一个图像
        for (const img of options.images!) {
          try {
            let imageUrl: string;
            
            if (img.url) {
              // 如果提供了URL，直接使用
              imageUrl = img.url;
            } else if (img.data && img.mimeType) {
              // 如果提供了Base64数据，构建Data URL
              imageUrl = `data:${img.mimeType};base64,${img.data}`;
            } else {
              console.error('[OpenAIAdapter] 无效的图像输入:', img);
              continue;
            }
            
            // 添加图像到内容中
            messageContent.push({
              type: "image_url",
              image_url: {
                url: imageUrl
              }
            });
          } catch (error) {
            console.error('[OpenAIAdapter] 处理图像输入时出错:', error);
          }
        }
        
        // 创建最终的用户消息
        messages.push({
          role: "user",
          content: messageContent
        });
      } else {
        // 简单的文本消息
        messages.push({
          role: "user",
          content: prompt
        });
      }
      
      // OpenAI不直接支持在同一请求中生成图像，会忽略includeImageOutput选项
      if (options.includeImageOutput) {
        console.log('[OpenAIAdapter] 警告: OpenAI API不直接支持图像生成，此请求将只返回文本');
      }
      
      console.log(`[OpenAIAdapter] 发送多模态请求到API`);
      console.log(`[OpenAIAdapter] 使用模型: ${modelToUse}`);
      
      const startTime = Date.now();
      const completion = await this.chatCompletion(messages, {
        model: modelToUse,
        temperature: options.temperature || 0.7,
        max_tokens: this.max_tokens,
        response_format: options.includeImageOutput ? undefined : { type: "text" },
        abortSignal: options.abortSignal // 传递中止信号
      });
      const endTime = Date.now();
      
      console.log(`[OpenAIAdapter] API调用完成，耗时: ${endTime - startTime}ms`);
      
      const generatedContent: GeneratedContent = {};
      
      if (completion.choices && completion.choices.length > 0) {
        const content = completion.choices[0].message?.content;
        
        if (typeof content === 'string') {
          generatedContent.text = content;
        } else if (Array.isArray(content)) {
          // 处理多模态响应
          const textParts = content.filter(part => part.type === 'text').map(part => part.text);
          generatedContent.text = textParts.join('\n');
        }
        
        console.log(`[OpenAIAdapter] 成功接收多模态响应`);
        if (generatedContent.text) {
          console.log(`[OpenAIAdapter] 响应包含文本，长度: ${generatedContent.text.length}`);
        }
      } else {
        console.error(`[OpenAIAdapter] 无效的响应格式:`, completion);
      }
      
      return generatedContent;
    } catch (error) {
      console.error(`[OpenAIAdapter] 多模态内容生成失败:`, error);
      throw new Error(`多模态请求失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }
  
  /**
   * 从URL获取图像并转换为Base64格式
   * 与Gemini适配器保持相同逻辑
   */
  async fetchImageAsBase64(imageUrl: string): Promise<{ data: string; mimeType: string }> {
    try {
      console.log(`[OpenAIAdapter] 正在从URL获取图片: ${imageUrl}`);
      
      // 新增：如果是data:URL，直接解析
      if (imageUrl.startsWith('data:')) {
        // 解析data URL格式
        const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const mimeType = matches[1];
          const base64Data = matches[2];
          const previewLength = 10;
          const base64Preview = base64Data.substring(0, previewLength) + '...';
          console.log(`[OpenAIAdapter] 检测到data:URL，直接提取base64数据，MIME类型: ${mimeType}, 大小: ${base64Data.length}字节, 预览: ${base64Preview}`);
          return {
            data: base64Data,
            mimeType
          };
        } else {
          throw new Error('无效的data:URL格式');
        }
      }
      
      const response = await fetch(imageUrl);
      
      if (!response.ok) {
        throw new Error(`获取图片失败: ${response.status} ${response.statusText}`);
      }
      
      // 获取内容类型（MIME类型）
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      
      // 获取图像数据并转换为Base64
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      
      // 转换为Base64字符串
      let binaryString = '';
      for (let i = 0; i < bytes.length; i++) {
        binaryString += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binaryString);
      
      // 不打印完整的base64字符串，只记录其长度和前10个字符
      const previewLength = 10;
      const base64Preview = base64Data.substring(0, previewLength) + '...';
      console.log(`[OpenAIAdapter] 成功获取并编码图片，MIME类型: ${contentType}, 大小: ${base64Data.length}字节, 预览: ${base64Preview}`);
      
      return {
        data: base64Data,
        mimeType: contentType
      };
    } catch (error) {
      console.error(`[OpenAIAdapter] 从URL获取图片失败:`, error);
      throw error;
    }
  }

  /**
   * 分析图片内容
   * @param image 图片输入（URL或Base64数据）
   * @param prompt 询问图片的提示
   * @returns 分析结果文本
   */
  async analyzeImage(
    image: ImageInput, 
    prompt: string, 
    abortSignal?: AbortSignal
  ): Promise<string> {
    // 检查是否有API密钥配置或者是否应该使用云服务
    const apiKeyAvailable = this.isApiKeyConfigured();
 

    // 增强图像分析提示词，与Gemini适配器保持一致
    const enhancedPrompt = prompt || `请详细描述这张图片的内容。包括：
1. 图片中的主要人物/物体
2. 场景和环境
3. 颜色和氛围
4. 任何特殊或显著的细节
5. 图片可能传递的情感或意图

请提供全面但简洁的描述，控制在150字以内。`;

    // 确保我们有正确的图像数据格式
    let processedImage: ImageInput;
    
    if (image.url) {
      // 如果提供了URL，保持URL格式
      processedImage = {
        url: image.url
      };
    } else if (image.data && image.mimeType) {
      // 如果已经提供了Base64数据，构建data URL
      processedImage = {
        url: `data:${image.mimeType};base64,${image.data}`
      };
    } else {
      throw new Error("无效的图像输入格式");
    }
    
    const promptPreview = enhancedPrompt.substring(0, 50) + (enhancedPrompt.length > 50 ? '...' : '');
    console.log(`[OpenAIAdapter] 使用增强提示词分析图片: "${promptPreview}"`);
    
    try {
      // 检查当前模型是否支持图像分析
      let modelToUse = this.model;
      if (!modelToUse.includes('vision') && !modelToUse.includes('gpt-4o')) {
        // 如果当前模型不支持视觉，切换到vision模型
        console.log(`[OpenAIAdapter] 当前模型 ${modelToUse} 不支持图像分析，切换到 gpt-4-vision-preview`);
        modelToUse = 'gpt-4-vision-preview';
      }
      
      // 构建带图像的消息
      const messages = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: enhancedPrompt
            },
            {
              type: "image_url",
              image_url: {
                url: processedImage.url
              }
            }
          ]
        }
      ];
      
      // 执行API调用
      const startTime = Date.now();
      const completion = await this.chatCompletion(messages, {
        model: modelToUse,
        temperature: 0.7,
        max_tokens: 2048,
        abortSignal // 传递中止信号
      });
      const endTime = Date.now();
      
      console.log(`[OpenAIAdapter] 图像分析完成，耗时: ${endTime - startTime}ms`);
      
      if (completion.choices && completion.choices.length > 0) {
        const responseText = completion.choices[0].message?.content || "";
        
        if (responseText) {
          console.log(`[OpenAIAdapter] 成功接收图像分析响应，长度: ${responseText.length}`);
          return responseText;
        }
      }
      
      throw new Error("API返回了无效的响应格式");
    } catch (error) {
      console.error(`[OpenAIAdapter] 分析图片失败:`, error);
      
      
      throw new Error(`分析图片失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }
  

  /**
   * 生成图片
   * @param prompt 图片生成提示
   * @param options 生成选项
   * @returns 生成的Base64编码图片数组
   */
  async generateImage(prompt: string, options: {
    temperature?: number;
    referenceImages?: ImageInput[];
  } = {}): Promise<string[]> {
    console.log(`[OpenAIAdapter] 请求生成图片，提示: ${prompt.substring(0, 50)}...`);
    
    try {
      // OpenAI API不直接支持图像生成，需使用对接DALL-E的API
      const apiUrl = `${this.endpoint}/v1/images/generations`;
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      };
      
      // 准备DALL-E请求数据
      const data = {
        prompt,
        n: 1, // 生成1张图片
        size: '1024x1024', // 标准尺寸
        response_format: 'b64_json' // 请求Base64格式返回
      };
      
      console.log(`[OpenAIAdapter] 发送图像生成请求到 DALL-E API`);
      
      const startTime = Date.now();
      const response = await axios.post(apiUrl, data, { headers });
      const endTime = Date.now();
      
      console.log(`[OpenAIAdapter] DALL-E API调用完成，耗时: ${endTime - startTime}ms`);
      
      if (response.data && response.data.data && Array.isArray(response.data.data)) {
        const images = response.data.data.map((item: any) => item.b64_json).filter(Boolean);
        
        if (images.length > 0) {
          console.log(`[OpenAIAdapter] 成功生成 ${images.length} 张图片`);
          return images;
        }
      }
      
      console.error(`[OpenAIAdapter] 无效的DALL-E API响应格式:`, response.data);
      throw new Error("DALL-E API返回了无效的响应格式");
    } catch (error: any) {
      console.error("[OpenAIAdapter] 图像生成失败:", error);
      
      if (error.response) {
        const errorData = error.response.data;
        const errorMessage = errorData.error?.message || JSON.stringify(errorData);
        throw new Error(`DALL-E API错误: ${errorMessage}`);
      } else if (error.request) {
        throw new Error('DALL-E API无服务器响应');
      } else {
        throw new Error(`图像生成失败: ${error.message || '未知错误'}`);
      }
    }
  }

  /**
   * 图片编辑
   * @param image 原始图片
   * @param prompt 编辑指令
   * @param options 编辑选项
   * @returns 编辑后的图片数据
   */
  async editImage(
    image: ImageInput, 
    prompt: string,
    options: {
      temperature?: number;
    } = {}
  ): Promise<string | null> {
    console.log(`[OpenAIAdapter] 请求编辑图片，提示: ${prompt}`);
    
    try {
      // 首先获取原始图像的Base64数据
      let imageData: string;
      let mimeType: string;
      
      if (image.url) {
        const fetchedImage = await this.fetchImageAsBase64(image.url);
        imageData = fetchedImage.data;
        mimeType = fetchedImage.mimeType;
      } else if (image.data && image.mimeType) {
        imageData = image.data;
        mimeType = image.mimeType;
      } else {
        throw new Error("编辑图片需要有效的图像数据");
      }
      
      // OpenAI API不直接支持高级图像编辑，需转换为文本指导的图像生成
      // 构建增强提示词
      const enhancedPrompt = `编辑以下图像: ${prompt}。保持原图的基本元素和构成。`;
      
      // 使用图像变体API (如果可用) 或回退到DALL-E创意提示
      const apiUrl = `${this.endpoint}/v1/images/edits`;
      const headers = {
        'Authorization': `Bearer ${this.apiKey}`
      };
      
      // 创建FormData
      const formData = new FormData();
      
      // 转换Base64为Blob
      const byteCharacters = atob(imageData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });
      
      // 添加文件和提示词
      formData.append('image', blob, 'image.png');
      formData.append('prompt', enhancedPrompt);
      formData.append('n', '1');
      formData.append('size', '1024x1024');
      formData.append('response_format', 'b64_json');
      
      console.log(`[OpenAIAdapter] 发送图像编辑请求`);
      
      try {
        const startTime = Date.now();
        const response = await axios.post(apiUrl, formData, { 
          headers,
          maxBodyLength: Infinity
        });
        const endTime = Date.now();
        
        console.log(`[OpenAIAdapter] 图像编辑完成，耗时: ${endTime - startTime}ms`);
        
        if (response.data && response.data.data && Array.isArray(response.data.data)) {
          const editedImage = response.data.data[0]?.b64_json;
          
          if (editedImage) {
            console.log(`[OpenAIAdapter] 图像编辑成功，输出图像大小: ${editedImage.length} 字节`);
            return editedImage;
          }
        }
        
        throw new Error("API返回了无效的响应格式");
      } catch (editError: any) {
        // 如果编辑API不可用或失败，回退到DALL-E生成
        console.warn(`[OpenAIAdapter] 图像编辑API失败，回退到图像生成: ${editError.message}`);
        
        // 构建更详细的图像生成提示词
        const generationPrompt = `以下是图像编辑指令：${prompt}。请基于这个指令创建一个新图像。图像应该包含原图的基本元素和构成，但应用上述编辑。`;
        
        // 使用generateImage方法
        const generatedImages = await this.generateImage(generationPrompt, {
          temperature: options.temperature || 0.8
        });
        
        if (generatedImages && generatedImages.length > 0) {
          console.log(`[OpenAIAdapter] 通过生成API创建的替代图像，大小: ${generatedImages[0].length} 字节`);
          return generatedImages[0];
        }
      }
      
      console.error(`[OpenAIAdapter] 图像编辑和备选生成均失败`);
      return null;
    } catch (error) {
      console.error("[OpenAIAdapter] 编辑图片失败:", error);
      throw error;
    }
  }

  /**
   * 生成对话内容
   * 将ChatMessage格式转换为OpenAI格式
   */
  async generateContentWithTools(
    contents: ChatMessage[], 
    characterId: string, 
    memoryResults?: any, 
    userMessage?: string,
    abortSignal?: AbortSignal
  ): Promise<string> {
    // 检查是否有API密钥配置或者是否应该使用云服务
    const apiKeyAvailable = this.isApiKeyConfigured();


    
    // 获取userMessage（优先参数，否则回退到最后一条消息）
    const analyzedUserMessage = typeof userMessage === 'string'
      ? userMessage
      : (contents[contents.length - 1]?.parts?.[0]?.text || "");
    
    // 添加详细的调试日志
    console.log(`[OpenAIAdapter] generateContentWithTools被调用，userMessage: "${analyzedUserMessage.substring(0, 50)}${analyzedUserMessage.length > 50 ? '...' : ''}"`);
    
    // 检查是否需要搜索（采用与Gemini相同的判断逻辑）
    const wouldNeedSearching = this.messageNeedsSearching(analyzedUserMessage);
    console.log(`[OpenAIAdapter] userMessage是否适合搜索: ${wouldNeedSearching}`);
    
    try {
      // 检查是否同时存在记忆结果和搜索意图
      const hasMemoryResults = memoryResults && 
                             memoryResults.results && 
                             memoryResults.results.length > 0;
      
      // 根据情况处理不同类型的增强内容
      if (hasMemoryResults && wouldNeedSearching) {
        // 同时处理记忆和搜索
        console.log(`[OpenAIAdapter] 同时检测到记忆结果和搜索意图，使用组合增强处理`);
        return await this.handleCombinedMemoryAndSearch(contents, memoryResults, userMessage);
      } else if (hasMemoryResults) {
        // 如果只有记忆搜索结果，仅使用记忆增强
        console.log(`[OpenAIAdapter] 检测到记忆搜索结果，使用记忆增强处理`);
        return await this.handleWithMemoryResults(contents, memoryResults);
      } else if (wouldNeedSearching) {
        // 如果没有记忆结果但有搜索意图，使用网络搜索
        console.log(`[OpenAIAdapter] 检测到搜索意图，尝试使用网络搜索`);
        return await this.handleSearchIntent(contents, analyzedUserMessage);
      }
      
      // 如果没有搜索意图，使用普通对话方式
      console.log(`[OpenAIAdapter] 使用标准对话方式生成回复`);
      return await this.generateContent(contents, characterId, undefined, abortSignal);
    } catch (error) {
      console.error(`[OpenAIAdapter] 工具调用失败，回退到标准对话:`, error);
      // 如果工具调用失败，回退到标准对话
      return await this.generateContent(contents, characterId, undefined, abortSignal);
    }
  }

  /**
   * 处理同时具有记忆搜索结果和网络搜索意图的请求
   */
  private async handleCombinedMemoryAndSearch(contents: ChatMessage[], memoryResults: any, userMessage?: string): Promise<string> {
    console.log(`[OpenAIAdapter] 开始处理记忆搜索和网络搜索的组合请求`);
    
    // userQuery 始终使用 userMessage 参数
    const userQuery = typeof userMessage === 'string'
      ? userMessage
      : '';
    
    try {
      // Step 1: 准备记忆部分
      console.log(`[OpenAIAdapter] 处理记忆部分，发现 ${memoryResults.results.length} 条记忆`);
      
      let memorySection = `<mem>\n[系统检索到的记忆内容]：\n`;
      // 格式化记忆结果
      memoryResults.results.forEach((item: any, index: number) => {
        memorySection += `${index + 1}. ${item.memory}\n`;
      });
      memorySection += `</mem>\n\n`;
      
      // ==== 获取角色表格记忆 ====
      let tableMemoryText = '';
      try {
        let characterId =
          memoryResults.characterId ||
          memoryResults.agentId ||
          memoryResults.results?.[0]?.characterId ||
          memoryResults.results?.[0]?.agentId;
        let conversationId =
          memoryResults.conversationId ||
          memoryResults.results?.[0]?.conversationId;
        
        console.log('[OpenAIAdapter][表格记忆] 最终用于查询的 characterId:', characterId, 'conversationId:', conversationId);
        if (characterId) {
          console.log('[OpenAIAdapter][表格记忆] 调用 getCharacterTablesData 前参数:', { characterId, conversationId });
          const tableData = await getCharacterTablesData(characterId, conversationId);
          console.log('[OpenAIAdapter][表格记忆] getCharacterTablesData 返回:', tableData);
          if (tableData.success && tableData.tables.length > 0) {
            tableMemoryText += `[角色长期记忆表格]\n`;
            tableData.tables.forEach(table => {
              const headerRow = '| ' + table.headers.join(' | ') + ' |';
              const sepRow = '| ' + table.headers.map(() => '---').join(' | ') + ' |';
              const dataRows = table.rows.map(row => '| ' + row.join(' | ') + ' |').join('\n');
              tableMemoryText += `表格：${table.name}\n${headerRow}\n${sepRow}\n${dataRows}\n\n`;
            });
          }
        }
      } catch (e) {
        console.warn('[OpenAIAdapter] 获取角色表格记忆失败:', e);
      }
      
      // Step 2: 准备网络搜索部分
      console.log(`[OpenAIAdapter] 为用户查询准备网络搜索: "${userQuery}"`);
      

      
      // 确保MCP适配器已连接
      if (!mcpAdapter.isReady()) {
        try {
          await mcpAdapter.connect();
        } catch (e) {
          console.error('[OpenAIAdapter] Brave本地搜索连接失败:', e);
          // 返回友好提示
          return await this.generateContent([
            ...contents.slice(0, -1),
            {
              role: "system",
              parts: [{ text: "（注意：搜索功能不可用。）" }]
            },
            contents[contents.length - 1]
          ], memoryResults.characterId || '');
        }
      }
      
      // 先使用OpenAI分析消息，提取搜索关键词
      const extractionPrompt: ChatMessage[] = [
        {
          role: "system",
          parts: [{ text: "我将帮助你提取搜索关键词。请给我一个问题或搜索请求，我会提取出最适合用于搜索引擎的关键词。我只会返回关键词，不会有任何额外的解释。" }]
        },
        {
          role: "user",
          parts: [{ text: userQuery }]
        }
      ];
      
      const refinedQuery = await this.generateContent(extractionPrompt);
      const finalQuery = refinedQuery.trim() || userQuery;
      
      console.log(`[OpenAIAdapter] 提取的搜索关键词: ${finalQuery}`);
      
      // 使用MCP适配器执行搜索
      let searchResults;
      try {
        searchResults = await mcpAdapter.search({
          query: finalQuery,
          count: 5
        });
      } catch (e) {
        console.error('[OpenAIAdapter] Brave本地搜索执行失败:', e);
        // 返回友好提示
        return await this.generateContent([
          ...contents.slice(0, -1),
          {
            role: "system",
            parts: [{ text: "（注意：本地搜索功能不可用，请检查Brave API密钥配置。）" }]
          },
          contents[contents.length - 1]
        ], memoryResults.characterId || '');
      }
      
      // 格式化搜索结果为可读文本
      const formattedResults = mcpAdapter.formatSearchResults(searchResults);
      
      let searchSection = `<websearch>\n搜索引擎返回的联网检索结果：\n${formattedResults}\n</websearch>\n\n`;
      
      // Step 3: 构建融合提示词
      console.log(`[OpenAIAdapter] 构建融合提示词，结合记忆和网络搜索结果`);
      
      // 修改：将表格记忆添加到组合提示中，位置在memorySection之前
      let combinedPrompt = '';
      // 添加表格记忆（如果有）
      if (tableMemoryText) {
        combinedPrompt += tableMemoryText + '\n';
      }
      // 添加记忆部分
      combinedPrompt += memorySection;
      // 添加搜索部分
      combinedPrompt += searchSection;
      
      combinedPrompt += `<response_guidelines>
- 结合上面的记忆内容和联网搜索结果，全面回答{{user}}的问题。
- 用<websearch></websearch>标签包裹我对网络搜索结果的解释和引用，例如:
  <websearch>根据最新的网络信息，关于这个问题的专业观点是...</websearch>
- 确保回复能够同时**有效整合记忆和网络信息**，让内容更加全面和有用。
- 回复的语气和风格一定会与角色人设保持一致。
- 整个回复只能有一组<websearch>标签。**
</response_guidelines>`;
      
      // 记录融合提示词的长度
      console.log(`[OpenAIAdapter] 融合提示词构建完成，长度: ${combinedPrompt.length}`);
      
      // 使用标准的生成内容方法生成最终回复
      // 插入顺序：历史消息 + model(记忆/搜索内容) + 用户消息
      const finalPrompt: ChatMessage[] = [
        ...contents.slice(0, -1),
        {
          role: "user",
          parts: [{ text: combinedPrompt }]
        },
        contents[contents.length - 1]
      ];
      
      return await this.generateContent(finalPrompt, memoryResults.characterId || '');
    } catch (error) {
      console.error(`[OpenAIAdapter] 组合处理记忆搜索和网络搜索时出错:`, error);
      
      // 如果组合处理失败，尝试退回到仅使用记忆搜索结果的方式
      console.log(`[OpenAIAdapter] 组合处理失败，回退到仅使用记忆结果模式`);
      try {
        return await this.handleWithMemoryResults(contents, memoryResults);
      } catch (fallbackError) {
        console.error(`[OpenAIAdapter] 记忆处理也失败，回退到标准对话:`, fallbackError);
        // 如最终都失败，使用标准方式
        return await this.generateContent(contents);
      }
    }
  }

  /**
   * 使用记忆搜索结果处理请求
   * @param contents 消息内容
   * @param memoryResults 记忆搜索结果
   * @returns 生成的回复
   */
  private async handleWithMemoryResults(contents: ChatMessage[], memoryResults: any): Promise<string> {
    // 获取最后一条消息的内容
    const lastMessage = contents[contents.length - 1];
    const userQuery = lastMessage.parts?.[0]?.text || "";

    try {
      // Add more detailed logging of memory result structure
      console.log(`[OpenAIAdapter] 处理记忆增强请求，发现 ${memoryResults.results.length} 条记忆`);
      console.log('[OpenAIAdapter] 记忆结果结构:', {
        hasResults: !!memoryResults.results,
        resultCount: memoryResults.results?.length || 0,
        firstMemoryFields: memoryResults.results && memoryResults.results.length > 0 
          ? Object.keys(memoryResults.results[0]) 
          : 'No memories',
        firstMemoryScore: memoryResults.results?.[0]?.score,
        hasMetadata: memoryResults.results?.[0]?.metadata !== undefined
      });

      // ==== 获取角色表格记忆 ====
      let tableMemoryText = '';
      try {
        // 日志：记录characterId/conversationId来源和类型
        let characterId =
          memoryResults.characterId ||
          memoryResults.agentId ||
          memoryResults.results?.[0]?.characterId ||
          memoryResults.results?.[0]?.agentId;
        let conversationId =
          memoryResults.conversationId ||
          memoryResults.results?.[0]?.conversationId;
        console.log('[OpenAIAdapter][表格记忆] 记忆来源信息:', { characterId, conversationId });
        if (!characterId && contents.length > 0) {
          characterId = contents[0]?.characterId;
          console.log('[OpenAIAdapter][表格记忆] 尝试从contents[0]获取characterId:', characterId);
        }
        console.log('[OpenAIAdapter][表格记忆] 最终用于查询的 characterId:', characterId, 'conversationId:', conversationId);
        if (characterId) {
          console.log('[OpenAIAdapter][表格记忆] 调用 getCharacterTablesData 前参数:', { characterId, conversationId });
          const tableData = await getCharacterTablesData(characterId, conversationId);
          console.log('[OpenAIAdapter][表格记忆] getCharacterTablesData 返回:', tableData);
          if (tableData.success && tableData.tables.length > 0) {
            tableMemoryText += `[角色长期记忆表格]\n`;
            tableData.tables.forEach(table => {
              const headerRow = '| ' + table.headers.join(' | ') + ' |';
              const sepRow = '| ' + table.headers.map(() => '---').join(' | ') + ' |';
              const dataRows = table.rows.map(row => '| ' + row.join(' | ') + ' |').join('\n');
              tableMemoryText += `表格：${table.name}\n${headerRow}\n${sepRow}\n${dataRows}\n\n`;
            });
          } else {
            console.log('[OpenAIAdapter][表格记忆] 未获取到有效表格数据，success:', tableData.success, 'tables.length:', tableData.tables.length);
          }
        } else {
          console.log('[OpenAIAdapter][表格记忆] 未能确定characterId，跳过表格记忆注入');
        }
      } catch (e) {
        console.warn('[OpenAIAdapter] 获取角色表格记忆失败:', e);
      }
      // ==== 表格记忆获取结束 ====

      // 构建包含记忆搜索结果的提示
      let combinedPrompt = `${userQuery}\n\n`;

      // 插入表格记忆内容（如有）
      if (tableMemoryText) {
        combinedPrompt = `${tableMemoryText}\n${combinedPrompt}`;
      }

      // 添加记忆搜索结果
      combinedPrompt += `<mem>\n系统检索到的记忆内容：\n`;

      // 格式化记忆结果
      memoryResults.results.forEach((item: any, index: number) => {
        combinedPrompt += `${index + 1}. ${item.memory}\n`;
      });
      combinedPrompt += `</mem>\n\n`;

      // 添加响应指南
      combinedPrompt += `<response_guidelines>
- 除了对{{user}}}消息的回应之外，我**一定** 会结合记忆内容进行回复。
- 确保回复保持角色人设的一致性。
- 我会结合表格记忆的内容回复（如果有），但我不会输出表格的具体内容，仅将表格作为内心记忆。
</response_guidelines>`;

      // Log prepared prompt
      console.log('[OpenAIAdapter] 准备了带记忆结果的提示:', combinedPrompt.substring(0, 200) + '...');

      // 使用标准的生成内容方法生成最终回复
      // 插入顺序：历史消息 + system(记忆内容) + 用户消息
      const finalPrompt: ChatMessage[] = [
        ...contents.slice(0, -1),
        {
          role: "system",
          parts: [{ text: combinedPrompt }]
        },
        contents[contents.length - 1]
      ];

      return await this.generateContent(finalPrompt, memoryResults.characterId || '');
    } catch (error) {
      console.error(`[OpenAIAdapter] 记忆增强处理失败:`, error);
      // 如果记忆处理失败，回退到标准方式
      return await this.generateContent(contents);
    }
  }

  /**
   * 处理搜索意图
   * @param contents 消息内容
   * @param userMessage 可选，用户真实输入
   * @returns 搜索结果和回复
   */
  private async handleSearchIntent(contents: ChatMessage[], userMessage?: string): Promise<string> {
    // 优先使用 userMessage 参数
    const searchQuery = typeof userMessage === 'string'
      ? userMessage
      : (contents[contents.length - 1]?.parts?.[0]?.text || "");
    
    try {


      // 确保MCP适配器已连接
      if (!mcpAdapter.isReady()) {
        await mcpAdapter.connect();
      }
      
      // 先使用OpenAI分析消息，提取搜索关键词
      const extractionPrompt: ChatMessage[] = [
        {
          role: "system",
          parts: [{ text: "我将帮助你提取搜索关键词。请给我一个问题或搜索请求，我会提取出最适合用于搜索引擎的关键词。我只会返回关键词，不会有任何额外的解释。" }]
        },
        {
          role: "user",
          parts: [{ text: searchQuery }]
        }
      ];
      
      const refinedQuery = await this.generateContent(extractionPrompt);
      const finalQuery = refinedQuery.trim() || searchQuery;
      
      console.log(`[OpenAIAdapter] 提取的搜索关键词: ${finalQuery}`);
      
      // 使用MCP适配器执行搜索
      const searchResults = await mcpAdapter.search({
        query: finalQuery,
        count: 5
      });
      
      // 格式化搜索结果为可读文本
      const formattedResults = mcpAdapter.formatSearchResults(searchResults);
      
      console.log(`[OpenAIAdapter] 获取到搜索结果，正在生成回复`);
      
      // 构建网络搜索结果的修改版提示
      let combinedPrompt = `我在对用户消息：${searchQuery}\n\n进行联网搜索`;
      
      // 添加网络搜索结果
      combinedPrompt += `<websearch>\n搜索引擎返回的联网检索结果：\n${formattedResults}\n</websearch>\n\n`;
      
      // 添加响应指南
      combinedPrompt += `<response_guidelines>
- 除了对用户消息的回应之外，我**一定** 会结合联网搜索内容进行回复。
- **我会根据角色设定和聊天上下文**，输出我对联网检索结果的解释，并用<websearch></websearch>包裹。
  - 示例: <websearch>根据网络信息，[相关领域的专家]认为... 这可能对您有帮助。</websearch>
- 我会确保回复保持角色人设的一致性。
</response_guidelines>`;
      
      // 使用标准的生成内容方法生成最终回复
      // 插入顺序：历史消息 + model(记忆/搜索内容) + 用户消息
      const finalPrompt: ChatMessage[] = [
        ...contents.slice(0, -1),
        {
          role: "user",
          parts: [{ text: combinedPrompt }]
        },
        contents[contents.length - 1]
      ];
      
      return await this.generateContent(finalPrompt);
    } catch (error) {
      console.error(`[OpenAIAdapter] 搜索处理失败:`, error);
      
      // 如果搜索失败，通知用户并使用标准方式回答
      const fallbackPrompt: ChatMessage[] = [
        ...contents.slice(0, -1),
        {
          role: "system",
          parts: [{ 
            text: `${searchQuery}\n\n(注意：搜索引擎尝试搜索相关信息，但搜索功能暂时不可用。请根据你已有的知识回答我的问题。)` 
          }]
        },
        contents[contents.length - 1]
      ];
      
      return await this.generateContent(fallbackPrompt);
    }
  }

  /**
   * 判断消息是否需要搜索
   * @param userMessage 消息文本
   * @returns 是否需要搜索
   */
  private messageNeedsSearching(userMessage: string): boolean {
    // 添加更多详细的调试日志
    console.log(`[OpenAIAdapter] 正在分析userMessage是否需要搜索: "${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}"`);
    
    // 检查消息是否包含搜索意图的关键词
    const searchKeywords = [
      '搜索', '查询', '查找', '寻找', '检索', '了解', '信息', 
      '最新', '新闻', '什么是', '谁是', '哪里', '如何', '怎么',
      'search', 'find', 'lookup', 'query', 'information about',
      'latest', 'news', 'what is', 'who is', 'where', 'how to'
    ];
    
    // 提问型关键词
    const questionPatterns = [
      /是什么/, /有哪些/, /如何/, /怎么/, /怎样/, 
      /什么时候/, /为什么/, /哪些/, /多少/,
      /what is/i, /how to/i, /when is/i, /why is/i, /where is/i
    ];
    
    // 检查关键词
    const hasSearchKeyword = searchKeywords.some(keyword => 
      userMessage.toLowerCase().includes(keyword.toLowerCase())
    );
    
    // 检查提问模式
    const isQuestion = questionPatterns.some(pattern => 
      pattern.test(userMessage)
    ) || userMessage.includes('?') || userMessage.includes('？');
    
    // 如果同时满足以下条件，则判断需要搜索:
    // 1. 消息包含搜索关键词或者是一个问题
    // 2. 消息长度不超过300个字符
    const needsSearching = (hasSearchKeyword || isQuestion) && userMessage.length < 300;
    
    // 添加详细的判断结果日志
    console.log(`[OpenAIAdapter] 消息搜索判断结果:`, {
      hasSearchKeyword,
      isQuestion,
      messageLength: userMessage.length,
      needsSearching
    });
    
    return needsSearching;
  }
}