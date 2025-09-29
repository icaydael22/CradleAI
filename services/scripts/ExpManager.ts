/**
 * 体验管理器 (ExpManager)
 * 
 * 在剧本生成后，通过额外的AI调用来执行变量系统操作，
 * 增强用户的剧本体验。
 */

import { ScriptVariableService } from '@/services/variables/ScriptVariableService';
import { ScriptService } from '@/services/script-service';
import { unifiedGenerateContent } from '../unified-api';
import { buildExpPrompt, validateExpPromptParams, type ExpPromptParams } from './exp-prompt';

// 定义统一API类型（从unified-api.ts复制而来，因为未导出）
type UnifiedMessage = 
  | { role: string; content: string } // OpenAI/OpenRouter
  | { role: string; parts: { text: string }[] }; // Gemini

interface UnifiedApiOptions {
  adapter?: 'gemini' | 'openai-compatible' | 'openrouter' | 'cradlecloud';
  apiKey?: string;
  modelId?: string;
  characterId?: string;
  openaiConfig?: any;
  openrouterConfig?: any;
  geminiConfig?: any;
}

export interface ExpManagerOptions {
  /** 用户名称 */
  userName?: string;
  /** 最后一次用户消息 */
  lastUserMessage?: string;
  /** 剧本上下文信息 */
  scriptContext?: string;
  /** 角色信息 */
  characterInfo?: string;
  /** 使用OpenAI消息格式而非纯文本提示 */
  useMessages?: boolean;
  /** 统一API选项 */
  unifiedApiOptions?: UnifiedApiOptions;
}

export interface ExpManagerResult {
  /** AI原始响应 */
  rawResponse: string;
  /** 清理后的文本内容 */
  cleanedText: string;
  /** 变量操作日志 */
  variableLogs: string[];
  /** 是否成功执行 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
}

export class ExpManager {
  private static instance: ExpManager;

  private constructor() {}

  /**
   * 获取ExpManager单例实例
   */
  public static getInstance(): ExpManager {
    if (!ExpManager.instance) {
      ExpManager.instance = new ExpManager();
    }
    return ExpManager.instance;
  }

  /**
   * 运行体验管理流程
   * 
   * @param scriptId 剧本ID
   * @param lastAiResponse 上一次AI响应内容
   * @param options 选项参数
   * @returns 体验管理结果
   */
  async runExperience(
    scriptId: string,
    lastAiResponse: string,
    options: ExpManagerOptions = {}
  ): Promise<ExpManagerResult> {
    console.log(`🎭 [ExpManager] 开始为剧本 ${scriptId} 运行体验管理流程`);

    try {
      // 1. 获取剧本的变量管理器实例
      console.log(`📋 [ExpManager] 获取剧本 ${scriptId} 的变量管理器实例`);
      const variableManager = await ScriptVariableService.getInstance(scriptId);

      // 2. 获取剧本数据，包括variablePrompt配置
      const script = await ScriptService.getInstance().getScript(scriptId);
      let variablePrompt: Array<{ role: string; content: string }> | undefined;
      
      if (script?.styleConfig?.variablePrompt) {
        // 如果是消息数组格式，直接使用
        if (Array.isArray(script.styleConfig.variablePrompt)) {
          variablePrompt = script.styleConfig.variablePrompt;
        }
      }

  // 3. 获取系统宏变量的值（仅对非动态宏立即取值；动态宏保留占位符以便后续 replaceGlobalMacros 解析）
  console.log(`🔄 [ExpManager] 获取系统宏变量值 (延迟解析动态宏)`);
  const scriptSummary = variableManager.getVariableValue('scriptSummary') || '剧本摘要待生成';
  const privateSummary = variableManager.getVariableValue('privateSummary') || '私聊摘要待生成';
  const guidanceCurrentChat = variableManager.getVariableValue('guidanceCurrentChat') || '当前聊天指导待设置';
  const guidanceCurrentScript = variableManager.getVariableValue('guidanceCurrentScript') || '当前剧本指导待设置';
  const toDoList = variableManager.getVariableValue('ToDoList') || '';
  // 动态宏：使用 ${scriptHistoryRecent} 让 replaceGlobalMacros -> replaceMacrosAsync -> DynamicMacroResolver 处理
  const scriptHistoryRecent = '${scriptHistoryRecent}';
  const characterChatRecent = '${characterChatRecent}';

      // 4. 验证输入参数
      const promptParams: ExpPromptParams = {
        scriptId,
        userName: options.userName || '用户',
        lastUserMessage: options.lastUserMessage || '',
        lastAiResponse,
        scriptContext: options.scriptContext,
        characterInfo: options.characterInfo,
        variablePrompt,
        scriptSummary,
        privateSummary,
        guidanceCurrentChat,
        guidanceCurrentScript,
        scriptHistoryRecent,
        characterChatRecent,
        ToDoList: toDoList
      };

      const validation = validateExpPromptParams(promptParams);
      if (!validation.valid) {
        const errorMsg = `参数验证失败: ${validation.errors.join(', ')}`;
        console.error(`❌ [ExpManager] ${errorMsg}`);
        return {
          rawResponse: '',
          cleanedText: '',
          variableLogs: [],
          success: false,
          error: errorMsg
        };
      }

      // 5. 构建AI提示并进行宏替换
      console.log(`🔄 [ExpManager] 构建AI提示并执行宏替换`);
      const rawPromptMessages = buildExpPrompt(promptParams);
      
      // 对消息数组中的每个消息内容进行宏替换
      const processedMessages: Array<{ role: string; content: string }> = [];
      for (const message of rawPromptMessages) {
        const processedContent = await variableManager.replaceGlobalMacros(message.content);
        processedMessages.push({
          role: message.role,
          content: processedContent
        });
      }

      console.log(`🚀 [ExpManager] 发送AI请求以生成体验管理内容`);

      // 6. 调用统一API生成AI响应（传入消息数组）
      const aiResponse = await this.callUnifiedApi(processedMessages, options.unifiedApiOptions);
      
      console.log(`✅ [ExpManager] 收到AI响应，长度: ${aiResponse.length} 字符`);

      // 7. 使用变量管理器解析AI响应中的XML变量操作命令
      console.log(`🔧 [ExpManager] 解析并执行变量操作命令`);
      const parseResult = await variableManager.parseCommands(aiResponse);

      console.log(`🎯 [ExpManager] 变量操作完成，执行了 ${parseResult.logs.length} 个操作`);

      // 8. 返回结果
      return {
        rawResponse: aiResponse,
        cleanedText: parseResult.cleanText,
        variableLogs: parseResult.logs,
        success: true
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      console.error(`❌ [ExpManager] 体验管理流程失败:`, error);
      
      return {
        rawResponse: '',
        cleanedText: '',
        variableLogs: [],
        success: false,
        error: errorMsg
      };
    }
  }

  /**
   * 为特定角色运行体验管理流程
   * 
   * @param scriptId 剧本ID
   * @param characterId 角色ID
   * @param lastAiResponse 上一次AI响应内容
   * @param options 选项参数
   * @returns 体验管理结果
   */
  async runCharacterExperience(
    scriptId: string,
    characterId: string,
    lastAiResponse: string,
    options: ExpManagerOptions = {}
  ): Promise<ExpManagerResult> {
    console.log(`🎭 [ExpManager] 开始为剧本 ${scriptId} 角色 ${characterId} 运行体验管理流程`);

    try {
      // 1. 获取剧本的变量管理器实例
      console.log(`📋 [ExpManager] 获取剧本 ${scriptId} 的变量管理器实例`);
      const variableManager = await ScriptVariableService.getInstance(scriptId);

      // 2. 获取剧本数据，包括variablePrompt配置
      const script = await ScriptService.getInstance().getScript(scriptId);
      let variablePrompt: Array<{ role: string; content: string }> | undefined;
      
      if (script?.styleConfig?.variablePrompt) {
        // 如果是消息数组格式，直接使用
        if (Array.isArray(script.styleConfig.variablePrompt)) {
          variablePrompt = script.styleConfig.variablePrompt;
        }
      }

      // 3. 获取系统宏变量的值（全局）
      console.log(`🔄 [ExpManager] 获取系统宏变量值`);
  const scriptSummary = variableManager.getVariableValue('scriptSummary') || '剧本摘要待生成';
  const privateSummary = variableManager.getVariableValue('privateSummary') || '私聊摘要待生成';
  const guidanceCurrentChat = variableManager.getVariableValue('guidanceCurrentChat') || '当前聊天指导待设置';
  const guidanceCurrentScript = variableManager.getVariableValue('guidanceCurrentScript') || '当前剧本指导待设置';
  // 动态宏占位符（脚本与角色作用域）
  const scriptHistoryRecent = '${scriptHistoryRecent}';
  // 带角色ID的动态宏（如果解析器支持参数：characterChatRecent:characterId:count）可改成 ${characterChatRecent:${characterId}}，目前保持基础形式
  const characterChatRecent = '${characterChatRecent}';

      // 5. 验证输入参数
      const promptParams: ExpPromptParams = {
        scriptId,
        userName: options.userName || '用户',
        lastUserMessage: options.lastUserMessage || '',
        lastAiResponse,
        scriptContext: options.scriptContext,
        characterInfo: options.characterInfo || `角色ID: ${characterId}`,
        variablePrompt,
        scriptSummary,
        privateSummary,
        guidanceCurrentChat,
        guidanceCurrentScript,
        scriptHistoryRecent,
        characterChatRecent
      };

      const validation = validateExpPromptParams(promptParams);
      if (!validation.valid) {
        const errorMsg = `参数验证失败: ${validation.errors.join(', ')}`;
        console.error(`❌ [ExpManager] ${errorMsg}`);
        return {
          rawResponse: '',
          cleanedText: '',
          variableLogs: [],
          success: false,
          error: errorMsg
        };
      }

  // 6. 构建AI提示并执行全局宏替换（而非角色局部），确保系统宏生效
  console.log(`🔄 [ExpManager] 构建AI提示并执行全局宏替换(角色体验也使用全局系统宏)`);
  const rawPromptMessages = buildExpPrompt(promptParams);
  
  // 对消息数组中的每个消息内容进行宏替换
  const processedMessages: Array<{ role: string; content: string }> = [];
  for (const message of rawPromptMessages) {
    const processedContent = await variableManager.replaceGlobalMacros(message.content);
    processedMessages.push({
      role: message.role,
      content: processedContent
    });
  }

      console.log(`🚀 [ExpManager] 发送AI请求以生成角色体验管理内容`);

      // 7. 调用统一API生成AI响应（传入消息数组）
      const aiResponse = await this.callUnifiedApi(processedMessages, options.unifiedApiOptions);
      
      console.log(`✅ [ExpManager] 收到AI响应，长度: ${aiResponse.length} 字符`);

  // 8. 使用变量管理器解析AI响应中的XML变量操作命令（全局解析，允许系统宏被更新）
  console.log(`🔧 [ExpManager] 解析并执行全局变量操作命令 (角色体验)`);
  const parseResult = await variableManager.parseCommands(aiResponse);

  console.log(`🎯 [ExpManager] 全局变量操作完成（角色体验上下文），执行了 ${parseResult.logs.length} 个操作`);

      // 9. 返回结果
      return {
        rawResponse: aiResponse,
        cleanedText: parseResult.cleanText,
        variableLogs: parseResult.logs,
        success: true
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      console.error(`❌ [ExpManager] 角色体验管理流程失败:`, error);
      
      return {
        rawResponse: '',
        cleanedText: '',
        variableLogs: [],
        success: false,
        error: errorMsg
      };
    }
  }

  /**
   * 调用统一API生成内容
   * 
   * @param content 提示内容（字符串或消息数组）
   * @param apiOptions 统一API选项
   * @returns AI响应文本
   */
  private async callUnifiedApi(
    content: string | UnifiedMessage[],
    apiOptions?: UnifiedApiOptions
  ): Promise<string> {
    try {
      let messages: UnifiedMessage[];

      if (typeof content === 'string') {
        // 纯文本提示转换为消息格式
        messages = [{ role: 'user', content }];
      } else {
        // 已经是消息数组格式
        messages = content;
      }

      // 调用统一API
      const response = await unifiedGenerateContent(messages, apiOptions || {});
      
      return response;

    } catch (error) {
      console.error(`❌ [ExpManager] 统一API调用失败:`, error);
      throw new Error(`统一API调用失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 检查ExpManager是否可用
   * 
   * @param scriptId 剧本ID
   * @returns 是否可用及状态信息
   */
  async checkAvailability(scriptId: string): Promise<{
    available: boolean;
    variableManagerReady: boolean;
    error?: string;
  }> {
    try {
      // 检查变量管理器是否可用
      const variableManager = await ScriptVariableService.getInstance(scriptId);
      const variableManagerReady = !!variableManager;

      return {
        available: variableManagerReady,
        variableManagerReady
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      console.error(`❌ [ExpManager] 可用性检查失败:`, error);
      
      return {
        available: false,
        variableManagerReady: false,
        error: errorMsg
      };
    }
  }

  /**
   * 获取ExpManager的状态信息
   */
  getStatus(): {
    version: string;
    initialized: boolean;
    supportedFeatures: string[];
  } {
    return {
      version: '1.0.0',
      initialized: true,
      supportedFeatures: [
        'global-variable-operations',
        'character-variable-operations', 
        'macro-replacement',
        'xml-command-parsing',
        'unified-api-integration'
      ]
    };
  }
}
