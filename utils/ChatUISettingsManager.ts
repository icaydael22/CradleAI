/**
 * ChatUISettingsManager - 管理聊天UI设置的加载和更新
 * 替代轮询机制，使用事件驱动的方式
 */

import * as FileSystem from 'expo-file-system';
import { DeviceEventEmitter } from 'react-native';
import { ChatUISettings } from '@/app/pages/chat-ui-settings';

export class ChatUISettingsManager {
  private static instance: ChatUISettingsManager | null = null;
  private settingsFile: string;
  private lastModifiedTime: number = 0;

  private constructor() {
    this.settingsFile = `${FileSystem.documentDirectory}chat_ui_settings.json`;
  }

  public static getInstance(): ChatUISettingsManager {
    if (!ChatUISettingsManager.instance) {
      ChatUISettingsManager.instance = new ChatUISettingsManager();
    }
    return ChatUISettingsManager.instance;
  }

  /**
   * 加载设置文件
   */
  public async loadSettings(): Promise<ChatUISettings | null> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(this.settingsFile);
      if (fileInfo.exists) {
        const fileContent = await FileSystem.readAsStringAsync(this.settingsFile);
        const settings = JSON.parse(fileContent);
        
        // 更新最后修改时间
        this.lastModifiedTime = fileInfo.modificationTime || 0;
        
        return settings;
      }
    } catch (error) {
      console.warn('[ChatUISettingsManager] Failed to load settings:', error);
    }
    return null;
  }

  /**
   * 保存设置文件并触发更新事件
   */
  public async saveSettings(settings: ChatUISettings): Promise<boolean> {
    try {
      const content = JSON.stringify(settings, null, 2);
      await FileSystem.writeAsStringAsync(this.settingsFile, content);
      
      // 触发设置更新事件
      DeviceEventEmitter.emit('chatUISettingsChanged');
      
      return true;
    } catch (error) {
      console.error('[ChatUISettingsManager] Failed to save settings:', error);
      return false;
    }
  }

  /**
   * 检查文件是否有更新（用于从其他地方调用）
   */
  public async checkForUpdates(): Promise<boolean> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(this.settingsFile);
      if (fileInfo.exists && fileInfo.modificationTime) {
        const hasUpdates = fileInfo.modificationTime > this.lastModifiedTime;
        if (hasUpdates) {
          this.lastModifiedTime = fileInfo.modificationTime;
          DeviceEventEmitter.emit('chatUISettingsChanged');
        }
        return hasUpdates;
      }
    } catch (error) {
      console.warn('[ChatUISettingsManager] Failed to check for updates:', error);
    }
    return false;
  }

  /**
   * 手动触发设置重新加载（用于外部调用）
   */
  public triggerReload(): void {
    DeviceEventEmitter.emit('chatUISettingsChanged');
  }
}

export default ChatUISettingsManager;
