import { Alert } from 'react-native';
import { CradleCharacter } from '@/shared/types';
import { deleteCharacterImages } from './imageUtils';

/**
 * Shows a confirmation dialog and handles the deletion of a cradle character
 * @param character The character to delete
 * @param deleteHandler The function to call to delete the character from storage
 * @param onSuccess Optional callback to execute after successful deletion
 */
export const confirmDeleteCradleCharacter = (
  character: CradleCharacter,
  deleteHandler: (id: string) => Promise<void>,
  onSuccess?: () => void
) => {
  // Show confirmation dialog
  Alert.alert(
    '删除角色',
    `确定要删除摇篮角色 "${character.name}" 吗？此操作不可撤销，角色的所有数据和图片将被永久删除。`,
    [
      {
        text: '取消',
        style: 'cancel'
      },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            // First delete the character's images to free up space
            await deleteCharacterImages(character.id);
            
            // Then delete the character data from storage
            await deleteHandler(character.id);
            
            // Execute success callback if provided
            if (onSuccess) {
              onSuccess();
            }
          } catch (error) {
            console.error('删除摇篮角色失败:', error);
            Alert.alert('错误', '删除角色时出现问题，请重试。');
          }
        }
      }
    ]
  );
};
