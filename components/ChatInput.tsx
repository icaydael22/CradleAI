import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  Platform,
  Alert,
  Modal,
  Text,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { Character } from '@/shared/types';
import { useCharacters } from '@/constants/CharactersContext';
import { NodeSTManager } from '@/utils/NodeSTManager';
import { theme } from '@/constants/theme';
import ImageManager from '@/utils/ImageManager';
import { GeminiAdapter } from '@/NodeST/nodest/utils/gemini-adapter';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';
import PostChatService from '@/services/PostChat-service';

import { useChatActions } from '@/hooks/useChatActions';
import { useAppStateHandler } from '@/hooks/useAppStateHandler';
import { ChatActionMenu } from '@/components/menus/ChatActionMenu';
import { ImageGenerationModal } from '@/components/modals/ImageGenerationModal';
import { ImagePreviewModal } from '@/components/modals/ImagePreviewModal';
import { ImageEditModal } from '@/components/modals/ImageEditModal';
import { AuthorNoteModal } from '@/components/modals/AuthorNoteModal';
import { CustomSceneModal } from '@/components/modals/CustomSceneModal';

interface ChatInputProps {
  onSendMessage: (text: string, sender: 'user' | 'bot', isLoading?: boolean, metadata?: Record<string, any>) => Promise<string> | void;
  onMessageSendFailed?: (messageId: string, error: string) => void;
  selectedConversationId: string | null;
  conversationId: string;
  onResetConversation: () => void;
  selectedCharacter: Character;
  braveSearchEnabled?: boolean;
  toggleBraveSearch?: () => void;
  isTtsEnhancerEnabled?: boolean;
  onTtsEnhancerToggle?: () => void;
  onShowNovelAI?: () => void;
  onShowVNDB?: () => void;
  onShowMemoryPanel?: () => void;
  onShowFullHistory?: () => void;
  onGenerateImage?: (imageId: string, prompt: string) => void;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onMessageSendFailed,
  selectedConversationId,
  conversationId,
  onResetConversation,
  selectedCharacter,
  braveSearchEnabled = false,
  toggleBraveSearch,
  isTtsEnhancerEnabled = false,
  onTtsEnhancerToggle,
  onShowFullHistory,
  onGenerateImage,
}) => {
  // Basic UI state
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(40);
  const [showActions, setShowActions] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Modal states
  const [showImageGenModal, setShowImageGenModal] = useState(false);
  const [showImagePreviewModal, setShowImagePreviewModal] = useState(false);
  const [showImageEditModal, setShowImageEditModal] = useState(false);
  const [showAuthorNoteModal, setShowAuthorNoteModal] = useState(false);
  const [showCustomSceneModal, setShowCustomSceneModal] = useState(false);
  const [showImageUrlModal, setShowImageUrlModal] = useState(false);

  // Image handling state
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageType, setSelectedImageType] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');

  // Loading states
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isAbortAvailable, setIsAbortAvailable] = useState(false);

  const { clearGeneratedImages, clearAllGeneratedImages } = useCharacters();

  // Initialize chat actions hook
  const { state: chatState, actions: chatActions } = useChatActions({
    selectedConversationId,
    conversationId,
    selectedCharacter,
    onSendMessage,
    onMessageSendFailed,
    onGenerateImage,
  });

  const { isLoading, isContinuing } = chatState;

  // Handle abort available state changes
  const handleAbortAvailableChange = useCallback((available: boolean) => {
    setIsAbortAvailable(available);
  }, []);

  // Initialize app state handler
  useAppStateHandler({
    isLoading,
    isContinuing,
    selectedConversationId,
    onSendMessage,
    onAbortAvailableChange: handleAbortAvailableChange,
    resetLoadingState: chatActions.resetLoadingState,
  });

  // Handle keyboard dismiss
  useEffect(() => {
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
      setShowActions(false);
    });

    return () => {
      keyboardDidHideListener.remove();
    };
  }, []);

  // Set NodeST search state
  useEffect(() => {
    NodeSTManager.setSearchEnabled(braveSearchEnabled);
  }, [braveSearchEnabled]);

  // Handle text input send
  const handleSendPress = async () => {
    if (text.trim() === '') return;
    const messageToSend = text.trim();
    setText('');
    await chatActions.sendTextMessage(messageToSend);
  };

  // Handle continue conversation
  const handleContinue = async () => {
    await chatActions.continueConversation();
  };

  // Handle image operations
  const openImageOptions = () => {
    setShowActions(false);
    Alert.alert(
      '选择图片来源',
      '请选择如何添加图片',
      [
        { text: '拍摄照片', onPress: captureImage },
        { text: '从相册选择', onPress: pickImage },
        { text: '输入图片URL', onPress: () => setShowImageUrlModal(true) },
        { text: '取消', style: 'cancel' }
      ]
    );
  };

  const captureImage = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('需要权限', '需要相机访问权限才能拍摄照片。');
      return;
    }
    
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedAsset = result.assets[0];
        
        const manipResult = await manipulateAsync(
          selectedAsset.uri,
          [{ resize: { width: 1024 } }],
          { compress: 0.8, format: SaveFormat.JPEG, base64: true }
        );
        
        setSelectedImage(`data:image/jpeg;base64,${manipResult.base64}`);
        setSelectedImageType('image/jpeg');
        setShowImagePreviewModal(true);
      }
    } catch (error) {
      console.error('Error capturing image:', error);
      Alert.alert('错误', '拍摄照片时出现错误，请重试。');
    }
  };

  const pickImage = async () => {
    setShowActions(false);
    
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('需要权限', '需要照片库访问权限才能选择图片。');
      return;
    }
    
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedAsset = result.assets[0];
        
        const manipResult = await manipulateAsync(
          selectedAsset.uri,
          [{ resize: { width: 1024 } }],
          { compress: 0.8, format: SaveFormat.JPEG, base64: true }
        );
        
        setSelectedImage(`data:image/jpeg;base64,${manipResult.base64}`);
        setSelectedImageType('image/jpeg');
        setShowImagePreviewModal(true);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('错误', '选择图片时出现错误，请重试。');
    }
  };

  const handleImageUrlSubmit = () => {
    if (imageUrl.trim()) {
      setSelectedImage(imageUrl.trim());
      setSelectedImageType('url');
      setShowImageUrlModal(false);
      setShowImagePreviewModal(true);
    } else {
      Alert.alert('错误', '请输入有效的图片URL');
    }
  };

  const handleSendImage = async () => {
    if (!selectedImage || !selectedImageType) return;
    
    setShowImagePreviewModal(false);
    await chatActions.sendImage(selectedImage, selectedImageType);
    setSelectedImage(null);
    setSelectedImageType(null);
  };

  // Handle image editing
  const handleStartImageEdit = async (referenceImage: string, referenceImageType: string, editPrompt: string) => {
    if (!selectedConversationId) {
      Alert.alert('错误', '请先选择一个角色');
      return;
    }

    try {
      setIsGeneratingImage(true);
      
      const apiKey = selectedCharacter?.id || '';
      if (!apiKey) {
        throw new Error("API密钥未设置");
      }
      
      const geminiAdapter = new GeminiAdapter(apiKey);
      
      const userMessage = `请将这张图片${editPrompt}`;
      await onSendMessage(userMessage, "user");
      
      try {
        await StorageAdapter.addUserMessage(selectedConversationId, userMessage);
      } catch (error) {
        console.error('[ChatInput] Failed to save edit request to NodeST:', error);
      }
      
      setTimeout(() => {
        onSendMessage('正在编辑图片...', "bot", true);
      }, 100);
      
      let imageInput;
      if (referenceImageType === 'url') {
        imageInput = { url: referenceImage };
      } else {
        const base64Data = referenceImage.includes('base64,') 
          ? referenceImage.split('base64,')[1] 
          : referenceImage;
        
        imageInput = {
          data: base64Data,
          mimeType: referenceImageType || 'image/jpeg'
        };
      }
      
      const editedImage = await geminiAdapter.editImage(imageInput, editPrompt, {
        temperature: 0.8
      });
      
      if (editedImage) {
        try {
          const cacheResult = await ImageManager.cacheImage(editedImage, 'image/png');
          const imageMessage = `![编辑后的图片](image:${cacheResult.id})`;
          
          onSendMessage(imageMessage, 'bot');
          
          try {
            await StorageAdapter.addAiMessage(selectedConversationId, imageMessage);
          } catch (error) {
            console.error('[ChatInput] Failed to save edited image message to NodeST:', error);
          }
          
          setTimeout(() => {
            Alert.alert(
              '图片已编辑完成',
              '是否保存编辑后的图片到相册？',
              [
                { text: '取消', style: 'cancel' },
                { 
                  text: '保存', 
                  onPress: async () => {
                    const result = await ImageManager.saveToGallery(cacheResult.id);
                    Alert.alert(result.success ? '成功' : '错误', result.message);
                  }
                },
                {
                  text: '分享',
                  onPress: async () => {
                    const shared = await ImageManager.shareImage(cacheResult.id);
                    if (!shared) {
                      Alert.alert('错误', '分享功能不可用');
                    }
                  }
                }
              ]
            );
          }, 500);
        } catch (cacheError) {
          console.error('[ChatInput] Error caching edited image:', cacheError);
          const errorMessage = '图像已编辑，但保存过程中出现错误。';
          onSendMessage(errorMessage, 'bot');
        }
      } else {
        const errorMessage = '抱歉，我无法编辑这张图片。可能是因为编辑指令不够明确，或者模型暂不支持这种编辑操作。';
        onSendMessage(errorMessage, 'bot');
      }
    } catch (error) {
      console.error('Error editing image:', error);
      const errorMessage = '抱歉，编辑图片时出现了错误，请重试。';
      onSendMessage(errorMessage, 'bot');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Handle reset conversation
  const handleResetConversation = () => {
    Alert.alert(
      '确定要重置对话吗？',
      '这将清除所有对话历史记录、生成的图片和图片缓存，但保留角色的开场白。',
      [
        { text: '取消', style: 'cancel' },
        { 
          text: '重置', 
          style: 'destructive',
          onPress: async () => {
            try {
              chatActions.updateState({ isLoading: true });
              
              if (!selectedConversationId) {
                Alert.alert('错误', '请先选择一个角色');
                return;
              }

              await clearGeneratedImages(selectedConversationId);
              await ImageManager.clearCache();

              const success = await NodeSTManager.resetChatHistory(conversationId);
              
              if (success) {
                onResetConversation();
              } else {
                Alert.alert('错误', '重置对话失败，请重试');
              }
              
              setShowActions(false);
            } catch (error) {
              console.error('[ChatInput] Error during conversation reset:', error);
              Alert.alert('错误', '重置对话时出现错误');
            } finally {
              chatActions.updateState({ isLoading: false });
            }
          }
        },
      ]
    );
  };

  // Handle image cache management
  const handleManageImageCache = async () => {
    try {
      const cacheInfo = await ImageManager.getCacheInfo();
      
      const sizeMB = (cacheInfo.totalSize / (1024 * 1024)).toFixed(2);
      
      Alert.alert(
        '图片缓存管理',
        `当前缓存了 ${cacheInfo.count} 张图片，占用 ${sizeMB} MB 存储空间。${
          cacheInfo.oldestImage ? `\n最早的图片缓存于 ${cacheInfo.oldestImage.toLocaleDateString()}` : ''
        }`,
        [
          { text: '取消', style: 'cancel' },
          { 
            text: '清空当前会话图片', 
            onPress: async () => {
              if (selectedConversationId) {
                await clearGeneratedImages(selectedConversationId);
                Alert.alert('成功', '已清空当前会话的生成图片缓存');
              } else {
                Alert.alert('错误', '没有选择会话');
              }
            }
          },
          { 
            text: '清空所有缓存', 
            style: 'destructive',
            onPress: async () => {
              const result = await ImageManager.clearCache();
              await clearAllGeneratedImages();
              
              Alert.alert(
                result.success ? '成功' : '错误', 
                result.success ? '已清空所有图片缓存和生成图片记录' : result.message
              );
            }
          }
        ]
      );
    } catch (error) {
      console.error('[ChatInput] Error managing cache:', error);
      Alert.alert('错误', '获取缓存信息失败');
    }
  };

  // Handle custom auto generate image
  const handleCustomAutoGenerateImage = async (customPrompt: string) => {
    if (!selectedConversationId || !selectedCharacter) {
      Alert.alert('错误', '请先选择一个角色');
      return;
    }

    try {
      setIsGeneratingImage(true);
      Alert.alert('提示', '正在生成自定义场景图片，请稍候...');
      
      const options = {
        customPrompt: customPrompt,
        useBackgroundConfig: false
      };
      
      const result = await PostChatService.getInstance().autoGenerateImage(
        selectedCharacter.id,
        conversationId,
        options,
        (imageId: string, prompt: string) => {
          if (onGenerateImage) {
            onGenerateImage(imageId, prompt);
          }
        }
      );

      if (result.success) {
        Alert.alert('成功', '已生成自定义场景图片');
      } else {
        Alert.alert('错误', `生成图片失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('Error custom auto generating image:', error);
      Alert.alert('错误', '生成图片时出现了错误，请重试。');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const toggleActionMenu = () => {
    Keyboard.dismiss();
    setShowActions(!showActions);
  };

  const handleContentSizeChange = (event: any) => {
    const { height } = event.nativeEvent.contentSize;
    const newHeight = Math.min(Math.max(40, height), 120);
    setInputHeight(newHeight);
  };

  const handleBraveSearchToggle = () => {
    setShowActions(false);
    if (toggleBraveSearch) {
      toggleBraveSearch();
    }
  };
  
  const handleTtsEnhancerToggle = () => {
    setShowActions(false);
    if (onTtsEnhancerToggle) {
      onTtsEnhancerToggle();
    }
  };

  const handleShowFullHistory = () => {
    setShowActions(false);
    if (onShowFullHistory) onShowFullHistory();
  };

  const handleEditAuthorNote = () => {
    setShowActions(false);
    setShowAuthorNoteModal(true);
  };

  const openImageGenModal = () => {
    setShowActions(false);
    setShowImageGenModal(true);
  };

  const handleCustomAutoGenerateImageModal = () => {
    setShowActions(false);
    setShowCustomSceneModal(true);
  };

  return (
    <View style={styles.container}>
      <ChatActionMenu
        visible={showActions}
        onClose={() => setShowActions(false)}
        onResetConversation={handleResetConversation}
        onOpenImageOptions={openImageOptions}
        onOpenImageGenModal={openImageGenModal}
        onCustomAutoGenerateImage={handleCustomAutoGenerateImageModal}
        onManageImageCache={handleManageImageCache}
        onBraveSearchToggle={handleBraveSearchToggle}
        onTtsEnhancerToggle={handleTtsEnhancerToggle}
        onEditAuthorNote={handleEditAuthorNote}
        onShowFullHistory={handleShowFullHistory}
        braveSearchEnabled={braveSearchEnabled}
        isTtsEnhancerEnabled={isTtsEnhancerEnabled}
      />

      <View style={styles.inputContainer}>
        <TouchableOpacity
          style={[styles.button, styles.plusButton, showActions && styles.activeButton, styles.smallButton]}
          onPress={toggleActionMenu}
        >
          <MaterialIcons
            name="add"
            size={20}
            color={theme.colors.primary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.continueButton, styles.smallButton, (isLoading || isContinuing) && styles.disabledButton]}
          onPress={handleContinue}
          disabled={isLoading || isContinuing}
        >
          <Ionicons name="play-forward" size={18} color={theme.colors.primary} />
        </TouchableOpacity>

        <TextInput
          ref={inputRef}
          style={[styles.textInput, { height: Math.max(40, Math.min(inputHeight, 120)) }]}
          value={text}
          onChangeText={setText}
          placeholder="输入消息..."
          placeholderTextColor="#999"
          multiline
          onContentSizeChange={handleContentSizeChange}
          editable={!isLoading}
        />
        
        <View style={styles.buttonContainer}>
          {(isLoading || isContinuing) && (
            <TouchableOpacity
              style={[styles.button, styles.abortButton, styles.smallButton]}
              onPress={chatActions.handleAbortRequest}
            >
              <Ionicons name="stop" size={18} color="#e74c3c" />
            </TouchableOpacity>
          )}
          
          {!isLoading && !isContinuing && (
            <TouchableOpacity
              style={[styles.button, styles.sendButton, styles.smallButton]}
              onPress={handleSendPress}
              disabled={isLoading || isContinuing || text.trim() === ''}
            >
              <Ionicons name="send" size={18} color={text.trim() === '' ? '#777' : theme.colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Modals */}
      <ImageGenerationModal
        visible={showImageGenModal}
        onClose={() => setShowImageGenModal(false)}
        onGenerate={(imageId: string, prompt: string) => {
          if (onGenerateImage) {
            onGenerateImage(imageId, prompt);
          }
        }}
        selectedCharacter={selectedCharacter}
      />

      <ImagePreviewModal
        visible={showImagePreviewModal}
        onClose={() => setShowImagePreviewModal(false)}
        onSendImage={handleSendImage}
        imageUri={selectedImage}
        isLoading={isLoading}
      />

      <ImageEditModal
        visible={showImageEditModal}
        onClose={() => setShowImageEditModal(false)}
        onStartEdit={handleStartImageEdit}
        isGeneratingImage={isGeneratingImage}
      />

      <AuthorNoteModal
        visible={showAuthorNoteModal}
        onClose={() => setShowAuthorNoteModal(false)}
        selectedCharacter={selectedCharacter}
      />

      <CustomSceneModal
        visible={showCustomSceneModal}
        onClose={() => setShowCustomSceneModal(false)}
        onGenerate={handleCustomAutoGenerateImage}
        isGenerating={isGeneratingImage}
      />

      {/* Simple Image URL Modal */}
      <Modal
        visible={showImageUrlModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowImageUrlModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>输入图片URL</Text>
            <TextInput
              style={styles.urlInput}
              placeholder="请输入图片URL..."
              placeholderTextColor="#999"
              value={imageUrl}
              onChangeText={setImageUrl}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.modalButton}
                onPress={() => setShowImageUrlModal(false)}
              >
                <Text style={styles.modalButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={handleImageUrlSubmit}
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>确定</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 'auto',
    marginBottom: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(40, 40, 40, 0.9)',
    borderRadius: 24,
    padding: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    minHeight: 44,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    textAlignVertical: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 2,
  },
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 2,
  },
  smallButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    minWidth: 32,
    minHeight: 32,
  },
  plusButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  activeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  sendButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  continueButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 2,
  },
  disabledButton: {
    opacity: 0.5,
  },
  abortButton: {
    backgroundColor: '#e74c3c',
  },
  loadingButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#333',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  urlInput: {
    backgroundColor: '#444',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#555',
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: theme.colors.primary,
  },
  modalButtonText: {
    color: '#ddd',
    fontWeight: 'bold',
  },
});

export default ChatInput;