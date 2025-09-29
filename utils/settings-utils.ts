import { GlobalSettings } from '@/shared/types';
import { Platform } from 'react-native';

/**
 * Get user settings synchronously (for services that can't use async/await)
 */
export const getUserSettingsSync = (): GlobalSettings | null => {
  try {
    // On web, we can use localStorage
    if (Platform.OS === 'web') {
      const settingsStr = localStorage.getItem('user_settings');
      if (settingsStr) {
        return JSON.parse(settingsStr);
      }
    }
    
    // For other platforms - this won't work synchronously
    // But returning null will allow fallbacks to work
    return null;
  } catch (error) {
    console.warn('Error getting user settings synchronously:', error);
    return null;
  }
};

/**
 * Get API provider synchronously
 */
export const getApiProviderSync = (): 'gemini' | 'openrouter' => {
  const settings = getUserSettingsSync();
  return (settings?.chat?.apiProvider as 'gemini' | 'openrouter') || 'gemini';
};

/**
 * Check if OpenRouter is enabled
 */
export const isOpenRouterEnabledSync = (): boolean => {
  const settings = getUserSettingsSync();
  return settings?.chat?.apiProvider === 'openrouter' && 
         settings?.chat?.openrouter?.enabled === true;
};

/**
 * Get OpenRouter model synchronously
 */
export const getOpenRouterModelSync = (): string => {
  const settings = getUserSettingsSync();
  return settings?.chat?.openrouter?.model || 'openai/gpt-3.5-turbo';
};
