 /**
 * 剧本变量系统服务
 * 负责管理所有剧本的变量实例，为每个剧本提供独立的变量管理器
 */

import { VariableManager } from './core/VariableManager';
import { VariableSystemConfig } from './variable-types';
import { ScriptService } from '../script-service';

export class ScriptVariableService {
  private static instances: Map<string, VariableManager> = new Map();
  private static scriptService = ScriptService.getInstance();

  /**
   * 获取指定剧本的变量管理器实例
   * @param scriptId 剧本ID
   * @returns 变量管理器实例
   */
  static async getInstance(scriptId: string): Promise<VariableManager> {
    // 检查是否已有实例
    if (this.instances.has(scriptId)) {
      return this.instances.get(scriptId)!;
    }

  // 创建新实例（传入 scriptId，使 VariableManager 能生成基于 scriptId 的动态占位符）
  const variableManager = new VariableManager(undefined, scriptId);
    
    try {
      // 获取剧本数据
      const script = await this.scriptService.getScript(scriptId);
      
      if (script && script.variableConfig) {
        // 使用剧本的变量配置初始化
        await variableManager.initGlobal(script.variableConfig);
        console.log(`📋 剧本 ${scriptId} 的变量系统已初始化`);
      } else {
        // 使用默认配置初始化
        await variableManager.initGlobal();
        console.log(`📋 剧本 ${scriptId} 使用默认变量系统配置`);
      }

      // 自动注册剧本相关的系统宏
      await this.registerSystemMacros(variableManager, scriptId);

      // 缓存实例
      this.instances.set(scriptId, variableManager);
      
      return variableManager;
    } catch (error) {
      console.error(`初始化剧本 ${scriptId} 的变量系统失败:`, error);
      
      // 出错时创建一个基础实例
      await variableManager.initGlobal();
      this.instances.set(scriptId, variableManager);
      
      return variableManager;
    }
  }

  /**
   * 清除指定剧本的变量管理器实例（用于重新初始化）
   * @param scriptId 剧本ID
   */
  static clearInstance(scriptId: string): void {
    this.instances.delete(scriptId);
    console.log(`🗑️ 已清除剧本 ${scriptId} 的变量管理器实例`);
  }

  /**
   * 清除所有变量管理器实例
   */
  static clearAllInstances(): void {
    this.instances.clear();
    console.log('🗑️ 已清除所有剧本的变量管理器实例');
  }

  /**
   * 获取当前所有已初始化的剧本ID列表
   */
  static getInitializedScriptIds(): string[] {
    return Array.from(this.instances.keys());
  }

  /**
   * 更新指定剧本的变量配置
   * @param scriptId 剧本ID
   * @param variableConfig 新的变量配置
   */
  static async updateScriptVariableConfig(scriptId: string, variableConfig: VariableSystemConfig): Promise<boolean> {
    try {
      // 更新剧本数据中的变量配置
      const script = await this.scriptService.getScript(scriptId);
      if (!script) {
        throw new Error('剧本不存在');
      }

      script.variableConfig = variableConfig;
      script.updatedAt = Date.now();
      await this.scriptService.saveScript(script);

      // 清除并重新初始化变量管理器
      this.clearInstance(scriptId);
      await this.getInstance(scriptId);

      console.log(`✅ 剧本 ${scriptId} 的变量配置已更新`);
      return true;
    } catch (error) {
      console.error(`更新剧本 ${scriptId} 的变量配置失败:`, error);
      return false;
    }
  }

  /**
   * 检查指定剧本是否已初始化变量系统
   * @param scriptId 剧本ID
   */
  static isInitialized(scriptId: string): boolean {
    return this.instances.has(scriptId);
  }

  /**
   * 为指定剧本添加角色变量系统
   * @param scriptId 剧本ID
   * @param characterId 角色ID
   * @param config 角色变量配置（可选）
   */
  static async initCharacterForScript(scriptId: string, characterId: string, config?: VariableSystemConfig): Promise<boolean> {
    try {
      const variableManager = await this.getInstance(scriptId);
      const success = await variableManager.initCharacter(characterId, config);
      
      if (success) {
        console.log(`👤 为剧本 ${scriptId} 初始化角色 ${characterId} 的变量系统`);
      }
      
      return success;
    } catch (error) {
      console.error(`为剧本 ${scriptId} 初始化角色 ${characterId} 的变量系统失败:`, error);
      return false;
    }
  }

  /**
   * 自动注册剧本相关的系统宏
   * @param variableManager 变量管理器实例
   * @param scriptId 剧本ID
   */
  private static async registerSystemMacros(variableManager: VariableManager, scriptId: string): Promise<void> {
    try {
      const systemMacrosRegisterCommand = `
        <registerVars>
          <var name="scriptSummary" type="string" initVal="剧本摘要待生成" />
          <var name="privateSummary" type="string" initVal="私聊摘要待生成" />
          <var name="guidanceCurrentChat" type="string" initVal="当前聊天指导待设置" />
          <var name="guidanceCurrentScript" type="string" initVal="当前剧本指导待设置" />
          <var name="scriptHistoryRecent" type="string" initVal="暂无剧本历史" />
          <var name="characterChatRecent" type="string" initVal="暂无聊天历史" />
        </registerVars>
      `;

      const result = await variableManager.registerGlobalVariables(systemMacrosRegisterCommand);
      
      if (result) {
        console.log(`✅ 剧本 ${scriptId} 的系统宏已自动注册:`);
        console.log('   - ${scriptSummary}: 剧本摘要');
        console.log('   - ${privateSummary}: 私聊摘要');
        console.log('   - ${guidanceCurrentChat}: 当前聊天指导');
        console.log('   - ${guidanceCurrentScript}: 当前剧本指导');
        console.log('   - ${scriptHistoryRecent}: 最近剧本历史');
        console.log('   - ${characterChatRecent}: 最近角色聊天历史');
      } else {
        console.warn(`⚠️ 剧本 ${scriptId} 的系统宏注册可能存在问题`);
      }
    } catch (error) {
      console.error(`❌ 剧本 ${scriptId} 的系统宏注册失败:`, error);
      // 不抛出错误，确保不影响实例创建
    }
  }
}
