import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  FlatList,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CharacterImage, CradleCharacter } from '@/shared/types';
import ImageEditorModal from './ImageEditorModal';
import { useUser } from '@/constants/UserContext';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import ImageRegenerationModal from './ImageRegenerationModal';
import { downloadAndSaveImage } from '@/utils/imageUtils';
import { BlurView } from 'expo-blur';
import { useCharacters } from '@/constants/CharactersContext';

const { width, height } = Dimensions.get('window');

export const getCharacterImageDir = (characterId: string) =>
  `${FileSystem.documentDirectory}character_${characterId}/`;

export const getGalleryMetaFile = (characterId: string) =>
  `${getCharacterImageDir(characterId)}gallery.json`;

interface CharacterImageGallerySidebarProps {
  visible: boolean;
  onClose: () => void;
  images: CharacterImage[];
  onToggleFavorite: (imageId: string) => void;
  onDelete: (imageId: string) => void;
  onSetAsBackground: (imageId: string, uri: string, config?: any) => void;
  onSetAsAvatar?: (imageId: string, uri: string) => void;
  isLoading?: boolean;
  character: CradleCharacter;
  onAddNewImage?: (newImage: CharacterImage) => void;
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

const CharacterImageGallerySidebar: React.FC<CharacterImageGallerySidebarProps> = ({
  visible,
  onClose,
  images,
  onToggleFavorite,
  onDelete,
  onSetAsBackground,
  onSetAsAvatar,
  isLoading = false,
  character,
  onAddNewImage,
}) => {
  const slideAnim = useRef(new Animated.Value(height)).current;
  const [selectedImage, setSelectedImage] = useState<CharacterImage | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);
  const [fullImageUri, setFullImageUri] = useState<string | null>(null);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [activeImage, setActiveImage] = useState<CharacterImage | null>(null);
  const { user } = useUser();
  const [updateCounter, setUpdateCounter] = useState(0);
  const [lastUpdateTimestamp, setLastUpdateTimestamp] = useState(Date.now());
  const [showRegenerationModal, setShowRegenerationModal] = useState(false);
  const [regenerationImageConfig, setRegenerationImageConfig] = useState<any>(null);
  const [downloadingImages, setDownloadingImages] = useState<Record<string, boolean>>({});
  const apiKey = user?.settings?.chat?.characterApiKey || '';
  const [isUploading, setIsUploading] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState({ title: '', message: '' });
  const notificationAnim = useRef(new Animated.Value(0)).current;
  const [persistedImages, setPersistedImages] = useState<CharacterImage[]>([]);
  const { setCharacterAvatar, setCharacterBackgroundImage } = useCharacters();

  const [lastImageGenSettings, setLastImageGenSettings] = useState<any>(null);
  const [lastImageGenSeed, setLastImageGenSeed] = useState<string | number | undefined>(undefined);

  const loadPersistedImagesFromFS = async () => {
    try {
      const dir = getCharacterImageDir(character.id);
      const metaFile = getGalleryMetaFile(character.id);
      const dirInfo = await FileSystem.getInfoAsync(dir);
      let meta: Record<string, any> = {};
      const metaInfo = await FileSystem.getInfoAsync(metaFile);
      if (metaInfo.exists) {
        const metaStr = await FileSystem.readAsStringAsync(metaFile);
        try {
          meta = JSON.parse(metaStr);
        } catch {
          meta = {};
        }
      }
      if (!dirInfo.exists) {
        setPersistedImages([]);
        return;
      }
      const files = await FileSystem.readDirectoryAsync(dir);
      const images: CharacterImage[] = files
        .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
        .map(f => {
          const uri = dir + f;
          const metaItem = meta[f];
          return {
            id: f,
            url: uri,
            localUri: uri,
            characterId: character.id,
            createdAt: metaItem?.createdAt || Date.now(),
            isFavorite: metaItem?.isFavorite || false,
            isUserUploaded: metaItem?.isUserUploaded || true,
            generationStatus: metaItem?.generationStatus || 'success',
            generationConfig: metaItem?.generationConfig,
            tags: metaItem?.tags,
            isAvatar: metaItem?.isAvatar,
            isDefaultBackground: metaItem?.isDefaultBackground,
            setAsBackground: metaItem?.setAsBackground,
            isNovelAI: metaItem?.isNovelAI,
            seed: metaItem?.seed,
          };
        });
      setPersistedImages(images);
    } catch (e) {
      console.warn('[图库侧栏] 加载文件系统图片失败', e);
      setPersistedImages([]);
    }
  };

  useEffect(() => {
    if (visible) loadPersistedImagesFromFS();
  }, [character.id, visible]);

  const addImageAndPersist = async (newImage: CharacterImage) => {
    const dir = getCharacterImageDir(character.id);
    const metaFile = getGalleryMetaFile(character.id);

    // 处理 #localNovelAI
    let localUri = newImage.localUri || newImage.url;
    if (localUri && localUri.includes('#localNovelAI')) {
      localUri = localUri.split('#localNovelAI')[0];
    }

    const filename = localUri?.split('/').pop() || newImage.url?.split('/').pop();
    if (!filename) return;
    const fileUri = dir + filename;

    try {
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      // 只有当目标文件不存在且本地文件存在时才复制
      if (!fileInfo.exists && localUri && localUri !== fileUri) {
        const srcInfo = await FileSystem.getInfoAsync(localUri);
        if (srcInfo.exists) {
          await FileSystem.copyAsync({ from: localUri, to: fileUri });
        }
      }
      let meta: Record<string, any> = {};
      const metaInfo = await FileSystem.getInfoAsync(metaFile);
      if (metaInfo.exists) {
        try {
          meta = JSON.parse(await FileSystem.readAsStringAsync(metaFile));
        } catch {
          meta = {};
        }
      }
      meta[filename] = {
        ...newImage,
        url: fileUri,
        localUri: fileUri,
        id: filename,
      };
      await FileSystem.writeAsStringAsync(metaFile, JSON.stringify(meta));
      await loadPersistedImagesFromFS();
    } catch (e) {
      console.warn('[图库侧栏] 保存图片到文件系统失败', e);
    }
  };

  const allImages = useMemo(() => {
    let combinedImages: CharacterImage[] = [];
    combinedImages = [...persistedImages, ...images];
    const seen = new Set();
    combinedImages = combinedImages.filter(img => {
      const key = img.localUri || img.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    combinedImages = combinedImages.map(img => {
      if (img.generationStatus === 'pending' && (img.url || img.localUri)) {
        return {
          ...img,
          generationStatus: 'success',
          generationTaskId: undefined
        };
      }
      return img;
    });
    combinedImages = combinedImages.filter(
      img => !(img.generationStatus === 'pending' && !img.generationTaskId)
    );
    return combinedImages;
  }, [persistedImages, images, character.avatar, character.backgroundImage, lastUpdateTimestamp]);

  const handleSetAsAvatar = async (imageId: string) => {
    const image = allImages.find(img => img.id === imageId);
    if (image && setCharacterAvatar) {
      await addImageAndPersist(image);
      await setCharacterAvatar(character.id, image.localUri || image.url);
      setShowOptionsMenu(false);
      setUpdateCounter(prev => prev + 1);
    }
  };

  const handleSetAsBackground = async (imageId: string) => {
    const image = allImages.find(img => img.id === imageId);
    if (image && setCharacterBackgroundImage) {
      await addImageAndPersist(image);
      // 修正：补全 isNovelAI 字段
      const config = {
        ...(image.generationConfig || {}),
        isNovelAI: image.isNovelAI === true || (image.generationConfig && image.generationConfig.isNovelAI === true)
      };
      await setCharacterBackgroundImage(
        character.id,
        image.localUri || image.url,
        config
      );
      setShowOptionsMenu(false);
      setUpdateCounter(prev => prev + 1);
    }
  };

  const handleAddNewImage = (newImage: CharacterImage) => {
    if (newImage.generationConfig) {
      addImageAndPersist(newImage);
      setUpdateCounter(prev => prev + 1);
      // 新增：同步通知父组件
      if (typeof onAddNewImage === 'function') {
        onAddNewImage(newImage);
      }
    }
  };

  useEffect(() => {
    setLastUpdateTimestamp(Date.now());
    setUpdateCounter(prev => prev + 1);
  }, [images, character.avatar, character.backgroundImage]);

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: height,
        duration: 300,
        useNativeDriver: true
      }).start();
    }
  }, [visible, slideAnim]);

  const ensureLocalImages = async () => {
    if (!images || images.length === 0) return;
    const processedUrls = new Set();
    const imagesNeedingLocalStorage = images.filter(
      img =>
        img.url &&
        (!persistedImages.some(
          persisted =>
            (persisted.url && persisted.url === img.url) ||
            (persisted.localUri && persisted.localUri === img.url)
        )) &&
        (!img.localUri || img.localUri.startsWith('http')) &&
        img.generationStatus !== 'pending' &&
        !processedUrls.has(img.url) &&
        !images.some(
          other =>
            other !== img &&
            ((other.localUri && other.localUri === img.url) ||
             (other.url && other.url === img.url))
        )
    );
    if (imagesNeedingLocalStorage.length === 0) return;
    for (const image of imagesNeedingLocalStorage) {
      if (downloadingImages[image.id] || processedUrls.has(image.url)) continue;
      processedUrls.add(image.url);
      setDownloadingImages(prev => ({ ...prev, [image.id]: true }));
      try {
        if (image.localUri && !image.localUri.startsWith('http')) {
          setDownloadingImages(prev => ({ ...prev, [image.id]: false }));
          continue;
        }
        const localUri = await downloadAndSaveImage(image.url, image.characterId, 'gallery');
        if (localUri) {
          const updatedImage = {
            ...image,
            localUri
          };
          addImageAndPersist(updatedImage);
        }
      } catch (error) {
        console.error(`[图库侧栏] 下载图像失败:`, error);
      } finally {
        setDownloadingImages(prev => ({ ...prev, [image.id]: false }));
      }
    }
  };

  useEffect(() => {
    if (visible) {
      ensureLocalImages();
    }
  }, [visible, images]);

  const displayNotification = (title: string, message: string) => {
    setNotificationMessage({ title, message });
    setShowNotification(true);
    
    Animated.timing(notificationAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true
    }).start();
    
    setTimeout(() => {
      Animated.timing(notificationAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true
      }).start(() => {
        setShowNotification(false);
      });
    }, 3000);
  };

  const handleEdit = (image: CharacterImage) => {
    setSelectedImage(image);
    setShowEditor(true);
  };

  const handleEditSuccess = (newImage: CharacterImage) => {
    handleAddNewImage(newImage);
    setShowEditor(false);
  };

  const handleViewImage = async (image: CharacterImage) => {
    if (image.localUri && !image.localUri.startsWith('http')) {
      setFullImageUri(image.localUri);
      setShowFullImage(true);
      return;
    }
    if (image.url && (!image.localUri || image.localUri.startsWith('http')) && !downloadingImages[image.id]) {
      setDownloadingImages(prev => ({ ...prev, [image.id]: true }));
      try {
        const localUri = await downloadAndSaveImage(image.url, image.characterId, 'gallery');
        if (localUri) {
          const updatedImage = {
            ...image,
            localUri
          };
          addImageAndPersist(updatedImage);
          setFullImageUri(localUri);
        } else {
          setFullImageUri(image.url);
        }
      } catch (error) {
        setFullImageUri(image.localUri || image.url);
      } finally {
        setDownloadingImages(prev => ({ ...prev, [image.id]: false }));
      }
    } else {
      setFullImageUri(image.localUri || image.url);
    }
    setShowFullImage(true);
  };

  const showImageOptions = (image: CharacterImage) => {
    setActiveImage(image);
    setShowOptionsMenu(true);
  };
    // 重新生成图片时，带入上次设置和seed
    const handleRegenerateImage = (image: CharacterImage) => {
      if (image.generationConfig || (image.tags && (image.tags.positive || image.tags.negative))) {
        const config = {
          positiveTags: image.generationConfig?.positiveTags || image.tags?.positive || [],
          negativeTags: image.generationConfig?.negativeTags || image.tags?.negative || [],
          artistPrompt: image.generationConfig?.artistPrompt || null,
          customPrompt: image.generationConfig?.customPrompt || '',
          useCustomPrompt: image.generationConfig?.useCustomPrompt || false,
          characterTags: image.generationConfig?.characterTags || [],
          seed: image.generationConfig?.seed || image.seed || lastImageGenSeed || '', // 优先用图片的seed，否则用上次seed
          novelaiSettings: image.generationConfig?.novelaiSettings || lastImageGenSettings?.novelaiSettings,
          animagine4Settings: image.generationConfig?.animagine4Settings || lastImageGenSettings?.animagine4Settings
        };
        setRegenerationImageConfig(config);
        setShowRegenerationModal(true);
      } else {
        Alert.alert(
          "无法重新生成",
          "该图像没有关联的生成配置，无法继续重新生成。请使用创建新图像功能。",
          [{ text: "了解", style: "default" }]
        );
      }
    };
  const handleSaveImageToDevice = async (image: CharacterImage) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          "权限被拒绝",
          "需要存储权限才能保存图片",
          [{ text: "好的", style: "default" }]
        );
        return;
      }
      const imageUri = image.localUri || image.url;
      if (!imageUri) {
        Alert.alert("错误", "图片URI无效");
        return;
      }
      Alert.alert("正在保存...", "请等待图片保存完成");
      let localUri = imageUri;
      if (imageUri.startsWith('http')) {
        try {
          const fileUri = `${FileSystem.documentDirectory}temp_${Date.now()}.jpg`;
          const downloadResult = await FileSystem.downloadAsync(imageUri, fileUri);
          localUri = downloadResult.uri;
        } catch (downloadError) {
          console.error("下载图片失败:", downloadError);
          Alert.alert(
            "下载失败",
            "无法下载远程图片: " + (downloadError instanceof Error ? downloadError.message : String(downloadError))
          );
          return;
        }
      }
      try {
        const asset = await MediaLibrary.createAssetAsync(localUri);
        let album = await MediaLibrary.getAlbumAsync("AI伙伴");
        if (album === null) {
          await MediaLibrary.createAlbumAsync("AI伙伴", asset, false);
        } else {
          await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        }
        Alert.alert(
          "保存成功",
          "图片已保存到您的相册中的'AI伙伴'相册",
          [{ text: "太好了", style: "default" }]
        );
      } catch (saveError) {
        console.error("保存到媒体库失败:", saveError);
        if (Platform.OS !== 'web' && await Sharing.isAvailableAsync()) {
          try {
            await Sharing.shareAsync(localUri, {
              mimeType: 'image/jpeg',
              dialogTitle: '保存图片'
            });
          } catch (sharingError) {
            console.error("分享图片失败:", sharingError);
            Alert.alert(
              "操作失败",
              "无法保存或分享图片。请尝试截屏保存。"
            );
          }
        } else {
          Alert.alert(
            "保存失败",
            "无法保存图片到相册，请尝试截屏保存。"
          );
        }
      }
    } catch (error) {
      console.error("保存图片失败:", error);
      Alert.alert(
        "保存失败",
        "无法保存图片: " + (error instanceof Error ? error.message : String(error))
      );
    }
  };

  const pickImageFromDevice = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          "需要权限",
          "需要访问相册权限才能上传图片",
          [{ text: "确定", style: "default" }]
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
        allowsMultipleSelection: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const selectedAsset = result.assets[0];
      await uploadImageToCharacter(selectedAsset.uri);

    } catch (error) {
      console.error("[图库侧栏] 选择图片失败:", error);
      Alert.alert(
        "选择失败",
        "无法选择图片: " + (error instanceof Error ? error.message : String(error)),
        [{ text: "确定", style: "default" }]
      );
    }
  };

  const uploadImageToCharacter = async (imageUri: string) => {
    if (!character) {
      Alert.alert("错误", "角色信息不完整，无法上传图片");
      return;
    }
    try {
      setIsUploading(true);
      const timestamp = Date.now();
      const destinationUri = `${FileSystem.documentDirectory}character_${character.id}/uploaded_${timestamp}.jpg`;
      const dirUri = `${FileSystem.documentDirectory}character_${character.id}`;
      try {
        const dirInfo = await FileSystem.getInfoAsync(dirUri);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
        }
      } catch (dirError) {}
      await FileSystem.copyAsync({
        from: imageUri,
        to: destinationUri
      });
      const newImage: CharacterImage = {
        id: `uploaded_${timestamp}`,
        url: destinationUri,
        localUri: destinationUri,
        characterId: character.id,
        createdAt: timestamp,
        isFavorite: false,
        isUserUploaded: true,
        generationStatus: 'success',
      };
      addImageAndPersist(newImage);
      displayNotification("上传成功", "图片已添加到角色图库");
      setUpdateCounter(prev => prev + 1);
    } catch (error) {
      Alert.alert(
        "上传失败",
        "无法上传图片: " + (error instanceof Error ? error.message : String(error)),
        [{ text: "确定", style: "default" }]
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteImage = (imageId: string) => {
    setPersistedImages(prev => {
      const updated = prev.filter(img => img.id !== imageId);
      const imgToDelete = prev.find(img => img.id === imageId);
      if (imgToDelete && imgToDelete.localUri) {
        FileSystem.deleteAsync(imgToDelete.localUri, { idempotent: true }).catch(() => {});
        (async () => {
          const metaFile = getGalleryMetaFile(character.id);
          let meta: Record<string, any> = {};
          const metaInfo = await FileSystem.getInfoAsync(metaFile);
          if (metaInfo.exists) {
            try {
              meta = JSON.parse(await FileSystem.readAsStringAsync(metaFile));
            } catch {
              meta = {};
            }
          }
          delete meta[imgToDelete.id];
          await FileSystem.writeAsStringAsync(metaFile, JSON.stringify(meta));
        })();
      }
      return updated;
    });
    onDelete(imageId);
    setShowOptionsMenu(false);
    setUpdateCounter(prev => prev + 1);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.fullScreenContainer}>
        <TouchableOpacity
          style={styles.overlayBackdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <Animated.View
          style={[
            styles.bottomSheet,
            { transform: [{ translateY: slideAnim }] }
          ]}
        >
          <BlurView intensity={30} tint="dark" style={styles.blurView}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>角色图库</Text>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.uploadButton}
                  onPress={pickImageFromDevice}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="cloud-upload-outline" size={22} color="#fff" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={onClose}
                >
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.content}>
              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#ff9f1c" />
                  <Text style={styles.loadingText}>正在加载图像...</Text>
                </View>
              ) : allImages.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="images-outline" size={60} color="#555" />
                  <Text style={styles.emptyText}>暂无图片</Text>
                  <Text style={styles.emptySubText}>此角色还没有相册图片</Text>
                </View>
              ) : (
                <FlatList
                  data={allImages}
                  key={`gallery-${updateCounter}`}
                  keyExtractor={(item) => `${item.id}-${updateCounter}`}
                  numColumns={2}
                  contentContainerStyle={styles.galleryContainer}
                  extraData={updateCounter}
                  initialNumToRender={6}
                  maxToRenderPerBatch={10}
                  renderItem={({ item }) => (
                    <View style={styles.imageCard}>
                      <TouchableOpacity
                        style={styles.imageContainer}
                        onPress={() => handleViewImage(item)}
                      >
                        {item.generationStatus === 'pending' ? (
                          <View style={styles.pendingImageContainer}>
                            <ActivityIndicator size="large" color="#fff" />
                            <Text style={styles.pendingText}>生成中...</Text>
                          </View>
                        ) : downloadingImages[item.id] ? (
                          <View style={styles.pendingImageContainer}>
                            <ActivityIndicator size="small" color="#fff" />
                            <Text style={styles.pendingText}>下载中...</Text>
                          </View>
                        ) : (
                          <Image
                            source={{ uri: item.localUri || item.url }}
                            style={styles.thumbnail}
                            resizeMode="cover"
                            onError={(e) => console.log(`[图库侧栏] 加载图片失败: ${item.id}`, e.nativeEvent.error)}
                          />
                        )}

                        {item.isFavorite && (
                          <View style={styles.favoriteOverlay}>
                            <Ionicons name="heart" size={18} color="#FF6B6B" />
                          </View>
                        )}

                        {item.generationStatus !== 'pending' && !downloadingImages[item.id] && (
                          <TouchableOpacity
                            style={styles.optionsButtonOverlay}
                            onPress={() => showImageOptions(item)}
                          >
                            <View style={styles.optionsButton}>
                              <Ionicons name="ellipsis-horizontal" size={18} color="#fff" />
                            </View>
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                  onRefresh={() => {
                    if (isLoading) return;
                    setUpdateCounter(prev => prev + 1);
                  }}
                  refreshing={isLoading}
                />
              )}
            </View>
            {showNotification && (
              <Animated.View 
                style={[
                  styles.notification, 
                  { 
                    opacity: notificationAnim,
                    transform: [
                      { 
                        translateY: notificationAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-20, 0]
                        }) 
                      }
                    ],
                    top: 60
                  }
                ]}
              >
                <View style={styles.notificationIconContainer}>
                  <Ionicons name="checkmark-circle" size={24} color="rgb(255, 224, 195)" />
                </View>
                <View style={styles.notificationContent}>
                  <Text style={styles.notificationTitle}>{notificationMessage.title}</Text>
                  <Text style={styles.notificationMessage}>{notificationMessage.message}</Text>
                </View>
              </Animated.View>
            )}
          </BlurView>
        </Animated.View>
        {selectedImage && (
          <ImageEditorModal
            visible={showEditor}
            onClose={() => setShowEditor(false)}
            image={selectedImage}
            character={character}
            apiKey={apiKey}
            onSuccess={(newImage) => {
              handleEditSuccess(newImage);
              setUpdateCounter(prev => prev + 1);
            }}
          />
        )}

        <Modal
          visible={showFullImage}
          transparent={true}
          onRequestClose={() => setShowFullImage(false)}
          animationType="fade"
        >
          <View style={styles.fullImageContainer}>
            <TouchableOpacity
              style={styles.fullImageCloseButton}
              onPress={() => setShowFullImage(false)}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>

            {fullImageUri && (
              <Image
                source={{ uri: fullImageUri }}
                style={styles.fullImage}
                resizeMode="contain"
              />
            )}
          </View>
        </Modal>

        <Modal
          visible={showOptionsMenu}
          transparent={true}
          onRequestClose={() => setShowOptionsMenu(false)}
          animationType="fade"
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowOptionsMenu(false)}
          >
            <View style={styles.optionsMenuContainer}>
              <Text style={styles.optionsMenuTitle}>图像选项</Text>

              {activeImage && (
                <>
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      handleViewImage(activeImage);
                      setShowOptionsMenu(false);
                    }}
                  >
                    <Ionicons name="eye-outline" size={22} color="#FFF" />
                    <Text style={styles.menuItemText}>查看大图</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      onToggleFavorite(activeImage.id);
                      setShowOptionsMenu(false);
                    }}
                  >
                    <Ionicons
                      name={activeImage.isFavorite ? "heart" : "heart-outline"}
                      size={22}
                      color={activeImage.isFavorite ? "#FF6B6B" : "#FFF"}
                    />
                    <Text style={styles.menuItemText}>
                      {activeImage.isFavorite ? "取消收藏" : "收藏图片"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      handleEdit(activeImage);
                      setShowOptionsMenu(false);
                    }}
                  >
                    <Ionicons name="brush-outline" size={22} color="#FFF" />
                    <Text style={styles.menuItemText}>编辑图片</Text>
                  </TouchableOpacity>

                  {Platform.OS !== 'web' && (
                    <TouchableOpacity
                      style={styles.menuItem}
                      onPress={() => {
                        handleSaveImageToDevice(activeImage);
                        setShowOptionsMenu(false);
                      }}
                    >
                      <Ionicons name="download-outline" size={22} color="#FFF" />
                      <Text style={styles.menuItemText}>保存到相册</Text>
                    </TouchableOpacity>
                  )}

                  {Platform.OS !== 'web' && (
                    <TouchableOpacity
                      style={styles.menuItem}
                      onPress={async () => {
                        const imageUri = activeImage.localUri || activeImage.url;
                        if (imageUri && await Sharing.isAvailableAsync()) {
                          try {
                            let shareableUri = imageUri;
                            if (imageUri.startsWith('http')) {
                              const fileUri = `${FileSystem.documentDirectory}share_temp_${Date.now()}.jpg`;
                              const downloadResult = await FileSystem.downloadAsync(imageUri, fileUri);
                              shareableUri = downloadResult.uri;
                            }
                            await Sharing.shareAsync(shareableUri, {
                              mimeType: 'image/jpeg',
                              dialogTitle: '分享图片'
                            });
                          } catch (error) {
                            console.error("分享图片失败:", error);
                            Alert.alert("分享失败", "无法分享图片");
                          }
                        } else {
                          Alert.alert("分享功能不可用", "您的设备不支持分享功能");
                        }
                        setShowOptionsMenu(false);
                      }}
                    >
                      <Ionicons name="share-social-outline" size={22} color="#FFF" />
                      <Text style={styles.menuItemText}>分享图片</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      handleRegenerateImage(activeImage);
                      setShowOptionsMenu(false);
                    }}
                  >
                    <Ionicons name="refresh-outline" size={22} color="#FFF" />
                    <Text style={styles.menuItemText}>重新生成</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      handleSetAsBackground(activeImage.id);
                    }}
                  >
                    <Ionicons name="copy-outline" size={22} color="#FFF" />
                    <Text style={styles.menuItemText}>设为背景</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      handleSetAsAvatar(activeImage.id);
                    }}
                  >
                    <Ionicons name="person-outline" size={22} color="#FFF" />
                    <Text style={styles.menuItemText}>设为头像</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.menuItem, styles.deleteMenuItem]}
                    onPress={() => {
                      handleDeleteImage(activeImage.id);
                    }}
                  >
                    <Ionicons name="trash-outline" size={22} color="#FF6B6B" />
                    <Text style={[styles.menuItemText, styles.deleteMenuItemText]}>删除图片</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </TouchableOpacity>
        </Modal>

        {showRegenerationModal && character && (
          <ImageRegenerationModal
            visible={showRegenerationModal}
            character={character}
            onClose={() => setShowRegenerationModal(false)}
            initialSettingsState={lastImageGenSettings}
            initialSeed={lastImageGenSeed}
            onSuccess={(newImage, settingsState, usedSeed) => {
              handleAddNewImage(newImage);
              setShowRegenerationModal(false);
              if (settingsState) setLastImageGenSettings(settingsState);
              if (usedSeed) setLastImageGenSeed(usedSeed);
            }}
            existingImageConfig={regenerationImageConfig}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  bottomSheet: {
    width: '100%',
    height: height * 0.88,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
  },
  blurView: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(30,30,30,0.98)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 24,
    paddingBottom: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'transparent',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    padding: 8,
    marginLeft: 8,
  },
  uploadButton: {
    padding: 8,
    marginRight: 8,
    height: 36,
    width: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#888',
    fontSize: 18,
    marginTop: 16,
  },
  emptySubText: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
  },
  galleryContainer: {
    padding: 16,
  },
  imageCard: {
    width: (width - 64) / 2,
    marginHorizontal: 8,
    marginBottom: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(60,60,60,0.6)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  imageContainer: {
    width: '100%',
    height: ((width - 64) / 2) * 1.5,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  favoriteOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    padding: 4,
  },
  pendingImageContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  pendingText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 12,
  },
  imageTypeOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#ff9f1c',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  imageTypeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  optionsButtonOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    zIndex: 10,
  },
  optionsButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notification: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(40, 40, 40, 0.95)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
    borderLeftWidth: 4,
    borderLeftColor: 'rgb(255, 224, 195)',
    zIndex: 100,
  },
  notificationIconContainer: {
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    color: 'rgb(255, 224, 195)',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 4,
  },
  notificationMessage: {
    color: '#ffffff',
    fontSize: 14,
  },
  fullImageContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '100%',
    height: '90%',
  },
  fullImageCloseButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  optionsMenuContainer: {
    width: '100%',
    backgroundColor: 'rgba(40,40,40,0.98)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 32,
  },
  optionsMenuTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  menuItemText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 16,
  },
  deleteMenuItem: {
    borderBottomWidth: 0,
  },
  deleteMenuItemText: {
    color: '#FF6B6B',
  },
});

export default CharacterImageGallerySidebar;