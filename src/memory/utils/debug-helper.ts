/**
 * 调试助手工具
 * 提供各种诊断和日志函数
 */

/**
 * 检查初始化状态并记录
 * @param config API配置
 */
export function checkInitialState(config: any) {
  // 检查所有必要字段
  const requiredFields = ['apiProvider', 'characterApiKey'];
  const missingFields = requiredFields.filter(field => !config[field]);
  
  if (missingFields.length > 0) {
    console.warn(`[Mem0初始化] 缺少以下配置字段: ${missingFields.join(', ')}`);
  } else {
    console.log('[Mem0初始化] 配置检查通过，所有基础字段已提供');
  }
  
  // 检查嵌入设置
  if (!config.zhipuApiKey) {
    console.warn('[Mem0初始化] 未提供智谱API密钥，嵌入功能将尝试使用备用向量');
    
    // 尝试从存储中获取密钥
    tryLoadZhipuApiKeyFromStorage().then(apiKey => {
      if (apiKey) {
        console.log('[Mem0初始化] 从存储中恢复智谱API密钥成功，长度:', apiKey.length);
        // 动态更新配置
        config.zhipuApiKey = apiKey;
      } else {
        console.warn('[Mem0初始化] 无法从存储中恢复智谱API密钥');
      }
    });
  } else {
    console.log('[Mem0初始化] 智谱API密钥已提供，长度:', config.zhipuApiKey.length);
  }
}

/**
 * 从存储中尝试加载智谱API密钥
 */
async function tryLoadZhipuApiKeyFromStorage(): Promise<string | null> {
  try {
    // 尝试使用localStorage（Web）
    if (typeof localStorage !== 'undefined') {
      const settingsStr = localStorage.getItem('user_settings');
      if (settingsStr) {
        const settings = JSON.parse(settingsStr);
        if (settings?.chat?.zhipuApiKey) {
          return settings.chat.zhipuApiKey;
        }
      }
    }
    
    // 尝试使用AsyncStorage（React Native）
    if (typeof require !== 'undefined') {
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const settingsStr = await AsyncStorage.getItem('user_settings');
        if (settingsStr) {
          const settings = JSON.parse(settingsStr);
          if (settings?.chat?.zhipuApiKey) {
            return settings.chat.zhipuApiKey;
          }
        }
      } catch (e) {
        console.log('[Mem0初始化] 从AsyncStorage加载失败:', e);
      }
    }
  } catch (error) {
    console.error('[Mem0初始化] 尝试从存储加载智谱API密钥失败:', error);
  }
  return null;
}

/**
 * 记录当前API配置
 * @param config API配置
 */
export function logApiConfig(config: any) {
  console.log('-------------------- Mem0 API 配置 --------------------');
  console.log(`API提供商: ${config.apiProvider || 'gemini'}`);
  console.log(`LLM模型: ${config.apiProvider === 'openrouter' 
    ? config.openrouter?.model || 'openai/gpt-3.5-turbo'
    : 'gemini-2.0-flash-exp'}`);
  
  const apiKey = config.apiProvider === 'openrouter' 
    ? config.openrouter?.apiKey 
    : config.characterApiKey;
  console.log(`API密钥长度: ${apiKey?.length || 0} 字符`);
  
  // 记录智谱嵌入设置
  console.log(`嵌入提供商: 智谱清言`); // 只使用智谱清言
  console.log(`智谱API密钥状态: ${config.zhipuApiKey ? '已设置' : '未设置'}`);
  console.log(`智谱API密钥长度: ${config.zhipuApiKey?.length || 0} 字符`);
  console.log(`智谱嵌入模型: embedding-3`);
  console.log(`嵌入维度: 1024`);
  console.log('-------------------------------------------------------');
}

/**
 * 记录API错误
 * @param error 错误对象
 * @param context 错误上下文
 */
export function logApiError(error: any, context: string): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`[Mem0] ${context}: ${errorMessage}`);
  
  // 针对特定类型的错误提供诊断信息
  if (errorMessage.includes('API key')) {
    console.error('[Mem0] 诊断: API密钥问题，请检查API密钥是否正确设置');
  } else if (errorMessage.includes('429') || errorMessage.includes('rate_limit')) {
    console.error('[Mem0] 诊断: 达到API速率限制，请稍后再试');
  } else if (errorMessage.includes('401') || errorMessage.includes('auth')) {
    console.error('[Mem0] 诊断: 认证失败，请检查API密钥是否有效');
  }
}
