import { useState, useEffect, useCallback, useRef } from 'react';
import { MobileMemory } from '../mobile-memory';
import { getDatabasePath } from '../utils/file-system';
import { MemoryConfig, SearchResult, Message, LLMConfig } from '../types';
import { AddMemoryOptions, SearchMemoryOptions } from '../memory.types';

/**
 * 记忆系统 React Hook
 * @param config 记忆配置
 * @returns 记忆系统操作对象
 */
export function useMemory(config: Partial<MemoryConfig> = {}) {
  const [memory, setMemory] = useState<MobileMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // 添加configRef来跟踪配置变化
  const configRef = useRef<Partial<MemoryConfig>>(config);
  const initializedRef = useRef(false);

  // 初始化记忆系统
  useEffect(() => {
    async function initMemory() {
      try {
        console.log('[Mem0] 初始化记忆系统...');
        // 获取适用于移动端的数据库路径
        const historyDbPath = await getDatabasePath('memory_history.db');
        const vectorDbName = 'vector_store.db';
        
        // 创建带有移动端特定路径的记忆实例
        const memoryInstance = new MobileMemory({
          ...config,
          historyDbPath,
          vectorStore: {
            ...config.vectorStore,
            provider: 'mobile_sqlite',
            config: {
              ...config.vectorStore?.config,
              collectionName: config.vectorStore?.config?.collectionName || 'memories',
              dbName: vectorDbName,
            },
          },
        });
        
        console.log('[Mem0] 记忆系统初始化成功');
        setMemory(memoryInstance);
        initializedRef.current = true;
        setLoading(false);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[Mem0] 记忆系统初始化失败: ${errorMessage}`);
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      }
    }
    
    if (!initializedRef.current) {
      configRef.current = config;
      initMemory();
    }
  }, []);

  // 监听配置变化，更新记忆系统的LLM配置
  useEffect(() => {
    if (!memory || !initializedRef.current) return;
    
    // 检查配置是否有实质性变化
    const prevLLMConfig = configRef.current?.llm?.config;
    const newLLMConfig = config?.llm?.config;
    
    const apiKeyChanged = prevLLMConfig?.apiKey !== newLLMConfig?.apiKey;
    const apiProviderChanged = prevLLMConfig?.apiProvider !== newLLMConfig?.apiProvider;
    const modelChanged = prevLLMConfig?.model !== newLLMConfig?.model;
    
    // 仅当关键配置变更时才更新
    if (apiKeyChanged || apiProviderChanged || modelChanged) {
      console.log('[useMemory] 检测到LLM配置变更, 正在更新...');
      console.log(`[useMemory] API密钥变更: ${apiKeyChanged ? '是' : '否'}`);
      console.log(`[useMemory] API提供商变更: ${apiProviderChanged ? '是' : '否'}`);
      console.log(`[useMemory] 模型变更: ${modelChanged ? '是' : '否'}`);
      
      // 更新内部配置引用
      configRef.current = config;
      
      // 更新记忆系统的LLM配置
      if (newLLMConfig && memory.updateLLMConfig) {
        memory.updateLLMConfig(newLLMConfig);
        console.log(`[useMemory] 成功更新LLM配置: 提供商=${newLLMConfig.apiProvider}, 密钥长度=${newLLMConfig.apiKey?.length || 0}`);
      }
    }
  }, [config, memory]);

  /**
   * 添加记忆
   * @param messages 消息内容
   * @param options 添加选项
   * @param isMultiRound 是否为多轮对话
   */
  const addMemory = useCallback(
    async (messages: string | Message[], options: AddMemoryOptions, isMultiRound: boolean = false): Promise<SearchResult> => {
      console.log(`[Mem0] 添加记忆: ${typeof messages === 'string' ? messages.substring(0, 50) + '...' : '消息数组'}, isMultiRound=${isMultiRound}`);
      console.log(`[Mem0] 添加记忆选项:`, JSON.stringify(options));
      
      if (!memory) {
        console.error('[Mem0] 记忆系统未初始化，无法添加记忆');
        throw new Error('记忆系统未初始化');
      }
      
      try {
        const result = await memory.add(messages, options, isMultiRound);
        console.log(`[Mem0] 记忆添加成功，结果条数: ${result.results.length}`);
        if (result.results.length > 0) {
          console.log(`[Mem0] 添加的第一条记忆: ${result.results[0].memory.substring(0, 100)}...`);
        }
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Mem0] 添加记忆失败: ${errorMessage}`);
        throw error;
      }
    },
    [memory]
  );

  /**
   * 搜索记忆
   */
  const searchMemory = useCallback(
    async (query: string, options: SearchMemoryOptions): Promise<SearchResult> => {
      console.log(`[Mem0] 搜索记忆: ${query}`);
      console.log(`[Mem0] 搜索选项:`, JSON.stringify(options));
      
      if (!memory) {
        console.error('[Mem0] 记忆系统未初始化，无法搜索记忆');
        throw new Error('记忆系统未初始化');
      }
      
      try {
        const result = await memory.search(query, options);
        console.log(`[Mem0] 搜索成功，找到 ${result.results.length} 条记忆`);
        result.results.forEach((item, index) => {
          console.log(`[Mem0] 搜索结果 #${index + 1}: ${item.memory.substring(0, 100)}... (相似度: ${item.score?.toFixed(4) || 'N/A'})`);
        });
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Mem0] 搜索记忆失败: ${errorMessage}`);
        throw error;
      }
    },
    [memory]
  );

  /**
   * 获取记忆
   */
  const getMemory = useCallback(
    async (memoryId: string) => {
      console.log(`[Mem0] 获取记忆: ${memoryId}`);
      
      if (!memory) {
        console.error('[Mem0] 记忆系统未初始化，无法获取记忆');
        throw new Error('记忆系统未初始化');
      }
      
      try {
        const result = await memory.get(memoryId);
        if (result) {
          console.log(`[Mem0] 获取记忆成功: ${result.memory.substring(0, 100)}...`);
        } else {
          console.log(`[Mem0] 未找到ID为 ${memoryId} 的记忆`);
        }
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Mem0] 获取记忆失败: ${errorMessage}`);
        throw error;
      }
    },
    [memory]
  );

  /**
   * 更新记忆
   */
  const updateMemory = useCallback(
    async (memoryId: string, data: string) => {
      console.log(`[Mem0] 更新记忆: ${memoryId}`);
      
      if (!memory) {
        console.error('[Mem0] 记忆系统未初始化，无法更新记忆');
        throw new Error('记忆系统未初始化');
      }
      
      try {
        const result = await memory.update(memoryId, data);
        // 修复: update 返回 { message: string } 而不是包含 memory 属性的对象
        console.log(`[Mem0] 更新记忆成功: ${result.message}`);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Mem0] 更新记忆失败: ${errorMessage}`);
        throw error;
      }
    },
    [memory]
  );

  /**
   * 删除记忆
   */
  const deleteMemory = useCallback(
    async (memoryId: string) => {
      console.log(`[Mem0] 删除记忆: ${memoryId}`);
      
      if (!memory) {
        console.error('[Mem0] 记忆系统未初始化，无法删除记忆');
        throw new Error('记忆系统未初始化');
      }
      
      try {
        await memory.delete(memoryId);
        console.log(`[Mem0] 删除记忆成功: ${memoryId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Mem0] 删除记忆失败: ${errorMessage}`);
        throw error;
      }
    },
    [memory]
  );

  /**
   * 获取所有记忆
   */
  const getAllMemories = useCallback(
    async (options: { userId?: string; agentId?: string; runId?: string; limit?: number }) => {
      console.log(`[Mem0] 获取所有记忆`);
      console.log(`[Mem0] 获取记忆选项:`, JSON.stringify(options));
      
      if (!memory) {
        console.error('[Mem0] 记忆系统未初始化，无法获取所有记忆');
        throw new Error('记忆系统未初始化');
      }
      
      try {
        const result = await memory.getAll(options);
        // 修复: 使用 result.results.length 而不是 result.length
        console.log(`[Mem0] 获取所有记忆成功，结果条数: ${result.results.length}`);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Mem0] 获取所有记忆失败: ${errorMessage}`);
        throw error;
      }
    },
    [memory]
  );

  /**
   * 重置记忆系统
   */
  const resetMemory = useCallback(async () => {
    console.log(`[Mem0] 重置记忆系统`);
    
    if (!memory) {
      console.error('[Mem0] 记忆系统未初始化，无法重置记忆系统');
      throw new Error('记忆系统未初始化');
    }
    
    try {
      await memory.reset();
      console.log(`[Mem0] 重置记忆系统成功`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Mem0] 重置记忆系统失败: ${errorMessage}`);
      throw error;
    }
  }, [memory]);

  return {
    memory,
    loading,
    error,
    addMemory,
    searchMemory,
    getMemory,
    updateMemory,
    deleteMemory,
    getAllMemories,
    resetMemory
  };
}
