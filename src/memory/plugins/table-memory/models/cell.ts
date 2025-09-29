/**
 * 表格记忆增强插件 - 单元格模型
 * 
 * 该文件定义了表格单元格的数据结构和相关操作。
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * 单元格历史记录
 */
export interface CellHistory {
  /**
   * 唯一ID
   */
  uid: string;
  
  /**
   * 单元格ID
   */
  cellId: string;
  
  /**
   * 先前的值
   */
  previousValue: string;
  
  /**
   * 新值
   */
  newValue: string;
  
  /**
   * 操作类型
   */
  actionType: 'create' | 'update' | 'delete';
  
  /**
   * 修改时间
   */
  timestamp: string;
}

/**
 * 单元格
 */
export interface Cell {
  /**
   * 单元格唯一ID
   */
  uid: string;
  
  /**
   * 所属表格ID
   */
  sheetId: string;
  
  /**
   * 行索引
   */
  rowIndex: number;
  
  /**
   * 列索引
   */
  colIndex: number;
  
  /**
   * 单元格值
   */
  value: string;
  
  /**
   * 历史记录
   */
  history: CellHistory[];
  
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
 * 创建单元格选项
 */
export interface CreateCellOptions {
  /**
   * 所属表格ID
   */
  sheetId: string;
  
  /**
   * 行索引
   */
  rowIndex: number;
  
  /**
   * 列索引
   */
  colIndex: number;
  
  /**
   * 单元格值
   */
  value: string;
}

/**
 * 创建新单元格
 * @param options 创建选项
 * @returns 新创建的单元格对象
 */
export function createCell(options: CreateCellOptions): Cell {
  const now = new Date().toISOString();
  const cellId = uuidv4();
  
  return {
    uid: cellId,
    sheetId: options.sheetId,
    rowIndex: options.rowIndex,
    colIndex: options.colIndex,
    value: options.value,
    history: [
      {
        uid: uuidv4(),
        cellId,
        previousValue: '',
        newValue: options.value,
        actionType: 'create',
        timestamp: now
      }
    ],
    createdAt: now,
    updatedAt: now
  };
}

/**
 * 更新单元格值
 * @param cell 单元格对象
 * @param newValue 新值
 * @returns 更新后的单元格对象
 */
export function updateCellValue(cell: Cell, newValue: string): Cell {
  if (cell.value === newValue) {
    return cell;
  }
  
  const now = new Date().toISOString();
  
  // 创建历史记录
  const history: CellHistory = {
    uid: uuidv4(),
    cellId: cell.uid,
    previousValue: cell.value,
    newValue,
    actionType: 'update',
    timestamp: now
  };
  
  // 返回更新后的单元格
  return {
    ...cell,
    value: newValue,
    history: [...cell.history, history],
    updatedAt: now
  };
}

/**
 * 标记单元格为删除状态
 * @param cell 单元格对象
 * @returns 标记为删除的单元格对象
 */
export function markCellDeleted(cell: Cell): Cell {
  const now = new Date().toISOString();
  
  // 创建历史记录
  const history: CellHistory = {
    uid: uuidv4(),
    cellId: cell.uid,
    previousValue: cell.value,
    newValue: '',
    actionType: 'delete',
    timestamp: now
  };
  
  // 返回更新后的单元格
  return {
    ...cell,
    value: '', // 清空值
    history: [...cell.history, history],
    updatedAt: now
  };
}

/**
 * 获取单元格最后一次修改时间
 * @param cell 单元格对象
 * @returns 最后修改时间
 */
export function getLastModified(cell: Cell): string {
  return cell.updatedAt;
}

/**
 * 格式化单元格值
 * @param cell 单元格对象
 * @returns 格式化后的值
 */
export function formatCellValue(cell: Cell): string {
  // 将逗号替换为斜杠，保持一致性
  return cell.value.replace(/,/g, '/');
}

/**
 * 解析格式化的单元格值为数组
 * @param cell 单元格对象
 * @returns 值数组
 */
export function parseCellValueToArray(cell: Cell): string[] {
  // 按斜杠分割，并过滤空项
  return cell.value
    .split('/')
    .map(item => item.trim())
    .filter(Boolean);
}
