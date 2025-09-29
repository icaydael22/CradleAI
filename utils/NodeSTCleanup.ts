import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

/**
 * NodeST Cleanup Utility
 * This utility helps clean up stored NodeST data when experiencing storage issues
 */
export class NodeSTCleanup {
  /**
   * Deletes all NodeST character data from AsyncStorage
   * @returns Promise<boolean> indicating success or failure
   */
  static async cleanupAllNodeSTData(): Promise<boolean> {
    try {
      console.log('[NodeSTCleanup] Starting cleanup process...');
      
      // Get all AsyncStorage keys
      const allKeys = await AsyncStorage.getAllKeys();
      
      // Filter for NodeST-related keys
      const nodestKeys = allKeys.filter(key => key.startsWith('nodest_'));
      
      console.log(`[NodeSTCleanup] Found ${nodestKeys.length} NodeST-related keys`);
      
      if (nodestKeys.length === 0) {
        console.log('[NodeSTCleanup] No NodeST data found to clean up');
        return true;
      }

      // Extract character IDs for reporting
      const characterIds = new Set<string>();
      nodestKeys.forEach(key => {
        const match = key.match(/^nodest_([^_]+)/);
        if (match && match[1]) {
          characterIds.add(match[1]);
        }
      });
      
      // Remove all NodeST data
      await AsyncStorage.multiRemove(nodestKeys);
      
      console.log('[NodeSTCleanup] Successfully removed all NodeST data', {
        keysRemoved: nodestKeys.length,
        charactersAffected: characterIds.size,
        characterIds: Array.from(characterIds)
      });
      return true;
    } catch (error) {
      console.error('[NodeSTCleanup] Error during cleanup:', error);
      return false;
    }
  }

  /**
   * Deletes NodeST data for a specific character
   * @param characterId The ID of the character to delete
   * @returns Promise<boolean> indicating success or failure
   */
  static async cleanupCharacterData(characterId: string): Promise<boolean> {
    try {
      console.log(`[NodeSTCleanup] Starting cleanup for character ${characterId}...`);
      
      // Get all AsyncStorage keys
      const allKeys = await AsyncStorage.getAllKeys();
      
      // Filter for this character's NodeST-related keys
      const characterKeys = allKeys.filter(key => key.startsWith(`nodest_${characterId}`));
      
      console.log(`[NodeSTCleanup] Found ${characterKeys.length} keys for character ${characterId}:`, {
        keys: characterKeys
      });
      
      if (characterKeys.length === 0) {
        console.log(`[NodeSTCleanup] No data found for character ${characterId}`);
        return true;
      }
      
      // Remove this character's data
      await AsyncStorage.multiRemove(characterKeys);
      
      console.log(`[NodeSTCleanup] Successfully removed data for character ${characterId}`);
      return true;
    } catch (error) {
      console.error(`[NodeSTCleanup] Error during cleanup for character ${characterId}:`, error);
      return false;
    }
  }

  /**
   * Shows an alert to confirm data deletion and performs cleanup if confirmed
   */
  static async showCleanupConfirmation(): Promise<void> {
    return new Promise((resolve) => {
      // First check how many items will be affected
      AsyncStorage.getAllKeys().then(allKeys => {
        const nodestKeys = allKeys.filter(key => key.startsWith('nodest_'));
        const characterIds = new Set<string>();
        
        nodestKeys.forEach(key => {
          const match = key.match(/^nodest_([^_]+)/);
          if (match && match[1]) {
            characterIds.add(match[1]);
          }
        });
        
        // Now show confirmation with count information
        Alert.alert(
          "清理 NodeST 数据",
          `此操作将删除${characterIds.size}个角色的对话历史和设定数据（共${nodestKeys.length}条记录）。\n\n此操作无法撤销，确定要继续吗？`,
          [
            {
              text: "取消",
              style: "cancel",
              onPress: () => resolve()
            },
            {
              text: "确定删除",
              style: "destructive",
              onPress: async () => {
                const success = await NodeSTCleanup.cleanupAllNodeSTData();
                if (success) {
                  Alert.alert(
                    "清理完成", 
                    `已成功删除${characterIds.size}个角色的数据。\n\n您现在可以重新创建角色了。`
                  );
                } else {
                  Alert.alert(
                    "清理失败",
                    "删除数据时出现错误。请尝试重启应用后再试。"
                  );
                }
                resolve();
              }
            }
          ]
        );
      }).catch(err => {
        console.error("Error getting keys:", err);
        Alert.alert("错误", "获取数据时出错，请重试");
        resolve();
      });
    });
  }

  /**
   * Shows storage usage statistics
   */
  static async getStorageStats(): Promise<{
    totalKeys: number;
    nodestKeys: number;
    characters: number;
  }> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const nodestKeys = allKeys.filter(key => key.startsWith('nodest_'));
      
      const characterIds = new Set<string>();
      nodestKeys.forEach(key => {
        const match = key.match(/^nodest_([^_]+)/);
        if (match && match[1]) {
          characterIds.add(match[1]);
        }
      });

      return {
        totalKeys: allKeys.length,
        nodestKeys: nodestKeys.length,
        characters: characterIds.size
      };
    } catch (error) {
      console.error("Error getting storage stats:", error);
      return {
        totalKeys: 0,
        nodestKeys: 0,
        characters: 0
      };
    }
  }
}
