/**
 * 表格记忆增强插件 - 模板模型
 * 
 * 该文件定义了表格模板的数据结构和相关操作。
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * 列数据类型
 */
export type ColumnDataType = 'text' | 'number' | 'option';

/**
 * 表格类型
 */
export type SheetType = 'free' | 'dynamic' | 'fixed' | 'static';

/**
 * 列定义
 */
export interface ColumnDefinition {
  /**
   * 列标题
   */
  value: string;
  
  /**
   * 列值是否唯一
   */
  valueIsOnly: boolean;
  
  /**
   * 列数据类型
   */
  columnDataType: ColumnDataType;
  
  /**
   * 列说明
   */
  columnNote: string;
  
  /**
   * 可选值列表 (用于option类型)
   */
  options?: string[];
}

/**
 * 表格模板
 */
export interface SheetTemplate {
  /**
   * 模板唯一ID
   */
  uid: string;
  
  /**
   * 模板名称
   */
  name: string;
  
  /**
   * 表格类型
   */
  type: SheetType;
  
  /**
   * 列定义
   */
  columns: ColumnDefinition[];
  
  /**
   * 初始行数
   */
  rows: number;
  
  /**
   * 模板说明
   */
  note: string;
  
  /**
   * 初始化提示词
   */
  initPrompt: string;
  
  /**
   * 插入行提示词
   */
  insertPrompt: string;
  
  /**
   * 删除行提示词
   */
  deletePrompt: string;
  
  /**
   * 更新行提示词
   */
  updatePrompt: string;
  
  /**
   * 创建时间
   */
  createdAt?: string;
  
  /**
   * 更新时间
   */
  updatedAt?: string;
}

/**
 * 模板设置
 */
export interface TemplateSettings {
  /**
   * 选中的模板ID列表
   */
  selectedTemplates: string[];
}

/**
 * 创建新模板选项
 */
export interface CreateTemplateOptions {
  /**
   * 模板名称
   */
  name: string;
  
  /**
   * 表格类型
   */
  type: SheetType;
  
  /**
   * 列定义
   */
  columns: ColumnDefinition[];
  
  /**
   * 初始行数
   */
  rows: number;
  
  /**
   * 模板说明
   */
  note: string;
  
  /**
   * 初始化提示词
   */
  initPrompt: string;
  
  /**
   * 插入行提示词
   */
  insertPrompt: string;
  
  /**
   * 删除行提示词
   */
  deletePrompt: string;
  
  /**
   * 更新行提示词
   */
  updatePrompt: string;
}

/**
 * 创建新模板
 * @param options 创建选项
 * @returns 新创建的模板对象
 */
export function createTemplate(options: CreateTemplateOptions): SheetTemplate {
  const now = new Date().toISOString();
  
  return {
    uid: uuidv4(),
    name: options.name,
    type: options.type,
    columns: options.columns,
    rows: options.rows,
    note: options.note,
    initPrompt: options.initPrompt,
    insertPrompt: options.insertPrompt,
    deletePrompt: options.deletePrompt,
    updatePrompt: options.updatePrompt,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * 创建空模板设置
 * @returns 默认模板设置
 */
export function createEmptySettings(): TemplateSettings {
  return {
    selectedTemplates: []
  };
}

/**
 * 获取表格头部信息
 * @param template 模板对象
 * @returns 表格头部数组
 */
export function getHeaders(template: SheetTemplate): string[] {
  return template.columns.map(col => col.value);
}

/**
 * 验证列数据
 * @param template 模板对象
 * @param colIndex 列索引
 * @param value 列值
 * @returns 验证结果，包含是否有效和错误信息
 */
export function validateColumnValue(
  template: SheetTemplate,
  colIndex: number,
  value: string
): { valid: boolean; error?: string } {
  if (colIndex < 0 || colIndex >= template.columns.length) {
    return { valid: false, error: '列索引超出范围' };
  }
  
  const column = template.columns[colIndex];
  
  // 检查数据类型
  if (column.columnDataType === 'number') {
    if (isNaN(Number(value))) {
      return { valid: false, error: '该列只接受数字值' };
    }
  } else if (column.columnDataType === 'option' && column.options) {
    if (!column.options.includes(value)) {
      return { valid: false, error: `值必须是以下之一: ${column.options.join(', ')}` };
    }
  }
  
  return { valid: true };
}
