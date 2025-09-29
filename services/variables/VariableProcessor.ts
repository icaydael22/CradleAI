/**
 * 变量处理器
 * 负责处理AI响应中的变量操作命令，提供清理后的文本和操作日志
 */

import { ScriptVariableService } from './ScriptVariableService';

export interface VariableProcessingResult {
  cleanText: string;
  logs: string[];
  hasVariableOperations: boolean;
}

export class VariableProcessor {
  /**
   * 处理AI响应，解析并执行变量操作命令
   * @param scriptId 剧本ID
   * @param aiResponseText AI响应的原始文本
   * @returns 处理结果，包含清理后的文本和操作日志
   */
  static async processAIResponse(scriptId: string, aiResponseText: string): Promise<VariableProcessingResult> {
    try {
      // 获取剧本的变量管理器
      const variableManager = await ScriptVariableService.getInstance(scriptId);
      
      // 检查是否包含变量操作命令
      const hasVariableOperations = this.hasVariableCommands(aiResponseText);
      
      if (!hasVariableOperations) {
        // 如果没有变量操作，只进行宏替换
        const replacedText = await variableManager.replaceGlobalMacros(aiResponseText);
        return {
          cleanText: replacedText,
          logs: [],
          hasVariableOperations: false
        };
      }
      
      // 先处理注册类命令（registerVar/registerTable/registerHiddenVar等），
      // 这些会把变量或表格注册到系统中，以便后续的 setVar 等命令能生效并产生日志。
      let remainingText = aiResponseText;
      const allLogs: string[] = [];
      let registerChanged = false;
      
      try {
        const registerResult = await variableManager.parseRegisterCommands(aiResponseText);
        remainingText = registerResult.cleanText;
        allLogs.push(...registerResult.logs);
        registerChanged = registerResult.changed;
        
        if (registerResult.errors && registerResult.errors.length > 0) {
          console.warn(`📊 剧本 ${scriptId} 注册命令中出现错误:`, registerResult.errors);
          allLogs.push(...registerResult.errors.map(err => `❌ 注册错误: ${err}`));
        }
      } catch (regErr) {
        // 非致命：如果解析注册命令失败，我们仍然继续处理剩余命令
        const errorMsg = `处理注册命令失败: ${regErr instanceof Error ? regErr.message : '未知错误'}`;
        console.warn(errorMsg);
        allLogs.push(`⚠️ ${errorMsg}`);
      }

      // 解析其余变量操作命令（setVar/addTableRow/...）
      const parseResult = await variableManager.parseCommands(remainingText);
      allLogs.push(...parseResult.logs);

      // 检查是否有错误
      if (parseResult.errors && parseResult.errors.length > 0) {
        console.warn(`📊 剧本 ${scriptId} 变量操作中出现错误:`, parseResult.errors);
        allLogs.push(...parseResult.errors.map(err => `❌ 操作错误: ${err}`));
      }

      // 对清理后的文本进行宏替换
      const finalText = await variableManager.replaceGlobalMacros(parseResult.cleanText);
      
      // 记录操作日志
      if (allLogs.length > 0) {
        console.log(`📊 剧本 ${scriptId} 变量操作日志:`);
        allLogs.forEach(log => console.log(`  ${log}`));
      }
      
      return {
        cleanText: finalText,
        logs: allLogs,
        hasVariableOperations: parseResult.changed || registerChanged || hasVariableOperations
      };
    } catch (error) {
      console.error(`处理剧本 ${scriptId} 的AI响应失败:`, error);
      
      // 出错时返回原始文本
      return {
        cleanText: aiResponseText,
        logs: [`❌ 变量处理出错: ${error instanceof Error ? error.message : '未知错误'}`],
        hasVariableOperations: false
      };
    }
  }

  /**
   * 仅进行宏替换，不执行变量操作命令
   * @param scriptId 剧本ID
   * @param text 要处理的文本
   * @returns 宏替换后的文本
   */
  static async replaceMacrosOnly(scriptId: string, text: string): Promise<string> {
    try {
      const variableManager = await ScriptVariableService.getInstance(scriptId);
      return await variableManager.replaceGlobalMacros(text);
    } catch (error) {
      console.error(`为剧本 ${scriptId} 替换宏失败:`, error);
      return text;
    }
  }

  /**
   * 获取剧本的变量状态（用于调试）
   * @param scriptId 剧本ID
   * @returns 变量系统状态
   */
  static async getVariableState(scriptId: string): Promise<any> {
    try {
      const variableManager = await ScriptVariableService.getInstance(scriptId);
      const globalVars = await variableManager.getGlobalVariables();
      
      return {
        variables: globalVars.variables,
        tables: globalVars.tables,
        hiddenVariables: globalVars.hiddenVariables,
        scriptId
      };
    } catch (error) {
      console.error(`获取剧本 ${scriptId} 变量状态失败:`, error);
      return null;
    }
  }

  /**
   * 导出剧本的变量配置
   * @param scriptId 剧本ID
   * @returns 变量配置JSON字符串
   */
  static async exportVariableConfig(scriptId: string): Promise<string | null> {
    try {
      const state = await this.getVariableState(scriptId);
      if (state) {
        return JSON.stringify(state, null, 2);
      }
      return null;
    } catch (error) {
      console.error(`导出剧本 ${scriptId} 变量配置失败:`, error);
      return null;
    }
  }

  /**
   * 检查文本是否包含变量操作命令
   * @param text 要检查的文本
   * @returns 是否包含变量操作命令
   */
  private static hasVariableCommands(text: string): boolean {
    const variableCommandPatterns = [
      /<setVar>/,
      /<registerVar\s/,
      /<registerVars>/,
      /<unregisterVar\s/,
      /<unregisterVars>/,
      /<registerTable\s/,
      /<unregisterTable\s/,
      /<registerHiddenVar\s/,
      /<unregisterHiddenVar\s/,
      /<setTable\s/,
      /<addTableRow\s/,
      /<removeTableRow\s/,
      /<setHiddenVar\s/
    ];
    
    return variableCommandPatterns.some(pattern => pattern.test(text));
  }

  /**
   * 预览变量操作（不实际执行）
   * @param scriptId 剧本ID
   * @param text 包含变量操作的文本
   * @returns 预览结果
   */
  static async previewVariableOperations(scriptId: string, text: string): Promise<{
    hasOperations: boolean;
    operations: string[];
    cleanText: string;
  }> {
    try {
      const hasOperations = this.hasVariableCommands(text);
      
      if (!hasOperations) {
        const replacedText = await this.replaceMacrosOnly(scriptId, text);
        return {
          hasOperations: false,
          operations: [],
          cleanText: replacedText
        };
      }

      // 提取操作命令（不执行）
      const operations = this.extractVariableOperations(text);
      
      // 移除命令标签但不执行
      const cleanText = this.removeVariableCommandTags(text);
      const replacedText = await this.replaceMacrosOnly(scriptId, cleanText);
      
      return {
        hasOperations: true,
        operations,
        cleanText: replacedText
      };
    } catch (error) {
      console.error(`预览剧本 ${scriptId} 变量操作失败:`, error);
      return {
        hasOperations: false,
        operations: [],
        cleanText: text
      };
    }
  }

  /**
   * 提取变量操作命令（用于预览）
   */
  private static extractVariableOperations(text: string): string[] {
    const operations: string[] = [];
    const patterns = [
      /<setVar>(.*?)<\/setVar>/g,
      /<registerVar[^>]*\/>/g,
      /<registerVars>(.*?)<\/registerVars>/g,
      /<unregisterVar[^>]*\/>/g,
      /<unregisterVars>(.*?)<\/unregisterVars>/g,
      /<registerTable[^>]*\/>/g,
      /<unregisterTable[^>]*\/>/g,
      /<registerHiddenVar[^>]*>(.*?)<\/registerHiddenVar>/g,
      /<unregisterHiddenVar[^>]*\/>/g,
      /<setTable[^>]*>(.*?)<\/setTable>/g,
      /<addTableRow[^>]*>(.*?)<\/addTableRow>/g,
      /<removeTableRow[^>]*><\/removeTableRow>/g,
      /<setHiddenVar[^>]*>(.*?)<\/setHiddenVar>/g
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        operations.push(match[0]);
      }
    }

    return operations;
  }

  /**
   * 移除变量操作命令标签
   */
  private static removeVariableCommandTags(text: string): string {
    const patterns = [
      /<setVar>.*?<\/setVar>/g,
      /<registerVar[^>]*\/>/g,
      /<registerVars>.*?<\/registerVars>/g,
      /<unregisterVar[^>]*\/>/g,
      /<unregisterVars>.*?<\/unregisterVars>/g,
      /<registerTable[^>]*\/>/g,
      /<unregisterTable[^>]*\/>/g,
      /<registerHiddenVar[^>]*>.*?<\/registerHiddenVar>/g,
      /<unregisterHiddenVar[^>]*\/>/g,
      /<setTable[^>]*>.*?<\/setTable>/g,
      /<addTableRow[^>]*>.*?<\/addTableRow>/g,
      /<removeTableRow[^>]*><\/removeTableRow>/g,
      /<setHiddenVar[^>]*>.*?<\/setHiddenVar>/g
    ];

    let result = text;
    for (const pattern of patterns) {
      result = result.replace(pattern, '');
    }

    return result;
  }
}
