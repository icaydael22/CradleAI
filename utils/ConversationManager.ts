import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 对话管理工具 - 提供对话选择和记忆功能
 */
export class ConversationManager {
  /**
   * 选择一个会话并记住它
   * @param conversationId 会话ID
   * @returns 是否成功选择
   */
  static async selectConversation(conversationId: string): Promise<boolean> {
    try {
      if (!conversationId) {
        return false;
      }
      
      console.log('[ConversationManager] 选择会话:', conversationId);
      
      // 保存为最后使用的会话
      await AsyncStorage.setItem('lastConversationId', conversationId);
      
      // 在全局状态中设置当前会话
      window.currentConversationId = conversationId;
      
      return true;
    } catch (error) {
      console.error('[ConversationManager] 选择会话失败:', error);
      return false;
    }
  }

  /**
   * 获取上次选择的会话
   * @returns 会话ID或null
   */
  static async getLastConversation(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem('lastConversationId');
    } catch (error) {
      console.error('[ConversationManager] 获取上次会话失败:', error);
      return null;
    }
  }
}

// 声明全局变量
declare global {
  interface Window {
    currentConversationId?: string;
  }
}
