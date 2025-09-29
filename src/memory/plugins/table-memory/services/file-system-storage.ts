/**
 * 表格记忆增强插件 - 文件系统存储服务
 * 
 * 该服务负责处理与文件系统的交互，提供表格数据的持久化存储。
 * 替代原有的SQLite数据库存储，使用JSON文件存储表格数据。
 */

import * as FileSystem from 'expo-file-system';
import { getDatabasePath } from '../../../utils/file-system';
import { SheetTemplate, TemplateSettings } from '../models/template';
import { Sheet } from '../models/sheet';
import { Cell } from '../models/cell';

// 定义文件路径
interface FilePaths {
  baseDir: string;
  templatesDir: string;
  sheetsDir: string;
  settingsPath: string;
}

// 操作队列
type QueuedOperation = {
  operation: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  retry: number;
};

/**
 * 文件系统存储服务
 */
export class FileSystemStorage {
  // 文件路径
  private static paths: FilePaths | null = null;
  
  // 队列管理
  private static operationQueue: QueuedOperation[] = [];
  private static isProcessingQueue = false;
  private static maxRetries = 3;
  private static retryDelay = 100; // 基础重试延迟，毫秒
  
  // 缓存，避免频繁读取文件系统
  private static templatesCache: Map<string, SheetTemplate> = new Map();
  private static sheetsCache: Map<string, Sheet> = new Map();
  private static settingsCache: any = null;
  
  // 初始化标志
  private static initialized = false;
  private static isResetting = false;
  
  // 是否启用队列系统
  private static useQueueSystem = false; // 默认关闭队列系统
  
  /**
   * 获取调用堆栈信息（用于日志追踪）
   */
  private static getCallerStack(): string {
    const err = new Error();
    if (err.stack) {
      return err.stack.split('\n').slice(2, 7).join('\n');
    }
    return '';
  }
  
  /**
   * 初始化存储服务
   * @param dbPath 可选的基础目录路径
   * @param options 额外选项
   */
  static async initialize(dbPath?: string, options?: { useQueue?: boolean }): Promise<void> {
    // 等待重置完成后再初始化
    while (this.isResetting) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    try {
      if (this.initialized) {
        console.log('[TableMemory] 文件系统存储服务已初始化，跳过');
        return;
      }
      
      // 设置是否使用队列系统
      this.useQueueSystem = options?.useQueue ?? false;
      console.log(`[TableMemory] 文件系统存储队列系统: ${this.useQueueSystem ? '启用' : '禁用'}`);
      
      // 修复: 确保基础目录路径不包含.db后缀，防止创建目录失败
      let basePath = '';
      if (dbPath) {
        // 如果传入的路径带有.db后缀，则去掉后缀并添加_data后缀
        basePath = dbPath.replace(/\.db$/, '_data');
      } else {
        // 使用getDatabasePath获取目录，但修改路径
        const rawPath = await getDatabasePath('table_memory');
        basePath = rawPath.replace(/\.db$/, '_data');
      }
      
      console.log(`[TableMemory] 初始化文件系统存储，使用路径: ${basePath}`);
      
      // 设置文件路径
      this.paths = {
        baseDir: basePath,
        templatesDir: `${basePath}/templates`,
        sheetsDir: `${basePath}/sheets`,
        settingsPath: `${basePath}/settings.json`
      };
      
      // 创建必要的目录
      await this.ensureDirectories();
      
      // 初始化缓存
      this.templatesCache.clear();
      this.sheetsCache.clear();
      this.settingsCache = null;
      
      this.initialized = true;
      console.log('[TableMemory] 文件系统存储服务初始化完成');
    } catch (error) {
      console.error('[TableMemory] 初始化文件系统存储服务失败:', error);
      throw error;
    }
  }
  
  /**
   * 确保必要的目录存在
   */
  private static async ensureDirectories(): Promise<void> {
    if (!this.paths) {
      throw new Error('路径未初始化');
    }
    
    const { baseDir, templatesDir, sheetsDir } = this.paths;
    
    try {
      // 添加详细日志，跟踪实际路径值
      console.log(`[TableMemory] 尝试创建目录结构 - baseDir: ${baseDir}`);
      console.log(`[TableMemory] 模板目录: ${templatesDir}`);
      console.log(`[TableMemory] 表格目录: ${sheetsDir}`);
      
      // 检查基础目录是否存在
      const baseInfo = await FileSystem.getInfoAsync(baseDir);
      if (!baseInfo.exists) {
        console.log(`[TableMemory] 创建基础目录: ${baseDir}`);
        await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
      } else {
        console.log(`[TableMemory] 基础目录已存在: ${baseDir}`);
      }
      
      // 检查模板目录是否存在
      const templatesInfo = await FileSystem.getInfoAsync(templatesDir);
      if (!templatesInfo.exists) {
        console.log(`[TableMemory] 创建模板目录: ${templatesDir}`);
        await FileSystem.makeDirectoryAsync(templatesDir, { intermediates: true });
      } else {
        console.log(`[TableMemory] 模板目录已存在: ${templatesDir}`);
      }
      
      // 检查表格目录是否存在
      const sheetsInfo = await FileSystem.getInfoAsync(sheetsDir);
      if (!sheetsInfo.exists) {
        console.log(`[TableMemory] 创建表格目录: ${sheetsDir}`);
        await FileSystem.makeDirectoryAsync(sheetsDir, { intermediates: true });
      } else {
        console.log(`[TableMemory] 表格目录已存在: ${sheetsDir}`);
      }
    } catch (error) {
      console.error('[TableMemory] 创建目录失败:', error);
      // 增强错误消息，添加更详细的诊断信息
      if (error instanceof Error) {
        console.error(`[TableMemory] 错误类型: ${error.name}, 消息: ${error.message}`);
        // 尝试诊断文件系统权限问题
        try {
          console.log(`[TableMemory] 当前应用可访问目录信息:`);
          console.log(`- 文档目录: ${FileSystem.documentDirectory}`);
          console.log(`- 缓存目录: ${FileSystem.cacheDirectory}`);
        } catch (diagError) {
          console.error(`[TableMemory] 获取目录信息失败:`, diagError);
        }
      }
      throw error;
    }
  }
  
  /**
   * 将操作添加到队列
   * @param operation 文件系统操作函数
   * @returns 操作结果Promise
   */
  private static enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
    // 如果禁用了队列系统，直接执行操作
    if (!this.useQueueSystem) {
      return operation();
    }
    
    // 重置期间禁止新操作入队
    if (this.isResetting) {
      return Promise.reject(new Error('文件系统正在重置，操作被拒绝'));
    }
    
    const callerStack = this.getCallerStack();
    console.log(`【表格插件-FS】[enqueueOperation] 新操作入队，当前队列长度: ${this.operationQueue.length + 1}`);
    console.log(`【表格插件-FS】[enqueueOperation] 调用堆栈:\n${callerStack}`);
    
    return new Promise<T>((resolve, reject) => {
      // 创建队列项
      const queueItem: QueuedOperation = {
        operation,
        resolve,
        reject,
        retry: 0
      };
      
      // 添加到队列
      this.operationQueue.push(queueItem);
      
      // 如果队列未在处理，启动处理
      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }
  
  /**
   * 处理操作队列
   */
  private static async processQueue(): Promise<void> {
    // 如果已在处理队列或队列为空，直接返回
    if (this.isProcessingQueue || this.operationQueue.length === 0) {
      return;
    }

    // 标记为正在处理
    this.isProcessingQueue = true;

    try {
      while (this.operationQueue.length > 0) {
        // 获取队列中的第一个操作
        const item = this.operationQueue[0];
        console.log(`【表格插件-FS】[processQueue] 开始处理队首操作，当前队列长度: ${this.operationQueue.length}`);
        
        try {
          // 执行操作
          const result = await item.operation();

          // 操作成功，移除队列并解析Promise
          this.operationQueue.shift();
          item.resolve(result);
          console.log(`【表格插件-FS】[processQueue] 操作成功，队列长度变为: ${this.operationQueue.length}`);
        } catch (error) {
          // 文件系统操作失败
          const isIOError = error instanceof Error && 
            (error.message.includes('ENOENT') || 
             error.message.includes('EBUSY') ||
             error.message.includes('EAGAIN'));

          if (isIOError && item.retry < this.maxRetries) {
            // 增加重试次数
            item.retry++;

            // 使用指数退避算法计算延迟
            const delay = this.retryDelay * Math.pow(1.5, item.retry - 1);
            console.log(`[TableMemory] 文件系统忙，延迟 ${delay}ms 后重试 (${item.retry}/${this.maxRetries})`);

            // 从队列中移除，延迟后重新添加到队尾
            this.operationQueue.shift();

            await new Promise(resolve => setTimeout(resolve, delay));
            this.operationQueue.push(item);

            console.warn(`【表格插件-FS】[processQueue] 文件系统操作失败，重试第${item.retry}次，当前队列长度: ${this.operationQueue.length}`);
          } else {
            // 达到最大重试次数或非IO错误，从队列中移除并拒绝Promise
            this.operationQueue.shift();
            console.error('【表格插件-FS】[processQueue] 文件系统操作失败，无法重试:', error);
            item.reject(error);
          }
        }
      }
    } finally {
      // 处理完成，重置标记
      this.isProcessingQueue = false;

      // 如果处理过程中有新操作入队，继续处理
      if (this.operationQueue.length > 0) {
        console.log(`【表格插件-FS】[processQueue] 处理完成后队列仍有操作，继续处理。队列长度: ${this.operationQueue.length}`);
        setTimeout(() => this.processQueue(), 0);
      }
    }
  }
  
  /**
   * 安全执行文件系统操作
   * @param operation 文件系统操作函数
   * @returns 操作结果
   */
  private static async safeExecute<T>(operation: () => Promise<T>): Promise<T> {
    // 等待重置完成后再执行
    while (this.isResetting) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    if (!this.initialized) {
      try {
        console.log('[TableMemory] 文件系统存储未初始化，尝试自动初始化');
        await this.initialize();
      } catch (initError) {
        console.error('[TableMemory] 自动初始化文件系统存储失败:', initError);
        throw new Error('文件系统存储未初始化且无法自动初始化');
      }
    }
    
    // 将操作添加到队列或直接执行
    if (this.useQueueSystem) {
      return this.enqueueOperation(operation);
    } else {
      // 直接执行操作，不使用队列
      return operation();
    }
  }

  /**
   * 读取JSON文件
   * @param filePath 文件路径
   * @returns 解析后的JSON对象
   */
  private static async readJsonFile<T>(filePath: string): Promise<T | null> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        return null;
      }
      
      const content = await FileSystem.readAsStringAsync(filePath);
      return JSON.parse(content) as T;
    } catch (error) {
      console.error(`[TableMemory] 读取JSON文件失败 ${filePath}:`, error);
      throw error;
    }
  }
  
  /**
   * 写入JSON文件
   * @param filePath 文件路径
   * @param data 要写入的数据
   */
  private static async writeJsonFile(filePath: string, data: any): Promise<void> {
    try {
      const content = JSON.stringify(data, null, 2);
      await FileSystem.writeAsStringAsync(filePath, content);
    } catch (error) {
      console.error(`[TableMemory] 写入JSON文件失败 ${filePath}:`, error);
      throw error;
    }
  }
  
  /**
   * 删除文件
   * @param filePath 文件路径
   */
  private static async deleteFile(filePath: string): Promise<void> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(filePath);
      }
    } catch (error) {
      console.error(`[TableMemory] 删除文件失败 ${filePath}:`, error);
      throw error;
    }
  }
  
  /**
   * 检查数据库锁
   */
  static async checkDatabaseLock(): Promise<{
    isLocked: boolean;
    queueLength: number;
    isProcessingQueue: boolean;
  }> {
    return {
      isLocked: false,
      queueLength: this.operationQueue.length,
      isProcessingQueue: this.isProcessingQueue
    };
  }
  
  /**
   * 重置数据库连接
   * 文件系统版本中清空缓存和队列
   */
  static async resetDatabase(): Promise<boolean> {
    if (this.isResetting) {
      // 已在重置中，直接返回
      return false;
    }
    
    this.isResetting = true;
    console.warn('【表格插件-FS】[resetDatabase] 正在重置文件系统存储，当前队列长度: ' + this.operationQueue.length);
    
    try {
      // 等待所有队列操作完成（最多5秒），否则强制清空
      if (this.operationQueue.length > 0) {
        let waited = 0;
        const maxWait = 5000;
        while ((this.operationQueue.length > 0 || this.isProcessingQueue) && waited < maxWait) {
          await new Promise(resolve => setTimeout(resolve, 100));
          waited += 100;
        }
        
        if (this.operationQueue.length > 0) {
          console.warn('【表格插件-FS】[resetDatabase] ⚠️ 超时仍有操作未完成，强制清空队列！这可能导致数据不一致');
          this.operationQueue = [];
          this.isProcessingQueue = false;
        }
      }
      
      // 清空缓存
      this.templatesCache.clear();
      this.sheetsCache.clear();
      this.settingsCache = null;
      
      // 重新初始化
      const wasInitialized = this.initialized;
      this.initialized = false;
      
      if (wasInitialized) {
        await this.initialize();
      }
      
      return true;
    } catch (error) {
      console.error('[TableMemory] 重置文件系统存储失败:', error);
      return false;
    } finally {
      this.isResetting = false;
    }
  }
  
  /**
   * 设置是否使用队列系统
   * @param useQueue 是否使用队列
   */
  static setUseQueueSystem(useQueue: boolean): void {
    this.useQueueSystem = useQueue;
    console.log(`[TableMemory] 文件系统存储队列系统: ${this.useQueueSystem ? '启用' : '禁用'}`);
  }
    
  /**
   * 保存模板
   * @param template 模板对象
   */
  static async saveTemplate(template: SheetTemplate): Promise<void> {
    return this.safeExecute(async () => {
      if (!this.paths) {
        throw new Error('路径未初始化');
      }
      
      const filePath = `${this.paths.templatesDir}/${template.uid}.json`;
      
      // 更新时间戳
      if (!template.updatedAt) {
        template.updatedAt = new Date().toISOString();
      }
      
      // 写入文件
      await this.writeJsonFile(filePath, template);
      
      // 更新缓存
      this.templatesCache.set(template.uid, template);
    });
  }
  
  /**
   * 获取所有模板
   * @returns 模板列表
   */
  static async getAllTemplates(): Promise<SheetTemplate[]> {
    return this.safeExecute(async () => {
      if (!this.paths) {
        throw new Error('路径未初始化');
      }
      
      try {
        // 获取模板目录中的所有文件
        const files = await FileSystem.readDirectoryAsync(this.paths.templatesDir);
        const templateFiles = files.filter(file => file.endsWith('.json'));
        
        const templates: SheetTemplate[] = [];
        
        // 读取每个模板文件
        for (const file of templateFiles) {
          const templateId = file.replace('.json', '');
          
          // 优先从缓存获取
          if (this.templatesCache.has(templateId)) {
            templates.push(this.templatesCache.get(templateId)!);
            continue;
          }
          
          const filePath = `${this.paths.templatesDir}/${file}`;
          const template = await this.readJsonFile<SheetTemplate>(filePath);
          
          if (template) {
            templates.push(template);
            // 更新缓存
            this.templatesCache.set(templateId, template);
          }
        }
        
        // 按名称排序
        return templates.sort((a, b) => a.name.localeCompare(b.name));
      } catch (error) {
        console.error('[TableMemory] 获取所有模板失败:', error);
        throw error;
      }
    });
  }
  
  /**
   * 获取模板
   * @param uid 模板ID
   * @returns 模板对象或null
   */
  static async getTemplate(uid: string): Promise<SheetTemplate | null> {
    return this.safeExecute(async () => {
      if (!this.paths) {
        throw new Error('路径未初始化');
      }
      
      // 优先从缓存获取
      if (this.templatesCache.has(uid)) {
        return this.templatesCache.get(uid)!;
      }
      
      const filePath = `${this.paths.templatesDir}/${uid}.json`;
      const template = await this.readJsonFile<SheetTemplate>(filePath);
      
      if (template) {
        // 更新缓存
        this.templatesCache.set(uid, template);
      }
      
      return template;
    });
  }
  
  /**
   * 删除模板
   * @param uid 模板ID
   */
  static async deleteTemplate(uid: string): Promise<void> {
    return this.safeExecute(async () => {
      if (!this.paths) {
        throw new Error('路径未初始化');
      }
      
      const filePath = `${this.paths.templatesDir}/${uid}.json`;
      await this.deleteFile(filePath);
      
      // 从缓存中移除
      this.templatesCache.delete(uid);
    });
  }
  
  /**
   * 保存表格
   * @param sheet 表格对象
   */
  static async saveSheet(sheet: Sheet): Promise<void> {
    return this.safeExecute(async () => {
      if (!this.paths) {
        throw new Error('路径未初始化');
      }
      
      const filePath = `${this.paths.sheetsDir}/${sheet.uid}.json`;
      
      // 更新时间戳
      sheet.updatedAt = new Date().toISOString();
      
      // 写入文件
      await this.writeJsonFile(filePath, sheet);
      
      // 更新缓存
      this.sheetsCache.set(sheet.uid, sheet);
    });
  }
  
  /**
   * 获取表格
   * @param uid 表格ID
   * @returns 表格对象或null
   */
  static async getSheet(uid: string): Promise<Sheet | null> {
    return this.safeExecute(async () => {
      if (!this.paths) {
        throw new Error('路径未初始化');
      }
      
      // 优先从缓存获取
      if (this.sheetsCache.has(uid)) {
        return this.sheetsCache.get(uid)!;
      }
      
      const filePath = `${this.paths.sheetsDir}/${uid}.json`;
      const sheet = await this.readJsonFile<Sheet>(filePath);
      
      if (sheet) {
        // 更新缓存
        this.sheetsCache.set(uid, sheet);
      }
      
      return sheet;
    });
  }
  
  /**
   * 删除表格
   * @param uid 表格ID
   */
  static async deleteSheet(uid: string): Promise<void> {
    return this.safeExecute(async () => {
      if (!this.paths) {
        throw new Error('路径未初始化');
      }
      
      const filePath = `${this.paths.sheetsDir}/${uid}.json`;
      await this.deleteFile(filePath);
      
      // 从缓存中移除
      this.sheetsCache.delete(uid);
    });
  }
  
  /**
   * 获取所有表格
   * @returns 表格列表
   */
  static async getAllSheets(): Promise<Sheet[]> {
    return this.safeExecute(async () => {
      if (!this.paths) {
        throw new Error('路径未初始化');
      }
      
      try {
        // 获取表格目录中的所有文件
        const files = await FileSystem.readDirectoryAsync(this.paths.sheetsDir);
        const sheetFiles = files.filter(file => file.endsWith('.json'));
        
        const sheets: Sheet[] = [];
        
        // 读取每个表格文件
        for (const file of sheetFiles) {
          const sheetId = file.replace('.json', '');
          
          // 优先从缓存获取
          if (this.sheetsCache.has(sheetId)) {
            sheets.push(this.sheetsCache.get(sheetId)!);
            continue;
          }
          
          const filePath = `${this.paths.sheetsDir}/${file}`;
          const sheet = await this.readJsonFile<Sheet>(filePath);
          
          if (sheet) {
            sheets.push(sheet);
            // 更新缓存
            this.sheetsCache.set(sheetId, sheet);
          }
        }
        
        return sheets;
      } catch (error) {
        console.error('[TableMemory] 获取所有表格失败:', error);
        throw error;
      }
    });
  }

  /**
   * 获取角色的所有表格
   * @param characterId 角色ID
   * @param conversationId 可选的对话ID
   * @returns 表格列表
   */
  static async getSheetsByCharacter(characterId: string, conversationId?: string): Promise<Sheet[]> {
    return this.safeExecute(async () => {
      if (!this.paths) {
        throw new Error('路径未初始化');
      }
      
      const safeCharacterId = String(characterId || '').trim();
      const safeConversationId = conversationId ? String(conversationId).trim() : safeCharacterId;
      
      try {
        // 获取所有表格
        const allSheets = await this.getAllSheets();
        
        // 过滤出符合条件的表格 - 优先精确匹配两个ID
        const exactMatches = allSheets.filter(sheet => 
          sheet.characterId === safeCharacterId && 
          sheet.conversationId === safeConversationId
        );
        
        if (exactMatches.length > 0) {
          return exactMatches;
        }
        
        // 如果没有精确匹配，则按characterId查找
        return allSheets.filter(sheet => sheet.characterId === safeCharacterId);
      } catch (error) {
        console.error(`[TableMemory] 获取角色 ${characterId} 的表格失败:`, error);
        throw error;
      }
    });
  }
  
  /**
   * 获取表格中指定行的单元格
   * @param sheetId 表格ID
   * @param rowIndex 行索引
   * @returns 单元格列表
   */
  static async getCellsByRow(sheetId: string, rowIndex: number): Promise<Cell[]> {
    return this.safeExecute(async () => {
      const sheet = await this.getSheet(sheetId);
      if (!sheet) {
        throw new Error(`未找到表格 ${sheetId}`);
      }
      
      // 过滤并排序单元格
      return sheet.cells
        .filter(cell => cell.rowIndex === rowIndex)
        .sort((a, b) => a.colIndex - b.colIndex);
    });
  }
  
  /**
   * 获取表格最大行索引
   * @param sheetId 表格ID
   * @returns 最大行索引，如果表格为空则返回-1
   */
  static async getMaxRowIndex(sheetId: string): Promise<number> {
    return this.safeExecute(async () => {
      const sheet = await this.getSheet(sheetId);
      if (!sheet || sheet.cells.length === 0) {
        return -1;
      }
      
      // 找出最大的行索引
      return Math.max(...sheet.cells.map(cell => cell.rowIndex));
    });
  }
  
  /**
   * 获取设置
   * @param key 设置键
   * @returns 设置值或null
   */
  static async getSetting(key: string): Promise<any | null> {
    return this.safeExecute(async () => {
      if (!this.paths) {
        throw new Error('路径未初始化');
      }
      
      // 如果缓存未初始化，先读取设置文件
      if (this.settingsCache === null) {
        const settings = await this.readJsonFile<Record<string, any>>(this.paths.settingsPath);
        this.settingsCache = settings || {};
      }
      
      return this.settingsCache[key] || null;
    });
  }
  
  /**
   * 保存设置
   * @param key 设置键
   * @param value 设置值
   */
  static async saveSetting(key: string, value: any): Promise<void> {
    return this.safeExecute(async () => {
      if (!this.paths) {
        throw new Error('路径未初始化');
      }
      
      // 如果缓存未初始化，先读取设置文件
      if (this.settingsCache === null) {
        const settings = await this.readJsonFile<Record<string, any>>(this.paths.settingsPath);
        this.settingsCache = settings || {};
      }
      
      // 更新缓存
      this.settingsCache[key] = value;
      
      // 写入文件
      await this.writeJsonFile(this.paths.settingsPath, this.settingsCache);
    });
  }
  
  /**
   * 获取模板设置
   * @returns 模板设置
   */
  static async getTemplateSettings(): Promise<TemplateSettings> {
    const settings = await this.getSetting('template_settings');
    return settings || { selectedTemplates: [] };
  }
  
  /**
   * 保存模板设置
   * @param settings 模板设置
   */
  static async saveTemplateSettings(settings: TemplateSettings): Promise<void> {
    await this.saveSetting('template_settings', settings);
  }
  /**
   * 关闭存储
   * 文件系统版本中清空缓存
   */
  static async close(): Promise<void> {
    if (this.operationQueue.length > 0) {
      console.log(`[TableMemory] 等待 ${this.operationQueue.length} 个队列操作完成后关闭文件系统存储`);
      try {
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => {
            reject(new Error('等待队列操作完成超时，强制关闭文件系统存储'));
          }, 5000); // 5秒超时
        });

        await Promise.race([
          new Promise<void>(resolve => {
            const checkQueue = () => {
              if (this.operationQueue.length === 0 && !this.isProcessingQueue) {
                resolve();
              } else {
                setTimeout(checkQueue, 100);
              }
            };
            
            checkQueue();
          }),
          timeoutPromise
        ]);
      } catch (error) {
        console.warn('[TableMemory] 关闭文件系统存储警告:', error);
        this.operationQueue = [];
        this.isProcessingQueue = false;
      }
    }
    
    // 清空缓存
    this.templatesCache.clear();
    this.sheetsCache.clear();
    this.settingsCache = null;
    
    this.initialized = false;
    console.log('[TableMemory] 文件系统存储已关闭');
  }
}
