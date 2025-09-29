/**
 * 错误恢复工具
 * 帮助在API失败时优雅地处理错误和回退
 */

import { ApiSettings } from '@/shared/types/api-types';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 错误类型枚举
 */
export enum ErrorType {
  API_CONNECTION = 'api_connection',
  AUTHENTICATION = 'authentication',
  RATE_LIMIT = 'rate_limit',
  QUOTA_EXCEEDED = 'quota_exceeded',
  VALIDATION = 'validation',
  PARSING = 'parsing',
  UNKNOWN = 'unknown'
}

/**
 * 错误上下文信息
 */
export interface ErrorContext {
  apiProvider: 'gemini' | 'openrouter';
  endpoint?: string;
  statusCode?: number;
  responseData?: any;
  timestamp: number;
}

/**
 * 缓存键前缀
 */
const ERROR_CACHE_PREFIX = 'api_error_';

/**
 * API错误跟踪和恢复工具
 */
export class ErrorRecoveryManager {
  /**
   * 记录API错误
   */
  static async logError(
    type: ErrorType,
    message: string,
    context: ErrorContext
  ): Promise<void> {
    try {
      const cacheKey = `${ERROR_CACHE_PREFIX}${context.apiProvider}`;
      
      // Get existing errors
      const existingData = await AsyncStorage.getItem(cacheKey);
      const errors = existingData ? JSON.parse(existingData) : [];
      
      // Add new error
      errors.push({
        type,
        message,
        context,
        recovered: false
      });
      
      // Keep only last 20 errors
      const trimmedErrors = errors.slice(-20);
      
      // Save updated errors
      await AsyncStorage.setItem(cacheKey, JSON.stringify(trimmedErrors));
      
      console.log(`【错误恢复】已记录${context.apiProvider}错误: ${type} - ${message}`);
    } catch (e) {
      console.error('保存错误记录失败:', e);
    }
  }
  
  /**
   * 推断API错误类型
   */
  static inferErrorType(error: any, statusCode?: number): ErrorType {
    const message = error?.message || error?.toString() || '';
    
    // Status code based classification
    if (statusCode) {
      if (statusCode === 401 || statusCode === 403) return ErrorType.AUTHENTICATION;
      if (statusCode === 429) return ErrorType.RATE_LIMIT;
      if (statusCode >= 400 && statusCode < 500) return ErrorType.VALIDATION;
      if (statusCode >= 500) return ErrorType.API_CONNECTION;
    }
    
    // Content based classification
    if (/quota|credit|billing|payment|exceed/i.test(message)) {
      return ErrorType.QUOTA_EXCEEDED;
    }
    
    if (/rate|limit|too many|429/i.test(message)) {
      return ErrorType.RATE_LIMIT;
    }
    
    if (/auth|key|permission|token|credential/i.test(message)) {
      return ErrorType.AUTHENTICATION;
    }
    
    if (/connect|timeout|network|unreachable/i.test(message)) {
      return ErrorType.API_CONNECTION;
    }
    
    if (/parse|json|format|syntax/i.test(message)) {
      return ErrorType.PARSING;
    }
    
    return ErrorType.UNKNOWN;
  }
  
  /**
   * 获取推荐的回退动作
   */
  static getRecoveryAction(
    type: ErrorType, 
    apiSettings?: ApiSettings
  ): { action: 'retry' | 'switch_provider' | 'reduce_complexity' | 'display_error' | 'notify_user', message: string } {
    switch (type) {
      case ErrorType.API_CONNECTION:
        return { 
          action: 'retry', 
          message: '连接失败，正在重试...' 
        };
        
      case ErrorType.RATE_LIMIT:
        return { 
          action: 'retry', 
          message: '请求过于频繁，请稍候再试' 
        };
        
      case ErrorType.QUOTA_EXCEEDED:
        return {
          action: apiSettings?.apiProvider === 'openrouter' ? 'switch_provider' : 'notify_user',
          message: apiSettings?.apiProvider === 'openrouter' ? '额度已用完，切换到备用提供商' : '额度已用完，请检查API账户'
        };
        
      case ErrorType.AUTHENTICATION:
        return {
          action: 'notify_user',
          message: 'API密钥无效，请更新API密钥'
        };
        
      case ErrorType.VALIDATION:
      case ErrorType.PARSING:
        return {
          action: 'reduce_complexity',
          message: '请求格式错误，尝试简化请求'
        };
        
      case ErrorType.UNKNOWN:
      default:
        return {
          action: 'display_error',
          message: '发生未知错误'
        };
    }
  }
  
  /**
   * 检查是否应该回退到其他API提供商
   */
  static async shouldFailover(apiProvider: 'gemini' | 'openrouter'): Promise<boolean> {
    try {
      const cacheKey = `${ERROR_CACHE_PREFIX}${apiProvider}`;
      const data = await AsyncStorage.getItem(cacheKey);
      
      if (!data) return false;
      
      const errors = JSON.parse(data);
      const recentErrors = errors.filter((e: any) => 
        Date.now() - e.context.timestamp < 30 * 60 * 1000 // 30分钟内的错误
      );
      
      // 如果30分钟内有3个或以上错误，建议切换提供商
      return recentErrors.length >= 3;
    } catch (e) {
      console.error('检查失败转移条件出错:', e);
      return false;
    }
  }
  
  /**
   * 修复常见的JSON解析错误
   */
  static fixBrokenJson(text: string): string {
    try {
      // Try to parse directly first
      JSON.parse(text);
      return text;
    } catch (e) {
      // 1. Fix common JSON syntax issues
      let fixed = text;
      
      // Fix unquoted property names
      fixed = fixed.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3');
      
      // Fix single quotes instead of double quotes for strings
      fixed = fixed.replace(/([{,]\s*"[^"]+"\s*:\s*)'([^']+)'/g, '$1"$2"');
      
      // Fix trailing commas in objects
      fixed = fixed.replace(/,\s*}/g, '}');
      
      // Fix trailing commas in arrays
      fixed = fixed.replace(/,\s*\]/g, ']');
      
      try {
        // Check if our fixes worked
        JSON.parse(fixed);
        console.log('【错误恢复】成功修复JSON格式');
        return fixed;
      } catch (e) {
        // 2. Extract JSON using regex as a last resort
        const jsonPattern = /\{(?:[^{}]|(?:\{[^{}]*\}))*\}/g;
        const matches = text.match(jsonPattern);
        
        if (matches && matches.length > 0) {
          for (const match of matches) {
            try {
              JSON.parse(match);
              console.log('【错误恢复】通过提取找到有效JSON');
              return match;
            } catch (e) {
              // Continue to next match
            }
          }
        }
        
        // 3. If all else fails, return the original but log the issue
        console.error('【错误恢复】无法修复JSON格式，返回原始文本');
        return text;
      }
    }
  }
}
