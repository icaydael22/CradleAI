import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatSave, Message, ChatHistoryEntity } from '@/shared/types';
import { StorageAdapter } from '../NodeST/nodest/utils/storage-adapter';

/**
 * Service for managing chat saves (save points) using StorageAdapter's backup system
 */
class ChatSaveService {
  private STORAGE_KEY = 'chat_saves';
  
  /**
   * Get all saved chat states
   */
  async getAllSaves(): Promise<ChatSave[]> {
    try {
      const data = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (!data) return [];
      return JSON.parse(data) as ChatSave[];
    } catch (error) {
      console.error('Error loading chat saves:', error);
      return [];
    }
  }
  
  /**
   * Get saves for a specific conversation
   */
  async getSavesForConversation(conversationId: string): Promise<ChatSave[]> {
    const saves = await this.getAllSaves();
    return saves.filter(save => save.conversationId === conversationId);
  }
  
  /**
   * Save the current chat state using StorageAdapter's backup system
   */
  async saveChat(
    conversationId: string, 
    characterId: string,
    characterName: string,
    messages: Message[],
    description: string, 
    thumbnail?: string,
    firstMes?: string // 新增参数
  ): Promise<ChatSave> {
    try {
      // Get existing saves
      const saves = await this.getAllSaves();
      
      // Create backup timestamp
      const timestamp = Date.now();

      // === 修复：如果是空白存档，先清空聊天历史 ===
      let saveMessages = messages;
      if (messages.length === 0) {
        // 构造空白 ChatHistoryEntity
        let emptyHistory: ChatHistoryEntity = {
          name: "Chat History",
          role: "system",
          identifier: "chatHistory",
          parts: []
        };
        // 优先从 StorageAdapter.getFirstMes 获取开场白
        let firstMesToUse = firstMes && firstMes.trim() ? firstMes : undefined;
        if (!firstMesToUse) {
          try {
            firstMesToUse = (await StorageAdapter.getFirstMes(conversationId)) ?? undefined;
          } catch (e) {
            // ignore
          }
        }
        if (!firstMesToUse || !firstMesToUse.trim()) {
          firstMesToUse = 'Hello';
        }
        if (firstMesToUse) {
          emptyHistory.parts = [
            {
              role: "model",
              parts: [{ text: firstMesToUse }],
              is_first_mes: false
            }
          ];
        }
        // 覆盖当前会话的历史
        await StorageAdapter.saveJson(StorageAdapter.getStorageKey(conversationId, '_history'), emptyHistory);
        // 这里saveMessages依然为空，存档内容为[]
      }
      // ===

      // Use StorageAdapter to backup the current chat history
      const backupSuccess = await StorageAdapter.backupChatHistory(conversationId, timestamp);
      
      if (!backupSuccess) {
        throw new Error('Failed to create chat history backup');
      }
      
      // Create new save point with backup timestamp
      const newSave: ChatSave = {
        id: `save_${timestamp}`,
        conversationId,
        characterId,
        characterName,
        timestamp,
        description,
        messageIds: saveMessages.map(m => m.id),
        messages: [...saveMessages], // Create a deep copy of messages
        previewText: this.generatePreviewText(saveMessages),
        thumbnail: thumbnail,
        backupTimestamp: timestamp // Store the backup timestamp for restoration
      };
      
      // Add to saves and store
      const updatedSaves = [newSave, ...saves];
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedSaves));
      
      console.log(`[ChatSaveService] Created save with backup timestamp: ${timestamp}`);
      return newSave;
    } catch (error) {
      console.error('Error saving chat:', error);
      throw error;
    }
  }
  
  /**
   * Delete a save point
   */
  async deleteSave(saveId: string): Promise<boolean> {
    try {
      const saves = await this.getAllSaves();
      const updatedSaves = saves.filter(save => save.id !== saveId);
      
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedSaves));
      return true;
    } catch (error) {
      console.error('Error deleting save:', error);
      return false;
    }
  }
  
  /**
   * Restore chat history from backup using StorageAdapter
   */
  async restoreChatFromBackup(conversationId: string, save: ChatSave): Promise<boolean> {
    try {
      if (!save.backupTimestamp) {
        console.error('[ChatSaveService] Cannot restore - save has no backup timestamp');
        return false;
      }

      console.log(`[ChatSaveService] Restoring chat from backup timestamp: ${save.backupTimestamp}`);

      // Use StorageAdapter to restore from backup
      const restoreSuccess = await StorageAdapter.restoreChatHistoryFromBackup(
        conversationId, 
        save.backupTimestamp
      );

      // === 新增：恢复后主动读取聊天历史并打印日志 ===
      if (restoreSuccess) {
        try {
          const latestHistory = await StorageAdapter.getCleanChatHistory(conversationId);
          console.log(`[ChatSaveService] 恢复后聊天历史消息数: ${latestHistory.length}`);
          latestHistory.slice(0, 3).forEach((msg, idx) => {
            console.log(`[ChatSaveService] 恢复后消息#${idx + 1}: ${msg.role} - ${msg.parts?.[0]?.text?.substring(0, 50)}`);
          });
        } catch (logErr) {
          console.warn('[ChatSaveService] 恢复后读取聊天历史失败:', logErr);
        }
      }
      // ===

      if (!restoreSuccess) {
        console.error('[ChatSaveService] Failed to restore from backup');
        return false;
      }

      console.log(`[ChatSaveService] Successfully restored chat from backup`);
      return true;
    } catch (error) {
      console.error('[ChatSaveService] Error restoring chat from backup:', error);
      return false;
    }
  }

  /**
   * Get chat history backup for export (legacy compatibility)
   */
  async getNodeSTChatHistory(conversationId: string): Promise<ChatHistoryEntity | null> {
    try {
      // Use StorageAdapter to get clean chat history
      const cleanMessages = await StorageAdapter.getCleanChatHistory(conversationId);
      
      if (cleanMessages.length === 0) {
        console.log(`[ChatSaveService] No chat history found for conversation: ${conversationId}`);
        return null;
      }
      
      // Convert to ChatHistoryEntity format for compatibility
      const chatHistory: ChatHistoryEntity = {
        name: "Chat History",
        role: "system", 
        identifier: "chatHistory",
        parts: cleanMessages
      };
      
      console.log(`[ChatSaveService] Retrieved chat history with ${cleanMessages.length} messages`);
      return chatHistory;
    } catch (error) {
      console.error('[ChatSaveService] Error getting chat history:', error);
      return null;
    }
  }

  /**
   * Legacy method for backward compatibility - now uses backup system
   */
  async restoreNodeSTChatHistory(conversationId: string, save: ChatSave): Promise<boolean> {
    // 新增日志
    console.log(`[ChatSaveService] 调用restoreNodeSTChatHistory，conversationId=${conversationId}, saveId=${save.id}`);
    return await this.restoreChatFromBackup(conversationId, save);
  }
  
  /**
   * Add an imported save to the list of saves
   */
  async addImportedSave(importedSave: ChatSave): Promise<ChatSave> {
    try {
      // Get existing saves
      const saves = await this.getAllSaves();
      
      // Ensure the save has a unique ID
      if (!importedSave.id.startsWith('imported_')) {
        importedSave.id = `imported_${Date.now()}_${importedSave.id}`;
      }
      
      // Add metadata for imports if not present
      if (!importedSave.importedAt) {
        importedSave.importedAt = Date.now();
      }
      
      // Add to saves and store
      const updatedSaves = [importedSave, ...saves];
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedSaves));
      
      return importedSave;
    } catch (error) {
      console.error('[ChatSaveService] Error adding imported save:', error);
      throw error;
    }
  }
  
  /**
   * Verify if a save belongs to a specific conversation
   */
  isValidSaveForConversation(save: ChatSave, conversationId: string): boolean {
    return save.conversationId === conversationId;
  }
  
  /**
   * Generate a short preview text from messages
   */
  private generatePreviewText(messages: Message[]): string {
    // Get last 2 messages
    const lastMessages = messages.slice(-2);
    
    // Create preview from last messages
    const preview = lastMessages
      .map(m => {
        const sender = m.sender === 'user' ? 'You' : 'Character';
        const text = m.text.length > 40 ? m.text.substring(0, 40) + '...' : m.text;
        return `${sender}: ${text}`;
      })
      .join(' | ');
      
    return preview || 'Empty conversation';
  }
}

export const chatSaveService = new ChatSaveService();
