import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { ChatSave, ChatHistoryEntity } from '@/shared/types';
import { chatSaveService } from './ChatSaveService';
import { NodeSTManager } from '@/utils/NodeSTManager';

/**
 * Service for exporting and importing chat histories
 */
class ChatExportService {
  /**
   * Export a chat save to a file
   * @param save The chat save to export
   */
  async exportChatSave(save: ChatSave): Promise<boolean> {
    try {
      // Create export data object
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        save: {
          ...save,
          // Make sure we include nodestChatHistory in the export
          nodestChatHistory: save.nodestChatHistory || await this.fetchChatHistory(save.conversationId)
        }
      };
      
      // Convert to JSON string
      const jsonString = JSON.stringify(exportData, null, 2);
      
      // Create filename
      const characterName = save.characterName.replace(/[^a-zA-Z0-9]/g, '_');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${characterName}_chat_${timestamp}.json`;
      
      // Create temporary file
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, jsonString);
      
      // Check if sharing is available
      const isSharingAvailable = await Sharing.isAvailableAsync();
      
      if (isSharingAvailable) {
        // Share the file
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Export Chat Save',
          UTI: 'public.json'
        });
        
        console.log('[ChatExportService] Chat successfully exported');
        return true;
      } else {
        console.error('[ChatExportService] Sharing is not available on this device');
        return false;
      }
    } catch (error) {
      console.error('[ChatExportService] Error exporting chat save:', error);
      return false;
    }
  }
  
  /**
   * Import a chat save from a file
   */
  async importChatSave(): Promise<ChatSave | null> {
    try {
      // Open document picker
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true
      });
      
      // Check if file was picked
      if (result.canceled || !result.assets || result.assets.length === 0) {
        console.log('[ChatExportService] No file selected');
        return null;
      }
      
      const file = result.assets[0];
      
      // Read file contents
      const fileContent = await FileSystem.readAsStringAsync(file.uri);
      
      // Parse JSON
      const importData = JSON.parse(fileContent);
      
      // Validate imported data
      if (!importData || !importData.save || !importData.save.conversationId) {
        console.error('[ChatExportService] Invalid import file format');
        return null;
      }
      
      // Extract the save data
      const importedSave: ChatSave = importData.save;
      
      // Generate a new ID for the imported save to avoid conflicts
      importedSave.id = `imported_${Date.now()}`;
      
      // Add to local saves
      const updatedSave = await chatSaveService.addImportedSave(importedSave);
      
      console.log('[ChatExportService] Chat save imported successfully');
      return updatedSave;
    } catch (error) {
      console.error('[ChatExportService] Error importing chat save:', error);
      return null;
    }
  }
  
  /**
   * Fetch chat history for a conversation if not already included in save
   */
  private async fetchChatHistory(conversationId: string): Promise<ChatHistoryEntity | null> {
    try {
      return await chatSaveService.getNodeSTChatHistory(conversationId);
    } catch (error) {
      console.error('[ChatExportService] Error fetching chat history:', error);
      return null;
    }
  }
}

export const chatExportService = new ChatExportService();
