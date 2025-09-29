import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';
import { Script, ScriptMessage, ScriptResponse, ScriptEvent, ScriptCharacterInteraction, ScriptStyleConfig, ScriptStyleConfigFile, ScriptStyleConfigArchiveStructure, ScriptPage, ScriptRenderData, ExpManagerConfig, ScriptSummary, SummaryOperationResult, Manifest } from '@/shared/types/script-types';
import { RoleCardJson } from '@/shared/types';
import { VariableSystemConfig } from '@/services/variables/variable-types';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import JSZip from 'jszip';
import { NodeSTCore } from '@/NodeST/nodest/core/node-st-core';
import { ScriptVariableService } from '@/services/variables/ScriptVariableService';
import { MemoryService } from '@/services/memory-service';
import { VariableProcessor } from '@/services/variables/VariableProcessor';

/**
 * 剧本管理服务
 */
export class ScriptService {
  private static instance: ScriptService;

  public static getInstance(): ScriptService {
    if (!ScriptService.instance) {
      ScriptService.instance = new ScriptService();
    }
    return ScriptService.instance;
  }

  /**
   * 保存剧本数据
   */
  async saveScript(script: Script): Promise<void> {
    await StorageAdapter.saveJson(`script_${script.id}`, script);
    
    // 更新剧本列表
    const existingScripts = await this.getAllScriptIds();
    if (!existingScripts.includes(script.id)) {
      await StorageAdapter.saveJson('script_list', [...existingScripts, script.id]);
    }
  }

  /**
   * 获取剧本数据
   */
  async getScript(scriptId: string): Promise<Script | null> {
    return await StorageAdapter.loadJson<Script>(`script_${scriptId}`);
  }

  /**
   * 获取所有剧本ID列表
   */
  async getAllScriptIds(): Promise<string[]> {
    return await StorageAdapter.loadJson<string[]>('script_list') || [];
  }

  /**
   * 获取所有剧本数据
   */
  async getAllScripts(): Promise<Script[]> {
    const scriptIds = await this.getAllScriptIds();
    const scripts: Script[] = [];
    
    for (const scriptId of scriptIds) {
      const script = await this.getScript(scriptId);
      if (script) {
        scripts.push(script);
      }
    }
    
    return scripts.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * 删除剧本
   */
  async deleteScript(scriptId: string): Promise<void> {
    console.log(`🗑️ 开始删除剧本: ${scriptId}`);
    
    try {
      // 删除剧本相关的所有数据
      await StorageAdapter.deleteScriptData(scriptId);
      
      // 从剧本列表中移除
      const scriptIds = await this.getAllScriptIds();
      const updatedIds = scriptIds.filter(id => id !== scriptId);
      await StorageAdapter.saveJson('script_list', updatedIds);
      
      console.log(`✅ 剧本删除完成: ${scriptId}`);
    } catch (error) {
      console.error(`❌ 删除剧本失败: ${scriptId}`, error);
      throw error;
    }
  }

  /**
   * 导出剧本数据
   */
  async exportScript(scriptId: string): Promise<any> {
    return await StorageAdapter.exportScriptData(scriptId);
  }
  /**
   * 使用NodeSTCore构建剧本的完整消息数组（OpenAI兼容格式）
   */
  async buildScriptMessages(scriptId: string, userInput?: string): Promise<any[]> {
    const script = await this.getScript(scriptId);
    if (!script) {
      throw new Error('剧本不存在');
    }

    // 构建变量插值部分作为chatHistoryEntity
    const variablePrompt = await this.buildVariablePrompt(script);
    
    // 获取预设配置（从样式配置或默认配置）
    let presetJson = await this.getOutputRequirements(script);

    // 进行变量系统宏替换
    let processedVariablePrompt = variablePrompt;
    try {
      const variableManager = await ScriptVariableService.getInstance(scriptId);
      
      // 如果 variablePrompt 是消息数组，分别处理每个消息的内容
      if (Array.isArray(processedVariablePrompt)) {
        processedVariablePrompt = await Promise.all(
          processedVariablePrompt.map(async (msg: any) => ({
            ...msg,
            content: await variableManager.replaceGlobalMacros(msg.content)
          }))
        );
      } else {
        processedVariablePrompt = await variableManager.replaceGlobalMacros(variablePrompt as string);
      }
      console.log(`📝 剧本 ${scriptId} 的变量prompt已完成宏替换`);
    } catch (error) {
      console.warn(`剧本 ${scriptId} 宏替换失败，使用原始prompt:`, error);
    }

    // 进行固有宏替换（独立于变量系统）
    const userName = script.userName || '用户';
    const lastUserMessage = userInput || '';
    
    // 如果 processedVariablePrompt 是消息数组，分别处理每个消息的内容
    if (Array.isArray(processedVariablePrompt)) {
      processedVariablePrompt = await Promise.all(
        processedVariablePrompt.map(async (msg: any) => ({
          ...msg,
          content: await this.replaceBuiltinMacrosAsync(msg.content, userName, lastUserMessage, script.id)
        }))
      );
    } else {
      processedVariablePrompt = await this.replaceBuiltinMacrosAsync(processedVariablePrompt as string, userName, lastUserMessage, script.id);
    }
    
    // 🆕 对预设配置也使用占位符系统
    if (typeof presetJson === 'string') {
      presetJson = await this.replaceBuiltinMacrosAsync(presetJson, userName, lastUserMessage, script.id);
    } else if (typeof presetJson === 'object' && presetJson !== null) {
      // 递归替换对象中的宏
      presetJson = await this.replaceMacrosInObjectAsync(presetJson, userName, lastUserMessage, script.id);
    }

    // 处理消息数组格式的 variablePrompt
    let inputText: string;
    if (Array.isArray(processedVariablePrompt)) {
      console.log(`📝 [剧本 ${scriptId}] 处理消息数组格式的 variablePrompt，长度: ${processedVariablePrompt.length}`);
      console.log(`📝 [剧本 ${scriptId}] 消息数组详情:`, processedVariablePrompt.map((msg, idx) => ({
        index: idx,
        role: msg.role,
        contentLength: typeof msg.content === 'string' ? msg.content.length : 0,
        contentPreview: typeof msg.content === 'string' ? msg.content.substring(0, 100) + '...' : msg.content
      })));
      
      // 将消息数组转换为特殊格式，让 buildRFrameworkWithChatHistory 能够识别
      inputText = JSON.stringify({ _isMessageArray: true, messages: processedVariablePrompt });
      console.log(`📝 [剧本 ${scriptId}] 转换后的 inputText 长度: ${inputText.length}`);
      console.log(`📝 [剧本 ${scriptId}] 转换后的 inputText 开头: ${inputText.substring(0, 200)}...`);
    } else {
      console.log(`📝 [剧本 ${scriptId}] 处理字符串格式的 variablePrompt，长度: ${typeof processedVariablePrompt === 'string' ? processedVariablePrompt.length : 0}`);
      // 如果有用户输入，添加到变量prompt末尾
      inputText = processedVariablePrompt as string;
      if (userInput) {
        inputText += '\n\n用户输入: ' + userInput;
      }
    }

    // 🆕 对于文件导入的剧本，如果配置标记为文件导入且没有有效的outputRequirements，则使用特殊处理逻辑
    const isFileImport = (script.styleConfig as any)?.isFileImport;
    if (isFileImport) {
      console.log(`📁 [剧本 ${scriptId}] 检测到文件导入剧本`);
      
      // 检查presetJson是否为有效的JSON对象或完整配置
      const hasValidOutputRequirements = typeof presetJson === 'object' || 
        (typeof presetJson === 'string' && presetJson !== 'Script content from file import' && presetJson.length > 50);
      
      if (!hasValidOutputRequirements) {
        console.log(`📁 [剧本 ${scriptId}] 没有有效的outputRequirements，返回特殊格式等待WebView处理`);
        // 对于文件导入，返回特殊消息格式，让React Native知道需要等待WebView的outputRequirements
        return [
          {
            role: 'system',
            content: 'File import script - waiting for outputRequirements from WebView'
          }, 
          {
            role: 'user', 
            content: inputText,
            _isFileImportVariablePrompt: true,
            _originalVariablePrompt: processedVariablePrompt,
            _userInput: userInput
          }
        ];
      } else {
        console.log(`📁 [剧本 ${scriptId}] 已有有效的outputRequirements，继续正常处理`);
      }
    }
    // 使用NodeSTCore构建消息数组（适用于完整配置的剧本）
    try {
      // 🔥 关键修复：将消息数组和配置转换为NodeST规范格式
      console.log(`📝 [剧本 ${scriptId}] 开始转换为NodeST规范格式`);
      
      // 1. 处理inputText：将消息数组格式转换为NodeST期望的字符串格式
      let nodeSTInputText: string;
      if (Array.isArray(processedVariablePrompt)) {
        // 如果原始variablePrompt是消息数组，直接以特殊JSON包装传递给NodeSTCore
        // 避免将消息数组拼接为带换行的字符串，导致NodeSTCore按换行拆分消息内容
        console.log(`📝 [剧本 ${scriptId}] 以消息数组包装形式传递给NodeSTCore，避免按换行拆分`);
        const wrapper: any = { _isMessageArray: true, messages: processedVariablePrompt.map((msg: any) => ({
          role: msg.role || 'user',
          content: typeof msg.content === 'string' ? msg.content : String(msg.content)
        })) };

        // 如果有用户输入，作为一条新的 user 消息追加到数组末尾
        if (userInput) {
          wrapper.messages.push({ role: 'user', content: userInput });
        }

        nodeSTInputText = JSON.stringify(wrapper);
      } else {
        // 字符串格式，压缩为单行
        nodeSTInputText = (processedVariablePrompt as string).replace(/\r?\n/g, ' \\n ');
        if (userInput) {
          nodeSTInputText += ` 用户输入: ${userInput}`;
        }
      }
      
      console.log(`📝 [剧本 ${scriptId}] NodeST输入文本长度: ${nodeSTInputText.length}`);
      console.log(`📝 [剧本 ${scriptId}] NodeST输入文本预览: ${nodeSTInputText.substring(0, 200)}...`);
      
      // 2. 处理presetJson：确保是NodeST规范的配置格式
      let nodeSTPresetStr: string;
      
      if (typeof presetJson === 'object' && presetJson !== null) {
        // 如果是对象且包含NodeST规范的字段，直接序列化
        if (Array.isArray(presetJson.prompts) && Array.isArray(presetJson.prompt_order)) {
          console.log(`📝 [剧本 ${scriptId}] 检测到NodeST规范配置格式`);
          nodeSTPresetStr = JSON.stringify(presetJson);
        } else {
          console.log(`📝 [剧本 ${scriptId}] 对象格式但非NodeST规范，转换为简单指令格式`);
          // 将对象内容转换为指令
          const instruction = typeof presetJson === 'object' ? 
            `请根据以下要求生成回复：${JSON.stringify(presetJson)}` : 
            String(presetJson);
          
          nodeSTPresetStr = JSON.stringify({
            prompts: [
              {
                identifier: 'systemInstruction',
                name: '系统指令',
                role: 'system',
                content: instruction
              },
              {
                identifier: 'chatHistory',
                name: '对话历史',
                role: 'user',
                content: '{{CHAT_HISTORY}}' // 占位符，会被NodeST替换
              }
            ],
            prompt_order: [
              {
                character_id: 'default',
                order: [
                  { identifier: 'systemInstruction', enabled: true },
                  { identifier: 'chatHistory', enabled: true }
                ]
              }
            ]
          });
        }
      } else if (typeof presetJson === 'string') {
        // 字符串格式，检查是否为有效的NodeST JSON
        try {
          const parsed = JSON.parse(presetJson);
          if (Array.isArray(parsed.prompts) && Array.isArray(parsed.prompt_order)) {
            console.log(`📝 [剧本 ${scriptId}] 字符串包含有效的NodeST配置`);
            nodeSTPresetStr = presetJson;
          } else {
            throw new Error('Not NodeST format');
          }
        } catch {
          console.log(`📝 [剧本 ${scriptId}] 字符串非NodeST格式，转换为标准配置`);
          // 包装为NodeST规范格式
          nodeSTPresetStr = JSON.stringify({
            prompts: [
              {
                identifier: 'systemInstruction',
                name: '系统指令',
                role: 'system',
                content: presetJson
              },
              {
                identifier: 'chatHistory',
                name: '对话历史',
                role: 'user',
                content: '{{CHAT_HISTORY}}' // 占位符，会被NodeST替换
              }
            ],
            prompt_order: [
              {
                character_id: 'default',
                order: [
                  { identifier: 'systemInstruction', enabled: true },
                  { identifier: 'chatHistory', enabled: true }
                ]
              }
            ]
          });
        }
      } else {
        console.warn(`📝 [剧本 ${scriptId}] 未知的presetJson格式，使用默认配置`);
        nodeSTPresetStr = JSON.stringify({
          prompts: [
            {
              identifier: 'chatHistory',
              name: '对话历史',
              role: 'user',
              content: '{{CHAT_HISTORY}}'
            }
          ],
          prompt_order: [
            {
              character_id: 'default',
              order: [
                { identifier: 'chatHistory', enabled: true }
              ]
            }
          ]
        });
      }
      
      console.log(`📝 [剧本 ${scriptId}] NodeST配置字符串长度: ${nodeSTPresetStr.length}`);
      console.log(`📝 [剧本 ${scriptId}] 调用NodeSTCore.buildRFrameworkWithChatHistory`);
      
      // 3. 调用NodeSTCore
      const messages = await NodeSTCore.buildRFrameworkWithChatHistory(
        nodeSTInputText,
        nodeSTPresetStr,
        'openai-compatible' // 使用OpenAI兼容格式
      );
      
      console.log(`📝 剧本 ${scriptId} 的消息数组构建完成，共 ${messages.length} 条消息`);
      
      // 🆕 4. 在发送API前处理所有占位符，将其转换为最终内容和assistant消息对象
      const finalMessages = await this.processAllPlaceholders(messages);
      
      console.log(`📝 剧本 ${scriptId} 的最终消息数组完成，共 ${finalMessages.length} 条消息`);
      return finalMessages;
    } catch (error) {
      console.error(`剧本 ${scriptId} 消息数组构建失败:`, error);
      throw new Error(`构建剧本消息失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 构建变量插值部分
   */
  private async buildVariablePrompt(script: Script): Promise<string | any[]> {
    console.log(`📝 [剧本 ${script.id}] 开始构建变量插值部分`);
    console.log(`📝 [剧本 ${script.id}] script.styleConfig 存在:`, !!script.styleConfig);
    console.log(`📝 [剧本 ${script.id}] script.styleConfig.variablePrompt 存在:`, !!script.styleConfig?.variablePrompt);
    console.log(`📝 [剧本 ${script.id}] script.styleConfig.variablePrompt 类型:`, typeof script.styleConfig?.variablePrompt);
    
    if (script.styleConfig?.variablePrompt) {
      console.log(`📝 [剧本 ${script.id}] script.styleConfig.variablePrompt 内容预览:`, 
        Array.isArray(script.styleConfig.variablePrompt) 
          ? `[消息数组, 长度: ${script.styleConfig.variablePrompt.length}]`
          : typeof script.styleConfig.variablePrompt === 'string'
            ? script.styleConfig.variablePrompt.substring(0, 100) + '...'
            : script.styleConfig.variablePrompt
      );
    }
    
    // 检查是否有自定义的 variablePrompt 配置
    if (script.styleConfig?.variablePrompt) {
      let customPrompt = script.styleConfig.variablePrompt;
      
      // 如果是消息数组格式，直接返回（后续会进行宏替换）
      if (Array.isArray(customPrompt)) {
        console.log(`📝 [剧本 ${script.id}] 使用自定义消息数组 variablePrompt，长度: ${customPrompt.length}`);
        console.log(`📝 [剧本 ${script.id}] 消息数组内容:`, customPrompt.map((msg, idx) => ({
          index: idx,
          role: msg.role,
          contentPreview: typeof msg.content === 'string' ? msg.content.substring(0, 50) + '...' : msg.content
        })));
        return customPrompt;
      }
      
      // 如果是字符串，进行剧本历史宏替换
      if (typeof customPrompt === 'string') {
        console.log(`📝 [剧本 ${script.id}] 使用自定义字符串 variablePrompt`);
        return await this.replaceScriptHistoryMacros(customPrompt, script.id);
      }
    }
    
    console.log(`📝 [剧本 ${script.id}] 回退到默认变量插值逻辑`);
    // 回退到默认的变量插值逻辑
    let variablePrompt = '## 默认的变量插值\n\n';
    
    // 获取剧本历史上下文
    variablePrompt += '### 剧本历史上下文\n\n';
    try {
      const history = await this.getScriptHistory(script.id);
      const recentHistory = history.slice(-3); // 获取最近3条历史
      
      if (recentHistory.length > 0) {
        for (const [index, message] of recentHistory.entries()) {
          variablePrompt += `**历史片段 ${index + 1}:**\n`;
          
          // 🔥 关键修复：直接使用原始AI响应内容，不进行HTML转义
          // 优先使用 _processedResponse，如果没有则使用 _rawResponse
          let rawContent = '';
          if (message.aiResponse._processedResponse) {
            rawContent = message.aiResponse._processedResponse;
          } else if (message.aiResponse._rawResponse) {
            rawContent = message.aiResponse._rawResponse;
          } else {
            // 如果都没有，才回退到提取剧情内容
            rawContent = this.extractPlotContent(message.aiResponse) || '';
          }
          
          if (rawContent.trim()) {
            variablePrompt += rawContent.trim() + '\n\n';
          } else {
            variablePrompt += '（此片段无可用内容）\n\n';
          }
        }
      } else {
        variablePrompt += '暂无剧本历史。\n\n';
      }
    } catch (error) {
      console.warn('获取剧本历史失败:', error);
      variablePrompt += '暂无剧本历史。\n\n';
    }

    // 获取当前剧本变量
    variablePrompt += '### 当前剧本变量\n\n';
    try {
      const variableManager = await ScriptVariableService.getInstance(script.id);
      
      // 获取全局变量系统
      const globalSystem = await variableManager.getGlobalVariables();
      
      // 普通变量
      variablePrompt += '#### 普通变量：\n';
      if (globalSystem.variables && Object.keys(globalSystem.variables).length > 0) {
        for (const [name, variable] of Object.entries(globalSystem.variables)) {
          if (!variable.isConditional) {
            variablePrompt += `- ${name}: ${variable.value} (${variable.type})\n`;
          }
        }
      } else {
        variablePrompt += '暂无普通变量。\n';
      }
      variablePrompt += '\n';

      // 条件变量
      variablePrompt += '#### 条件变量：\n';
      const conditionalVars = Object.entries(globalSystem.variables || {})
        .filter(([_, variable]) => variable.isConditional);
      if (conditionalVars.length > 0) {
        for (const [name, variable] of conditionalVars) {
          variablePrompt += `- ${name}: ${variable.value}`;
          if (variable.branches && variable.branches.length > 0) {
            variablePrompt += ` (条件分支: ${variable.branches.length}个)`;
          }
          variablePrompt += '\n';
        }
      } else {
        variablePrompt += '暂无条件变量。\n';
      }
      variablePrompt += '\n';

      // 表格数据
      variablePrompt += '#### 表格数据：\n';
      if (globalSystem.tables && Object.keys(globalSystem.tables).length > 0) {
        for (const [tableName, table] of Object.entries(globalSystem.tables)) {
          variablePrompt += `**表格: ${tableName}**\n`;
          if (table.rows && table.rows.length > 0) {
            table.rows.forEach((row: any, index: number) => {
              const rowData = Object.entries(row).map(([key, value]) => `${key}=${value}`).join(', ');
              variablePrompt += `  行${index}: ${rowData}\n`;
            });
          } else {
            variablePrompt += '  无数据行\n';
          }
        }
      } else {
        variablePrompt += '暂无表格数据。\n';
      }
      variablePrompt += '\n';

      // 隐藏变量
      variablePrompt += '#### 隐藏变量：\n';
      if (globalSystem.hiddenVariables && Object.keys(globalSystem.hiddenVariables).length > 0) {
        for (const [name, hiddenVar] of Object.entries(globalSystem.hiddenVariables)) {
          variablePrompt += `- ${name}: [条件: ${hiddenVar.condition}]`;
          if (hiddenVar.hasExpiration) {
            variablePrompt += ` (有期限)`;
          }
          variablePrompt += '\n';
        }
      } else {
        variablePrompt += '暂无隐藏变量。\n';
      }
      variablePrompt += '\n';

    } catch (error) {
      console.warn('获取剧本变量失败:', error);
      variablePrompt += '#### 普通变量：\n暂无变量数据。\n\n';
      variablePrompt += '#### 条件变量：\n暂无变量数据。\n\n';
      variablePrompt += '#### 表格数据：\n暂无变量数据。\n\n';
      variablePrompt += '#### 隐藏变量：\n暂无变量数据。\n\n';
    }
    
    // 获取角色聊天记录
    variablePrompt += '### 角色私聊上下文\n\n';
    for (const characterId of script.selectedCharacters) {
      const messageCount = script.contextMessageCount[characterId] || 10;
      const recentMessages = await StorageAdapter.getRecentMessages(characterId, messageCount);
      
      variablePrompt += `**角色ID: ${characterId}**\n`;
      variablePrompt += `最近${messageCount}条消息:\n`;
      
      recentMessages.forEach((message, index) => {
        const role = message.role === 'user' ? '用户' : 'AI';
        const content = message.parts?.[0]?.text || '';
        variablePrompt += `${index + 1}. [${role}] ${content}\n`;
      });
      variablePrompt += '\n';
    }
    
    // 获取角色卡数据
    variablePrompt += '### 角色卡信息\n\n';
    for (const characterId of script.selectedCharacters) {
      const roleCard = await StorageAdapter.loadJson<RoleCardJson | null>(
        StorageAdapter.getStorageKey(characterId, '_role')
      );
      
      if (roleCard) {
        variablePrompt += `**角色ID: ${characterId}**\n`;
        variablePrompt += `角色名: ${roleCard.name || '未知'}\n`;
        variablePrompt += `描述: ${roleCard.description || '无'}\n`;
        variablePrompt += `性格: ${roleCard.personality || '无'}\n`;
        variablePrompt += `场景: ${roleCard.scenario || '无'}\n`;
        variablePrompt += '\n';
      }
    }
    
    return variablePrompt;
  }

  /**
   * 替换剧本历史宏 {{scripthistory.x}}、{{scriptsummary.x}}、{{scriptfullhistory.x}}
   * 新机制：标记宏位置，稍后在消息数组中插入assistant消息对象
   */
  private async replaceScriptHistoryMacros(text: string, scriptId: string): Promise<string> {
    // 匹配多种宏格式
    const historyMacroRegex = /\{\{script(history|summary|fullhistory)\.(\d+)\}\}/g;
    let result = text;
    
    const matches = Array.from(text.matchAll(historyMacroRegex));
    if (matches.length === 0) {
      return result;
    }
    
    try {
      const allHistory = await this.getScriptHistory(scriptId);
      
      // 分离总结消息和普通消息
      const summaryMessages = allHistory.filter(msg => msg.aiResponse._isMemorySummary);
      const regularMessages = allHistory.filter(msg => !msg.aiResponse._isMemorySummary);
      
      for (const match of matches) {
        const macroType = match[1]; // 'history', 'summary', 'fullhistory'
        const count = parseInt(match[2], 10);
        const macro = match[0];
        
        let targetMessages: any[] = [];
        
        switch (macroType) {
          case 'history':
            // 只返回普通历史消息（非总结）
            targetMessages = regularMessages.slice(-count);
            break;
            
          case 'summary':
            // 只返回总结消息
            targetMessages = summaryMessages.slice(-count);
            break;
            
          case 'fullhistory':
            // 返回完整历史（按时间顺序，包含总结和普通消息）
            targetMessages = allHistory
              .sort((a, b) => a.timestamp - b.timestamp)
              .slice(-count);
            break;
        }
        
        // 创建特殊标记，包含历史消息数据，稍后在消息数组构建时替换
        const placeholderData = {
          type: 'scripthistory_placeholder',
          macroType: macroType,
          count: count,
          messages: targetMessages.map(message => {
            // 获取AI响应内容
            let content = '';
            if (message.aiResponse._processedResponse) {
              content = message.aiResponse._processedResponse;
            } else if (message.aiResponse._rawResponse) {
              content = message.aiResponse._rawResponse;
            } else {
              content = this.extractPlotContent(message.aiResponse) || '';
            }
            return {
              content: content.trim(),
              isMemorySummary: message.aiResponse._isMemorySummary || false
            };
          })
        };
        
        // 直接将剧本历史数据以编码的JSON数组形式插入占位符，方便之后解析为多条assistant消息
        try {
          const historyContents = placeholderData.messages.map(m => m.content);
          const encoded = encodeURIComponent(JSON.stringify(historyContents));
          const bracketPlaceholder = `[SCRIPT_HISTORY_PLACEHOLDER:${encoded}]`;
          result = result.replace(macro, bracketPlaceholder);
        } catch (e) {
          // 回退到原始宏文本以避免破坏内容
          console.warn('编码剧本历史占位符失败，保留原始宏:', e);
          // 保持原始宏不变
          result = result.replace(macro, macro);
        }
      }
    } catch (error) {
      console.warn('替换剧本历史宏失败:', error);
      // 替换为错误提示
      for (const match of matches) {
        const macroType = match[1];
        const errorMsg = macroType === 'summary' ? '获取总结失败' : '获取剧本历史失败';
        result = result.replace(match[0], errorMsg);
      }
    }
    
    return result;
  }

  /**
   * 处理所有占位符（剧本历史、用户宏、最后用户消息宏），将其转换为最终内容
   */
  async processAllPlaceholders(messages: any[]): Promise<any[]> {
    const processedMessages: any[] = [];
    
    for (const message of messages) {
      if (typeof message.content === 'string') {
        let processedContent = message.content;
        
        // 🆕 1. 处理用户宏占位符
        processedContent = processedContent.replace(/\[USER_PLACEHOLDER:(.+?)\]/g, (match: string, encodedUser: string) => {
          try {
            return decodeURIComponent(encodedUser);
          } catch (error) {
            console.error('[ScriptService] 解析用户宏数据失败:', error);
            return match; // 保留原始占位符
          }
        });
        
        // 🆕 2. 处理最后用户消息宏占位符
        processedContent = processedContent.replace(/\[LAST_USER_MESSAGE_PLACEHOLDER:(.+?)\]/g, (match: string, encodedMessage: string) => {
          try {
            return decodeURIComponent(encodedMessage);
          } catch (error) {
            console.error('[ScriptService] 解析最后用户消息宏数据失败:', error);
            return match; // 保留原始占位符
          }
        });
        
        // 🆕 3. 处理资源宏占位符（异步获取资源）
        // 收集所有需要处理的资源占位符
        const resourcePlaceholders = [
          { regex: /\[RESOURCES_SPRITES_PLACEHOLDER:(.+?)\]/g, type: 'sprites' },
          { regex: /\[RESOURCES_BACKGROUNDS_PLACEHOLDER:(.+?)\]/g, type: 'backgrounds' },
          { regex: /\[RESOURCES_EFFECTS_PLACEHOLDER:(.+?)\]/g, type: 'effects' },
          { regex: /\[RESOURCES_SOUNDEFFECTS_PLACEHOLDER:(.+?)\]/g, type: 'soundEffects' }
        ];
        
        for (const { regex, type } of resourcePlaceholders) {
          let match;
          regex.lastIndex = 0; // 重置正则状态
          
          while ((match = regex.exec(processedContent)) !== null) {
            try {
              const scriptId = decodeURIComponent(match[1]);
              const resources = await this.getResourcesForScript(scriptId);
              const resourceList = resources[type as keyof typeof resources];
              const resourceString = resourceList.length > 0 ? resourceList.join('，') : '';
              
              // 替换占位符
              processedContent = processedContent.replace(match[0], resourceString);
              
              // 重置正则状态，因为字符串已改变
              regex.lastIndex = 0;
            } catch (error) {
              console.error(`[ScriptService] 处理资源${type}宏失败:`, error);
              // 保留原始占位符
              break;
            }
          }
        }
        
        // 🆕 4. 处理剧本历史占位符（需要创建多个assistant消息）
        // 兼容旧版实现：把HTML注释格式的占位符转换为新的方括号占位符
        const legacyCommentRegex = /<!--\s*(__SCRIPTHISTORY_PLACEHOLDER_[^:]+):(.+?)\s*-->/g;
        try {
          processedContent = processedContent.replace(legacyCommentRegex, (_match: string, _key: string, jsonStr: string) => {
            try {
              const parsed = JSON.parse(jsonStr);
              const historyContents = (parsed.messages || []).map((m: any) => m.content);
              return `[SCRIPT_HISTORY_PLACEHOLDER:${encodeURIComponent(JSON.stringify(historyContents))}]`;
            } catch (e) {
              return _match;
            }
          });
        } catch (e) {
          // ignore
        }

        const scriptHistoryRegex = /\[SCRIPT_HISTORY_PLACEHOLDER:(.+?)\]/g;
        let match;
        let lastIndex = 0;
        let hasScriptHistoryPlaceholders = false;
        
        while ((match = scriptHistoryRegex.exec(processedContent)) !== null) {
          hasScriptHistoryPlaceholders = true;
          
          // 添加占位符前的内容
          if (match.index > lastIndex) {
            const beforeContent = processedContent.slice(lastIndex, match.index);
            if (beforeContent.trim()) {
              processedMessages.push({
                ...message,
                content: beforeContent
              });
            }
          }
          
          // 解析并添加历史消息
          try {
            const historyData = JSON.parse(decodeURIComponent(match[1]));
            for (const historyItem of historyData) {
              processedMessages.push({
                role: 'assistant',
                content: historyItem
              });
            }
          } catch (error) {
            console.error('[ScriptService] 解析剧本历史数据失败:', error);
            // 如果解析失败，保留原始占位符
            processedMessages.push({
              ...message,
              content: match[0]
            });
          }
          
          lastIndex = match.index + match[0].length;
        }
        
        if (hasScriptHistoryPlaceholders) {
          // 添加占位符后的内容
          if (lastIndex < processedContent.length) {
            const afterContent = processedContent.slice(lastIndex);
            if (afterContent.trim()) {
              processedMessages.push({
                ...message,
                content: afterContent
              });
            }
          }
        } else {
          // 没有剧本历史占位符，但可能有其他占位符已被处理
          processedMessages.push({
            ...message,
            content: processedContent
          });
        }
      } else {
        // 非字符串内容，直接添加
        processedMessages.push(message);
      }
    }
    
    return processedMessages;
  }

  /**
   * 异步替换内置宏（包括剧本历史宏）
   */
  private async replaceBuiltinMacrosAsync(text: string, userName: string, lastUserMessage: string, scriptId: string): Promise<string> {
    // 🆕 创建基础宏占位符（延迟到API前处理）
    let result = text
      .replace(/\{\{user\}\}/g, `[USER_PLACEHOLDER:${encodeURIComponent(userName)}]`)
      .replace(/\{\{lastUserMessage\}\}/g, `[LAST_USER_MESSAGE_PLACEHOLDER:${encodeURIComponent(lastUserMessage)}]`);
    
    // 🆕 替换资源宏（创建占位符）
    result = result
      .replace(/\{\{resources\.sprites\}\}/g, `[RESOURCES_SPRITES_PLACEHOLDER:${encodeURIComponent(scriptId)}]`)
      .replace(/\{\{resources\.backgrounds\}\}/g, `[RESOURCES_BACKGROUNDS_PLACEHOLDER:${encodeURIComponent(scriptId)}]`)
      .replace(/\{\{resources\.effects\}\}/g, `[RESOURCES_EFFECTS_PLACEHOLDER:${encodeURIComponent(scriptId)}]`)
      .replace(/\{\{resources\.soundEffects\}\}/g, `[RESOURCES_SOUNDEFFECTS_PLACEHOLDER:${encodeURIComponent(scriptId)}]`);
    
    // 替换剧本历史宏（创建占位符）
    result = await this.replaceScriptHistoryMacros(result, scriptId);
    
    return result;
  }

  /**
   * 保存开局剧情到剧本历史（作为第一条消息）
   * 🆕 支持 {{user}} 宏替换
   */
  async saveOpeningToScriptHistory(scriptId: string, openingContent: string): Promise<void> {
    console.log(`[ScriptService] 📝 保存开局剧情到剧本历史: ${scriptId}`);
    
    // 检查是否已经有历史记录
    const existingHistory = await this.getScriptHistory(scriptId);
    
    // 如果已经有历史记录，不重复添加开局剧情
    if (existingHistory.length > 0) {
      console.log(`[ScriptService] ⚠️ 剧本历史已存在 ${existingHistory.length} 条记录，跳过开局剧情保存`);
      return;
    }

    // 🆕 获取剧本信息以进行宏替换
    const script = await this.getScript(scriptId);
    const userName = script?.userName || '用户';
    
    // 🆕 对开局内容进行宏替换
    let processedOpeningContent = openingContent;
    try {
      console.log(`[ScriptService] 🔄 对开局剧情进行宏替换，用户名: ${userName}`);
      processedOpeningContent = await this.replaceBuiltinMacrosAsync(openingContent, userName, '', scriptId);
      
      // 立即处理占位符，将其转换为最终内容
      processedOpeningContent = processedOpeningContent
        .replace(/\[USER_PLACEHOLDER:(.+?)\]/g, (match: string, encodedUser: string) => {
          try {
            return decodeURIComponent(encodedUser);
          } catch (error) {
            console.error('[ScriptService] 解析用户宏失败:', error);
            return userName; // 回退到直接使用用户名
          }
        })
        .replace(/\[LAST_USER_MESSAGE_PLACEHOLDER:(.+?)\]/g, ''); // 开局剧情没有上一条用户消息
      
      console.log(`[ScriptService] ✅ 开局剧情宏替换完成`);
    } catch (error) {
      console.warn(`[ScriptService] ⚠️ 开局剧情宏替换失败，使用原始内容:`, error);
    }
    
    // 创建开局剧情消息
    const openingMessage: ScriptMessage = {
      id: `opening_${Date.now()}`,
      scriptId: scriptId,
      userInput: '[开局剧情]', // 标识这是开局剧情
      aiResponse: {
        plotContent: processedOpeningContent,
        _rawResponse: processedOpeningContent, // 保存处理后的内容
        _originalResponse: openingContent, // 🆕 保存原始内容（未替换宏）
        _isOpeningScene: true // 标记为开局场景
      },
      timestamp: Date.now(),
    };
    
    console.log(`[ScriptService] 💾 保存开局剧情消息:`, {
      id: openingMessage.id,
      originalLength: openingContent.length,
      processedLength: processedOpeningContent.length,
      scriptId: scriptId,
      userName: userName
    });
    
    await this.saveScriptMessage(openingMessage);
  }

  /**
   * 保存剧本消息
   */
  async saveScriptMessage(message: ScriptMessage): Promise<void> {
    const historyKey = `script_history_${message.scriptId}`;
    const history = await StorageAdapter.loadJson<ScriptMessage[]>(historyKey) || [];
    history.push(message);
    await StorageAdapter.saveJson(historyKey, history);
    
    // 🆕 保存最新AI响应到script.lastRawResponse，确保在总结后仍能发送到WebView
    if (message.aiResponse) {
      const script = await this.getScript(message.scriptId);
      if (script) {
        const latestRawResponse = message.aiResponse.rawResponse || 
                                 message.aiResponse._rawResponse || 
                                 message.aiResponse.plotContent ||
                                 JSON.stringify(message.aiResponse);
        
        script.lastRawResponse = latestRawResponse;
        script.updatedAt = Date.now();
        await this.saveScript(script);
        
        console.log(`[ScriptService] 更新script.lastRawResponse (${latestRawResponse.length} 字符)`);
      }
    }
    
    // 🆕 保存消息后检查是否需要触发体验管理器
    await this.maybeTriggerExpManager(message.scriptId);
  }

  // ==================== 体验管理器调度机制 ====================
  
  /**
   * 检查并可能触发体验管理器
   * @param scriptId 剧本ID
   */
  async maybeTriggerExpManager(scriptId: string): Promise<void> {
    try {
      const script = await this.getScript(scriptId);
      if (!script?.expManagerConfig?.enabled) {
        console.log(`[ScriptService] 剧本 ${scriptId} 未启用体验管理器，跳过`);
        return;
      }

      const config = script.expManagerConfig;
      const history = await this.getScriptHistory(scriptId);
      
      // 计算当前历史中未处理的消息数量
      const lastProcessedIndex = config.lastProcessedHistoryIndex || 0;
      const unprocessedCount = history.length - lastProcessedIndex;
      
      console.log(`[ScriptService] 剧本 ${scriptId} ExpManager 检查: 历史总数=${history.length}, 上次处理索引=${lastProcessedIndex}, 未处理=${unprocessedCount}, 阈值=${config.intervalHistoryCount}`);
      
      if (unprocessedCount >= config.intervalHistoryCount) {
        console.log(`[ScriptService] 🎭 触发体验管理器 - 未处理消息数达到阈值`);
        await this.runExpManager(scriptId);
      }
    } catch (error) {
      console.warn(`[ScriptService] 检查体验管理器触发条件失败:`, error);
    }
  }

  /**
   * 运行体验管理器
   * @param scriptId 剧本ID
   * @param forceRun 是否强制运行（忽略配置检查）
   */
  async runExpManager(scriptId: string, forceRun: boolean = false): Promise<boolean> {
    try {
      const script = await this.getScript(scriptId);
      if (!script) {
        console.error(`[ScriptService] 剧本 ${scriptId} 不存在`);
        return false;
      }

      if (!forceRun && !script.expManagerConfig?.enabled) {
        console.log(`[ScriptService] 剧本 ${scriptId} 未启用体验管理器`);
        return false;
      }

      const history = await this.getScriptHistory(scriptId);
      if (history.length === 0) {
        console.log(`[ScriptService] 剧本 ${scriptId} 历史为空，跳过体验管理器`);
        return false;
      }

      // 获取最后一条AI响应作为输入
      const lastMessage = history[history.length - 1];
      const lastAiResponse = lastMessage?.aiResponse?._rawResponse || 
                            lastMessage?.aiResponse?._processedResponse || 
                            this.extractPlotContent(lastMessage?.aiResponse) || '';

      if (!lastAiResponse.trim()) {
        console.log(`[ScriptService] 剧本 ${scriptId} 最后一条AI响应为空，跳过体验管理器`);
        return false;
      }

      console.log(`[ScriptService] 🎭 开始运行体验管理器 - 剧本 ${scriptId}`);
      
      // 动态导入 ExpManager 以避免循环依赖
      const { ExpManager } = await import('./scripts/ExpManager');
      const expManager = ExpManager.getInstance();

      const expResult = await expManager.runExperience(scriptId, lastAiResponse, {
        userName: script.userName || '用户',
        lastUserMessage: lastMessage?.userInput || '',
        scriptContext: `剧本: ${script.name || script.id}`,
        useMessages: true,
        unifiedApiOptions: {
          characterId: scriptId,
        }
      });

      // 更新配置中的运行状态
      const updatedConfig = script.expManagerConfig || {
        enabled: true,
        intervalHistoryCount: 3
      };
      
      updatedConfig.lastRunAt = Date.now();
      updatedConfig.lastProcessedHistoryIndex = history.length;

      script.expManagerConfig = updatedConfig;
      script.updatedAt = Date.now();
      await this.saveScript(script);

      if (expResult.success) {
        console.log(`[ScriptService] ✅ 体验管理器执行成功 - 剧本 ${scriptId}, 变量操作数: ${expResult.variableLogs.length}`);
        return true;
      } else {
        console.warn(`[ScriptService] ⚠️ 体验管理器执行失败 - 剧本 ${scriptId}: ${expResult.error}`);
        return false;
      }
    } catch (error) {
      console.error(`[ScriptService] 体验管理器运行失败 - 剧本 ${scriptId}:`, error);
      return false;
    }
  }

  /**
   * 获取体验管理器状态
   * @param scriptId 剧本ID
   */
  async getExpManagerStatus(scriptId: string): Promise<{
    available: boolean;
    enabled: boolean;
    lastRunAt?: number;
    lastProcessedHistoryIndex?: number;
    intervalHistoryCount?: number;
    unprocessedCount: number;
    error?: string;
  }> {
    try {
      const script = await this.getScript(scriptId);
      if (!script) {
        return {
          available: false,
          enabled: false,
          unprocessedCount: 0,
          error: '剧本不存在'
        };
      }

      const config = script.expManagerConfig;
      const history = await this.getScriptHistory(scriptId);
      const lastProcessedIndex = config?.lastProcessedHistoryIndex || 0;
      const unprocessedCount = Math.max(0, history.length - lastProcessedIndex);

      return {
        available: true,
        enabled: config?.enabled || false,
        lastRunAt: config?.lastRunAt,
        lastProcessedHistoryIndex: config?.lastProcessedHistoryIndex,
        intervalHistoryCount: config?.intervalHistoryCount,
        unprocessedCount
      };
    } catch (error) {
      return {
        available: false,
        enabled: false,
        unprocessedCount: 0,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 更新体验管理器配置
   * @param scriptId 剧本ID
   * @param config 新的配置
   */
  async updateExpManagerConfig(scriptId: string, config: Partial<ExpManagerConfig>): Promise<void> {
    const script = await this.getScript(scriptId);
    if (!script) {
      throw new Error('剧本不存在');
    }

    // 合并配置，保持默认值
    const updatedConfig: ExpManagerConfig = {
      enabled: false,
      intervalHistoryCount: 3,
      ...script.expManagerConfig,
      ...config
    };

    script.expManagerConfig = updatedConfig;
    script.updatedAt = Date.now();
    await this.saveScript(script);

    console.log(`[ScriptService] 已更新剧本 ${scriptId} 的体验管理器配置:`, updatedConfig);
  }

  // ==================== 剧本存档机制 ====================
  /**
   * 创建存档
   * @param scriptId 剧本ID
   * @param label 可选存档标签
   * @param viewState WebView渲染状态（来自前端保存）
   */
  async createArchive(scriptId: string, label?: string, viewState?: any): Promise<{ id: string }> {
    const script = await this.getScript(scriptId);
    if (!script) throw new Error('剧本不存在');

    const archiveId = `arc_${Date.now()}`;
    try {
      // 1. 读取剧本历史
      const history = await this.getScriptHistory(scriptId);
      // 2. 导出变量系统快照
      let variableSnapshot: any = null;
      try {
        const variableManager = await ScriptVariableService.getInstance(scriptId);
        // @ts-ignore 使用新增的快照导出方法
        variableSnapshot = variableManager.exportSnapshots();
      } catch (e) {
        console.warn('[ScriptService] 导出变量快照失败（可忽略）:', e);
      }
      // 3. 当前响应（历史最后一条的AI响应）
      const currentResponse = history.length > 0 ? history[history.length - 1].aiResponse : null;
      // 4. 组装存档对象
      const archiveData = {
        id: archiveId,
        scriptId,
        label: label || `存档 ${new Date().toLocaleString()}`,
        createdAt: Date.now(),
        history,
        variableSnapshot,
        viewState: viewState || null,
        currentResponse
      };
      // 5. 保存
      const key = `script_archives_${scriptId}`;
      const list = await StorageAdapter.loadJson<any[]>(key) || [];
      list.push(archiveData);
      await StorageAdapter.saveJson(key, list);
      console.log(`[ScriptService] 💾 已创建存档 ${archiveId} (剧本 ${scriptId})`);
      return { id: archiveId };
    } catch (e) {
      console.error('[ScriptService] ❌ 创建存档失败:', e);
      throw e;
    }
  }

  /** 列出存档 */
  async listArchives(scriptId: string): Promise<any[]> {
    const key = `script_archives_${scriptId}`;
    return await StorageAdapter.loadJson<any[]>(key) || [];
  }

  /** 删除存档 */
  async deleteArchive(scriptId: string, archiveId: string): Promise<boolean> {
    const key = `script_archives_${scriptId}`;
    const list = await StorageAdapter.loadJson<any[]>(key) || [];
    const newList = list.filter(a => a.id !== archiveId);
    await StorageAdapter.saveJson(key, newList);
    console.log(`[ScriptService] 🗑️ 已删除存档 ${archiveId}`);
    return true;
  }

  /** 获取单个存档 */
  async loadArchive(scriptId: string, archiveId: string): Promise<any | null> {
    const key = `script_archives_${scriptId}`;
    const list = await StorageAdapter.loadJson<any[]>(key) || [];
    return list.find(a => a.id === archiveId) || null;
  }

  /**
   * 恢复存档：覆盖历史与变量系统，并返回需要发送给WebView的viewState。
   */
  async restoreArchive(scriptId: string, archiveId: string): Promise<{ viewState: any | null; currentResponse: ScriptResponse | null }> {
    const archive = await this.loadArchive(scriptId, archiveId);
    if (!archive) throw new Error('存档不存在');
    try {
      // 1. 覆盖历史
      const historyKey = `script_history_${scriptId}`;
      await StorageAdapter.saveJson(historyKey, archive.history || []);
      // 2. 恢复变量系统
      if (archive.variableSnapshot) {
        try {
            // 清空旧实例
          ScriptVariableService.clearInstance(scriptId);
          const variableManager = await ScriptVariableService.getInstance(scriptId);
          // @ts-ignore 调用新增方法
          await (variableManager as any).loadSnapshots(archive.variableSnapshot);
        } catch (e) {
          console.warn('[ScriptService] 恢复变量快照失败（可忽略）:', e);
        }
      }
      console.log(`[ScriptService] 🔄 已恢复存档 ${archiveId}`);
      console.log('[ScriptService] 覆盖历史完成: 条数', (archive.history || []).length);
      return { viewState: archive.viewState || null, currentResponse: archive.currentResponse || null };
    } catch (e) {
      console.error('[ScriptService] ❌ 恢复存档失败:', e);
      throw e;
    }
  }

  /**
   * 获取剧本消息历史
   */
  async getScriptHistory(scriptId: string): Promise<ScriptMessage[]> {
    const historyKey = `script_history_${scriptId}`;
    return await StorageAdapter.loadJson<ScriptMessage[]>(historyKey) || [];
  }

  /**
   * 清空剧本消息历史
   */
  async clearScriptHistory(scriptId: string): Promise<void> {
    const historyKey = `script_history_${scriptId}`;
    await StorageAdapter.saveJson(historyKey, []);
  }

  /**
   * 检查剧本历史是否需要总结并自动执行
   */
  async checkAndSummarizeScriptHistory(scriptId: string): Promise<boolean> {
    const script = await this.getScript(scriptId);
    if (!script || !script.summarizationConfig?.enabled) {
      return false;
    }

    const config = script.summarizationConfig;
    const history = await this.getScriptHistory(scriptId);
    
    // 分析历史结构
    const { summarizedMessages, unsummarizedMessages } = this.separateSummarizedMessages(history);
    
    // 1. 检查是否需要进行增量总结
    const unsummarizedLength = this.calculateTextLength(unsummarizedMessages);
    console.log(`[ScriptService] 剧本 ${scriptId} 分析: ${summarizedMessages.length} 条总结, ${unsummarizedMessages.length} 条未总结, 未总结长度: ${unsummarizedLength}`);

    if (unsummarizedLength >= config.summaryThreshold) {
      console.log(`[ScriptService] 触发增量总结 - 未总结内容达到阈值 ${config.summaryThreshold}`);
      return await this.summarizeScriptHistory(scriptId, false);
    }

    // 2. 检查是否需要进行二次总结（summary-of-summary）
    if (summarizedMessages.length >= 3) { // 至少3条总结才考虑二次总结
      const summariesLength = this.calculateTextLength(summarizedMessages);
      const metaSummaryThreshold = config.summaryThreshold * 2; // 更高的阈值
      
      if (summariesLength >= metaSummaryThreshold) {
        console.log(`[ScriptService] 检测到总结消息过多 (${summarizedMessages.length} 条，总长度: ${summariesLength})，建议进行二次总结`);
        console.log(`[ScriptService] 注意：二次总结会丢失部分细节，请谨慎使用`);
        // 可以选择自动执行或仅提示
        // return await this.summarizeOfSummaries(scriptId, false);
      }
    }

    return false;
  }

  /**
   * 总结剧本历史（增量总结策略）
   */
  async summarizeScriptHistory(scriptId: string, forceGenerate: boolean = false): Promise<boolean> {
    try {
      const script = await this.getScript(scriptId);
      if (!script) {
        console.error('[ScriptService] 剧本不存在');
        return false;
      }

      const config = script.summarizationConfig;
      if (!config && !forceGenerate) {
        console.log('[ScriptService] 剧本未启用总结功能');
        return false;
      }

      const history = await this.getScriptHistory(scriptId);
      if (history.length === 0) {
        console.log('[ScriptService] 剧本历史为空，无需总结');
        return false;
      }

      // 分离已总结的消息和未总结的消息
      const { summarizedMessages, unsummarizedMessages } = this.separateSummarizedMessages(history);
      
      console.log(`[ScriptService] 剧本 ${scriptId} 历史分析: ${summarizedMessages.length} 条已总结, ${unsummarizedMessages.length} 条未总结`);

      // 如果未总结消息数量为0或1，说明没有可被压缩的旧消息（最新消息不能被总结），直接跳过
      if (unsummarizedMessages.length <= 1) {
        console.log('[ScriptService] 未总结消息不足（<=1），跳过总结以保留最新消息不变');
        return false;
      }

      // 只对未总结的消息中除去最新一条之外的消息进行总结（保留最新消息用于渲染/发送）
      const olderMessagesToSummarize = unsummarizedMessages.slice(0, unsummarizedMessages.length - 1);

      // 检查未总结旧消息内容是否达到总结阈值
      if (!forceGenerate) {
        const olderTextLength = this.calculateTextLength(olderMessagesToSummarize);
        const threshold = config?.summaryThreshold || 6000;

        if (olderTextLength < threshold) {
          console.log(`[ScriptService] 待总结的旧消息长度 ${olderTextLength} 未达到阈值 ${threshold}，跳过总结`);
          return false;
        }
      }

      // 只对 olderMessagesToSummarize 进行总结（不包含最新消息）
      const contentToSummarize = this.convertScriptHistoryToText(olderMessagesToSummarize);
      
      // 使用MemoryService的专用剧本总结方法
      const memoryService = MemoryService.getInstance();

      console.log(`[ScriptService] 开始增量总结剧本 ${scriptId}，总结 ${unsummarizedMessages.length} 条未总结消息`);
      
      const summaryText = await memoryService.summarizeScriptContent(
        scriptId,
        contentToSummarize,
        '', // API key将从设置中获取
        undefined // API settings将从设置中获取
      );

      // 创建新的总结消息（记录被合并的原始消息id/count）
      const newSummaryMessage: ScriptMessage = {
        id: `summary_${Date.now()}`,
        scriptId: scriptId,
        userInput: '[增量总结]',
        aiResponse: {
          plotContent: summaryText,
          _isMemorySummary: true,
          _originalMessagesCount: olderMessagesToSummarize.length,
          _summarizedAt: Date.now(),
          _summaryType: 'incremental' // 标记为增量总结
        },
        timestamp: Date.now()
      };
      // 将被合并的原始消息 id 列表记入 summary 元数据，便于调试/恢复
      try {
        (newSummaryMessage.aiResponse as any)._originalMessageIds = olderMessagesToSummarize.map(m => m.id);
      } catch (e) {
        // ignore
      }

      // 保留最新未总结消息（作为渲染/发送的原始消息）
      const latestMessage = unsummarizedMessages[unsummarizedMessages.length - 1];

      // 构建新的历史：保留已总结的 + 添加新总结 + 保留最新消息
      const newHistory = [...summarizedMessages, newSummaryMessage, latestMessage];
      
      // 保存更新后的历史
      const historyKey = `script_history_${scriptId}`;
      await StorageAdapter.saveJson(historyKey, newHistory);

      // 更新剧本配置中的最后总结时间
      if (config) {
        config.lastSummarizedAt = Date.now();
        script.updatedAt = Date.now();
        await this.saveScript(script);
      }

      console.log(`[ScriptService] 剧本 ${scriptId} 增量总结完成，将 ${unsummarizedMessages.length} 条消息总结为 1 条总结消息`);
      console.log(`[ScriptService] 当前历史结构: ${summarizedMessages.length} 条历史总结 + 1 条新总结 + 1 条最新原始消息 (被保留, id=${latestMessage?.id})`);
      return true;
    } catch (error) {
      console.error('[ScriptService] 剧本历史总结失败:', error);
      return false;
    }
  }

  /**
   * 将剧本历史转换为待总结的文本内容
   */
  private convertScriptHistoryToText(scriptHistory: ScriptMessage[]): string {
    const textBlocks: string[] = [];
    
    for (let i = 0; i < scriptHistory.length; i++) {
      const message = scriptHistory[i];
      const plotContent = this.extractPlotContent(message.aiResponse);
      
      // 添加用户输入和AI响应
      textBlocks.push(`=== 第 ${i + 1} 轮 ===`);
      textBlocks.push(`用户输入: ${message.userInput}`);
      textBlocks.push(`剧情发展: ${plotContent}`);
      textBlocks.push(''); // 空行分隔
    }
    
    return textBlocks.join('\n');
  }

  /**
   * 分离已总结的消息和未总结的消息
   */
  private separateSummarizedMessages(history: ScriptMessage[]): {
    summarizedMessages: ScriptMessage[];
    unsummarizedMessages: ScriptMessage[];
  } {
    const summarizedMessages: ScriptMessage[] = [];
    const unsummarizedMessages: ScriptMessage[] = [];
    
    for (const message of history) {
      if (this.isMemorySummaryMessage(message)) {
        summarizedMessages.push(message);
      } else {
        unsummarizedMessages.push(message);
      }
    }
    
    return { summarizedMessages, unsummarizedMessages };
  }

  /**
   * 检查消息是否为总结消息
   */
  private isMemorySummaryMessage(message: ScriptMessage): boolean {
    return message.aiResponse._isMemorySummary === true;
  }

  /**
   * 计算消息列表的文本总长度
   */
  private calculateTextLength(messages: ScriptMessage[]): number {
    return messages.reduce((total, message) => {
      const plotContent = this.extractPlotContent(message.aiResponse);
      return total + message.userInput.length + plotContent.length;
    }, 0);
  }

  /**
   * 对总结消息进行二次总结（summary-of-summary）
   * 注意：不推荐频繁使用，仅在总结消息过多时使用
   */
  async summarizeOfSummaries(scriptId: string, forceGenerate: boolean = false): Promise<boolean> {
    try {
      const script = await this.getScript(scriptId);
      if (!script) {
        console.error('[ScriptService] 剧本不存在');
        return false;
      }

      const history = await this.getScriptHistory(scriptId);
      const { summarizedMessages, unsummarizedMessages } = this.separateSummarizedMessages(history);
      
      if (summarizedMessages.length < 2) {
        console.log('[ScriptService] 总结消息数量不足，无需进行二次总结');
        return false;
      }

      // 检查总结消息的总长度
      if (!forceGenerate) {
        const summariesTextLength = this.calculateTextLength(summarizedMessages);
        const threshold = script.summarizationConfig?.summaryThreshold || 6000;
        
        if (summariesTextLength < threshold * 2) { // 使用更高的阈值
          console.log(`[ScriptService] 总结消息总长度 ${summariesTextLength} 未达到二次总结阈值，跳过`);
          return false;
        }
      }

      console.log(`[ScriptService] 开始对 ${summarizedMessages.length} 条总结消息进行二次总结`);

      // 将所有总结消息转换为文本
      const summariesText = summarizedMessages.map((msg, index) => {
        const plotContent = this.extractPlotContent(msg.aiResponse);
        return `=== 总结段落 ${index + 1} ===\n${plotContent}`;
      }).join('\n\n');

      // 使用专门的二次总结提示词
      const memoryService = MemoryService.getInstance();
      
      const metaSummaryText = await memoryService.summarizeScriptContent(
        scriptId,
        `以下是多个阶段的剧情总结，请将它们合并为一个连贯的总结：\n\n${summariesText}`,
        '',
        undefined
      );

      // 创建元总结消息
      const metaSummaryMessage: ScriptMessage = {
        id: `meta_summary_${Date.now()}`,
        scriptId: scriptId,
        userInput: '[元总结]',
        aiResponse: {
          plotContent: metaSummaryText,
          _isMemorySummary: true,
          _originalMessagesCount: summarizedMessages.length,
          _summarizedAt: Date.now(),
          _summaryType: 'meta', // 标记为元总结
          _consolidatedSummaries: summarizedMessages.length
        },
        timestamp: Date.now()
      };

      // 构建新历史：用元总结替换所有原有总结，保留未总结消息
      const newHistory = [metaSummaryMessage, ...unsummarizedMessages];
      
      const historyKey = `script_history_${scriptId}`;
      await StorageAdapter.saveJson(historyKey, newHistory);

      console.log(`[ScriptService] 剧本 ${scriptId} 二次总结完成，将 ${summarizedMessages.length} 条总结合并为 1 条元总结`);
      console.log(`[ScriptService] 当前历史结构: 1 条元总结 + ${unsummarizedMessages.length} 条未总结消息`);
      
      return true;
    } catch (error) {
      console.error('[ScriptService] 二次总结失败:', error);
      return false;
    }
  }

  /**
   * 更新剧本的outputRequirements配置
   */
  async updateScriptOutputRequirements(scriptId: string, outputRequirements: any): Promise<void> {
    console.log(`💾 [ScriptService] 更新剧本 ${scriptId} 的outputRequirements配置`);
    
    const script = await this.getScript(scriptId);
    if (!script) {
      throw new Error('剧本不存在');
    }
    
    // 确保styleConfig存在
    if (!script.styleConfig) {
      script.styleConfig = {
        id: `style_${Date.now()}`,
        name: 'Default Style Config',
        outputRequirements: '', // 必需字段，先设置为空字符串
        createdAt: Date.now() // 必需字段
      };
    }
    
    // 更新outputRequirements
    script.styleConfig.outputRequirements = outputRequirements;
    
    console.log(`💾 [ScriptService] outputRequirements类型: ${typeof outputRequirements}`);
    // console.log(`💾 [ScriptService] outputRequirements内容预览: ${JSON.stringify(outputRequirements).substring(0, 200)}...`);
    
    // 保存到存储
    await StorageAdapter.saveJson(`script_${scriptId}`, script);
    
    console.log(`✅ [ScriptService] 剧本 ${scriptId} 的outputRequirements配置已保存`);
  }

  /**
   * 更新剧本总结配置
   */
  async updateScriptSummarizationConfig(scriptId: string, config: any): Promise<void> {
    const script = await this.getScript(scriptId);
    if (!script) {
      throw new Error('剧本不存在');
    }
    
    script.summarizationConfig = config;
    script.updatedAt = Date.now();
    await this.saveScript(script);
  }

  /**
   * 确认剧本响应，将剧情内容添加到角色聊天记录并更新世界书
   */
  async confirmScriptResponse(scriptId: string, response: ScriptResponse): Promise<void> {
    const script = await this.getScript(scriptId);
    if (!script) {
      throw new Error('剧本不存在');
    }

    // 1. 将剧情输出内容作为旁白添加到所有参与角色的聊天记录
    // 使用 plotContent 字段或第一个字符串值作为旁白内容
    const plotContent = response.plotContent || this.extractPlotContent(response);
    const narratorMessage = `[旁白] ${plotContent}`;
    
    for (const characterId of script.selectedCharacters) {
      await StorageAdapter.addUserMessage(characterId, narratorMessage, { isScriptNarration: true });
    }

    // 2. 为每个参与角色更新世界书条目（如果有相关字段）
    const events = response.events || [];
    const characterInteractions = response.characterInteractions || [];
    if (events.length > 0 || characterInteractions.length > 0) {
      await this.updateCharacterWorldbooks(script.selectedCharacters, events, characterInteractions);
    }
  }

  /**
   * 更新角色世界书
   */
  private async updateCharacterWorldbooks(
    characterIds: string[],
    events: ScriptEvent[],
    interactions: ScriptCharacterInteraction[]
  ): Promise<void> {
    // 构建世界书条目
    const dEntries: Record<string, any> = {};
    
    // 添加事件条目
    for (const event of events) {
      dEntries[`script_event_${event.id}`] = {
        comment: `剧本事件: ${event.name}`,
        content: event.content,
        disable: false,
        position: 4, // D类条目
        constant: true,
        key: ['剧本', '事件', event.name],
        order: 1,
        depth: 2,
        vectorized: false,
      };
    }
    
    // 添加角色交互条目
    for (const interaction of interactions) {
      // 获取涉及角色的rolecard信息
      let interactionContent = interaction.content + '\n\n相关角色信息:\n';
      
      for (const characterId of interaction.characterIds) {
        const roleCard = await StorageAdapter.loadJson<RoleCardJson | null>(
          StorageAdapter.getStorageKey(characterId, '_role')
        );
        
        if (roleCard) {
          interactionContent += `\n角色: ${roleCard.name || characterId}\n`;
          interactionContent += `描述: ${roleCard.description || '无'}\n`;
          interactionContent += `性格: ${roleCard.personality || '无'}\n`;
        }
      }
      
      dEntries[`script_interaction_${interaction.id}`] = {
        comment: `剧本交互: ${interaction.name}`,
        content: interactionContent,
        disable: false,
        position: 4, // D类条目
        constant: true,
        key: ['剧本', '交互', interaction.name],
        order: 2,
        depth: 2,
        vectorized: false,
      };
    }
    
    // 为每个角色更新世界书（覆盖模式）
    for (const characterId of characterIds) {
      await StorageAdapter.appendDEntriesToCharacterWorldbook(
        characterId,
        dEntries,
        true // 覆盖模式
      );
    }
  }

  /**
   * 更新剧本设置
   */
  async updateScriptSettings(scriptId: string, contextMessageCounts: Record<string, number>): Promise<void> {
    const script = await this.getScript(scriptId);
    if (!script) {
      throw new Error('剧本不存在');
    }
    
    script.contextMessageCount = contextMessageCounts;
    script.updatedAt = Date.now();
    
    await this.saveScript(script);
  }




  /**
   * 获取输出要求（从样式配置或默认配置）
   */
  private async getOutputRequirements(script: Script): Promise<any> {
    console.log(`📝 [剧本 ${script.id}] 开始获取输出要求配置`);
    console.log(`📝 [剧本 ${script.id}] script.styleConfig 存在:`, !!script.styleConfig);
    
    let outputRequirements: any;

    if (script.styleConfig) {
      outputRequirements = script.styleConfig.outputRequirements;
      console.log(`📝 [剧本 ${script.id}] 使用剧本自定义 outputRequirements`);
      console.log(`📝 [剧本 ${script.id}] outputRequirements 类型:`, typeof outputRequirements);
      
      if (typeof outputRequirements === 'object' && outputRequirements !== null) {
        console.log(`📝 [剧本 ${script.id}] outputRequirements 结构:`, {
          hasPrompts: Array.isArray(outputRequirements.prompts),
          promptsLength: Array.isArray(outputRequirements.prompts) ? outputRequirements.prompts.length : 0,
          hasPromptOrder: Array.isArray(outputRequirements.prompt_order),
          promptOrderLength: Array.isArray(outputRequirements.prompt_order) ? outputRequirements.prompt_order.length : 0
        });
        
        // 检查是否有 chatHistory 相关的 prompt
        if (Array.isArray(outputRequirements.prompts)) {
          const chatHistoryPrompts = outputRequirements.prompts.filter((p: any) => 
            p.identifier && (
              p.identifier.toLowerCase().includes('chathistory') ||
              p.identifier.toLowerCase().includes('chat_history')
            )
          );
          console.log(`📝 [剧本 ${script.id}] chatHistory 相关 prompts 数量:`, chatHistoryPrompts.length);
          chatHistoryPrompts.forEach((p: any, idx: number) => {
            console.log(`📝 [剧本 ${script.id}] chatHistory prompt ${idx}:`, {
              identifier: p.identifier,
              name: p.name,
              role: p.role,
              hasContent: !!p.content,
              contentLength: typeof p.content === 'string' ? p.content.length : 0
            });
          });
        }
      }
    } else {
      console.log(`📝 [剧本 ${script.id}] 使用默认 outputRequirements`);
    }

    // 如果是字符串，直接返回
    if (typeof outputRequirements === 'string') {
      return outputRequirements;
    }

    // 如果是对象或数组，优先按 prompt_order 排序并根据 prompt_order 中的 enabled 判断是否保留
    if (typeof outputRequirements === 'object' && outputRequirements !== null) {
      try {
        return this.processOutputRequirements(outputRequirements);
      } catch (e) {
        console.warn('处理 outputRequirements 时出错，回退到通用过滤:', e);
        return this.filterEnabledConfig(outputRequirements);
      }
    }

    return outputRequirements;
  }

  

  /**
   * 过滤配置对象，移除enable为false的条目
   */
  private filterEnabledConfig(config: any): any {
    if (Array.isArray(config)) {
      return config
        .filter(item => {
          // 如果项目有enable字段，只保留enable为true的
          if (typeof item === 'object' && item !== null && 'enable' in item) {
            return item.enable === true;
          }
          // 如果没有enable字段，默认保留
          return true;
        })
        .map(item => this.filterEnabledConfig(item));
    } else if (typeof config === 'object' && config !== null) {
      const result: any = {};
      for (const [key, value] of Object.entries(config)) {
        // 递归处理嵌套对象
        result[key] = this.filterEnabledConfig(value);
      }
      return result;
    }
    
    return config;
  }

  /**
   * 获取WebView HTML模板
   */
  async getWebViewHtml(script: Script): Promise<string> {
    if (script.styleConfig) {
      // 优先：样式配置内提供的HTML
      if (script.styleConfig.webViewHtml && script.styleConfig.webViewHtml.trim()) {
        return script.styleConfig.webViewHtml;
      }
      // 其次：样式配置若指定了资源路径，尝试读取
      const htmlAssetPath = (script.styleConfig as any).htmlAssetPath as string | undefined;
      if (htmlAssetPath) {
        try {
          const absPath = htmlAssetPath.startsWith('file://') || htmlAssetPath.startsWith('/')
            ? htmlAssetPath
            : FileSystem.bundleDirectory + htmlAssetPath.replace(/^\/*/, '');
          return await FileSystem.readAsStringAsync(absPath);
        } catch (e) {
          console.warn('按样式配置的资源路径读取HTML失败，回退默认:', e);
        }
      }
    }
    // 最终回退：返回一个简单的空白HTML，避免崩溃
    return '<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><div class="empty">未找到默认HTML模板</div></body></html>';
  }

  /**
   * 从响应中提取剧情内容
   */
  extractPlotContent(response: ScriptResponse): string {
    // 优先检查 pages 数组中的 content
    if (response.pages && Array.isArray(response.pages) && response.pages.length > 0) {
      const firstPage = response.pages[0];
      if (firstPage && firstPage.content && typeof firstPage.content === 'string') {
        return firstPage.content;
      }
    }
    
    // 尝试从常见字段中提取内容
    const possibleFields = ['plotContent', 'content', 'story', 'narrative', 'text'];
    for (const field of possibleFields) {
      if (response[field] && typeof response[field] === 'string') {
        return response[field];
      }
    }
    
    // 如果没有找到，返回第一个字符串值
    for (const [key, value] of Object.entries(response)) {
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
    
    return '无剧情内容';
  }

  /**
   * 🆕 更新剧本的用户名配置
   * @param scriptId 剧本ID
   * @param userName 新的用户名
   */
  async updateScriptUserName(scriptId: string, userName: string): Promise<void> {
    const script = await this.getScript(scriptId);
    if (!script) {
      throw new Error('剧本不存在');
    }

    const oldUserName = script.userName;
    script.userName = userName.trim() || '用户';
    script.updatedAt = Date.now();
    
    console.log(`[ScriptService] 📝 更新剧本 ${scriptId} 用户名: "${oldUserName}" -> "${script.userName}"`);
    
    // 如果是文件系统导入的剧本且有 initialScene，需要重新处理宏替换
    const fileSystemData = (script as any).fileSystemImportData;

    // Save script first so that processInitialSceneMacros (which may call getScript)
    // reads the updated userName. This avoids a race where the processor loads the
    // old script record and uses the old user name for replacements.
    await this.saveScript(script);

    if (fileSystemData && fileSystemData.initialScene) {
      console.log('[ScriptService] 🔄 用户名更改，重新处理 initialScene 宏替换');

      // 从原始内容重新处理（如果有的话）
      const originalInitialScene = fileSystemData.originalInitialScene || fileSystemData.initialScene;
      fileSystemData.originalInitialScene = originalInitialScene; // 保存原始版本
      fileSystemData.initialScene = await this.processInitialSceneMacros(scriptId, originalInitialScene);

      // persist the updated fileSystemImportData
      await this.saveScript(script);
    }
    
    console.log(`[ScriptService] ✅ 剧本用户名已更新并保存`);
  }

  /**
   * 🆕 处理 initialScene 的宏替换
   * @param scriptId 剧本ID
   * @param initialScene 原始的 initialScene 内容
   * @returns 替换宏后的 initialScene 内容
   */
  async processInitialSceneMacros(scriptId: string, initialScene: string): Promise<string> {
    if (!initialScene || !initialScene.trim()) {
      return initialScene;
    }

    try {
      console.log(`[ScriptService] 🔄 开始处理 initialScene 宏替换 - 剧本 ${scriptId}`);
      
      // 获取剧本信息
      const script = await this.getScript(scriptId);
      const userName = script?.userName || '用户';
      
      // 进行宏替换
      let processedInitialScene = await this.replaceBuiltinMacrosAsync(initialScene, userName, '', scriptId);
      
      // 立即处理占位符，转换为最终内容
      processedInitialScene = processedInitialScene
        .replace(/\[USER_PLACEHOLDER:(.+?)\]/g, (match: string, encodedUser: string) => {
          try {
            return decodeURIComponent(encodedUser);
          } catch (error) {
            console.error('[ScriptService] 解析用户宏失败:', error);
            return userName;
          }
        })
        .replace(/\[LAST_USER_MESSAGE_PLACEHOLDER:(.+?)\]/g, ''); // initialScene 没有上一条用户消息
      
      console.log(`[ScriptService] ✅ initialScene 宏替换完成 - 原长度: ${initialScene.length}, 新长度: ${processedInitialScene.length}`);
      return processedInitialScene;
    } catch (error) {
      console.warn(`[ScriptService] ⚠️ initialScene 宏替换失败，使用原始内容:`, error);
      return initialScene;
    }
  }

  /**
   * 从 TypeScript 文件内容中提取 initialScene 变量的实际内容
   * 处理形如 export const initialScene = `...` 的代码
   */
  private extractInitialSceneContent(fileContent: string): string {
    try {
      console.log('[ScriptService] 🔍 提取 initial-scene 内容，文件长度:', fileContent.length);
      
      // 匹配 export const initialScene = `...` 或 export const initialScene = "..."
      const patterns = [
        // 匹配模板字符串（反引号）
        /export\s+const\s+initialScene\s*=\s*`([^`]*(?:`[^`]*`[^`]*)*)`/s,
        // 匹配双引号字符串
        /export\s+const\s+initialScene\s*=\s*"([^"\\]*(?:\\.[^"\\]*)*)"/s,
        // 匹配单引号字符串  
        /export\s+const\s+initialScene\s*=\s*'([^'\\]*(?:\\.[^'\\]*)*)'/s
      ];
      
      for (const pattern of patterns) {
        const match = fileContent.match(pattern);
        if (match && match[1]) {
          const extractedContent = match[1].trim();
          console.log('[ScriptService] ✅ 成功提取 initial-scene 内容，长度:', extractedContent.length);
          return extractedContent;
        }
      }
      
      console.warn('[ScriptService] ⚠️ 无法匹配 initialScene 变量，返回原始文件内容');
      return fileContent;
    } catch (error) {
      console.error('[ScriptService] ❌ 提取 initial-scene 内容失败:', error);
      return fileContent; // 返回原始内容作为备用
    }
  }

  /**
   * 统一导入剧本配置（支持JSON文件和ZIP压缩包，整合样式、变量、HTML配置）
   */
  async importUnifiedScriptConfig(): Promise<{
    scriptConfig: ScriptStyleConfigFile;
    variableConfig?: any;
    compiledRegex?: { pattern: RegExp; replacement: string; name?: string }[];
  } | null> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'application/zip', 'application/x-zip-compressed'],
        copyToCacheDirectory: true,
      });
      
      if (!result.assets || !result.assets[0]) {
        return null;
      }
      
      const fileUri = result.assets[0].uri;
      const fileName = result.assets[0].name || '';
      
      // 根据文件类型选择处理方式
      if (fileName.toLowerCase().endsWith('.zip')) {
        return await this.importUnifiedConfigFromArchiveInternal(fileUri);
      } else {
        return await this.importUnifiedConfigFromJson(fileUri);
      }
    } catch (error) {
      throw new Error(`导入剧本配置失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 导入样式配置文件（支持JSON文件和压缩包）
   * @deprecated 请使用 importUnifiedScriptConfig 方法
   */
  async importStyleConfig(): Promise<ScriptStyleConfigFile | null> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'application/zip', 'application/x-zip-compressed'],
        copyToCacheDirectory: true,
      });
      
      if (!result.assets || !result.assets[0]) {
        return null;
      }
      
      const fileUri = result.assets[0].uri;
      const fileName = result.assets[0].name || '';
      
      // 根据文件类型选择处理方式
      if (fileName.toLowerCase().endsWith('.zip')) {
        return await this.importStyleConfigFromArchive(fileUri);
      } else {
        return await this.importStyleConfigFromJson(fileUri);
      }
    } catch (error) {
      throw new Error(`导入样式配置失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 从JSON文件导入统一配置
   */
  private async importUnifiedConfigFromJson(fileUri: string): Promise<{
    scriptConfig: ScriptStyleConfigFile;
    variableConfig?: any;
    compiledRegex?: { pattern: RegExp; replacement: string; name?: string }[];
  }> {
    const content = await FileSystem.readAsStringAsync(fileUri);
    const json = JSON.parse(content);

    // 简单类型判断函数
    const isScriptConfig = (obj: any) => {
      if (!obj || typeof obj !== 'object') return false;
      // 支持两种结构：旧版 name + outputRequirements(string)，或新版 prompts + prompt_order
      const hasNamedReq = typeof obj.name === 'string' && obj.outputRequirements !== undefined;
      const hasPresetLike = Array.isArray(obj.prompts) && Array.isArray(obj.prompt_order);
      return hasNamedReq || hasPresetLike;
    };
    const isVariableConfig = (obj: any) => {
      if (!obj || typeof obj !== 'object') return false;
      return (
        (obj.variables && typeof obj.variables === 'object') ||
        (obj.tables && typeof obj.tables === 'object') ||
        (obj.hiddenVariables && typeof obj.hiddenVariables === 'object')
      );
    };

    // 如果用户误选了变量配置JSON，给出明确提示
    if (!isScriptConfig(json)) {
      if (isVariableConfig(json)) {
        throw new Error('检测到变量配置JSON。请导入包含剧本配置与模板的ZIP压缩包，或选择包含 name 与 outputRequirements 的剧本配置JSON');
      }
      throw new Error('未识别的配置JSON。需要包含 name 与 outputRequirements 字段，或包含 prompts 与 prompt_order 字段');
    }

    const scriptConfig: ScriptStyleConfigFile = {
      name: json.name,
      description: json.description,
      version: json.version,
      outputRequirements: this.processOutputRequirements(json.outputRequirements),
      webViewHtml: json.webViewHtml,
      htmlAssetPath: json.htmlAssetPath,
      variablePrompt: json.variablePrompt, // 新增：支持自定义 variablePrompt
      // 兼容存在但类型未在类型定义中的字段
      // @ts-ignore
      regexPatterns: Array.isArray(json.regexPatterns) ? json.regexPatterns : [],
      // @ts-ignore
      variableConfig: json.variableConfig,
    } as any;

    const compiledRegex = this.compileRegexPatterns((scriptConfig as any).regexPatterns || []);

    return {
      scriptConfig,
      // @ts-ignore
      variableConfig: scriptConfig.variableConfig,
      compiledRegex
    };
  }

  /**
   * 从ZIP文件URI导入统一配置（用于文件系统导入）
   */
  async importUnifiedConfigFromArchive(fileUri: string): Promise<{
    success: boolean;
    error?: string;
    config?: any;
    variables?: any;
    html?: string;
    customCSS?: string;
    parsedTypes?: any;
    initialScene?: string;
  }> {
    try {
      const result = await this.importUnifiedConfigFromArchiveInternal(fileUri);
      
      // 重新读取ZIP文件以提取额外的配置文件
      const zipData = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(zipData, { base64: true });
      
      // 提取自定义CSS
      let customCSS = '';
      const cssFiles = Object.keys(zipContent.files).filter(name => 
        name.toLowerCase().endsWith('.css') && !zipContent.files[name].dir
      );
      if (cssFiles.length > 0) {
        customCSS = await zipContent.file(cssFiles[0])!.async('string');
      }
      
      // 提取parsed-types.json
      let parsedTypes = {};
      const parsedTypesFile = zipContent.file('parsed-types.json');
      if (parsedTypesFile) {
        try {
          const parsedTypesText = await parsedTypesFile.async('string');
          parsedTypes = JSON.parse(parsedTypesText);
        } catch (error) {
          console.warn('解析parsed-types.json失败:', error);
        }
      }
      
      // 提取initial-scene.ts (作为字符串保存)
      let initialScene = '';
      const initialSceneFile = zipContent.file('initial-scene.ts');
      if (initialSceneFile) {
        try {
          const fileContent = await initialSceneFile.async('string');
          // 从 TypeScript 文件中提取 initialScene 变量的内容
          initialScene = this.extractInitialSceneContent(fileContent);
        } catch (error) {
          console.warn('读取initial-scene.ts失败:', error);
        }
      }
      
      return {
        success: true,
        config: result.scriptConfig,
        variables: result.variableConfig,
        html: '', // HTML will be loaded from webview for file system imports
        customCSS: customCSS,
        parsedTypes: parsedTypes,
        initialScene: initialScene
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 从ZIP压缩包导入统一配置（内部方法）
   */
  private async importUnifiedConfigFromArchiveInternal(fileUri: string): Promise<{
    scriptConfig: ScriptStyleConfigFile;
    variableConfig?: any;
    compiledRegex?: { pattern: RegExp; replacement: string; name?: string }[];
  }> {
    try {
      // 读取压缩包文件
      const zipData = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      // 解压压缩包
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(zipData, { base64: true });
      
      // 查找并解析 manifest.json
      let manifest: Manifest | undefined;
      const manifestFile = zipContent.file('manifest.json');
      if (manifestFile) {
        try {
          const manifestContent = await manifestFile.async('string');
          manifest = JSON.parse(manifestContent);
        } catch (e) {
          console.error("Failed to parse manifest.json", e);
        }
      }
      
      // 遍历全部JSON文件，按内容分类（剧本配置 / 变量配置 / 其他）
      const allJsonFileNames = Object.keys(zipContent.files).filter(name =>
        name.toLowerCase().endsWith('.json') && !zipContent.files[name].dir
      );

      const parsedJsons: Array<{name: string; data: any}> = [];
      for (const name of allJsonFileNames) {
        try {
          const txt = await zipContent.file(name)!.async('string');
          const obj = JSON.parse(txt);
          parsedJsons.push({ name, data: obj });
        } catch {}
      }

      const isScriptConfig = (obj: any) => {
        if (!obj || typeof obj !== 'object') return false;
        // 完整的剧本配置：包含 name 和 outputRequirements，或者包含 prompts 和 prompt_order
        const hasNamedReq = typeof obj.name === 'string' && obj.outputRequirements !== undefined;
        const hasPresetLike = Array.isArray(obj.prompts) && Array.isArray(obj.prompt_order);
        
        // 文件导入的简化配置：只需要有 variablePrompt 字段
        const hasVariablePrompt = obj.variablePrompt !== undefined;
        
        return hasNamedReq || hasPresetLike || hasVariablePrompt;
      };
      const isVariableConfig = (obj: any) => {
        if (!obj || typeof obj !== 'object') return false;
        return (
          (obj.variables && typeof obj.variables === 'object') ||
          (obj.tables && typeof obj.tables === 'object') ||
          (obj.hiddenVariables && typeof obj.hiddenVariables === 'object')
        );
      };

      // 选取剧本配置（优先特定文件名），并收集变量配置
      let chosenScriptConfig: {name: string; data: any} | null = null;
      let variableConfig: any = null;

      // 优先名匹配
      const preferredNames = ['script-config.json', 'config.json', 'style-config.json'];
      for (const pref of preferredNames) {
        const found = parsedJsons.find(j => j.name.toLowerCase() === pref);
        if (found && isScriptConfig(found.data)) {
          chosenScriptConfig = found;
          break;
        }
      }
      // 若仍未找到，按内容找第一个符合剧本配置的
      if (!chosenScriptConfig) {
        chosenScriptConfig = parsedJsons.find(j => isScriptConfig(j.data)) || null;
      }

      // 变量配置：找第一个形态符合的
      const varCandidate = parsedJsons.find(j => isVariableConfig(j.data));
      if (varCandidate) variableConfig = varCandidate.data;

      if (!chosenScriptConfig) {
        throw new Error('压缩包中未找到有效的剧本配置JSON。需要包含以下之一：\n1. 完整配置：name 与 outputRequirements 字段\n2. 预设格式：prompts 与 prompt_order 字段\n3. 文件导入配置：variablePrompt 字段');
      }

      const configFile = chosenScriptConfig.data;
      
      // 查找HTML文件
      let htmlFile: string | undefined;
      const htmlFileNames = ['index.html', 'template.html', 'script.html', 'style.html'];
      
      for (const name of htmlFileNames) {
        if (zipContent.file(name)) {
          htmlFile = await zipContent.file(name)!.async('string');
          break;
        }
      }
      
      // 如果没找到预定义名称的HTML文件，查找第一个.html文件
      if (!htmlFile) {
        const htmlFiles = Object.keys(zipContent.files).filter(name => 
          name.toLowerCase().endsWith('.html') && !zipContent.files[name].dir
        );
        if (htmlFiles.length > 0) {
          const firstHtmlFile = htmlFiles[0];
          htmlFile = await zipContent.file(firstHtmlFile)!.async('string');
        }
      }
      
      // 检查并处理角色头像和背景
      const characterAssets = await this.extractCharacterAvatars(zipContent);
      
      // 构建最终的配置对象
      const finalConfig: ScriptStyleConfigFile = {
        name: configFile.name || 'File Import Script', // 为文件导入提供默认名称
        description: configFile.description,
        version: configFile.version,
        outputRequirements: configFile.outputRequirements 
          ? this.processOutputRequirements(configFile.outputRequirements) 
          : 'Script content from file import', // 为文件导入提供默认值
        webViewHtml: htmlFile || configFile.webViewHtml,
        variablePrompt: configFile.variablePrompt, // 文件导入的核心字段
        // 以下字段可能不在类型中，做兼容处理
        // @ts-ignore
        regexPatterns: Array.isArray(configFile.regexPatterns) ? configFile.regexPatterns : [],
        // @ts-ignore
        variableConfig: variableConfig || configFile.variableConfig,
        // @ts-ignore
        characterAvatars: characterAssets?.avatars || {}, // 角色头像配置
        // @ts-ignore
        characterBackgrounds: characterAssets?.backgrounds || {}, // 角色背景配置
        // @ts-ignore
        cover: (characterAssets as any)?.cover || configFile.cover, // 导入包中的封面图 (data URL) 或 config 中的 cover 字段
        // @ts-ignore
        isFileImport: !configFile.name || !configFile.outputRequirements, // 标记是否为文件导入
        // @ts-ignore
        manifest: manifest, // 添加 manifest
      };
      
      // 预编译正则表达式（兼容不存在字段）
      // @ts-ignore
      const compiledRegex = this.compileRegexPatterns((finalConfig as any).regexPatterns || []);
      
      console.log('✅ 统一剧本配置导入成功');
      return {
        scriptConfig: finalConfig,
        variableConfig,
        compiledRegex
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('未找到')) {
        throw error;
      }
      throw new Error(`解压压缩包失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 从压缩包中提取角色头像和背景图片，直接保存为文件
   */
  private async extractCharacterAvatars(zipContent: JSZip): Promise<{
    avatars: Record<string, string>;
    backgrounds: Record<string, string>;
  } | null> {
    try {
      const avatarFolder = 'assets/avatar/';
      const backgroundFolder = 'assets/background/';
      const characterAvatars: Record<string, string> = {};
      const characterBackgrounds: Record<string, string> = {};
      
      console.log('🔍 开始从ZIP文件提取角色头像和背景图片...');
      
      // 查找图片文件的扩展名
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
      
      // 查找头像文件
      const avatarFiles = Object.keys(zipContent.files).filter(fileName => {
        const lowerName = fileName.toLowerCase();
        return (
          lowerName.startsWith(avatarFolder.toLowerCase()) &&
          !zipContent.files[fileName].dir &&
          imageExtensions.some(ext => lowerName.endsWith(ext))
        );
      });
      
      // 查找背景文件
      const backgroundFiles = Object.keys(zipContent.files).filter(fileName => {
        const lowerName = fileName.toLowerCase();
        return (
          lowerName.startsWith(backgroundFolder.toLowerCase()) &&
          !zipContent.files[fileName].dir &&
          imageExtensions.some(ext => lowerName.endsWith(ext))
        );
      });
      
      console.log(`📁 找到 ${avatarFiles.length} 个头像文件和 ${backgroundFiles.length} 个背景文件`);

      // 还尝试查找封面文件 (assets/cover.*)
      const coverCandidates = Object.keys(zipContent.files).filter(fileName => {
        const lowerName = fileName.toLowerCase();
        return (
          lowerName.startsWith('assets/') &&
          !zipContent.files[fileName].dir &&
          (lowerName.endsWith('/cover.png') || lowerName.endsWith('/cover.jpg') || lowerName.endsWith('/cover.jpeg') || lowerName.endsWith('/cover.webp') || lowerName.endsWith('/cover.gif') || lowerName.endsWith('/cover.svg') || lowerName.endsWith('assets/cover.png') || lowerName === 'assets/cover.png' || lowerName === 'cover.png')
        );
      });

      let foundCoverPath: string | null = null;
      if (coverCandidates.length > 0) {
        // 优先选择根目录下的 assets/cover.*，否则取第一个匹配
        const rootCover = coverCandidates.find(p => p.toLowerCase() === 'assets/cover.png' || p.toLowerCase() === 'assets/cover.jpg' || p.toLowerCase() === 'assets/cover.jpeg');
        foundCoverPath = rootCover || coverCandidates[0];
        console.log(`📷 找到封面文件: ${foundCoverPath}`);
      }
      
      // 处理头像文件 - 直接保存为临时文件，避免data URL
      for (const filePath of avatarFiles) {
        try {
          // 提取文件名作为角色名（去除扩展名）
          const fileName = filePath.substring(avatarFolder.length);
          const characterName = fileName.replace(/\.[^/.]+$/, ''); // 去除扩展名
          
          // 读取图片文件为base64
          const imageData = await zipContent.file(filePath)!.async('base64');
          const fileExtension = fileName.split('.').pop()?.toLowerCase() || 'png';
          const mimeType = this.getMimeTypeFromExtension(fileExtension);
          
          // 构建data URL（暂时的，将被CharacterStorageService处理）
          const dataUrl = `data:${mimeType};base64,${imageData}`;
          
          characterAvatars[characterName] = dataUrl;
          console.log(`✅ 提取角色头像: ${characterName} (${filePath}) - 将由存储服务转换为文件`);
        } catch (error) {
          console.warn(`⚠️ 处理角色头像失败: ${filePath}`, error);
        }
      }
      
      // 处理背景文件 - 直接保存为临时文件，避免data URL
      for (const filePath of backgroundFiles) {
        try {
          // 提取文件名作为角色名（去除扩展名）
          const fileName = filePath.substring(backgroundFolder.length);
          const characterName = fileName.replace(/\.[^/.]+$/, ''); // 去除扩展名
          
          // 读取图片文件为base64
          const imageData = await zipContent.file(filePath)!.async('base64');
          const fileExtension = fileName.split('.').pop()?.toLowerCase() || 'png';
          const mimeType = this.getMimeTypeFromExtension(fileExtension);
          
          // 构建data URL（暂时的，将被CharacterStorageService处理）
          const dataUrl = `data:${mimeType};base64,${imageData}`;
          
          characterBackgrounds[characterName] = dataUrl;
          console.log(`✅ 提取角色背景: ${characterName} (${filePath}) - 将由存储服务转换为文件`);
        } catch (error) {
          console.warn(`⚠️ 处理角色背景失败: ${filePath}`, error);
        }
      }

      // 如果找到了封面文件，则读取并返回 data URL
      if (foundCoverPath) {
        try {
          const file = zipContent.file(foundCoverPath)!;
          const content = await file.async('base64');
          const ext = (() => {
            const m = foundCoverPath.match(/\.([a-z0-9]+)$/i);
            return m ? m[1].toLowerCase() : '';
          })();
          const mimeType = this.getMimeTypeFromExtension(ext);
          const dataUrl = `data:${mimeType};base64,${content}`;
          console.log(`✅ 提取封面图: ${foundCoverPath}`);
          return {
            avatars: characterAvatars,
            backgrounds: characterBackgrounds,
            cover: dataUrl
          } as any;
        } catch (error) {
          console.warn(`⚠️ 读取封面文件失败: ${foundCoverPath}`, error);
        }
      }
      
      const totalFound = Object.keys(characterAvatars).length + Object.keys(characterBackgrounds).length;
      if (totalFound > 0) {
        console.log(`🎭 成功提取角色资源 - 头像: ${Object.keys(characterAvatars).length}个, 背景: ${Object.keys(characterBackgrounds).length}个`);
        console.log(`🎭 头像角色列表:`, Object.keys(characterAvatars));
        console.log(`🎭 背景角色列表:`, Object.keys(characterBackgrounds));
        return {
          avatars: characterAvatars,
          backgrounds: characterBackgrounds
        };
      }
      
      console.log('⚠️ 未找到任何角色头像或背景文件');
      return null;
    } catch (error) {
      console.error('❌ 提取角色头像和背景时发生错误:', error);
      return null;
    }
  }

  /**
   * 根据文件扩展名获取MIME类型
   */
  private getMimeTypeFromExtension(extension: string): string {
    const mimeTypes: Record<string, string> = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml'
    };
    return mimeTypes[extension] || 'image/png';
  }

  /**
   * 预编译并排序正则表达式模式
   */
  private compileRegexPatterns(patterns: any[]): { pattern: RegExp; replacement: string; name?: string }[] {
    if (!patterns || patterns.length === 0) {
      return [];
    }

    // 过滤并预编译正则表达式
    const compiledPatterns = patterns
      .filter(p => p.enabled !== false && p.pattern && p.replacement !== undefined)
      .map(p => {
        try {
          const flags = p.flags || 'g'; // 默认全局匹配
          const regex = new RegExp(p.pattern, flags);
          return {
            pattern: regex,
            replacement: p.replacement,
            name: p.name,
            priority: p.priority || 0
          };
        } catch (error) {
          console.warn(`正则表达式编译失败: ${p.pattern}`, error);
          return null;
        }
      })
      .filter(p => p !== null) as { pattern: RegExp; replacement: string; name?: string; priority: number }[];

    // 按优先级排序：更高优先级的模式先执行
    // 相同优先级的按照模式复杂度排序（更具体的模式先执行）
    compiledPatterns.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // 优先级高的在前
      }
      // 按模式复杂度排序：更具体的模式（字符多、包含特殊字符多）优先
      const aComplexity = this.calculatePatternComplexity(a.pattern.source);
      const bComplexity = this.calculatePatternComplexity(b.pattern.source);
      return bComplexity - aComplexity;
    });

    console.log(`📝 正则表达式预编译完成，共 ${compiledPatterns.length} 个模式`);
    return compiledPatterns;
  }

  /**
   * 计算正则表达式模式的复杂度（用于排序）
   */
  private calculatePatternComplexity(pattern: string): number {
    let complexity = pattern.length; // 基础复杂度：长度
    
    // 特殊字符增加复杂度
    const specialChars = /[\\^$.*+?()[\]{}|]/g;
    const specialMatches = pattern.match(specialChars);
    if (specialMatches) {
      complexity += specialMatches.length * 2;
    }
    
    // 字符类增加复杂度
    const charClasses = /\[[^\]]+\]/g;
    const classMatches = pattern.match(charClasses);
    if (classMatches) {
      complexity += classMatches.length * 3;
    }
    
    // 量词增加复杂度
    const quantifiers = /[*+?{]\d*,?\d*[}]?/g;
    const quantifierMatches = pattern.match(quantifiers);
    if (quantifierMatches) {
      complexity += quantifierMatches.length * 2;
    }
    
    return complexity;
  }

  /**
   * 应用正则表达式模式到文本
   */
  applyRegexPatterns(text: string, compiledPatterns: { pattern: RegExp; replacement: string; name?: string }[]): string {
    let result = text;
    
    for (const { pattern, replacement, name } of compiledPatterns) {
      try {
        const beforeLength = result.length;
        result = result.replace(pattern, replacement);
        const afterLength = result.length;
        
        if (beforeLength !== afterLength && name) {
          console.log(`📝 正则表达式 "${name}" 处理完成，文本长度: ${beforeLength} -> ${afterLength}`);
        }
      } catch (error) {
        console.warn(`正则表达式应用失败: ${name || pattern.source}`, error);
      }
    }
    
    return result;
  }

  /**
   * 从JSON文件导入样式配置
   */
  private async importStyleConfigFromJson(fileUri: string): Promise<ScriptStyleConfigFile> {
    const content = await FileSystem.readAsStringAsync(fileUri);
    const config = JSON.parse(content) as ScriptStyleConfigFile;
    
    console.log('[ScriptService] 从JSON导入配置，原始字段:', {
      name: !!config.name,
      outputRequirements: !!config.outputRequirements,
      webViewHtml: !!config.webViewHtml,
      variablePrompt: !!config.variablePrompt,
      variablePromptType: typeof config.variablePrompt,
      variablePromptPreview: Array.isArray(config.variablePrompt) 
        ? `[消息数组, 长度: ${config.variablePrompt.length}]`
        : typeof config.variablePrompt === 'string'
          ? config.variablePrompt.substring(0, 50) + '...'
          : config.variablePrompt
    });
    
    // 验证配置文件格式
    if (!config.name || !config.outputRequirements) {
      throw new Error('样式配置文件格式不正确，至少需要包含 name 与 outputRequirements 字段');
    }
    
    // 如未内嵌webViewHtml，允许通过htmlAssetPath指定
    if (!config.webViewHtml && !(config as any).htmlAssetPath) {
      console.warn('样式配置未包含webViewHtml或htmlAssetPath，将使用默认HTML模板');
    }
    
    return config;
  }

  /**
   * 从压缩包导入样式配置
   */
  private async importStyleConfigFromArchive(fileUri: string): Promise<ScriptStyleConfigFile> {
    try {
      // 读取压缩包文件
      const zipData = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      // 解压压缩包
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(zipData, { base64: true });
      
      // 查找配置文件（优先查找config.json，然后是其他.json文件）
      let configFile: any = null;
      let configFileName = '';
      
      // 按优先级查找配置文件
      const configFileNames = ['config.json', 'style-config.json', 'script-config.json'];
      for (const name of configFileNames) {
        if (zipContent.file(name)) {
          const configContent = await zipContent.file(name)!.async('string');
          configFile = JSON.parse(configContent);
          configFileName = name;
          break;
        }
      }
      
      // 如果没找到预定义名称的配置文件，查找第一个.json文件
      if (!configFile) {
        const jsonFiles = Object.keys(zipContent.files).filter(name => 
          name.toLowerCase().endsWith('.json') && !zipContent.files[name].dir
        );
        if (jsonFiles.length > 0) {
          const firstJsonFile = jsonFiles[0];
          const configContent = await zipContent.file(firstJsonFile)!.async('string');
          configFile = JSON.parse(configContent);
          configFileName = firstJsonFile;
        }
      }
      
      if (!configFile) {
        throw new Error('压缩包中未找到有效的配置文件（JSON格式）');
      }
      
      // 验证配置文件格式
      if (!configFile.name || !configFile.outputRequirements) {
        throw new Error(`配置文件 ${configFileName} 格式不正确，至少需要包含 name 与 outputRequirements 字段`);
      }
      
      // 查找HTML文件
      let htmlFile: string | undefined;
      const htmlFileNames = ['index.html', 'template.html', 'script.html', 'style.html'];
      
      for (const name of htmlFileNames) {
        if (zipContent.file(name)) {
          htmlFile = await zipContent.file(name)!.async('string');
          break;
        }
      }
      
      // 如果没找到预定义名称的HTML文件，查找第一个.html文件
      if (!htmlFile) {
        const htmlFiles = Object.keys(zipContent.files).filter(name => 
          name.toLowerCase().endsWith('.html') && !zipContent.files[name].dir
        );
        if (htmlFiles.length > 0) {
          const firstHtmlFile = htmlFiles[0];
          htmlFile = await zipContent.file(firstHtmlFile)!.async('string');
        }
      }
      
      // 构建最终的配置对象
      const finalConfig: ScriptStyleConfigFile = {
        name: configFile.name,
        description: configFile.description,
        version: configFile.version,
        outputRequirements: configFile.outputRequirements,
        webViewHtml: htmlFile || configFile.webViewHtml, // 优先使用压缩包中的HTML文件
        variablePrompt: configFile.variablePrompt, // 添加 variablePrompt 字段
      };
      
      console.log('[ScriptService] 从压缩包导入配置，包含字段:', {
        name: !!finalConfig.name,
        outputRequirements: !!finalConfig.outputRequirements,
        webViewHtml: !!finalConfig.webViewHtml,
        variablePrompt: !!finalConfig.variablePrompt,
        variablePromptType: typeof finalConfig.variablePrompt,
        variablePromptPreview: Array.isArray(finalConfig.variablePrompt) 
          ? `[消息数组, 长度: ${finalConfig.variablePrompt.length}]`
          : typeof finalConfig.variablePrompt === 'string'
            ? finalConfig.variablePrompt.substring(0, 50) + '...'
            : finalConfig.variablePrompt
      });
      
      // 如果没有找到HTML文件，记录警告
      if (!htmlFile && !configFile.webViewHtml) {
        console.warn('压缩包中未找到HTML文件，将使用默认HTML模板');
      }
      
      return finalConfig;
    } catch (error) {
      if (error instanceof Error && error.message.includes('未找到')) {
        throw error;
      }
      throw new Error(`解压压缩包失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 导出样式配置为压缩包
   */
  async exportStyleConfigAsArchive(scriptId: string): Promise<string> {
    const script = await this.getScript(scriptId);
    if (!script || !script.styleConfig) {
      throw new Error('剧本不存在或没有样式配置');
    }
    
    try {
      const zip = new JSZip();
      
      // 添加配置文件
      const configFile: ScriptStyleConfigFile = {
        name: script.styleConfig.name,
        description: `从剧本 "${script.name}" 导出的样式配置`,
        version: '1.0.0',
        outputRequirements: script.styleConfig.outputRequirements,
        webViewHtml: script.styleConfig.webViewHtml,
        variablePrompt: script.styleConfig.variablePrompt, // 添加 variablePrompt 字段
      };
      
      zip.file('config.json', JSON.stringify(configFile, null, 2));
      
      // 如果有HTML内容，单独保存为HTML文件
      if (script.styleConfig.webViewHtml) {
        zip.file('index.html', script.styleConfig.webViewHtml);
      }
      
      // 生成压缩包
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // 转换为Base64字符串（用于保存到文件系统）
      const arrayBuffer = await zipBlob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      
      // 保存到临时文件
      const tempFileName = `style_config_${scriptId}_${Date.now()}.zip`;
      const tempFilePath = `${FileSystem.cacheDirectory}${tempFileName}`;
      
      await FileSystem.writeAsStringAsync(tempFilePath, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      return tempFilePath;
    } catch (error) {
      throw new Error(`导出样式配置失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 保存统一剧本配置（样式+变量+正则+文件系统导入数据）
   */
  async saveUnifiedScriptConfig(
    scriptId: string, 
    configFile: ScriptStyleConfigFile | any, // 支持文件系统导入的扩展配置
    variableConfig?: any
  ): Promise<void> {
    const script = await this.getScript(scriptId);
    if (!script) {
      throw new Error('剧本不存在');
    }

    console.log(`[ScriptService] 🔍 导入配置调试信息:`);
    console.log(`[ScriptService] ├─ configFile.name: ${configFile.name}`);
    console.log(`[ScriptService] ├─ configFile中是否有regexPatterns: ${!!(configFile as any).regexPatterns}`);
    console.log(`[ScriptService] ├─ regexPatterns类型: ${typeof (configFile as any).regexPatterns}`);
    console.log(`[ScriptService] ├─ regexPatterns是否为数组: ${Array.isArray((configFile as any).regexPatterns)}`);
    if ((configFile as any).regexPatterns) {
      console.log(`[ScriptService] ├─ regexPatterns数量: ${(configFile as any).regexPatterns.length}`);
      console.log(`[ScriptService] └─ regexPatterns前3个:`, (configFile as any).regexPatterns.slice(0, 3));
    }

    const styleConfig: ScriptStyleConfig = {
      id: `style_${Date.now()}`,
      name: configFile.name,
      outputRequirements: configFile.outputRequirements,
      webViewHtml: configFile.webViewHtml,
      variablePrompt: configFile.variablePrompt, // 添加 variablePrompt 字段
      createdAt: Date.now(),
    };

    // 保存 regexPatterns（如果存在）
    if ((configFile as any).regexPatterns) {
      (styleConfig as any).regexPatterns = (configFile as any).regexPatterns;
      console.log(`[ScriptService] 🎯 保存了 ${(configFile as any).regexPatterns.length} 个正则表达式模式`);
    } else {
      console.log(`[ScriptService] ⚠️ configFile中没有找到regexPatterns字段`);
    }

    console.log(`[ScriptService] 保存剧本 ${scriptId} 的样式配置，包含字段:`, {
      name: !!styleConfig.name,
      outputRequirements: !!styleConfig.outputRequirements,
      webViewHtml: !!styleConfig.webViewHtml,
      variablePrompt: !!styleConfig.variablePrompt,
      regexPatterns: !!((styleConfig as any).regexPatterns),
      regexPatternsCount: ((styleConfig as any).regexPatterns || []).length,
      variablePromptType: typeof styleConfig.variablePrompt,
      variablePromptPreview: Array.isArray(styleConfig.variablePrompt) 
        ? `[消息数组, 长度: ${styleConfig.variablePrompt.length}]`
        : typeof styleConfig.variablePrompt === 'string'
          ? styleConfig.variablePrompt.substring(0, 50) + '...'
          : styleConfig.variablePrompt
    });

    script.styleConfig = styleConfig;
    
    // 如果配置文件包含 manifest，保存到 script 对象上
    if ((configFile as any).manifest) {
      script.manifest = (configFile as any).manifest;
      console.log(`[ScriptService] ✅ 保存了 manifest 配置`);
    }
    
    // 如果配置中包含封面图（例如从压缩包提取的 data URL），一并保存到 script.cover
    try {
      // @ts-ignore
      if ((configFile as any).cover) {
        // @ts-ignore
        script.cover = (configFile as any).cover;
        console.log(`[ScriptService] ✅ 导入时保存了剧本封面 (data URL 或路径)`);
      }
    } catch (e) {
      console.warn('[ScriptService] 保存封面时发生错误:', e);
    }
    
    // 如果有变量配置，同时保存
    if (variableConfig) {
      script.variableConfig = variableConfig;
      
      // 清除变量管理器缓存，下次使用时会重新初始化
      try {
        ScriptVariableService.clearInstance(scriptId);
        console.log(`✅ 剧本 ${scriptId} 的变量配置已更新`);
      } catch (error) {
        console.warn('清除变量管理器缓存失败:', error);
      }
    }

    // 处理文件系统导入的额外数据
    if (configFile.isFileSystemImport) {
      console.log('[ScriptService] 💾 保存文件系统导入的额外数据');
      
      // 🆕 对 initialScene 进行宏替换
      let processedInitialScene = configFile.initialScene || '';
      const originalInitialScene = processedInitialScene; // 保存原始版本
      
      if (processedInitialScene.trim()) {
        console.log('[ScriptService] 🔄 对文件系统导入的 initialScene 进行宏替换');
        processedInitialScene = await this.processInitialSceneMacros(scriptId, processedInitialScene);
      }
      
      // 保存额外的文件系统导入数据到script对象
      (script as any).fileSystemImportData = {
        customCSS: configFile.customCSS || '',
        parsedTypes: configFile.parsedTypes || {},
        initialScene: processedInitialScene, // 使用替换后的内容
        originalInitialScene: originalInitialScene, // 🆕 保存原始内容用于后续重新处理
        isFileSystemImport: true
      };
    }
    
    script.updatedAt = Date.now();
    await this.saveScript(script);
    
    // 🔍 保存后验证：重新读取脚本数据并检查regexPatterns
    console.log(`[ScriptService] 🔍 保存后验证regexPatterns:`);
    const savedScript = await this.getScript(scriptId);
    console.log(`[ScriptService] ├─ 重新读取脚本成功: ${!!savedScript}`);
    console.log(`[ScriptService] ├─ 保存后styleConfig存在: ${!!savedScript?.styleConfig}`);
    console.log(`[ScriptService] ├─ 保存后regexPatterns存在: ${!!((savedScript as any)?.styleConfig?.regexPatterns)}`);
    if ((savedScript as any)?.styleConfig?.regexPatterns) {
      console.log(`[ScriptService] ├─ 保存后regexPatterns数量: ${(savedScript as any).styleConfig.regexPatterns.length}`);
      console.log(`[ScriptService] └─ 保存后regexPatterns前2个:`, (savedScript as any).styleConfig.regexPatterns.slice(0, 2));
    } else {
      console.log(`[ScriptService] └─ 保存后regexPatterns: undefined`);
    }
  }

  /**
   * 获取统一剧本配置（包括文件系统导入的额外数据）
   */
  async getUnifiedScriptConfig(scriptId: string): Promise<{
    config: any;
    variables?: any;
    customCSS?: string;
    parsedTypes?: any;
    initialScene?: string;
    isFileSystemImport?: boolean;
  } | null> {
    const script = await this.getScript(scriptId);
    if (!script) {
      return null;
    }

    const result = {
      config: script.styleConfig,
      variables: script.variableConfig,
      customCSS: '',
      parsedTypes: {},
      initialScene: '',
      isFileSystemImport: false
    };

    // 如果是文件系统导入的剧本，添加额外数据
    const fileSystemData = (script as any).fileSystemImportData;
    if (fileSystemData) {
      result.customCSS = fileSystemData.customCSS || '';
      result.parsedTypes = fileSystemData.parsedTypes || {};
      result.initialScene = fileSystemData.initialScene || '';
      result.isFileSystemImport = fileSystemData.isFileSystemImport || false;
    }

    return result;
  }

  /**
   * 获取剧本的预编译正则表达式
   */
  async getCompiledRegexPatterns(scriptId: string): Promise<{ pattern: RegExp; replacement: string; name?: string }[]> {
    const script = await this.getScript(scriptId);
    
    console.log(`[ScriptService] 🔍 getCompiledRegexPatterns 调试信息:`);
    console.log(`[ScriptService] ├─ 脚本ID: ${scriptId}`);
    console.log(`[ScriptService] ├─ script存在: ${!!script}`);
    console.log(`[ScriptService] ├─ styleConfig存在: ${!!script?.styleConfig}`);
    console.log(`[ScriptService] ├─ regexPatterns字段存在: ${!!((script as any)?.styleConfig?.regexPatterns)}`);
    console.log(`[ScriptService] ├─ regexPatterns类型: ${typeof (script as any)?.styleConfig?.regexPatterns}`);
    console.log(`[ScriptService] ├─ regexPatterns是否为数组: ${Array.isArray((script as any)?.styleConfig?.regexPatterns)}`);
    if ((script as any)?.styleConfig?.regexPatterns) {
      console.log(`[ScriptService] ├─ regexPatterns数量: ${(script as any).styleConfig.regexPatterns.length}`);
      console.log(`[ScriptService] └─ regexPatterns内容:`, (script as any).styleConfig.regexPatterns.slice(0, 2));
    } else {
      console.log(`[ScriptService] └─ regexPatterns内容: undefined`);
    }
    
    // 兼容：regexPatterns 可能不存在
    const regexPatterns = (script as any)?.styleConfig?.regexPatterns;
    if (!regexPatterns) {
      return [];
    }
    return this.compileRegexPatterns(regexPatterns);
  }

  /**
   * 保存剧本样式配置
   * @deprecated 请使用 saveUnifiedScriptConfig 方法
   */
  async saveScriptStyleConfig(scriptId: string, configFile: ScriptStyleConfigFile): Promise<void> {
    return this.saveUnifiedScriptConfig(scriptId, configFile);
  }

  /**
   * 清除剧本样式配置
   */
  async clearScriptStyleConfig(scriptId: string): Promise<void> {
    const script = await this.getScript(scriptId);
    if (!script) {
      throw new Error('剧本不存在');
    }

    script.styleConfig = undefined;
    script.updatedAt = Date.now();
    
    await this.saveScript(script);
  }

  /**
   * 导入变量配置文件（支持JSON文件）
   */
  async importVariableConfig(): Promise<VariableSystemConfig | null> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json'],
        copyToCacheDirectory: true,
      });
      
      if (!result.assets || !result.assets[0]) {
        return null;
      }
      
      const fileUri = result.assets[0].uri;
      const content = await FileSystem.readAsStringAsync(fileUri);
      const config = JSON.parse(content) as VariableSystemConfig;
      
      // 验证配置文件格式
      if (!config || typeof config !== 'object') {
        throw new Error('变量配置文件格式不正确');
      }
      
      console.log('✅ 变量配置文件导入成功');
      return config;
    } catch (error) {
      throw new Error(`导入变量配置失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 保存剧本变量配置
   */
  async saveScriptVariableConfig(scriptId: string, variableConfig: VariableSystemConfig): Promise<void> {
    const script = await this.getScript(scriptId);
    if (!script) {
      throw new Error('剧本不存在');
    }

    script.variableConfig = variableConfig;
    script.updatedAt = Date.now();
    
    await this.saveScript(script);
    
    // 清除变量管理器缓存，下次使用时会重新初始化
    try {
      ScriptVariableService.clearInstance(scriptId);
      console.log(`✅ 剧本 ${scriptId} 的变量配置已更新`);
    } catch (error) {
      console.warn('清除变量管理器缓存失败:', error);
    }
  }

  /**
   * 清除剧本变量配置
   */
  async clearScriptVariableConfig(scriptId: string): Promise<void> {
    const script = await this.getScript(scriptId);
    if (!script) {
      throw new Error('剧本不存在');
    }

    script.variableConfig = undefined;
    script.updatedAt = Date.now();
    
    await this.saveScript(script);
    
    // 清除变量管理器缓存
    try {
      ScriptVariableService.clearInstance(scriptId);
      console.log(`🗑️ 剧本 ${scriptId} 的变量配置已清除`);
    } catch (error) {
      console.warn('清除变量管理器缓存失败:', error);
    }
  }

  /**
   * 导出剧本变量配置
   */
  async exportScriptVariableConfig(scriptId: string): Promise<string | null> {
    try {
       return await VariableProcessor.exportVariableConfig(scriptId);
    } catch (error) {
      console.error(`导出剧本 ${scriptId} 变量配置失败:`, error);
      return null;
    }
  }

  /**
   * 获取角色名称
   */
  async getCharacterName(characterId: string): Promise<string> {
    try {
      const roleCard = await StorageAdapter.loadJson<RoleCardJson | null>(
        StorageAdapter.getStorageKey(characterId, '_role')
      );
      return roleCard?.name || characterId;
    } catch {
      return characterId;
    }
  }

  /**
   * 获取剧本的资源配置（从 styleConfig 的 parsedTypes 字段）
   */
  async getResourcesForScript(scriptId: string): Promise<{
    sprites: string[];
    backgrounds: string[];
    effects: string[];
    soundEffects: string[];
  }> {
    console.log(`🎨 [ScriptService] 获取剧本 ${scriptId} 的资源配置`);
    
    try {
      // 从统一配置中获取 parsedTypes
      const unifiedConfig = await this.getUnifiedScriptConfig(scriptId);
      const parsedTypes = unifiedConfig?.parsedTypes;
      
      if (!parsedTypes) {
        console.warn(`[ScriptService] 剧本 ${scriptId} 未找到 parsedTypes 配置`);
        return {
          sprites: [],
          backgrounds: [],
          effects: [],
          soundEffects: []
        };
      }

      console.log(`🎨 [ScriptService] parsedTypes 配置存在，开始提取资源名称`);

      // 提取 sprites 资源名称（从对象的 keys）
      const sprites: string[] = parsedTypes.sprites 
        ? Object.keys(parsedTypes.sprites) 
        : [];

      // 提取 backgrounds 资源名称（从对象的 keys）
      const backgrounds: string[] = parsedTypes.backgrounds 
        ? Object.keys(parsedTypes.backgrounds) 
        : [];

      // 提取 effects 资源名称（直接从数组）
      const effects: string[] = Array.isArray(parsedTypes.effects) 
        ? parsedTypes.effects 
        : [];

      // 提取 soundEffects 资源名称（从对象的 keys）
      const soundEffects: string[] = parsedTypes.soundEffects 
        ? Object.keys(parsedTypes.soundEffects) 
        : [];

      console.log(`🎨 [ScriptService] 资源提取完成:`, {
        sprites: sprites.length,
        backgrounds: backgrounds.length,
        effects: effects.length,
        soundEffects: soundEffects.length
      });

      return {
        sprites,
        backgrounds,
        effects,
        soundEffects
      };

    } catch (error) {
      console.error(`[ScriptService] 获取剧本 ${scriptId} 资源配置时出错:`, error);
      return {
        sprites: [],
        backgrounds: [],
        effects: [],
        soundEffects: []
      };
    }
  }

  /**
   * 生成剧本渲染数据，支持客户端分页
   * @param scriptId 剧本ID
   * @param currentResponse 当前AI响应
   * @param updateType 更新类型：'full' 完整更新，'append' 增量追加
   */
  async generateScriptRenderData(scriptId: string, currentResponse?: ScriptResponse, updateType: 'full' | 'append' = 'full'): Promise<ScriptRenderData> {
    const script = await this.getScript(scriptId);
    if (!script) {
      throw new Error('剧本不存在');
    }

    // 获取历史消息
    const allHistory = await this.getScriptHistory(scriptId);
    
    // 🚀 过滤掉总结消息，只保留常规消息用于WebView渲染
    const renderableHistory = allHistory.filter(message => !this.isMemorySummaryMessage(message));
    
    console.log(`[ScriptService] 过滤消息 - 总消息数: ${allHistory.length}, 可渲染消息数: ${renderableHistory.length}, 总结消息数: ${allHistory.length - renderableHistory.length}`);
    
    // 构建角色信息用于metadata
    const characterNames: string[] = [];
    for (const characterId of script.selectedCharacters) {
      const name = await this.getCharacterName(characterId);
      characterNames.push(name);
    }

    // 生成基础渲染数据结构
    const renderData: ScriptRenderData = {
      title: script.name,
      subtitle: `创建时间：${new Date(script.createdAt).toLocaleDateString()} · 参与角色：${characterNames.join(', ')}`,
      summary: '',
      metadata: {
      },
      pages: [], // 客户端负责分页
      currentPage: 0,
      totalPages: 0,
      choices: currentResponse?.choices || [],
      isLoading: false,
      updateType,
      messageIds: [],
      characterAvatars: (script.styleConfig as any)?.characterAvatars || null
    };

    // 简化：只传递最小信息 — 原始AI响应字符串
    // 🚀 优先使用 currentResponse._rawResponse，其次尝试从可渲染历史最后一条获取
    const raw = (currentResponse && (currentResponse as any)._rawResponse) ||
      (renderableHistory.length > 0 ? (renderableHistory[renderableHistory.length - 1].aiResponse._rawResponse || '') : '');

    renderData.pages = []; // 保持类型兼容
    renderData.totalPages = 0;
    renderData.currentPage = 0;
    // 只提供一个简短 payload 字段，用于 WebView 接收原始文本
    (renderData as any).rawResponse = raw || '';
    // 🚀 只返回可渲染消息的ID，不包含总结消息
    renderData.messageIds = renderableHistory.map(h => h.id);
    if (currentResponse) renderData.messageIds.push('current_response');

    return renderData;
  }

  /**
   * 递归替换对象中的固有宏
   */
  private replaceMacrosInObject(obj: any, userName: string, lastUserMessage: string): any {
    if (typeof obj === 'string') {
      return obj
        .replace(/\{\{user\}\}/g, `[USER_PLACEHOLDER:${encodeURIComponent(userName)}]`)
        .replace(/\{\{lastUserMessage\}\}/g, `[LAST_USER_MESSAGE_PLACEHOLDER:${encodeURIComponent(lastUserMessage)}]`);
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.replaceMacrosInObject(item, userName, lastUserMessage));
    } else if (typeof obj === 'object' && obj !== null) {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.replaceMacrosInObject(value, userName, lastUserMessage);
      }
      return result;
    }
    return obj;
  }

  /**
   * 递归替换对象中的固有宏（异步版本，支持资源宏）
   */
  private async replaceMacrosInObjectAsync(obj: any, userName: string, lastUserMessage: string, scriptId: string): Promise<any> {
    if (typeof obj === 'string') {
      return await this.replaceBuiltinMacrosAsync(obj, userName, lastUserMessage, scriptId);
    } else if (Array.isArray(obj)) {
      const results = await Promise.all(obj.map(item => this.replaceMacrosInObjectAsync(item, userName, lastUserMessage, scriptId)));
      return results;
    } else if (typeof obj === 'object' && obj !== null) {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = await this.replaceMacrosInObjectAsync(value, userName, lastUserMessage, scriptId);
      }
      return result;
    }
    return obj;
  }

  /**
   * 处理outputRequirements，如果包含prompts和prompt_order则进行排序
   */
  private processOutputRequirements(outputRequirements: any): any {
    // 如果不是对象或没有prompts和prompt_order，直接返回
    if (!outputRequirements || typeof outputRequirements !== 'object') {
      return outputRequirements;
    }

    const hasPrompts = Array.isArray(outputRequirements.prompts);
    const hasPromptOrder = Array.isArray(outputRequirements.prompt_order);

    if (!hasPrompts || !hasPromptOrder) {
      return outputRequirements;
    }

    console.log('[ScriptService] 检测到prompts和prompt_order结构，开始排序处理');

    // 创建排序映射表
    const orderMap = new Map<string, number>();
    const enabledMap = new Map<string, boolean>();

    // 选取prompt_order数组中order条目最多的对象
    let bestPromptOrderObj = null;
    if (Array.isArray(outputRequirements.prompt_order)) {
      bestPromptOrderObj = outputRequirements.prompt_order.reduce(
        (prev: any, curr: any) => {
          if (!curr || !Array.isArray(curr.order)) return prev;
          if (!prev || (curr.order.length > prev.order.length)) return curr;
          return prev;
        },
        null
      );
    }

    if (!bestPromptOrderObj || !Array.isArray(bestPromptOrderObj.order)) {
      console.warn('[ScriptService] prompt_order结构无效，跳过排序');
      return outputRequirements;
    }

    console.log('[ScriptService] 使用prompt_order对象:', {
      character_id: bestPromptOrderObj.character_id,
      orderLength: bestPromptOrderObj.order.length
    });

    // 构建排序映射
    // 支持 prompt_order 中使用 enabled 或 enable 字段作为开关
    bestPromptOrderObj.order.forEach((item: any, index: number) => {
      if (!item.identifier) {
        console.warn(`[ScriptService] prompt_order[${index}] 缺少 identifier 字段`);
        return;
      }
      orderMap.set(item.identifier, index);
      // 支持多种命名：优先使用 enabled，其次使用 enable；若都不存在，默认 true
      let orderEnabled = true;
      if (typeof item.enabled !== 'undefined') {
        orderEnabled = !!item.enabled;
      } else if (typeof item.enable !== 'undefined') {
        orderEnabled = !!item.enable;
      }
      enabledMap.set(item.identifier, orderEnabled);
    });

    // 对prompts进行排序
  const sortedPrompts = outputRequirements.prompts
      .filter((prompt: any) => {
        const isValid = !!(prompt && prompt.identifier && prompt.name);
        if (!isValid) {
          console.warn('[ScriptService] 过滤无效prompt:', prompt);
        }
        return isValid;
      })
      .map((prompt: any) => {
        // 检查 identifier 是否在 prompt_order 中
        if (!orderMap.has(prompt.identifier)) {
          console.warn(`[ScriptService] prompt.identifier "${prompt.identifier}" 未在 prompt_order 中找到`);
        }

        // 获取排序顺序，如果在 order 中找不到，则放到最后
        const sortOrder = orderMap.has(prompt.identifier) 
          ? orderMap.get(prompt.identifier)! 
          : Number.MAX_SAFE_INTEGER;

        // 获取启用状态：优先使用 prompt_order 中的设置（已统一为 enabledMap），
        // 若 prompt_order 中未指定，则回退到 prompt 本身的 enable/enabled 字段
        const enable = enabledMap.has(prompt.identifier)
          ? enabledMap.get(prompt.identifier)
          : (typeof prompt.enabled !== 'undefined' ? !!prompt.enabled : (typeof prompt.enable !== 'undefined' ? !!prompt.enable : true));

        return {
          ...prompt,
          enable, // 标记最终启用状态（用于后续过滤）
          sortOrder // 临时字段，用于排序
        };
      })
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
      .map(({ sortOrder, ...prompt }: any) => prompt) // 移除临时字段
      // 最终过滤：移除在 prompt_order 中被显式禁用（enable/enabled=false）的 prompt
      .filter((p: any) => {
        // 只有当 enable === false 时移除，其他情况保留
        if (p && typeof p.enable !== 'undefined' && p.enable === false) {
          console.log(`[ScriptService] prompt "${p.identifier}" 因 prompt_order 配置被禁用，已移除`);
          return false;
        }
        return true;
      });

    console.log('[ScriptService] prompts排序完成:', sortedPrompts.map((p: any, idx: number) => ({
      name: p.name,
      identifier: p.identifier,
      finalOrder: idx,
      enable: p.enable
    })));

    // 返回处理后的配置
    return {
      ...outputRequirements,
      prompts: sortedPrompts
    };
  }

  // ========================================
  // 总结管理 API 方法
  // ========================================

  /**
   * 获取剧本的所有历史总结列表
   */
  async listSummaries(scriptId: string): Promise<ScriptSummary[]> {
    try {
      const history = await this.getScriptHistory(scriptId);
      const summaries: ScriptSummary[] = [];

      for (const message of history) {
        if (this.isMemorySummaryMessage(message)) {
          const summary: ScriptSummary = {
            id: message.id,
            scriptId: scriptId,
            type: message.aiResponse._summaryType || 'incremental',
            content: this.extractPlotContent(message.aiResponse),
            originalMessagesCount: message.aiResponse._originalMessagesCount || 0,
            originalMessageIds: message.aiResponse._originalMessageIds || [],
            createdAt: message.aiResponse._summarizedAt || message.timestamp,
            updatedAt: message.aiResponse._editedAt,
            isEdited: message.aiResponse._isEdited || false
          };
          summaries.push(summary);
        }
      }

      // 按创建时间排序（最新的在前）
      summaries.sort((a, b) => b.createdAt - a.createdAt);
      
      console.log(`[ScriptService] 获取剧本 ${scriptId} 的总结列表，共 ${summaries.length} 条`);
      return summaries;
    } catch (error) {
      console.error('[ScriptService] 获取总结列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取特定总结的详细信息
   */
  async getSummary(scriptId: string, summaryId: string): Promise<ScriptSummary | null> {
    try {
      const summaries = await this.listSummaries(scriptId);
      const summary = summaries.find(s => s.id === summaryId);
      
      if (!summary) {
        console.log(`[ScriptService] 总结 ${summaryId} 在剧本 ${scriptId} 中不存在`);
        return null;
      }

      return summary;
    } catch (error) {
      console.error('[ScriptService] 获取总结详情失败:', error);
      throw error;
    }
  }

  /**
   * 更新总结内容
   */
  async updateSummary(scriptId: string, summaryId: string, newContent: string): Promise<SummaryOperationResult> {
    try {
      const history = await this.getScriptHistory(scriptId);
      const messageIndex = history.findIndex(m => m.id === summaryId);
      
      if (messageIndex === -1) {
        return {
          success: false,
          message: `总结 ${summaryId} 不存在`
        };
      }

      const message = history[messageIndex];
      if (!this.isMemorySummaryMessage(message)) {
        return {
          success: false,
          message: `消息 ${summaryId} 不是总结消息`
        };
      }

      // 备份原始内容（如果是第一次编辑）
      if (!message.aiResponse._originalContent) {
        message.aiResponse._originalContent = this.extractPlotContent(message.aiResponse);
      }

      // 更新内容
      message.aiResponse.plotContent = newContent;
      message.aiResponse._isEdited = true;
      message.aiResponse._editedAt = Date.now();

      // 保存更新后的历史
      const historyKey = `script_history_${scriptId}`;
      await StorageAdapter.saveJson(historyKey, history);

      console.log(`[ScriptService] 总结 ${summaryId} 更新成功`);
      return {
        success: true,
        message: '总结更新成功',
        data: { summaryId, updatedAt: message.aiResponse._editedAt }
      };
    } catch (error) {
      console.error('[ScriptService] 更新总结失败:', error);
      return {
        success: false,
        message: `更新失败: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 删除总结并恢复原始消息
   */
  async deleteSummary(scriptId: string, summaryId: string): Promise<SummaryOperationResult> {
    try {
      const history = await this.getScriptHistory(scriptId);
      const messageIndex = history.findIndex(m => m.id === summaryId);
      
      if (messageIndex === -1) {
        return {
          success: false,
          message: `总结 ${summaryId} 不存在`
        };
      }

      const summaryMessage = history[messageIndex];
      if (!this.isMemorySummaryMessage(summaryMessage)) {
        return {
          success: false,
          message: `消息 ${summaryId} 不是总结消息`
        };
      }

      // 删除总结消息
      history.splice(messageIndex, 1);

      // 注意：根据实际需求，可以选择恢复原始消息或只是删除总结
      // 这里我们只删除总结消息，不恢复原始消息（因为原始消息可能已经不存在）
      // 如果需要恢复原始消息，需要在总结时保存原始消息的完整副本

      // 保存更新后的历史
      const historyKey = `script_history_${scriptId}`;
      await StorageAdapter.saveJson(historyKey, history);

      console.log(`[ScriptService] 总结 ${summaryId} 删除成功`);
      return {
        success: true,
        message: '总结删除成功',
        data: { 
          summaryId, 
          deletedAt: Date.now(),
          note: '原始消息无法恢复，因为已被总结替换'
        }
      };
    } catch (error) {
      console.error('[ScriptService] 删除总结失败:', error);
      return {
        success: false,
        message: `删除失败: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 重置总结内容到原始版本
   */
  async resetSummary(scriptId: string, summaryId: string): Promise<SummaryOperationResult> {
    try {
      const history = await this.getScriptHistory(scriptId);
      const messageIndex = history.findIndex(m => m.id === summaryId);
      
      if (messageIndex === -1) {
        return {
          success: false,
          message: `总结 ${summaryId} 不存在`
        };
      }

      const message = history[messageIndex];
      if (!this.isMemorySummaryMessage(message)) {
        return {
          success: false,
          message: `消息 ${summaryId} 不是总结消息`
        };
      }

      if (!message.aiResponse._originalContent) {
        return {
          success: false,
          message: '该总结没有原始版本可以恢复'
        };
      }

      // 恢复到原始内容
      message.aiResponse.plotContent = message.aiResponse._originalContent;
      message.aiResponse._isEdited = false;
      delete message.aiResponse._editedAt;

      // 保存更新后的历史
      const historyKey = `script_history_${scriptId}`;
      await StorageAdapter.saveJson(historyKey, history);

      console.log(`[ScriptService] 总结 ${summaryId} 重置成功`);
      return {
        success: true,
        message: '总结已重置到原始版本',
        data: { summaryId, resetAt: Date.now() }
      };
    } catch (error) {
      console.error('[ScriptService] 重置总结失败:', error);
      return {
        success: false,
        message: `重置失败: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 获取总结统计信息
   */
  async getSummaryStats(scriptId: string): Promise<{
    totalSummaries: number;
    incrementalSummaries: number;
    metaSummaries: number;
    editedSummaries: number;
    totalOriginalMessages: number;
  }> {
    try {
      const summaries = await this.listSummaries(scriptId);
      
      const stats = {
        totalSummaries: summaries.length,
        incrementalSummaries: summaries.filter(s => s.type === 'incremental').length,
        metaSummaries: summaries.filter(s => s.type === 'meta').length,
        editedSummaries: summaries.filter(s => s.isEdited).length,
        totalOriginalMessages: summaries.reduce((total, s) => total + s.originalMessagesCount, 0)
      };

      console.log(`[ScriptService] 剧本 ${scriptId} 总结统计:`, stats);
      return stats;
    } catch (error) {
      console.error('[ScriptService] 获取总结统计失败:', error);
      throw error;
    }
  }
}