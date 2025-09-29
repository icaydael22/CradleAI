import { ScriptService } from './script-service';
import { ScriptVariableService } from './variables/ScriptVariableService';
import { Manifest, AIAction, VariableAction } from '@/shared/types/script-types';

export class IframeActionService {
  private static instance: IframeActionService;
  private scriptService = ScriptService.getInstance();

  public static getInstance(): IframeActionService {
    if (!IframeActionService.instance) {
      IframeActionService.instance = new IframeActionService();
    }
    return IframeActionService.instance;
  }

  /**
   * 处理来自 Iframe 的动作请求
   * @param scriptId 当前剧本 ID
   * @param actionName 动作名称
   * @param payload Iframe 传递的负载数据
   * @returns 处理结果
   */
  public async handleAction(scriptId: string, actionName: string, payload: any): Promise<any> {
    const script = await this.scriptService.getScript(scriptId);
    if (!script?.manifest) {
      throw new Error(`Script or manifest not found for scriptId: ${scriptId}`);
    }

    const action = script.manifest.actions.find(a => a.actionName === actionName);
    if (!action) {
      throw new Error(`Action "${actionName}" not defined in manifest.`);
    }

    switch (action.type) {
      case 'ai':
        return this.handleAIAction(scriptId, action, payload);
      case 'variable':
        return this.handleVariableAction(scriptId, action, payload);
      default:
        throw new Error(`Unknown action type: ${(action as any).type}`);
    }
  }

  /**
   * 处理 AI 类型的动作
   */
  private async handleAIAction(scriptId: string, action: AIAction, payload: any): Promise<any> {
    console.log(`[IframeActionService] Handling AI action: ${action.actionName}`);
    
    // 1. 获取剧本变量管理器实例
    const variableManager = await ScriptVariableService.getInstance(scriptId);

    // 2. 将 payload 注入为临时变量，以便在 prompt 中使用
    // 例如，如果 payload 是 { characterName: '司澈' }
    // 那么 prompt 中的 ${characterName} 就可以被替换
    if (payload && typeof payload === 'object') {
      for (const key in payload) {
        // 注册为临时变量
        await variableManager.registerVar(key, 'string', payload[key]);
      }
    }

    // 3. 对 prompt 进行宏替换
    const finalPrompt = await variableManager.replaceGlobalMacros(action.prompt);
    console.log(`[IframeActionService] Final prompt after macro replacement: ${finalPrompt}`);

    // 4. 调用 AI 服务 (此处为伪代码，需替换为真实实现)
    // const aiResponse = await YourAIService.generateJson(finalPrompt, action.responseSchema);
    // return aiResponse;

    // 模拟 AI 返回
    return { success: true, prompt: finalPrompt, message: "AI call simulation successful." };
  }

  /**
   * 处理变量查询类型的动作
   */
  private async handleVariableAction(scriptId: string, action: VariableAction, payload: any): Promise<any> {
    console.log(`[IframeActionService] Handling variable action: ${action.actionName}`);
    
    const { target, path } = action.query;
    const variableManager = await ScriptVariableService.getInstance(scriptId);

    const system = target === 'global' 
      ? await variableManager.getGlobalVariables()
      : await variableManager.getCharacterVariables(target);

    if (!system) {
      throw new Error(`Variable system for target "${target}" not found.`);
    }

    // 使用点号路径从变量系统中查找数据
    const pathParts = path.split('.');
    let result: any = system;
    for (const part of pathParts) {
      if (result && typeof result === 'object' && part in result) {
        result = result[part];
      } else {
        // 如果路径中途断了，返回 null
        return null;
      }
    }
    
    return result;
  }
}