import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Dimensions,
  StatusBar,
  Platform,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NovelAIService from '@/services/novelai/NovelAIService';

// Context and hooks
import { useCharacters } from '@/constants/CharactersContext';
import { useUser } from '@/constants/UserContext';
import { CircleService } from '@/services/circle-service';

const { width, height } = Dimensions.get('window');
const MAX_IMAGES = 9; // 微信朋友圈最多9张图片
const IMAGE_SIZE = (width - 64) / 3; // 3列布局，考虑间距

interface CreatePostPageProps {}

const CreatePostPage: React.FC<CreatePostPageProps> = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { user } = useUser();
  const { characters, setCharacters } = useCharacters();
  
  // 从路由参数获取发布者信息
  const publisherIdParam = params.publisherId as string | undefined;
  const publisherTypeParam = params.publisherType as 'user' | 'character' | undefined;
  
  // 状态管理
  const [postText, setPostText] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showLocationSelector, setShowLocationSelector] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [tagText, setTagText] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [publisherType, setPublisherType] = useState<'user' | 'character'>(publisherTypeParam || 'user');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | undefined>(publisherTypeParam === 'character' ? publisherIdParam : undefined);
  // AI 生图相关状态
  const [aiPromptModalVisible, setAiPromptModalVisible] = useState(false);
  const [aiPromptText, setAiPromptText] = useState('');
  const [savedAIPrompts, setSavedAIPrompts] = useState<string[]>([]);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  
  const textInputRef = useRef<TextInput>(null);

  // 获取发布者信息
  const publisher = publisherType === 'user' ? user : characters.find(c => c.id === (selectedCharacterId || publisherIdParam));
  
  useEffect(() => {
    // 自动聚焦文本输入框
    setTimeout(() => {
      textInputRef.current?.focus();
    }, 300);
  }, []);

  // 生图 Prompt 历史持久化
  const PROMPT_STORAGE_KEY = 'create_post_ai_prompts';

  const loadSavedPrompts = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(PROMPT_STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setSavedAIPrompts(arr);
      }
    } catch (e) {
      console.warn('加载生图Prompt历史失败:', e);
    }
  }, []);

  const persistSavedPrompts = useCallback(async (list: string[]) => {
    try {
      setSavedAIPrompts(list);
      await AsyncStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('保存生图Prompt历史失败:', e);
    }
  }, []);

  const savePromptIfNew = useCallback(async (text: string) => {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    const deduped = [trimmed, ...savedAIPrompts.filter((p) => p !== trimmed)].slice(0, 50);
    await persistSavedPrompts(deduped);
  }, [persistSavedPrompts, savedAIPrompts]);

  const deleteSavedPrompt = useCallback(async (text: string) => {
    const next = savedAIPrompts.filter((p) => p !== text);
    await persistSavedPrompts(next);
  }, [persistSavedPrompts, savedAIPrompts]);

  useEffect(() => {
    loadSavedPrompts();
  }, [loadSavedPrompts]);

  // 选择图片
  const handleSelectImages = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('权限不足', '需要访问相册权限来选择图片');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: MAX_IMAGES - selectedImages.length,
      });

      if (!result.canceled && result.assets) {
        const newImages = result.assets.map(asset => asset.uri);
        setSelectedImages(prev => [...prev, ...newImages].slice(0, MAX_IMAGES));
      }
    } catch (error) {
      console.error('选择图片失败:', error);
      Alert.alert('错误', '选择图片失败');
    }
  }, [selectedImages.length]);

  // 拍照
  const handleTakePhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('权限不足', '需要相机权限来拍照');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]) {
        if (selectedImages.length < MAX_IMAGES) {
          setSelectedImages(prev => [...prev, result.assets[0].uri]);
        } else {
          Alert.alert('提示', `最多只能添加${MAX_IMAGES}张图片`);
        }
      }
    } catch (error) {
      console.error('拍照失败:', error);
      Alert.alert('错误', '拍照失败');
    }
  }, [selectedImages.length]);

  // 删除图片
  const handleRemoveImage = useCallback((index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  // 发布帖子
  const handlePublish = useCallback(async () => {
    if (!postText.trim() && selectedImages.length === 0) {
      Alert.alert('提示', '请输入内容或选择图片');
      return;
    }

    if (publisherType === 'character' && !publisher) {
      Alert.alert('错误', '请选择要以哪个角色发布');
      return;
    }

    try {
      setIsPublishing(true);
      // 统一获取API配置
      const apiKey = user?.settings?.chat?.characterApiKey;
      const apiSettings = {
        apiProvider: user?.settings?.chat?.apiProvider || 'gemini',
        openrouter: user?.settings?.chat?.openrouter,
        cradlecloud: user?.settings?.chat?.cradlecloud,
      } as any;

      if (publisherType === 'user') {
        // 用户发朋友圈：调用 CircleService.createUserPost（会立即保存到存储，并触发角色回应）
        await CircleService.createUserPost(
          user?.settings?.self.nickname || '我',
          user?.avatar || null,
          postText,
          selectedImages,
          apiKey,
          apiSettings,
          characters
        );
      } else {
        // 角色发朋友圈：调用 CircleService.createNewPost（会初始化角色并调用 CircleManager.circlePost）
        const character = characters.find(c => c.id === (selectedCharacterId || publisherIdParam));
        if (!character) {
          Alert.alert('错误', '未找到该角色，发布失败');
          setIsPublishing(false);
          return;
        }
        
        // 过滤出其他启用朋友圈互动的角色
        const otherCharacters = characters.filter(c => 
          c.id !== character.id && c.circleInteraction
        );
        
        const res = await CircleService.createNewPost(
          character,
          postText,
          apiKey,
          apiSettings,
          selectedImages, // 新增：将用户选择的图片传给服务层
          otherCharacters // 新增：传递其他角色列表用于回复
        );
        if (!res.success) {
          Alert.alert('发布失败', res.error || '请稍后重试');
          setIsPublishing(false);
          return;
        }
      }

      // 返回列表页，Explore 将在聚焦时刷新
      router.back();
      
    } catch (error) {
      console.error('发布失败:', error);
      Alert.alert('错误', '发布失败，请重试');
    } finally {
      setIsPublishing(false);
    }
  }, [postText, selectedImages, selectedLocation, tagText, publisher, selectedCharacterId, publisherType, publisherIdParam, router]);

  // 渲染图片网格
  const renderImageGrid = () => {
    const images = [...selectedImages];
    
    // 如果还能添加更多图片，显示添加按钮
    if (images.length < MAX_IMAGES) {
      images.push('add_button');
    }

    return (
      <View style={styles.imageGrid}>
        {images.map((item, index) => {
          if (item === 'add_button') {
            return (
              <TouchableOpacity
                key="add_button"
                style={styles.addImageButton}
                onPress={() => {
                  Alert.alert(
                    '选择图片',
                    '请选择图片来源',
                    [
                      { text: '从相册选择', onPress: handleSelectImages },
                      { text: '拍照', onPress: handleTakePhoto },
                      { text: '取消', style: 'cancel' },
                    ]
                  );
                }}
              >
                <Ionicons name="add" size={32} color="#999" />
              </TouchableOpacity>
            );
          }

          return (
            <View key={index} style={styles.imageWrapper}>
              <Image source={{ uri: item.split('#')[0] }} style={styles.selectedImage} />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => handleRemoveImage(index)}
              >
                <Ionicons name="close-circle" size={20} color="#ff4444" />
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    );
  };

  // 触发 AI 生图
  const handleGenerateAIImages = useCallback(async () => {
    const promptText = aiPromptText.trim();
    if (!promptText) {
      Alert.alert('提示', '请输入生图提示词');
      return;
    }

    try {
      setIsGeneratingImage(true);
      // 从用户设置中读取 NovelAI Token 与自定义端点
      const token = (user as any)?.settings?.chat?.novelai?.token || '';
      const useCustomEndpoint = !!(user as any)?.settings?.chat?.novelai?.useCustomEndpoint;
      const customEndpoint = (user as any)?.settings?.chat?.novelai?.customEndpoint || undefined;

      const { imageUrls } = await NovelAIService.generateImage({
        token,
        prompt: promptText,
        negativePrompt: '',
        model: 'NAI Diffusion V4.5',
        width: 1024,
        height: 1024,
        steps: 28,
        scale: 5,
        sampler: 'k_euler_ancestral',
        endpoint: useCustomEndpoint ? customEndpoint : undefined,
      });

      if (imageUrls && imageUrls.length > 0) {
        setSelectedImages((prev) => {
          const next = [...prev, ...imageUrls];
          return next.slice(0, MAX_IMAGES);
        });
      }

      await savePromptIfNew(promptText);
      setAiPromptModalVisible(false);
    } catch (err: any) {
      console.error('AI生图失败:', err);
      Alert.alert('错误', err?.message || 'AI生图失败');
    } finally {
      setIsGeneratingImage(false);
    }
  }, [aiPromptText, user, savePromptIfNew]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* 顶部导航栏 */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="close" size={24} color="#333" />
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>发表朋友圈</Text>
        
        <TouchableOpacity 
          onPress={handlePublish} 
          style={[
            styles.publishButton,
            (postText.trim() || selectedImages.length > 0) && !isPublishing
              ? styles.publishButtonActive 
              : styles.publishButtonDisabled
          ]}
          disabled={(!postText.trim() && selectedImages.length === 0) || isPublishing}
        >
          {isPublishing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[
              styles.publishButtonText,
              (postText.trim() || selectedImages.length > 0) && !isPublishing
                ? styles.publishButtonTextActive 
                : styles.publishButtonTextDisabled
            ]}>
              发表
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 发布者信息 */}
          <View style={styles.publisherInfo}>
            <Image 
              source={
                (publisherType === 'user'
                  ? (user?.avatar ? { uri: user.avatar } : require('@/assets/images/default-avatar.png'))
                  : (publisher?.avatar ? { uri: publisher.avatar } : require('@/assets/images/default-avatar.png')))
              }
              style={styles.publisherAvatar}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.publisherName}>
                {publisherType === 'user' ? (user?.settings?.self.nickname || '我') : (publisher?.name || '选择角色')}
              </Text>
              <View style={styles.publisherSwitchRow}>
                <TouchableOpacity
                  style={[styles.switchChip, publisherType === 'user' ? styles.switchChipActive : null]}
                  onPress={() => setPublisherType('user')}
                >
                  <Ionicons name="person" size={14} color={publisherType === 'user' ? '#fff' : '#666'} />
                  <Text style={[styles.switchChipText, publisherType === 'user' ? styles.switchChipTextActive : null]}>我</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.switchChip, publisherType === 'character' ? styles.switchChipActive : null]}
                  onPress={() => setPublisherType('character')}
                >
                  <Ionicons name="people" size={14} color={publisherType === 'character' ? '#fff' : '#666'} />
                  <Text style={[styles.switchChipText, publisherType === 'character' ? styles.switchChipTextActive : null]}>角色</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {publisherType === 'character' && (
            <View style={styles.characterPickerRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {characters.map(char => (
                  <TouchableOpacity
                    key={char.id}
                    style={[styles.characterItem, (selectedCharacterId || publisherIdParam) === char.id ? styles.characterItemActive : null]}
                    onPress={() => setSelectedCharacterId(char.id)}
                  >
                    <Image source={char.avatar ? { uri: char.avatar } : require('@/assets/images/default-avatar.png')} style={styles.characterAvatarSmall} />
                    <Text style={styles.characterNameSmall} numberOfLines={1}>{char.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* 文本输入区域 */}
          <TextInput
            ref={textInputRef}
            style={styles.textInput}
            placeholder="这一刻的想法..."
            placeholderTextColor="#999"
            multiline
            value={postText}
            onChangeText={setPostText}
            maxLength={1000}
            textAlignVertical="top"
          />

          {/* 图片区域 */}
          {(selectedImages.length > 0 || selectedImages.length < MAX_IMAGES) && (
            <View style={styles.imagesSection}>
              {renderImageGrid()}
            </View>
          )}

          {/* 位置信息 */}
          {selectedLocation ? (
            <View style={styles.locationContainer}>
              <Ionicons name="location" size={16} color="#666" />
              <Text style={styles.locationText}>{selectedLocation}</Text>
              <TouchableOpacity onPress={() => setSelectedLocation('')}>
                <Ionicons name="close" size={16} color="#999" />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* 标签信息 */}
          {tagText ? (
            <View style={styles.tagContainer}>
              <Text style={styles.tagText}>#{tagText}</Text>
              <TouchableOpacity onPress={() => setTagText('')}>
                <Ionicons name="close" size={16} color="#999" />
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>

        {/* 底部工具栏 */}
        <View style={styles.toolbar}>
          <TouchableOpacity 
            style={styles.toolbarButton}
            onPress={() => setShowLocationSelector(true)}
          >
            <Ionicons name="location-outline" size={24} color="#666" />
            <Text style={styles.toolbarButtonText}>所在位置</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.toolbarButton}
            onPress={() => setShowTagInput(true)}
          >
            <Ionicons name="pricetag-outline" size={24} color="#666" />
            <Text style={styles.toolbarButtonText}>添加标签</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.toolbarButton}
            onPress={() => setAiPromptModalVisible(true)}
          >
            <Ionicons name="sparkles-outline" size={24} color="#666" />
            <Text style={styles.toolbarButtonText}>生成</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* 位置选择器模态框 */}
      {showLocationSelector && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>选择位置</Text>
              <TouchableOpacity onPress={() => setShowLocationSelector(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="输入位置信息"
              value={selectedLocation}
              onChangeText={setSelectedLocation}
              autoFocus
            />
            <TouchableOpacity 
              style={styles.modalConfirmButton}
              onPress={() => setShowLocationSelector(false)}
            >
              <Text style={styles.modalConfirmButtonText}>确定</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 标签输入模态框 */}
      {showTagInput && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>添加标签</Text>
              <TouchableOpacity onPress={() => setShowTagInput(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="输入标签"
              value={tagText}
              onChangeText={setTagText}
              autoFocus
            />
            <TouchableOpacity 
              style={styles.modalConfirmButton}
              onPress={() => setShowTagInput(false)}
            >
              <Text style={styles.modalConfirmButtonText}>确定</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* AI 生图模态框 */}
      {aiPromptModalVisible && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>生成图片</Text>
              <TouchableOpacity onPress={() => setAiPromptModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.modalInput, { minHeight: 90, textAlignVertical: 'top' }]}
              placeholder="输入提示词（NovelAI）"
              value={aiPromptText}
              onChangeText={setAiPromptText}
              multiline
              autoFocus
            />

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <TouchableOpacity 
                style={[styles.modalConfirmButton, { flex: 1, marginRight: 8, opacity: isGeneratingImage ? 0.7 : 1 }]}
                onPress={handleGenerateAIImages}
                disabled={isGeneratingImage}
              >
                {isGeneratingImage ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmButtonText}>生成</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalConfirmButton, { flex: 1, marginLeft: 8, backgroundColor: '#6c6cff' }]}
                onPress={() => savePromptIfNew(aiPromptText)}
              >
                <Text style={styles.modalConfirmButtonText}>保存到常用</Text>
              </TouchableOpacity>
            </View>

            {savedAIPrompts.length > 0 && (
              <View>
                <Text style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>常用提示词</Text>
                <ScrollView style={{ maxHeight: 220 }}>
                  {savedAIPrompts.map((p) => (
                    <View key={p} style={styles.savedPromptItem}>
                      <TouchableOpacity style={{ flex: 1 }} onPress={() => setAiPromptText(p)}>
                        <Text numberOfLines={2} style={styles.savedPromptText}>{p}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.savedPromptAction} onPress={() => setAiPromptText(p)}>
                        <Ionicons name="play" size={18} color="#1DA1F2" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.savedPromptDelete} onPress={() => deleteSavedPrompt(p)}>
                        <Ionicons name="trash-outline" size={18} color="#ff4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  headerButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  publishButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  publishButtonActive: {
    backgroundColor: '#1DA1F2',
  },
  publishButtonDisabled: {
    backgroundColor: '#f0f0f0',
  },
  publishButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  publishButtonTextActive: {
    color: '#fff',
  },
  publishButtonTextDisabled: {
    color: '#999',
  },
  content: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  publisherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  publisherAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  publisherName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  publisherSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  switchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  switchChipActive: {
    backgroundColor: '#1DA1F2',
  },
  switchChipText: {
    fontSize: 12,
    color: '#666',
  },
  switchChipTextActive: {
    color: '#fff',
  },
  characterPickerRow: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  characterItem: {
    width: 72,
    marginRight: 10,
    alignItems: 'center',
  },
  characterItemActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#1DA1F2',
  },
  characterAvatarSmall: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: 6,
  },
  characterNameSmall: {
    fontSize: 12,
    color: '#333',
  },
  textInput: {
    fontSize: 16,
    color: '#333',
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 120,
    maxHeight: 200,
  },
  imagesSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  addImageButton: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageWrapper: {
    position: 'relative',
  },
  selectedImage: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  locationText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
  },
  tagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  tagText: {
    flex: 1,
    fontSize: 14,
    color: '#1DA1F2',
    fontWeight: '500',
  },
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  toolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 24,
    gap: 8,
  },
  toolbarButtonText: {
    fontSize: 14,
    color: '#666',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: width - 64,
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  modalConfirmButton: {
    backgroundColor: '#1DA1F2',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalConfirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  savedPromptItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
    gap: 8,
  },
  savedPromptText: {
    fontSize: 14,
    color: '#333',
  },
  savedPromptAction: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  savedPromptDelete: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
});

export default CreatePostPage;
