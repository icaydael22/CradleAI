import { useState, useCallback, useRef, useEffect } from 'react';
import { FlatList } from 'react-native';
import { CirclePost, Character } from '@/shared/types';
import { CircleScheduler } from '@/services/circle-scheduler';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ExploreState {
  // Core data
  posts: CirclePost[];
  setPosts: React.Dispatch<React.SetStateAction<CirclePost[]>>;
  
  // Loading states
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  
  // Comment states
  commentText: string;
  setCommentText: React.Dispatch<React.SetStateAction<string>>;
  activePostId: string | null;
  setActivePostId: React.Dispatch<React.SetStateAction<string | null>>;
  replyTo: {userId: string, userName: string} | null;
  setReplyTo: React.Dispatch<React.SetStateAction<{userId: string, userName: string} | null>>;
  isCommentInputActive: boolean;
  setIsCommentInputActive: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Processing states
  processingCharacters: string[];
  setProcessingCharacters: React.Dispatch<React.SetStateAction<string[]>>;
  publishingPost: boolean;
  setPublishingPost: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Modal states
  showUserPostModal: boolean;
  setShowUserPostModal: React.Dispatch<React.SetStateAction<boolean>>;
  userPostText: string;
  setUserPostText: React.Dispatch<React.SetStateAction<string>>;
  userPostImages: string[];
  setUserPostImages: React.Dispatch<React.SetStateAction<string[]>>;
  isCreatingPost: boolean;
  setIsCreatingPost: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Forward sheet states
  isForwardSheetVisible: boolean;
  setIsForwardSheetVisible: React.Dispatch<React.SetStateAction<boolean>>;
  selectedPost: CirclePost | null;
  setSelectedPost: React.Dispatch<React.SetStateAction<CirclePost | null>>;
  
  // Image viewer states
  isImageViewerVisible: boolean;
  setIsImageViewerVisible: React.Dispatch<React.SetStateAction<boolean>>;
  currentImageIndex: number;
  setCurrentImageIndex: React.Dispatch<React.SetStateAction<number>>;
  selectedImages: string[];
  setSelectedImages: React.Dispatch<React.SetStateAction<string[]>>;
  
  // UI states
  expandedThoughts: {[key: string]: boolean};
  setExpandedThoughts: React.Dispatch<React.SetStateAction<{[key: string]: boolean}>>;
  expandedComments: {[key: string]: boolean};
  setExpandedComments: React.Dispatch<React.SetStateAction<{[key: string]: boolean}>>;
  deletingPostId: string | null;
  setDeletingPostId: React.Dispatch<React.SetStateAction<string | null>>;
  
  // Character interaction states
  showInteractionSettings: boolean;
  setShowInteractionSettings: React.Dispatch<React.SetStateAction<boolean>>;
  selectedPublishCharacterId: string | null;
  setSelectedPublishCharacterId: React.Dispatch<React.SetStateAction<string | null>>;
  showPublishCharacterSelector: boolean;
  setShowPublishCharacterSelector: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Fallback character
  fallbackCharacter: Character | null;
  setFallbackCharacter: React.Dispatch<React.SetStateAction<Character | null>>;
  
  // Background image states
  backgroundImage: string | null;
  setBackgroundImage: React.Dispatch<React.SetStateAction<string | null>>;
  isSelectingBackground: boolean;
  setIsSelectingBackground: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Refs
  flatListRef: React.RefObject<FlatList | null>;
  schedulerRef: React.RefObject<CircleScheduler | null>;
  
  // Actions
  resetCommentState: () => void;
  resetUserPostModal: () => void;
  resetImageViewer: () => void;
  toggleThoughtExpansion: (id: string) => void;
  handleImagePress: (images: string[], index: number) => void;
  handleBackgroundImageSelect: () => void;
  loadBackgroundImage: () => void;
}

export const useExploreState = (): ExploreState => {
  // Core data states
  const [posts, setPosts] = useState<CirclePost[]>([]);
  
  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Comment states
  const [commentText, setCommentText] = useState('');
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{userId: string, userName: string} | null>(null);
  const [isCommentInputActive, setIsCommentInputActive] = useState(false);
  
  // Processing states
  const [processingCharacters, setProcessingCharacters] = useState<string[]>([]);
  const [publishingPost, setPublishingPost] = useState(false);
  
  // User post creation states
  const [showUserPostModal, setShowUserPostModal] = useState(false);
  const [userPostText, setUserPostText] = useState('');
  const [userPostImages, setUserPostImages] = useState<string[]>([]);
  const [isCreatingPost, setIsCreatingPost] = useState(false);
  
  // Forward sheet states
  const [isForwardSheetVisible, setIsForwardSheetVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState<CirclePost | null>(null);
  
  // Image viewer states
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  
  // UI interaction states
  const [expandedThoughts, setExpandedThoughts] = useState<{[key: string]: boolean}>({});
  const [expandedComments, setExpandedComments] = useState<{[key: string]: boolean}>({});
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  
  // Character interaction states
  const [showInteractionSettings, setShowInteractionSettings] = useState(false);
  const [selectedPublishCharacterId, setSelectedPublishCharacterId] = useState<string | null>(null);
  const [showPublishCharacterSelector, setShowPublishCharacterSelector] = useState(false);
  
  // Fallback character state
  const [fallbackCharacter, setFallbackCharacter] = useState<Character | null>(null);
  
  // Background image states
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [isSelectingBackground, setIsSelectingBackground] = useState(false);
  
  // Refs
  const flatListRef = useRef<FlatList>(null);
  const schedulerRef = useRef<CircleScheduler | null>(null);
  
  // Action functions
  const resetCommentState = useCallback(() => {
    setCommentText('');
    setActivePostId(null);
    setReplyTo(null);
    setIsCommentInputActive(false);
  }, []);
  
  const resetUserPostModal = useCallback(() => {
    setShowUserPostModal(false);
    setUserPostText('');
    setUserPostImages([]);
    setIsCreatingPost(false);
  }, []);
  
  const resetImageViewer = useCallback(() => {
    setIsImageViewerVisible(false);
    setCurrentImageIndex(0);
    setSelectedImages([]);
  }, []);
  
  const toggleThoughtExpansion = useCallback((id: string) => {
    // Handle both thought expansion and comment expansion
    if (id.startsWith('expand-')) {
      // This is for expanding comments
      const postId = id.replace('expand-', '');
      setExpandedComments(prev => ({
        ...prev,
        [postId]: !prev[postId]
      }));
    } else {
      // This is for expanding thoughts
      setExpandedThoughts(prev => ({
        ...prev,
        [id]: !prev[id]
      }));
    }
  }, []);
  
  const handleImagePress = useCallback((images: string[], index: number) => {
    setSelectedImages(images);
    setCurrentImageIndex(index);
    setIsImageViewerVisible(true);
  }, []);

  // 加载背景图片
  const loadBackgroundImage = useCallback(async () => {
    try {
      const savedImage = await AsyncStorage.getItem('explore_background_image');
      if (savedImage) {
        setBackgroundImage(savedImage);
      }
    } catch (error) {
      console.error('加载背景图片失败:', error);
    }
  }, []);

  // 处理背景图片选择
  const handleBackgroundImageSelect = useCallback(async () => {
    try {
      const ImagePicker = await import('expo-image-picker');
      
      // 请求权限
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        console.log('需要相册权限来选择背景图片');
        return;
      }

      setIsSelectingBackground(true);
      
      // 启动图片选择器
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [9, 16], // 适合背景的宽高比
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        const selectedImageUri = result.assets[0].uri;
        setBackgroundImage(selectedImageUri);
        
        // 保存到本地存储
        await AsyncStorage.setItem('explore_background_image', selectedImageUri);
        console.log('背景图片已保存:', selectedImageUri);
      }
    } catch (error) {
      console.error('选择背景图片失败:', error);
    } finally {
      setIsSelectingBackground(false);
    }
  }, []);

  // 组件挂载时加载背景图片
  useEffect(() => {
    loadBackgroundImage();
  }, [loadBackgroundImage]);
  
  return {
    // Core data
    posts,
    setPosts,
    
    // Loading states
    isLoading,
    setIsLoading,
    error,
    setError,
    
    // Comment states
    commentText,
    setCommentText,
    activePostId,
    setActivePostId,
    replyTo,
    setReplyTo,
    isCommentInputActive,
    setIsCommentInputActive,
    
    // Processing states
    processingCharacters,
    setProcessingCharacters,
    publishingPost,
    setPublishingPost,
    
    // Modal states
    showUserPostModal,
    setShowUserPostModal,
    userPostText,
    setUserPostText,
    userPostImages,
    setUserPostImages,
    isCreatingPost,
    setIsCreatingPost,
    
    // Forward sheet states
    isForwardSheetVisible,
    setIsForwardSheetVisible,
    selectedPost,
    setSelectedPost,
    
    // Image viewer states
    isImageViewerVisible,
    setIsImageViewerVisible,
    currentImageIndex,
    setCurrentImageIndex,
    selectedImages,
    setSelectedImages,
    
    // UI states
    expandedThoughts,
    setExpandedThoughts,
    expandedComments,
    setExpandedComments,
    deletingPostId,
    setDeletingPostId,
    
    // Character interaction states
    showInteractionSettings,
    setShowInteractionSettings,
    selectedPublishCharacterId,
    setSelectedPublishCharacterId,
    showPublishCharacterSelector,
    setShowPublishCharacterSelector,
    
    // Fallback character
    fallbackCharacter,
    setFallbackCharacter,
    
    // Background image states
    backgroundImage,
    setBackgroundImage,
    isSelectingBackground,
    setIsSelectingBackground,
    
    // Refs
    flatListRef,
    schedulerRef,
    
    // Actions
    resetCommentState,
    resetUserPostModal,
    resetImageViewer,
    toggleThoughtExpansion,
    handleImagePress,
    handleBackgroundImageSelect,
    loadBackgroundImage,
  };
};