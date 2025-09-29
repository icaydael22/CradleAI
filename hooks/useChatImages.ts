import { useCallback, useState, useRef, useEffect } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Message } from '@/shared/types';
import { ImageManager, ImageInfo } from '@/utils/ImageManager';
import { useDialog } from '@/components/DialogProvider';

interface GeneratedImage {
  id: string;
  prompt: string;
  timestamp: number;
}

interface UseChatImagesOptions {
  onDeleteGeneratedImage?: (imageId: string) => void;
}

export const useChatImages = ({ onDeleteGeneratedImage }: UseChatImagesOptions = {}) => {
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [fullscreenImageId, setFullscreenImageId] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  
  // Image info cache to avoid repeated lookups
  const imageInfoCacheRef = useRef<Record<string, ImageInfo | null>>({});
  const [imageInfoCache, setImageInfoCache] = useState<Record<string, ImageInfo | null>>({});

  // Get ImageManager singleton
  const imageManager = ImageManager.getInstance();
  const dialog = useDialog();

  const handleOpenFullscreenImage = useCallback(async (imageId: string) => {
    if (!imageId) return;

    try {
      setImageLoading(true);
      setFullscreenImageId(imageId);

      // Get image info from ImageManager
      const imageInfo = imageManager.getImageInfo(imageId);
      
      if (imageInfo) {
        setFullscreenImage(imageInfo.originalPath);
        setImageLoading(false);
      } else {
        console.error('[useChatImages] No image info found for ID:', imageId);
        setFullscreenImage(null);
        setImageLoading(false);
        await dialog.alert({ title: '错误', message: '无法加载图片', icon: 'alert-circle-outline' });
      }
    } catch (error) {
      console.error('[useChatImages] Error opening fullscreen image:', error);
      setFullscreenImage(null);
      setImageLoading(false);
      await dialog.alert({ title: '错误', message: '无法加载图片', icon: 'alert-circle-outline' });
    }
  }, [imageManager, dialog]);

  const handleCloseFullscreenImage = useCallback(() => {
    setFullscreenImage(null);
    setFullscreenImageId(null);
    setImageLoading(false);
  }, []);

  const handleSaveGeneratedImage = useCallback(async (imageId: string) => {
    try {
      const result = await imageManager.saveToGallery(imageId);
      await dialog.alert({ title: result.success ? '成功' : '错误', message: result.message, icon: result.success ? 'checkmark-circle-outline' : 'alert-circle-outline' });
    } catch (error) {
      console.error('[useChatImages] Error saving image:', error);
      await dialog.alert({ title: '错误', message: '保存图片失败', icon: 'alert-circle-outline' });
    }
  }, [imageManager, dialog]);

  const handleShareGeneratedImage = useCallback(async (imageId: string) => {
    try {
      const shared = await imageManager.shareImage(imageId);
      if (!shared) {
        await dialog.alert({ title: '错误', message: '分享功能不可用', icon: 'alert-circle-outline' });
      }
    } catch (error) {
      console.error('[useChatImages] Error sharing image:', error);
      await dialog.alert({ title: '错误', message: '分享图片失败', icon: 'alert-circle-outline' });
    }
  }, [imageManager, dialog]);

  const handleDeleteGeneratedImage = useCallback(async (imageId: string) => {
    const ok = await dialog.confirm({
      title: '确认删除',
      message: '确定要删除这张图片吗？',
      destructive: true,
      icon: 'trash-outline',
      confirmText: '删除',
      cancelText: '取消',
    });
    if (ok) {
      onDeleteGeneratedImage?.(imageId);
    }
  }, [onDeleteGeneratedImage, dialog]);

  const copyImageToClipboard = useCallback(async (imageUrl: string) => {
    try {
      await Clipboard.setStringAsync(imageUrl);
      await dialog.alert({ title: '复制成功', message: '图片链接已复制到剪贴板', icon: 'checkmark-circle-outline' });
    } catch (error) {
      await dialog.alert({ title: '复制失败', message: '无法复制图片链接', icon: 'alert-circle-outline' });
      console.error('Error copying image URL:', error);
    }
  }, [dialog]);

  // Get cached image info - updated to fetch from ImageManager if not in cache
  const getCachedImageInfo = useCallback((imageId: string): ImageInfo | null => {
    // Return cached value if available
    if (imageInfoCache[imageId]) {
      return imageInfoCache[imageId];
    }
    
    // If not in cache, try to get from ImageManager directly
    try {
      const imageInfo = imageManager.getImageInfo(imageId);
      if (imageInfo) {
        // Update cache for future use
        setImageInfoCache(prev => ({
          ...prev,
          [imageId]: imageInfo
        }));
        return imageInfo;
      }
    } catch (error) {
      console.error(`[useChatImages] Error getting image info for ${imageId}:`, error);
    }
    
    return null;
  }, [imageInfoCache, imageManager]);

  // Preload image info for multiple images
  const preloadImageInfo = useCallback(async (imageIds: string[]) => {
    const newCache: Record<string, ImageInfo | null> = { ...imageInfoCache };
    
    for (const id of imageIds) {
      if (imageInfoCacheRef.current[id] === undefined) {
        try {
          const imageInfo = imageManager.getImageInfo(id);
          imageInfoCacheRef.current[id] = imageInfo || null;
          newCache[id] = imageInfo || null;
        } catch (error) {
          console.error(`[useChatImages] Error getting image info for ${id}:`, error);
          imageInfoCacheRef.current[id] = null;
          newCache[id] = null;
        }
      }
    }
    
    setImageInfoCache(newCache);
  }, [imageInfoCache, imageManager]);

  // Handle save image with multiple URI formats
  const handleSaveImage = useCallback(async (imageSource?: string) => {
    try {
      const imageUri = imageSource || fullscreenImage;
      if (!imageUri) return;

      let targetId = fullscreenImageId;
      
      // If we have fullscreenImageId, use it directly
      if (targetId) {
        const result = await imageManager.saveToGallery(targetId);
        await dialog.alert({ title: result.success ? '成功' : '错误', message: result.message, icon: result.success ? 'checkmark-circle-outline' : 'alert-circle-outline' });
      } else if (imageUri) {
        // Fallback to using the URI directly
        const result = await imageManager.saveToGallery(imageUri);
        await dialog.alert({ title: result.success ? '成功' : '错误', message: result.message, icon: result.success ? 'checkmark-circle-outline' : 'alert-circle-outline' });
      }
    } catch (error) {
      await dialog.alert({ title: '错误', message: '保存图片失败', icon: 'alert-circle-outline' });
      console.error('[useChatImages] Error saving image:', error);
    }
  }, [fullscreenImage, fullscreenImageId, imageManager, dialog]);

  // Handle share image with multiple URI formats
  const handleShareImage = useCallback(async (imageSource?: string) => {
    try {
      const imageUri = imageSource || fullscreenImage;
      if (!imageUri) return;

      let success = false;
      let targetId = fullscreenImageId;

      // If we have fullscreenImageId, use it directly
      if (targetId) {
        success = await imageManager.shareImage(targetId);
      } else if (imageUri) {
        // Fallback to using the URI directly
        success = await imageManager.shareImage(imageUri);
      }

      if (!success) {
        await dialog.alert({ title: '错误', message: '分享功能不可用', icon: 'alert-circle-outline' });
      }
    } catch (error) {
      await dialog.alert({ title: '错误', message: '分享图片失败', icon: 'alert-circle-outline' });
      console.error('[useChatImages] Error sharing image:', error);
    }
  }, [fullscreenImage, fullscreenImageId, imageManager, dialog]);

  // Cache an image from base64 data
  const cacheImageFromBase64 = useCallback(async (base64Data: string, mimeType: string) => {
    try {
      const result = await imageManager.cacheImage(base64Data, mimeType);
      return result;
    } catch (error) {
      console.error('[useChatImages] Error caching image:', error);
      throw error;
    }
  }, [imageManager]);

  // Cache an image from local file
  const cacheImageFromFile = useCallback(async (filePath: string, mimeType: string) => {
    try {
      const result = await imageManager.cacheImageFile(filePath, mimeType);
      return result;
    } catch (error) {
      console.error('[useChatImages] Error caching image file:', error);
      throw error;
    }
  }, [imageManager]);

  // Get cache information
  const getCacheInfo = useCallback(async () => {
    try {
      return await imageManager.getCacheInfo();
    } catch (error) {
      console.error('[useChatImages] Error getting cache info:', error);
      return {
        count: 0,
        totalSize: 0,
        oldestImage: null
      };
    }
  }, [imageManager]);

  // Clear image cache
  const clearImageCache = useCallback(async () => {
    try {
      const result = await imageManager.clearCache();
      
      // Clear our local cache as well
      imageInfoCacheRef.current = {};
      setImageInfoCache({});
      
      return result;
    } catch (error) {
      console.error('[useChatImages] Error clearing cache:', error);
      return {
        success: false,
        message: '清除缓存失败'
      };
    }
  }, [imageManager]);

  // Get image display style (helper from old ChatDialog)
  const getImageDisplayStyle = useCallback((imageInfo?: ImageInfo | null) => {
    const DEFAULT_IMAGE_WIDTH = 240;
    const DEFAULT_IMAGE_HEIGHT = 360;
    const MAX_IMAGE_HEIGHT = 300;
    
    let width = DEFAULT_IMAGE_WIDTH;
    let height = DEFAULT_IMAGE_HEIGHT;
    
    if (imageInfo && imageInfo.originalPath) {
      // Note: ImageInfo doesn't store width/height by default
      // This would need to be enhanced if dimension info is needed
      width = 208;
      height = 304;
    }
    
    return {
      width,
      height,
      maxWidth: Math.min(320, width * 0.8),
      maxHeight: MAX_IMAGE_HEIGHT,
      borderRadius: 8,
      backgroundColor: 'rgba(42, 42, 42, 0.5)',
      alignSelf: 'center' as const,
    };
  }, []);

  return {
    // State
    fullscreenImage,
    fullscreenImageId,
    imageLoading,
    imageInfoCache,

    // Core actions
    handleOpenFullscreenImage,
    handleCloseFullscreenImage,
    handleSaveGeneratedImage,
    handleShareGeneratedImage,
    handleDeleteGeneratedImage,

    // Legacy support
    setFullscreenImage,
    handleSaveImage,
    handleShareImage,

    // Utilities
    copyImageToClipboard,
    getCachedImageInfo,
    preloadImageInfo,
    getImageDisplayStyle,

    // Cache management
    cacheImageFromBase64,
    cacheImageFromFile,
    getCacheInfo,
    clearImageCache,
  };
};
