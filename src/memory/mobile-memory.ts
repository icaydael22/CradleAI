import { v4 as uuidv4 } from 'uuid';
import { md5 } from './utils/polyfills';
import { 
  MemoryConfig, 
  MemoryItem, 
  Message, 
  SearchFilters, 
  SearchResult 
} from './types';
import { 
  EmbedderFactory, 
  LLMFactory, 
  VectorStoreFactory 
} from './utils/factory';
import { 
  getFactRetrievalMessages, 
  getUpdateMemoryMessages, 
  removeCodeBlocks 
} from './prompts';
// import { MobileSQLiteManager } from './storage/MobileSQLiteManager';
import { MobileFileHistoryManager } from './storage/MobileFileHistoryManager';
import { ConfigManager } from './config/manager';
import { 
  AddMemoryOptions, 
  SearchMemoryOptions, 
  DeleteAllMemoryOptions, 
  GetAllMemoryOptions 
} from './memory.types';
import {VectorStoreResult } from '@/src/memory/vector-stores/base';
import {LLMConfig} from '@/src/memory/types';
import { getDatabasePath } from './utils/file-system';
// 导入表格记忆集成模块
import {
  isTableMemoryEnabled,
  extendAddToVectorStore,
  initializeTableMemory,
  setTableMemoryEnabled
} from './integration/table-memory-integration';

/**
 * 移动端记忆管理类
 */
export class MobileMemory {
  
  private config: MemoryConfig;
  private customPrompt: string | undefined;
  public embedder: any; // Make the embedder accessible
  private vectorStore: any;
  public llm: any; // 改为公共属性以便更新配置
  // private db: MobileSQLiteManager;
  private db: MobileFileHistoryManager;
  private collectionName: string;
  private apiVersion: string;
  private processingInterval: number = 10;
  private memoryEnabled: boolean = true;
  private tableMemoryEnabled: boolean = true; // Add this property

  constructor(config: Partial<MemoryConfig> = {}) {
    // 合并和验证配置
    this.config = ConfigManager.mergeConfig(config);

    this.customPrompt = this.config.customPrompt;
    this.embedder = EmbedderFactory.create(
      this.config.embedder.provider,
      this.config.embedder.config,
    );
    // 强制使用 mobile_file provider
    this.config.vectorStore.provider = 'mobile_file';
    this.vectorStore = VectorStoreFactory.create(
      this.config.vectorStore.provider,
      this.config.vectorStore.config,
    );
    this.llm = LLMFactory.create(
      this.config.llm.provider,
      this.config.llm.config,
    );
    // 使用移动端 SQLite 管理器
    // this.db = new MobileSQLiteManager(this.config.historyDbPath || "memory_history.db");
    
    // 修正历史目录名，避免传入 .db 文件名
    let historyDir = this.config.historyDbPath;
    if (!historyDir) {
      historyDir = undefined;
    } else if (historyDir.endsWith('.db')) {
      historyDir = historyDir.replace(/\.db$/, '_data');
    }
    this.db = new MobileFileHistoryManager(historyDir);
    
    this.collectionName = this.config.vectorStore.config.collectionName;
    this.apiVersion = this.config.version || "v1.0";

    // 初始化表格记忆插件
    this.initializeTableMemory();
  }

  /**
   * 初始化表格记忆插件
   */
  private async initializeTableMemory(): Promise<void> {
    try {
      // 获取数据库路径但确保使用正确的格式
      const basePath = await getDatabasePath('table_memory');
      // 移除.db后缀以防止目录创建错误
      const storageDir = basePath.replace(/\.db$/, '_data');
      
      console.log(`[MobileMemory] 初始化表格记忆插件，使用存储目录: ${storageDir}`);
      
      // 初始化表格记忆插件
      await initializeTableMemory({
        dbPath: storageDir,
        defaultTemplates: true,
        enabled: this.tableMemoryEnabled
      });
    } catch (error) {
      console.error('[MobileMemory] 初始化表格记忆插件失败:', error);
    }
  }

  /**
   * 设置表格记忆功能启用状态
   * @param enabled 是否启用
   */
  public setTableMemoryEnabled(enabled: boolean): void {
    this.tableMemoryEnabled = enabled;
    setTableMemoryEnabled(enabled);
    console.log(`[MobileMemory] 表格记忆功能${enabled ? '已启用' : '已禁用'}`);
  }
  
  /**
   * 获取表格记忆功能启用状态
   * @returns 是否启用
   */
  public isTableMemoryEnabled(): boolean {
    return this.tableMemoryEnabled && isTableMemoryEnabled();
  }

  /**
   * 更新LLM配置
   * @param llmConfig 新的LLM配置
   */
  public updateLLMConfig(llmConfig: LLMConfig): void {
    // 确保API密钥有值
    if (!llmConfig.apiKey) {
      console.warn('[MobileMemory] 尝试用空API密钥更新LLM配置，忽略更新');
      return;
    }
    
    console.log('[MobileMemory] 正在更新LLM配置:', {
      provider: llmConfig.apiProvider,
      model: llmConfig.model,
      apiKeyLength: llmConfig.apiKey?.length || 0,
      apiKeyFirstChars: llmConfig.apiKey ? `${llmConfig.apiKey.substring(0, 3)}...` : 'none'
    });
    
    try {
      // 检查LLM实例是否存在
      if (!this.llm) {
        console.warn('[MobileMemory] LLM实例不存在，重新创建');
        this.llm = LLMFactory.create(
          this.config.llm.provider,
          llmConfig
        );
      } else if (typeof this.llm.updateConfig === 'function') {
        // 使用实例方法更新配置
        this.llm.updateConfig(llmConfig);
        console.log('[MobileMemory] LLM配置已通过updateConfig方法更新成功');
      } else {
        // 如果没有更新方法，重新创建实例
        console.log('[MobileMemory] LLM实例不支持updateConfig，重新创建实例');
        this.llm = LLMFactory.create(
          this.config.llm.provider,
          llmConfig
        );
      }
      
      // 更新内部配置引用
      this.config.llm.config = {
        ...this.config.llm.config,
        ...llmConfig
      };
      
      console.log('[MobileMemory] LLM配置已更新成功，当前API密钥长度:', llmConfig.apiKey?.length || 0);
      
      // 注意：智谱嵌入器不会基于LLM API密钥更新
      // 它需要单独的智谱API密钥，通过MemoryProvider配置提供
    } catch (error) {
      console.error('[MobileMemory] 更新LLM配置时出错:', error);
    }
  }

  /**
   * 更新嵌入器API密钥
   * @param apiKey 新的API密钥
   */
  public updateEmbedderApiKey(apiKey: string): void {
    if (!apiKey) {
      console.warn('[MobileMemory] 尝试用空API密钥更新嵌入器配置，忽略更新');
      return;
    }
    
    console.log('[MobileMemory] 正在更新嵌入器API密钥，长度:', apiKey.length);
    
    try {
      // 检查嵌入器实例是否存在
      if (!this.embedder) {
        console.warn('[MobileMemory] 嵌入器实例不存在，重新创建');
        this.embedder = EmbedderFactory.create(
          this.config.embedder.provider,
          { ...this.config.embedder.config, apiKey }
        );
      } else if (typeof this.embedder.updateApiKey === 'function') {
        // 使用实例方法更新API密钥
        this.embedder.updateApiKey(apiKey);
        console.log('[MobileMemory] 嵌入器API密钥已通过updateApiKey方法更新成功');
      } else {
        // 如果没有更新方法，重新创建实例
        console.log('[MobileMemory] 嵌入器实例不支持updateApiKey，重新创建实例');
        this.embedder = EmbedderFactory.create(
          this.config.embedder.provider,
          { ...this.config.embedder.config, apiKey }
        );
      }
      
      // 更新内部配置引用
      this.config.embedder.config.apiKey = apiKey;
      
      console.log('[MobileMemory] 嵌入器API密钥已更新成功');
    } catch (error) {
      console.error('[MobileMemory] 更新嵌入器API密钥时出错:', error);
    }
  }

  /**
   * 设置处理间隔（每多少轮进行一次处理）
   * @param interval 轮数间隔
   */
  public setProcessingInterval(interval: number): void {
    if (interval < 1) {
      console.warn('[MobileMemory] 处理间隔必须至少为1轮');
      return;
    }
    
    this.processingInterval = interval;
    console.log(`[MobileMemory] 设置处理间隔为 ${interval} 轮`);
    
    // 通知Mem0Service更新其处理间隔
    try {
      const Mem0Service = require('./services/Mem0Service').default;
      const mem0Service = Mem0Service.getInstance();
      if (mem0Service && mem0Service.setProcessingInterval) {
        mem0Service.setProcessingInterval(interval);
      }
    } catch (error) {
      console.warn('[MobileMemory] 无法通知Mem0Service更新处理间隔:', error);
    }
  }
  
  /**
   * 获取当前处理间隔
   * @returns 处理间隔（轮数）
   */
  public getProcessingInterval(): number {
    return this.processingInterval;
  }
  
  /**
   * 设置记忆功能启用状态
   * @param enabled 是否启用
   */
  public setMemoryEnabled(enabled: boolean): void {
    this.memoryEnabled = enabled;
    console.log(`[MobileMemory] 记忆功能${enabled ? '已启用' : '已禁用'}`);
    
    // 通知Mem0Service更新启用状态
    try {
      const Mem0Service = require('./services/Mem0Service').default;
      const mem0Service = Mem0Service.getInstance();
      if (mem0Service && mem0Service.setMemoryEnabled) {
        mem0Service.setMemoryEnabled(enabled);
      }
    } catch (error) {
      console.warn('[MobileMemory] 无法通知Mem0Service更新启用状态:', error);
    }
  }
  
  /**
   * 获取记忆功能启用状态
   * @returns 是否启用
   */
  public isMemoryEnabled(): boolean {
    return this.memoryEnabled;
  }

  /**
   * 添加记忆
   * @param messages 消息内容（字符串或消息数组）
   * @param config 添加选项
   * @param isMultiRound 是否为多轮对话（默认为false）
   * @returns 搜索结果
   */
  async add(
    messages: string | Message[],
    config: AddMemoryOptions,
    isMultiRound: boolean = false
  ): Promise<SearchResult> {
    const {
      userId,
      agentId,
      runId,
      metadata = {},
      filters = {},
    } = config;

    if (userId) filters.userId = metadata.userId = userId;
    if (agentId) filters.agentId = metadata.agentId = agentId;
    if (runId) filters.runId = metadata.runId = runId;

    if (!filters.userId && !filters.agentId && !filters.runId) {
      throw new Error(
        "必须提供过滤条件之一: userId, agentId 或 runId!"
      );
    }

    // 检查是否为手动创建的记忆
    const isManualCreation = metadata.source === 'manual-creation' || 
      metadata.isManuallyCreated === true;

    // 如果是手动创建，则绕过正常流程直接创建
    if (isManualCreation && typeof messages === 'string') {
      console.log('[MobileMemory] 检测到手动创建记忆请求，跳过事实提取过程');
      
      const memoryId = await this.createMemoryDirectly(
        messages, // 直接使用输入的字符串作为记忆内容
        metadata,
        filters
      );
      
      // 更新：确保返回结构一致，包含必要的memory字段和metadata内容
      const timestamp = new Date().toISOString();
      return {
        results: [{
          id: memoryId,
          memory: messages,
          hash: md5(messages),
          createdAt: timestamp,
          metadata: { 
            event: 'ADD',
            source: 'manual-creation',
            data: messages,  // 确保包含data字段
          },
          ...filters
        }]
      };
    }

    // ----------- 新增: 动态检测useZhipuEmbedding配置 -----------
    let useZhipuEmbedding = true;
    try {
      // 动态引入settings-helper，避免循环依赖
      const { getApiSettings } = require('@/utils/settings-helper');
      useZhipuEmbedding = !!getApiSettings().useZhipuEmbedding;
    } catch (e) {
      // 如果获取失败，默认true
      useZhipuEmbedding = true;
    }

    // 如果useZhipuEmbedding为false，则直接走表格记忆兜底
    if (!useZhipuEmbedding && this.isTableMemoryEnabled() && filters.agentId) {
      try {
        const tableMemoryIntegration = require('./integration/table-memory-integration');
        const characterId = filters.agentId;
        const conversationId = filters.runId;
        const tables = await tableMemoryIntegration.getTableDataForPrompt(characterId, conversationId);
        if (tables && Array.isArray(tables) && tables.length > 0) {
          // 构造原始对话内容
          const userName = metadata.userName || '用户';
          const aiName = metadata.aiName || 'AI';
          let chatContent: string;
          if (typeof messages === 'string') {
            chatContent = messages;
          } else {
            chatContent = messages.map(m => {
              const role = m.role === 'assistant' ? aiName : (m.role === 'user' ? userName : m.role);
              const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
              return `${role}: ${content}`;
            }).join('\n\n');
          }
          // 直接处理表格记忆
          await tableMemoryIntegration.processChat(
            chatContent,
            characterId,
            conversationId,
            { userName, aiName, isMultiRound }
          );
          // 返回空向量记忆结果，仅表格记忆已处理
          return { results: [] };
        }
      } catch (error) {
        console.error('[MobileMemory] useZhipuEmbedding=false时表格记忆兜底处理失败:', error);
        return { results: [] };
      }
    }
    // ----------- 新增逻辑结束 -----------

    // ----------- 新增: 智谱API密钥未设置时允许表格记忆兜底 -----------
    // 检查嵌入器可用性
    let embedderAvailable = true;
    try {
      // 尝试生成一个空向量以检测嵌入器可用性
      if (!this.embedder || typeof this.embedder.embed !== 'function') {
        embedderAvailable = false;
      } else {
        // 仅在embedder.embed抛出"智谱嵌入API密钥未设置"时判定为不可用
        try {
          await this.embedder.embed('mem0_test_check');
        } catch (err: any) {
          if (typeof err?.message === 'string' && err.message.includes('智谱嵌入API密钥未设置')) {
            embedderAvailable = false;
          }
        }
      }
    } catch {
      embedderAvailable = false;
    }

    // 如果嵌入器不可用，且表格记忆启用且角色有表格，则只处理表格记忆
    if (!embedderAvailable && this.isTableMemoryEnabled() && filters.agentId) {
      try {
        const tableMemoryIntegration = require('./integration/table-memory-integration');
        // 检查角色是否有表格
        const characterId = filters.agentId;
        const conversationId = filters.runId;
        const tables = await tableMemoryIntegration.getTableDataForPrompt(characterId, conversationId);
        if (tables && Array.isArray(tables) && tables.length > 0) {
          // 构造原始对话内容
          const userName = metadata.userName || '用户';
          const aiName = metadata.aiName || 'AI';
          let chatContent: string;
          if (typeof messages === 'string') {
            chatContent = messages;
          } else {
            chatContent = messages.map(m => {
              const role = m.role === 'assistant' ? aiName : (m.role === 'user' ? userName : m.role);
              const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
              return `${role}: ${content}`;
            }).join('\n\n');
          }
          // 返回空向量记忆结果，仅表格记忆已处理
          return { results: [] };
        }
      } catch (error) {
        console.error('[MobileMemory] 表格记忆兜底处理失败:', error);
        // 继续抛出错误或返回空
        return { results: [] };
      }
    }
    // ----------- 兜底逻辑结束 -----------

    const parsedMessages = Array.isArray(messages)
      ? messages
      : [{ role: "user" as const, content: messages }];

    // 添加到向量存储
    const vectorStoreResult = await this.addToVectorStore(
      parsedMessages,
      metadata,
      filters,
      isMultiRound
    );

    return {
      results: vectorStoreResult,
    };
  }

  /**
   * 直接创建记忆（绕过事实提取过程）
   * @param content 记忆内容 
   * @param metadata 元数据
   * @param filters 过滤条件
   * @returns 记忆ID
   */
  private async createMemoryDirectly(
    content: string,
    metadata: Record<string, any>,
    filters: SearchFilters
  ): Promise<string> {
    console.log('[MobileMemory] 直接创建记忆:', content.substring(0, 30) + (content.length > 30 ? '...' : ''));
    
    if (!content || content.trim() === '') {
      throw new Error('记忆内容不能为空');
    }
    
    try {
      // 生成嵌入向量
      const embedding = await this.embedder.embed(content);
      
      // 创建记忆ID
      const memoryId = uuidv4();
      
      // 创建元数据对象 - 确保包含data字段，这是搜索时的关键字段
      const memoryMetadata = {
        ...metadata,
        data: content,           // 关键字段：搜索时依赖此字段
        memory: content,         // 为了兼容性，同时保留memory字段
        hash: md5(content),
        createdAt: new Date().toISOString(),
        aiResponse: metadata.aiResponse || '',
        source: 'manual-creation',
        isManuallyCreated: true,
        ...filters  // 包含过滤条件
      };
      
      // 调试信息，检查创建的记忆格式
      console.log(`[MobileMemory] 创建记忆格式:`, {
        id: memoryId,
        hasData: !!memoryMetadata.data,
        hasMemory: !!memoryMetadata.memory,
        filterKeys: Object.keys(filters)
      });
      
      // 插入到向量存储
      await this.vectorStore.insert([embedding], [memoryId], [memoryMetadata]);
      
      // 添加历史记录
      await this.db.addHistory(
        memoryId,
        null,
        content,
        "ADD",
        memoryMetadata.createdAt,
      );
      
      console.log(`[MobileMemory] 成功直接创建记忆, ID: ${memoryId}`);
      return memoryId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[MobileMemory] 直接创建记忆失败: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * 添加到向量存储
   * @param messages 消息数组
   * @param metadata 元数据
   * @param filters 过滤条件
   * @param isMultiRound 是否为多轮对话（默认为false）
   * @returns 记忆项数组
   */
  private addToVectorStore = extendAddToVectorStore(async function(
    this: MobileMemory, // 添加this的类型注解
    messages: Message[],
    metadata: Record<string, any>,
    filters: SearchFilters,
    isMultiRound: boolean = false
  ): Promise<MemoryItem[]> {
    // 检查消息的发送者，只处理用户消息或多轮对话
    if (metadata.role !== 'user' && !isMultiRound) {
      console.log('[MobileMemory] 跳过处理非用户消息，不提取事实');
      return [];
    }

    console.log('[MobileMemory] 开始' + (isMultiRound ? '从多轮对话' : '从用户消息') + '中提取事实');
    
    // 获取消息内容
    const parsedMessages = messages.map((m) => 
      typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    ).join('\n');
    
    // 为表格记忆系统准备原始消息内容
    const rawChatContent = messages.map((m) => {
      const role = m.role === 'assistant' ? (metadata.aiName || 'AI') : 
                 (m.role === 'user' ? (metadata.userName || '用户') : m.role);
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return `${role}: ${content}`;
    }).join('\n\n');
    
    console.log(`[MobileMemory] 准备了原始对话内容供表格记忆使用，长度: ${rawChatContent.length} 字符`);
    metadata._rawChatContent = rawChatContent; // 将原始对话内容添加到元数据中
    
    // 尝试获取最近的聊天上下文
    let recentConversation: string = '';
    
    // 如果是多轮对话，跳过构建额外的上下文，因为已经有足够的内容了
    if (!isMultiRound) {
      try {
        // 从index页面获取最近的5条消息作为上下文
        // 搜索最近的消息以提供上下文
        console.log('[MobileMemory] 搜索最近的消息作为上下文...');
        console.log('[MobileMemory] 使用过滤条件:', JSON.stringify(filters));
        
        const searchStartTime = Date.now();
        const searchResults = await this.vectorStore.search(
          await this.embedder.embed(parsedMessages),
          10, // 增加搜索数量以确保能获取到足够的用户-AI对话对
          filters,
        );
        const searchEndTime = Date.now();
        
        console.log(`[MobileMemory] 上下文搜索完成，耗时: ${searchEndTime - searchStartTime}ms`);
        console.log(`[MobileMemory] 上下文搜索结果数量: ${searchResults?.length || 0}`);
        
        if (searchResults && searchResults.length > 0) {
        }
      } catch (error) {
        console.warn('[MobileMemory] 获取聊天上下文失败，将使用单条消息进行事实提取:', error);
      }
    } else {
      console.log('[MobileMemory] 多轮对话模式，跳过构建额外上下文');
    }

    // 获取自定义称呼
    const userName = metadata.userName || '用户';
    const aiName = metadata.aiName || 'AI';
    
    // 构建上下文字符串，包含对话历史
    const contextString = isMultiRound ? parsedMessages : 
      (recentConversation 
        ? `${recentConversation}当前${userName}消息:\n${parsedMessages}`
        : parsedMessages);

    // 如果表格记忆功能已启用，获取表格数据
    let tableData = null;
    let useTableMemory = false;
    if (this.isTableMemoryEnabled()) {
      try {
        const characterId = filters.agentId;
        const conversationId = filters.runId;
        if (characterId && conversationId) {
          // 从表格记忆集成模块获取表格数据
          const tableMemoryIntegration = require('./integration/table-memory-integration');
          tableData = await tableMemoryIntegration.getTableDataForPrompt(characterId, conversationId);
          useTableMemory = !!tableData;
          
          if (tableData) {
            console.log('[MobileMemory] 获取到表格数据，将整合到提示词中', 
              Array.isArray(tableData) ? `(${tableData.length}个表格)` : '');
          } else {
            // 如果没有表格数据，但有表格模板，可以考虑创建新表格
            try {
              const templates = await require('./plugins/table-memory').API.getSelectedTemplates();
              if (templates && templates.length > 0) {
                console.log(`[MobileMemory] 没有找到现有表格，但有${templates.length}个可用模板`);
              }
            } catch (err) {
              console.log('[MobileMemory] 无法获取表格模板:', err);
            }
          }
        }
      } catch (error) {
        console.warn('[MobileMemory] 获取表格数据失败:', error);
      }
    }

    // 获取提示词，传递自定义称呼和表格数据
    let systemPrompt, userPrompt;
    if (this.customPrompt) {
      // 如果有自定义提示词，使用自定义提示词
      [systemPrompt, userPrompt] = [this.customPrompt, `输入:\n${contextString}`];
      
      // 如果启用表格记忆，尝试增强自定义提示词
      if (useTableMemory && tableData) {
        // 使用表格记忆集成模块的函数增强提示词
        const tableMemoryIntegration = require('./integration/table-memory-integration');
        [systemPrompt, userPrompt] = tableMemoryIntegration.enhancePromptsWithTableMemory(
          systemPrompt, userPrompt, tableData, { userName, aiName });
        console.log('[MobileMemory] 使用表格记忆增强了自定义提示词');
      }
    } else {
      // 没有自定义提示词，使用标准提示词
      if (useTableMemory && tableData) {
        // 使用整合了表格记忆的提示词
        const tableMemoryIntegration = require('./integration/table-memory-integration');
        [systemPrompt, userPrompt] = tableMemoryIntegration.getFactRetrievalAndTableUpdateMessages(
          contextString, tableData, isMultiRound, { userName, aiName });
        console.log('[MobileMemory] 使用表格记忆增强了标准提示词');
      } else {
        // 使用标准提示词
        [systemPrompt, userPrompt] = getFactRetrievalMessages(contextString, isMultiRound, { userName, aiName });
      }
    }

    // 使用 LLM 提取事实（以及表格更新指令，如果启用）
    console.log('[MobileMemory] 正在使用LLM提取事实' + (useTableMemory ? '和表格操作' : ''));
    const response = await this.llm.generateResponse(
      [
        { role: "user", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { type: "json_object" },
    );

    const cleanResponse = removeCodeBlocks(response);
    let facts = [];
    let tableActions = null;
    
    try {
      const parsed = JSON.parse(cleanResponse);
      facts = parsed.facts || [];
      tableActions = parsed.tableActions || null;
      
      // 记录提取的事实
      console.log(`[MobileMemory] 从用户消息中提取到 ${facts.length} 条事实:`);
      facts.forEach((fact: string, index: number) => {
        console.log(`  事实 #${index + 1}: ${fact}`);
      });
      
      // 如果有表格操作指令，记录日志
      if (tableActions && Array.isArray(tableActions)) {
        console.log(`[MobileMemory] LLM 返回了 ${tableActions.length} 条表格操作指令`);
      }
    } catch (e) {
      console.error("[MobileMemory] 解析 LLM 响应失败:", e);
      return [];
    }

    // ----------- 新增：无论后续嵌入是否失败，先异步处理表格操作指令 -----------
    let tableActionsProcessed = false;
    if (useTableMemory && tableActions && Array.isArray(tableActions) && tableActions.length > 0) {
      try {
        const characterId = filters.agentId;
        const conversationId = filters.runId;
        if (characterId && conversationId) {
          const tableMemoryIntegration = require('./integration/table-memory-integration');
          console.log(`[MobileMemory] 处理${tableActions.length}条表格操作指令`);
          tableMemoryIntegration.processLLMResponseForTableMemory(
            cleanResponse,
            characterId,
            conversationId
          ).catch((error: Error) => {
            console.error("[MobileMemory] 处理表格记忆时出错:", error);
          });
          tableActionsProcessed = true;
          // 标记本轮表格操作已处理，防止 extendAddToVectorStore 再处理
          metadata._tableActionsProcessed = true;
        }
      } catch (error) {
        console.error("[MobileMemory] 处理表格操作指令时出错:", error);
      }
    }
    // ----------- 新增逻辑结束 -----------

    // 如果没有提取到事实，提前返回
    if (facts.length === 0) {
      console.log("[MobileMemory] 未从用户消息中提取到任何事实，跳过后续处理");
      return [];
    }

    // 为新事实获取嵌入
    const newMessageEmbeddings: Record<string, number[]> = {};
    const retrievedOldMemory: Array<{ id: string; text: string }> = [];

    // 创建嵌入并搜索类似的记忆
    for (const fact of facts) {
      const embedding = await this.embedder.embed(fact);
      newMessageEmbeddings[fact] = embedding;

      const existingMemories = await this.vectorStore.search(
        embedding,
        5,
        filters,
      );
      
      // 记录查找到的现有记忆
      console.log(`[MobileMemory] 为事实"${fact.substring(0, 30)}..."查找到 ${existingMemories.length} 条相关记忆`);
      
      for (const mem of existingMemories) {
        retrievedOldMemory.push({ id: mem.id, text: mem.payload.data });
        // 完整打印检索到的记忆内容
        console.log(`  记忆ID: ${mem.id}, 内容: ${mem.payload.data}, 相似度: ${mem.score}`);
      }
    }

    // 从旧记忆中移除重复项
    const uniqueOldMemories = retrievedOldMemory.filter(
      (mem, index) =>
        retrievedOldMemory.findIndex((m) => m.id === mem.id) === index,
    );

    // 创建 UUID 映射，处理 UUID 幻觉
    const tempUuidMapping: Record<string, string> = {};
    uniqueOldMemories.forEach((item, idx) => {
      tempUuidMapping[String(idx)] = item.id;
      uniqueOldMemories[idx].id = String(idx);
    });
    
    console.log(`[MobileMemory] 共有 ${uniqueOldMemories.length} 条唯一记忆需要处理`);

    // 获取记忆更新决策
    const updatePrompt = getUpdateMemoryMessages(uniqueOldMemories, facts);
    const updateResponse = await this.llm.generateResponse(
      [{ role: "user", content: updatePrompt }],
      { type: "json_object" },
    );

    const cleanUpdateResponse = removeCodeBlocks(updateResponse);
    let memoryActions = [];
    try {
      const parsed = JSON.parse(cleanUpdateResponse);
      memoryActions = parsed.memory || [];
      
      // 记录内存操作决策
      console.log(`[MobileMemory] LLM决定执行 ${memoryActions.length} 个记忆操作:`);
    } catch (e) {
      console.error("[MobileMemory] 解析 LLM 更新响应失败:", e);
      return [];
    }

    // 处理记忆操作
    const results: MemoryItem[] = [];
    for (const action of memoryActions) {
      try {
        console.log(`[MobileMemory] 执行操作: ${action.event}, 内容: ${action.text?.substring(0, 30)}...`);
        
        // 添加空的AI响应字段到每条记忆中
        const memoryMetadata = { ...metadata, aiResponse: '' };
        
        switch (action.event) {
          case "ADD": {
            const memoryId = await this.createMemory(
              action.text,
              newMessageEmbeddings,
              memoryMetadata,
            );
            results.push({
              id: memoryId,
              memory: action.text,
              metadata: { 
                event: action.event,
                aiResponse: '', // 初始为空，稍后可能会被更新
              },
            });
            console.log(`[MobileMemory] 添加新记忆成功, ID: ${memoryId}`);
            break;
          }
          case "UPDATE": {
            const realMemoryId = tempUuidMapping[action.id];
            await this.updateMemory(
              realMemoryId,
              action.text,
              newMessageEmbeddings,
              memoryMetadata,
            );
            results.push({
              id: realMemoryId,
              memory: action.text,
              metadata: {
                event: action.event,
                previousMemory: action.old_memory,
                aiResponse: '', // 初始为空，稍后可能会被更新
              },
            });
            console.log(`[MobileMemory] 更新记忆成功, ID: ${realMemoryId}, 旧内容: ${action.old_memory?.substring(0, 30)}...`);
            break;
          }
          case "DELETE": {
            const realMemoryId = tempUuidMapping[action.id];
            await this.deleteMemory(realMemoryId);
            results.push({
              id: realMemoryId,
              memory: action.text,
              metadata: { event: action.event },
            });
            console.log(`[MobileMemory] 删除记忆成功, ID: ${realMemoryId}`);
            break;
          }
          case "NONE": {
            // 添加对NONE操作的处理
            const realMemoryId = tempUuidMapping[action.id];
            console.log(`[MobileMemory] 无需更改记忆, ID: ${realMemoryId}, 内容: ${action.text?.substring(0, 30)}...`);
            results.push({
              id: realMemoryId,
              memory: action.text,
              metadata: { event: action.event },
            });
            break;
          }
        }
      } catch (error) {
        console.error(`[MobileMemory] 处理记忆操作错误:`, error);
      }
    }

    // 结果摘要
    const addCount = results.filter(r => r.metadata?.event === 'ADD').length;
    const updateCount = results.filter(r => r.metadata?.event === 'UPDATE').length;
    const deleteCount = results.filter(r => r.metadata?.event === 'DELETE').length;
    const noneCount = results.filter(r => r.metadata?.event === 'NONE').length;
    
    console.log(`[MobileMemory] 记忆处理完成: 添加=${addCount}, 更新=${updateCount}, 删除=${deleteCount}, 无变更=${noneCount}`);
    
    // 处理表格操作指令（如果有）
    if (useTableMemory && tableActions && Array.isArray(tableActions) && tableActions.length > 0) {
      // ...已处理，无需再处理...
    } else if (useTableMemory && !tableActionsProcessed) {
      // 只有在未处理过tableActions时，才用chatContent兜底
      console.log('[MobileMemory] LLM响应中未包含表格操作指令');
      try {
        const characterId = filters.agentId;
        const conversationId = filters.runId;
        if (characterId && conversationId && metadata._rawChatContent) {
          console.log("[MobileMemory] LLM未返回表格操作，尝试使用原始对话内容直接处理表格...");
          const tableMemoryIntegration = require('./integration/table-memory-integration');
          tableMemoryIntegration.processChat(
            metadata._rawChatContent,
            characterId,
            conversationId,
            {
              userName,
              aiName,
              isMultiRound
            }
          ).catch((error: Error) => {
            console.error("[MobileMemory] 使用原始对话内容处理表格记忆时出错:", error);
          });
        }
      } catch (error) {
        console.error("[MobileMemory] 尝试直接处理表格时出错:", error);
      }
    }

    return results;  
  });

  /**
   * 获取记忆
   * @param memoryId 记忆ID
   * @returns 记忆项
   */
  async get(memoryId: string): Promise<MemoryItem | null> {
    const memory = await this.vectorStore.get(memoryId);
    if (!memory) return null;

    const filters = {
      ...(memory.payload.userId && { userId: memory.payload.userId }),
      ...(memory.payload.agentId && { agentId: memory.payload.agentId }),
      ...(memory.payload.runId && { runId: memory.payload.runId }),
    };

    const memoryItem: MemoryItem = {
      id: memory.id,
      memory: memory.payload.data,
      hash: memory.payload.hash,
      createdAt: memory.payload.createdAt,
      updatedAt: memory.payload.updatedAt,
      metadata: {},
    };

    // 添加额外元数据
    const excludedKeys = new Set([
      "userId",
      "agentId",
      "runId",
      "hash",
      "data",
      "createdAt",
      "updatedAt",
    ]);
    for (const [key, value] of Object.entries(memory.payload)) {
      if (!excludedKeys.has(key)) {
        memoryItem.metadata![key] = value;
      }
    }

    return { ...memoryItem, ...filters };
  }

  /**
   * 搜索记忆
   * @param query 搜索查询
   * @param config 搜索选项
   * @returns 搜索结果
   */
  async search(
    query: string,
    config: SearchMemoryOptions,
  ): Promise<SearchResult> {
    const { userId, agentId, runId, limit = 100, filters = {} } = config;

    if (userId) filters.userId = userId;
    if (agentId) filters.agentId = agentId;
    if (runId) filters.runId = runId;

    if (!filters.userId && !filters.agentId && !filters.runId) {
      throw new Error(
        "必须提供过滤条件之一: userId, agentId 或 runId!"
      );
    }

    console.log(`[MobileMemory] 开始搜索记忆: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`);
    console.log(`[MobileMemory] 搜索过滤条件: ${JSON.stringify(filters)}, 限制: ${limit}条`);
    
    const searchStartTime = Date.now();
    
    // 搜索向量存储
    const queryEmbedding = await this.embedder.embed(query);
    const memories = await this.vectorStore.search(
      queryEmbedding,
      limit,
      filters,
    );
    
    const searchEndTime = Date.now();
    console.log(`[MobileMemory] 搜索完成，耗时: ${searchEndTime - searchStartTime}ms`);
    console.log(`[MobileMemory] 搜索结果数量: ${memories?.length || 0}`);

    const excludedKeys = new Set([
      "userId",
      "agentId",
      "runId",
      "hash",
      "data",
      "createdAt",
      "updatedAt",
    ]);
    interface VectorStorePayload {
      data: string;
      hash: string;
      createdAt: string;
      updatedAt: string;
      userId?: string;
      agentId?: string;
      runId?: string;
      [key: string]: any;
    }

    interface VectorStoreResult {
      id: string;
      payload: VectorStorePayload;
      score: number;
    }

    interface MemorySearchResult {
      id: string;
      memory: string;
      hash: string;
      createdAt: string;
      updatedAt: string;
      score: number;
      metadata: Record<string, any>;
      userId?: string;
      agentId?: string;
      runId?: string;
    }

    const results: MemorySearchResult[] = memories.map((mem: VectorStoreResult) => ({
      id: mem.id,
      memory: mem.payload.data,
      hash: mem.payload.hash,
      createdAt: mem.payload.createdAt,
      updatedAt: mem.payload.updatedAt,
      score: mem.score,
      metadata: Object.entries(mem.payload)
        .filter(([key]) => !excludedKeys.has(key))
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {}),
      ...(mem.payload.userId && { userId: mem.payload.userId }),
      ...(mem.payload.agentId && { agentId: mem.payload.agentId }),
      ...(mem.payload.runId && { runId: mem.payload.runId }),
    }));

    // 详细记录搜索结果
    if (memories && memories.length > 0) {
      console.log('[MobileMemory] 搜索结果详情:');
      interface MemorySearchPayload {
        id: string;
        data?: string;
        aiResponse?: string;
        timestamp?: string;
        createdAt?: string;
      }

      interface MemorySearchResult {
        id: string;
        score?: number;
        payload: MemorySearchPayload;
      }

      
      if (memories.length > 5) {
        console.log(`  ...以及另外 ${memories.length - 5} 条结果`);
      }
    } else {
      console.log('[MobileMemory] 没有找到符合条件的记忆');
    }

    return { results };
  }

  /**
   * 更新记忆
   * @param memoryId 记忆ID
   * @param data 新记忆内容
   * @returns 成功消息
   */
  async update(memoryId: string, data: string): Promise<{ message: string }> {
    const embedding = await this.embedder.embed(data);
    await this.updateMemory(memoryId, data, { [data]: embedding });
    return { message: "记忆更新成功!" };
  }

  /**
   * 删除记忆
   * @param memoryId 记忆ID
   * @returns 成功消息
   */
  async delete(memoryId: string): Promise<{ message: string }> {
    await this.deleteMemory(memoryId);
    return { message: "记忆删除成功!" };
  }

  /**
   * 删除所有记忆
   * @param config 删除选项
   * @returns 成功消息
   */
  async deleteAll(
    config: DeleteAllMemoryOptions,
  ): Promise<{ message: string }> {
    const { userId, agentId, runId } = config;

    const filters: SearchFilters = {};
    if (userId) filters.userId = userId;
    if (agentId) filters.agentId = agentId;
    if (runId) filters.runId = runId;

    if (!Object.keys(filters).length) {
      throw new Error(
        "删除所有记忆需要至少一个过滤条件。如果想删除所有记忆，请使用 `reset()` 方法。"
      );
    }

    const [memories] = await this.vectorStore.list(filters);
    for (const memory of memories) {
      await this.deleteMemory(memory.id);
    }

    return { message: "记忆删除成功!" };
  }

  /**
   * 获取记忆历史
   * @param memoryId 记忆ID
   * @returns 历史记录
   */
  async history(memoryId: string): Promise<any[]> {
    return this.db.getHistory(memoryId);
  }

  /**
   * 重置记忆系统
   */
  async reset(): Promise<void> {
    await this.db.reset();
    await this.vectorStore.deleteCol();
    // 重置时也强制使用 mobile_file provider
    this.config.vectorStore.provider = 'mobile_file';
    this.vectorStore = VectorStoreFactory.create(
      this.config.vectorStore.provider,
      this.config.vectorStore.config,
    );
  }

  /**
   * 获取所有记忆
   * @param config 获取选项
   * @returns 搜索结果
   */
  async getAll(config: GetAllMemoryOptions): Promise<SearchResult> {
    const { userId, agentId, runId, limit = 100 } = config;

    const filters: SearchFilters = {};
    if (userId) filters.userId = userId;
    if (agentId) filters.agentId = agentId;
    if (runId) filters.runId = runId;

    const [memories] = await this.vectorStore.list(filters, limit);

    const excludedKeys = new Set([
      "userId",
      "agentId",
      "runId",
      "hash",
      "data",
      "createdAt",
      "updatedAt",
    ]);
    // 修复: 添加显式类型定义，解决 mem 隐式 any 类型问题
    const results = memories.map((mem: VectorStoreResult) => ({
      id: mem.id,
      memory: mem.payload.data,
      hash: mem.payload.hash,
      createdAt: mem.payload.createdAt,
      updatedAt: mem.payload.updatedAt,
      metadata: Object.entries(mem.payload)
        .filter(([key]) => !excludedKeys.has(key))
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {}),
      ...(mem.payload.userId && { userId: mem.payload.userId }),
      ...(mem.payload.agentId && { agentId: mem.payload.agentId }),
      ...(mem.payload.runId && { runId: mem.payload.runId }),
    }));

    return { results };
  }

  /**
   * 创建记忆
   * @param data 记忆内容
   * @param existingEmbeddings 已有嵌入
   * @param metadata 元数据
   * @returns 记忆ID
   */
  private async createMemory(
    data: string,
    existingEmbeddings: Record<string, number[]>,
    metadata: Record<string, any>,
  ): Promise<string> {
    if (!data || data.trim() === '') {
      throw new Error('记忆内容不能为空');
    }
    
    const memoryId = uuidv4();
    let embedding: number[];
    
    try {
      // 尝试获取或创建嵌入向量
      embedding = existingEmbeddings[data] || (await this.embedder.embed(data));
      
      if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[MobileMemory] 记忆嵌入失败: ${errorMessage}`);
      throw new Error(`记忆嵌入失败: ${errorMessage}`);
    }

    const memoryMetadata = {
      ...metadata,
      data, // 将data直接作为payload的一部分存储
      hash: md5(data),
      createdAt: new Date().toISOString(),
      aiResponse: metadata.aiResponse || '', // 确保包含aiResponse字段
    };

    try {
      await this.vectorStore.insert([embedding], [memoryId], [memoryMetadata]);
      await this.db.addHistory(
        memoryId,
        null,
        data,
        "ADD",
        memoryMetadata.createdAt,
      );

      return memoryId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[MobileMemory] 向量存储失败: ${errorMessage}`);
      throw new Error(`向量存储失败: ${errorMessage}`);
    }
  }

  /**
   * 更新记忆
   * @param memoryId 记忆ID
   * @param data 新记忆内容
   * @param existingEmbeddings 已有嵌入
   * @param metadata 元数据
   * @returns 记忆ID
   */
  private async updateMemory(
    memoryId: string,
    data: string,
    existingEmbeddings: Record<string, number[]>,
    metadata: Record<string, any> = {},
  ): Promise<string> {
    const existingMemory = await this.vectorStore.get(memoryId);
    if (!existingMemory) {
      throw new Error(`记忆 ID ${memoryId} 不存在`);
    }

    const prevValue = existingMemory.payload.data;
    const embedding =
      existingEmbeddings[data] || (await this.embedder.embed(data));

    const newMetadata = {
      ...metadata,
      data,
      hash: md5(data),
      createdAt: existingMemory.payload.createdAt,
      updatedAt: new Date().toISOString(),
      aiResponse: metadata.aiResponse || existingMemory.payload.aiResponse || '', // 保留或设置aiResponse
      ...(existingMemory.payload.userId && {
        userId: existingMemory.payload.userId,
      }),
      ...(existingMemory.payload.agentId && {
        agentId: existingMemory.payload.agentId,
      }),
      ...(existingMemory.payload.runId && {
        runId: existingMemory.payload.runId,
      }),
    };

    await this.vectorStore.update(memoryId, embedding, newMetadata);
    await this.db.addHistory(
      memoryId,
      prevValue,
      data,
      "UPDATE",
      newMetadata.createdAt,
      newMetadata.updatedAt,
    );

    return memoryId;
  }

  /**
   * 删除记忆
   * @param memoryId 记忆ID
   * @returns 记忆ID
   */
  private async deleteMemory(memoryId: string): Promise<string> {
    const existingMemory = await this.vectorStore.get(memoryId);
    if (!existingMemory) {
      throw new Error(`记忆 ID ${memoryId} 不存在`);
    }

    const prevValue = existingMemory.payload.data;
    await this.vectorStore.delete(memoryId);
    await this.db.addHistory(
      memoryId,
      prevValue,
      null,
      "DELETE",
      undefined,
      undefined,
      1,
    );

    return memoryId;
  }

  /**
   * 更新向量存储中的AI响应
   * @param memoryIds 需要更新的记忆ID数组
   * @param aiResponse AI响应文本
   */
  public async updateAIResponse(memoryIds: string[], aiResponse: string): Promise<void> {
    if (!memoryIds || memoryIds.length === 0 || !aiResponse) {
      console.log('[MobileMemory] 无需更新AI响应，跳过');
      return;
    }

    console.log(`[MobileMemory] 正在为 ${memoryIds.length} 条记忆更新AI响应`);
    
    for (const memoryId of memoryIds) {
      try {
        const existingMemory = await this.vectorStore.get(memoryId);
        if (!existingMemory) {
          console.warn(`[MobileMemory] 记忆ID ${memoryId} 不存在，跳过更新AI响应`);
          continue;
        }

        // 创建新的元数据，保留原有内容，更新aiResponse字段
        const newMetadata = {
          ...existingMemory.payload,
          aiResponse: aiResponse,
          updatedAt: new Date().toISOString(),
        };

        try {
          // 使用null作为embedding参数，让向量存储器保持原有向量
          await this.vectorStore.update(memoryId, null, newMetadata);
          console.log(`[MobileMemory] 成功更新记忆ID ${memoryId} 的AI响应`);
        } catch (error: unknown) {
          // 如果使用null向量更新失败，尝试使用原向量或空数组
          const updateError = error instanceof Error ? error.message : String(error);
          console.warn(`[MobileMemory] 使用null向量更新失败，尝试保持原向量: ${updateError}`);
          
          // 尝试重新获取原向量（如果存储引擎支持）
          let originalVector = null;
          if (existingMemory.vector) {
            originalVector = existingMemory.vector;
            console.log('[MobileMemory] 找到原始向量，使用原始向量更新');
          } else {
            // 如果找不到原始向量，尝试重新嵌入记忆内容
            try {
              if (existingMemory.payload && existingMemory.payload.data) {
                console.log(`[MobileMemory] 原始向量不可用，为记忆ID ${memoryId} 重新生成向量`);
                originalVector = await this.embedder.embed(existingMemory.payload.data);
              }
            } catch (embedError) {
              console.error(`[MobileMemory] 无法为记忆ID ${memoryId} 重新生成向量:`, embedError);
            }
          }

          // 使用原向量或空数组更新
          await this.vectorStore.update(
            memoryId, 
            originalVector || [], 
            newMetadata
          );
          console.log(`[MobileMemory] 成功使用${originalVector ? '原始' : '空'}向量更新记忆ID ${memoryId} 的AI响应`);
        }
      } catch (error) {
        console.error(`[MobileMemory] 更新记忆ID ${memoryId} 的AI响应失败:`, error);
      }
    }
  }
}
