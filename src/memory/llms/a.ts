import { LLM, LLMResponse } from './base';
import { LLMConfig, Message } from '../types';
import { getApiSettings } from '@/utils/settings-helper';

/**
 * 适用于移动端的 LLM 实现
 * 集成 openrouter-adapter 和 gemini-adapter 的功能
 */
export class MobileLLM implements LLM {
  private apiKey: string = '';
  private model: string = '';
  private provider: 'gemini' | 'openrouter' | 'openai-compatible' = 'gemini';
  private llmAdapter: any = null; // 兼容已有适配器
  private apiProvider: string = 'gemini';
  private openrouterConfig: any = {};
  private openaiCompatibleConfig: any = {};
  private openaiCompatibleEndpoint: string = '';
  private pendingInitialization: Promise<void> | null = null;
  private lastConfig: LLMConfig | null = null;
  
  constructor(config: LLMConfig) {
    // 保存原始配置参考
    this.lastConfig = {...config};
    this.updateConfig(config);
  }

  /**
   * 更新LLM配置
   * 可用于动态更新API密钥和模型设置
   * @param config LLM配置
   */
  public updateConfig(config: LLMConfig): void {
    // 验证输入配置
    if (!config) {
      console.error('[MobileLLM] 更新配置失败: 配置对象为空');
      return;
    }
    
    // 保存原始API密钥，用于记录和比较
    const originalApiKey = this.apiKey;
    const originalProvider = this.apiProvider;
    
    // 确保新的API密钥有效
    const newApiKey = config.apiKey || this.apiKey || '';
    if (!newApiKey) {
      console.warn('[MobileLLM] 检测到尝试将API密钥设置为空，当前状态:', {
        原密钥长度: originalApiKey.length,
        新密钥长度: 0,
        lastConfigKeyLength: this.lastConfig?.apiKey?.length || 0
      });
      
      // 如果有上一个有效密钥，使用它
      if (this.lastConfig?.apiKey) {
        console.warn('[MobileLLM] 恢复使用上一个有效密钥');
        config.apiKey = this.lastConfig.apiKey;
      }
    }
    
    // 更新配置，确保apiKey有值
    this.apiKey = config.apiKey || '';
    this.apiProvider = config.apiProvider || 'gemini';
    this.provider = this.apiProvider === 'openrouter' ? 'openrouter' : this.apiProvider === 'openai-compatible' ? 'openai-compatible' : 'gemini';
    
    // 检查 openai-compatible 渠道
    if (config.apiProvider === 'openai-compatible') {
      this.provider = 'openai-compatible';
      this.apiProvider = 'openai-compatible';
      this.model = config.OpenAIcompatible?.model || 'gpt-3.5-turbo';
      this.apiKey = config.OpenAIcompatible?.apiKey || '';
      this.openaiCompatibleEndpoint = config.OpenAIcompatible?.endpoint || '';
      this.openaiCompatibleConfig = config.OpenAIcompatible || {};
    } else if (this.apiProvider === 'openrouter') {
      this.model = config.openrouter?.model || 'openai/gpt-3.5-turbo';
      this.openrouterConfig = config.openrouter || {};
    } else {
      this.model = 'gemini-2.0-flash-exp'; // Gemini默认模型
    }
    
    // 如果有有效的API密钥，保存配置引用
    if (this.apiKey) {
      this.lastConfig = {...config};
    }
    
    // 打印详细的配置变更信息
    const apiKeyChanged = originalApiKey !== this.apiKey;
    const providerChanged = originalProvider !== this.apiProvider;
    
    console.log(`[MobileLLM] 配置已更新:`, {
      apiProvider: this.apiProvider,
      model: this.model,
      apiKeyStatus: this.apiKey ? '已设置' : '未设置',
      apiKeyLength: this.apiKey?.length || 0,
      apiKeyChanged: apiKeyChanged ? '是' : '否',
      providerChanged: providerChanged ? '是' : '否',
    });
    
    // 只有当API密钥或提供商变更时才重置适配器
    if (apiKeyChanged || providerChanged) {
      console.log('[MobileLLM] API密钥或提供商已变更，重置适配器');
      this.llmAdapter = null;
      
      // 如果有API密钥，尝试立即初始化适配器
      if (this.apiKey) {
        this.pendingInitialization = this.initializeAdapter().catch(err => {
          console.warn(`[MobileLLM] 初始化适配器失败: ${err.message}`);
          this.pendingInitialization = null;
        });
      } else {
        console.warn('[MobileLLM] 无法初始化适配器：API密钥为空');
        this.pendingInitialization = null;
      }
    } else {
      console.log('[MobileLLM] API密钥和提供商未变更，跳过适配器重置');
    }
  }

  /**
   * 初始化适配器
   */
  private async initializeAdapter(): Promise<void> {
    if (!this.apiKey) {
      console.warn('[MobileLLM] 无法初始化适配器: API密钥为空');
      return;
    }
    
    // 保存一份用于初始化的密钥副本，防止在初始化过程中被修改
    const initApiKey = this.apiKey;
    const initModel = this.model;
    const initProvider = this.provider;
    
    try {
      console.log(`[MobileLLM] 开始初始化${initProvider}适配器，密钥长度: ${initApiKey.length}`);
      
      if (initProvider === 'openrouter') {
        try {
          const { OpenRouterAdapter } = require('@/NodeST/nodest/utils/openrouter-adapter');
          this.llmAdapter = new OpenRouterAdapter(
            initApiKey, 
            initModel
          );
          console.log('[MobileLLM] OpenRouterAdapter 初始化成功');
        } catch (error) {
          console.log('[MobileLLM] 同步初始化失败，尝试异步导入');
          const { OpenRouterAdapter } = await import('@/NodeST/nodest/utils/openrouter-adapter');
          this.llmAdapter = new OpenRouterAdapter(
            initApiKey, 
            initModel
          );
          console.log('[MobileLLM] OpenRouterAdapter 异步初始化成功');
        }
      } else if (initProvider === 'openai-compatible') {
        try {
          const { OpenAIAdapter } = require('@/NodeST/nodest/utils/openai-adapter');
          this.llmAdapter = new OpenAIAdapter({
            endpoint: this.openaiCompatibleEndpoint,
            apiKey: this.apiKey,
            model: this.model
          });
          console.log('[MobileLLM] OpenAIAdapter 初始化成功');
        } catch (error) {
          console.log('[MobileLLM] OpenAIAdapter 同步初始化失败，尝试异步导入');
          const { OpenAIAdapter } = await import('@/NodeST/nodest/utils/openai-adapter');
          this.llmAdapter = new OpenAIAdapter({
            endpoint: this.openaiCompatibleEndpoint,
            apiKey: this.apiKey,
            model: this.model
          });
          console.log('[MobileLLM] OpenAIAdapter 异步初始化成功');
        }
      } else {
        try {
          const { GeminiAdapter } = require('@/NodeST/nodest/utils/gemini-adapter');
          this.llmAdapter = new GeminiAdapter(initApiKey);
          console.log('[MobileLLM] GeminiAdapter 初始化成功');
        } catch (error) {
          console.log('[MobileLLM] 同步初始化失败，尝试异步导入');
          const { GeminiAdapter } = await import('@/NodeST/nodest/utils/gemini-adapter');
          this.llmAdapter = new GeminiAdapter(initApiKey);
          console.log('[MobileLLM] GeminiAdapter 异步初始化成功');
        }
      }
    } catch (error) {
      console.error(`[MobileLLM] 初始化适配器失败:`, error);
      throw error;
    }
  }

  /**
   * 确保适配器已初始化
   */
  private async ensureAdapter(): Promise<void> {
    // 如果有正在进行的初始化，等待它完成
    if (this.pendingInitialization) {
      await this.pendingInitialization;
      this.pendingInitialization = null;
    }
    
    // 检查API密钥
    if (!this.apiKey) {
      // 尝试使用上一个配置中的API密钥
      if (this.lastConfig?.apiKey) {
        console.warn('[MobileLLM] 当前API密钥为空，恢复使用上一个有效密钥');
        this.apiKey = this.lastConfig.apiKey;
      } else {
        // 尝试从存储中获取API密钥
        const apiKey = await this.getApiKeyFromStorage();
        if (apiKey) {
          console.log('[MobileLLM] 从存储中获取到API密钥');
          this.apiKey = apiKey;
        } else {
          console.error('[MobileLLM] API密钥为空，无法使用LLM服务');
          throw new Error('API key cannot be empty');
        }
      }
    }
    
    // 如果适配器未初始化，尝试初始化
    if (!this.llmAdapter) {
      console.log('[MobileLLM] 适配器未初始化，正在初始化...');
      await this.initializeAdapter();
      
      if (!this.llmAdapter) {
        throw new Error(`无法初始化 ${this.provider} 适配器`);
      }
    }
  }

  /**
   * 从存储中获取API密钥
   */
  private async getApiKeyFromStorage(): Promise<string | null> {
    try {
      // 使用settings-helper获取API设置
      const apiSettings = getApiSettings();
      
      if (apiSettings) {
        // 优先 openai-compatible
        if (
          apiSettings.apiProvider === 'openai-compatible' &&
          apiSettings.OpenAIcompatible?.enabled &&
          apiSettings.OpenAIcompatible?.apiKey
        ) {
          this.apiProvider = 'openai-compatible';
          this.provider = 'openai-compatible';
          this.model = apiSettings.OpenAIcompatible.model || 'gpt-3.5-turbo';
          this.openaiCompatibleConfig = apiSettings.OpenAIcompatible;
          this.openaiCompatibleEndpoint = apiSettings.OpenAIcompatible.endpoint || '';
          return apiSettings.OpenAIcompatible.apiKey;
        } else if (apiSettings.apiProvider === 'openrouter' && 
            apiSettings.openrouter?.enabled && 
            apiSettings.openrouter?.apiKey) {
          
          this.apiProvider = 'openrouter';
          this.provider = 'openrouter';
          this.model = apiSettings.openrouter.model || 'openai/gpt-3.5-turbo';
          this.openrouterConfig = apiSettings.openrouter;
          return apiSettings.openrouter.apiKey;
          
        } else if (apiSettings.apiKey) {
          this.apiProvider = 'gemini';
          this.provider = 'gemini';
          this.model = 'gemini-2.0-flash-exp';
          return apiSettings.apiKey;
        }
      }
      
      console.log('[MobileLLM] 未从settings-helper获取到API密钥，尝试从本地存储获取');
      
      // 从localStorage获取（作为备选方案）
      if (typeof localStorage !== 'undefined') {
        const settings = localStorage.getItem('user_settings');
        if (settings) {
          const parsedSettings = JSON.parse(settings);
          const provider = parsedSettings?.chat?.apiProvider || 'gemini';
          
          if (
            provider === 'openai-compatible' &&
            parsedSettings?.chat?.OpenAIcompatible?.apiKey
          ) {
            this.apiProvider = 'openai-compatible';
            this.provider = 'openai-compatible';
            this.model = parsedSettings.chat.OpenAIcompatible.model || 'gpt-3.5-turbo';
            this.openaiCompatibleConfig = parsedSettings.chat.OpenAIcompatible;
            this.openaiCompatibleEndpoint = parsedSettings.chat.OpenAIcompatible.endpoint || '';
            return parsedSettings.chat.OpenAIcompatible.apiKey;
          } else if (provider === 'openrouter' && parsedSettings?.chat?.openrouter?.apiKey) {
            this.apiProvider = 'openrouter';
            this.provider = 'openrouter';
            this.model = parsedSettings.chat.openrouter.model || 'openai/gpt-3.5-turbo';
            this.openrouterConfig = parsedSettings.chat.openrouter;
            return parsedSettings.chat.openrouter.apiKey;
          } else if (parsedSettings?.chat?.characterApiKey) {
            this.apiProvider = 'gemini';
            this.provider = 'gemini';
            this.model = 'gemini-2.0-flash-exp';
            return parsedSettings.chat.characterApiKey;
          }
        }
      }
      
      // 从AsyncStorage获取（作为备选方案）
      if (typeof require !== 'undefined') {
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          const settings = await AsyncStorage.getItem('user_settings');
          if (settings) {
            const parsedSettings = JSON.parse(settings);
            const provider = parsedSettings?.chat?.apiProvider || 'gemini';
            
            if (
              provider === 'openai-compatible' &&
              parsedSettings?.chat?.OpenAIcompatible?.apiKey
            ) {
              this.apiProvider = 'openai-compatible';
              this.provider = 'openai-compatible';
              this.model = parsedSettings.chat.OpenAIcompatible.model || 'gpt-3.5-turbo';
              this.openaiCompatibleConfig = parsedSettings.chat.OpenAIcompatible;
              this.openaiCompatibleEndpoint = parsedSettings.chat.OpenAIcompatible.endpoint || '';
              return parsedSettings.chat.OpenAIcompatible.apiKey;
            } else if (provider === 'openrouter' && parsedSettings?.chat?.openrouter?.apiKey) {
              this.apiProvider = 'openrouter';
              this.provider = 'openrouter';
              this.model = parsedSettings.chat.openrouter.model || 'openai/gpt-3.5-turbo';
              this.openrouterConfig = parsedSettings.chat.openrouter;
              return parsedSettings.chat.openrouter.apiKey;
            } else if (parsedSettings?.chat?.characterApiKey) {
              this.apiProvider = 'gemini';
              this.provider = 'gemini';
              this.model = 'gemini-2.0-flash-exp';
              return parsedSettings.chat.characterApiKey;
            }
          }
        } catch (e) {
          console.log('[MobileLLM] 从AsyncStorage获取失败:', e);
        }
      }
    } catch (error) {
      console.error('[MobileLLM] 尝试从存储获取API密钥失败:', error);
    }
    
    return null;
  }

  /**
   * 将消息格式转换为适配器需要的格式
   */
  private formatMessages(messages: Message[]): any[] {
    if (this.provider === 'gemini') {
      // Gemini 格式
      return messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        parts: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }]
      }));
    } else if (this.provider === 'openai-compatible') {
      // OpenAI 格式
      return messages.map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : msg.content
      }));
    } else {
      // OpenRouter 格式
      return messages.map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      }));
    }
  }

  /**
   * 生成响应
   * @param messages 消息数组
   * @param responseFormat 响应格式配置
   * @param tools 可用工具
   * @returns 生成的响应文本或结构化响应
   */
  async generateResponse(
    messages: Message[],
    responseFormat?: { type: string },
    tools?: any[]
  ): Promise<string | LLMResponse> {
    try {
      await this.ensureAdapter();
      
      // 如果是 JSON 格式响应，添加格式化提示
      if (responseFormat?.type === 'json_object') {
        const lastMessage = messages[messages.length - 1];
        const enhancedContent = typeof lastMessage.content === 'string'
          ? `${lastMessage.content}\n请以有效的JSON格式响应。`
          : lastMessage.content;
        
        messages = [
          ...messages.slice(0, -1),
          { ...lastMessage, content: enhancedContent }
        ];
      }
      
      // 转换消息格式
      const formattedMessages = this.formatMessages(messages);
      
      console.log(`[MobileLLM] 开始生成内容，提供商: ${this.provider}，模型: ${this.model}，消息数: ${messages.length}`);
      
      // 使用适配器生成内容
      const response = await this.llmAdapter.generateContent(formattedMessages);
      console.log(`[MobileLLM] 成功生成内容，响应长度: ${typeof response === 'string' ? response.length : 'unknown'}`);
      
      // 如果使用了工具调用，解析响应
      if (tools && tools.length > 0 && typeof response === 'string' && response.includes('"name"') && response.includes('"arguments"')) {
        try {
          const responseObj = JSON.parse(response);
          if (responseObj.tool_calls || responseObj.toolCalls) {
            const toolCalls = responseObj.tool_calls || responseObj.toolCalls;
            return {
              content: responseObj.content || '',
              role: 'assistant',
              toolCalls: toolCalls.map((call: any) => ({
                name: call.function?.name || call.name,
                arguments: call.function?.arguments || call.arguments
              }))
            };
          }
        } catch (e) {
          console.warn('解析工具调用失败，返回原始响应:', e);
        }
      }
      
      return response;
    } catch (error) {
      console.error('生成 LLM 响应失败:', error);
      throw error;
    }
  }

  /**
   * 生成聊天响应
   * @param messages 消息数组
   * @returns 生成的聊天响应
   */
  async generateChat(messages: Message[]): Promise<LLMResponse> {
    try {
      await this.ensureAdapter();
      
      const formattedMessages = this.formatMessages(messages);
      const response = await this.llmAdapter.generateContent(formattedMessages);
      
      return {
        content: typeof response === 'string' ? response : response.content || '',
        role: 'assistant'
      };
    } catch (error) {
      console.error('生成聊天响应失败:', error);
      throw error;
    }
  }
}
