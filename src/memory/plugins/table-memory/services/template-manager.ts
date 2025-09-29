/**
 * 表格记忆增强插件 - 模板管理服务
 * 
 * 该服务负责管理表格模板，包括创建、更新、删除和查询等操作。
 */

import { StorageService } from './storage-service';
import { 
  SheetTemplate, 
  createTemplate, 
  CreateTemplateOptions, 
  TemplateSettings,
  createEmptySettings
} from '../models/template';

/**
 * 模板管理服务
 */
export class TemplateManager {
  private static initialized = false;
  
  /**
   * 初始化模板管理器
   */
  static async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    try {
      // 确保存储服务已初始化
      // 这里不需要做额外操作，StorageService 会在 SheetManager 之前初始化
      this.initialized = true;
      console.log('[TableMemory] 模板管理器初始化完成');
    } catch (error) {
      console.error('[TableMemory] 初始化模板管理器失败:', error);
      throw error;
    }
  }
  
  /**
   * 创建新模板
   * @param options 模板选项
   * @returns 创建的模板
   */
  static async createTemplate(options: CreateTemplateOptions): Promise<SheetTemplate> {
    try {
      const template = createTemplate(options);
      await StorageService.saveTemplate(template);
      console.log(`[TableMemory] 成功创建模板 "${template.name}"`);
      return template;
    } catch (error) {
      console.error('[TableMemory] 创建模板失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取所有模板
   * @returns 模板列表
   */
  static async getAllTemplates(): Promise<SheetTemplate[]> {
    try {
      const templates = await StorageService.getAllTemplates();
      console.log(`[TableMemory] 获取所有模板，共 ${templates.length} 个模板`);
      return templates;
    } catch (error) {
      console.error('[TableMemory] 获取所有模板失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取指定模板
   * @param uid 模板ID
   * @returns 模板对象或null
   */
  static async getTemplate(uid: string): Promise<SheetTemplate | null> {
    try {
      const template = await StorageService.getTemplate(uid);
      console.log(`[TableMemory] ${template ? '成功' : '未'}找到模板 ${uid}`);
      return template;
    } catch (error) {
      console.error(`[TableMemory] 获取模板 ${uid} 失败:`, error);
      throw error;
    }
  }
  
  /**
   * 更新模板
   * @param template 更新后的模板
   * @returns 更新后的模板
   */
  static async updateTemplate(template: SheetTemplate): Promise<SheetTemplate> {
    try {
      // 更新时间戳
      template.updatedAt = new Date().toISOString();
      
      await StorageService.saveTemplate(template);
      console.log(`[TableMemory] 成功更新模板 "${template.name}"`);
      return template;
    } catch (error) {
      console.error(`[TableMemory] 更新模板 ${template.uid} 失败:`, error);
      throw error;
    }
  }
  
  /**
   * 删除模板
   * @param uid 模板ID
   * @returns 是否成功
   */
  static async deleteTemplate(uid: string): Promise<boolean> {
    try {
      // 检查模板是否存在
      const template = await StorageService.getTemplate(uid);
      if (!template) {
        console.log(`[TableMemory] 未找到要删除的模板 ${uid}`);
        return false;
      }
      
      await StorageService.deleteTemplate(uid);
      console.log(`[TableMemory] 成功删除模板 "${template.name}"`);
      
      // 更新设置，移除已删除的模板
      const settings = await this.getSettings();
      if (settings.selectedTemplates.includes(uid)) {
        settings.selectedTemplates = settings.selectedTemplates.filter(id => id !== uid);
        await this.updateSettings(settings);
        console.log(`[TableMemory] 已从选中模板中移除已删除的模板 ${uid}`);
      }
      
      return true;
    } catch (error) {
      console.error(`[TableMemory] 删除模板 ${uid} 失败:`, error);
      throw error;
    }
  }
  
  /**
   * 获取模板设置
   * @returns 模板设置
   */
  static async getSettings(): Promise<TemplateSettings> {
    try {
      const settings = await StorageService.getTemplateSettings();
      return settings || createEmptySettings();
    } catch (error) {
      console.error('[TableMemory] 获取模板设置失败:', error);
      return createEmptySettings();
    }
  }
  
  /**
   * 更新模板设置
   * @param settings 更新的设置
   * @returns 更新后的设置
   */
  static async updateSettings(settings: TemplateSettings): Promise<TemplateSettings> {
    try {
      await StorageService.saveTemplateSettings(settings);
      console.log(`[TableMemory] 成功更新模板设置，已选模板: ${settings.selectedTemplates.length}`);
      return settings;
    } catch (error) {
      console.error('[TableMemory] 更新模板设置失败:', error);
      throw error;
    }
  }
  
  /**
   * 复制模板
   * @param uid 要复制的模板ID
   * @param newName 新模板名称
   * @returns 新模板
   */
  static async duplicateTemplate(uid: string, newName?: string): Promise<SheetTemplate> {
    try {
      const template = await StorageService.getTemplate(uid);
      if (!template) {
        throw new Error(`未找到要复制的模板 ${uid}`);
      }
      
      // 创建新模板选项
      const options: CreateTemplateOptions = {
        name: newName || `${template.name} (副本)`,
        type: template.type,
        columns: [...template.columns], // 复制列定义
        rows: template.rows,
        note: template.note,
        initPrompt: template.initPrompt,
        insertPrompt: template.insertPrompt,
        deletePrompt: template.deletePrompt,
        updatePrompt: template.updatePrompt
      };
      
      // 创建新模板
      const newTemplate = await this.createTemplate(options);
      console.log(`[TableMemory] 成功复制模板 "${template.name}" 为 "${newTemplate.name}"`);
      
      return newTemplate;
    } catch (error) {
      console.error(`[TableMemory] 复制模板 ${uid} 失败:`, error);
      throw error;
    }
  }
  
  /**
   * 导出模板
   * @param uid 模板ID
   * @returns 模板JSON对象
   */
  static async exportTemplate(uid: string): Promise<object> {
    try {
      const template = await StorageService.getTemplate(uid);
      if (!template) {
        throw new Error(`未找到要导出的模板 ${uid}`);
      }
      
      // 返回干净的模板对象，不包含内部属性
      const exportObj = {
        name: template.name,
        type: template.type,
        columns: template.columns,
        rows: template.rows,
        note: template.note,
        initPrompt: template.initPrompt,
        insertPrompt: template.insertPrompt,
        deletePrompt: template.deletePrompt,
        updatePrompt: template.updatePrompt
      };
      
      console.log(`[TableMemory] 成功导出模板 "${template.name}"`);
      return exportObj;
    } catch (error) {
      console.error(`[TableMemory] 导出模板 ${uid} 失败:`, error);
      throw error;
    }
  }
  
  /**
   * 导入模板
   * @param templateData 模板数据
   * @returns 导入的模板
   */
  static async importTemplate(templateData: any): Promise<SheetTemplate> {
    try {
      // 验证基本字段
      if (!templateData.name || !templateData.columns) {
        throw new Error('无效的模板数据：缺少必要字段');
      }
      
      // 创建新模板选项
      const options: CreateTemplateOptions = {
        name: templateData.name,
        type: templateData.type || 'dynamic',
        columns: templateData.columns,
        rows: templateData.rows || 2,
        note: templateData.note || '',
        initPrompt: templateData.initPrompt || '',
        insertPrompt: templateData.insertPrompt || '',
        deletePrompt: templateData.deletePrompt || '',
        updatePrompt: templateData.updatePrompt || ''
      };
      
      // 创建新模板
      const template = await this.createTemplate(options);
      console.log(`[TableMemory] 成功导入模板 "${template.name}"`);
      
      return template;
    } catch (error) {
      console.error('[TableMemory] 导入模板失败:', error);
      throw error;
    }
  }
}
