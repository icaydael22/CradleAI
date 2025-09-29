/**
 * 添加记忆选项
 */
export interface AddMemoryOptions {
  userId?: string;
  agentId?: string;
  runId?: string;
  metadata?: Record<string, any>;
  filters?: Record<string, any>;
}

/**
 * 搜索记忆选项
 */
export interface SearchMemoryOptions {
  userId?: string;
  agentId?: string;
  runId?: string;
  limit?: number;
  filters?: Record<string, any>;
}

/**
 * 删除所有记忆选项
 */
export interface DeleteAllMemoryOptions {
  userId?: string;
  agentId?: string;
  runId?: string;
}

/**
 * 获取所有记忆选项
 */
export interface GetAllMemoryOptions {
  userId?: string;
  agentId?: string;
  runId?: string;
  limit?: number;
}
