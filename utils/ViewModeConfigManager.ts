import AsyncStorage from '@react-native-async-storage/async-storage';

// 视图模式常量
export const VIEW_MODE_SMALL = 'small';
export const VIEW_MODE_LARGE = 'large';
export const VIEW_MODE_VERTICAL = 'vertical';
export const VIEW_MODE_STORAGE_KEY = 'character_view_mode';

export type ViewMode = 'small' | 'large' | 'vertical';

/**
 * 视图模式配置管理器
 */
export class ViewModeConfigManager {
  /**
   * 获取保存的视图模式配置
   * @returns Promise<ViewMode> 返回保存的视图模式，默认为 'large'
   */
  static async getViewMode(): Promise<ViewMode> {
    try {
      const savedViewMode = await AsyncStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (savedViewMode && ['small', 'large', 'vertical'].includes(savedViewMode)) {
        return savedViewMode as ViewMode;
      }
      return VIEW_MODE_LARGE; // 默认值
    } catch (error) {
      console.warn('[ViewModeConfig] 获取视图模式配置失败:', error);
      return VIEW_MODE_LARGE;
    }
  }

  /**
   * 保存视图模式配置
   * @param mode 要保存的视图模式
   */
  static async setViewMode(mode: ViewMode): Promise<void> {
    try {
      await AsyncStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
      console.log('[ViewModeConfig] 保存视图模式配置:', mode);
    } catch (error) {
      console.warn('[ViewModeConfig] 保存视图模式配置失败:', error);
    }
  }

  /**
   * 切换到下一个视图模式
   * @param currentMode 当前视图模式
   * @returns 下一个视图模式
   */
  static getNextViewMode(currentMode: ViewMode): ViewMode {
    if (currentMode === VIEW_MODE_LARGE) return VIEW_MODE_SMALL;
    if (currentMode === VIEW_MODE_SMALL) return VIEW_MODE_VERTICAL;
    return VIEW_MODE_LARGE;
  }

  /**
   * 预加载视图模式配置（用于提升性能）
   */
  static async preloadViewModeConfig(): Promise<void> {
    try {
      await this.getViewMode();
      console.log('[ViewModeConfig] 预加载视图模式配置完成');
    } catch (error) {
      console.warn('[ViewModeConfig] 预加载视图模式配置失败:', error);
    }
  }
}
