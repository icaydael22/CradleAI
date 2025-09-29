import { ErrorRecoveryManager, ErrorType } from '@/utils/error-recovery';
import { ApiSettings } from '@/shared/types/api-types';

/**
 * API错误中间件
 * 提供统一的错误处理、重试逻辑和回退策略
 */
export class ApiErrorMiddleware {
  /**
   * 使用错误处理和重试机制执行API调用
   * @param apiFunction API调用函数
   * @param fallbackFunction 当API彻底失败时的回退函数
   * @param apiSettings API设置
   * @param maxRetries 最大重试次数
   */
  static async executeWithErrorHandling<T>(
    apiFunction: () => Promise<T>,
    fallbackFunction: () => T,
    apiSettings?: ApiSettings,
    maxRetries: number = 2
  ): Promise<T> {
    let retries = 0;
    let lastError: any = null;
    
    while (retries <= maxRetries) {
      try {
        // 执行主体API调用
        return await apiFunction();
      } catch (error) {
        lastError = error;
        
        // 推断错误类型
        const errorType = ErrorRecoveryManager.inferErrorType(
          error, 
          (error as any)?.statusCode || (error as any)?.status
        );
        
        // 记录错误
        const context = {
          apiProvider: (apiSettings?.apiProvider === 'openai-compatible' ? 'gemini' : apiSettings?.apiProvider) || 'gemini',
          timestamp: Date.now(),
          statusCode: (error as any)?.statusCode || (error as any)?.status,
          responseData: (error as any)?.response
        };
        
        await ErrorRecoveryManager.logError(errorType, 
          `API调用失败 (尝试 ${retries + 1}/${maxRetries + 1})`, 
          context
        );
        
        // 获取推荐恢复动作
        const recovery = ErrorRecoveryManager.getRecoveryAction(errorType, apiSettings);
        
        console.log(`【API错误中间件】错误类型: ${errorType}, 推荐动作: ${recovery.action}, 消息: ${recovery.message}`);
        
        // 基于恢复建议采取行动
        if (recovery.action === 'retry' && retries < maxRetries) {
          // 重试，指数退避策略
          const delay = Math.pow(2, retries) * 1000 + Math.random() * 1000;
          console.log(`【API错误中间件】延迟 ${delay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries++;
          continue;
        } 
        else if (recovery.action === 'switch_provider' && 
                apiSettings?.apiProvider === 'openrouter' && 
                apiSettings.openrouter?.useBackupModels) {
          // 如果设置了备用模型，可以在这里实现模型切换逻辑
          console.log(`【API错误中间件】尝试切换到备用模型...`);
          // 当前简化实现，仍使用重试
          if (retries < maxRetries) {
            retries++;
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
        }
        
        // 其他错误类型或重试已耗尽
        break;
      }
    }
    
    // 所有重试失败，使用回退函数
    console.log(`【API错误中间件】所有重试已耗尽，使用回退方法`);
    console.error('API调用彻底失败:', lastError);
    
    return fallbackFunction();
  }
  
  /**
   * 尝试从无效的JSON响应中提取有效数据
   * @param text 可能包含JSON的文本
   * @param defaultValue 提取失败时的默认值
   */
  static extractJsonSafely<T>(text: string, defaultValue: T): T {
    try {
      // 首先尝试直接解析
      return JSON.parse(text);
    } catch (e) {
      // 失败时尝试修复JSON
      try {
        const fixedJson = ErrorRecoveryManager.fixBrokenJson(text);
        return JSON.parse(fixedJson);
      } catch (e2) {
        // 所有尝试都失败，返回默认值
        console.error('JSON解析失败:', e2);
        return defaultValue;
      }
    }
  }
  
  /**
   * 处理网络错误并返回可读的错误消息
   * @param error 原始错误对象
   */
  static getReadableErrorMessage(error: any): string {
    // 网络错误
    if (error?.message?.includes('Network') || error?.message?.includes('ECONNREFUSED')) {
      return '网络连接失败，请检查您的互联网连接';
    }
    
    // API密钥错误
    if (error?.message?.includes('key') || 
        error?.message?.includes('auth') || 
        error?.status === 401 || 
        error?.statusCode === 401) {
      return 'API密钥无效或已过期，请检查您的设置';
    }
    
    // 超时错误
    if (error?.message?.includes('timeout') || error?.message?.includes('ETIMEDOUT')) {
      return '请求超时，服务器可能繁忙，请稍后再试';
    }
    
    // 配额错误
    if (error?.message?.includes('quota') || error?.message?.includes('rate limit')) {
      return 'API使用配额已用完或达到速率限制，请稍后再试';
    }
    
    // 默认错误消息
    return error?.message || '发生未知错误，请稍后再试';
  }
}
