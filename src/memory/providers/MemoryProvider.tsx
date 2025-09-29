import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MobileMemory } from '../mobile-memory';
import { 
  MemoryConfig, 
  MemoryItem, 
  SearchFilters, 
  SearchResult,
  LLMConfig
} from '../types';
import {
  AddMemoryOptions,
  SearchMemoryOptions,
  DeleteAllMemoryOptions,
  GetAllMemoryOptions
} from '../memory.types';
import { ConfigManager } from '../config/manager';
import { useUser } from '@/constants/UserContext';
import Mem0Service from '@/src/memory/services/Mem0Service';

const SETTINGS_STORAGE_KEY = 'MemoryProcessingControl:settings'; // 新增

interface MemoryContextType {
  loading: boolean;
  error: Error | null;
  memory?: MobileMemory; // 暴露 memory 引用以便访问 updateLLMConfig
  addMemory: (messages: string | any[], options: AddMemoryOptions, isMultiRound?: boolean) => Promise<SearchResult>;
  searchMemory: (query: string, options: SearchMemoryOptions) => Promise<SearchResult>;
  getMemory: (memoryId: string) => Promise<MemoryItem | null>;
  updateMemory: (memoryId: string, data: string) => Promise<{ message: string }>;
  deleteMemory: (memoryId: string) => Promise<{ message: string }>;
  deleteAllMemory: (options: DeleteAllMemoryOptions) => Promise<{ message: string }>;
  resetMemory: () => Promise<void>;
  getAllMemory: (options: GetAllMemoryOptions) => Promise<SearchResult>;
  setMemoryProcessingInterval: (rounds: number) => void;
  getMemoryProcessingInterval: () => number;
}

const MemoryContext = createContext<MemoryContextType | undefined>(undefined);

interface MemoryProviderProps {
  children: React.ReactNode;
  config?: Partial<MemoryConfig>;
}

// Create a singleton configuration to prevent constant re-creation
let singletonMemoryInstance: MobileMemory | null = null;
let lastConfigReference = null;

export const MemoryProvider: React.FC<MemoryProviderProps> = ({ children, config }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [memory, setMemory] = useState<MobileMemory | undefined>(undefined);
  const { user } = useUser();
  
  // Track initialization state at module level
  const isInitializedRef = useRef(false);
  
  // Track API key changes with refs
  const zhipuApiKeyRef = useRef<string>('');
  const llmConfigRef = useRef<LLMConfig | null>(null);
  const hasLoggedSkipMessage = useRef(false);
  
  // Create a stable configuration reference to break update cycles
  const configRef = useRef(config);
  
  // --- 修改：初始化时从本地读取 interval 设置 ---
  const [memoryProcessingInterval, setMemoryProcessingInterval] = useState<number>(10);
  useEffect(() => {
    (async () => {
      try {
        const saved = typeof localStorage !== 'undefined'
          ? localStorage.getItem(SETTINGS_STORAGE_KEY)
          : (typeof require !== 'undefined'
              ? await require('@react-native-async-storage/async-storage').default.getItem(SETTINGS_STORAGE_KEY)
              : null);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed.currentInterval === 'number') {
            setMemoryProcessingInterval(parsed.currentInterval);
            console.log(`[MemoryProvider] Loaded memoryProcessingInterval from storage: ${parsed.currentInterval}`);
          }
        }
      } catch (e) {
        console.warn('[MemoryProvider] Failed to load memoryProcessingInterval from storage', e);
      }
    })();
  }, []);
  // --- end ---

  // Compare configuration and only update the ref if there are significant changes
  useEffect(() => {
    // Deep comparison of important config fields
    if (configRef.current !== config) {
      const currentEmbedderKey = configRef.current?.embedder?.config?.apiKey;
      const newEmbedderKey = config?.embedder?.config?.apiKey;
      
      const currentLlmKey = configRef.current?.llm?.config?.apiKey;
      const newLlmKey = config?.llm?.config?.apiKey;
      
      const currentProvider = configRef.current?.llm?.config?.apiProvider;
      const newProvider = config?.llm?.config?.apiProvider;
      
      // Only update reference if important fields changed
      if (currentEmbedderKey !== newEmbedderKey || 
          currentLlmKey !== newLlmKey || 
          currentProvider !== newProvider) {
        configRef.current = config;
      }
    }
  }, [config]);
  
  // Get user settings directly from AsyncStorage at initialization
  const fetchStoredZhipuApiKey = useCallback(async (): Promise<string | null> => {
    try {
      // Try localStorage first (web environment)
      if (typeof localStorage !== 'undefined') {
        const settingsStr = localStorage.getItem('user_settings');
        if (settingsStr) {
          const settings = JSON.parse(settingsStr);
          const apiKey = settings?.chat?.zhipuApiKey;
          if (apiKey) {
            console.log('[MemoryProvider] Found Zhipu API key in localStorage:', apiKey.length > 0 ? `Length: ${apiKey.length}` : 'Empty');
            return apiKey;
          }
        }
      }
      
      // Try AsyncStorage (React Native environment)
      if (typeof require !== 'undefined') {
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          const settingsStr = await AsyncStorage.getItem('user_settings');
          if (settingsStr) {
            const settings = JSON.parse(settingsStr);
            const apiKey = settings?.chat?.zhipuApiKey;
            if (apiKey) {
              console.log('[MemoryProvider] Found Zhipu API key in AsyncStorage:', apiKey.length > 0 ? `Length: ${apiKey.length}` : 'Empty');
              return apiKey;
            }
          }
        } catch (e) {
          console.error('[MemoryProvider] Error accessing AsyncStorage:', e);
        }
      }
    } catch (error) {
      console.error('[MemoryProvider] Error fetching stored Zhipu API key:', error);
    }
    return null;
  }, []);
  
  // Initialize memory only when necessary
  useEffect(() => {
    // Skip initialization if already done
    if (isInitializedRef.current && memory === singletonMemoryInstance) {
      if (!hasLoggedSkipMessage.current) {
        console.log('[MemoryProvider] Memory already initialized, skipping');
        hasLoggedSkipMessage.current = true;
      }
      return;
    }
    
    const initializeMemory = async () => {
      try {
        setLoading(true);
        
        // First try to get the API key from user context
        let zhipuApiKey = user?.settings?.chat?.zhipuApiKey || '';
        
        // If not found or empty, try to get from storage directly
        if (!zhipuApiKey) {
          console.log('[MemoryProvider] No Zhipu API key in user context, checking storage');
          const storedKey = await fetchStoredZhipuApiKey();
          if (storedKey) {
            console.log('[MemoryProvider] Using Zhipu API key from storage');
            zhipuApiKey = storedKey;
          }
        } else {
          console.log('[MemoryProvider] Using Zhipu API key from user context, length:', zhipuApiKey.length);
        }
        
        // Check for significant API key changes
        const apiKeyChanged = zhipuApiKeyRef.current !== zhipuApiKey;
        
        // If memory exists and API key hasn't changed, use existing instance
        if (singletonMemoryInstance && !apiKeyChanged) {
          console.log('[MemoryProvider] Using existing memory instance');
          
          // Even if we're reusing the instance, update the embedded API key if available
          if (zhipuApiKey && singletonMemoryInstance.embedder?.updateApiKey) {
            try {
              console.log('[MemoryProvider] Updating embedder API key in existing instance');
              singletonMemoryInstance.embedder.updateApiKey(zhipuApiKey);
            } catch (error) {
              console.warn('[MemoryProvider] Failed to update embedder API key:', error);
            }
          }
          
          setMemory(singletonMemoryInstance);
          setLoading(false);
          isInitializedRef.current = true;
          return;
        }
        
        // Reset logging state for new initialization
        hasLoggedSkipMessage.current = false;
        
        // Update API key reference
        zhipuApiKeyRef.current = zhipuApiKey;
        
        // Save API key to storage
        try {
          // 尝试使用localStorage（Web）
          if (typeof localStorage !== 'undefined') {
            // 先获取现有设置
            const existingSettingsStr = localStorage.getItem('user_settings');
            const existingSettings = existingSettingsStr ? JSON.parse(existingSettingsStr) : {};
            
            // 更新智谱API密钥
            const updatedSettings = {
              ...existingSettings,
              chat: {
                ...(existingSettings.chat || {}),
                zhipuApiKey
              }
            };
            
            // 保存回localStorage
            localStorage.setItem('user_settings', JSON.stringify(updatedSettings));
            console.log('[MemoryProvider] 已保存智谱API密钥到localStorage');
          }
          
          // 尝试使用AsyncStorage（React Native）
          if (typeof require !== 'undefined') {
            try {
              const AsyncStorage = require('@react-native-async-storage/async-storage').default;
              const existingSettingsStr = await AsyncStorage.getItem('user_settings');
              const existingSettings = existingSettingsStr ? JSON.parse(existingSettingsStr) : {};
              
              const updatedSettings = {
                ...existingSettings,
                chat: {
                  ...(existingSettings.chat || {}),
                  zhipuApiKey
                }
              };
              
              await AsyncStorage.setItem('user_settings', JSON.stringify(updatedSettings));
              console.log('[MemoryProvider] 已保存智谱API密钥到AsyncStorage');
            } catch (e) {
              console.log('[MemoryProvider] 保存到AsyncStorage失败:', e);
            }
          }
        } catch (storageError) {
          console.warn('[MemoryProvider] 保存API密钥到存储失败:', storageError);
          // 继续执行，不中断主流程
        }
        
        // Merge configuration
        const mergedConfig = ConfigManager.mergeConfig(configRef.current || {});
        
        // Configure Zhipu embedding
        console.log('[MemoryProvider] Configuring Zhipu embedding service, API key length:', zhipuApiKey.length);
        mergedConfig.embedder = {
          provider: 'zhipu',
          config: {
            apiKey: zhipuApiKey,
            model: 'embedding-3',
            dimensions: 1024,
            url: 'https://open.bigmodel.cn/api/paas/v4/embeddings'
          }
        };
        
        // Set vector store dimension
        mergedConfig.vectorStore.config.dimension = 1024;
        
        // Reset existing memory instance if needed
        if (singletonMemoryInstance) {
          try {
            console.log('[MemoryProvider] Resetting existing memory instance');
            await singletonMemoryInstance.reset();
          } catch (resetErr) {
            console.warn('[MemoryProvider] Reset failed:', resetErr);
          }
        }
        
        // Create new memory instance
        console.log('[MemoryProvider] Creating new memory instance');
        singletonMemoryInstance = new MobileMemory(mergedConfig);
        setMemory(singletonMemoryInstance);
        isInitializedRef.current = true;
        setLoading(false);
      } catch (err) {
        console.error('[MemoryProvider] Memory initialization failed:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      }
    };
    
    initializeMemory();
  }, [user?.settings?.chat?.zhipuApiKey, fetchStoredZhipuApiKey]); // Only depend on zhipu API key

  // Pass the processing interval to memory service after initialization
  useEffect(() => {
    if (isInitializedRef.current && memory) {
      // Update the processing interval in Mem0Service when it changes
      const mem0Service = Mem0Service.getInstance();
      if (mem0Service) {
        mem0Service.setProcessingInterval(memoryProcessingInterval);
        console.log(`[MemoryProvider] Updated memory processing interval to ${memoryProcessingInterval} rounds`);
        
        // Use type assertion to avoid TypeScript error
        // This is an alternative solution if you don't want to modify MobileMemory class
        if ((memory as any).setProcessingInterval) {
          (memory as any).setProcessingInterval(memoryProcessingInterval);
        }
      }
    }
  }, [memoryProcessingInterval, memory, isInitializedRef.current]);

  // Update LLM config when API settings change
  useEffect(() => {
    if (!memory || !singletonMemoryInstance) return;
    
    // Get current settings
    const apiProvider = user?.settings?.chat?.apiProvider || 'gemini';
    const apiKey = apiProvider === 'openrouter' 
      ? user?.settings?.chat?.openrouter?.apiKey 
      : user?.settings?.chat?.characterApiKey;
    
    const model = apiProvider === 'openrouter'
      ? user?.settings?.chat?.openrouter?.model || 'openai/gpt-3.5-turbo'
      : 'gemini-2.0-flash-exp';
    
    // Check if config has changed from last update
    const hasChanged = 
      llmConfigRef.current?.apiKey !== apiKey ||
      llmConfigRef.current?.apiProvider !== apiProvider ||
      llmConfigRef.current?.model !== model;
    
    if (hasChanged && apiKey) {
      console.log('[MemoryProvider] API configuration changed, updating LLM config');
      
      // Create new config
      const newLLMConfig: LLMConfig = {
        apiKey,
        model,
        apiProvider,
        openrouter: apiProvider === 'openrouter' ? {
          enabled: true,
          apiKey: user?.settings?.chat?.openrouter?.apiKey || '',
          model: user?.settings?.chat?.openrouter?.model || 'openai/gpt-3.5-turbo',
          useBackupModels: user?.settings?.chat?.openrouter?.useBackupModels || false,
          backupModels: user?.settings?.chat?.openrouter?.backupModels || []
        } : undefined
      };
      
      // Update memory's LLM config
      memory.updateLLMConfig(newLLMConfig);
      
      // Save reference for comparison
      llmConfigRef.current = newLLMConfig;
    }
  }, [
    memory,
    user?.settings?.chat?.apiProvider,
    user?.settings?.chat?.characterApiKey,
    user?.settings?.chat?.openrouter?.apiKey,
    user?.settings?.chat?.openrouter?.model
  ]);

  // Create memory operations with useCallback to maintain stable function references
  const addMemory = useCallback(async (messages: string | any[], options: AddMemoryOptions, isMultiRound: boolean = false) => {
    if (!memory) throw new Error('Memory system not initialized');
    return await memory.add(messages, options, isMultiRound);
  }, [memory]);

  const searchMemory = useCallback(async (query: string, options: SearchMemoryOptions) => {
    if (!memory) throw new Error('Memory system not initialized');
    return await memory.search(query, options);
  }, [memory]);

  const getMemory = useCallback(async (memoryId: string) => {
    if (!memory) throw new Error('Memory system not initialized');
    return await memory.get(memoryId);
  }, [memory]);

  const updateMemory = useCallback(async (memoryId: string, data: string) => {
    if (!memory) throw new Error('Memory system not initialized');
    return await memory.update(memoryId, data);
  }, [memory]);

  const deleteMemory = useCallback(async (memoryId: string) => {
    if (!memory) throw new Error('Memory system not initialized');
    return await memory.delete(memoryId);
  }, [memory]);

  const deleteAllMemory = useCallback(async (options: DeleteAllMemoryOptions) => {
    if (!memory) throw new Error('Memory system not initialized');
    return await memory.deleteAll(options);
  }, [memory]);

  const resetMemory = useCallback(async () => {
    if (!memory) throw new Error('Memory system not initialized');
    return await memory.reset();
  }, [memory]);

  const getAllMemory = useCallback(async (options: GetAllMemoryOptions) => {
    if (!memory) throw new Error('Memory system not initialized');
    return await memory.getAll(options);
  }, [memory]);

  // Add callback to set memory processing interval
  const handleSetMemoryProcessingInterval = useCallback((rounds: number) => {
    if (rounds >= 1 && rounds <= 100) {
      setMemoryProcessingInterval(rounds);
    } else {
      console.warn(`[MemoryProvider] Invalid processing interval: ${rounds}. Must be between 1 and 100.`);
    }
  }, []);

  // Add callback to get current memory processing interval
  const handleGetMemoryProcessingInterval = useCallback(() => {
    return memoryProcessingInterval;
  }, [memoryProcessingInterval]);

  // Create a stable context value with useMemo
  const contextValue = useMemo(() => ({
    loading,
    error,
    memory,
    addMemory,
    searchMemory,
    getMemory,
    updateMemory,
    deleteMemory,
    deleteAllMemory,
    resetMemory,
    getAllMemory,
    setMemoryProcessingInterval: handleSetMemoryProcessingInterval,
    getMemoryProcessingInterval: handleGetMemoryProcessingInterval,
  }), [
    loading,
    error,
    memory,
    addMemory,
    searchMemory,
    getMemory,
    updateMemory,
    deleteMemory,
    deleteAllMemory,
    resetMemory,
    getAllMemory,
    handleSetMemoryProcessingInterval,
    handleGetMemoryProcessingInterval,
  ]);

  return (
    <MemoryContext.Provider value={contextValue}>
      {children}
    </MemoryContext.Provider>
  );
};

export const useMemoryContext = () => {
  const context = useContext(MemoryContext);
  if (context === undefined) {
    throw new Error('useMemoryContext must be used within a MemoryProvider');
  }
  return context;
};
