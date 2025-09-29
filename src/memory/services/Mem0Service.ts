import { Message } from '../types';
import { AddMemoryOptions, SearchMemoryOptions } from '../memory.types';

/**
 * Mem0 记忆服务单例
 * 用于全局访问记忆相关功能
 */
class Mem0Service {
  private static instance: Mem0Service | null = null;
  // Make memoryRef public so it can be accessed by other services
  public memoryRef: any = null; // Add a reference to the memory instance
  
  private memoryActions: {
    add: (messages: string | Message[], options: AddMemoryOptions, isMultiRound?: boolean) => Promise<any>;
    search: (query: string, options: SearchMemoryOptions) => Promise<any>;
    get: (memoryId: string) => Promise<any>;
    update: (memoryId: string, data: string) => Promise<any>;
    delete: (memoryId: string) => Promise<any>;
    reset: () => Promise<any>;
  } | null = null;
  
  private initialized = false;
  // Change to public to allow direct manipulation in emergency situations
  public isEmbeddingAvailable = true; // 跟踪嵌入服务是否可用
  
  // 记录最近处理的记忆ID，用于后续更新AI响应
  private lastProcessedMemoryIds: string[] = [];
  
  // 添加消息缓存，按角色和对话ID组织
  private messageCache: {
    [characterId: string]: {
      [conversationId: string]: {
        messages: Array<{ message: string; role: 'user' | 'bot'; timestamp: string; userName?: string; aiName?: string }>;
        userMessageCount: number;
        pendingUserMessage: boolean; // 跟踪是否有未配对的用户消息
      };
    };
  } = {};
  
  // 设置每10轮用户消息处理一次记忆
  private processingInterval: number = 10;
  
  // 启用/禁用记忆功能
  private memoryEnabled: boolean = true;
  
  // Add property to store character-specific naming
  private characterNames: {
    [characterId: string]: {
      userName: string;
      aiName: string;
    }
  } = {};
  
  private constructor() {
    // 私有构造函数，防止外部直接创建实例
  }
  
  /**
   * 获取单例实例
   */
  public static getInstance(): Mem0Service {
    if (!Mem0Service.instance) {
      Mem0Service.instance = new Mem0Service();
    }
    return Mem0Service.instance;
  }
  
  /**
   * 初始化记忆服务
   * @param memoryActions 记忆相关操作函数
   * @param memoryRef 记忆实例引用（用于更新LLM配置）
   */
  public initialize(memoryActions: {
    add: (messages: string | Message[], options: AddMemoryOptions, isMultiRound?: boolean) => Promise<any>;
    search: (query: string, options: SearchMemoryOptions) => Promise<any>;
    get: (memoryId: string) => Promise<any>;
    update: (memoryId: string, data: string) => Promise<any>;
    delete: (memoryId: string) => Promise<any>;
    reset: () => Promise<any>;
  }, memoryRef?: any): void {
    this.memoryActions = memoryActions;
    this.memoryRef = memoryRef; // Store reference to the memory instance
    this.initialized = true;
    console.log('[Mem0Service] 记忆服务初始化成功');
    
    // 在初始化时检查API设置
    this.tryGetZhipuApiKey().then(apiKey => {
      if (apiKey) {
        console.log('[Mem0Service] 找到智谱API密钥，嵌入服务应该可用');
        this.isEmbeddingAvailable = true;
      } else {
        console.warn('[Mem0Service] 未找到智谱API密钥，嵌入服务可能不可用');
        this.isEmbeddingAvailable = false;
      }
    });
  }
  
  /**
   * 检查是否已初始化
   */
  private checkInitialized(): void {
    if (!this.initialized || !this.memoryActions) {
      console.error('[Mem0Service] 记忆服务尚未初始化');
      throw new Error('记忆服务尚未初始化');
    }
  }
  
  /**
   * 尝试从本地存储获取智谱API密钥
   */
  private async tryGetZhipuApiKey(): Promise<string | null> {
    try {
      // 尝试从AsyncStorage获取，优先使用这个方法
      if (typeof require !== 'undefined') {
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          const settings = await AsyncStorage.getItem('user_settings');
          if (settings) {
            const parsedSettings = JSON.parse(settings);
            if (parsedSettings?.chat?.zhipuApiKey) {
              console.log('[Mem0Service] 从AsyncStorage成功获取zhipuApiKey，长度:', 
                parsedSettings.chat.zhipuApiKey.length);
              return parsedSettings.chat.zhipuApiKey;
            }
          }
        } catch (e) {
          console.log('[Mem0Service] 从AsyncStorage获取设置失败:', e);
        }
      }
      
      // 尝试从localStorage获取（备用）
      if (typeof localStorage !== 'undefined') {
        const settings = localStorage.getItem('user_settings');
        if (settings) {
          try {
            const parsedSettings = JSON.parse(settings);
            if (parsedSettings?.chat?.zhipuApiKey) {
              console.log('[Mem0Service] 从localStorage成功获取zhipuApiKey');
              return parsedSettings.chat.zhipuApiKey;
            }
          } catch (e) {
            console.error('[Mem0Service] 解析localStorage中的设置失败:', e);
          }
        }
      }
    } catch (error) {
      console.error('[Mem0Service] 尝试获取智谱API密钥失败:', error);
    }
    return null;
  }
  
  /**
   * 设置角色特定的命名
   * @param characterId 角色ID
   * @param userName 用户的自定义称呼
   * @param aiName AI的名称
   */
  public setCharacterNames(characterId: string, userName: string, aiName: string): void {
    if (!characterId) return;
    
    this.characterNames[characterId] = {
      userName: userName || '用户',
      aiName: aiName || 'AI'
    };
    
    console.log(`[Mem0Service] 已为角色 ${characterId} 设置自定义称呼: ${userName || '用户'} 和 ${aiName || 'AI'}`);
  }
  
  /**
   * 获取角色特定的用户称呼
   * @param characterId 角色ID
   * @returns 用户称呼
   */
  public getUserName(characterId: string): string {
    return this.characterNames[characterId]?.userName || '用户';
  }
  
  /**
   * 获取角色特定的AI称呼
   * @param characterId 角色ID
   * @returns AI称呼
   */
  public getAIName(characterId: string): string {
    return this.characterNames[characterId]?.aiName || 'AI';
  }
  
  /**
   * 从缓存或数据库获取记忆事实，避免向量搜索
   * @param characterId 角色ID
   * @param conversationId 会话ID
   * @param searchQuery 可选的搜索查询
   * @returns 记忆事实数组
   */
  public async getCachedMemoryFacts(
    characterId: string,
    conversationId: string,
    searchQuery?: string
  ): Promise<any[]> {
    try {
      this.checkInitialized();
      
      if (!this.memoryRef) {
        console.log('[Mem0Service] memoryRef不可用，无法获取缓存的记忆事实');
        return [];
      }
      
      console.log(`[Mem0Service] 获取角色${characterId}的缓存记忆事实`);
      
      // 使用memory实例的getAll方法检索记忆，而不是进行向量搜索
      const filter = {
        agentId: characterId
      };
      
      // 只有在会话ID存在且非空时添加会话过滤器
      if (conversationId && conversationId.trim() !== '') {
        Object.assign(filter, { runId: conversationId });
      }
      
      // 获取记忆
      const result = await this.memoryRef.getAll({
        ...filter,
        limit: 100 // 限制返回的记忆数量
      });
      
      let memories = result.results || [];
      
      // 如果有搜索查询，在客户端进行过滤
      if (searchQuery && searchQuery.trim() !== '') {
        const normalizedQuery = searchQuery.trim().toLowerCase();
        interface Memory {
          memory: string;
          id: string;
          createdAt: string;
          updatedAt?: string;
          metadata?: Record<string, unknown>;
        }

        memories = memories.filter((memory: Memory) => 
          memory.memory.toLowerCase().includes(normalizedQuery)
        );
      }
      
      // 按最近更新的排序
      interface Memory {
        updatedAt?: string;
        createdAt: string;
      }

            memories.sort((a: Memory, b: Memory) => {
              const dateA: string = a.updatedAt || a.createdAt || '';
              const dateB: string = b.updatedAt || b.createdAt || '';
              return dateB.localeCompare(dateA);
            });
      
      console.log(`[Mem0Service] 找到${memories.length}条缓存记忆事实`);
      return memories;
    } catch (error) {
      console.error('[Mem0Service] 获取缓存记忆事实失败:', error);
      return [];
    }
  }
  
  /**
   * 添加聊天记忆
   * @param message 消息文本
   * @param role 角色 ('user' | 'bot')
   * @param characterId 角色ID
   * @param conversationId 会话ID
   * @param llmResponse 可选的LLM响应
   */
  async addChatMemory(
    message: string,
    role: 'user' | 'bot',
    characterId: string,
    conversationId: string,
    llmResponse?: string // 新增参数：可选LLM响应
  ): Promise<void> {
    try {
      this.checkInitialized();

      // 如果嵌入服务不可用且表格插件也不可用，记录消息但不尝试添加
      if (!this.isEmbeddingAvailable || !this.memoryEnabled) {
        // 新增：嵌入不可用时，主动调用表格插件兜底
        if (this.memoryEnabled && characterId) {
          try {
            const tableMemoryIntegration = require('../integration/table-memory-integration');
            if (tableMemoryIntegration.isTableMemoryEnabled()) {
              // 检查角色是否有表格
              await tableMemoryIntegration.getTableDataForPrompt(characterId, conversationId);
            }
          } catch (e) {
            console.warn('[Mem0Service] 嵌入不可用时表格插件兜底失败:', e);
          }
        }
        return;
      }

      if (!message || message.trim() === '') {
        console.log('[Mem0Service] 跳过空消息');
        return;
      }

      // 处理AI回复，如果有待更新的记忆，为它们添加AI响应
      if (role === 'bot' && this.lastProcessedMemoryIds.length > 0) {
        try {
          console.log(`[Mem0Service] 收到AI回复，长度: ${message.length}字符，将更新${this.lastProcessedMemoryIds.length}条记忆的AI响应字段`);
          await this.updateAIResponseForMemories(this.lastProcessedMemoryIds, message);
        } catch (err) {
          console.error('[Mem0Service] 更新AI响应字段时出错:', err instanceof Error ? err.stack : err);
        }
        return;
      }

      // 初始化缓存结构
      if (!characterId) {
        console.warn('[Mem0Service] characterId 为空，跳过 addChatMemory');
        return;
      }
      if (!conversationId) {
        console.warn('[Mem0Service] conversationId 为空，跳过 addChatMemory');
        return;
      }
      if (!this.messageCache[characterId]) {
        this.messageCache[characterId] = {};
      }
      if (!this.messageCache[characterId][conversationId]) {
        this.messageCache[characterId][conversationId] = {
          messages: [],
          userMessageCount: 0,
          pendingUserMessage: false
        };
      }

      const cache = this.messageCache[characterId][conversationId];

      // 获取角色特定的命名
      const userName = this.getUserName(characterId);
      const aiName = this.getAIName(characterId);

      // 添加当前消息到缓存，使用自定义称呼
      const timestamp = new Date().toISOString();
      cache.messages.push({
        message,
        role,
        timestamp,
        userName,
        aiName
      });

      // 改进: 实现对话轮次计数逻辑
      if (role === 'user') {
        // 标记有一条待回复的用户消息
        cache.pendingUserMessage = true;
        console.log(`[Mem0Service] 添加用户消息到缓存，等待AI回复完成一轮对话`);
      } else if (role === 'bot' && cache.pendingUserMessage) {
        // 如果是AI回复，并且有待回复的用户消息，则完成一轮对话
        cache.pendingUserMessage = false;
        cache.userMessageCount++;

        // 打印当前对话轮次和处理间隔
        console.log(`[Mem0Service] 完成第 ${cache.userMessageCount} 轮对话，处理间隔: ${this.processingInterval} 轮`);

        // 改进：使用取模运算，确保只在达到确切的倍数时触发处理
        if (cache.userMessageCount > 0 && cache.userMessageCount % this.processingInterval === 0) {
          try {
            console.log(`[Mem0Service] 达到处理间隔 ${this.processingInterval} 轮的整数倍，开始处理缓存记忆`);
            await this.processMessageCache(characterId, conversationId);
          } catch (err) {
            console.error('[Mem0Service] processMessageCache 异常:', err instanceof Error ? err.stack : err);
          }
        }
      }
    } catch (error) {
      console.error('[Mem0Service] 添加聊天记忆失败:', error instanceof Error ? error.stack : error);

      // 判断错误类型
      if (error instanceof Error && error.message.includes('智谱嵌入API密钥未设置')) {
        console.warn('[Mem0Service] 智谱API密钥未设置，标记嵌入服务为不可用');
        this.isEmbeddingAvailable = false;

        // 尝试重新获取API密钥
        try {
          const apiKey = await this.tryGetZhipuApiKey();
          if (apiKey) {
            console.log('[Mem0Service] 找到API密钥，下次请求将尝试使用');
            this.isEmbeddingAvailable = true;
          }
        } catch (e) {
console.error('[Mem0Service] 添加聊天记忆失败:', error instanceof Error ? error.stack : error);
        }
      }
    }
  }

  /**
   * 处理消息缓存，提取并保存记忆
   * @param characterId 角色ID
   * @param conversationId 会话ID
   */
  private async processMessageCache(
    characterId: string,
    conversationId: string
  ): Promise<void> {
    try {
      if (!characterId || !conversationId) {
        console.warn('[Mem0Service] processMessageCache 缺少 characterId 或 conversationId');
        return;
      }
      if (!this.messageCache[characterId] || !this.messageCache[characterId][conversationId]) {
        console.log(`[Mem0Service] 没有找到角色ID=${characterId}，会话ID=${conversationId}的消息缓存`);
        return;
      }

      const cache = this.messageCache[characterId][conversationId];

      if (!cache || !Array.isArray(cache.messages) || cache.messages.length === 0) {
        console.log(`[Mem0Service] 消息缓存为空，无需处理`);
        return;
      }

      // 获取角色特定的命名
      const userName = this.getUserName(characterId);
      const aiName = this.getAIName(characterId);

      // 构建多轮对话格式，使用自定义称呼
      let conversationText = "";
      cache.messages.forEach((msg, index) => {
        const speaker = msg.role === 'user'
          ? (msg.userName || userName)
          : (msg.aiName || aiName);

        conversationText += `${speaker}: ${msg.message}\n\n`;
      });

      console.log(`[Mem0Service] 处理 ${cache.userMessageCount} 轮对话, 共 ${cache.messages.length} 条消息，角色ID=${characterId}`);
      console.log(`[Mem0Service] 对话内容预览: ${conversationText.substring(0, 100)}...`);

      // 将自定义称呼信息传递给记忆系统
      let result: any = null;
      try {
        result = await this.memoryActions!.add(
          conversationText,
          {
            userId: 'current-user',
            agentId: characterId,
            runId: conversationId,
            metadata: {
              timestamp: new Date().toISOString(),
              role: 'user',
              isMultiRound: true,
              userName: userName,
              aiName: aiName
            }
          },
          true  // 明确标记这是多轮对话处理
        );
      } catch (err) {
        console.error('[Mem0Service] memoryActions.add 异常:', err instanceof Error ? err.stack : err);
        throw err;
      }

      // 记录生成的事实
      const factsCount = result?.results?.length || 0;
      console.log(`[Mem0Service] 成功添加多轮对话记忆，生成了 ${factsCount} 条事实`);

      // 清空上次处理的记忆ID，准备记录新的ID
      this.lastProcessedMemoryIds = [];

      if (factsCount > 0 && Array.isArray(result.results)) {
        console.log(`[Mem0Service] 提取的事实详情:`);

        // 收集这次处理中添加或更新的记忆ID
        const processedIds: string[] = [];

        result.results.forEach((item: { id: string; memory: string; metadata?: any }, index: number) => {
          console.log(`  事实 #${index + 1} (ID: ${item.id}): ${item.memory}`);
          if (item.metadata?.event) {
            console.log(`    操作类型: ${item.metadata.event}`);

            // 如果是添加或更新操作，记录ID以便后续更新AI响应
            if (item.metadata.event === 'ADD' || item.metadata.event === 'UPDATE') {
              processedIds.push(item.id);
            }
          }
          if (item.metadata?.previousMemory) {
            console.log(`    之前内容: ${item.metadata.previousMemory}`);
          }
        });

        // 保存这次处理的记忆ID，以便下次AI回复时更新AI响应字段
        if (processedIds.length > 0) {
          this.lastProcessedMemoryIds = processedIds;
          console.log(`[Mem0Service] 已记录 ${processedIds.length} 个待更新的记忆ID，等待AI回复后更新AI响应字段`);
        }
      }

      // 改进：重置消息缓存和计数器，但保留待处理的用户消息状态
      const pendingUserMessage = cache.pendingUserMessage;
      this.messageCache[characterId][conversationId] = {
        messages: [],
        userMessageCount: 0,
        pendingUserMessage
      };

      console.log(`[Mem0Service] 已重置消息缓存和对话计数，准备下一轮收集，保留待处理用户消息状态: ${pendingUserMessage}`);

    } catch (error) {
      console.error('[Mem0Service] 处理消息缓存失败:', error instanceof Error ? error.stack : error);

      // 新增：兜底处理表格操作指令
      try {
        const tableMemoryIntegration = require('../integration/table-memory-integration');
        if (tableMemoryIntegration.isTableMemoryEnabled()) {
          // 直接用缓存的消息内容调用表格插件
          const cache = this.messageCache[characterId]?.[conversationId];
          if (cache && cache.messages && cache.messages.length > 0) {
            const userName = this.getUserName(characterId);
            const aiName = this.getAIName(characterId);
            // 拼接多轮对话内容
            const chatContent = cache.messages.map(msg => {
              const speaker = msg.role === 'user' ? (msg.userName || userName) : (msg.aiName || aiName);
              return `${speaker}: ${msg.message}`;
            }).join('\n\n');
            await tableMemoryIntegration.processChat(
              chatContent,
              characterId,
              conversationId,
              { userName, aiName, isMultiRound: true, chatContent }
            );
            console.log('[Mem0Service] 嵌入失败时已兜底调用表格插件处理多轮对话内容');
          }
        }
      } catch (tableError) {
        console.error('[Mem0Service] 嵌入失败时表格插件兜底处理也失败:', tableError instanceof Error ? tableError.stack : tableError);
      }

      // 改进：即使处理失败也重置计数，避免因错误导致频繁尝试处理
      if (this.messageCache[characterId]?.[conversationId]) {
        const pendingUserMessage = this.messageCache[characterId][conversationId].pendingUserMessage;
        this.messageCache[characterId][conversationId] = {
          messages: [],
          userMessageCount: 0,
          pendingUserMessage
        };
        console.log(`[Mem0Service] 处理失败但已重置消息缓存和对话计数，保留待处理用户消息状态: ${pendingUserMessage}`);
      }
    }
  }

  /**
   * 更新记忆的AI响应字段
   * @param memoryIds 待更新的记忆ID数组
   * @param aiResponse AI回复内容
   */
  private async updateAIResponseForMemories(memoryIds: string[], aiResponse: string): Promise<void> {
    try {
      if (!this.memoryRef || !memoryIds || memoryIds.length === 0 || !aiResponse) {
        console.log('[Mem0Service] 无更新任务或缺少必要参数，跳过AI响应更新');
        return;
      }

      // 过滤掉无效的记忆ID（null、undefined或空字符串）
      const validMemoryIds = memoryIds.filter(id => id && id.trim() !== '');
      if (validMemoryIds.length === 0) {
        console.log('[Mem0Service] 没有有效的记忆ID需要更新，跳过处理');
        this.lastProcessedMemoryIds = [];
        return;
      }

      // 截断过长的AI响应
      const maxResponseLength = 1000;
      const truncatedResponse = aiResponse.length > maxResponseLength
        ? aiResponse.substring(0, maxResponseLength) + "..."
        : aiResponse;

      console.log(`[Mem0Service] 正在为 ${validMemoryIds.length} 条记忆更新AI响应`);
      console.log(`[Mem0Service] 响应内容前50字符: "${truncatedResponse.substring(0, 50)}${truncatedResponse.length > 50 ? '...' : ''}"`);

      // 调用memory实例的方法更新AI响应
      if (this.memoryRef && typeof this.memoryRef.updateAIResponse === 'function') {
        try {
          await this.memoryRef.updateAIResponse(validMemoryIds, truncatedResponse);
          console.log(`[Mem0Service] 成功更新 ${validMemoryIds.length} 条记忆的AI响应字段`);

          // 记录更新的记忆ID，方便调试
          if (validMemoryIds.length <= 5) {
            console.log(`[Mem0Service] 更新的记忆ID: ${validMemoryIds.join(', ')}`);
          } else {
            console.log(`[Mem0Service] 更新的记忆ID (前5条): ${validMemoryIds.slice(0, 5).join(', ')}`);
          }
        } catch (updateError) {
          console.error('[Mem0Service] 批量更新AI响应失败，尝试逐个更新:', updateError instanceof Error ? updateError.stack : updateError);

          // 如果批量更新失败，尝试逐个更新
          let successCount = 0;
          for (const memoryId of validMemoryIds) {
            try {
              await this.memoryRef.updateAIResponse([memoryId], truncatedResponse);
              successCount++;
            } catch (singleError) {
              console.error(`[Mem0Service] 更新单条记忆 ${memoryId} 的AI响应失败:`, singleError instanceof Error ? singleError.stack : singleError);
            }
          }

          if (successCount > 0) {
            console.log(`[Mem0Service] 逐个更新方式成功更新了 ${successCount}/${validMemoryIds.length} 条记忆的AI响应`);
          } else {
            console.error(`[Mem0Service] 所有记忆的AI响应更新都失败了`);
          }
        }
      } else {
        console.warn('[Mem0Service] memory实例不支持updateAIResponse方法，无法更新AI响应');
      }

      // 清空处理过的记忆ID
      this.lastProcessedMemoryIds = [];
    } catch (error) {
      console.error('[Mem0Service] 更新AI响应失败:', error instanceof Error ? error.stack : error);

      // 清空处理过的记忆ID，避免失败后重复尝试
      this.lastProcessedMemoryIds = [];
    }
  }
  
  /**
   * 搜索相关记忆
   * @param query 查询文本
   * @param characterId 角色ID
   * @param conversationId 对话ID
   * @param limit 结果数量限制
   */
  public async searchMemories(
    query: string,
    characterId: string,
    conversationId: string,
    limit: number = 5
  ): Promise<any> {
    this.checkInitialized();

    if (!this.isEmbeddingAvailable) {
      console.log('[Mem0Service] 嵌入服务不可用，返回空搜索结果');
      return { results: [] };
    }

    // 统一 runId 格式为 conversation- 前缀
    const prefixedConversationId = conversationId.startsWith('conversation-')
      ? conversationId
      : `conversation-${conversationId}`;

    console.log(`[Mem0Service] 开始搜索记忆: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`);
    console.log(`[Mem0Service] 搜索参数: characterId=${characterId}, conversationId=${prefixedConversationId}, limit=${limit}`);

    try {
      const searchStartTime = Date.now();

      // 只用带前缀的 runId 搜索
      const results = await this.memoryActions!.search(query, {
        userId: 'current-user',
        agentId: characterId,
        runId: prefixedConversationId,
        limit
      });

      const searchEndTime = Date.now();
      const searchTime = searchEndTime - searchStartTime;
      const resultCount = results.results?.length || 0;
      console.log(`[Mem0Service] 搜索结果: 找到 ${resultCount} 条记忆, 搜索耗时: ${searchTime}ms`);

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Mem0Service] 搜索记忆失败: ${errorMessage}`);

      if (error instanceof Error && error.message.includes('智谱嵌入API密钥未设置')) {
        console.warn('[Mem0Service] 智谱API密钥未设置，标记嵌入服务为不可用');
        this.isEmbeddingAvailable = false;

        this.tryGetZhipuApiKey().then(apiKey => {
          if (apiKey) {
            console.log('[Mem0Service] 找到API密钥，下次请求将尝试使用');
            this.isEmbeddingAvailable = true;
          }
        });
      }

      return { results: [] };
    }
  }
  
  /**
   * 更新LLM配置
   * @param config LLM配置
   */
  public updateLLMConfig(config: any): void {
    try {
      if (!this.initialized) {
        console.warn('[Mem0Service] 记忆服务尚未初始化，无法更新LLM配置');
        return;
      }
      
      if (!this.memoryRef || typeof this.memoryRef.updateLLMConfig !== 'function') {
        console.warn('[Mem0Service] 记忆实例引用不可用或不支持updateLLMConfig');
        return;
      }
      
      console.log('[Mem0Service] 更新LLM配置:', {
        apiProvider: config.apiProvider,
        model: config.model,
        apiKeyLength: config.apiKey?.length || 0
      });
      
      this.memoryRef.updateLLMConfig(config);
      console.log('[Mem0Service] LLM配置已更新成功');
    } catch (error) {
      console.error('[Mem0Service] 更新LLM配置时出错:', error);
    }
  }
  
  /**
   * 更新嵌入器API密钥
   * @param apiKey 智谱API密钥
   */
  public updateEmbedderApiKey(apiKey: string): void {
    try {
      if (!this.initialized) {
        console.warn('[Mem0Service] 记忆服务尚未初始化，无法更新嵌入器API密钥');
        return;
      }
      
      if (!apiKey) {
        console.warn('[Mem0Service] API密钥为空，跳过更新');
        return;
      }
      
      console.log('[Mem0Service] 正在更新嵌入器API密钥', apiKey.length > 0 ? `长度: ${apiKey.length}` : '空API密钥');
      
      // 直接调用记忆实例的方法更新API密钥
      if (this.memoryRef && typeof this.memoryRef.updateEmbedderApiKey === 'function') {
        this.memoryRef.updateEmbedderApiKey(apiKey);
        console.log('[Mem0Service] 成功更新嵌入器API密钥');
        // Reset embedding availability flag
        this.isEmbeddingAvailable = true;
      } else if (this.memoryRef && this.memoryRef.embedder && typeof this.memoryRef.embedder.updateApiKey === 'function') {
        // 如果记忆实例没有专门的方法，尝试直接访问嵌入器
        this.memoryRef.embedder.updateApiKey(apiKey);
        console.log('[Mem0Service] 通过直接访问嵌入器更新API密钥');
        // Reset embedding availability flag
        this.isEmbeddingAvailable = true;
      } else {
        console.warn('[Mem0Service] 记忆实例或嵌入器不支持更新API密钥');
      }
      
      // 保存API密钥到AsyncStorage以便其他地方访问
      this.saveZhipuApiKeyToStorage(apiKey);
    } catch (error) {
      console.error('[Mem0Service] 更新嵌入器API密钥时出错:', error);
    }
  }
  
  /**
   * 将智谱API密钥保存到存储中
   * @param apiKey 智谱API密钥
   */
  private async saveZhipuApiKeyToStorage(apiKey: string): Promise<void> {
    try {
      if (typeof require !== 'undefined') {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const settingsStr = await AsyncStorage.getItem('user_settings');
        
        if (settingsStr) {
          const settings = JSON.parse(settingsStr);
          if (!settings.chat) settings.chat = {};
          
          // 仅在密钥不同时更新
          if (settings.chat.zhipuApiKey !== apiKey) {
            settings.chat.zhipuApiKey = apiKey;
            await AsyncStorage.setItem('user_settings', JSON.stringify(settings));
            console.log('[Mem0Service] 已将智谱API密钥保存到AsyncStorage');
          }
        }
      }
    } catch (error) {
      console.error('[Mem0Service] 保存智谱API密钥到存储失败:', error);
    }
  }
  
  // 允许外部设置处理间隔
  public setProcessingInterval(interval: number): void {
    if (interval < 1) {
      console.warn('[Mem0Service] Invalid processing interval, must be at least 1');
      return;
    }
    
    this.processingInterval = interval;
    console.log(`[Mem0Service] 记忆处理间隔已更新为 ${interval} 轮`);
  }
  
  // 获取当前处理间隔
  public getProcessingInterval(): number {
    return this.processingInterval;
  }
  
  public setMemoryEnabled(enabled: boolean): void {
    this.memoryEnabled = enabled;
    console.log(`[Mem0Service] 记忆系统 ${enabled ? '已启用' : '已禁用'}`);
    
    // 如果禁用，清空所有缓存的消息
    if (!enabled) {
      this.messageCache = {};
      console.log('[Mem0Service] 已清空所有消息缓存');
    }
  }
  
  public isMemoryEnabled(): boolean {
    return this.memoryEnabled;
  }
  
  /**
   * 手动处理当前角色的记忆缓存
   * @param characterId 角色ID（可选，如果不提供则处理当前对话的角色）
   * @param conversationId 会话ID（可选，如果不提供则处理当前对话）
   */
  public async processCurrentMemories(characterId?: string, conversationId?: string): Promise<void> {
    try {
      // 如果没有提供角色ID和会话ID，尝试查找有缓存消息的第一个角色和会话
      if (!characterId || !conversationId) {
        for (const charId of Object.keys(this.messageCache)) {
          if (Object.keys(this.messageCache[charId]).length > 0) {
            characterId = charId;
            conversationId = Object.keys(this.messageCache[charId])[0];
            break;
          }
        }
      }
      
      // 检查指定的角色和会话是否有缓存的消息
      if (!characterId || !conversationId || !this.messageCache[characterId]?.[conversationId]) {
        console.log('[Mem0Service] 没有找到需要处理的消息缓存');
        return;
      }
      
      console.log(`[Mem0Service] 手动处理角色 ${characterId} 的记忆缓存`);
      await this.processMessageCache(characterId, conversationId);
      
      // 重置计数器，确保下次从0开始
      if (this.messageCache[characterId]?.[conversationId]) {
        const pendingUserMessage = this.messageCache[characterId][conversationId].pendingUserMessage;
        this.messageCache[characterId][conversationId].userMessageCount = 0;
        console.log(`[Mem0Service] 手动处理后已重置对话计数，保留待处理用户消息状态: ${pendingUserMessage}`);
      }
      
      console.log(`[Mem0Service] 手动处理完成`);
    } catch (error) {
      console.error('[Mem0Service] 手动处理记忆缓存失败:', error);
      throw error;
    }
  }
  
  /**
   * 处理所有角色的记忆缓存
   */
  public async processAllCharacterMemories(): Promise<void> {
    try {
      const characterIds = Object.keys(this.messageCache);
      if (characterIds.length === 0) {
        console.log('[Mem0Service] 没有需要处理的记忆缓存');
        return;
      }
      
      console.log(`[Mem0Service] 开始处理所有角色的记忆缓存，共 ${characterIds.length} 个角色`);
      
      for (const characterId of characterIds) {
        const conversationIds = Object.keys(this.messageCache[characterId]);
        if (conversationIds.length === 0) continue;
        
        console.log(`[Mem0Service] 处理角色 ${characterId} 的记忆缓存，共 ${conversationIds.length} 个会话`);
        
        for (const conversationId of conversationIds) {
          if (this.messageCache[characterId][conversationId] && 
              this.messageCache[characterId][conversationId].messages.length > 0) {
            await this.processMessageCache(characterId, conversationId);
          }
        }
      }
      
      console.log('[Mem0Service] 所有角色的记忆缓存处理完成');
    } catch (error) {
      console.error('[Mem0Service] 处理所有角色记忆失败:', error);
      throw error;
    }
  }

  /**
   * 创建新记忆
   * @param content 记忆内容
   * @param characterId 角色ID
   * @param conversationId 对话ID
   * @returns 新记忆ID
   */
  public async createMemory(
    content: string, 
    characterId: string, 
    conversationId?: string
  ): Promise<string | null> {
    try {
      this.checkInitialized();
      
      if (!this.memoryActions?.add) {
        throw new Error('添加记忆功能不可用');
      }
      
      if (!content || !characterId) {
        throw new Error('记忆内容和角色ID不能为空');
      }
      
      console.log(`[Mem0Service] 创建新记忆: ${content.substring(0, 50)}...`);
      
      // 检查嵌入服务可用性
      if (!this.isEmbeddingAvailable) {
        console.error('[Mem0Service] 嵌入服务不可用，无法创建记忆');
        throw new Error('嵌入服务不可用，请确保API密钥已正确设置');
      }
      
      // 获取角色特定的命名
      const userName = this.getUserName(characterId);
      const aiName = this.getAIName(characterId);
      
      const timestamp = new Date().toISOString();
      
      // 直接添加为单条记忆，明确标记为手动创建
      const result = await this.memoryActions.add(
        content,
        {
          userId: 'current-user',
          agentId: characterId,
          runId: conversationId || 'manual-creation',
          metadata: {
            timestamp: timestamp,
            source: 'manual-creation',
            isManuallyCreated: true, // 明确标记为手动创建
            role: 'user', // 模拟用户角色，确保被处理
            userName: userName,
            aiName: aiName,
            data: content, // 确保存在data字段
            memory: content, // 同时设置memory字段确保兼容性
            createdAt: timestamp
          }
        },
        false // 不是多轮对话
      );
      
      if (result && result.results && result.results.length > 0) {
        const newMemoryId = result.results[0].id;
        console.log(`[Mem0Service] 成功创建新记忆，ID: ${newMemoryId}`);
        
        // 调试输出，检查返回的结果结构
        console.log(`[Mem0Service] 新记忆结构:`, {
          id: newMemoryId,
          hasMemory: !!result.results[0].memory,
          memoryKeys: Object.keys(result.results[0])
        });
        
        if (result.results[0].metadata) {
          console.log(`[Mem0Service] 新记忆元数据:`, {
            metadataKeys: Object.keys(result.results[0].metadata),
            hasData: !!result.results[0].metadata.data
          });
        }
        
        return newMemoryId;
      } else {
        console.error('[Mem0Service] 创建记忆失败: 无结果返回');
        return null;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Mem0Service] 创建新记忆失败: ${errorMessage}`);
      
      // 检查是否是嵌入器错误，尝试刷新嵌入可用性状态
      if (errorMessage.includes('嵌入') || errorMessage.includes('API密钥')) {
        this.isEmbeddingAvailable = false;
        // 尝试重新获取API密钥
        this.tryGetZhipuApiKey().then(apiKey => {
          if (apiKey) {
            console.log('[Mem0Service] 找到API密钥，标记嵌入服务为可用');
            this.isEmbeddingAvailable = true;
          }
        });
      }
      
      throw error; // 重新抛出错误以便UI层处理
    }
  }

  /**
   * 直接获取角色的所有记忆数据（不使用向量搜索）
   * @param characterId 角色ID
   * @param limit 返回结果数量限制
   * @returns 记忆数据列表
   */
  public async getCharacterMemories(characterId: string, limit: number = 100): Promise<any[]> {
    try {
      this.checkInitialized();

      if (!this.memoryRef || !this.memoryRef.vectorStore) {
        console.log('[Mem0Service] memoryRef或vectorStore不可用，无法获取角色记忆');
        return [];
      }

      console.log(`[Mem0Service] 获取角色 ${characterId} 的所有记忆数据，限制 ${limit} 条`);

      // 直接使用vectorStore的getByCharacterId方法
      const memories = await this.memoryRef.vectorStore.getByCharacterId(characterId, limit);
      console.log(`[Mem0Service] 从向量存储获取到 ${memories.length} 条记忆数据`);

      if (!memories || memories.length === 0) {
        return [];
      }

      // 兼容历史和新格式，确保memory字段存在
      const formattedMemories = memories.map((mem: any) => {
        let memoryContent = '';
        if (mem.memory) {
          memoryContent = mem.memory;
        } else if (mem.payload) {
          // 兼容vectorStore原始返回
          memoryContent = mem.payload.data || mem.payload.memory || '';
        } else if (mem.metadata && mem.metadata.data) {
          memoryContent = mem.metadata.data;
        }
        // 兼容payload结构
        const meta = mem.metadata || mem.payload || {};
        // 确保memory字段存在
        return {
          id: mem.id,
          memory: memoryContent,
          createdAt: mem.createdAt || meta.createdAt,
          updatedAt: mem.updatedAt || meta.updatedAt,
          metadata: meta,
          userId: mem.userId || meta.userId,
          agentId: mem.agentId || meta.agentId,
          runId: mem.runId || meta.runId,
        };
      });

      // 日志输出首条
      if (formattedMemories.length > 0) {
        const sample = formattedMemories[0];
        console.log('[Mem0Service] 记忆数据示例:', {
          id: sample.id,
          memory: sample.memory?.substring(0, 30),
          createdAt: sample.createdAt,
          agentId: sample.agentId,
        });
      }

      return formattedMemories;
    } catch (error) {
      console.error('[Mem0Service] 获取角色记忆数据失败:', error);
      return [];
    }
  }

  /**
   * 更新记忆内容
   * @param memoryId 记忆ID
   * @param content 新内容
   * @returns 更新结果
   */
  public async updateMemory(memoryId: string, content: string): Promise<boolean> {
    try {
      this.checkInitialized();
      
      if (!this.memoryActions?.update) {
        throw new Error('更新记忆功能不可用');
      }
      
      console.log(`[Mem0Service] 更新记忆 ${memoryId}: ${content.substring(0, 50)}...`);
      await this.memoryActions.update(memoryId, content);
      return true;
    } catch (error) {
      console.error('[Mem0Service] 更新记忆失败:', error);
      return false;
    }
  }
  
  /**
   * 删除记忆
   * @param memoryId 记忆ID
   * @returns 删除结果
   */
  public async deleteMemory(memoryId: string): Promise<boolean> {
    try {
      this.checkInitialized();
      
      if (!this.memoryActions?.delete) {
        throw new Error('删除记忆功能不可用');
      }
      
      console.log(`[Mem0Service] 删除记忆 ${memoryId}`);
      await this.memoryActions.delete(memoryId);
      return true;
    } catch (error) {
      console.error('[Mem0Service] 删除记忆失败:', error);
      return false;
    }
  }
  
  /**
   * 获取向量数据库统计信息
   * @returns 数据库统计信息
   */
  public async getVectorDbStats(): Promise<{ totalCount: number, dbSize: number, dbSizeMB: string }> {
    try {
      this.checkInitialized();
      
      if (!this.memoryRef || !this.memoryRef.vectorStore) {
        return { totalCount: 0, dbSize: 0, dbSizeMB: '0' };
      }
      
      const stats = await this.memoryRef.vectorStore.getStats();
      const dbSizeMB = (stats.dbSize / (1024 * 1024)).toFixed(2);
      
      return {
        ...stats,
        dbSizeMB
      };
    } catch (error) {
      console.error('[Mem0Service] 获取向量数据库统计信息失败:', error);
      return { totalCount: 0, dbSize: 0, dbSizeMB: '0' };
    }
  }
  
  /**
   * 获取某角色的记忆数量
   * @param characterId 角色ID
   * @returns 记忆数量
   */
  public async getCharacterMemoryCount(characterId: string): Promise<number> {
    try {
      this.checkInitialized();
      
      if (!this.memoryRef || !this.memoryRef.vectorStore) {
        return 0;
      }
      
      return await this.memoryRef.vectorStore.getCountByCharacterId(characterId);
    } catch (error) {
      console.error('[Mem0Service] 获取角色记忆数量失败:', error);
      return 0;
    }
  }
}

export default Mem0Service;
