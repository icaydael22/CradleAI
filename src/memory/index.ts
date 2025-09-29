/**
 * Mem0记忆系统 - 入口文件
 * 
 * 提供统一的导出接口，包括核心功能和插件集成
 */

// 导出核心记忆服务
export { MobileMemory } from './mobile-memory';
export type { 
  MemoryConfig, 
  MemoryItem, 
  Message, 
  SearchFilters, 
  SearchResult 
} from './types';

// 导出表格记忆插件API
import * as TableMemory from './plugins/table-memory';
export { TableMemory };

// 导出表格记忆集成接口
export { 
  initializeTableMemory,
  setTableMemoryEnabled,
  isTableMemoryEnabled,
  processChat,
  getTableDataForPrompt
} from './integration/table-memory-integration';

// 提供统一的README
export const README = `
# Mem0记忆系统

Mem0是一个用于智能助手的记忆管理系统，它集成了向量记忆和表格记忆功能，
能够更好地管理和组织用户与AI的对话内容。

## 主要功能

1. 向量记忆: 将用户信息嵌入为向量存储，支持语义搜索
2. 表格记忆: 将用户信息组织为结构化表格，便于分类和检索
3. 多模态集成: 支持同时处理文本和表格数据

## 使用方法

请参阅文档获取详细使用说明。
`;
