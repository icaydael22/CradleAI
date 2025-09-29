import { mcpAdapter } from '@/NodeST/nodest/utils/mcp-adapter';
import { CloudServiceProvider } from '@/services/cloud-service-provider';
import { getCharacterTablesData } from '@/src/memory/plugins/table-memory/api';
import { addCloudServiceStatusListener } from '@/utils/cloud-service-tracker';
import { getCloudServiceStatus, getApiSettings } from '@/utils/settings-helper';

/**
 * OpenRouter Adapter
 * 提供与OpenRouter API通信的功能
 */

type ChatMessage = {
  role: string;
  parts?: { text: string }[];
  content?: string;
  characterId?: string; // 支持传递角色ID
};

// 定义图像输入接口与GeminiAdapter保持一致
interface ImageInput {
  data?: string;
  mimeType?: string;
  url?: string;
}

// 定义生成内容接口与GeminiAdapter保持一致
interface GeneratedContent {
  text?: string;
  images?: string[]; // Base64 encoded images
}

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

// 增加与GeminiAdapter一致的配置选项
interface OpenRouterAdapterOptions {
  useKeyRotation?: boolean;
  additionalKeys?: string[];
  primaryModel?: string;
  backupModel?: string;
  retryDelay?: number;
}

export class OpenRouterAdapter {
  private apiKeys: string[] = []; // 支持多个API密钥
  private currentKeyIndex: number = 0;
  private model: string;
  private backupModel: string = "anthropic/claude-3-opus";
  private conversationHistory: ChatMessage[] = [];
  private baseUrl: string = 'https://openrouter.ai/api/v1';
  private useCloudService: boolean = false;
  private cloudStatusUnsubscribe: (() => void) | null = null;
  private useKeyRotation: boolean = false;
  private retryDelay: number = 5000;

  constructor(apiKey: string, model: string = "openai/gpt-3.5-turbo", options?: OpenRouterAdapterOptions) {
    // 初始化云服务状态
    this.updateCloudServiceStatus();
    
    // 初始化API密钥
    if (!apiKey && !this.useCloudService) {
      throw new Error("API key cannot be empty when cloud service is not enabled");
    }
    
    if (apiKey) {
      // 添加主密钥
      this.apiKeys = [apiKey];
      
      // 添加额外的密钥（如果提供）
      if (options?.additionalKeys && Array.isArray(options.additionalKeys)) {
        this.apiKeys = [...this.apiKeys, ...options.additionalKeys.filter(key => key && key.trim() !== '')];
      }
    } else {
      this.apiKeys = [];
      console.log(`【OpenRouterAdapter】未配置API密钥，将使用云服务`);
    }
    
    this.model = model;
    
    // 设置配置选项
    this.useKeyRotation = options?.useKeyRotation || false;
    
    // 设置备用模型
    if (options?.backupModel) {
      this.backupModel = options.backupModel;
    }
    
    // 设置重试延迟
    if (options?.retryDelay && typeof options.retryDelay === 'number') {
      this.retryDelay = options.retryDelay;
    }
    
    console.log(`【OpenRouterAdapter】初始化适配器，模型: ${model}`);
    console.log(`【OpenRouterAdapter】API密钥: ${this.maskApiKey(apiKey)}`);
    console.log(`【OpenRouterAdapter】配置了 ${this.apiKeys.length} 个API密钥`);
    console.log(`【OpenRouterAdapter】API密钥轮换: ${this.useKeyRotation ? '已启用' : '未启用'}`);
    console.log(`【OpenRouterAdapter】主模型: ${this.model}, 备用模型: ${this.backupModel}`);
    console.log(`【OpenRouterAdapter】重试延迟: ${this.retryDelay}ms`);
    console.log(`【OpenRouterAdapter】云服务状态: ${this.useCloudService ? '已启用' : '未启用'}`);
    
    // 订阅云服务状态更新
    this.cloudStatusUnsubscribe = addCloudServiceStatusListener((enabled) => {
      console.log(`【OpenRouterAdapter】云服务状态更新: ${enabled ? '启用' : '禁用'}`);
      this.useCloudService = enabled;
    });
  }

  /**
   * Mask API key for logging
   */
  private maskApiKey(apiKey: string): string {
    if (!apiKey) return '';
    return apiKey.substring(0, 4) + '****';
  }
  
  /**
   * 获取当前使用的API密钥
   */
  private get apiKey(): string | null {
    if (this.apiKeys.length === 0) {
      return null;
    }
    return this.apiKeys[this.currentKeyIndex];
  }
  
  
  /**
   * 更新API密钥
   */
  public updateApiKeys(primaryKey: string, additionalKeys: string[] = []) {
    if (primaryKey && primaryKey.trim() !== '') {
      this.apiKeys = [primaryKey, ...additionalKeys.filter(key => key && key.trim() !== '')];
    } else if (additionalKeys && additionalKeys.some(key => key && key.trim() !== '')) {
      this.apiKeys = [...additionalKeys.filter(key => key && key.trim() !== '')];
    } else {
      this.apiKeys = [];
      console.log(`【OpenRouterAdapter】未配置任何有效的API密钥，将依赖云服务`);
    }
    
    this.currentKeyIndex = 0; // 重置到第一个密钥
    console.log(`【OpenRouterAdapter】API密钥已更新，共 ${this.apiKeys.length} 个密钥`);
  }
  
  /**
   * 更新设置
   */
  public updateSettings(options: OpenRouterAdapterOptions): void {
    // 更新额外的密钥（如果提供）
    if (options.additionalKeys && Array.isArray(options.additionalKeys)) {
      const validAdditionalKeys = options.additionalKeys.filter(key => key && key.trim() !== '');
      
      if (this.apiKeys.length > 0) {
        const primaryKey = this.apiKeys[0];
        this.apiKeys = [primaryKey, ...validAdditionalKeys];
      } else if (validAdditionalKeys.length > 0) {
        this.apiKeys = [...validAdditionalKeys];
      }
      this.currentKeyIndex = 0;
    }
    
    // 更新密钥轮换设置
    if (options.useKeyRotation !== undefined) {
      this.useKeyRotation = options.useKeyRotation;
    }
    
    // 更新模型设置
    if (options.primaryModel) {
      this.model = options.primaryModel;
    }
    
    if (options.backupModel) {
      this.backupModel = options.backupModel;
    }
    
    // 更新重试延迟
    if (options.retryDelay && typeof options.retryDelay === 'number') {
      this.retryDelay = options.retryDelay;
    }
    
    console.log(`【OpenRouterAdapter】设置已更新，共 ${this.apiKeys.length} 个密钥`);
    console.log(`【OpenRouterAdapter】API密钥轮换: ${this.useKeyRotation ? '已启用' : '未启用'}`);
    console.log(`【OpenRouterAdapter】主模型: ${this.model}, 备用模型: ${this.backupModel}`);
    console.log(`【OpenRouterAdapter】重试延迟: ${this.retryDelay}ms`);
  }
  
  /**
   * 检查是否配置了API密钥
   */
  public isApiKeyConfigured(): boolean {
    return this.apiKeys.length > 0;
  }

  /**
   * 检查和更新云服务状态
   */
  private updateCloudServiceStatus(): void {
    this.useCloudService = getCloudServiceStatus();
    console.log(`【OpenRouterAdapter】云服务状态: ${this.useCloudService ? '启用' : '禁用'}`);
  }
  
  /**
   * 释放资源
   */
  public dispose(): void {
    // 取消订阅云服务状态更新
    if (this.cloudStatusUnsubscribe) {
      this.cloudStatusUnsubscribe();
      this.cloudStatusUnsubscribe = null;
    }
  }

  /**
   * 设置模型
   */
  setModel(model: string): void {
    console.log(`【OpenRouterAdapter】更新模型: ${this.model} -> ${model}`);
    this.model = model;
  }

  /**
   * 生成内容 - 与Gemini适配器接口保持一致
   */
  async generateContent(contents: ChatMessage[], characterId?: string): Promise<string> {
    // 总是在请求前检查云服务状态
    this.updateCloudServiceStatus();
    
    // 检查是否有API密钥或需要使用云服务
    const apiKeyAvailable = this.isApiKeyConfigured();
    const cloudServiceAvailable = this.useCloudService && CloudServiceProvider.isEnabled();
    
    // 如果没有API密钥且云服务不可用，抛出错误
    if (!apiKeyAvailable && !cloudServiceAvailable) {
      throw new Error("未配置API密钥，且云服务未启用。请配置API密钥或启用云服务。");
    }
    
    // 如果没有API密钥但云服务可用，使用云服务
    if (!apiKeyAvailable && cloudServiceAvailable) {
      console.log(`【OpenRouterAdapter】未配置API密钥，自动切换到云服务`);
      return await this.executeGenerateContentWithCloudService(contents, characterId || '');
    }
    
    // 使用API密钥实现，带有重试和轮换机制
    try {
      // 首先尝试使用主模型和第一个API密钥
      return await this.executeGenerateContentWithKeyRotation(contents, this.model, characterId);
    } catch (initialError) {
      console.error(`【OpenRouterAdapter】主模型(${this.model})请求失败, 错误:`, initialError);
      
      // 尝试使用备用模型
      console.log(`【OpenRouterAdapter】主模型请求失败，将在 ${this.retryDelay}ms 后尝试使用备用模型: ${this.backupModel}`);
      
      // 等待指定的延迟时间
      await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      
      try {
        // 重置为第一个API密钥
        this.currentKeyIndex = 0;
        console.log(`【OpenRouterAdapter】正在使用备用模型重试: ${this.backupModel}`);
        return await this.executeGenerateContentWithKeyRotation(contents, this.backupModel, characterId);
      } catch (backupError) {
        console.error(`【OpenRouterAdapter】备用模型也请求失败:`, backupError);
        
        // 如果云服务可用，尝试作为最后的手段
        if (cloudServiceAvailable) {
          console.log(`【OpenRouterAdapter】API请求失败，尝试使用云服务作为备选方案`);
          return await this.executeGenerateContentWithCloudService(contents, characterId || '');
        }
        
        throw backupError;
      }
    }
  }
  
  /**
   * 使用云服务生成内容
   */
  private async executeGenerateContentWithCloudService(contents: ChatMessage[], characterId: string): Promise<string> {
    console.log('【OpenRouterAdapter】使用云服务生成内容');
    try {
      // ==== 获取角色表格记忆 ====
      let tableMemoryText = '';
      
      console.log('【OpenRouterAdapter】[表格记忆/云服务] characterId参数值:', characterId);
      
      if (characterId) {
        try {
          console.log('【OpenRouterAdapter】[表格记忆/云服务] 调用 getCharacterTablesData 前参数:', { characterId });
          const tableData = await getCharacterTablesData(characterId);
          console.log('【OpenRouterAdapter】[表格记忆/云服务] getCharacterTablesData 返回:', tableData);
          
          if (tableData.success && tableData.tables.length > 0) {
            tableMemoryText += `[角色长期记忆表格]\n`;
            tableData.tables.forEach(table => {
              const headerRow = '| ' + table.headers.join(' | ') + ' |';
              const sepRow = '| ' + table.headers.map(() => '---').join(' | ') + ' |';
              const dataRows = table.rows.map(row => '| ' + row.join(' | ') + ' |').join('\n');
              tableMemoryText += `表格：${table.name}\n${headerRow}\n${sepRow}\n${dataRows}\n\n`;
            });
            
            console.log('【OpenRouterAdapter】[表格记忆/云服务] 成功获取表格记忆数据');
          } else {
            console.log('【OpenRouterAdapter】[表格记忆/云服务] 未获取到有效表格数据，success:', tableData.success, 'tables.length:', tableData.tables.length);
          }
        } catch (e) {
          console.warn('【OpenRouterAdapter】[表格记忆/云服务] 获取角色表格记忆失败:', e);
        }
      } else {
        console.log('【OpenRouterAdapter】[表格记忆/云服务] 未提供有效的characterId，跳过表格记忆注入');
      }
      // ==== 表格记忆获取结束 ====
  
      // 检查是否需要将合成内容（如记忆/表格/搜索）单独插入为倒数第二条消息
      let standardMessages: { role: string; content: string }[] = [];
      
      // 将消息从Gemini格式转换为OpenRouter格式
      standardMessages = contents.map(msg => {
        let contentText = '';
        if (msg.parts && Array.isArray(msg.parts)) {
          contentText = msg.parts.map(part => (typeof part === 'object' && part.text) ? part.text : '').join(' ').trim();
        } else if (msg.content) {
          contentText = msg.content;
        }
        
        // 将Gemini的role映射到OpenRouter的role
        let role = msg.role;
        if (role === 'model') {
          role = 'assistant';
        }
        
        return { role, content: contentText };
      });
  
      // 如果获取到表格记忆，将其作为系统消息添加
      if (tableMemoryText) {
        console.log('【OpenRouterAdapter】[表格记忆/云服务] 将表格记忆注入到云服务请求中');
        
        // 创建一个新的系统消息，包含表格记忆和提示
        const tableMemoryPrompt = `${tableMemoryText}\n\n<response_guidelines>
- 在回复中结合上面的[角色长期记忆表格]内容，表格中记录了重要信息和事实。
- 确保回复与[角色长期记忆表格]中的信息保持一致，不会捏造表格中不存在的信息。
- 回复会自然融入[角色长期记忆表格]中的信息，不会生硬地提及"根据表格"之类的字眼。
- 确保回复保持角色人设的一致性。
</response_guidelines>`;
        
        // 保存最后一条用户消息（如果有的话）
        let lastUserMessage = null;
        if (standardMessages.length > 0) {
          const lastMsg = standardMessages[standardMessages.length - 1];
          if (lastMsg.role === 'user') {
            lastUserMessage = lastMsg;
            // 从标准消息中移除最后一条用户消息，稍后再添加回去
            standardMessages.pop();
          }
        }
        
        // 添加表格记忆作为系统/助手消息
        standardMessages.push({
          role: "user", // 使用user
          content: tableMemoryPrompt
        });
        
        // 如果有，将最后一条用户消息添加回去
        if (lastUserMessage) {
          standardMessages.push(lastUserMessage);
        }
        
        console.log('【OpenRouterAdapter】[表格记忆/云服务] 表格记忆注入完成，共包含表格数据长度:', tableMemoryText.length);
      }
  
      console.log('【OpenRouterAdapter】转换后的消息格式:', JSON.stringify(standardMessages, null, 2));
      const startTime = Date.now();
  
      const response = await CloudServiceProvider.generateChatCompletion(
        standardMessages,
        {
          model: CloudServiceProvider.getPreferredModel(),
          temperature: 0.7,
          max_tokens: 8192
        }
      );

      const endTime = Date.now();
      console.log(`【OpenRouterAdapter】云服务请求完成，耗时: ${endTime - startTime}ms`);
      console.log(`【OpenRouterAdapter】云服务响应状态: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloud service HTTP error! status: ${response.status}, details: ${errorText}`);
      }
      
      const result = await response.json();
      
      // 检查预期的云服务格式
      if (result.choices && result.choices.length > 0) {
        const responseText = result.choices[0].message?.content || "";
        
        if (responseText) {
          console.log(`【OpenRouterAdapter】成功接收云服务响应，长度: ${responseText.length}`);
          console.log(`【OpenRouterAdapter】响应前100个字符: ${responseText.substring(0, 100)}...`);
          
          // 添加响应到历史记录
          this.conversationHistory.push({
            role: "assistant", // OpenRouter使用assistant角色
            content: responseText
          });
          
          return responseText;
        }
      }
      
      console.error(`【OpenRouterAdapter】无效的云服务响应格式: ${JSON.stringify(result)}`);
      throw new Error("云服务返回了无效格式的响应");
    } catch (error) {
      console.error(`【OpenRouterAdapter】云服务请求失败:`, error);
      throw new Error(`云服务请求失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * 使用密钥轮换执行生成内容
   */
  private async executeGenerateContentWithKeyRotation(contents: ChatMessage[], modelId: string, characterId?: string): Promise<string> {
    // 如果没有API密钥配置但云服务可用，使用云服务
    if (this.apiKeys.length === 0) {
      if (this.useCloudService && CloudServiceProvider.isEnabled()) {
        console.log(`【OpenRouterAdapter】没有配置API密钥，使用云服务`);
        return await this.executeGenerateContentWithCloudService(contents, characterId || '');
      } else {
        throw new Error("未配置API密钥，且云服务未启用");
      }
    }
    
    let lastError: any = null;
    // 尝试使用每个可用的API密钥
    for (let keyIndex = 0; keyIndex < this.apiKeys.length; keyIndex++) {
      // 设置当前密钥索引
      this.currentKeyIndex = keyIndex;
      console.log(`【OpenRouterAdapter】尝试使用API密钥 ${keyIndex + 1}/${this.apiKeys.length} 请求模型: ${modelId}`);
      
      try {
        // 使用此密钥尝试请求
        return await this.executeGenerateContent(contents, modelId, characterId);
      } catch (error) {
        console.error(`【OpenRouterAdapter】使用API密钥 ${keyIndex + 1}/${this.apiKeys.length} 请求失败:`, error);
        lastError = error;
        // 继续循环使用下一个密钥
        continue;
      }
    }
    
    // 如果所有密钥都失败了
    throw new Error(`所有API密钥请求模型 ${modelId} 均失败: ${lastError?.message || '未知错误'}`);
  }

  /**
   * 执行生成内容的核心实现
   */
  private async executeGenerateContent(contents: ChatMessage[], modelId: string, characterId?: string): Promise<string> {
    // 验证我们有有效的API密钥
    const currentApiKey = this.apiKey;
    if (!currentApiKey) {
      if (this.useCloudService && CloudServiceProvider.isEnabled()) {
        return await this.executeGenerateContentWithCloudService(contents, characterId || '');
      }
      throw new Error("未配置API密钥，无法执行直接API调用");
    }
    
    // ==== 获取角色表格记忆 ====
    let tableMemoryText = '';
    let effectiveCharacterId = characterId;
    
    console.log('【OpenRouterAdapter】[表格记忆] characterId参数值:', effectiveCharacterId);
    
    if (effectiveCharacterId) {
      try {
        console.log('【OpenRouterAdapter】[表格记忆] 调用 getCharacterTablesData 前参数:', { characterId: effectiveCharacterId });
        const tableData = await getCharacterTablesData(effectiveCharacterId);
        console.log('【OpenRouterAdapter】[表格记忆] getCharacterTablesData 返回:', tableData);
        
        if (tableData.success && tableData.tables.length > 0) {
          tableMemoryText += `[角色长期记忆表格]\n`;
          tableData.tables.forEach(table => {
            const headerRow = '| ' + table.headers.join(' | ') + ' |';
            const sepRow = '| ' + table.headers.map(() => '---').join(' | ') + ' |';
            const dataRows = table.rows.map(row => '| ' + row.join(' | ') + ' |').join('\n');
            tableMemoryText += `表格：${table.name}\n${headerRow}\n${sepRow}\n${dataRows}\n\n`;
          });
          
          console.log('【OpenRouterAdapter】[表格记忆] 成功获取表格记忆数据');
        } else {
          console.log('【OpenRouterAdapter】[表格记忆] 未获取到有效表格数据，success:', tableData.success, 'tables.length:', tableData.tables.length);
        }
      } catch (e) {
        console.warn('【OpenRouterAdapter】 获取角色表格记忆失败:', e);
      }
    } else {
      console.log('【OpenRouterAdapter】[表格记忆] 未提供有效的characterId，跳过表格记忆注入');
    }
    // ==== 表格记忆获取结束 ====
    
    // 准备请求内容
    let enhancedContents = [...contents];
    
    // 如果获取到有效的表格记忆，将其作为系统消息插入
    if (tableMemoryText) {
      // 构建表格记忆提示词，与云服务逻辑保持一致
      const tableMemoryPrompt = `${tableMemoryText}\n\n<response_guidelines>
- 你会在回复中结合上面的表格记忆内容，表格中记录了角色相关的重要信息和事实。
- 你会确保回复与表格中的信息保持一致，不会捏造表格中不存在的信息。
- 你的回复会自然融入表格中的信息，不会生硬地提及"根据表格"之类的字眼。
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
      
      // 查找倒数第二条model/assistant消息的索引
      let lastModelIdx = -1;
      let modelCount = 0;
      for (let i = enhancedContents.length - 1; i >= 0; i--) {
        if (enhancedContents[i].role === 'model' || enhancedContents[i].role === 'assistant') {
          modelCount++;
          if (modelCount === 1) continue; // 跳过最后一条model/assistant
          lastModelIdx = i;
          break;
        }
      }

      // 如果有user消息，插入到最后一个user消息前；否则插入到最后
      let insertIdx = lastUserIdx !== -1 ? lastUserIdx : enhancedContents.length;
      // 如果存在倒数第二条model/assistant消息，则插入到其后
      if (lastModelIdx !== -1) {
        insertIdx = lastModelIdx + 1;
      }

      // 插入表格记忆消息
      enhancedContents.splice(insertIdx, 0, {
        role: "user", // OpenRouter使用assistant角色
        content: tableMemoryPrompt
      });

      console.log('【OpenRouterAdapter】[表格记忆] 已将表格记忆注入到插入位置，插入索引:', insertIdx);
    } else {
      console.log('【OpenRouterAdapter】 未获取到表格记忆数据，使用原始消息内容');
    }
    
    try {
      // 添加到历史记录
      enhancedContents.forEach(content => {
        const messageText = content.parts?.[0]?.text || content.content || "";
        if (messageText.includes("关系") || 
            messageText.includes("互动") || 
            messageText.includes("朋友圈")) {
          console.log(`【OpenRouterAdapter】检测到关系系统相关请求: ${messageText.substring(0, 50)}...`);
        }
        
        // 如果消息使用的是Gemini格式，则转换为OpenRouter格式
        if (content.parts && !content.content) {
          this.conversationHistory.push({
            role: content.role === 'model' ? 'assistant' : content.role,  // 将model角色转换为assistant
            content: content.parts[0]?.text || ""
          });
        } else {
          // 确保role符合OpenRouter要求
          const adjustedRole = content.role === 'model' ? 'assistant' : content.role;
          this.conversationHistory.push({
            role: adjustedRole,
            content: content.content || ""
          });
        }
      });
      
      // 准备OpenRouter格式的消息
      const messages = enhancedContents.map(msg => ({
        role: msg.role === 'model' ? 'assistant' : msg.role, // 确保role符合OpenRouter要求
        content: msg.content || (msg.parts && msg.parts[0]?.text) || ""
      }));

      // 构建请求体
      const requestBody = {
        model: modelId,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1024
      };

      // 发送API请求
      console.log(`【OpenRouterAdapter】发送请求到: ${this.baseUrl}/chat/completions`);
      
      // 检查云服务是否启用，如果启用则使用它
      let response;
      const requestUrl = `${this.baseUrl}/chat/completions`;
      
      if (CloudServiceProvider.isEnabled()) {
        console.log('【OpenRouterAdapter】检测到云服务已启用');
        console.log(`【OpenRouterAdapter】原始请求URL: ${requestUrl}`);
        console.log(`【OpenRouterAdapter】开始时间: ${new Date().toISOString()}`);
        console.log(`【OpenRouterAdapter】请求模型: ${modelId}`);
        console.log(`【OpenRouterAdapter】请求体大小: ${JSON.stringify(requestBody).length} 字节`);
        console.log(`【OpenRouterAdapter】消息数量: ${messages.length}`);
        
        // 记录每条消息的角色和内容预览，但不记录API密钥
        messages.forEach((msg, index) => {
          let contentPreview = typeof msg.content === 'string' 
            ? msg.content.substring(0, 50) + (msg.content.length > 50 ? '...' : '') 
            : '[复杂内容]';
          
          // 掩盖消息内容中可能的API密钥
          contentPreview = contentPreview.replace(/([A-Za-z0-9_-]{20,})/g, match => {
            if (match.length >= 20 && /^[A-Za-z0-9_-]+$/.test(match)) {
              return match.substring(0, 4) + '****';
            }
            return match;
          });
          
          console.log(`【OpenRouterAdapter】消息 #${index+1}: ${msg.role} - ${contentPreview}`);
        });
        
        // 通过云服务转发请求
        console.log('【OpenRouterAdapter】准备调用云服务转发接口...');
        
        try {
          const startTime = Date.now();
          response = await CloudServiceProvider.forwardRequest(
            requestUrl,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentApiKey}`,
                'HTTP-Referer': 'https://github.com', // 添加必要的请求头
                'X-Title': 'AI Chat App'  // 添加应用标识
              },
              body: JSON.stringify(requestBody)
            },
            'openrouter'
          );
          
          const endTime = Date.now();
          console.log(`【OpenRouterAdapter】云服务请求完成，耗时: ${endTime - startTime}ms`);
          console.log(`【OpenRouterAdapter】云服务响应状态: ${response.status} ${response.statusText}`);
          
          // 记录响应头信息
          console.log('【OpenRouterAdapter】云服务响应头:');
            response.headers.forEach((value: string, name: string): void => {
              if (name.toLowerCase() === 'content-type' || 
                name.toLowerCase() === 'content-length' || 
                name.toLowerCase() === 'x-request-id' ||
                name.toLowerCase().startsWith('openrouter-')) {
                console.log(`【OpenRouterAdapter】- ${name}: ${value}`);
              }
            });
          
          // 检查内容类型
          const contentType = response.headers.get('content-type');
          console.log(`【OpenRouterAdapter】响应内容类型: ${contentType}`);
          
          // 检查响应大小
          const contentLength = response.headers.get('content-length');
          if (contentLength) {
              console.log(`【OpenRouterAdapter】响应内容大小: ${contentLength} 字节`);
          }
        } catch (cloudError) {
          console.error('【OpenRouterAdapter】云服务转发失败:', cloudError);
          console.error('【OpenRouterAdapter】尝试回退到直接API调用...');
          throw cloudError; // 重新抛出以便后续处理
        }
      } else {
        // 如果云服务未启用，则使用直接API调用
        console.log('【OpenRouterAdapter】云服务未启用，使用直接API调用');
        console.log(`【OpenRouterAdapter】直接调用URL: ${requestUrl}`);
        console.log(`【OpenRouterAdapter】开始时间: ${new Date().toISOString()}`);
        
        const startTime = Date.now();
        response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentApiKey}`,
            'HTTP-Referer': 'https://github.com', // 添加必要的请求头
            'X-Title': 'AI Chat App'  // 添加应用标识
          },
          body: JSON.stringify(requestBody)
        });
        const endTime = Date.now();
        
        console.log(`【OpenRouterAdapter】直接API调用完成，耗时: ${endTime - startTime}ms`);
        console.log(`【OpenRouterAdapter】API响应状态: ${response.status} ${response.statusText}`);
      }
      
      // 如果响应不成功，处理错误情况
      if (!response.ok) {
        const text = await response.text();
        let errorMessage = `OpenRouter API 错误(${response.status}): ${response.statusText}`;
        
        console.error(`【OpenRouterAdapter】API响应错误: ${response.status} ${response.statusText}`);
        console.error(`【OpenRouterAdapter】错误响应内容: ${text}`);
        
        try {
          // 尝试解析错误JSON
          const errorData = JSON.parse(text);
          
          // 特别处理地理位置错误
          if (errorData.error?.message?.includes("User location is not supported") ||
              errorData.error?.metadata?.raw?.includes("User location is not supported")) {
            errorMessage = "当前地理位置不支持使用此API。请尝试使用VPN或代理服务器，或联系OpenRouter支持。";
            console.error(`【OpenRouterAdapter】地理位置限制错误:`, {
              status: response.status,
              error: errorData.error
            });
          } else {
            // 常规错误处理
            errorMessage = `OpenRouter API 错误: ${errorData.error?.message || JSON.stringify(errorData)}`;
            console.error(`【OpenRouterAdapter】API错误响应:`, {
              status: response.status,
              error: errorData.error
            });
          }
        } catch (e) {
          // 如果不是有效JSON，使用原始文本
          console.error(`【OpenRouterAdapter】非JSON错误响应: ${text}`);
        }
        
        throw new Error(errorMessage);
      }

      // 解析响应
      console.log(`【OpenRouterAdapter】开始解析API响应JSON`);
      const startParseTime = Date.now();
      const result = await response.json();
      const endParseTime = Date.now();
      console.log(`【OpenRouterAdapter】JSON解析完成，耗时: ${endParseTime - startParseTime}ms`);
      
      // 验证响应格式
      if (!result.choices?.[0]?.message?.content) {
        console.error('【OpenRouterAdapter】无效的响应格式:', result);
        throw new Error('收到无效的响应格式');
      }

      const responseText = result.choices[0].message.content;
      
      // 添加响应到历史
      this.conversationHistory.push({
        role: "assistant", // OpenRouter使用assistant角色
        content: responseText
      });
      
      console.log(`【OpenRouterAdapter】成功生成回复，长度: ${responseText.length}`);
      console.log(`【OpenRouterAdapter】回复前100个字符: ${responseText.substring(0, 100)}...`);
      
      // 检查是否有用量信息
      if (result.usage) {
        console.log(`【OpenRouterAdapter】令牌用量: 提示=${result.usage.prompt_tokens || 0}, 完成=${result.usage.completion_tokens || 0}, 总计=${result.usage.total_tokens || 0}`);
      }
      
      // 检查响应是否包含关系操作指令
      if (responseText.includes("关系更新") || 
          responseText.includes("互动") || 
          responseText.includes("关系强度")) {
        console.log(`【OpenRouterAdapter】检测到响应包含关系系统指令: ${responseText.substring(0, 100).replace(/\n/g, ' ')}...`);
      }
      
      return responseText;

    } catch (error) {
      console.error(`【OpenRouterAdapter】生成内容失败:`, error);
      throw error;
    }
  }

  /**
   * 生成支持工具调用的内容
   * @param contents 消息内容
   * @param characterId 角色ID
   * @param memoryResults 记忆搜索结果 (可选)
   * @param userMessage 用户消息 (可选)
   * @returns 生成的内容
   */
  async generateContentWithTools(contents: ChatMessage[], characterId?: string, memoryResults?: any, userMessage?: string): Promise<string> {
    // 检查是否有API密钥配置或者是否应该使用云服务
    const apiKeyAvailable = this.isApiKeyConfigured();
    const cloudServiceAvailable = this.useCloudService && CloudServiceProvider.isEnabled();
    
    // 如果没有API密钥且云服务不可用，抛出错误
    if (!apiKeyAvailable && !cloudServiceAvailable) {
      throw new Error("未配置API密钥，且云服务未启用。请配置API密钥或启用云服务。");
    }
    
    // 如果没有API密钥但云服务可用，使用云服务
    if (!apiKeyAvailable && cloudServiceAvailable) {
      console.log(`【OpenRouterAdapter】未配置API密钥，自动切换到云服务生成内容`);
      // 使用标准generateContent方法，它会自动切换到云服务
      return await this.generateContent(contents, characterId);
    }
    
    // 获取userMessage（优先参数，否则回退到最后一条消息）
    const analyzedUserMessage = typeof userMessage === 'string'
      ? userMessage
      : (contents[contents.length - 1]?.parts?.[0]?.text || contents[contents.length - 1]?.content || "");
    
    // 添加详细的调试日志
    console.log(`【OpenRouterAdapter】generateContentWithTools被调用，userMessage: "${analyzedUserMessage.substring(0, 50)}${analyzedUserMessage.length > 50 ? '...' : ''}"`);
    
    // 检查是否需要搜索
    const wouldNeedSearching = this.messageNeedsSearching(analyzedUserMessage);
    console.log(`【OpenRouterAdapter】userMessage是否适合搜索: ${wouldNeedSearching}`);
    
    try {
      // 检查是否同时存在记忆结果和搜索意图
      const hasMemoryResults = memoryResults && 
                             memoryResults.results && 
                             memoryResults.results.length > 0;
      
      // 根据情况处理不同类型的增强内容
      if (hasMemoryResults && wouldNeedSearching) {
        // 同时处理记忆和搜索
        console.log(`【OpenRouterAdapter】同时检测到记忆结果和搜索意图，使用组合增强处理`);
        return await this.handleCombinedMemoryAndSearch(contents, memoryResults, userMessage);
      } else if (hasMemoryResults) {
        // 如果只有记忆搜索结果，仅使用记忆增强
        console.log(`【OpenRouterAdapter】检测到记忆搜索结果，使用记忆增强处理`);
        return await this.handleWithMemoryResults(contents, memoryResults);
      } else if (wouldNeedSearching) {
        // 如果没有记忆结果但有搜索意图，使用网络搜索
        console.log(`【OpenRouterAdapter】检测到搜索意图，尝试使用网络搜索`);
        return await this.handleSearchIntent(contents, analyzedUserMessage);
      }
      
      // 如果没有搜索意图，使用普通对话方式
      console.log(`【OpenRouterAdapter】使用标准对话方式生成回复`);
      return await this.generateContent(contents, characterId);
    } catch (error) {
      console.error(`【OpenRouterAdapter】工具调用失败，回退到标准对话:`, error);
      // 如果工具调用失败，回退到标准对话
      return await this.generateContent(contents, characterId);
    }
  }

  /**
   * 判断消息是否需要搜索
   * @param messageText 消息文本
   * @returns 是否需要搜索
   */
  private messageNeedsSearching(messageText: string): boolean {
    // 添加更多详细的调试日志
    console.log(`【OpenRouterAdapter】正在分析消息是否需要搜索: "${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}"`);
    
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
      messageText.toLowerCase().includes(keyword.toLowerCase())
    );
    
    // 检查提问模式
    const isQuestion = questionPatterns.some(pattern => 
      pattern.test(messageText)
    ) || messageText.includes('?') || messageText.includes('？');
    
    // 如果同时满足以下条件，则判断需要搜索:
    // 1. 消息包含搜索关键词或者是一个问题
    // 2. 消息长度不超过300个字符 (放宽长度限制)
    const needsSearching = (hasSearchKeyword || isQuestion) && messageText.length < 300;
    
    // 添加详细的判断结果日志
    console.log(`【OpenRouterAdapter】消息搜索判断结果:`, {
      hasSearchKeyword,
      isQuestion,
      messageLength: messageText.length,
      needsSearching
    });
    
    return needsSearching;
  }

  /**
   * 处理同时具有记忆搜索结果和网络搜索意图的请求
   * @param contents 消息内容
   * @param memoryResults 记忆搜索结果
   * @param userMessage 可选，用户真实输入
   * @returns 生成的融合回复
   */
  private async handleCombinedMemoryAndSearch(contents: ChatMessage[], memoryResults: any, userMessage?: string): Promise<string> {
    console.log(`【OpenRouterAdapter】开始处理记忆搜索和网络搜索的组合请求`);
    
    // userQuery 始终使用 userMessage 参数
    const userQuery = typeof userMessage === 'string'
      ? userMessage
      : '';
    
    try {
      // Step 1: 准备记忆部分
      console.log(`【OpenRouterAdapter】处理记忆部分，发现 ${memoryResults.results.length} 条记忆`);
      
      let memorySection = `<mem>\n[系统检索到的记忆内容]：\n`;
      // 格式化记忆结果
      memoryResults.results.forEach((item: any, index: number) => {
        memorySection += `${index + 1}. ${item.memory}\n`;
      });
      memorySection += `</mem>\n\n`;
      
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
        
        console.log('【OpenRouterAdapter】[表格记忆] 最终用于查询的 characterId:', characterId, 'conversationId:', conversationId);
        
        if (characterId) {
          console.log('【OpenRouterAdapter】[表格记忆] 调用 getCharacterTablesData 前参数:', { characterId, conversationId });
          const tableData = await getCharacterTablesData(characterId, conversationId);
          console.log('【OpenRouterAdapter】[表格记忆] getCharacterTablesData 返回:', tableData);
          
          if (tableData.success && tableData.tables.length > 0) {
            tableMemoryText += `[角色长期记忆表格]\n`;
            tableData.tables.forEach(table => {
              const headerRow = '| ' + table.headers.join(' | ') + ' |';
              const sepRow = '| ' + table.headers.map(() => '---').join(' | ') + ' |';
              const dataRows = table.rows.map(row => '| ' + row.join(' | ') + ' |').join('\n');
              tableMemoryText += `表格：${table.name}\n${headerRow}\n${sepRow}\n${dataRows}\n\n`;
            });
          } else {
            console.log('【OpenRouterAdapter】[表格记忆] 未获取到有效表格数据');
          }
        } else {
          console.log('【OpenRouterAdapter】[表格记忆] 未能确定characterId，跳过表格记忆注入');
        }
      } catch (e) {
        console.warn('【OpenRouterAdapter】 获取角色表格记忆失败:', e);
      }
      // ==== 表格记忆获取结束 ====
      
      // Step 2: 准备网络搜索部分
      console.log(`【OpenRouterAdapter】为用户查询准备网络搜索: "${userQuery}"`);
      
      // 优先尝试通过云服务进行联网搜索
      if (this.useCloudService && CloudServiceProvider.isEnabled()) {
        try {
          console.log(`【OpenRouterAdapter】优先通过云服务处理联网搜索请求`);
          // 打印请求内容
          console.log(`【OpenRouterAdapter】[云服务搜索] 请求内容:`, userQuery);
          
          const response = await CloudServiceProvider.generateSearchResult(userQuery, {
            model: CloudServiceProvider.getMultiModalModel(),
            temperature: 0.7,
            max_tokens: 2048
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Cloud service search HTTP error! status: ${response.status}, details: ${errorText}`);
          }
          
          const result = await response.json();

          let searchResultText = "";
          if (result.choices && result.choices.length > 0) {
            searchResultText = result.choices[0].message?.content || "";
          } else if (typeof result === 'string') {
            searchResultText = result;
          }
          
          // 打印云服务返回的搜索结果
          console.log(`【OpenRouterAdapter】[云服务搜索] 返回结果:`, searchResultText);
          
          if (searchResultText) {
            let searchSection = `<websearch>\n搜索引擎返回的联网检索结果：\n${searchResultText}\n</websearch>\n\n`;
            
            // 构建融合提示词
            console.log(`【OpenRouterAdapter】构建融合提示词，结合记忆和网络搜索结果`);
            
            // 将表格记忆添加到组合提示中，位置在memorySection之前
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
            console.log(`【OpenRouterAdapter】融合提示词构建完成，长度: ${combinedPrompt.length}`);
            
            // 转换历史消息并插入融合提示
            const finalPrompt: ChatMessage[] = [
              ...contents.slice(0, -1),
              {
                role: "user", // OpenRouter使用assistant角色代替Gemini的model
                content: combinedPrompt
              },
              contents[contents.length - 1]
            ];
            
            return await this.generateContent(finalPrompt);
          }
        } catch (cloudSearchError) {
          console.warn('【OpenRouterAdapter】云服务联网搜索失败，降级到本地BraveSearch:', cloudSearchError);
          // 继续降级到本地bravesearch
        }
      }
      
      // 确保MCP适配器已连接
      if (!mcpAdapter.isReady()) {
        try {
          await mcpAdapter.connect();
        } catch (e) {
          console.error('【OpenRouterAdapter】Brave本地搜索连接失败:', e);
          // 返回友好提示
          return await this.generateContent([
            ...contents.slice(0, -1),
            {
              role: "assistant",
              content: "（注意：搜索功能不可用。）"
            },
            contents[contents.length - 1]
          ]);
        }
      }
      
      // 先使用OpenRouter提取搜索关键词
      const extractionPrompt: ChatMessage[] = [
        {
          role: "assistant",
          content: "我将帮助你提取搜索关键词。请给我一个问题或搜索请求，我会提取出最适合用于搜索引擎的关键词。我只会返回关键词，不会有任何额外的解释。"
        },
        {
          role: "user",
          content: userQuery
        }
      ];
      
      const refinedQuery = await this.askLLM(extractionPrompt);
      const finalQuery = refinedQuery.trim() || userQuery;
      
      console.log(`【OpenRouterAdapter】提取的搜索关键词: ${finalQuery}`);
      
      // 使用MCP适配器执行搜索
      let searchResults;
      try {
        searchResults = await mcpAdapter.search({
          query: finalQuery,
          count: 5
        });
      } catch (e) {
        console.error('【OpenRouterAdapter】Brave本地搜索执行失败:', e);
        // 返回友好提示
        return await this.generateContent([
          ...contents.slice(0, -1),
          {
            role: "assistant",
            content: "（注意：本地搜索功能不可用，请检查Brave API密钥配置。）"
          },
          contents[contents.length - 1]
        ]);
      }
      
      // 格式化搜索结果为可读文本
      const formattedResults = mcpAdapter.formatSearchResults(searchResults);
      
      let searchSection = `<websearch>\n搜索引擎返回的联网检索结果：\n${formattedResults}\n</websearch>\n\n`;
      
      // Step 3: 构建融合提示词
      console.log(`【OpenRouterAdapter】构建融合提示词，结合记忆和网络搜索结果`);
      
      // 将表格记忆添加到组合提示中，位置在memorySection之前
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
- 结合上面的记忆内容和联网搜索结果，全面回答用户的问题。
- 用<websearch></websearch>标签包裹我对网络搜索结果的解释和引用，例如:
  <websearch>根据最新的网络信息，关于这个问题的专业观点是...</websearch>
- 确保回复能够同时**有效整合记忆和网络信息**，让内容更加全面和有用。
- 回复的语气和风格一定会与角色人设保持一致。
- 整个回复只能有一组<websearch>标签。**
</response_guidelines>`;
      
      // 记录融合提示词的长度
      console.log(`【OpenRouterAdapter】融合提示词构建完成，长度: ${combinedPrompt.length}`);
      
      // 使用标准的生成内容方法生成最终回复
      // 插入顺序：历史消息 + assistant(记忆/搜索内容) + 用户消息
      const finalPrompt: ChatMessage[] = [
        ...contents.slice(0, -1),
        {
          role: "user", // OpenRouter使用assistant角色
          content: combinedPrompt
        },
        contents[contents.length - 1]
      ];
      
      return await this.generateContent(finalPrompt);
    } catch (error) {
      console.error(`【OpenRouterAdapter】组合处理记忆搜索和网络搜索时出错:`, error);
      
      // 如果组合处理失败，尝试退回到仅使用记忆搜索结果的方式
      console.log(`【OpenRouterAdapter】组合处理失败，回退到仅使用记忆结果模式`);
      try {
        return await this.handleWithMemoryResults(contents, memoryResults);
      } catch (fallbackError) {
        console.error(`【OpenRouterAdapter】记忆处理也失败，回退到标准对话:`, fallbackError);
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
    const userQuery = lastMessage.parts?.[0]?.text || lastMessage.content || "";

    try {
      // Add more detailed logging of memory result structure
      console.log(`【OpenRouterAdapter】处理记忆增强请求，发现 ${memoryResults.results.length} 条记忆`);
      console.log('【OpenRouterAdapter】记忆结果结构:', {
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
        
        console.log('【OpenRouterAdapter】[表格记忆] 最终用于查询的 characterId:', characterId, 'conversationId:', conversationId);
        
        if (characterId) {
          console.log('【OpenRouterAdapter】[表格记忆] 调用 getCharacterTablesData 前参数:', { characterId, conversationId });
          const tableData = await getCharacterTablesData(characterId, conversationId);
          console.log('【OpenRouterAdapter】[表格记忆] getCharacterTablesData 返回:', tableData);
          
          if (tableData.success && tableData.tables.length > 0) {
            tableMemoryText += `[角色长期记忆表格]\n`;
            tableData.tables.forEach(table => {
              const headerRow = '| ' + table.headers.join(' | ') + ' |';
              const sepRow = '| ' + table.headers.map(() => '---').join(' | ') + ' |';
              const dataRows = table.rows.map(row => '| ' + row.join(' | ') + ' |').join('\n');
              tableMemoryText += `表格：${table.name}\n${headerRow}\n${sepRow}\n${dataRows}\n\n`;
            });
          } else {
            console.log('【OpenRouterAdapter】[表格记忆] 未获取到有效表格数据，success:', tableData.success, 'tables.length:', tableData.tables.length);
          }
        } else {
          console.log('【OpenRouterAdapter】[表格记忆] 未能确定characterId，跳过表格记忆注入');
        }
      } catch (e) {
        console.warn('【OpenRouterAdapter】获取角色表格记忆失败:', e);
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
- 除了对用户消息的回应之外，结合记忆内容进行回复。
- 会确保回复保持角色人设的一致性。
- 结合表格记忆的内容回复（如果有），但我不会输出表格的具体内容，仅将表格作为内心记忆。
</response_guidelines>`;

      // Log prepared prompt
      console.log('【OpenRouterAdapter】准备了带记忆结果的提示:', combinedPrompt.substring(0, 200) + '...');

      // 使用标准的生成内容方法生成最终回复
      // 插入顺序：历史消息 + assistant(记忆内容) + 用户消息
      const finalPrompt: ChatMessage[] = [
        ...contents.slice(0, -1),
        {
          role: "assistant", // OpenRouter使用assistant角色代替Gemini的model
          content: combinedPrompt
        },
        contents[contents.length - 1]
      ];

      return await this.generateContent(finalPrompt);
    } catch (error) {
      console.error(`【OpenRouterAdapter】记忆增强处理失败:`, error);
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
      : (contents[contents.length - 1]?.parts?.[0]?.text || contents[contents.length - 1]?.content || "");
    
    try {
      // 优先尝试通过云服务进行联网搜索
      if (this.useCloudService && CloudServiceProvider.isEnabled()) {
        try {
          console.log(`【OpenRouterAdapter】优先通过云服务处理联网搜索请求`);
          // 打印请求内容
          console.log(`【OpenRouterAdapter】[云服务搜索] 请求内容:`, searchQuery);
          const response = await CloudServiceProvider.generateSearchResult(searchQuery, {
            model: CloudServiceProvider.getMultiModalModel(),
            temperature: 0.7,
            max_tokens: 2048
          });
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Cloud service search HTTP error! status: ${response.status}, details: ${errorText}`);
          }
          const result = await response.json();

          let searchResultText = "";
          if (result.choices && result.choices.length > 0) {
            searchResultText = result.choices[0].message?.content || "";
          } else if (typeof result === 'string') {
            searchResultText = result;
          }
          // 打印云服务返回的搜索结果
          console.log(`【OpenRouterAdapter】[云服务搜索] 返回结果:`, searchResultText);
          if (searchResultText) {
            // 构建带有搜索结果的修改版提示
            let combinedPrompt = `我在对用户消息：${searchQuery}\n\n进行联网搜索`;
            
            // 添加网络搜索结果
            combinedPrompt += `<websearch>\n搜索引擎返回的联网检索结果：\n${searchResultText}\n</websearch>\n\n`;
            
            // 添加响应指南
            combinedPrompt += `<response_guidelines>
- 除了对用户消息的回应之外，我**一定** 会结合联网搜索内容进行回复。
- **我会根据角色设定和聊天上下文**，输出我对联网检索结果的解释，并用<websearch></websearch>包裹。
  - 示例: <websearch>根据网络信息，[相关领域的专家]认为... 这可能对您有帮助。</websearch>
- 我会确保回复保持角色人设的一致性。
</response_guidelines>`;
            
            // 使用标准的生成内容方法生成最终回复
            // 插入顺序：历史消息 + assistant(搜索内容) + 用户消息
            const finalPrompt: ChatMessage[] = [
              ...contents.slice(0, -1),
              {
                role: "assistant", // OpenRouter使用assistant角色
                content: combinedPrompt
              },
              contents[contents.length - 1]
            ];
            
            return await this.generateContent(finalPrompt);
          }
        } catch (cloudSearchError) {
          console.warn('【OpenRouterAdapter】云服务联网搜索失败，降级到本地BraveSearch:', cloudSearchError);
          // 继续降级到本地bravesearch
        }
      }

      // 确保MCP适配器已连接
      if (!mcpAdapter.isReady()) {
        try {
          await mcpAdapter.connect();
        } catch (e) {
          console.error('【OpenRouterAdapter】Brave本地搜索连接失败:', e);
          // 返回友好提示
          return await this.generateContent([
            ...contents.slice(0, -1),
            {
              role: "assistant", // OpenRouter使用assistant角色
              content: "（注意：搜索功能不可用。）"
            },
            contents[contents.length - 1]
          ]);
        }
      }
      
      // 提取搜索关键词
      const extractionPrompt: ChatMessage[] = [
        {
          role: "assistant", // OpenRouter使用assistant角色
          content: "我将帮助你提取搜索关键词。请给我一个问题或搜索请求，我会提取出最适合用于搜索引擎的关键词。我只会返回关键词，不会有任何额外的解释。"
        },
        {
          role: "user",
          content: searchQuery
        }
      ];
      
      const refinedQuery = await this.askLLM(extractionPrompt);
      const finalQuery = refinedQuery.trim() || searchQuery;
      
      console.log(`【OpenRouterAdapter】提取的搜索关键词: ${finalQuery}`);
      
      // 使用MCP适配器执行搜索
      let searchResults;
      try {
        searchResults = await mcpAdapter.search({
          query: finalQuery,
          count: 5
        });
      } catch (e) {
        console.error('【OpenRouterAdapter】Brave本地搜索执行失败:', e);
        // 返回友好提示
        return await this.generateContent([
          ...contents.slice(0, -1),
          {
            role: "assistant", // OpenRouter使用assistant角色
            content: "（注意：本地搜索功能不可用，请检查Brave API密钥配置。）"
          },
          contents[contents.length - 1]
        ]);
      }
      
      // 格式化搜索结果为可读文本
      const formattedResults = mcpAdapter.formatSearchResults(searchResults);
      
      console.log(`【OpenRouterAdapter】获取到搜索结果，正在生成回复`);
      
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
      // 插入顺序：历史消息 + assistant(搜索内容) + 用户消息
      const finalPrompt: ChatMessage[] = [
        ...contents.slice(0, -1),
        {
          role: "assistant", // OpenRouter使用assistant角色
          content: combinedPrompt
        },
        contents[contents.length - 1]
      ];
      
      return await this.generateContent(finalPrompt);
    } catch (error) {
      console.error(`【OpenRouterAdapter】搜索处理失败:`, error);
      
      // 如果搜索失败，通知用户并使用标准方式回答
      const fallbackPrompt: ChatMessage[] = [
        ...contents.slice(0, -1),
        {
          role: "assistant", // OpenRouter使用assistant角色
          content: `${searchQuery}\n\n(注意：搜索引擎尝试搜索相关信息，但搜索功能暂时不可用。请根据你已有的知识回答我的问题。)` 
        },
        contents[contents.length - 1]
      ];
      
      return await this.generateContent(fallbackPrompt);
    }
  }

  /**
   * 处理多模态内容（图像+文本）
   * @param prompt 文本提示
   * @param options 生成选项
   * @returns 生成的内容（文本和图片）
   */
  async generateMultiModalContent(prompt: string, options: { 
    includeImageOutput?: boolean;
    temperature?: number;
    images?: ImageInput[]; // 支持Base64编码图片和URL
  } = {}): Promise<GeneratedContent> {
    // 检查云服务状态
    this.updateCloudServiceStatus();
    
    // 检查是否有API密钥或需要使用云服务
    const apiKeyAvailable = this.isApiKeyConfigured();
    const cloudServiceAvailable = this.useCloudService && CloudServiceProvider.isEnabled();
    
    // 如果没有API密钥且云服务不可用，抛出错误
    if (!apiKeyAvailable && !cloudServiceAvailable) {
      throw new Error("未配置API密钥，且云服务未启用。请配置API密钥或启用云服务。");
    }
    
    // 如果没有API密钥但云服务可用，使用云服务
    if (!apiKeyAvailable && cloudServiceAvailable) {
      console.log(`【OpenRouterAdapter】未配置API密钥，自动切换到云服务处理多模态请求`);
      return await this.executeMultiModalContentWithCloudService(prompt, options);
    }
    
    try {
      // 使用API密钥
      return await this.executeMultiModalContentWithKeyRotation(prompt, options);
    } catch (error) {
      console.error(`【OpenRouterAdapter】多模态内容生成失败:`, error);
      
      // 如果云服务可用，作为备选方案
      if (cloudServiceAvailable) {
        console.log(`【OpenRouterAdapter】API多模态请求失败，尝试使用云服务作为备选方案`);
        return await this.executeMultiModalContentWithCloudService(prompt, options);
      }
      
      throw error;
    }
  }

  /**
   * 使用云服务生成多模态内容
   */
  private async executeMultiModalContentWithCloudService(
    prompt: string,
    options: { 
      includeImageOutput?: boolean;
      temperature?: number;
      images?: ImageInput[];
    }
  ): Promise<GeneratedContent> {
    console.log('【OpenRouterAdapter】使用云服务生成多模态内容');
    
    try {
      const startTime = Date.now();
      
      // 准备云服务所需的消息格式
      let messages = [];
      
      // 处理图像输入
      if (options.images && options.images.length > 0) {
        // 创建包含文本和图像的消息
        let messageContent = [];
        
        // 添加文本
        messageContent.push({
          type: "text",
          text: prompt
        });
        
        // 添加每个图像
        for (const img of options.images) {
          let imageData;
          let mimeType;
          
          if (img.url) {
            // 从URL获取图像
            const fetchedImg = await this.fetchImageAsBase64(img.url);
            imageData = fetchedImg.data;
            mimeType = fetchedImg.mimeType;
          } else if (img.data && img.mimeType) {
            // 直接使用提供的数据
            imageData = img.data;
            mimeType = img.mimeType;
          } else {
            console.error('【OpenRouterAdapter】无效的图像输入');
            continue;
          }
          
          // 添加图像到内容
          messageContent.push({
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${imageData}`
            }
          });
        }
        
        messages.push({
          role: "user",
          content: messageContent
        });
      } else {
        // 纯文本消息
        messages.push({
          role: "user",
          content: prompt
        });
      }
      
      console.log(`【OpenRouterAdapter】向云服务发送${options.images ? '图文混合' : '纯文本'}消息`);
      
      // 调用云服务API
      const response = await CloudServiceProvider.generateMultiModalContent(
        messages,
        {
          model: CloudServiceProvider.getMultiModalModel(),
          temperature: options.temperature || 0.7,
          max_tokens: 2048,
          ...(options.includeImageOutput ? { responseModalities: ['TEXT', 'IMAGE'] } : {})
        }
      );
      
      const endTime = Date.now();
      console.log(`【OpenRouterAdapter】云服务多模态请求完成，耗时: ${endTime - startTime}ms`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloud service HTTP error! status: ${response.status}, details: ${errorText}`);
      }
      
      const result = await response.json();
      
      // 处理响应并提取文本/图像
      const generatedContent: GeneratedContent = {};
      
      // 处理响应格式
      if (result.choices && result.choices.length > 0) {
        const message = result.choices[0].message;
        
        if (typeof message.content === 'string') {
          // 纯文本响应
          generatedContent.text = message.content;
        } else if (Array.isArray(message.content)) {
          // 混合内容响应
          const textParts = message.content
            .filter((part: any) => part.type === 'text')
            .map((part: any) => part.text);
          
          generatedContent.text = textParts.join('\n');
          
          // 处理图像部分
          const imageParts = message.content
            .filter((part: any) => part.type === 'image_url')
            .map((part: any) => {
              const url = part.image_url?.url;
              if (url && url.startsWith('data:image')) {
                // 提取Base64数据
                const base64Data = url.split(',')[1];
                return base64Data;
              }
              return null;
            })
            .filter(Boolean);
          
          if (imageParts.length > 0) {
            generatedContent.images = imageParts;
          }
        }
      }
      
      console.log(`【OpenRouterAdapter】成功收到云服务的多模态响应`);
      if (generatedContent.text) {
        console.log(`【OpenRouterAdapter】响应包含文本，长度: ${generatedContent.text.length}`);
      }
      if (generatedContent.images) {
        console.log(`【OpenRouterAdapter】响应包含 ${generatedContent.images.length} 个图片`);
      }
      
      return generatedContent;
    } catch (error) {
      console.error(`【OpenRouterAdapter】云服务多模态内容生成失败:`, error);
      throw new Error(`云服务多模态请求失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 使用密钥轮换执行多模态内容生成
   */
  private async executeMultiModalContentWithKeyRotation(
    prompt: string,
    options: { 
      includeImageOutput?: boolean;
      temperature?: number;
      images?: ImageInput[];
    }
  ): Promise<GeneratedContent> {
    // 如果没有API密钥但云服务可用，使用云服务
    if (this.apiKeys.length === 0) {
      if (this.useCloudService && CloudServiceProvider.isEnabled()) {
        console.log(`【OpenRouterAdapter】没有配置API密钥，使用云服务处理多模态请求`);
        return await this.executeMultiModalContentWithCloudService(prompt, options);
      } else {
        throw new Error("未配置API密钥，且云服务未启用");
      }
    }
    
    let lastError: any = null;
    
    // 尝试使用每个可用的API密钥
    for (let keyIndex = 0; keyIndex < this.apiKeys.length; keyIndex++) {
      // 设置当前密钥索引
      this.currentKeyIndex = keyIndex;
      console.log(`【OpenRouterAdapter】尝试使用API密钥 ${keyIndex + 1}/${this.apiKeys.length} 生成多模态内容`);
      
      try {
        const result = await this.executeMultiModalContent(prompt, options);
        return result;
      } catch (error) {
        console.error(`【OpenRouterAdapter】使用API密钥 ${keyIndex + 1}/${this.apiKeys.length} 多模态请求失败:`, error);
        lastError = error;
        // 继续循环使用下一个密钥
      }
    }
    
    // 如果所有密钥都失败了
    throw new Error(`所有API密钥多模态请求均失败: ${lastError?.message || '未知错误'}`);
  }

  /**
   * 核心多模态内容生成实现
   */
  private async executeMultiModalContent(
    prompt: string,
    options: { 
      includeImageOutput?: boolean;
      temperature?: number;
      images?: ImageInput[];
    }
  ): Promise<GeneratedContent> {
    // 验证我们有有效的API密钥
    const currentApiKey = this.apiKey;
    if (!currentApiKey) {
      if (this.useCloudService && CloudServiceProvider.isEnabled()) {
        return await this.executeMultiModalContentWithCloudService(prompt, options);
      }
      throw new Error("未配置API密钥，无法执行直接API调用");
    }
    
    // 构建OpenRouter请求
    const requestUrl = `${this.baseUrl}/chat/completions`;
    
    let messages = [];
    
    // 如果有图片，需要处理成OpenRouter的消息格式
    if (options.images && options.images.length > 0) {
      try {
        // 准备包含图像的消息内容
        let messageContent = [];
        
        // 添加文本提示
        if (prompt) {
          messageContent.push("以下是我想让您分析的图片，请根据以下提示进行分析：" + prompt + "\n\n");
        }
        
        // 处理每个图片
        for (const img of options.images) {
          if (img.url) {
            const imageData = await this.fetchImageAsBase64(img.url);
            messageContent.push(`<img src="data:${imageData.mimeType};base64,${imageData.data}" />`);
          } else if (img.data && img.mimeType) {
            messageContent.push(`<img src="data:${img.mimeType};base64,${img.data}" />`);
          }
        }
        
        // 添加用户消息
        messages.push({
          role: "user",
          content: messageContent.join("\n")
        });
        
        console.log(`【OpenRouterAdapter】已处理 ${options.images.length} 张图片`);
      } catch (error) {
        console.error("【OpenRouterAdapter】处理图片输入时出错:", error);
        throw new Error("处理图片输入失败: " + (error instanceof Error ? error.message : String(error)));
      }
    } else {
      // 纯文本消息
      messages.push({
        role: "user",
        content: prompt
      });
    }
    
    // 构建请求体
    const requestBody = {
      model: this.model,
      messages: messages,
      temperature: options.temperature || 0.7,
      max_tokens: 1024,
      ...(options.includeImageOutput ? { response_format: { type: "text_and_image" } } : {})
    };
    
    console.log(`【OpenRouterAdapter】发送多模态请求，使用模型: ${this.model}`);
    console.log(`【OpenRouterAdapter】请求是否包含图片输出: ${options.includeImageOutput ? '是' : '否'}`);
    
    let response;
    if (CloudServiceProvider.isEnabled()) {
      console.log('【OpenRouterAdapter】检测到云服务已启用，使用云服务转发请求');
      
      response = await CloudServiceProvider.forwardRequest(
        requestUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentApiKey}`,
            'HTTP-Referer': 'https://github.com',
            'X-Title': 'AI Chat App'
          },
          body: JSON.stringify(requestBody)
        },
        'openrouter'
      );
    } else {
      response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentApiKey}`,
          'HTTP-Referer': 'https://github.com',
          'X-Title': 'AI Chat App'
        },
        body: JSON.stringify(requestBody)
      });
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`【OpenRouterAdapter】多模态API响应错误 (${response.status}): ${errorText}`);
      throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
    }
    
    const result = await response.json();
    
    // 解析响应
    const generatedContent: GeneratedContent = {};
    
    if (result.choices && result.choices.length > 0) {
      // 提取文本内容
      const responseMessage = result.choices[0].message;
      if (typeof responseMessage.content === 'string') {
        generatedContent.text = responseMessage.content;
      }
      
      // 如果响应中包含图像（对于某些支持图像生成的模型）
      if (responseMessage.content_format === 'text_and_image' && responseMessage.images) {
        generatedContent.images = responseMessage.images;
      }
    }
    
    console.log(`【OpenRouterAdapter】成功接收多模态响应`);
    if (generatedContent.text) {
      console.log(`【OpenRouterAdapter】响应包含文本，长度: ${generatedContent.text.length}`);
    }
    if (generatedContent.images) {
      console.log(`【OpenRouterAdapter】响应包含 ${generatedContent.images.length} 个图片`);
    }
    
    return generatedContent;
  }

  /**
   * 从URL获取图像并转换为Base64格式
   * @param imageUrl 图像URL
   * @returns 图像的Base64编码和MIME类型
   */
  async fetchImageAsBase64(imageUrl: string): Promise<{ data: string; mimeType: string }> {
    try {
      console.log(`【OpenRouterAdapter】正在从URL获取图片: ${imageUrl}`);
      
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
      console.log(`【OpenRouterAdapter】成功获取并编码图片，MIME类型: ${contentType}, 大小: ${base64Data.length}字节, 预览: ${base64Preview}`);
      
      return {
        data: base64Data,
        mimeType: contentType
      };
    } catch (error) {
      console.error(`【OpenRouterAdapter】从URL获取图片失败:`, error);
      throw error;
    }
  }

  /**
   * 分析图片内容
   * @param image 图片输入（URL或Base64数据）
   * @param prompt 询问图片的提示
   * @returns 分析结果文本
   */
  async analyzeImage(image: ImageInput, prompt: string): Promise<string> {
    // 检查是否有API密钥配置或者是否应该使用云服务
    const apiKeyAvailable = this.isApiKeyConfigured();
    const cloudServiceAvailable = this.useCloudService && CloudServiceProvider.isEnabled();
    
    // 如果没有API密钥且云服务不可用，抛出错误
    if (!apiKeyAvailable && !cloudServiceAvailable) {
      throw new Error("未配置API密钥，且云服务未启用。请配置API密钥或启用云服务。");
    }
    
    // 如果没有API密钥但云服务可用，使用云服务
    if (!apiKeyAvailable && cloudServiceAvailable) {
      console.log(`【OpenRouterAdapter】未配置API密钥，自动切换到云服务分析图片`);
      return await this.analyzeImageWithCloudService(image, prompt);
    }
    
    // 增强图像分析提示词
    const enhancedPrompt = prompt || `请详细描述这张图片的内容。包括：
1. 图片中的主要人物/物体
2. 场景和环境
3. 颜色和氛围
4. 任何特殊或显著的细节
5. 图片可能传递的情感或意图

请提供全面但简洁的描述，控制在150字以内。`;

    // 确保图像数据格式正确
    let processedImage: ImageInput;
    
    if (image.url) {
      // 如果提供了URL，先获取图像数据
      try {
        const imageData = await this.fetchImageAsBase64(image.url);
        processedImage = imageData;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`无法处理图像URL: ${errorMessage}`);
      }
    } else {
      // 如果已经提供了Base64数据，直接使用
      processedImage = image;
    }
    
    // 预览提示词的前50个字符
    const promptPreview = enhancedPrompt.substring(0, 50) + (enhancedPrompt.length > 50 ? '...' : '');
    console.log(`【OpenRouterAdapter】使用增强提示词分析图片: "${promptPreview}"`);
    
    try {
      // 先尝试使用API密钥
      const result = await this.generateMultiModalContent(enhancedPrompt, {
        images: [processedImage]
      });
      
      return result.text || '';
    } catch (error) {
      console.error(`【OpenRouterAdapter】分析图片失败:`, error);
      
      // 如果API请求失败且云服务可用，尝试云服务
      if (cloudServiceAvailable) {
        console.log(`【OpenRouterAdapter】API分析图片失败，尝试使用云服务`);
        return await this.analyzeImageWithCloudService(image, prompt);
      }
      
      throw new Error(`分析图片失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 使用云服务分析图片
   */
  private async analyzeImageWithCloudService(image: ImageInput, prompt: string): Promise<string> {
    console.log(`【OpenRouterAdapter】使用云服务分析图片`);
    
    // 使用增强提示词
    const enhancedPrompt = prompt || `请详细描述这张图片的内容。包括：
1. 图片中的主要人物/物体
2. 场景和环境
3. 颜色和氛围
4. 任何特殊或显著的细节
5. 图片可能传递的情感或意图

请提供全面但简洁的描述，控制在150字以内。`;
    
    try {
      // 处理图像输入为云服务所需的格式
      let imageUrl: string;
      
      if (image.url) {
        // 如果是外部URL，直接使用
        imageUrl = image.url;
        console.log(`【OpenRouterAdapter】使用图片URL: ${imageUrl.substring(0, 50)}...`);
      } else if (image.data && image.mimeType) {
        // 如果是Base64数据，需要创建Data URL
        imageUrl = `data:${image.mimeType};base64,${image.data}`;
        console.log(`【OpenRouterAdapter】使用Base64图片数据 (${image.data.length} 字节)`);
      } else {
        throw new Error("无效的图像输入格式");
      }
      
      const startTime = Date.now();
      
      // 使用CloudServiceProvider分析图片
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
                url: imageUrl
              }
            }
          ]
        }
      ];
      
      const response = await CloudServiceProvider.generateMultiModalContent(
        messages,
        {
          model: CloudServiceProvider.getMultiModalModel(),
          temperature: 0.7,
          max_tokens: 2048
        }
      );
      
      const endTime = Date.now();
      console.log(`【OpenRouterAdapter】云服务图片分析请求完成，耗时: ${endTime - startTime}ms`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`云服务HTTP错误! 状态: ${response.status}, 详情: ${errorText}`);
      }
      
      const result = await response.json();
      
      if (result.choices && result.choices.length > 0) {
        const content = result.choices[0].message?.content;
        
        if (typeof content === 'string') {
          return content;
        } else if (Array.isArray(content)) {
          // 提取所有文本部分
          return content
            .filter(part => part.type === 'text')
            .map(part => part.text)
            .join('\n');
        }
      }
      
      throw new Error("云服务返回了无效的响应格式");
    } catch (error) {
      console.error(`【OpenRouterAdapter】云服务分析图片失败:`, error);
      throw new Error(`云服务分析图片失败: ${error instanceof Error ? error.message : String(error)}`);
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
    // OpenRouter目前不支持图片生成，抛出错误或返回空结果
    console.error('【OpenRouterAdapter】OpenRouter不支持直接图片生成功能');
    return [];
  }
  
  /**
   * 辅助方法：用于发送简单的LLM请求并获取回答
   * @param messages 消息
   * @returns LLM的回答
   */
  private async askLLM(messages: any[]): Promise<string> {
    try {
      // 准备OpenRouter格式的消息
      const requestBody = {
        model: this.model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1024
      };

      // 发送API请求
      const requestUrl = `${this.baseUrl}/chat/completions`;
      
      // Check if cloud service is enabled and use it if available
      let response;
      if (CloudServiceProvider.isEnabled()) {
        console.log('【OpenRouterAdapter】LLM请求 - 使用云服务转发');
        console.log(`【OpenRouterAdapter】LLM请求URL: ${requestUrl}`);
        console.log(`【OpenRouterAdapter】LLM请求开始时间: ${new Date().toISOString()}`);
        
        // 记录消息概要
        console.log(`【OpenRouterAdapter】LLM请求包含 ${messages.length} 条消息`);
        const lastMessagePreview = messages[messages.length - 1]?.content || '';
        console.log(`【OpenRouterAdapter】LLM最后一条消息预览: ${typeof lastMessagePreview === 'string' ? lastMessagePreview.substring(0, 50) + '...' : '[复杂内容]'}`);
        
        // Forward the request through the cloud service
        const startTime = Date.now();
        response = await CloudServiceProvider.forwardRequest(
          requestUrl,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.apiKey}`,
              'HTTP-Referer': 'https://github.com',
              'X-Title': 'AI Chat App'
            },
            body: JSON.stringify(requestBody)
          },
          'openrouter'
        );
        const endTime = Date.now();
        
        console.log(`【OpenRouterAdapter】LLM云服务请求完成，耗时: ${endTime - startTime}ms`);
        console.log(`【OpenRouterAdapter】LLM云服务响应状态: ${response.status} ${response.statusText}`);
      } else {
        // Use direct API call if cloud service is not enabled
        console.log('【OpenRouterAdapter】LLM请求 - 使用直接API调用');
        console.log(`【OpenRouterAdapter】LLM请求URL: ${requestUrl}`);
        
        const startTime = Date.now();
        response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://github.com',
            'X-Title': 'AI Chat App'
          },
          body: JSON.stringify(requestBody)
        });
        const endTime = Date.now();
        
        console.log(`【OpenRouterAdapter】LLM直接API调用完成，耗时: ${endTime - startTime}ms`);
      }
      
      if (!response.ok) {
        console.error(`【OpenRouterAdapter】LLM请求失败: ${response.status} ${response.statusText}`);
        throw new Error(`OpenRouter API 错误(${response.status}): ${response.statusText}`);
      }

      console.log(`【OpenRouterAdapter】开始解析LLM响应`);
      const data = await response.json();
      
      if (!data.choices?.[0]?.message?.content) {
        console.error(`【OpenRouterAdapter】LLM响应格式无效:`, data);
        throw new Error('收到无效的响应格式');
      }

      const responseContent = data.choices[0].message.content;
      console.log(`【OpenRouterAdapter】LLM响应成功，内容长度: ${responseContent.length}`);
      
      // 打印令牌用量（如果有）
      if (data.usage) {
        console.log(`【OpenRouterAdapter】LLM令牌用量: 提示=${data.usage.prompt_tokens || 0}, 完成=${data.usage.completion_tokens || 0}, 总计=${data.usage.total_tokens || 0}`);
      }

      return responseContent;
    } catch (error) {
      console.error(`【OpenRouterAdapter】LLM请求失败:`, error);
      throw error;
    }
  }

  /**
   * 清除聊天历史
   */
  clearChatHistory(): void {
    console.log('【OpenRouterAdapter】清除聊天历史');
    this.conversationHistory = [];
  }

  /**
   * 获取可用模型列表
   */
  async listModels(): Promise<OpenRouterModel[]> {
    console.log('【OpenRouterAdapter】获取可用模型列表');
    console.log(`【OpenRouterAdapter】使用API密钥: ${this.maskApiKey(this.apiKey || '')}`);
    
    try {
      // Check if cloud service is enabled and use it if available
      let response;
      const requestUrl = `${this.baseUrl}/models`;
      
      if (CloudServiceProvider.isEnabled()) {
        console.log('【OpenRouterAdapter】使用云服务获取模型列表');
        
        // Forward the request through the cloud service
        response = await CloudServiceProvider.forwardRequest(
          requestUrl,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'HTTP-Referer': 'https://github.com', // Required header
              'X-Title': 'AI Chat App'  // Add application identifier
            }
          },
          'openrouter'
        );
      } else {
        // Use direct API call if cloud service is not enabled
        response = await fetch(requestUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://github.com', // Required header
            'X-Title': 'AI Chat App'  // Add application identifier
          }
        });
      }

      if (!response.ok) {
        const text = await response.text();
        console.error(`【OpenRouterAdapter】获取模型列表失败(${response.status}): ${text}`);
        
        let errorMessage = `获取模型列表失败: ${response.statusText}`;
        
        try {
          // Try to parse error JSON
          const errorData = JSON.parse(text);
          if (errorData.error?.message) {
            errorMessage = `获取模型列表失败: ${errorData.error.message}`;
          }
        } catch (e) {
          // Keep original error message
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      // Log model data structure for debugging
      console.log(`【OpenRouterAdapter】获取到 ${data.data?.length || 0} 个模型`);
      if (data.data?.length > 0) {
        console.log(`【OpenRouterAdapter】示例模型: ${data.data[0].id}`);
      }

      // Ensure we return an array even if the API response is unexpected
      return Array.isArray(data.data) ? data.data : [];
    } catch (error) {
      console.error('【OpenRouterAdapter】获取模型列表失败:', error);
      // Return empty array instead of throwing to make UI more resilient
      return [];
    }
  }
  
  /**
   * 静态方法：允许外部直接生成内容（简化调用）
   */
  static async executeDirectGenerateContent(
    promptOrMessages: string | ChatMessage[] | { role: string; content: string }[],
    options?: {
      apiKey?: string;
      characterId?: string;
      modelId?: string;
    }
  ): Promise<string> {
    // 1. 获取API key（优先参数，其次全局设置，再次settings-helper）
    let apiKey = options?.apiKey 
      || (typeof global !== 'undefined' && (global as any).OPENROUTER_API_KEY)
      || '';

    if (!apiKey) {
      // 尝试通过 settings-helper 获取
      try {
        const apiSettings = getApiSettings();
        if (apiSettings && apiSettings.openrouter?.apiKey) {
          apiKey = apiSettings.openrouter?.apiKey;
        }
      } catch (e) {
        // 忽略异常，继续后续判断
      }
    }

    if (!apiKey) {
      throw new Error('OpenRouterAdapter.executeDirectGenerateContent: API key is required');
    }

    // 2. 创建适配器实例
    const adapter = new OpenRouterAdapter(apiKey);

    // 3. 组装消息格式
    let messages: ChatMessage[];
    if (typeof promptOrMessages === 'string') {
      messages = [
        { role: 'user', content: promptOrMessages }
      ];
    } else if (Array.isArray(promptOrMessages)) {
      // 支持传入标准格式或OpenRouter格式
      if (promptOrMessages.length > 0 && 'content' in promptOrMessages[0]) {
        // 将标准OpenAI格式转换为OpenRouter格式
        messages = promptOrMessages.map((msg: any) => ({
          role: msg.role === 'assistant' ? 'assistant' : (msg.role === 'model' ? 'assistant' : msg.role),
          content: msg.content
        }));
      } else {
        // 如果是Gemini格式，转换为OpenRouter格式
        messages = (promptOrMessages as any[]).map(msg => ({
          role: msg.role === 'model' ? 'assistant' : msg.role,
          content: msg.parts?.[0]?.text || ""
        }));
      }
    } else {
      throw new Error('OpenRouterAdapter.executeDirectGenerateContent: Invalid prompt/messages');
    }

    // 4. 调用实例方法生成内容
    return await adapter.generateContent(messages, options?.characterId);
  }
}
