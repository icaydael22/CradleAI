import * as TableMemory from '../src/memory/plugins/table-memory';
import { Message } from '../src/memory/types';

interface TableMemoryServiceOptions {
  characterId: string;
  conversationId?: string;
  userName?: string;
  aiName?: string;
  messages?: Message[] | string;
  chatContent?: string;
  isMultiRound?: boolean;
  tableNameToId?: Record<string, string>; // 新增
}

/**
 * TableMemoryService
 * 独立的表格记忆全流程服务
 */
export class TableMemoryService {
  /**
   * 获取聊天内容（优先chatContent，其次messages）
   */
  static async getChatContent(options: TableMemoryServiceOptions): Promise<string> {
    console.log(`[TableMemoryService] [1] 开始获取聊天内容，参数:`, options);
    if (options.chatContent) {
      console.log(`[TableMemoryService] [1.1] 使用chatContent参数`);
      return options.chatContent;
    }
    if (typeof options.messages === 'string') {
      console.log(`[TableMemoryService] [1.2] messages为字符串，直接返回`);
      return options.messages;
    }
    if (Array.isArray(options.messages) && options.messages.length > 0) {
      const userName = options.userName || '用户';
      const aiName = options.aiName || 'AI';
      const content = options.messages.map(m => {
        const role = m.role === 'assistant' ? aiName : (m.role === 'user' ? userName : m.role);
        const msgContent = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return `${role}: ${msgContent}`;
      }).join('\n\n');
      console.log(`[TableMemoryService] [1.3] messages为数组，拼接后内容:\n${content}`);
      return content;
    }
    console.log(`[TableMemoryService] [1.4] 未获取到有效聊天内容，返回空字符串`);
    return '';
  }

  /**
   * 获取表格数据
   */
  static async getTableData(characterId: string, conversationId?: string) {
    console.log(`[TableMemoryService] [2] 获取表格数据，characterId=${characterId}, conversationId=${conversationId}`);
    const data = await TableMemory.API.getCharacterTablesData(characterId, conversationId);
    console.log(`[TableMemoryService] [2.1] 表格数据获取完成:`, data);
    return data;
  }

  /**
   * 生成表格记忆专用提示词
   */
  static async buildPrompts(
    chatContent: string,
    tableData: any,
    options: { userName?: string; aiName?: string; tableNameToId?: Record<string, string> } = {}
  ): Promise<{ systemPrompt: string; userPrompt: string; tableNameToId?: Record<string, string> }> {
    console.log(`[TableMemoryService] [3] 构建表格专用提示词`);
    const userName = options.userName || '用户';
    const aiName = options.aiName || 'AI';
    let tableText = '';
    if (Array.isArray(tableData)) {
      tableText = tableData.map(sheet =>
        `表格名称: ${sheet.name}\n${sheet.text || ''}`
      ).join('\n\n');
    } else if (typeof tableData === 'string') {
      tableText = tableData;
    } else {
      tableText = JSON.stringify(tableData, null, 2);
    }
    // 优化后的提示词，明确参数规范
    const systemPrompt = `你是专业的表格记忆助手，只负责结构化表格信息的提取与维护。请严格按照表格结构和规则处理。`;
    const userPrompt = `
当前表格数据:
${tableText}

对话内容:
${chatContent}

请分析对话内容，生成表格操作指令（JSON格式），严格按照如下参数规范输出：

- action: 操作类型，支持 "insert"（插入行）、"update"（更新行）、"delete"（删除行）
- sheetId: 目标表格的名称（如: "重要物品表格"），系统会自动转换为表格ID
- rowIndex: 行索引（从1开始，仅update/delete需要）
- rowData: 行数据对象，键为列索引（如 "0", "1", ...），值为单元格内容（仅insert/update需要）
- colIndex/newValue: 如只需更新单元格，可用 colIndex 指定列索引，newValue 指定新值（可选）

另外注意，不用修改第0行，因为第0行是标题行。

示例:
{
  "tableActions": [
    {
      "action": "insert",
      "sheetId": "重要物品表格",
      "rowData": { "0": "用户", "1": "重要的包裹", "2": "镜子", "3": "原因" }
    },
    {
      "action": "update",
      "sheetId": "重要物品表格",
      "rowIndex": 1,
      "rowData": { "2": "镜子" }
    },
    {
      "action": "update",
      "sheetId": "重要物品表格",
      "rowIndex": 1,
      "colIndex": 2,
      "newValue": "镜子"
    },
    {
      "action": "delete",
      "sheetId": "重要物品表格",
      "rowIndex": 1
    }
  ]
}

请只返回JSON对象，且每个tableAction必须包含 action 和 sheetId，其他参数按需填写，rowData 必须为对象且键为列索引，值为字符串。
`;
    console.log(`[TableMemoryService] [3.1] systemPrompt:\n${systemPrompt}`);
    console.log(`[TableMemoryService] [3.2] userPrompt:\n${userPrompt}`);
    // 新增：将表格名称和ID映射传递下去
    return { systemPrompt, userPrompt, tableNameToId: options.tableNameToId };
  }

  /**
   * 独立调用LLM，获取表格操作指令
   */
  static async callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
    console.log(`[TableMemoryService] [4] 调用LLM生成表格操作指令...`);
    const llm = await TableMemory.API.getLLMInstance();
    if (!llm) {
      console.error(`[TableMemoryService] [4.1] LLM实例不可用`);
      throw new Error('LLM实例不可用');
    }
    const response = await llm.generateResponse(
      [
        { role: "user", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      { type: "json_object" }
    );
    const respContent = typeof response === 'string' ? response : response.content;
    console.log(`[TableMemoryService] [4.2] LLM响应内容:\n${respContent}`);
    return respContent;
  }

  /**
   * 解析LLM响应，提取表格操作指令，并将表格名称映射为真实sheetId
   */
  static parseTableActions(llmResponse: string, tableNameToId?: Record<string, string>): any[] {
    console.log(`[TableMemoryService] [5] 解析LLM响应，提取表格操作指令...`);
    let clean = llmResponse
      .replace(/^\s*```json\s*/i, '')
      .replace(/^\s*```\s*/i, '')
      .replace(/\s*```[\s\n]*$/i, '')
      .trim();
    try {
      let json: any = null;
      try {
        json = JSON.parse(clean);
      } catch {
        const match = clean.match(/\{[\s\S]*\}/);
        if (match) json = JSON.parse(match[0]);
      }
      if (json && Array.isArray(json.tableActions)) {
        // 新增：将sheetId为表格名称的映射为真实sheetId
        if (tableNameToId) {
          json.tableActions = json.tableActions.map((action: any) => {
            if (
              typeof action.sheetId === 'string' &&
              tableNameToId[action.sheetId]
            ) {
              return { ...action, sheetId: tableNameToId[action.sheetId] };
            }
            return action;
          });
        }
        console.log(`[TableMemoryService] [5.1] 成功解析到tableActions:`, json.tableActions);
        return json.tableActions;
      }
    } catch (e) {
      console.warn(`[TableMemoryService] [5.2] 解析LLM响应失败:`, e);
    }
    console.warn(`[TableMemoryService] [5.3] 未能解析到有效的tableActions，返回空数组`);
    return [];
  }

  /**
   * 执行表格操作
   */
  static async applyTableActions(tableActions: any[]): Promise<string[]> {
    console.log(`[TableMemoryService] [6] 开始执行表格操作，共${tableActions?.length || 0}条`);
    if (!tableActions || tableActions.length === 0) {
      console.log(`[TableMemoryService] [6.1] 无需执行表格操作，直接返回`);
      return [];
    }
    const updatedSheets: string[] = [];
    for (const action of tableActions) {
      try {
        switch (action.action) {
          case 'insert':
            if (action.sheetId && action.rowData && typeof action.rowData === 'object') {
              console.log(`[TableMemoryService] [6.2] 插入行 sheetId=${action.sheetId}, rowData=`, action.rowData);
              await TableMemory.API.insertRow(action.sheetId, action.rowData);
              updatedSheets.push(action.sheetId);
            }
            break;
          case 'update':
            // 支持两种格式：整行(rowData)或单元格(colIndex+newValue)
            if (action.sheetId && action.rowIndex !== undefined) {
              if (action.rowData && typeof action.rowData === 'object') {
                console.log(`[TableMemoryService] [6.3] 更新行 sheetId=${action.sheetId}, rowIndex=${action.rowIndex}, rowData=`, action.rowData);
                await TableMemory.API.updateRow(action.sheetId, action.rowIndex, action.rowData);
                updatedSheets.push(action.sheetId);
              } else if (action.colIndex !== undefined && action.newValue !== undefined) {
                // 单元格更新，转为rowData格式
                const rowData: Record<number, string> = { [action.colIndex]: action.newValue };
                console.log(`[TableMemoryService] [6.3b] 单元格更新 sheetId=${action.sheetId}, rowIndex=${action.rowIndex}, colIndex=${action.colIndex}, newValue=${action.newValue}`);
                await TableMemory.API.updateRow(action.sheetId, action.rowIndex, rowData);
                updatedSheets.push(action.sheetId);
              }
            }
            break;
          case 'delete':
            if (action.sheetId && action.rowIndex !== undefined) {
              console.log(`[TableMemoryService] [6.4] 删除行 sheetId=${action.sheetId}, rowIndex=${action.rowIndex}`);
              await TableMemory.API.deleteRow(action.sheetId, action.rowIndex);
              updatedSheets.push(action.sheetId);
            }
            break;
          default:
            console.warn(`[TableMemoryService] [6.5] 未知表格操作类型:`, action);
        }
      } catch (e) {
        console.warn(`[TableMemoryService] [6.6] 执行单条表格操作失败:`, e, action);
      }
    }
    const uniqueSheets = Array.from(new Set(updatedSheets));
    console.log(`[TableMemoryService] [6.7] 表格操作执行完成，更新的表格ID:`, uniqueSheets);
    return uniqueSheets;
  }

  /**
   * 表格记忆全流程：获取内容→生成提示词→LLM→解析→执行表格操作
   */
  static async process(options: TableMemoryServiceOptions): Promise<{ updatedSheets: string[] }> {
    console.log(`[TableMemoryService] [0] ====== 表格记忆全流程开始 ======`, options);
    const characterId = options.characterId;
    const conversationId = options.conversationId || characterId;
    const chatContent = await this.getChatContent(options);
    const tableDataResult = await this.getTableData(characterId, conversationId);
    const tableData = tableDataResult?.tables || [];
    const { systemPrompt, userPrompt } = await this.buildPrompts(chatContent, tableData, {
      userName: options.userName,
      aiName: options.aiName,
      tableNameToId: options.tableNameToId // 传递映射
    });
    const llmResponse = await this.callLLM(systemPrompt, userPrompt);
    const tableActions = this.parseTableActions(llmResponse, options.tableNameToId); // 传递映射
    const updatedSheets = await this.applyTableActions(tableActions);
    console.log(`[TableMemoryService] [9] ====== 表格记忆全流程结束，最终更新表格ID:`, updatedSheets);
    return { updatedSheets };
  }
}

export default TableMemoryService;
