/**
 * 表格记忆增强插件 - 存储服务
 * 
 * 该服务负责处理与存储系统的交互，提供表格数据的持久化存储。
 * 已从SQLite数据库存储迁移到文件系统JSON存储。
 */

import { FileSystemStorage } from './file-system-storage';
import { SheetTemplate, TemplateSettings } from '../models/template';
import { Sheet } from '../models/sheet';
import { Cell } from '../models/cell';

/**
 * 存储服务
 * 这是一个适配层，将原先的SQLite操作接口转发到文件系统存储实现
 */
export class StorageService {
  /**
   * 初始化存储服务
   * @param dbPath 可选的数据库路径（现为基础目录路径）
   * @param options 额外选项
   */
  static async initialize(dbPath?: string, options?: {useQueue?: boolean}): Promise<void> {
    try {
      // 初始化文件系统存储，传递队列选项
      await FileSystemStorage.initialize(dbPath, options);
      console.log('[TableMemory] 存储服务(文件系统)初始化完成');
    } catch (error) {
      console.error('[TableMemory] 初始化存储服务失败:', error);
      throw error;
    }
  }

  /**
   * 设置是否使用队列系统 (新增)
   * @param useQueue 是否使用队列
   */
  static setUseQueueSystem(useQueue: boolean): void {
    FileSystemStorage.setUseQueueSystem(useQueue);
  }
  
  /**
   * 保存模板
   * @param template 模板对象
   */
  static async saveTemplate(template: SheetTemplate): Promise<void> {
    return FileSystemStorage.saveTemplate(template);
  }
  
  /**
   * 获取所有模板
   * @returns 模板列表
   */
  static async getAllTemplates(): Promise<SheetTemplate[]> {
    return FileSystemStorage.getAllTemplates();
  }
  
  /**
   * 获取模板
   * @param uid 模板ID
   * @returns 模板对象或null
   */
  static async getTemplate(uid: string): Promise<SheetTemplate | null> {
    return FileSystemStorage.getTemplate(uid);
  }
  
  /**
   * 删除模板
   * @param uid 模板ID
   */
  static async deleteTemplate(uid: string): Promise<void> {
    return FileSystemStorage.deleteTemplate(uid);
  }
  
  /**
   * 保存表格
   * @param sheet 表格对象
   */
  static async saveSheet(sheet: Sheet): Promise<void> {
    return FileSystemStorage.saveSheet(sheet);
  }
  
  /**
   * 获取表格
   * @param uid 表格ID
   * @returns 表格对象或null
   */
  static async getSheet(uid: string): Promise<Sheet | null> {
    return FileSystemStorage.getSheet(uid);
  }
  
  /**
   * 删除表格
   * @param uid 表格ID
   */
  static async deleteSheet(uid: string): Promise<void> {
    return FileSystemStorage.deleteSheet(uid);
  }
  
  /**
   * 获取所有表格
   * @returns 表格列表
   */
  static async getAllSheets(): Promise<Sheet[]> {
    return FileSystemStorage.getAllSheets();
  }

  /**
   * 获取角色的所有表格
   * @param characterId 角色ID
   * @param conversationId 可选的对话ID
   * @returns 表格列表
   */
  static async getSheetsByCharacter(characterId: string, conversationId?: string): Promise<Sheet[]> {
    return FileSystemStorage.getSheetsByCharacter(characterId, conversationId);
  }
  
  /**
   * 获取表格中指定行的单元格
   * @param sheetId 表格ID
   * @param rowIndex 行索引
   * @returns 单元格列表
   */
  static async getCellsByRow(sheetId: string, rowIndex: number): Promise<Cell[]> {
    return FileSystemStorage.getCellsByRow(sheetId, rowIndex);
  }
  
  /**
   * 删除表格中指定行的单元格
   * 在基于文件的实现中，这需要更新整个表格文件
   * @param sheetId 表格ID
   * @param rowIndex 行索引
   */
  static async deleteCellsByRow(sheetId: string, rowIndex: number): Promise<void> {
    // 获取表格
    const sheet = await FileSystemStorage.getSheet(sheetId);
    if (!sheet) {
      throw new Error(`未找到表格 ${sheetId}`);
    }
    
    // 删除指定行的单元格
    sheet.cells = sheet.cells.filter(cell => cell.rowIndex !== rowIndex);
    
    // 更新表格文件
    await FileSystemStorage.saveSheet(sheet);
  }
  
  /**
   * 获取表格最大行索引
   * @param sheetId 表格ID
   * @returns 最大行索引，如果表格为空则返回-1
   */
  static async getMaxRowIndex(sheetId: string): Promise<number> {
    return FileSystemStorage.getMaxRowIndex(sheetId);
  }
  
  /**
   * 获取设置
   * @param key 设置键
   * @returns 设置值或null
   */
  static async getSetting(key: string): Promise<any | null> {
    return FileSystemStorage.getSetting(key);
  }
  
  /**
   * 保存设置
   * @param key 设置键
   * @param value 设置值
   */
  static async saveSetting(key: string, value: any): Promise<void> {
    return FileSystemStorage.saveSetting(key, value);
  }
  
  /**
   * 获取模板设置
   * @returns 模板设置
   */
  static async getTemplateSettings(): Promise<TemplateSettings> {
    return FileSystemStorage.getTemplateSettings();
  }
  
  /**
   * 保存模板设置
   * @param settings 模板设置
   */
  static async saveTemplateSettings(settings: TemplateSettings): Promise<void> {
    return FileSystemStorage.saveTemplateSettings(settings);
  }
  
  /**
   * 检查数据库锁定状态
   */
  static async checkDatabaseLock(): Promise<{
    isLocked: boolean;
    queueLength: number;
    isProcessingQueue: boolean;
  }> {
    return FileSystemStorage.checkDatabaseLock();
  }
  
  /**
   * 重置数据库连接
   */
  static async resetDatabase(): Promise<boolean> {
    return FileSystemStorage.resetDatabase();
  }
  
  /**
   * 关闭数据库连接
   */
  static async close(): Promise<void> {
    await FileSystemStorage.close();
  }
}