import * as FileSystem from 'expo-file-system';
import { Alert, Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Downloads and locally stores an image from a remote URL
 * @param imageUrl The remote URL of the image
 * @param characterId The ID of the character this image belongs to
 * @param type The type of image ('avatar', 'background')
 * @returns The local URI of the saved image
 */

/**
 * Cleans up all local images associated with a character
 * @param characterId The ID of the character
 */
export async function deleteCharacterImages(characterId: string): Promise<void> {
  try {
    const characterImagesDir = `${FileSystem.documentDirectory}characterImages/${characterId}`;
    const dirInfo = await FileSystem.getInfoAsync(characterImagesDir);
    
    if (dirInfo.exists) {
      console.log(`[ImageUtils] 删除角色图片目录: ${characterImagesDir}`);
      await FileSystem.deleteAsync(characterImagesDir, { idempotent: true });
    }
  } catch (error) {
    console.error('[ImageUtils] 删除角色图片失败:', error);
  }
}

export const downloadAndSaveImage = async (
  url: string, 
  characterId: string,
  type: 'avatar' | 'background' | 'gallery' = 'gallery'
): Promise<string | null> => {
  try {
    console.log(`[ImageUtils] 开始处理图像: ${url}`);
    
    // Check if URL is actually a local file path
    const isLocalFile = url.startsWith('file:') || 
                       url.startsWith('/') || 
                       url.startsWith('asset:') ||
                       (FileSystem.documentDirectory ? url.includes(FileSystem.documentDirectory) : false);
    
    if (isLocalFile) {
      console.log('[ImageUtils] 图像已经是本地文件，无需下载:', url);
      return url; // Return the local path directly
    }
    
    // If it's a data URL, we need to convert it to a file
    if (url.startsWith('data:')) {
      console.log('[ImageUtils] 处理数据URL图像');
      try {
        // Create the directory path
        const dirUri = `${FileSystem.documentDirectory}characters/${characterId}`;
        const fileName = `${type}_${Date.now()}.png`;
        const fileUri = `${dirUri}/${fileName}`;
        
        // Ensure directory exists
        const dirInfo = await FileSystem.getInfoAsync(dirUri);
        if (!dirInfo.exists) {
          console.log(`[ImageUtils] 创建目录: ${dirUri}`);
          await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
        }
        
        // Extract the base64 part
        let base64Data = url;
        if (url.includes('base64,')) {
          base64Data = url.split('base64,')[1];
        }
        
        // Write the file
        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64
        });
        
        console.log(`[ImageUtils] 数据URL已保存为文件: ${fileUri}`);
        return fileUri;
      } catch (error) {
        console.error('[ImageUtils] 处理数据URL失败:', error);
        return url; // Fall back to original URL
      }
    }
    
    // At this point we know it's a remote URL that needs downloading
    console.log(`[ImageUtils] 下载图像: ${url}`);
    
    // Create the directory path
    const dirUri = `${FileSystem.documentDirectory}characters/${characterId}`;
    const fileName = `${type}_${Date.now()}.png`;
    const fileUri = `${dirUri}/${fileName}`;
    
    // Ensure directory exists
    try {
      const dirInfo = await FileSystem.getInfoAsync(dirUri);
      if (!dirInfo.exists) {
        console.log(`[ImageUtils] 创建目录: ${dirUri}`);
        await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
      }
    } catch (dirError) {
      console.error('[ImageUtils] 创建目录失败:', dirError);
      // Continue anyway, as the download might still work
    }
    
    // Download the file
    console.log(`[ImageUtils] 下载图像到: ${fileUri}`);
    const downloadResult = await FileSystem.downloadAsync(url, fileUri);
    
    if (downloadResult.status === 200) {
      console.log(`[ImageUtils] 图像下载成功: ${fileUri}`);
      
      // Verify the file exists
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (fileInfo.exists) {
        console.log(`[ImageUtils] 文件确认存在: ${fileUri}, 大小: ${fileInfo.size} 字节`);
        return fileUri;
      } else {
        console.error(`[ImageUtils] 下载完成但文件不存在: ${fileUri}`);
        return null;
      }
    } else {
      console.error(`[ImageUtils] 图像下载失败: HTTP ${downloadResult.status}`);
      return null;
    }
  } catch (error) {
    console.error('[ImageUtils] 下载图像时出错:', error);
    return null;
  }
};
