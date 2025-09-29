/**
 * 表格记忆增强插件 - 数据库连接监控工具
 * 
 * 该模块负责监控数据库连接状态，并在必要时尝试修复问题。
 */

import { StorageService } from '../services/storage-service';

// 数据库状态
export type DbStatus = {
  isOpen: boolean;
  hasQueuedOperations: number;
  isProcessingQueue: boolean;
  lastError: string | null;
  lastErrorTime: Date | null;
  lastCheckTime: Date;
};

// 全局状态
let dbMonitorStatus: DbStatus = {
  isOpen: false,
  hasQueuedOperations: 0,
  isProcessingQueue: false,
  lastError: null,
  lastErrorTime: null,
  lastCheckTime: new Date()
};

// 定时器ID
let monitorIntervalId: NodeJS.Timeout | null = null;

/**
 * 检查数据库状态
 * @returns 数据库状态对象
 */
export async function checkDbStatus(): Promise<DbStatus> {
  try {
    // 获取内部状态，需要使用类型转换访问私有属性
    const operationQueue = (StorageService as any)['operationQueue'] || [];
    const isProcessingQueue = (StorageService as any)['isProcessingQueue'] || false;
    const db = (StorageService as any)['db'];
    
    dbMonitorStatus = {
      isOpen: !!db,
      hasQueuedOperations: operationQueue.length,
      isProcessingQueue,
      lastError: dbMonitorStatus.lastError,
      lastErrorTime: dbMonitorStatus.lastErrorTime,
      lastCheckTime: new Date()
    };
    
    return dbMonitorStatus;
  } catch (error) {
    // 更新错误状态
    dbMonitorStatus = {
      ...dbMonitorStatus,
      lastError: error instanceof Error ? error.message : String(error),
      lastErrorTime: new Date(),
      lastCheckTime: new Date()
    };
    
    return dbMonitorStatus;
  }
}

/**
 * 记录数据库错误
 * @param error 错误对象
 */
export function logDbError(error: any): void {
  dbMonitorStatus = {
    ...dbMonitorStatus,
    lastError: error instanceof Error ? error.message : String(error),
    lastErrorTime: new Date(),
    lastCheckTime: new Date()
  };
  
  console.error(`[TableMemory:DbMonitor] 数据库操作错误: ${dbMonitorStatus.lastError}`);
}

/**
 * 启动数据库监控
 * @param checkIntervalMs 检查间隔（毫秒）
 */
export function startDbMonitor(checkIntervalMs: number = 60000): void {
  if (monitorIntervalId) {
    stopDbMonitor();
  }
  
  // 初始检查
  checkDbStatus().catch(err => console.error('[TableMemory:DbMonitor] 初始检查失败:', err));
  
  // 定时检查
  monitorIntervalId = setInterval(async () => {
    try {
      const status = await checkDbStatus();
      
      // 检查异常情况
      if (status.hasQueuedOperations > 10 && !status.isProcessingQueue) {
        console.warn(`[TableMemory:DbMonitor] 队列中有 ${status.hasQueuedOperations} 个操作，但队列未在处理中`);
        
        // 触发重置操作
        try {
          await StorageService.resetDatabase();
          console.log('[TableMemory:DbMonitor] 已重置数据库连接');
        } catch (resetError) {
          console.error('[TableMemory:DbMonitor] 重置数据库失败:', resetError);
        }
      }
    } catch (error) {
      console.error('[TableMemory:DbMonitor] 监控检查失败:', error);
    }
  }, checkIntervalMs);
  
  console.log(`[TableMemory:DbMonitor] 已启动数据库监控，检查间隔: ${checkIntervalMs}ms`);
}

/**
 * 停止数据库监控
 */
export function stopDbMonitor(): void {
  if (monitorIntervalId) {
    clearInterval(monitorIntervalId);
    monitorIntervalId = null;
    console.log('[TableMemory:DbMonitor] 已停止数据库监控');
  }
}

/**
 * 获取当前监控状态
 * @returns 数据库状态对象
 */
export function getDbMonitorStatus(): DbStatus {
  return { ...dbMonitorStatus };
}
