/**
 * 表格记忆增强插件 - 表格模型
 * 
 * 该文件定义了表格数据结构和相关操作。
 */

import { Cell } from './cell';
import { v4 as uuidv4 } from 'uuid';

/**
 * 表格接口
 */
export interface Sheet {
  /**
   * 表格唯一ID
   */
  uid: string;
  
  /**
   * 表格模板ID
   */
  templateId: string;
  
  /**
   * 表格名称
   */
  name: string;
  
  /**
   * 所属角色ID
   */
  characterId: string;
  
  /**
   * 所属会话ID
   */
  conversationId: string;
  
  /**
   * 表格单元格数据
   */
  cells: Cell[];
  
  /**
   * 创建时间
   */
  createdAt: string;
  
  /**
   * 更新时间
   */
  updatedAt: string;
}

/**
 * 创建表格选项
 */
export interface CreateSheetOptions {
  /**
   * 表格模板ID
   */
  templateId: string;
  
  /**
   * 表格名称
   */
  name: string;
  
  /**
   * 所属角色ID
   */
  characterId: string;
  
  /**
   * 所属会话ID
   */
  conversationId: string;
  
  /**
   * 初始单元格数据
   */
  initialCells?: Cell[];
}

/**
 * 创建新表格
 * @param options 创建选项
 * @returns 新创建的表格对象
 */
export function createSheet(options: CreateSheetOptions): Sheet {
  const now = new Date().toISOString();
  
  // Ensure ID fields are clean strings
  const characterId = String(options.characterId || '').trim();
  const conversationId = options.conversationId ? String(options.conversationId).trim() : characterId;
  
  return {
    uid: uuidv4(),
    templateId: options.templateId,
    name: options.name,
    characterId: characterId,
    conversationId: conversationId,
    cells: options.initialCells || [],
    createdAt: now,
    updatedAt: now
  };
}

/**
 * 获取表格中的单元格
 * @param sheet 表格对象
 * @param rowIndex 行索引
 * @param colIndex 列索引
 * @returns 单元格对象或undefined
 */
export function getCell(sheet: Sheet, rowIndex: number, colIndex: number): Cell | undefined {
  return sheet.cells.find(
    cell => cell.rowIndex === rowIndex && cell.colIndex === colIndex
  );
}

/**
 * 获取表格的行数
 * @param sheet 表格对象
 * @returns 表格的行数
 */
export function getRowCount(sheet: Sheet): number {
  if (sheet.cells.length === 0) return 0;
  
  // 找出最大的行索引并加1
  return Math.max(...sheet.cells.map(cell => cell.rowIndex)) + 1;
}

/**
 * 获取表格的列数
 * @param sheet 表格对象
 * @returns 表格的列数
 */
export function getColumnCount(sheet: Sheet): number {
  if (sheet.cells.length === 0) return 0;
  
  // 找出最大的列索引并加1
  return Math.max(...sheet.cells.map(cell => cell.colIndex)) + 1;
}

/**
 * 获取指定行的所有单元格
 * @param sheet 表格对象
 * @param rowIndex 行索引
 * @returns 该行的单元格数组
 */
export function getRow(sheet: Sheet, rowIndex: number): Cell[] {
  return sheet.cells
    .filter(cell => cell.rowIndex === rowIndex)
    .sort((a, b) => a.colIndex - b.colIndex);
}

/**
 * 获取指定列的所有单元格
 * @param sheet 表格对象
 * @param colIndex 列索引
 * @returns 该列的单元格数组
 */
export function getColumn(sheet: Sheet, colIndex: number): Cell[] {
  return sheet.cells
    .filter(cell => cell.colIndex === colIndex)
    .sort((a, b) => a.rowIndex - b.rowIndex);
}

/**
 * 将表格转换为渲染用的二维数组
 * @param sheet 表格对象
 * @returns 二维单元格数组
 */
export function toMatrix(sheet: Sheet): (Cell | null)[][] {
  const rowCount = getRowCount(sheet);
  const colCount = getColumnCount(sheet);
  
  // 创建空矩阵
  const matrix: (Cell | null)[][] = Array(rowCount)
    .fill(null)
    .map(() => Array(colCount).fill(null));
  
  // 填充单元格
  sheet.cells.forEach(cell => {
    if (cell.rowIndex < rowCount && cell.colIndex < colCount) {
      matrix[cell.rowIndex][cell.colIndex] = cell;
    }
  });
  
  return matrix;
}

/**
 * 获取表格的文本表示
 * @param sheet 表格对象
 * @returns 表格的文本表示
 */
export function toText(sheet: Sheet): string {
  const matrix = toMatrix(sheet);
  
  // 计算每列的最大宽度
  const colWidths: number[] = [];
  for (let c = 0; c < matrix[0]?.length || 0; c++) {
    colWidths[c] = Math.max(
      ...matrix.map(row => (row[c]?.value || '').length),
      5 // 最小宽度
    );
  }
  
  // 生成表格文本
  let result = '';
  
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    const rowText = row.map((cell, c) => {
      const value = cell?.value || '';
      return value.padEnd(colWidths[c]);
    }).join(' | ');
    
    result += `| ${rowText} |\n`;
    
    // 在标题行后添加分隔线
    if (r === 0) {
      result += '|' + colWidths.map(w => '-'.repeat(w + 2)).join('|') + '|\n';
    }
  }
  
  return result;
}
