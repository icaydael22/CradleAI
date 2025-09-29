/**
 * API配置常量
 * 存储应用程序使用的所有API端点
 */

// 获取环境变量或使用默认值
const getEnvVar = (key: string, defaultValue: string): string => {
  const result = (() => {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key] as string;
    }
    
    // React Native 环境
    if (typeof global !== 'undefined' && (global as any).__ENV && (global as any).__ENV[key]) {
      return (global as any).__ENV[key];
    }
    
    return defaultValue;
  })();
  
  console.log(`API配置: ${key} = ${result}`);
  return result;
};

export const API_CONFIG = {
  // 图像生成服务
  IMAGE_GENERATION_URL: getEnvVar('IMAGE_GENERATION_URL', 'https://image.cradleintro.top/'),
  // License API endpoints - primary and fallbacks
  LICENSE_API_URL: getEnvVar('LICENSE_API_URL', 'https://license.cradleintro.top/api/v1/license/verify'),

  // Base domain for connectivity testing
  LICENSE_SERVER_DOMAIN: 'license.cradleintro.top',

  // cloud service endpoints
  CLOUD_API_URL: getEnvVar('CLOUD_API_URL', 'https://chat.cradleintro.top'),

  
  // chat completion endpoint (used by cloud service)
  CRADLE_CHAT_COMPLETION_ENDPOINT: '/api/chat/completion',
  CRADLE_MODELS_ENDPOINT: '/api/models',
    
  // Add API URLs for various services
  API_URLS: {
    GEMINI: 'https://generativelanguage.googleapis.com/v1beta',
    OPENROUTER: 'https://openrouter.ai/api/v1',
    ZHIPU: 'https://open.bigmodel.cn/api/paas/v4'
  },
  
  // Default timeout for API requests (in milliseconds)
  DEFAULT_TIMEOUT: 30000,

  // Add API configuration logging
  logConfig: () => {
    console.log('========== API 配置 ==========');
    console.log('LICENSE_API_URL:', API_CONFIG.LICENSE_API_URL);
    console.log('LICENSE_SERVER_DOMAIN:', API_CONFIG.LICENSE_SERVER_DOMAIN);
    console.log('IMAGE_GENERATION_URL:', API_CONFIG.IMAGE_GENERATION_URL);
    console.log('CLOUD_API_URL:', API_CONFIG.CLOUD_API_URL);
    console.log('==============================');
  }
};
