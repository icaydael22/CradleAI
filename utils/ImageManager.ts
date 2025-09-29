import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';

export interface ImageInfo {
  id: string;
  originalPath: string;  // Path to full-quality PNG
  thumbnailPath: string; // Path to compressed WebP
  timestamp: number;
  size: number;
}

/**
 * Generate a unique ID based on content and timestamp
 * This replaces the crypto hash function for generating unique image IDs
 */
function generateUniqueId(content: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  
  // Create a simple content-based hash for consistency
  let hash = 0;
  const contentSample = content.substring(0, 1000); // Use first 1000 chars like before
  for (let i = 0; i < contentSample.length; i++) {
    const char = contentSample.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Combine timestamp, random, and content hash for uniqueness
  return `img_${timestamp}_${random}_${Math.abs(hash).toString(36)}`;
}

/**
 *  Manages image caching, storage, and cleanup for the application
 */
export class ImageManager {
  private static instance: ImageManager;
  private readonly IMAGE_CACHE_KEY = 'app_image_cache_registry';
  private readonly IMAGE_CACHE_DIR = `${FileSystem.cacheDirectory}images/`;
  private readonly THUMBNAIL_CACHE_DIR = `${FileSystem.cacheDirectory}thumbnails/`;
  private readonly CHARACTER_MEDIA_DIR = `${FileSystem.documentDirectory}characters/`;
  private imageRegistry: Map<string, ImageInfo> = new Map();
  
  private constructor() {
    // Private constructor for singleton
    this.initializeCache();
  }
  
  public static getInstance(): ImageManager {
    if (!ImageManager.instance) {
      ImageManager.instance = new ImageManager();
    }
    return ImageManager.instance;
  }
  
  /**
   * Static method to cache an image - delegates to the instance method
   * @param base64Data The base64 data without data URI prefix
   * @param mimeType The MIME type of the image
   * @returns Object with paths to both original and WebP versions
   */
  public static async cacheImage(base64Data: string, mimeType: string): Promise<{
    original: string;
    thumbnail: string;
    id: string;
  }> {
    return ImageManager.getInstance().cacheImage(base64Data, mimeType);
  }

  /**
   * Initialize the cache directory and load the image registry
   */
  private async initializeCache(): Promise<void> {
    try {
      // Ensure cache directories exist
      const dirInfo = await FileSystem.getInfoAsync(this.IMAGE_CACHE_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.IMAGE_CACHE_DIR, { intermediates: true });
      }
      
      const thumbDirInfo = await FileSystem.getInfoAsync(this.THUMBNAIL_CACHE_DIR);
      if (!thumbDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.THUMBNAIL_CACHE_DIR, { intermediates: true });
      }
      
      // Ensure character media directory exists
      const charMediaDirInfo = await FileSystem.getInfoAsync(this.CHARACTER_MEDIA_DIR);
      if (!charMediaDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.CHARACTER_MEDIA_DIR, { intermediates: true });
      }
      
      // Load image registry from storage
      const cachedRegistry = await AsyncStorage.getItem(this.IMAGE_CACHE_KEY);
      if (cachedRegistry) {
        try {
          const parsedRegistry = JSON.parse(cachedRegistry);
          this.imageRegistry = new Map(Object.entries(parsedRegistry));
          console.log(`[ImageManager] Cache registry loaded with ${this.imageRegistry.size} items`);
        } catch (error) {
          console.error('[ImageManager] Failed to parse registry:', error);
          // Reset registry if corrupted
          this.imageRegistry = new Map();
          await this.saveRegistry();
        }
      }
      
      console.log(`[ImageManager] Cache initialized with ${this.imageRegistry.size} images`);
    } catch (error) {
      console.error('[ImageManager] Failed to initialize cache:', error);
    }
  }
  
  /**
   * Save the image registry to persistent storage
   */
  private async saveRegistry(): Promise<void> {
    try {
      const registryObject = Object.fromEntries(this.imageRegistry);
      await AsyncStorage.setItem(this.IMAGE_CACHE_KEY, JSON.stringify(registryObject));
    } catch (error) {
      console.error('[ImageManager] Failed to save registry:', error);
    }
  }
  
  /**
   * Cache a base64 image with both original and WebP versions
   * @param base64Data The base64 data without data URI prefix
   * @param mimeType The MIME type of the image
   * @returns Object with paths to both original and WebP versions
   */
  public async cacheImage(base64Data: string, mimeType: string): Promise<{
    original: string;
    thumbnail: string;
    id: string;
  }> {
    try {
      // Create a unique ID based on content
      const hash = generateUniqueId(base64Data);
      
      const extension = this.getExtensionFromMimeType(mimeType);
      const filename = `${hash}.${extension}`;
      const originalPath = `${this.IMAGE_CACHE_DIR}${filename}`;
      const thumbnailPath = `${this.THUMBNAIL_CACHE_DIR}${hash}.webp`;
      
      // Check if file already exists
      const originalInfo = await FileSystem.getInfoAsync(originalPath);
      const thumbnailInfo = await FileSystem.getInfoAsync(thumbnailPath);
      
      if (!originalInfo.exists) {
        // Write original file in PNG format
        await FileSystem.writeAsStringAsync(originalPath, base64Data, {
          encoding: FileSystem.EncodingType.Base64
        });
        
        // Now create WebP thumbnail from the original file
        if (!thumbnailInfo.exists) {
          await this.createWebPThumbnail(originalPath, thumbnailPath);
        }
        
        console.log(`[ImageManager] Cached new image at: ${originalPath} with thumbnail`);
      } else {
        console.log(`[ImageManager] Image already cached at: ${originalPath}`);
        
        // Ensure thumbnail exists
        if (!thumbnailInfo.exists) {
          await this.createWebPThumbnail(originalPath, thumbnailPath);
        }
      }
      
      // Get actual file size
      const fileInfo = await FileSystem.getInfoAsync(originalPath);
      
      // Add/update registry entry
      this.imageRegistry.set(hash, {
        id: hash,
        originalPath,
        thumbnailPath,
        timestamp: Date.now(),
        size: ('size' in fileInfo ? fileInfo.size : 0)
      });
      
      await this.saveRegistry();
      
      return {
        original: originalPath,
        thumbnail: thumbnailPath,
        id: hash
      };
    } catch (error) {
      console.error('[ImageManager] Failed to cache image:', error);
      throw error;
    }
  }
  
  /**
   * Cache a local image file (PNG) with both original and WebP versions
   * @param filePath The local file path (file://...)
   * @param mimeType The MIME type of the image
   * @returns Object with paths to both original and WebP versions
   */
  public async cacheImageFile(filePath: string, mimeType: string): Promise<{
    original: string;
    thumbnail: string;
    id: string;
  }> {
    try {
      // 读取文件内容生成唯一ID
      const fileBuffer = await FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.Base64 });
      const hash = generateUniqueId(fileBuffer);
      
      const extension = this.getExtensionFromMimeType(mimeType);
      const filename = `${hash}.${extension}`;
      const originalPath = `${this.IMAGE_CACHE_DIR}${filename}`;
      const thumbnailPath = `${this.THUMBNAIL_CACHE_DIR}${hash}.webp`;

      // 拷贝原始文件到缓存目录
      const originalInfo = await FileSystem.getInfoAsync(originalPath);
      if (!originalInfo.exists) {
        await FileSystem.copyAsync({
          from: filePath,
          to: originalPath
        });
      }

      // 创建缩略图
      const thumbnailInfo = await FileSystem.getInfoAsync(thumbnailPath);
      if (!thumbnailInfo.exists) {
        await this.createWebPThumbnail(originalPath, thumbnailPath);
      }

      // 获取文件大小
      const fileInfo = await FileSystem.getInfoAsync(originalPath);

      // 更新注册表
      this.imageRegistry.set(hash, {
        id: hash,
        originalPath,
        thumbnailPath,
        timestamp: Date.now(),
        size: ('size' in fileInfo ? fileInfo.size : 0)
      });

      await this.saveRegistry();

      return {
        original: originalPath,
        thumbnail: thumbnailPath,
        id: hash
      };
    } catch (error) {
      console.error('[ImageManager] Failed to cache image file:', error);
      throw error;
    }
  }
  
  /**
   * Create a WebP thumbnail from an image file
   */
  private async createWebPThumbnail(sourcePath: string, targetPath: string): Promise<void> {
    try {
      // Use ImageManipulator to compress and convert to WebP
      const result = await ImageManipulator.manipulateAsync(
        sourcePath,
        [{ resize: { width: 800 } }], // Resize to reasonable width
        { 
          compress: 0.7, // Higher compression for thumbnails
          format: ImageManipulator.SaveFormat.WEBP 
        }
      );
      
      // WebP file created by manipulator, now copy it to our target location
      await FileSystem.copyAsync({
        from: result.uri,
        to: targetPath
      });
      
      console.log(`[ImageManager] Created WebP thumbnail at: ${targetPath}`);
    } catch (error) {
      console.error('[ImageManager] Failed to create WebP thumbnail:', error);
      throw error;
    }
  }
  
  /**
   * Get extension from MIME type
   */
  private getExtensionFromMimeType(mimeType: string): string {
    switch (mimeType.toLowerCase()) {
      case 'image/jpeg':
      case 'image/jpg':
        return 'jpg';
      case 'image/png':
        return 'png';
      case 'image/gif':
        return 'gif';
      case 'image/webp':
        return 'webp';
      default:
        return 'png'; // Default to png
    }
  }
  
  /**
   * Get image info by ID
   */
  public getImageInfo(id: string): ImageInfo | undefined {
    // Trim any whitespace from the ID to handle formatting issues
    const trimmedId = id.trim();
    
    // Add more debugging to track the issue
    console.log(`[ImageManager] getImageInfo called with ID: ${trimmedId.substring(0, 8)}...`);
    
    const info = this.imageRegistry.get(trimmedId);
    
    if (!info) {
      console.warn(`[ImageManager] getImageInfo: No image found with ID: ${trimmedId}`);
      
      // Log the registry size and some sample IDs for debugging
      console.log(`[ImageManager] Registry size: ${this.imageRegistry.size}`);
      const entries = Array.from(this.imageRegistry.entries()).slice(0, 5);
      console.log('[ImageManager] Current registry entries (first 5):', 
        entries.map(([id, info]) => ({
          id: id.substring(0, 8) + '...',
          path: info.originalPath
        })));
      
      return undefined;
    }
    
    console.log(`[ImageManager] Found image: ${info.originalPath}`);
    
    // Validate file paths
    const checkPath = async (path: string): Promise<boolean> => {
      try {
        const fileInfo = await FileSystem.getInfoAsync(path);
        return fileInfo.exists;
      } catch (error) {
        console.error(`[ImageManager] Error checking path ${path}:`, error);
        return false;
      }
    };
    
    // Check both paths in background, but don't block the return
    (async () => {
      const originalExists = await checkPath(info.originalPath);
      const thumbnailExists = await checkPath(info.thumbnailPath);
      
      if (!originalExists || !thumbnailExists) {
        console.error(`[ImageManager] Image files missing for ID ${trimmedId}:`, {
          originalExists,
          thumbnailExists,
          originalPath: info.originalPath,
          thumbnailPath: info.thumbnailPath
        });
      }
    })();
    
    // 返回的 info.originalPath 就是本地 PNG 文件路径，可直接用于 <Image source={{ uri: ... }} />
    return info;
  }
  
  /**
   * Save an image to the device's media library
   * @param imageUri The URI of the image to save (can be ID, path, or data URI)
   * @returns Success status and information
   */
  public async saveToGallery(imageUri: string): Promise<{ success: boolean; message: string }> {
    try {
      // Request permission to access the media library
      const { status } = await MediaLibrary.requestPermissionsAsync();
      
      if (status !== 'granted') {
        return { 
          success: false, 
          message: '需要授权访问照片库才能保存图片' 
        };
      }
      
      let finalUri = imageUri;
      
      // Check if it's an ID from our registry
      if (this.imageRegistry.has(imageUri)) {
        const info = this.imageRegistry.get(imageUri);
        if (info) {
          finalUri = info.originalPath;
        }
      }
      // If it's a base64 data URI, convert it to a file first
      else if (imageUri.startsWith('data:')) {
        const base64Data = imageUri.split(',')[1];
        const mimeType = imageUri.split(';')[0].split(':')[1];
        const result = await this.cacheImage(base64Data, mimeType);
        finalUri = result.original;
      }
      
      // Save the file to the media library
      const asset = await MediaLibrary.createAssetAsync(finalUri);
      await MediaLibrary.createAlbumAsync('AI Images', asset, false);
      
      return {
        success: true,
        message: '图片已保存到相册'
      };
    } catch (error) {
      console.error('[ImageManager] Failed to save to gallery:', error);
      return {
        success: false,
        message: `保存失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }
  
  /**
   * Share an image using the device's share dialog
   * @param imageUri The URI or ID of the image to share
   * @returns Success status
   */
  public async shareImage(imageUri: string): Promise<boolean> {
    try {
      // Check if sharing is available
      if (!(await Sharing.isAvailableAsync())) {
        console.log('[ImageManager] Sharing not available on this device');
        return false;
      }
      
      let finalUri = imageUri;
      
      // Check if it's an ID from our registry
      if (this.imageRegistry.has(imageUri)) {
        const info = this.imageRegistry.get(imageUri);
        if (info) {
          finalUri = info.originalPath;
        }
      }
      // If it's a base64 data URI, convert it to a file first
      else if (imageUri.startsWith('data:')) {
        const base64Data = imageUri.split(',')[1];
        const mimeType = imageUri.split(';')[0].split(':')[1];
        const result = await this.cacheImage(base64Data, mimeType);
        finalUri = result.original;
      }
      
      // Share the image
      await Sharing.shareAsync(finalUri);
      return true;
    } catch (error) {
      console.error('[ImageManager] Failed to share image:', error);
      return false;
    }
  }
  
  /**
   * Get all cached images info
   */
  public async getCacheInfo(): Promise<{
    count: number;
    totalSize: number;
    oldestImage: Date | null;
  }> {
    try {
      const imageEntries = Array.from(this.imageRegistry.entries());
      let totalSize = 0;
      let oldestTimestamp = Date.now();
      
      for (const [_, info] of imageEntries) {
        totalSize += info.size;
        if (info.timestamp < oldestTimestamp) {
          oldestTimestamp = info.timestamp;
        }
      }
      
      return {
        count: this.imageRegistry.size,
        totalSize,
        oldestImage: this.imageRegistry.size > 0 ? new Date(oldestTimestamp) : null
      };
    } catch (error) {
      console.error('[ImageManager] Failed to get cache info:', error);
      return {
        count: 0,
        totalSize: 0,
        oldestImage: null
      };
    }
  }
  
  /**
   * Save character avatar from data URL and return local file path
   * @param characterId The character ID
   * @param dataUrl The data URL (data:image/...;base64,...)
   * @returns Local file path for the avatar
   */
  public async saveCharacterAvatar(characterId: string, dataUrl: string): Promise<string> {
    try {
      if (!dataUrl.startsWith('data:')) {
        throw new Error('Invalid data URL format');
      }
      
      // Parse data URL
      const [header, base64Data] = dataUrl.split(',');
      const mimeType = header.split(';')[0].split(':')[1];
      
      // Create character-specific directory
      const characterDir = `${this.CHARACTER_MEDIA_DIR}${characterId}/`;
      const charDirInfo = await FileSystem.getInfoAsync(characterDir);
      if (!charDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(characterDir, { intermediates: true });
      }
      
      // Save avatar file
      const extension = this.getExtensionFromMimeType(mimeType);
      const avatarPath = `${characterDir}avatar.${extension}`;
      
      await FileSystem.writeAsStringAsync(avatarPath, base64Data, {
        encoding: FileSystem.EncodingType.Base64
      });
      
      console.log(`[ImageManager] Saved character avatar: ${avatarPath}`);
      return avatarPath;
    } catch (error) {
      console.error('[ImageManager] Failed to save character avatar:', error);
      throw error;
    }
  }
  
  /**
   * Save character background from data URL and return local file path
   * @param characterId The character ID
   * @param dataUrl The data URL (data:image/...;base64,...)
   * @returns Local file path for the background
   */
  public async saveCharacterBackground(characterId: string, dataUrl: string): Promise<string> {
    try {
      if (!dataUrl.startsWith('data:')) {
        throw new Error('Invalid data URL format');
      }
      
      // Parse data URL
      const [header, base64Data] = dataUrl.split(',');
      const mimeType = header.split(';')[0].split(':')[1];
      
      // Create character-specific directory
      const characterDir = `${this.CHARACTER_MEDIA_DIR}${characterId}/`;
      const charDirInfo = await FileSystem.getInfoAsync(characterDir);
      if (!charDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(characterDir, { intermediates: true });
      }
      
      // Save background file
      const extension = this.getExtensionFromMimeType(mimeType);
      const backgroundPath = `${characterDir}background.${extension}`;
      
      await FileSystem.writeAsStringAsync(backgroundPath, base64Data, {
        encoding: FileSystem.EncodingType.Base64
      });
      
      console.log(`[ImageManager] Saved character background: ${backgroundPath}`);
      return backgroundPath;
    } catch (error) {
      console.error('[ImageManager] Failed to save character background:', error);
      throw error;
    }
  }
  
  /**
   * Check if a character avatar file exists
   * @param characterId The character ID
   * @returns Avatar file path if exists, null otherwise
   */
  public async getCharacterAvatarPath(characterId: string): Promise<string | null> {
    try {
      const characterDir = `${this.CHARACTER_MEDIA_DIR}${characterId}/`;
      const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
      
      for (const ext of extensions) {
        const avatarPath = `${characterDir}avatar.${ext}`;
        const fileInfo = await FileSystem.getInfoAsync(avatarPath);
        if (fileInfo.exists) {
          return avatarPath;
        }
      }
      
      return null;
    } catch (error) {
      console.error('[ImageManager] Failed to get character avatar path:', error);
      return null;
    }
  }
  
  /**
   * Check if a character background file exists
   * @param characterId The character ID
   * @returns Background file path if exists, null otherwise
   */
  public async getCharacterBackgroundPath(characterId: string): Promise<string | null> {
    try {
      const characterDir = `${this.CHARACTER_MEDIA_DIR}${characterId}/`;
      const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
      
      for (const ext of extensions) {
        const backgroundPath = `${characterDir}background.${ext}`;
        const fileInfo = await FileSystem.getInfoAsync(backgroundPath);
        if (fileInfo.exists) {
          return backgroundPath;
        }
      }
      
      return null;
    } catch (error) {
      console.error('[ImageManager] Failed to get character background path:', error);
      return null;
    }
  }
  public async clearCache(): Promise<{ success: boolean; message: string }> {
    try {
      // Delete all files in the cache directories
      const dirInfo = await FileSystem.getInfoAsync(this.IMAGE_CACHE_DIR);
      const thumbDirInfo = await FileSystem.getInfoAsync(this.THUMBNAIL_CACHE_DIR);
      
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(this.IMAGE_CACHE_DIR, { idempotent: true });
        await FileSystem.makeDirectoryAsync(this.IMAGE_CACHE_DIR, { intermediates: true });
      }
      
      if (thumbDirInfo.exists) {
        await FileSystem.deleteAsync(this.THUMBNAIL_CACHE_DIR, { idempotent: true });
        await FileSystem.makeDirectoryAsync(this.THUMBNAIL_CACHE_DIR, { intermediates: true });
      }
      
      // Clear the registry
      this.imageRegistry.clear();
      await this.saveRegistry();
      
      return {
        success: true,
        message: '图片缓存已清空'
      };
    } catch (error) {
      console.error('[ImageManager] Failed to clear cache:', error);
      return {
        success: false,
        message: `清除缓存失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }
}

export default ImageManager.getInstance();
