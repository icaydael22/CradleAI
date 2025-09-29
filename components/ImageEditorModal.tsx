import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Dimensions,
  Platform,
  Alert,
  Image // Import from react-native, not global HTML
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { CharacterImage, CradleCharacter } from '@/shared/types';
import { GeminiAdapter } from '@/NodeST/nodest/utils/gemini-adapter';
import * as FileSystem from 'expo-file-system';
// Remove the uuid import

const { width, height } = Dimensions.get('window');

// Helper function to generate unique ID without using uuid
const generateUniqueId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

interface ImageEditorModalProps {
  visible: boolean;
  image: CharacterImage;
  character: CradleCharacter;
  onClose: () => void;
  onSuccess: (editedImage: CharacterImage) => void;
  apiKey: string; // Add apiKey as a required prop
}

const ImageEditorModal: React.FC<ImageEditorModalProps> = ({
  visible,
  image,
  character,
  onClose,
  onSuccess,
  apiKey // Use apiKey from props
}) => {
  const [editMode, setEditMode] = useState<'edit' | 'style'>('edit');
  const [editPrompt, setEditPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);

  // Initialize GeminiAdapter only when apiKey is available
  const [geminiAdapter, setGeminiAdapter] = useState<GeminiAdapter | null>(null);
  const [safetyWarning, setSafetyWarning] = useState<string | null>(null);

  useEffect(() => {
    if (visible && apiKey) {
      setGeminiAdapter(new GeminiAdapter(apiKey));
      loadImageData();
      // Reset warning state when modal opens
      setSafetyWarning(null);
    }
  }, [visible, apiKey]);

  const loadImageData = async () => {
    try {
      setIsLoading(true);
      const uri = image.localUri || image.url;
      
      if (!uri) {
        throw new Error("无法加载图片：找不到图片地址");
      }
      
      // For local images
      if (uri.startsWith('file://') || uri.startsWith('/')) {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64
        });
        setImageBase64(base64);
      } 
      // For remote images
      else {
        // Download the image first
        const fileInfo = await FileSystem.downloadAsync(
          uri,
          FileSystem.cacheDirectory + 'temp_image.jpg'
        );
        
        if (fileInfo.status === 200) {
          const base64 = await FileSystem.readAsStringAsync(fileInfo.uri, {
            encoding: FileSystem.EncodingType.Base64
          });
          setImageBase64(base64);
        } else {
          throw new Error(`下载图片失败，状态码: ${fileInfo.status}`);
        }
      }
    } catch (error) {
      console.error('[图像编辑器] 加载图片失败:', error);
      Alert.alert('加载失败', '无法加载图片数据');
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  // Modified handleApplyEdit with enhanced logging and cleaner request format
  const handleApplyEdit = async () => {
    if (!editPrompt) {
      Alert.alert('提示词不能为空', '请输入编辑指令');
      return;
    }

    if (!geminiAdapter || !imageBase64) {
      Alert.alert('初始化错误', 'API适配器或图像数据未正确加载');
      return;
    }

    // Clear any previous safety warning
    setSafetyWarning(null);
    setIsLoading(true);
    
    try {
      console.log(`[图像编辑器] 开始处理图像编辑，提示词: ${editPrompt}`);
      
      // Create a clear and specific prompt for the image edit
      const formattedPrompt = `请将这张图片${editPrompt}。输出编辑后的图片，保持原图的基本元素和构成。`;
      
      // Make the API request using generateMultiModalContent directly
      const result = await geminiAdapter.generateMultiModalContent(formattedPrompt, {
        includeImageOutput: true,  // Explicitly request image output
        temperature: 0.8,
        images: [{ 
          data: imageBase64, 
          mimeType: 'image/jpeg'
        }]
      });
      
      console.log('[图像编辑器] 请求已发送，等待响应');
      
      // Check for safety issues in the raw response data
      try {
        // This would be the raw response data from the API call
        // We're checking if there was an IMAGE_SAFETY finishReason
        if ((result as any)._rawResponse?.candidates?.[0]?.finishReason === 'IMAGE_SAFETY') {
          console.warn('[图像编辑器] 请求被安全过滤拦截: IMAGE_SAFETY');
          setSafetyWarning('此图像编辑请求被AI安全过滤系统拒绝，可能包含不适宜的内容或涉及儿童图像的修改。请尝试其他编辑方式。');
          return;
        }
      } catch (err) {
        // If we can't check for the raw response, continue with normal processing
      }
      
      // Process the result
      if (result.images && result.images.length > 0) {
        console.log('[图像编辑器] 成功收到编辑后的图像');
        setEditedImage(result.images[0]);
      } else {
        console.log('[图像编辑器] 首次尝试未收到图像，将尝试英文提示');
        
        // Check if there's a safety message in the text response
        if (result.text && (
            result.text.toLowerCase().includes('safety') || 
            result.text.toLowerCase().includes('policy') ||
            result.text.toLowerCase().includes('cannot generate')
        )) {
          setSafetyWarning('此图像编辑请求被AI安全过滤系统拒绝。' + result.text);
          return;
        }
        
        // Fallback to English prompt if Chinese doesn't work
        const englishPrompt = `Edit this image to ${editPrompt}. Return the edited image maintaining the basic elements and composition of the original.`;
        
        const secondAttempt = await geminiAdapter.generateMultiModalContent(englishPrompt, {
          includeImageOutput: true,
          temperature: 0.85,
          images: [{ 
            data: imageBase64, 
            mimeType: 'image/jpeg'
          }]
        });
        
        // Check for safety issues in the second attempt
        try {
          if ((secondAttempt as any)._rawResponse?.candidates?.[0]?.finishReason === 'IMAGE_SAFETY') {
            console.warn('[图像编辑器] 英文请求也被安全过滤拦截: IMAGE_SAFETY');
            setSafetyWarning('此图像编辑请求被AI安全过滤系统拒绝，可能包含不适宜的内容或涉及儿童图像的修改。请尝试其他编辑方式。');
            return;
          }
        } catch (err) {
          // If we can't check for the raw response, continue with normal processing
        }
        
        if (secondAttempt.images && secondAttempt.images.length > 0) {
          console.log('[图像编辑器] 英文提示成功收到编辑后的图像');
          setEditedImage(secondAttempt.images[0]);
        } else if (secondAttempt.text && (
          secondAttempt.text.toLowerCase().includes('safety') || 
          secondAttempt.text.toLowerCase().includes('policy') ||
          secondAttempt.text.toLowerCase().includes('cannot generate')
        )) {
          setSafetyWarning('此图像编辑请求被AI安全过滤系统拒绝。' + secondAttempt.text);
        } else {
          console.error('[图像编辑器] 图像编辑失败，未收到图像输出');
          Alert.alert('编辑失败', '未能生成编辑后的图像，请尝试更明确的编辑指令');
        }
      }
    } catch (error) {
      console.error('[图像编辑器] 编辑图像失败:', error);
      
      // Check if the error message indicates a safety issue
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.toLowerCase().includes('safety') || 
          errorMessage.toLowerCase().includes('policy') ||
          errorMessage.toLowerCase().includes('image_safety')) {
        setSafetyWarning('此图像编辑请求被AI安全过滤系统拒绝，可能包含不适宜的内容或涉及儿童图像的修改。请尝试其他编辑方式。');
      } else {
        Alert.alert('编辑失败', '与API通信时出错，请稍后重试');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editedImage) return;

    try {
      setIsLoading(true);
      console.log('[图像编辑器] 开始保存编辑后的图像');

      // Generate a local file path for saving
      const fileName = `${character.id}_${Date.now()}.jpg`;
      const fileUri = `${FileSystem.documentDirectory}images/${fileName}`;
      
      // Ensure the directory exists
      await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}images/`, {
        intermediates: true
      }).catch(() => {/* Directory might already exist */});
      
      // Write the base64 data to a file
      await FileSystem.writeAsStringAsync(fileUri, editedImage, {
        encoding: FileSystem.EncodingType.Base64
      });
      
      console.log('[图像编辑器] 图像已保存到本地路径');

      // Create a new CharacterImage object with a generated ID
      const newImage: CharacterImage = {
        id: generateUniqueId(),
        url: `data:image/jpeg;base64,${editedImage}`,
        localUri: fileUri,
        createdAt: Date.now(),
        tags: {
          positive: [editPrompt],
          negative: []
        },
        isFavorite: false,
        isEdited: true,
        originalImageId: image.id,
        data: editedImage, // Store the base64 data
        isAvatar: image.isAvatar,
        characterId: character.id
      };

      // Call the onSuccess callback with the new image
      onSuccess(newImage);
      console.log('[图像编辑器] 编辑成功，返回新图像');
      onClose();
    } catch (error) {
      console.error('[图像编辑器] 保存图片失败:', error);
      Alert.alert('保存失败', `无法保存编辑后的图片: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>编辑图像</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Add a warning banner */}
        {safetyWarning && (
          <View style={styles.safetyWarningContainer}>
            <Ionicons name="warning-outline" size={24} color="#FFD700" style={styles.warningIcon} />
            <Text style={styles.safetyWarningText}>{safetyWarning}</Text>
          </View>
        )}

        <ScrollView style={styles.content}>
          <View style={styles.imagePreviewContainer}>
            <View style={styles.imageContainer}>
              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={theme.colors.primary} />
                  <Text style={styles.loadingText}>正在处理图像...</Text>
                </View>
              ) : (
                <Image
                  source={{ 
                    uri: editedImage 
                      ? `data:image/jpeg;base64,${editedImage}` 
                      : imageBase64 
                        ? `data:image/jpeg;base64,${imageBase64}` 
                        : image.localUri || image.url 
                  }}
                  style={styles.imagePreview}
                  resizeMode="contain"
                />
              )}
            </View>
          </View>
          
          {/* Content disclaimer */}
          <View style={styles.disclaimerContainer}>
            <Text style={styles.disclaimerText}>
              提示：编辑图像功能受AI安全过滤系统限制，不适宜的内容请求将被拒绝。特别是涉及儿童图像的某些修改可能会被系统自动拒绝。
            </Text>
          </View>
          
          <View style={styles.modeTabs}>
            <ScrollView horizontal contentContainerStyle={styles.modeTabsContent}>
              <TouchableOpacity
                style={[styles.modeTab, editMode === 'edit' && styles.activeModeTab]}
                onPress={() => setEditMode('edit')}
              >
                <Ionicons name="create-outline" size={16} color={editMode === 'edit' ? theme.colors.primary : '#fff'} />
                <Text style={[styles.modeTabText, editMode === 'edit' && styles.activeModeTabText]}>编辑</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeTab, editMode === 'style' && styles.activeModeTab]}
                onPress={() => setEditMode('style')}
              >
                <Ionicons name="color-palette-outline" size={16} color={editMode === 'style' ? theme.colors.primary : '#fff'} />
                <Text style={[styles.modeTabText, editMode === 'style' && styles.activeModeTabText]}>风格</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
          {editMode === 'edit' && (
            <View style={styles.controlContainer}>
              <Text style={styles.controlTitle}>编辑指令</Text>
              <Text style={styles.controlDescription}>输入您希望对图像进行的编辑操作，例如"将背景改为蓝色海滩"。</Text>
              <TextInput
                style={styles.promptInput}
                placeholder="输入编辑指令..."
                placeholderTextColor="#888"
                multiline
                value={editPrompt}
                onChangeText={setEditPrompt}
              />
            </View>
          )}
          {editMode === 'style' && (
            <View style={styles.controlContainer}>
              <Text style={styles.controlTitle}>选择风格</Text>
              <Text style={styles.controlDescription}>选择一种风格应用到图像上。</Text>
              <ScrollView horizontal contentContainerStyle={styles.optionsScroll}>
                <TouchableOpacity
                  style={[styles.styleOption, selectedStyle === 'anime' && styles.selectedOption]}
                  onPress={() => {
                    setSelectedStyle('anime');
                    setEditPrompt('转换为动漫风格');
                  }}
                >
                  <Text style={styles.styleOptionTitle}>动漫风格</Text>
                  <Text style={styles.styleOptionDesc}>经典二次元动漫风格</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.styleOption, selectedStyle === 'pixel' && styles.selectedOption]}
                  onPress={() => {
                    setSelectedStyle('pixel');
                    setEditPrompt('转换为像素艺术风格');
                  }}
                >
                  <Text style={styles.styleOptionTitle}>像素风格</Text>
                  <Text style={styles.styleOptionDesc}>复古像素艺术风格</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.styleOption, selectedStyle === 'watercolor' && styles.selectedOption]}
                  onPress={() => {
                    setSelectedStyle('watercolor');
                    setEditPrompt('转换为水彩画风格');
                  }}
                >
                  <Text style={styles.styleOptionTitle}>水彩风格</Text>
                  <Text style={styles.styleOptionDesc}>柔和的水彩画风格</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
        </ScrollView>
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.applyButton, (!editPrompt || isLoading) && styles.disabledButton]}
            onPress={handleApplyEdit}
            disabled={!editPrompt || !imageBase64 || isLoading}
          >
            <Text style={styles.actionButtonText}>应用编辑</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.saveButton, !editedImage && styles.disabledButton]}
            onPress={handleSave}
            disabled={!editedImage}
          >
            <Text style={styles.actionButtonText}>保存图像</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 40 : 16,
    paddingBottom: 16,
    backgroundColor: '#222',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 8,
  },

  // New styles for safety warnings
  safetyWarningContainer: {
    backgroundColor: 'rgba(50, 0, 0, 0.7)',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningIcon: {
    marginRight: 10,
  },
  safetyWarningText: {
    color: '#FFD700',
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  disclaimerContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    padding: 12,
    borderRadius: 8,
    margin: 16,
  },
  disclaimerText: {
    color: '#aaa',
    fontSize: 12,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  
  content: {
    flex: 1,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  imagePreviewContainer: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageContainer: {
    width: width * 0.9,
    height: height * 0.3,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 12,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  modeTabs: {
    marginTop: 12,
  },
  modeTabsContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  modeTab: {
    backgroundColor: '#333',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeModeTab: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  modeTabText: {
    color: '#fff',
    marginLeft: 6,
    fontSize: 14,
  },
  activeModeTabText: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  controlContainer: {
    padding: 16,
    backgroundColor: '#222',
    borderRadius: 12,
    margin: 16,
    marginTop: 0,
  },
  controlTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  controlDescription: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  promptInput: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  optionsScroll: {
    flexDirection: 'row'
  },
  styleOption: {
    backgroundColor: '#333',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 12,
    width: 140,
  },
  selectedOption: {
    backgroundColor: theme.colors.primary,
  },
  styleOptionTitle: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 4,
  },
  styleOptionDesc: {
    color: '#aaa',
    fontSize: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#222',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyButton: {
    backgroundColor: theme.colors.accent,
    marginRight: 8,
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    marginLeft: 8,
  },
  disabledButton: {
    backgroundColor: '#444',
    opacity: 0.5,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default ImageEditorModal;