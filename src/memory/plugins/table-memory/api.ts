/**
 * 表格记忆增强插件 - 公共API接口
 * 
 * 该文件定义了与Mem0系统交互的公共API接口，
 * 提供简单统一的方法调用表格记忆增强插件的功能。
 */

import { SheetManager } from './services/sheet-manager';
import { TemplateManager } from './services/template-manager';
import { 
  Sheet, 
  toText,
  getRowCount,
  getColumnCount
} from './models/sheet';
import { SheetTemplate } from './models/template';

// 用于延迟 require，避免循环依赖
function getIndexModule() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('./index');
}

/**
 * 处理聊天消息，更新相关表格
 * @param messages 消息列表或消息文本
 * @param options 处理选项
 * @returns 处理结果，包括已更新的表格ID列表
 */
export async function processChat(
  messages: any[] | string,
  options: {
    characterId: string;
    conversationId: string;
    userName?: string;
    aiName?: string;
    isMultiRound?: boolean;
    initialTableActions?: any[]; // 新增: 从LLM响应中已提取的表格操作
    chatContent?: string; // 新增：允许外部直接传入chatContent
  }
): Promise<{ updatedSheets: string[] }> {
  try {
    // 检查插件是否启用和初始化
    if (!getIndexModule().isEnabled()) {
      console.log('[TableMemory] 插件未启用，跳过处理聊天消息');
      return { updatedSheets: [] };
    }
    
    // Enhanced logging to help debug ID issues
    console.log(`[TableMemory] processChat - Original IDs - characterId: "${options.characterId}" (${typeof options.characterId}), conversationId: "${options.conversationId}" (${typeof options.conversationId})`);
    
    // Ensure consistent ID handling
    const safeCharacterId = String(options.characterId || '').trim();
    const safeConversationId = options.conversationId ? String(options.conversationId).trim() : safeCharacterId;
    
    console.log(`[TableMemory] processChat - Normalized IDs - safeCharacterId: "${safeCharacterId}", safeConversationId: "${safeConversationId}"`);
    
    // 新增：检测数据库锁死并主动恢复
    const { StorageService } = require('./services/storage-service');
    const dbStatus = await StorageService.checkDatabaseLock?.();
    if (dbStatus && dbStatus.isLocked && dbStatus.queueLength > 5) {
      console.warn('[TableMemory] 检测到数据库队列阻塞，主动重置数据库连接');
      await StorageService.resetDatabase();
    }

    // 获取此角色的现有表格
    console.log(`[TableMemory] Calling SheetManager.getSheetsByCharacter with IDs: "${safeCharacterId}", "${safeConversationId}"`);
    const existingSheets = await SheetManager.getSheetsByCharacter(
      safeCharacterId,
      safeConversationId
    );
    
    console.log(`[TableMemory] 找到 ${existingSheets.length} 个现有表格`);
    
    // List all found tables for debugging
    if (existingSheets.length > 0) {
      console.log('[TableMemory] Found existing tables:');
      existingSheets.forEach((sheet, index) => {
        console.log(`[TableMemory] ${index + 1}. ID: ${sheet.uid}, name: ${sheet.name}, characterId: "${sheet.characterId}", conversationId: "${sheet.conversationId}"`);
      });
      
      // Important: Check if the IDs in the sheet records match our safe IDs
      existingSheets.forEach((sheet, index) => {
        if (sheet.characterId !== safeCharacterId) {
          console.warn(`[TableMemory] ⚠️ Sheet ${index + 1} has mismatched characterId: "${sheet.characterId}" vs expected "${safeCharacterId}"`);
        }
        if (sheet.conversationId !== safeConversationId) {
          console.warn(`[TableMemory] ⚠️ Sheet ${index + 1} has mismatched conversationId: "${sheet.conversationId}" vs expected "${safeConversationId}"`);
        }
      });
    }
    
    // 如果没有表格，且有已选择的模板，则创建表格
    if (existingSheets.length === 0) {
      console.log('[TableMemory] No existing tables found, checking for templates to create new tables');
      const selectedTemplates = await getSelectedTemplates();
      console.log(`[TableMemory] Found ${selectedTemplates.length} selected templates`);
      
      if (selectedTemplates.length > 0) {
        console.log('[TableMemory] 没有找到表格，从模板创建新表格');
        console.log(`[TableMemory] Creating tables with IDs: "${safeCharacterId}", "${safeConversationId}"`);
        
        const createdTableIds = await createSheetsFromTemplates(
          selectedTemplates,
          safeCharacterId,
          safeConversationId
        );
        
        console.log(`[TableMemory] Created ${createdTableIds.length} new tables with IDs: ${createdTableIds.join(', ')}`);
      } else {
        console.log('[TableMemory] 没有选择模板，跳过表格创建');
      }
    } else {
      console.log(`[TableMemory] 使用现有表格，跳过创建新表格`);
      console.log(`[TableMemory] Existing sheet IDs: ${existingSheets.map(s => s.uid).join(', ')}`);
    }
    
    // 重新获取表格（包括可能刚创建的）
    console.log(`[TableMemory] Refreshing sheets with IDs: "${safeCharacterId}", "${safeConversationId}"`);
    const sheets = await SheetManager.getSheetsByCharacter(
      safeCharacterId,
      safeConversationId
    );
    
    if (sheets.length === 0) {
      console.log('[TableMemory] 没有找到可用表格，跳过处理');
      return { updatedSheets: [] };
    }
    
    // Debug: List all available tables
    console.log('[TableMemory] 当前可用的表格:');
    sheets.forEach(sheet => {
      console.log(`- "${sheet.name}" (ID: ${sheet.uid}), CharID: ${sheet.characterId}, ConversationId: ${sheet.conversationId}`);
    });
    
    // 优先使用 options.chatContent
    let messageContent: string;
    if (options.chatContent) {
      messageContent = options.chatContent;
      console.log('[TableMemory] 使用外部传入的 chatContent,内容详情:', messageContent);
    } else {
      messageContent = typeof messages === 'string'
        ? messages
        : messages.map(m => {
            const role = m.role === 'assistant' ? (options.aiName || 'AI') : (options.userName || '用户');
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            return `${role}: ${content}`;
          }).join('\n\n');
    }

    // ----------- 新增：用LLM生成tableActions -----------
    let initialTableActions = options.initialTableActions;
    if (!initialTableActions) {
      try {
        // 获取LLM实例
        const llm = await getLLMInstance();
        if (llm) {
          // 构建系统提示词和用户提示词
          const systemPrompt = `你是一名专业的表格管理助手。请仔细分析对话内容，并根据提供的规则更新表格。
你需要返回完整的表格内容，并且确保数据遵循指定格式。返回的格式应为markdown表格，或者是JSON格式的表格操作指令。`;

          // 获取所有表格文本，便于 LLM 参考
          const allSheetTexts: Record<string, string> = {};
          sheets.forEach(sheet => {
            allSheetTexts[sheet.uid] = `表格名称: ${sheet.name}\n${toText(sheet)}`;
          });

          // 构建每个表格的 insert 示例，确保 sheetId 与实际表格一致
          const insertExamples = sheets.map(sheet => {
            return `{
  "action": "insert",
  "sheetId": "${sheet.uid}",
  "rowData": {"0": "第一列的值", "1": "第二列的值"}
}`;
          }).join(',\n');

          // 构建用户提示词，包含所有表格文本和对话内容
          let userPrompt = `当前所有表格如下:\n${Object.values(allSheetTexts).join('\n\n')}\n\n对话内容:\n${messageContent}\n\n请分析对话内容，生成每个需要更新的表格的操作指令。你必须以markdown表格形式返回完整表格，从标题行开始，确保格式正确。
你也可以选择返回JSON格式的表格操作指令，例如:
{
  "tableActions": [
    ${insertExamples}
  ]
}`;

          // 调用LLM
          const response = await llm.generateResponse(
            [
              { role: "user", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            { type: "json_object" }
          );
          // 解析响应，提取tableActions
          let cleanResponse = typeof response === 'string' ? response : response.content;
          // --------- 增强JSON解析，兼容markdown code block和宽松提取 ---------
          // 去除 ```json ... ``` 或 ``` ... ``` 包裹
          cleanResponse = cleanResponse
            .replace(/^\s*```json\s*/i, '')
            .replace(/^\s*```\s*/i, '')
            .replace(/\s*```[\s\n]*$/i, '')
            .trim();
          // 尝试宽松提取第一个大括号包裹的JSON
          try {
            // 先尝试直接解析
            let jsonData: any = null;
            try {
              jsonData = JSON.parse(cleanResponse);
            } catch {
              // fallback: 提取第一个 {...} 片段
              const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                jsonData = JSON.parse(jsonMatch[0]);
              }
            }
            if (jsonData && jsonData.tableActions && Array.isArray(jsonData.tableActions)) {
              initialTableActions = jsonData.tableActions;
              console.log(`[TableMemory] LLM生成了${initialTableActions?.length || 0}条tableActions`);
            }
          } catch (e) {
            // fallback: 尝试补全缺失的右大括号
            try {
              let fixed = cleanResponse;
              const leftCount = (fixed.match(/\{/g) || []).length;
              const rightCount = (fixed.match(/\}/g) || []).length;
              if (leftCount > rightCount) {
                fixed += '}'.repeat(leftCount - rightCount);
                const jsonData = JSON.parse(fixed);
                if (jsonData && jsonData.tableActions && Array.isArray(jsonData.tableActions)) {
                  initialTableActions = jsonData.tableActions;
                  console.log(`[TableMemory] LLM生成了${initialTableActions?.length || 0}条tableActions(补全大括号)`);
                }
              }
            } catch (e2) {
              console.warn('[TableMemory] 解析LLM响应tableActions失败:', e, e2);
            }
          }
          // --------- 增强JSON解析结束 ---------
        }
      } catch (e) {
        console.warn('[TableMemory] LLM生成tableActions失败:', e);
      }
    }

    // 新增：对initialTableActions进行预处理，将表格名称转换为表格ID
    if (initialTableActions && initialTableActions.length > 0) {
      console.log(`[TableMemory] 开始预处理${initialTableActions.length}条tableActions，转换表格名称为ID`);
      
      // 创建表格名称到ID的映射
      const nameToIdMap = new Map<string, string>();
      sheets.forEach(sheet => {
        nameToIdMap.set(sheet.name, sheet.uid);
        // 同时支持去掉"表格"后缀的匹配
        const nameWithoutSuffix = sheet.name.replace(/表格$/, '');
        if (nameWithoutSuffix !== sheet.name) {
          nameToIdMap.set(nameWithoutSuffix, sheet.uid);
        }
      });
      
      // 转换每个action中的sheetId
      initialTableActions = initialTableActions.map((action, index) => {
        const originalSheetId = action.sheetId;
        
        // 如果sheetId已经是UUID格式，直接使用
        if (typeof originalSheetId === 'string' && 
            originalSheetId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          console.log(`[TableMemory] Action ${index + 1}: sheetId已是UUID格式，保持不变: ${originalSheetId}`);
          return action;
        }
        
        // 尝试通过名称查找表格ID
        let actualSheetId = nameToIdMap.get(originalSheetId);
        
        // 如果找不到精确匹配，尝试模糊匹配
        if (!actualSheetId) {
          for (const [name, id] of nameToIdMap.entries()) {
            if (name.includes(originalSheetId) || originalSheetId.includes(name)) {
              actualSheetId = id;
              console.log(`[TableMemory] Action ${index + 1}: 通过模糊匹配找到表格ID: "${originalSheetId}" -> "${name}" (${id})`);
              break;
            }
          }
        } else {
          console.log(`[TableMemory] Action ${index + 1}: 表格名称转换成功: "${originalSheetId}" -> ${actualSheetId}`);
        }
        
        if (!actualSheetId) {
          console.warn(`[TableMemory] Action ${index + 1}: 无法找到表格"${originalSheetId}"对应的ID，该操作将被跳过`);
          return null; // 标记为无效操作
        }
        
        // 返回更新后的action
        return {
          ...action,
          sheetId: actualSheetId
        };
      }).filter(Boolean); // 过滤掉无效操作
      
      console.log(`[TableMemory] tableActions预处理完成，有效操作数: ${initialTableActions.length}`);
    }
    // ----------- 新增结束 -----------

    // 使用顺序处理模式 - 不再支持批处理模式
    console.log(`[TableMemory] 使用顺序处理模式处理 ${sheets.length} 个表格`);
    console.log(`[TableMemory] 处理内容: ${messageContent.substring(0, 100)}...，准备调用 SheetManager.processSheets`);
    
    try {
      // 记录 initialTableActions 的重要信息
      if (initialTableActions && initialTableActions.length > 0) {
        console.log(`[TableMemory] 将向 SheetManager 传递 ${initialTableActions.length} 条tableActions`);
        initialTableActions.forEach((action, idx) => {
          console.log(`[TableMemory] TableAction ${idx + 1}: action=${action.action}, sheetId=${action.sheetId}`);
        });
      }
      
      // 使用顺序处理方法处理所有表格
      const updatedSheets = await SheetManager.processSheets(
        sheets,
        messageContent,
        {
          isMultiRound: options.isMultiRound,
          userName: options.userName,
          aiName: options.aiName,
          initialTableActions // 传递LLM生成的表格操作
        }
      );
      
      console.log(`[TableMemory] 处理完成，共更新了 ${updatedSheets.length} 个表格`);
      return { updatedSheets };
    } catch (error) {
      console.error('[TableMemory] 调用 SheetManager.processSheets 失败:', error);
      // 尝试恢复：手动调用每个表格操作
      if (initialTableActions && initialTableActions.length > 0) {
        console.log('[TableMemory] 尝试手动处理表格操作进行恢复...');
        const recoveredSheetIds = new Set<string>();
        
        for (const action of initialTableActions) {
          try {
            switch (action.action) {
              case 'insert':
                if (action.sheetId && action.rowData) {
                  await SheetManager.insertRow(action.sheetId, action.rowData);
                  recoveredSheetIds.add(action.sheetId);
                  console.log(`[TableMemory] 恢复模式: 成功插入行到表格 ${action.sheetId}`);
                }
                break;
              case 'update':
                if (action.sheetId && action.rowIndex !== undefined && action.rowData) {
                  await SheetManager.updateRow(action.sheetId, action.rowIndex, action.rowData);
                  recoveredSheetIds.add(action.sheetId);
                  console.log(`[TableMemory] 恢复模式: 成功更新表格 ${action.sheetId} 的行 ${action.rowIndex}`);
                }
                break;
              case 'delete':
                if (action.sheetId && action.rowIndex !== undefined) {
                  await SheetManager.deleteRow(action.sheetId, action.rowIndex);
                  recoveredSheetIds.add(action.sheetId);
                  console.log(`[TableMemory] 恢复模式: 成功删除表格 ${action.sheetId} 的行 ${action.rowIndex}`);
                }
                break;
            }
          } catch (innerError) {
            console.error(`[TableMemory] 恢复模式执行表格操作失败:`, innerError);
          }
        }
        
        if (recoveredSheetIds.size > 0) {
          const recoveredIds = Array.from(recoveredSheetIds);
          console.log(`[TableMemory] 恢复模式: 成功更新了 ${recoveredIds.length} 个表格: ${recoveredIds.join(', ')}`);
          return { updatedSheets: recoveredIds };
        }
      }
      
      return { updatedSheets: [] };
    }
  } catch (error) {
    console.error('[TableMemory] 处理聊天消息失败:', error);
    return { updatedSheets: [] };
  }
}

/**
 * 获取 LLM 实例
 * 从 SheetManager 中提取出来方便复用
 */
export async function getLLMInstance(): Promise<any> {
  try {
    // 直接使用SheetManager的方法获取LLM实例，确保一致性
    return await SheetManager['getLLM']();
  } catch (error) {
    console.error('[TableMemory] 获取LLM实例失败:', error);
    throw error;
  }
}

/**
 * 获取已选择的表格模板
 * @returns 已选择的模板列表
 */
export async function getSelectedTemplates(): Promise<SheetTemplate[]> {
  try {
    // 从存储中获取设置
    const settings = await TemplateManager.getSettings();
    const selectedIds = settings.selectedTemplates || [];
    
    if (selectedIds.length === 0) {
      return [];
    }
    
    // 获取所有模板
    const allTemplates = await TemplateManager.getAllTemplates();
    
    // 过滤出已选择的模板
    return allTemplates.filter(template => selectedIds.includes(template.uid));
  } catch (error) {
    console.error('[TableMemory] 获取已选择的模板失败:', error);
    return [];
  }
}

/**
 * 获取所有模板
 * @returns 所有模板列表
 */
export async function getAllTemplates(): Promise<SheetTemplate[]> {
  try {
    if (!getIndexModule().isEnabled()) {
      console.log('[TableMemory] 插件未启用，跳过获取模板');
      return [];
    }
    
    console.log(`[TableMemory] 获取所有模板`);
    
    // 使用TemplateManager获取所有模板
    return await TemplateManager.getAllTemplates();
  } catch (error) {
    console.error('[TableMemory] 获取所有模板失败:', error);
    return [];
  }
}

/**
 * 根据模板创建表格
 * @param templates 模板列表
 * @param characterId 角色ID
 * @param conversationId 会话ID
 * @returns 创建的表格ID列表
 */
export async function createSheetsFromTemplates(
  templates: SheetTemplate[] | string[],
  characterId: string,
  conversationId: string
): Promise<string[]> {
  try {
    // Enhanced logging for debugging
    console.log(`[TableMemory] createSheetsFromTemplates - characterId: "${characterId}", conversationId: "${conversationId}"`);
    
    const createdSheetIds: string[] = [];
    
    // 如果输入是模板ID数组，先获取完整模板
    let templateObjects = Array.isArray(templates) && typeof templates[0] === 'string'
      ? await Promise.all((templates as string[]).map(id => TemplateManager.getTemplate(id)))
      : templates as SheetTemplate[];
    
    // 过滤掉无效模板
    templateObjects = templateObjects.filter(Boolean);
    
    if (templateObjects.length === 0) {
      console.log('[TableMemory] No valid templates to create sheets from');
      return [];
    }
    
    console.log(`[TableMemory] Creating sheets from ${templateObjects.length} templates`);
    
    // Ensure IDs are properly formatted strings
    const safeCharacterId = String(characterId || '').trim();
    const safeConversationId = conversationId ? String(conversationId).trim() : safeCharacterId;
    
    console.log(`[TableMemory] Using normalized IDs - characterId: "${safeCharacterId}", conversationId: "${safeConversationId}"`);
    
    // 为每个模板创建表格
    for (const template of templateObjects) {
      try {
        if (!template) continue;
        console.log(`[TableMemory] Creating sheet from template: ${template.name} (${template.uid})`);
        
        const sheet = await SheetManager.createSheet({
          templateId: template.uid,
          name: template.name,
          characterId: safeCharacterId,
          conversationId: safeConversationId
        });
        
        console.log(`[TableMemory] Successfully created sheet: ${sheet.name} (${sheet.uid}) with characterId: "${sheet.characterId}", conversationId: "${sheet.conversationId}"`);
        createdSheetIds.push(sheet.uid);
      } catch (error) {
        console.error(`[TableMemory] 从模板 ${template!.name} 创建表格失败:`, error);
      }
    }
    
    if (createdSheetIds.length > 0) {
      // Verify that the created tables can be retrieved
      console.log(`[TableMemory] Verifying created sheets can be retrieved...`);
      const verificationCheck = await SheetManager.getSheetsByCharacter(
        safeCharacterId,
        safeConversationId
      );
      
      console.log(`[TableMemory] Verification found ${verificationCheck.length} sheets`);
      verificationCheck.forEach((sheet, index) => {
        console.log(`[TableMemory] Verification ${index + 1}: ${sheet.name} (${sheet.uid}), characterId: "${sheet.characterId}", conversationId: "${sheet.conversationId}"`);
      });
    }
    
    return createdSheetIds;
  } catch (error) {
    console.error('[TableMemory] 从模板创建表格失败:', error);
    return [];
  }
}

/**
 * 获取角色的所有表格
 * @param characterId 角色ID
 * @param conversationId 可选的会话ID
 * @returns 表格列表
 */
export async function getCharacterSheets(
  characterId: string,
  conversationId?: string
): Promise<Sheet[]> {
  return SheetManager.getSheetsByCharacter(characterId, conversationId);
}

/**
 * 获取角色的所有表格数据（便于外部系统使用）
 * @param characterId 角色ID
 * @param conversationId 可选的会话ID
 * @returns 格式化的表格数据对象
 */
export async function getCharacterTablesData(
  characterId: string,
  conversationId?: string
): Promise<{
  success: boolean;
  tables: Array<{
    id: string;
    name: string;
    headers: string[];
    rows: string[][];
    text: string;
  }>;
  error?: string;
}> {
  try {
    // 检查插件是否启用和初始化
    if (!getIndexModule().isEnabled()) {
      console.log('[TableMemory] 插件未启用，跳过获取表格数据');
      return { success: false, tables: [], error: '表格记忆插件未启用' };
    }
    
    // Ensure consistent ID handling
    const safeCharacterId = String(characterId || '').trim();
    const safeConversationId = conversationId ? String(conversationId).trim() : safeCharacterId;
    
    console.log(`[TableMemory] getCharacterTablesData - 获取角色 ID: "${safeCharacterId}" 的表格数据`);
    if (conversationId) {
      console.log(`[TableMemory] 会话过滤 ID: "${safeConversationId}"`);
    }
    
    // 获取角色的所有表格
    const sheets = await SheetManager.getSheetsByCharacter(
      safeCharacterId,
      safeConversationId
    );
    
    console.log(`[TableMemory] 找到 ${sheets.length} 个表格数据`);
    
    // 格式化表格数据，便于外部系统使用
    const formattedTables = sheets.map(sheet => {
      // 获取表格的行数和列数
      const rowCount = getRowCount(sheet);
      const colCount = getColumnCount(sheet);
      
      // 将表格转换为二维数组，方便外部处理
      const matrix = Array(rowCount)
        .fill(null)
        .map(() => Array(colCount).fill(''));
      
      // 填充数据
      sheet.cells.forEach(cell => {
        if (cell.rowIndex < rowCount && cell.colIndex < colCount) {
          matrix[cell.rowIndex][cell.colIndex] = cell.value;
        }
      });
      
      // 获取表头（第一行）
      const headers = matrix[0] || [];
      
      // 获取数据行（第二行开始）
      const rows = matrix.slice(1);
      
      return {
        id: sheet.uid,
        name: sheet.name,
        headers: headers,
        rows: rows,
        text: toText(sheet) // 添加文本表示形式，方便显示
      };
    });
    
    return {
      success: true,
      tables: formattedTables
    };
  } catch (error) {
    console.error('[TableMemory] 获取角色表格数据失败:', error);
    return {
      success: false,
      tables: [], 
      error: error instanceof Error ? error.message : '未知错误'
    };
  }
}

/**
 * 获取单个表格详情
 * @param sheetId 表格ID
 * @returns 表格对象或null
 */
export async function getSheet(sheetId: string): Promise<Sheet | null> {
  try {
    if (!getIndexModule().isEnabled()) {
      console.log('[TableMemory] 插件未启用，跳过获取表格');
      return null;
    }
    
    console.log(`[TableMemory] 获取表格详情: ${sheetId}`);
    return await SheetManager.getSheet(sheetId);
  } catch (error) {
    console.error(`[TableMemory] 获取表格 ${sheetId} 详情失败:`, error);
    return null;
  }
}

/**
 * 通过名称获取表格
 * @param tableName 表格名称
 * @param characterId 角色ID
 * @param conversationId 会话ID
 * @returns 表格对象或null
 */
export async function getSheetByName(
  tableName: string,
  characterId: string,
  conversationId?: string
): Promise<Sheet | null> {
  try {
    if (!getIndexModule().isEnabled()) {
      console.log('[TableMemory] 插件未启用，跳过获取表格');
      return null;
    }
    
    // Ensure consistent type handling for IDs
    const safeCharacterId = String(characterId);
    const safeConversationId = conversationId ? String(conversationId) : safeCharacterId;
    
    console.log(`[TableMemory] 通过名称获取表格: "${tableName}" for character ${safeCharacterId}, conversation ${safeConversationId}`);
    
    // 首先获取角色的所有表格
    const sheets = await SheetManager.getSheetsByCharacter(
      safeCharacterId,
      safeConversationId
    );
    
    console.log(`[TableMemory] 找到 ${sheets.length} 个表格，开始寻找名为 "${tableName}" 的表格`);
    
    // Debug: List all available tables
    if (sheets.length > 0) {
      console.log('[TableMemory] 当前可用的表格:');
      sheets.forEach(sheet => {
        console.log(`- "${sheet.name}" (ID: ${sheet.uid})`);
      });
    }
    
    // 先进行精确匹配
    const exactMatch = sheets.find(sheet => sheet.name === tableName);
    
    if (exactMatch) {
      console.log(`[TableMemory] 找到精确匹配表格: "${tableName}", ID: ${exactMatch.uid}`);
      return exactMatch;
    }
    
    // 进行不区分大小写的匹配
    const caseInsensitiveMatch = sheets.find(sheet => 
      sheet.name.toLowerCase() === tableName.toLowerCase()
    );
    
    if (caseInsensitiveMatch) {
      console.log(`[TableMemory] 找到不区分大小写匹配的表格: "${caseInsensitiveMatch.name}", ID: ${caseInsensitiveMatch.uid}`);
      return caseInsensitiveMatch;
    }
    
    // 尝试模糊匹配 (检查表格名是否包含搜索名或搜索名包含表格名)
    const fuzzyMatches = sheets.filter(sheet => 
      sheet.name.includes(tableName) || 
      tableName.includes(sheet.name)
    );
    
    if (fuzzyMatches.length > 0) {
      // 选择最相似的匹配项 (优先选择较短的名称以避免过度匹配)
      const bestMatch = fuzzyMatches.sort((a, b) => a.name.length - b.name.length)[0];
      console.log(`[TableMemory] 找到部分匹配表格: "${bestMatch.name}", ID: ${bestMatch.uid}`);
      return bestMatch;
    }
    
    // 如果前面都没有找到匹配项，尝试特殊情况处理
    // 对于常见的表格类型进行名称变体检查
    if (tableName.includes('表格')) {
      // 尝试不包含"表格"的搜索
      const nameWithoutType = tableName.replace(/表格/, '').trim();
      
      const withoutTypeMatch = sheets.find(sheet => 
        sheet.name.includes(nameWithoutType) && nameWithoutType.length > 0
      );
      
      if (withoutTypeMatch) {
        console.log(`[TableMemory] 找到名称变体匹配的表格: "${withoutTypeMatch.name}", ID: ${withoutTypeMatch.uid}`);
        return withoutTypeMatch;
      }
    }
    
    console.log(`[TableMemory] 未找到名为 "${tableName}" 的表格`);
    return null;
  } catch (error) {
    console.error(`[TableMemory] 通过名称获取表格失败:`, error);
    return null;
  }
}

/**
 * 向表格插入行
 * @param sheetId 表格ID
 * @param rowData 行数据 (键是列索引，值是单元格内容)
 * @returns 是否成功
 */
export async function insertRow(
  sheetId: string,
  rowData: Record<number, string>
): Promise<boolean> {
  try {
    await SheetManager.insertRow(sheetId, rowData);
    return true;
  } catch (error) {
    console.error(`[TableMemory] 向表格 ${sheetId} 插入行失败:`, error);
    return false;
  }
}

/**
 * 更新表格中的行
 * @param sheetId 表格ID
 * @param rowIndex 行索引 (从0开始)
 * @param rowData 行数据 (键是列索引，值是单元格内容)
 * @returns 是否成功
 */
export async function updateRow(
  sheetId: string,
  rowIndex: number,
  rowData: Record<number, string>
): Promise<boolean> {
  try {
    await SheetManager.updateRow(sheetId, rowIndex, rowData);
    return true;
  } catch (error) {
    console.error(`[TableMemory] 更新表格 ${sheetId} 的行 ${rowIndex} 失败:`, error);
    return false;
  }
}

/**
 * 删除表格中的行
 * @param sheetId 表格ID
 * @param rowIndex 行索引 (从0开始)
 * @returns 是否成功
 */
export async function deleteRow(
  sheetId: string,
  rowIndex: number
): Promise<boolean> {
  try {
    await SheetManager.deleteRow(sheetId, rowIndex);
    return true;
  } catch (error) {
    console.error(`[TableMemory] 删除表格 ${sheetId} 的行 ${rowIndex} 失败:`, error);
    return false;
  }
}

/**
 * 批量执行表格操作
 * @param actions 表格操作数组
 * @returns 已更新的表格ID数组
 */
export async function batchTableActions(
  actions: Array<{
    action: 'insert' | 'update' | 'delete';
    sheetId: string;
    rowData?: Record<number, string>;
    rowIndex?: number;
  }>
): Promise<string[]> {
  try {
    // 调用SheetManager的批量处理方法
    return await SheetManager.batchTableActions(actions);
  } catch (error) {
    console.error('[TableMemory] 批量表格操作失败:', error);
    return [];
  }
}

/**
 * 删除表格
 * @param sheetId 表格ID
 * @returns 是否成功删除
 */
export async function deleteSheet(sheetId: string): Promise<boolean> {
  try {
    if (!getIndexModule().isEnabled()) {
      console.log('[TableMemory] 插件未启用，跳过删除表格');
      return false;
    }
    
    const success = await SheetManager.deleteSheet(sheetId);
    if (success) {
      console.log(`[TableMemory] 表格 ${sheetId} 删除成功`);
    } else {
      console.log(`[TableMemory] 表格 ${sheetId} 删除失败或不存在`);
    }
    return success;
  } catch (error) {
    console.error(`[TableMemory] 删除表格 ${sheetId} 失败:`, error);
    return false;
  }
}

/**
 * 初始化插件
 * @param options 初始化选项
 * @returns 是否成功
 */
export async function init(options: { 
  dbPath?: string; 
  defaultTemplates?: boolean;
  enabled?: boolean;
} = {}): Promise<boolean> {
  try {
    const success = await getIndexModule().initialize(options);
    
    // 设置启用状态
    if (success && options.enabled !== undefined) {
      getIndexModule().setEnabled(options.enabled);
    }
    
    return success;
  } catch (error) {
    console.error('[TableMemory] API初始化失败:', error);
    return false;
  }
}

/**
 * 设置选中的模板
 * @param templateIds 模板ID列表
 * @returns 是否成功
 */
export async function selectTemplates(templateIds: string[]): Promise<boolean> {
  try {
    const templates = await Promise.all(
      templateIds.map(id => TemplateManager.getTemplate(id))
    );
    
    // 过滤掉不存在的模板
    const validTemplateIds = templates
      .filter((template): template is NonNullable<typeof template> => Boolean(template))
      .map(template => template.uid);
    
    // 更新设置
    await TemplateManager.updateSettings({
      selectedTemplates: validTemplateIds
    });
    
    return true;
  } catch (error) {
    console.error('[TableMemory] 设置选中模板失败:', error);
    return false;
  }
}

/**
 * 获取已选模板ID列表
 * @returns 选中的模板ID列表
 */
export async function getSelectedTemplateIds(): Promise<string[]> {
  try {
    const settings = await TemplateManager.getSettings();
    return settings.selectedTemplates || [];
  } catch (error) {
    console.error('[TableMemory] 获取选中模板ID失败:', error);
    return [];
  }
}

/**
 * 通过特定提示词重建表格
 * @param sheetId 表格ID
 * @param chatContent 对话内容
 * @param promptType 提示词类型
 * @returns 是否成功
 */
export async function rebuildSheet(
  sheetId: string,
  chatContent: string,
  promptType: 'rebuild_base' | 'rebuild_compatible' | 'rebuild_summary' | 'rebuild_fix_all' | 
              'rebuild_fix_simplify_all' | 'rebuild_fix_simplify_without_history' | 
              'rebuild_simplify_history' | 'refresh_table_old' = 'rebuild_base'
): Promise<boolean> {
  try {
    // 检查插件是否启用
    if (!getIndexModule().isEnabled()) {
      console.log('[TableMemory] 插件未启用，跳过重建表格');
      return false;
    }
    
    // 获取表格
    const sheet = await SheetManager.getSheet(sheetId);
    if (!sheet) {
      throw new Error(`未找到表格 ${sheetId}`);
    }
    
    console.log(`[TableMemory] 重建表格 "${sheet.name}"，使用提示词类型: ${promptType}`);
    
    // 从profile_prompts中获取对应的提示词
    let prompt = '';
    try {
      // 获取profile_prompts
      const { profile_prompts } = require('@/src/memory/ref_prompt/profile_prompts');
      const selectedPrompt = profile_prompts[promptType];
      
      if (selectedPrompt && selectedPrompt.core_rules) {
        prompt = selectedPrompt.core_rules;
        console.log(`[TableMemory] 成功加载 ${promptType} 提示词`);
      } else {
        console.warn(`[TableMemory] 未找到提示词类型 ${promptType}，尝试使用默认提示词`);
        // 尝试使用rebuild_base提示词
        const basePrompt = profile_prompts['rebuild_base'];
        if (basePrompt && basePrompt.core_rules) {
          prompt = basePrompt.core_rules;
          console.log(`[TableMemory] 使用 rebuild_base 作为备用提示词`);
        } else {
          throw new Error(`未找到有效的提示词`);
        }
      }
    } catch (error) {
      console.error('[TableMemory] 获取提示词失败，使用默认提示词:', error);
      // 使用默认提示词
      prompt = `请分析对话内容和当前表格，更新或修复表格内容。根据需要添加新行、更新现有行或删除不再相关的行，保持表格格式规范且内容准确。`;
    }
    
    // 使用自定义提示词处理表格
    const updated = await SheetManager.processSheetWithCustomPrompt(
      sheetId,
      chatContent,
      prompt
    );
    
    if (updated) {
      console.log(`[TableMemory] 表格 "${sheet.name}" 使用 ${promptType} 提示词重建成功`);
    } else {
      console.log(`[TableMemory] 表格 "${sheet.name}" 无需更新或重建失败`);
    }
    
    return updated;
  } catch (error) {
    console.error('[TableMemory] 重建表格失败:', error);
    return false;
  }
}

/**
 * 检查数据库是否处于锁定状态
 */
export async function checkDatabaseLock(): Promise<{
  isLocked: boolean;
  queueLength: number;
  isProcessingQueue: boolean;
}> {
  // 调用主模块的方法
  return getIndexModule().checkDatabaseLock();
}

/**
 * 重置数据库连接解锁数据库
 * @returns 是否成功
 */
export async function resetDatabaseConnection(): Promise<boolean> {
  // 调用主模块的方法
  return getIndexModule().resetDatabaseConnection();
}
