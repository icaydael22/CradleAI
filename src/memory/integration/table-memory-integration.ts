/**
 * 表格记忆插件集成
 * 
 * 该模块负责将表格记忆插件集成到Mem0记忆系统中，实现向量记忆和表格记忆的协同工作。
 */

import * as TableMemory from '../plugins/table-memory';
import { getFactRetrievalMessages } from '../prompts';
import { Message, SearchFilters } from '../types';
import Mem0Service from '../services/Mem0Service';

// 表格记忆插件是否被启用
let tableMemoryEnabled = false;

/**
 * 生成唯一调用标识
 */
function generateCallId(prefix: string = ''): string {
  return `${prefix}${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

/**
 * 获取调用堆栈信息
 */
function getCallerStack(): string {
  const err = new Error();
  if (err.stack) {
    // 只保留前5行
    return err.stack.split('\n').slice(2, 7).join('\n');
  }
  return '';
}

/**
 * 初始化表格记忆插件
 * @param options 初始化选项
 * @returns 初始化是否成功
 */
export async function initializeTableMemory(options: { 
  dbPath?: string; 
  defaultTemplates?: boolean;
  enabled?: boolean;
} = {}): Promise<boolean> {
  try {
    console.log('[TableMemoryIntegration] 初始化表格记忆插件...');
    
    // 检查是否需要先尝试重置数据库
    try {
      // 这个检查方法是新增的，可能首次初始化时不存在
      const dbStatus = await TableMemory.API.checkDatabaseLock?.();
      if (dbStatus && dbStatus.isLocked) {
        console.warn(`[TableMemoryIntegration] 检测到数据库可能处于锁定状态，尝试重置连接`);
        await TableMemory.resetDatabaseConnection?.();
      }
    } catch (e) {
      // 忽略错误，这个方法可能不存在
    }
    
    const success = await TableMemory.API.init(options);
    
    if (success) {
      console.log('[TableMemoryIntegration] 表格记忆插件初始化成功');
      tableMemoryEnabled = options.enabled ?? true;
    } else {
      console.error('[TableMemoryIntegration] 表格记忆插件初始化失败');
      tableMemoryEnabled = false;
    }
    
    return success;
  } catch (error) {
    console.error('[TableMemoryIntegration] 初始化表格记忆插件时出错:', error);
    tableMemoryEnabled = false;
    return false;
  }
}

/**
 * 设置表格记忆插件启用状态
 * @param enabled 是否启用
 */
export function setTableMemoryEnabled(enabled: boolean): void {
  tableMemoryEnabled = enabled;
  TableMemory.setEnabled(enabled);
  console.log(`[TableMemoryIntegration] 表格记忆插件${enabled ? '已启用' : '已禁用'}`);
}

/**
 * 获取表格记忆插件启用状态
 * @returns 是否启用
 */
export function isTableMemoryEnabled(): boolean {
  return tableMemoryEnabled && TableMemory.isEnabled();
}

/**
 * 增强提示词，添加表格记忆相关内容
 * @param systemPrompt 原系统提示词
 * @param userPrompt 原用户提示词
 * @param tableData 表格数据
 * @param options 选项
 * @returns 增强后的提示词对
 */
export function enhancePromptsWithTableMemory(
  systemPrompt: string,
  userPrompt: string,
  tableData: any,
  options: { userName?: string; aiName?: string } = {}
): [string, string] {
  if (!tableMemoryEnabled || !tableData) {
    return [systemPrompt, userPrompt];
  }
  
  // 提取表格文本表示，便于在提示词中显示
  let tableText = '';
  if (Array.isArray(tableData)) {
    // 如果是表格数组，拼接每个表格的文本表示
    tableText = tableData.map(sheet => {
      // 优化：如果表格内容为空，则插入标题行而不是"空表格"
      if (
        Array.isArray(sheet.headers) &&
        sheet.headers.length > 0 &&
        Array.isArray(sheet.rows) &&
        sheet.rows.length === 0
      ) {
        // 只显示标题行
        return `表格名称: ${sheet.name}\n${sheet.headers.join(' | ')}`;
      }
      // 如果有内容，正常显示
      if (sheet.tableText && typeof sheet.tableText === 'string' && sheet.tableText.trim() !== '') {
        return `表格名称: ${sheet.name}\n${sheet.tableText}`;
      }
      // 如果没有tableText但有行数据
      if (Array.isArray(sheet.headers) && Array.isArray(sheet.rows) && sheet.rows.length > 0) {
        const headerLine = sheet.headers.join(' | ');
        const rowLines = sheet.rows.map((row: string[]) => row.join(' | ')).join('\n');
        return `表格名称: ${sheet.name}\n${headerLine}\n${rowLines}`;
      }
      // 兜底：只显示表名和标题
      if (Array.isArray(sheet.headers) && sheet.headers.length > 0) {
        return `表格名称: ${sheet.name}\n${sheet.headers.join(' | ')}`;
      }
      // 其它情况
      return `表格名称: ${sheet.name}`;
    }).join('\n\n');
  } else if (typeof tableData === 'string') {
    tableText = tableData;
  } else {
    tableText = JSON.stringify(tableData, null, 2);
  }

  // 增强系统提示词
  const enhancedSystemPrompt = `${systemPrompt}

此外，你需要同时维护用户的表格记忆。表格记忆是以表格形式组织的结构化信息，它与向量记忆共同构成完整的记忆系统。

${tableData ? `当前表格数据:
${tableText}` : '目前没有表格数据，需要根据对话创建新表格。'}

请按照以下规则处理表格:
1. 保持表格结构不变，不要添加或删除列
2. 基于对话内容添加新行或更新现有行
3. 将相关信息分类到正确的列中
4. 如果信息不确定，使用空值而非猜测
5. 返回的JSON必须包含facts和tableActions两个部分
6. 对话中的信息可能需要同时更新多个表格，请确保所有相关表格都得到更新
7. **在有多个表格时，必须全面检查每个表格，确保所有需要更新的表格都被更新，不能遗漏任何应更新的表格。每个表格的操作都要在tableActions中单独列出。**
`;

  // 增强用户提示词
  const enhancedUserPrompt = `${userPrompt}

请分析对话内容，同时提取事实信息和表格更新操作，然后以JSON格式返回两部分内容:
1. "facts": 从对话中提取的事实数组
2. "tableActions": 表格更新操作数组，每个操作包含:
   - "action": "insert"/"update"/"delete" 之一
   - "sheetId": 表格ID
   - "sheetName": 表格名称 (可选，如果提供sheetId则不需要)
   - "rowData"(对于insert/update): 包含列索引和值的对象，例如 {"0": "值1", "1": "值2"}
   - "rowIndex"(对于update/delete): 要更新或删除的行索引

**如果有多个表格，必须对每个需要更新的表格都进行检查和操作，不能遗漏任何应更新的表格。每个表格的操作都要在tableActions数组中单独列出。**

示例响应格式(多表格更新示例):
{
  "facts": ["用户喜欢民族歌手", "用户的名字是李明"],
  "tableActions": [
    {
      "action": "insert",
      "sheetName": "角色特征表格",
      "rowData": {"0": "李明", "1": "用户", "2": "喜欢民族歌手"}
    },
    {
      "action": "update",
      "sheetName": "社交关系表格",
      "rowIndex": 1,
      "rowData": {"0": "李明", "1": "朋友", "2": "友好"}
    }
  ]
}

可用的表格名称有: ${Array.isArray(tableData) ? tableData.map(t => `"${t.name}"`).join(", ") : "请根据表格数据使用对应的表格名称"}
请确保返回有效的JSON格式。`;

  return [enhancedSystemPrompt, enhancedUserPrompt];
}

/**
 * 自定义多模式提示词构建器
 * @param content 内容
 * @param tableData 表格数据
 * @param isMultiRound 是否多轮对话
 * @param options 选项
 * @returns 提示词对
 */
export function getFactRetrievalAndTableUpdateMessages(
  content: string,
  tableData: any,
  isMultiRound: boolean = false,
  options: { userName?: string; aiName?: string } = {}
): [string, string] {
  // 获取基础事实提取提示词
  const [baseSystemPrompt, baseUserPrompt] = getFactRetrievalMessages(content, isMultiRound, options);
  
  // 如果表格记忆未启用或没有提供表格数据，直接返回基础提示词
  if (!tableMemoryEnabled || !tableData) {
    return [baseSystemPrompt, baseUserPrompt];
  }
  
  // 使用增强函数添加表格记忆相关内容
  return enhancePromptsWithTableMemory(baseSystemPrompt, baseUserPrompt, tableData, options);
}

/**
 * 处理LLM响应，执行表格操作
 * @param llmResponse LLM响应内容
 * @param characterId 角色ID
 * @param conversationId 会话ID
 * @returns 处理结果
 */
export async function processLLMResponseForTableMemory(
  llmResponse: string,
  characterId: string,
  conversationId: string
): Promise<{ success: boolean; updatedSheets: string[] }> {
  const callId = generateCallId('LLMResp-');
  const callerStack = getCallerStack();
  console.log(`【表格插件】[processLLMResponseForTableMemory] 调用ID: ${callId}`);
  console.log(`【表格插件】[processLLMResponseForTableMemory] 调用堆栈:\n${callerStack}`);
  if (!tableMemoryEnabled) {
    return { success: false, updatedSheets: [] };
  }
  
  try {
    // 确保使用有效的ID
    const safeCharacterId = String(characterId);
    const safeConversationId = conversationId ? String(conversationId) : safeCharacterId;

    // 尝试解析JSON响应
    let parsedResponse: any = null;
    let tableActions: any[] = [];
    
    // 试着寻找JSON格式的响应
    const jsonMatches = llmResponse.match(/\{[\s\S]*?\}/g);
    if (jsonMatches) {
      // 尝试每个匹配项
      for (const jsonText of jsonMatches) {
        try {
          const possibleJson = JSON.parse(jsonText);
          // 检查是否包含tableActions数组
          if (possibleJson.tableActions && Array.isArray(possibleJson.tableActions)) {
            parsedResponse = possibleJson;
            tableActions = possibleJson.tableActions;
            console.log('[TableMemoryIntegration] 成功解析JSON格式的表格操作');
            break;
          }
        } catch (e) {
          // 继续尝试下一个匹配项
          continue;
        }
      }
    }
    
    // 如果没有找到有效的JSON，尝试直接解析完整响应
    if (!parsedResponse) {
      try {
        parsedResponse = JSON.parse(llmResponse);
        if (parsedResponse.tableActions && Array.isArray(parsedResponse.tableActions)) {
          tableActions = parsedResponse.tableActions;
        }
      } catch (e) {
        // 解析失败，检查是否为markdown表格格式
        if (llmResponse.includes('|') && llmResponse.includes('\n')) {
          // 可能是markdown表格，让我们处理为插入操作
          console.log('[TableMemoryIntegration] 检测到可能是markdown表格格式，但需要表格ID才能处理');
          
          // 获取角色的所有表格
          try {
            const sheets = await TableMemory.API.getCharacterSheets(safeCharacterId, safeConversationId);
            if (sheets && sheets.length > 0) {
              // 找到第一个合适的表格
              const targetSheet = sheets[0];
              console.log(`[TableMemoryIntegration] 将尝试更新表格: ${targetSheet.name} (${targetSheet.uid})`);
              
              // 直接尝试使用processChat更新表格
              const result = await TableMemory.API.processChat(llmResponse, {
                characterId: safeCharacterId,
                conversationId: safeConversationId
              });
              
              return {
                success: result.updatedSheets.length > 0,
                updatedSheets: result.updatedSheets
              };
            }
          } catch (sheetError) {
            console.error('[TableMemoryIntegration] 尝试获取表格失败:', sheetError);
          }
        }
        
        console.log('[TableMemoryIntegration] LLM响应不包含有效的JSON结构');
        return { success: false, updatedSheets: [] };
      }
    }
    
    // 如果还是没有找到有效的表格操作
    if (!tableActions || !Array.isArray(tableActions) || tableActions.length === 0) {
      console.log('[TableMemoryIntegration] LLM响应中没有表格操作指令');
      return { success: false, updatedSheets: [] };
    }
    
    console.log(`[TableMemoryIntegration] 发现 ${tableActions.length} 个表格操作指令`);
    
    // 获取当前角色所有的表格，用于ID查找或表名匹配
    const availableSheets = await TableMemory.API.getCharacterSheets(safeCharacterId, safeConversationId);
    console.log(`[TableMemoryIntegration] 为角色 ${safeCharacterId} 找到 ${availableSheets.length} 个表格`);
    
    // 为了跟踪表格ID和名称的映射关系
    const sheetNameToIdMap = new Map<string, string>();
    availableSheets.forEach(sheet => {
      sheetNameToIdMap.set(sheet.name, sheet.uid);
      console.log(`[TableMemoryIntegration] 表格映射: "${sheet.name}" -> ${sheet.uid}`);
    });
    
    // 处理表格名称到ID的转换
    const resolvedActions = await Promise.all(tableActions.map(async (action) => {
      // 如果操作中指定了表格名称但没有ID，尝试查找ID
      if (!action.sheetId && action.sheetName) {
        console.log(`[TableMemoryIntegration] 尝试为表格名称 "${action.sheetName}" 查找ID`);
        
        // 首先检查本地映射
        if (sheetNameToIdMap.has(action.sheetName)) {
          action.sheetId = sheetNameToIdMap.get(action.sheetName);
          console.log(`[TableMemoryIntegration] 从映射中找到表格ID: ${action.sheetId}`);
        } else {
          // 如果没有在本地映射中找到，尝试使用API查找
          const sheet = await TableMemory.API.getSheetByName(
            action.sheetName,
            safeCharacterId,
            safeConversationId
          );
          
          if (sheet) {
            action.sheetId = sheet.uid;
            sheetNameToIdMap.set(action.sheetName, sheet.uid); // 更新映射
            console.log(`[TableMemoryIntegration] 通过API找到表格ID: ${action.sheetId}`);
          } else {
            console.log(`[TableMemoryIntegration] 未找到表格 "${action.sheetName}"，跳过操作`);
          }
        }
      }
      
      // 如果是字符串形式的表格ID，检查是否实际上是表格名称
      if (action.sheetId && typeof action.sheetId === 'string' && 
          !action.sheetId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        console.log(`[TableMemoryIntegration] sheetId "${action.sheetId}" 不像是有效UUID，可能是表格名称`);
        
        // 检查是否是表格名称
        const tableName = action.sheetId;
        
        // 首先检查本地映射
        if (sheetNameToIdMap.has(tableName)) {
          action.sheetId = sheetNameToIdMap.get(tableName);
          action.originalName = tableName; // 保留原始名称以便记录
          console.log(`[TableMemoryIntegration] 从映射中找到表格ID: ${action.sheetId}`);
        } else {
          // 如果没有在本地映射中找到，尝试使用API查找
          const sheet = await TableMemory.API.getSheetByName(
            tableName,
            safeCharacterId,
            safeConversationId
          );
          
          if (sheet) {
            action.originalName = tableName; // 保留原始名称以便记录
            action.sheetId = sheet.uid;
            sheetNameToIdMap.set(tableName, sheet.uid); // 更新映射
            console.log(`[TableMemoryIntegration] 通过API找到表格ID: ${action.sheetId} (原名称: "${tableName}")`);
          } else {
            console.log(`[TableMemoryIntegration] 未找到表格 "${tableName}"，跳过操作`);
          }
        }
      }
      
      return action;
    }));
    
    // 过滤掉没有有效sheetId的操作
    const validActions = resolvedActions.filter(action => action.sheetId);
    console.log(`[TableMemoryIntegration] 解析后有 ${validActions.length} 个有效表格操作`);
    
    if (validActions.length === 0) {
      console.log('[TableMemoryIntegration] 没有有效的表格操作，跳过处理');
      return { success: false, updatedSheets: [] };
    }
    
    // 执行表格操作
    const updatedSheets: string[] = [];
    let hasError = false;
    
    // 逐个执行操作，不再按表格分组
    for (const action of validActions) {
      try {
        console.log(`【表格插件】[processLLMResponseForTableMemory] 即将执行表格操作: ${JSON.stringify(action)} 调用ID: ${callId}`);
        const sheetId = action.sheetId;
        
        // 验证表格是否存在
        const sheetExists = await TableMemory.API.getSheet(sheetId);
        if (!sheetExists) {
          console.log(`[TableMemoryIntegration] 跳过对不存在表格 ${sheetId} 的操作`);
          continue;
        }
        
        console.log(`[TableMemoryIntegration] 执行表格 ${sheetExists.name} 的 ${action.action} 操作`);
        
        let operationSuccess = false;
        
        switch (action.action) {
          case 'insert':
            if (action.rowData) {
              await TableMemory.API.insertRow(sheetId, action.rowData);
              console.log(`[TableMemoryIntegration] 成功插入行到表格 ${sheetExists.name}`);
              operationSuccess = true;
            }
            break;
            
          case 'update':
            if (action.rowIndex !== undefined && action.rowData) {
              if (action.rowIndex === 0) {
                console.warn(`[TableMemoryIntegration] 尝试更新标题行（行索引0），已阻止此操作`);
              } else {
                await TableMemory.API.updateRow(sheetId, action.rowIndex, action.rowData);
                console.log(`[TableMemoryIntegration] 成功更新表格 ${sheetExists.name} 的行 ${action.rowIndex}`);
                operationSuccess = true;
              }
            }
            break;
            
          case 'delete':
            if (action.rowIndex !== undefined) {
              if (action.rowIndex === 0) {
                console.warn(`[TableMemoryIntegration] 尝试删除标题行（行索引0），已阻止此操作`);
              } else {
                await TableMemory.API.deleteRow(sheetId, action.rowIndex);
                console.log(`[TableMemoryIntegration] 成功删除表格 ${sheetExists.name} 的行 ${action.rowIndex}`);
                operationSuccess = true;
              }
            }
            break;
            
          default:
            console.warn(`[TableMemoryIntegration] 未知的表格操作: ${action.action}`);
        }
        
        // 如果操作成功且表格ID不在已更新列表中，则添加
        if (operationSuccess && !updatedSheets.includes(sheetId)) {
          updatedSheets.push(sheetId);
        }
        
        // 每个操作之间添加短暂延迟，避免数据库锁冲突
        await new Promise(resolve => setTimeout(resolve, 50));
        // 打印数据库队列状态
        try {
          const { StorageService } = require('../plugins/table-memory/services/storage-service');
          const dbStatus = await StorageService.checkDatabaseLock?.();
          console.log(`【表格插件】[processLLMResponseForTableMemory] 操作后数据库队列长度: ${dbStatus?.queueLength ?? '未知'}，是否锁定: ${dbStatus?.isLocked ? '是' : '否'}`);
        } catch (e) {}
      } catch (error) {
        console.error(`[TableMemoryIntegration] 执行表格操作失败:`, error);
        hasError = true;
        
        // 操作失败时添加稍长的延迟，避免连续错误
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // 如果有错误但仍然成功更新了一些表格，记录警告
    if (hasError && updatedSheets.length > 0) {
      console.warn(`[TableMemoryIntegration] 部分表格操作失败，但成功更新了 ${updatedSheets.length} 个表格`);
    }
    
    return {
      success: updatedSheets.length > 0,
      updatedSheets
    };
  } catch (error) {
    console.error('【表格插件】[processLLMResponseForTableMemory] 处理LLM响应时出错:', error);
    return { success: false, updatedSheets: [] };
  }
}

/**
 * 处理聊天消息，更新表格记忆
 * @param messages 消息数组或文本
 * @param characterId 角色ID
 * @param conversationId 会话ID
 * @param options 选项
 * @returns 处理结果
 */
export async function processChat(
  messages: Message[] | string,
  characterId: string,
  conversationId: string,
  options: { 
    userName?: string; 
    aiName?: string; 
    isMultiRound?: boolean;
    chatContent?: string;
  } = {}
): Promise<{ success: boolean; updatedSheets: string[] }> {
  const callId = generateCallId('Chat-');
  const callerStack = getCallerStack();
  console.log(`【表格插件】[processChat] 调用ID: ${callId}`);
  console.log(`【表格插件】[processChat] 调用堆栈:\n${callerStack}`);
  if (!tableMemoryEnabled) {
    console.log('[TableMemoryIntegration] 表格记忆插件未启用，跳过处理');
    return { success: false, updatedSheets: [] };
  }
  
  try {
    // 新增：调用前检测数据库锁死
    try {
      const { StorageService } = require('../plugins/table-memory/services/storage-service');
      const dbStatus = await StorageService.checkDatabaseLock?.();
      if (dbStatus && dbStatus.isLocked && dbStatus.queueLength > 5) {
        console.warn('[TableMemoryIntegration] 检测到数据库队列阻塞，主动重置数据库连接');
        await StorageService.resetDatabase();
      }
    } catch (e) {
      // 忽略
    }

    const safeCharacterId = String(characterId);
    const safeConversationId = conversationId ? String(conversationId) : safeCharacterId;
    
    console.log(`[TableMemoryIntegration] Processing chat with characterId: "${safeCharacterId}", conversationId: "${safeConversationId}"`);
    
    // 新增：检查并尝试修复数据库锁定状态 
    try {
      const dbStatus = await TableMemory.API.checkDatabaseLock?.();
      if (dbStatus && dbStatus.isLocked) {
        console.warn(`[TableMemoryIntegration] 检测到数据库可能处于锁定状态(队列长度: ${dbStatus.queueLength})，尝试重置`);
        await TableMemory.resetDatabaseConnection?.();
        await new Promise(resolve => setTimeout(resolve, 500)); // 给数据库一些恢复的时间
      }
    } catch (e) {
      // 忽略错误，这个方法可能不存在
    }
    
    // Check if tables exist for this character/conversation
    const existingTables = await TableMemory.API.getCharacterSheets(safeCharacterId, safeConversationId);
    console.log(`[TableMemoryIntegration] Found ${existingTables.length} existing tables`);
    
    // 优先使用 options.chatContent，如果没有则尝试自动获取最近的消息内容
    let messageContent: string | undefined = options.chatContent;
    if (!messageContent) {
      if (typeof messages === 'string') {
        messageContent = messages;
      } else if (messages && Array.isArray(messages) && messages.length > 0) {
        // 从消息数组提取内容
        messageContent = messages.map(m => {
          const role = m.role === 'assistant' ? (options.aiName || 'AI') : (options.userName || '用户');
          const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
          return `${role}: ${content}`;
        }).join('\n\n');
      } else {
        // 自动调用 StorageAdapter 获取最近的消息
        try {
          const { StorageAdapter } = require('../../NodeST/nodest/utils/storage-adapter');
          const recentMessages = await StorageAdapter.getRecentMessages(safeConversationId, 20);
          if (recentMessages && recentMessages.length > 0) {
            interface MessagePart {
              text: string;
            }

            interface RecentMessage {
              role: string;
              parts?: MessagePart[];
              content?: string;
            }

            messageContent = recentMessages.map((msg: RecentMessage) => {
              const role: string = msg.role === 'model' || msg.role === 'assistant' ? (options.aiName || 'AI') : (options.userName || '用户');
              // 兼容 parts 数组
              const content: string = msg.parts?.[0]?.text || msg.content || '';
              return `${role}: ${content}`;
            }).join('\n\n');
            console.log('[TableMemoryIntegration] 自动从StorageAdapter获取最近对话内容');
          }
        } catch (err) {
          console.warn('[TableMemoryIntegration] 获取StorageAdapter最近消息失败:', err);
        }
      }
    }
    
    // 记录日志
    console.log(`[TableMemoryIntegration] 准备处理消息内容(前50字符): ${messageContent?.substring(0, 50) ?? '[无内容]'}...`);
    
    // 将消息传递给插件的processChat方法
    try {
      console.log(`【表格插件】[processChat] 即将调用 TableMemory.API.processChat, 调用ID: ${callId}`);
      const result = await TableMemory.API.processChat(messages, {
        characterId: safeCharacterId,
        conversationId: safeConversationId,
        userName: options.userName,
        aiName: options.aiName,
        isMultiRound: options.isMultiRound,
        chatContent: messageContent // 显式传递 chatContent
      });
      console.log(`【表格插件】[processChat] TableMemory.API.processChat 调用完成, 调用ID: ${callId}`);

      // 新增：调用后检测数据库锁死
      try {
        const { StorageService } = require('../plugins/table-memory/services/storage-service');
        const dbStatus = await StorageService.checkDatabaseLock?.();
        if (dbStatus && dbStatus.isLocked && dbStatus.queueLength > 5) {
          console.warn('[TableMemoryIntegration] 表格操作后检测到数据库队列阻塞，主动重置数据库连接');
          await StorageService.resetDatabase();
        }
      } catch (e) {}

      return {
        success: result.updatedSheets.length > 0,
        updatedSheets: result.updatedSheets
      };
    } catch (error) {
      console.error('[TableMemoryIntegration] 处理表格失败，尝试恢复:', error);
      
      // 新增：尝试恢复数据库连接
      try {
        await TableMemory.resetDatabaseConnection?.();
        console.log('[TableMemoryIntegration] 已尝试重置数据库连接');
        
        // 延迟后重试一次
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const retryResult = await TableMemory.API.processChat(messages, {
          characterId: safeCharacterId,
          conversationId: safeConversationId,
          userName: options.userName,
          aiName: options.aiName,
          isMultiRound: options.isMultiRound,
          chatContent: messageContent
        });
        
        return {
          success: retryResult.updatedSheets.length > 0,
          updatedSheets: retryResult.updatedSheets
        };
      } catch (retryError) {
        console.error('[TableMemoryIntegration] 重试失败:', retryError);
        return { success: false, updatedSheets: [] };
      }
    }
  } catch (error) {
    console.error('【表格插件】[processChat] 处理聊天消息时出错:', error);
    return { success: false, updatedSheets: [] };
  }
}

/**
 * 获取表格数据，用于构建提示词
 * @param characterId 角色ID
 * @param conversationId 会话ID
 * @returns 表格数据对象
 */
export async function getTableDataForPrompt(
  characterId: string,
  conversationId: string
): Promise<any | null> {
  if (!tableMemoryEnabled) {
    return null;
  }

  try {
    // FIXED: Ensure consistent ID handling
    const safeCharacterId = String(characterId);
    const safeConversationId = conversationId ? String(conversationId) : safeCharacterId;

    console.log(`[TableMemoryIntegration] Getting table data for characterId: "${safeCharacterId}", conversationId: "${safeConversationId}"`);

    // 使用 getCharacterTablesData 替代 getCharacterSheets
    const tablesData = await TableMemory.API.getCharacterTablesData(safeCharacterId, safeConversationId);

    if (!tablesData.success || !tablesData.tables || tablesData.tables.length === 0) {
      console.log(`[TableMemoryIntegration] 未找到角色 ${safeCharacterId} 的表格`);
      return null;
    }

    console.log(`[TableMemoryIntegration] Found ${tablesData.tables.length} tables for character ${safeCharacterId}`);

    // 直接返回tablesData.tables，结构为 { id, name, headers, rows, text }
    return tablesData.tables;
  } catch (error) {
    console.error('[TableMemoryIntegration] 获取表格数据时出错:', error);
    return null;
  }
}

/**
 * 将表格转换为文本形式
 * @param sheet 表格对象
 * @returns 表格的文本表示
 */
function toText(sheet: TableMemory.Sheet): string {
  return TableMemory.toText(sheet);
}

/**
 * 扩展MobileMemory的addToVectorStore方法，集成表格记忆功能
 * @param originalMethod 原始方法
 * @returns 扩展后的方法
 */
export function extendAddToVectorStore(
  originalMethod: (messages: Message[], metadata: Record<string, any>, filters: SearchFilters, isMultiRound?: boolean) => Promise<any>
): (messages: Message[], metadata: Record<string, any>, filters: SearchFilters, isMultiRound?: boolean) => Promise<any> {
  // 返回一个新函数，保持原有参数和返回类型
  return async function(
    this: any,
    messages: Message[],
    metadata: Record<string, any>,
    filters: SearchFilters,
    isMultiRound: boolean = false
  ): Promise<any> {
    const results = await originalMethod.call(this, messages, metadata, filters, isMultiRound);

    // 如果表格记忆功能启用，处理表格记忆
    if (isTableMemoryEnabled()) {
      try {
        // 检查是否已经处理过LLM表格操作，避免重复
        if (metadata && metadata._tableActionsProcessed) {
          console.log('[TableMemoryIntegration] 本轮表格操作已由主流程处理，跳过 processChat');
        } else {
          const characterId = filters.agentId ? String(filters.agentId) : null;
          const conversationId = filters.runId ? String(filters.runId) : characterId;
          if (characterId && conversationId) {
            console.log(`[TableMemoryIntegration] 处理表格记忆，角色ID: ${characterId}, 会话ID: ${conversationId}`);
            const mem0Service = Mem0Service.getInstance();
            const userName = metadata.userName || 
                            (mem0Service ? mem0Service.getUserName(characterId) : '用户');
            const aiName = metadata.aiName || 
                          (mem0Service ? mem0Service.getAIName(characterId) : 'AI');
            const chatContent = messages.map(m => {
              const role = m.role === 'assistant' ? aiName : (m.role === 'user' ? userName : m.role);
              const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
              return `${role}: ${content}`;
            }).join('\n\n');
            console.log(`[TableMemoryIntegration] 提取的对话内容长度: ${chatContent.length} 字符`);
            processChat(messages, characterId, conversationId, {
              userName,
              aiName,
              isMultiRound,
              chatContent
            }).catch(error => {
              console.error("[TableMemoryIntegration] 处理表格记忆时出错:", error);
            });
          } else {
            console.log('[TableMemoryIntegration] 缺少角色ID或会话ID，跳过表格记忆处理');
          }
        }
      } catch (error) {
        console.error("[TableMemoryIntegration] 处理表格记忆时出错:", error);
      }
    }
    return results;
  };
}

/**
 * 获取表格记忆提示词
 * 根据profile_prompts.js中的提示词模板生成优化的提示词
 * @param type 提示词类型
 * @param options 选项
 * @returns 提示词对象
 */
export function getTableMemoryPrompt(
  type: string = 'rebuild_base',
  options: { 
    userName?: string; 
    aiName?: string;
    includeHistory?: boolean;
    includeLastTable?: boolean; 
  } = {}
): { systemPrompt: string; userPrompt: string } {
  try {
    // 尝试从profile_prompts中获取对应的提示词
    const profilePrompts = require('@/src/memory/ref_prompt/profile_prompts').profile_prompts;
    const selectedPrompt = profilePrompts[type];
    
    if (!selectedPrompt) {
      console.warn(`[TableMemoryIntegration] 未找到提示词类型 ${type}，使用默认提示词`);
      return {
        systemPrompt: `忘掉前面所有的要求，现在你是一个专业的表格整理助手，请严格按照用户的指令和格式要求处理表格数据。`,
        userPrompt: `请根据聊天内容，更新表格。可以添加新行、更新现有行或删除不再相关的行。`
      };
    }
    
    // 获取系统提示词
    const systemPrompt = selectedPrompt.system_prompt || 
      `忘掉前面所有的要求，现在你是一个专业的表格整理助手，请严格按照用户的指令和格式要求处理表格数据。`;
    
    // 构建用户提示词
    let userPrompt = selectedPrompt.user_prompt_begin || 
      `请根据聊天内容，更新表格。可以添加新行、更新现有行或删除不再相关的行。`;
    
    // 添加核心规则
    if (selectedPrompt.core_rules) {
      userPrompt += `\n\n${selectedPrompt.core_rules}`;
    }
    
    // 替换提示词中的变量
    const userName = options.userName || '用户';
    const aiName = options.aiName || 'AI';
    
    const finalUserPrompt = userPrompt
      .replace(/<user>/g, userName)
      .replace(/<ai>/g, aiName);
    
    return { systemPrompt, userPrompt: finalUserPrompt };
  } catch (error) {
    console.error('[TableMemoryIntegration] 获取表格记忆提示词失败:', error);
    return {
      systemPrompt: `忘掉前面所有的要求，现在你是一个专业的表格整理助手，请严格按照用户的指令和格式要求处理表格数据。`,
      userPrompt: `请根据聊天内容，更新表格。可以添加新行、更新现有行或删除不再相关的行。`
    };
  }
}

/**
 * 简化表格记忆历史
 * 使用rebuild_simplify_history提示词简化表格记忆
 * @param characterId 角色ID
 * @param conversationId 会话ID
 * @returns 是否成功
 */
export async function simplifyTableMemoryHistory(
  characterId: string,
  conversationId: string
): Promise<boolean> {
  try {
    if (!isTableMemoryEnabled()) {
      console.log('[TableMemoryIntegration] 表格记忆功能未启用，跳过简化操作');
      return false;
    }
    
    console.log(`[TableMemoryIntegration] 简化角色 ${characterId} 的表格记忆历史`);
    
    // 获取所有表格
    const sheets = await TableMemory.API.getCharacterSheets(characterId, conversationId);
    if (!sheets || sheets.length === 0) {
      console.log('[TableMemoryIntegration] 未找到表格，跳过简化');
      return false;
    }
    
    // 获取简化提示词
    const { systemPrompt, userPrompt } = getTableMemoryPrompt('rebuild_simplify_history');
    
    // 对每个表格执行简化
    let success = false;
    for (const sheet of sheets) {
      try {
        // 找出名称包含"历史"或"事件"的表格
        if (sheet.name.includes('历史') || sheet.name.includes('事件')) {
          console.log(`[TableMemoryIntegration] 正在简化表格: ${sheet.name}`);
          
          // 获取LLM实例
          const llm = await getLLM();
          if (!llm) {
            console.error('[TableMemoryIntegration] LLM实例不可用，跳过简化');
            continue;
          }
          
          // 获取表格文本
          const tableText = TableMemory.toText(sheet);
          
          // 构建提示词
          const finalUserPrompt = userPrompt.replace('<当前表格>', tableText);
          
          // 调用LLM
          const response = await llm.generateResponse(
            [
              { role: "user", content: systemPrompt },
              { role: "user", content: finalUserPrompt }
            ]
          );
          
          // 解析LLM响应
          const updatedTableText = typeof response === 'string' ? response : response.content;
          
          // 更新表格
          // 这里需要解析表格文本并更新表格
          // 由于复杂性，我们将调用SheetManager的方法来处理
          await TableMemory.rebuildSheet(sheet.uid, '', 'rebuild_simplify_history');
          
          success = true;
          console.log(`[TableMemoryIntegration] 表格 ${sheet.name} 简化完成`);
        }
      } catch (error) {
        console.error(`[TableMemoryIntegration] 简化表格 ${sheet.name} 失败:`, error);
      }
    }
    
    return success;
  } catch (error) {
    console.error('[TableMemoryIntegration] 简化表格记忆历史失败:', error);
    return false;
  }
}

/**
 * 获取LLM实例
 * @returns LLM实例
 */
async function getLLM(): Promise<any> {
  try {
    // 尝试从Mem0Service获取LLM实例
    let Mem0Service: any;
    try {
      Mem0Service = require('../services/Mem0Service').default.getInstance();
      if (Mem0Service && Mem0Service.memoryRef && Mem0Service.memoryRef.llm) {
        return Mem0Service.memoryRef.llm;
      }
    } catch (error) {
      console.log('[TableMemoryIntegration] 无法从Mem0Service获取LLM实例，尝试其他方式');
    }
    
    // 如果无法从Mem0Service获取，尝试从MobileMemory获取
    try {
      const MobileMemory = require('../mobile-memory').MobileMemory;
      const memoryInstance = new MobileMemory();
      return memoryInstance.llm;
    } catch (error) {
      console.log('[TableMemoryIntegration] 无法从MobileMemory获取LLM实例');
    }
    
    return null;
  } catch (error) {
    console.error('[TableMemoryIntegration] 获取LLM实例失败:', error);
    return null;
  }
}

/**
 * 获取角色名称和AI名称
 * @param characterId 角色ID
 * @returns 名称对象
 */
export function getCustomNames(characterId: string): { userName: string; aiName: string } {
  try {
    // 尝试从Mem0Service获取自定义名称
    let Mem0Service: any;
    try {
      Mem0Service = require('../services/Mem0Service').default.getInstance();
      if (Mem0Service) {
        return {
          userName: Mem0Service.getUserName(characterId) || '用户',
          aiName: Mem0Service.getAIName(characterId) || 'AI'
        };
      }
    } catch (error) {
      console.log('[TableMemoryIntegration] 无法从Mem0Service获取自定义名称');
    }
    
    return { userName: '用户', aiName: 'AI' };
  } catch (error) {
    console.error('[TableMemoryIntegration] 获取自定义名称失败:', error);
    return { userName: '用户', aiName: 'AI' };
  }
}
