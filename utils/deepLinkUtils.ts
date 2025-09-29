import * as Linking from 'expo-linking';
import Constants from 'expo-constants';

/**
 * 检测当前是否在Expo开发环境中
 */
export const isExpoGo = () => {
  return Constants.appOwnership === 'expo';
};

/**
 * 获取当前环境的深链接scheme
 */
export const getDeepLinkScheme = () => {
  if (isExpoGo()) {
    // 在Expo Go中，使用exp://scheme
    return 'exp';
  }
  // 在独立应用中，使用自定义scheme
  return 'cradleapp';
};

/**
 * 构建深链接URL
 */
export const buildDeepLink = (path: string, params?: Record<string, string>) => {
  const scheme = getDeepLinkScheme();
  
  if (isExpoGo()) {
    // 在Expo Go中，需要包含experience信息
    const experienceUrl = Linking.createURL('');
    const baseUrl = experienceUrl.replace(/\/$/, '');
    
    let url = `${baseUrl}/${path}`;
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }
    return url;
  } else {
    // 在独立应用中，使用标准格式
    let url = `${scheme}://${path}`;
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }
    return url;
  }
};

/**
 * 检查URL是否是我们的深链接
 */
export const isOurDeepLink = (url: string): boolean => {
  if (isExpoGo()) {
    // 在Expo Go中，检查是否包含我们的experience
    const experienceUrl = Linking.createURL('');
    const baseUrl = experienceUrl.replace(/\/$/, '');
    return url.startsWith(baseUrl);
  } else {
    // 在独立应用中，检查scheme
    return url.startsWith('cradleapp://');
  }
};

/**
 * 解析深链接URL，提取路径和参数
 */
export const parseDeepLink = (url: string): { path: string; params: Record<string, string> } | null => {
  try {
    console.log('🔍 Parsing deep link:', url);
    
    if (isExpoGo()) {
      // 在Expo Go中的解析逻辑
      const experienceUrl = Linking.createURL('');
      const baseUrl = experienceUrl.replace(/\/$/, '');
      
      if (url.startsWith(baseUrl)) {
        // 移除base URL部分
        const relativePath = url.replace(baseUrl + '/', '');
        const [path, search] = relativePath.split('?');
        
        const params: Record<string, string> = {};
        if (search) {
          const searchParams = new URLSearchParams(search);
          searchParams.forEach((value, key) => {
            params[key] = value;
          });
        }
        
        console.log('🔍 Expo Go parsed result:', { path, params });
        return { path: path || '', params };
      }
    } else {
      // 在独立应用中的解析逻辑
      if (url.startsWith('cradleapp://')) {
        const urlObj = new URL(url);
        const path = urlObj.pathname.replace(/^\//, ''); // 移除前导斜杠
        
        const params: Record<string, string> = {};
        urlObj.searchParams.forEach((value, key) => {
          params[key] = value;
        });
        
        console.log('🔍 Standalone app parsed result:', { path, params });
        return { path, params };
      }
    }
    
    return null;
  } catch (error) {
    console.error('❌ Failed to parse deep link:', error);
    return null;
  }
};

/**
 * 获取开发环境信息
 */
export const getEnvironmentInfo = () => {
  return {
    isExpoGo: isExpoGo(),
    scheme: getDeepLinkScheme(),
    appOwnership: Constants.appOwnership,
    experienceUrl: isExpoGo() ? Linking.createURL('') : null,
  };
};
