import { useEffect } from 'react';
import { ViewModeConfigManager } from '@/utils/ViewModeConfigManager';

/**
 * 在应用启动时预加载视图模式配置，避免首次进入时的延迟。
 */
export const usePreloadViewModeConfig = () => {
  useEffect(() => {
    ViewModeConfigManager.preloadViewModeConfig();
  }, []);
};


