import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Dimensions,
  SafeAreaView,
  StatusBar,
  Platform,
  TextInput,
  ListRenderItem,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Keyboard,
  ScrollView,
  ImageBackground,
  Modal,
} from 'react-native';
import { Ionicons, MaterialIcons, MaterialCommunityIcons, Feather, AntDesign } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCharacters } from '@/constants/CharactersContext';
import { CirclePost, CircleComment, CircleLike, Character,} from '@/shared/types';
import ForwardSheet from '@/components/ForwardSheet';
import { useUser } from '@/constants/UserContext';
import { CircleService } from '@/services/circle-service';
import { RelationshipAction } from '@/shared/types/relationship-types';
import { ActionService } from '@/services/action-service';
import RelationshipTestResults, { RelationshipTestResult } from '@/components/RelationshipTestResults';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ImageViewer from '@/components/ImageViewer';
import CharacterInteractionSettings from '@/components/CharacterInteractionSettings';
import { theme } from '@/constants/theme';
import { CircleScheduler } from '@/services/circle-scheduler';
import { NodeSTManager } from '@/utils/NodeSTManager';
import { GeminiAdapter } from '@/NodeST/nodest/utils/gemini-adapter';
import { ImageManager } from '@/utils/ImageManager';
import * as FileSystem from 'expo-file-system';
import { getApiSettings } from '@/utils/settings-helper';


const { width, height } = Dimensions.get('window');
const CARD_WIDTH = width - 32;
const AVATAR_SIZE = width > 400 ? 48 : 40;
const HEADER_HEIGHT = Platform.OS === 'ios' ? 90 : (StatusBar.currentHeight || 0) + 56;

const Explore: React.FC = () => {
  const { characters, setCharacters, updateCharacter, toggleFavorite, addMessage } = useCharacters();
  const { user } = useUser();
  const [posts, setPosts] = useState<CirclePost[]>([]);
  const [commentText, setCommentText] = useState('');
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingCharacters, setProcessingCharacters] = useState<string[]>([]);
  const [testModeEnabled, setTestModeEnabled] = useState(false);
  const [testResults, setTestResults] = useState<Array<{characterId: string, name: string, success: boolean, action?: any}>>([]);
  const [showTestResults, setShowTestResults] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const [fallbackCharacter, setFallbackCharacter] = useState<Character | null>(null);

  const [isForwardSheetVisible, setIsForwardSheetVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState<CirclePost | null>(null);
  const [replyTo, setReplyTo] = useState<{userId: string, userName: string} | null>(null);
  const [publishingPost, setPublishingPost] = useState(false);
  
  // Tab Navigation state
  const [activeTab, setActiveTab] = useState<'circle' | 'relationships'>('circle');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<RelationshipAction[]>([]);
  const [isGeneratingActions, setIsGeneratingActions] = useState(false);

  // Add states for user post creation
  const [showUserPostModal, setShowUserPostModal] = useState(false);
  const [userPostText, setUserPostText] = useState('');
  const [userPostImages, setUserPostImages] = useState<string[]>([]);
  const [isCreatingPost, setIsCreatingPost] = useState(false);

  // Add these new state variables
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);

  // Add new state for character interaction settings modal
  const [showInteractionSettings, setShowInteractionSettings] = useState(false);

  // Add a new state to track expanded thought bubbles
  const [expandedThoughts, setExpandedThoughts] = useState<{[key: string]: boolean}>({});

  // Add new state to track when comment input is active
  const [isCommentInputActive, setIsCommentInputActive] = useState(false);

  // Add state for character selection in test post publishing
  const [selectedPublishCharacterId, setSelectedPublishCharacterId] = useState<string | null>(null);
  const [showPublishCharacterSelector, setShowPublishCharacterSelector] = useState(false);

  // Add useRef for storing scheduler instance
  const schedulerRef = useRef<CircleScheduler | null>(null);

  // 新增：selectedCharacter 兜底机制
  const selectedCharacter = selectedCharacterId
    ? characters.find((char: Character) => char.id === selectedCharacterId)
    : null;

  // 兜底逻辑：如果 context 里查不到角色，尝试直接从 characters.json 读取
  useEffect(() => {
    if (
      selectedCharacterId &&
      !selectedCharacter // context 里查不到
    ) {
      (async () => {
        try {
          const filePath = FileSystem.documentDirectory + 'characters.json';
          const fileInfo = await FileSystem.getInfoAsync(filePath);
          if (fileInfo.exists) {
            const content = await FileSystem.readAsStringAsync(filePath);
            const arr = JSON.parse(content);
            if (Array.isArray(arr)) {
              const found = arr.find((c: any) => c.id === selectedCharacterId);
              if (found) {
                setFallbackCharacter(found);
                // 可选：自动补充到 context，保证后续 context 可用
                if (!characters.some(c => c.id === found.id)) {
                  setCharacters([...characters, found]);
                }
                return;
              }
            }
          }
          setFallbackCharacter(null);
        } catch (e) {
          setFallbackCharacter(null);
        }
      })();
    } else {
      setFallbackCharacter(null);
    }
  }, [selectedCharacterId, selectedCharacter, characters, setCharacters]);

  // Get scheduler instance
  useEffect(() => {
    schedulerRef.current = CircleScheduler.getInstance();
  }, []);

  // Register update callbacks for visible posts
  useEffect(() => {
    if (!schedulerRef.current || posts.length === 0) return;
    
    // Create update callback function
    const handlePostUpdate = (updatedPost: CirclePost) => {
      setPosts(prevPosts => 
        prevPosts.map(p => p.id === updatedPost.id ? updatedPost : p)
      );
    };
    
    // Register callback for each post
    posts.forEach(post => {
      schedulerRef.current?.registerUpdateCallback(post.id, handlePostUpdate);
    });
    
    // Cleanup function to unregister callbacks
    return () => {
      posts.forEach(post => {
        schedulerRef.current?.unregisterUpdateCallback(post.id, handlePostUpdate);
      });
    };
  }, [posts, schedulerRef.current]);

  // Add the image handling function before renderPost
  const handleImagePress = useCallback((images: string[], index: number) => {
    setSelectedImages(images);
    setCurrentImageIndex(index);
    setIsImageViewerVisible(true);
  }, []);

  // Select first character as default when characters are loaded
  useEffect(() => {
    if (!isLoading && characters.length > 0 && !selectedCharacterId) {
      setSelectedCharacterId(characters[0].id);
    }
  }, [characters, isLoading, selectedCharacterId]);
  
  // Load the active character's pending actions
  useEffect(() => {
    if (selectedCharacterId && characters.length > 0) {
      const character = characters.find(c => c.id === selectedCharacterId);
      if (character) {
        // Filter pending actions for this character
        if (character.relationshipActions) {
          const now = Date.now();
          const pending = character.relationshipActions.filter(
            action => action.status === 'pending' && action.expiresAt > now
          );
          setPendingActions(pending);
        }
      }
    }
  }, [selectedCharacterId, characters]);

  // Circle interaction handling
  const handleCirclePostUpdate = useCallback(async (testPost: CirclePost) => {
    console.log('【朋友圈测试】开始朋友圈互动测试，帖子内容:', testPost.content);
    
    // Find characters with circle interaction enabled
    const interactingCharacters = characters.filter(c => c.circleInteraction);
    console.log(`【朋友圈测试】找到 ${interactingCharacters.length} 个启用了朋友圈互动的角色`);
    
    if (interactingCharacters.length === 0) {
      Alert.alert('提示', '没有启用朋友圈互动的角色，请在角色设置中开启');
      return;
    }

    // Set processing state for all interacting characters
    setProcessingCharacters(interactingCharacters.map(c => c.id));
    setTestResults([]);
    
    try {
      // 获取API Key用于真实调用
      const apiKey = user?.settings?.chat?.characterApiKey;
      const apiSettings = {
        apiProvider: user?.settings?.chat?.apiProvider || 'gemini',
        openrouter: user?.settings?.chat?.openrouter
      };

      if (!apiKey) {
        console.warn('【朋友圈测试】缺少API Key，将使用模拟数据');
      } else {
        console.log('【朋友圈测试】使用真实API Key进行调用');
      }
      
      // Process test interaction for all enabled characters using CircleService with API Key
      const { updatedPost, results } = await CircleService.processTestInteraction(
        testPost, 
        interactingCharacters,
        apiKey,
        apiSettings
      );
      
      console.log('【朋友圈测试】互动测试结果:', {
        总结果数: results.length,
        成功数: results.filter(r => r.success).length,
        点赞数: updatedPost.likes,
        评论数: updatedPost.comments?.length
      });
      
      // Update test results for display
      const formattedResults = results.map(result => {
        const character = interactingCharacters.find(c => c.id === result.characterId);
        return {
          characterId: result.characterId,
          name: character?.name || '未知角色',
          success: result.success,
          action: result.response?.action
        };
      });
      
      setTestResults(formattedResults);
      
      // Update the post with results
      setPosts(prevPosts => 
        prevPosts.map(p => p.id === testPost.id ? updatedPost : p)
      );
      
      // Show test results after processing is complete
      setShowTestResults(true);
      
    } catch (error) {
      console.error('【朋友圈测试】互动测试失败:', error);
      Alert.alert('互动失败', '处理朋友圈互动时发生错误');
    } finally {
      // Ensure all characters are removed from processing state
      setProcessingCharacters([]);
    }
  }, [characters, user?.settings?.chat?.characterApiKey]);

  // Update the loadPosts function to properly fetch from storage
  const loadPosts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('【朋友圈】开始从存储加载帖子');
      // Load posts from AsyncStorage and merge with character posts
      const storedPosts = await CircleService.loadSavedPosts();
      console.log(`【朋友圈】成功从存储加载了 ${storedPosts.length} 条帖子`);
      
      // Get user favorites (for user-posted content)
      let userFavorites: string[] = [];
      try {
        const storedUserFavorites = await AsyncStorage.getItem('user_favorited_posts');
        if (storedUserFavorites) {
          userFavorites = JSON.parse(storedUserFavorites);
        }
      } catch (error) {
        console.error('Failed to load user favorites:', error);
      }
      
      // Process posts without calling refreshPosts
      const postsWithFavoriteStatus = storedPosts.map(post => {
        // Update character avatars and other information
        const character = characters.find(c => c.id === post.characterId);
        
        // Check if post is favorited - handle both character and user posts
        let isFavorited = false;
        
        if (post.characterId === 'user-1') {
          // For user posts, check the user favorites list
          isFavorited = userFavorites.includes(post.id);
        } else if (character) {
          // For character posts, check the character's favorited posts
          isFavorited = character.favoritedPosts?.includes(post.id) || false;
        }
        
        // Update avatar if a character post
        if (character && post.characterId !== 'user-1') {
          post.characterAvatar = character.avatar;
        }
        
        // Update likes and comments avatars
        if (post.likedBy) {
          post.likedBy = post.likedBy.map(like => {
            if (like.isCharacter) {
              const likeCharacter = characters.find(c => c.id === like.userId);
              if (likeCharacter) {
                return {...like, userAvatar: likeCharacter.avatar || like.userAvatar};
              }
            }
            return like;
          });
        }
        
        if (post.comments) {
          post.comments = post.comments.map(comment => {
            if (comment.type === 'character') {
              const commentCharacter = characters.find(c => c.id === comment.userId);
              if (commentCharacter) {
                return {...comment, userAvatar: commentCharacter.avatar || comment.userAvatar};
              }
            }
            return comment;
          });
        }
        
        return { ...post, isFavorited };
      });
      
      // Sort by created date, newest first
      postsWithFavoriteStatus.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      setPosts(postsWithFavoriteStatus);
      console.log(`【朋友圈】已加载并处理 ${postsWithFavoriteStatus.length} 条帖子`);
      
    } catch (err) {
      console.error('【朋友圈】加载帖子失败:', err);
      setError('加载动态失败，请重试');
    } finally {
      setIsLoading(false);
    }
  }, [characters, testModeEnabled,]);

  // Add a specific effect hook to load posts on component mount
  useEffect(() => {
    console.log('【朋友圈】初始化加载帖子');
    loadPosts();
    
    // Check storage integrity on component mount
    CircleService.checkStorageIntegrity()
      .then(isValid => {
        console.log(`【朋友圈】存储完整性检查结果: ${isValid ? '正常' : '需要修复'}`);
      })
      .catch(error => {
        console.error('【朋友圈】存储完整性检查失败:', error);
      });
  }, [loadPosts]);

  // Like handling
  const handleLike = useCallback(async (post: CirclePost) => {
    try {
      // Check if user has already liked the post
      const hasUserLiked = post.likedBy?.some(like => 
        !like.isCharacter && like.userId === 'user-1'
      );
      
      let updatedPost: CirclePost;
    
      if (hasUserLiked) {
        // Remove like
        updatedPost = {
          ...post,
          likes: post.likes - 1,
          hasLiked: false,
          likedBy: post.likedBy?.filter(like => 
            like.isCharacter || like.userId !== 'user-1'
          )
        };
      } else {
        // Add like
        const newLike: CircleLike = {
          userId: 'user-1',
          userName: user?.settings?.self.nickname || '我',
          userAvatar: user?.avatar,
          isCharacter: false,
          createdAt: new Date().toISOString()
        };
  
        updatedPost = {
          ...post,
          likes: post.likes + 1,
          hasLiked: true,
          likedBy: [...(post.likedBy || [] as CircleLike[]), newLike]
        };
      }
      
      // Update the posts state without reloading
      setPosts(prevPosts => prevPosts.map(p => p.id === post.id ? updatedPost : p));
      
      // Save to AsyncStorage in the background
      AsyncStorage.setItem('circle_posts', JSON.stringify(
        posts.map(p => p.id === post.id ? updatedPost : p)
      ));
      
      // If this is a character's post, update the character data in the background
      if (post.characterId !== 'user-1') {
        const character = characters.find(c => c.id === post.characterId);
        if (character?.circlePosts) {
          const updatedCharacterPosts = character.circlePosts.map(p =>
            p.id === post.id ? updatedPost : p
          );
      
          await updateCharacter({
            ...character,
            circlePosts: updatedCharacterPosts,
          });
        }
      }
    } catch (error) {
      console.error('【朋友圈】点赞操作失败:', error);
      Alert.alert('操作失败', '无法完成点赞操作');
    }
  }, [characters, posts, updateCharacter, user]);

  // Add function to handle image selection
  const handleSelectImages = async () => {
    try {
      // Request media library permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access your photo library');
        return;
      }
      
      // Launch image picker with Expo API
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 4,
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets.length > 0) {
        // Add selected images to state - extract URIs
        const imageUris = result.assets.map(asset => asset.uri);
        setUserPostImages([...userPostImages, ...imageUris]);
      }
    } catch (error) {
      console.error('Error selecting images:', error);
      Alert.alert('Error', 'Failed to select images');
    }
  };

  // Add function to create user post
  const handleCreateUserPost = async () => {
    if (!userPostText.trim() && userPostImages.length === 0) {
      Alert.alert('错误', '请输入文字或选择图片');
      return;
    }
    
    try {
      setIsCreatingPost(true);
      
      // Get API key and settings
      const apiKey = user?.settings?.chat?.characterApiKey;
      const apiSettings = {
        apiProvider: user?.settings?.chat?.apiProvider || 'gemini',
        openrouter: user?.settings?.chat?.openrouter
      };
      
      // Create the user post object
      const newPost: CirclePost = {
        id: `user-post-${Date.now()}`,
        characterId: 'user-1',
        characterName: user?.settings?.self.nickname || '我',
        characterAvatar: user?.avatar || null,
        content: userPostText,
        images: userPostImages,
        createdAt: new Date().toISOString(),
        comments: [],
        likes: 0,
        likedBy: [],
        hasLiked: false
      };
      
      // Update posts state with the new post
      const updatedPosts = [newPost, ...posts];
      setPosts(updatedPosts);
      
      // Save to AsyncStorage
      await AsyncStorage.setItem('circle_posts', JSON.stringify(updatedPosts));
      
      // Close modal and reset form immediately
      setShowUserPostModal(false);
      setUserPostText('');
      setUserPostImages([]);
      
      
      // Process character responses in the background
      CircleService.createUserPost(
        user?.settings?.self.nickname || '我',
        user?.avatar || null,
        userPostText,
        userPostImages,
        apiKey,
        apiSettings,
        characters
      ).then(({ post: updatedPost, responses }) => {
        // FIX: Update using a function form of setPosts to ensure we have the latest state
        setPosts(prevPosts => {
          // Find the original post in current posts
          const postIndex = prevPosts.findIndex(p => p.id === newPost.id);
          if (postIndex === -1) return prevPosts; // Post doesn't exist anymore
            
          // Create a new array with all posts
          const newPosts = [...prevPosts];
            
          // Replace the post with the updated one that includes all character responses
          newPosts[postIndex] = updatedPost;
            
          // Save to AsyncStorage
          AsyncStorage.setItem('circle_posts', JSON.stringify(newPosts))
            .catch(error => console.error('【朋友圈】保存更新的帖子失败:', error));
            
          return newPosts;
        });
        
        // Log response stats
        const respondedCharacters = responses.filter(r => r.success).length;
        if (respondedCharacters > 0) {
          const likedPost = responses.filter(r => r.success && r.response?.action?.like).length;
          const commentedPost = responses.filter(r => r.success && r.response?.action?.comment).length;
          
          console.log(`【朋友圈】${respondedCharacters}个角色响应了你的帖子，其中${likedPost}个点赞，${commentedPost}个评论`);
        }
      }).catch(error => {
        console.error('处理角色响应失败:', error);
      });
      
    } catch (error) {
      console.error('创建用户帖子失败:', error);
      Alert.alert('错误', '发布失败，请稍后重试');
      setShowUserPostModal(false);
    } finally {
      setIsCreatingPost(false);
    }
  };

  // Modified function to handle test post publishing
  const handlePublishTestPost = async () => {
    try {
      setPublishingPost(true);
      
      // 获取API Key
      const apiKey = user?.settings?.chat?.characterApiKey;
      const apiSettings = {
        apiProvider: user?.settings?.chat?.apiProvider || 'gemini',
        openrouter: user?.settings?.chat?.openrouter
      };
      
      let targetCharacters: Character[] = [];
      
      // If a specific character is selected for publishing, filter to only that character
      if (selectedPublishCharacterId) {
        const selectedChar = characters.find(c => c.id === selectedPublishCharacterId);
        if (!selectedChar) {
          Alert.alert('错误', '所选角色不可用');
          setPublishingPost(false);
          return;
        }
        
        // Use only the selected character (as a single-element array)
        targetCharacters = [selectedChar];
        console.log(`【朋友圈】使用指定角色发布: ${selectedChar.name}, ID: ${selectedChar.id}`);
      } else {
        // If no specific character is selected, use characters with circle interaction enabled
        targetCharacters = characters.filter(c => c.circleInteraction);
        console.log(`【朋友圈】使用随机角色发布，共有 ${targetCharacters.length} 个可用角色`);
      }
      
      if (targetCharacters.length === 0) {
        Alert.alert('发布失败', '没有可用的角色，请确保至少有一个角色启用了朋友圈互动');
        setPublishingPost(false);
        return;
      }
      
      // 使用CircleService创建测试帖子，传入筛选后的角色列表
      const { post, author } = await CircleService.publishTestPost(targetCharacters, apiKey, apiSettings);
      
      if (!post || !author) {
        Alert.alert('发布失败', '发布过程中出现错误');
        setPublishingPost(false);
        return;
      }
      
      console.log(`【朋友圈】帖子成功创建，作者: ${author.name}, ID: ${post.id}`);
      
      // Check if the post already exists to prevent duplicates
      const postExists = posts.some(p => p.id === post.id);
      if (postExists) {
        console.log(`【朋友圈测试】帖子已存在，ID: ${post.id}，避免重复添加`);

        setPublishingPost(false);
        return;
      }
      
      // 创建新帖子列表，将新帖子放在顶部
      const updatedPosts = [post, ...posts];
      setPosts(updatedPosts);
      
      // 添加到作者的朋友圈帖子中
      const updatedAuthor = {
        ...author,
        circlePosts: [...(author.circlePosts || []), post]
      };
      
      // 更新角色
      await updateCharacter(updatedAuthor);
      
      // Save posts to AsyncStorage to prevent duplicates on reload
      await AsyncStorage.setItem('circle_posts', JSON.stringify(updatedPosts));
      

      
      // If we have characters to interact with the post, start interaction after a short delay
      const interactingCharacters = characters.filter(c => 
        c.circleInteraction === true && c.id !== author.id
      );
      
      if (interactingCharacters.length > 0) {
        setTimeout(() => {
          handleCirclePostUpdate(post);
        }, 500);
      }
      
    } catch (error) {
      console.error('【朋友圈测试】发布测试帖子失败:', error);
      Alert.alert('发布失败', '发布测试帖子时出现错误');
    } finally {
      setPublishingPost(false);
      // Reset character selection
      setSelectedPublishCharacterId(null);
      setShowPublishCharacterSelector(false);
    }
  };

  // Comment handling
  const handleComment = useCallback(async (post: CirclePost) => {
    if (!commentText.trim() || !activePostId) return;
  
    try {
      // Create user comment
      const newComment: CircleComment = {
        id: String(Date.now()),
        userId: 'user-1',
        userName: user?.settings?.self.nickname || '我',
        content: commentText.trim(),
        createdAt: new Date().toISOString(),
        type: 'user',
        replyTo: replyTo || undefined,
        userAvatar: user?.avatar || undefined
      };
  
      // Update the post with the new comment immediately
      let updatedPost: CirclePost = {
        ...post,
        comments: [...(post.comments || []), newComment] as CircleComment[],
      };
      
      // Update posts state without reloading
      setPosts(prevPosts => prevPosts.map(p => p.id === post.id ? updatedPost : p));
  
      // Reset input state
      setCommentText('');
      setActivePostId(null);
      setReplyTo(null);
      setIsCommentInputActive(false);
  
      // Save to AsyncStorage in the background
      try {
        const allPosts = await CircleService.loadSavedPosts();
        const updatedPosts = allPosts.map(p => p.id === post.id ? updatedPost : p);
        await CircleService.savePosts(updatedPosts);
      } catch (error) {
        console.error('保存帖子到存储失败:', error);
      }
      
      // Continue with character response handling
      // Only if this is a character's post (not a user post) and we're not replying to someone else
      if (post.characterId !== 'user-1') {
        const character = characters.find(c => c.id === post.characterId);
        if (character) {
          // Process the interaction through CircleService
          const response = await CircleService.processCommentInteraction(
            character,
            post,
            commentText.trim(),
            user?.settings?.chat?.characterApiKey,
            replyTo || undefined, // Convert null to undefined
            {
              apiProvider: user?.settings?.chat?.apiProvider || 'gemini',
              openrouter: user?.settings?.chat?.openrouter
            }
          );
          
          if (response.success && response.action?.comment) {
            // Add character's reply comment
            const characterReply: CircleComment = {
              id: String(Date.now() + 1),
              userId: character.id,
              userName: character.name,
              userAvatar: character.avatar as string,
              content: response.action.comment,
              createdAt: new Date().toISOString(),
              type: 'character',
              replyTo: {
                userId: 'user-1',
                userName: user?.settings?.self.nickname || '我'
              },
              thoughts: response.thoughts // Add thoughts if available
            };
            
            // Update with the character's comment
            updatedPost = {
              ...updatedPost,
              comments: [...(updatedPost.comments || []), characterReply]
            };
            
            // Update posts state again without reloading
            setPosts(prevPosts => prevPosts.map(p => p.id === post.id ? updatedPost : p));
            
            // Save the updated post with character's response
            try {
              const allPosts = await CircleService.loadSavedPosts();
              const updatedPosts = allPosts.map(p => p.id === post.id ? updatedPost : p);
              await CircleService.savePosts(updatedPosts);
            } catch (error) {
              console.error('保存带角色回复的帖子到存储失败:', error);
            }
          }
        }
      }
      
      // Handle comment reply to character's comment (new feature)
      if (replyTo && replyTo.userId !== 'user-1' && replyTo.userId !== post.characterId) {
        // Find the commented character
        const commentedCharacter = characters.find(c => c.id === replyTo.userId);
        if (commentedCharacter) {
          console.log(`【朋友圈】用户回复了角色 ${commentedCharacter.name} 的评论`);
          
          // Process the comment interaction
          const response = await CircleService.processCommentInteraction(
            commentedCharacter,
            post,
            commentText.trim(),
            user?.settings?.chat?.characterApiKey,
            {
              userId: 'user-1',
              userName: user?.settings?.self.nickname || '我'
            },
            {
              apiProvider: user?.settings?.chat?.apiProvider || 'gemini',
              openrouter: user?.settings?.chat?.openrouter
            }
          );
          
          if (response.success && response.action?.comment) {
            // Add character's reply to the user's reply
            const characterReply: CircleComment = {
              id: String(Date.now() + 2),
              userId: commentedCharacter.id,
              userName: commentedCharacter.name,
              userAvatar: commentedCharacter.avatar as string,
              content: response.action.comment,
              createdAt: new Date().toISOString(),
              type: 'character',
              replyTo: {
                userId: 'user-1',
                userName: user?.settings?.self.nickname || '我'
              },
              thoughts: response.thoughts // Add thoughts if available
            };
            
            // Update with the character's reply
            updatedPost = {
              ...updatedPost,
              comments: [...updatedPost.comments, characterReply]
            };
            
            // Update posts state again
            setPosts(prevPosts => prevPosts.map(p => p.id === post.id ? updatedPost : p));
            
            // Save the updated post with character's reply
            try {
              const allPosts = await CircleService.loadSavedPosts();
              const updatedPosts = allPosts.map(p => p.id === post.id ? updatedPost : p);
              await CircleService.savePosts(updatedPosts);
            } catch (error) {
              console.error('保存带角色回复的帖子到存储失败:', error);
            }
          }
        }
      }
    } catch (error) {
      console.error('发送评论失败:', error);
      Alert.alert('评论失败', '发送评论时出现错误');
    }
  }, [activePostId, commentText, replyTo, characters, user, posts]);

  const scrollToPost = useCallback((postId: string) => {
    const postIndex = posts.findIndex(post => post.id === postId);
    if (postIndex !== -1) {
      // 添加延迟以确保键盘完全展开
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: postIndex,
          animated: true,
          viewOffset: 150, // 增加偏移量，确保评论框在键盘上方
        });
      }, 300); // 增加延迟时间
    }
  }, [posts]);

  const toggleThoughtExpansion = useCallback((commentId: string) => {
    setExpandedThoughts(prev => ({
      ...prev,
      [commentId]: !prev[commentId]
    }));
  }, []);

  const handleReplyPress = useCallback((comment: CircleComment) => {
    setReplyTo({
      userId: comment.userId,
      userName: comment.userName
    });
    
    // Find the post that contains this comment
    const postId = posts.find(p => 
      p.comments?.some(c => c.id === comment.id)
    )?.id;
    
    if (postId) {
      // Set the active post ID to enable comment input on the correct post
      setActivePostId(postId);
      setIsCommentInputActive(true);
      
      // Focus on comment area and scroll
      setTimeout(() => {
        scrollToPost(postId);
      }, 200);
    } else {
      // If we can't find the post, at least set the active comment state
      setIsCommentInputActive(true);
    }
  }, [posts, scrollToPost]);

  const handleCommentPress = useCallback((postId: string) => {
    if (activePostId === postId) {
      setActivePostId(null);
      setIsCommentInputActive(false);
      Keyboard.dismiss();
    } else {
      setActivePostId(postId);
      setIsCommentInputActive(true);
    }
  }, [activePostId]);

  // Add new method to handle test post publishing
  const renderCharacterSelectorModal = () => (
    <Modal
      visible={showPublishCharacterSelector}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowPublishCharacterSelector(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>选择发布角色</Text>
            <TouchableOpacity
              onPress={() => setShowPublishCharacterSelector(false)}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close" size={24} color={theme.colors.white} />
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={characters.filter(c => c.circleInteraction)}
            keyExtractor={item => item.id}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>没有可用的角色</Text>
                <Text style={styles.emptySubText}>请先在角色设置中启用朋友圈功能</Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={[
                  styles.characterItem,
                  selectedPublishCharacterId === item.id ? styles.selectedCharacterItem : null
                ]}
                onPress={() => {
                  setSelectedPublishCharacterId(item.id);
                  console.log(`【朋友圈】已选择角色 ${item.name}, ID: ${item.id}`);
                }}
              >
                <Image 
                  source={item.avatar ? { uri: item.avatar } : require('@/assets/images/default-avatar.png')}
                  style={styles.selectorAvatar} 
                />
                <View style={styles.characterInfo}>
                  <Text style={styles.characterName}>{item.name}</Text>
                  <Text style={styles.characterSubtext}>
                    发布频率: {item.circlePostFrequency || 'medium'}
                  </Text>
                </View>
                {selectedPublishCharacterId === item.id && (
                  <Ionicons name="checkmark-circle" size={20} color={theme.colors.accent} />
                )}
              </TouchableOpacity>
            )}
            contentContainerStyle={{ padding: 16 }}
          />
          
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.randomCharacterButton}
              onPress={() => {
                setSelectedPublishCharacterId(null);
                setShowPublishCharacterSelector(false);
                handlePublishTestPost();
              }}
            >
              <Text style={styles.randomButtonText}>随机选择角色</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.confirmButton,
                !selectedPublishCharacterId ? styles.disabledButton : null
              ]}
              disabled={!selectedPublishCharacterId}
              onPress={() => {
                if (selectedPublishCharacterId) {
                  setShowPublishCharacterSelector(false);
                  handlePublishTestPost();
                }
              }}
            >
              <Text style={styles.confirmButtonText}>确认选择</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderCircleHeaderButtons = () => (
    <View style={styles.headerButtons}>
      {/* Add Character Interaction Settings button */}
      <TouchableOpacity 
        style={styles.headerButton}
        onPress={() => setShowInteractionSettings(true)}
        disabled={isLoading}
      >
        <Ionicons name="settings-outline" size={22} color={theme.colors.buttonText} />
      </TouchableOpacity>

      {/* Add User Post button - moved from floating button */}
      <TouchableOpacity 
        style={styles.headerButton}
        onPress={() => setShowUserPostModal(true)}
        disabled={isLoading}
      >
        <Feather name="plus" size={24} color={theme.colors.buttonText} />
      </TouchableOpacity>

      {/* Modified: Show character selector instead of directly publishing */}
      <TouchableOpacity 
        style={[
          styles.headerButton,
          (publishingPost || isLoading) && styles.headerButtonDisabled
        ]} 
        onPress={() => setShowPublishCharacterSelector(true)}
        disabled={publishingPost || isLoading}
      >
        {publishingPost ? (
          <ActivityIndicator size="small" color={theme.colors.text} />
        ) : (
          <MaterialIcons name="auto-awesome" size={22} color={theme.colors.buttonText} />
        )}
      </TouchableOpacity>
    </View>
  );

  // 新的顶部栏，完全对齐TopBarWithBackground.tsx
  const renderHeader = () => (
    <View style={[styles.topBarContainer, { 
      height: HEADER_HEIGHT, 
      paddingTop: Platform.OS === 'ios' ? Math.max(20, StatusBar.currentHeight || 0) : StatusBar.currentHeight || 0 
    }]}>
      <View style={styles.topBarOverlay} />
      <View style={styles.topBarContent}>
        <View style={styles.topBarTitleContainer}>
          <Text style={styles.topBarTitle}>朋友圈</Text>
        </View>
        <View style={styles.topBarActions}>
          <TouchableOpacity 
            style={styles.topBarActionButton}
            onPress={() => setShowInteractionSettings(true)}
            disabled={isLoading}
          >
            <Ionicons name="settings-outline" size={width > 380 ? 22 : 20} color={theme.colors.buttonText} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.topBarActionButton}
            onPress={() => setShowUserPostModal(true)}
            disabled={isLoading}
          >
            <Feather name="plus" size={width > 380 ? 24 : 22} color={theme.colors.buttonText} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[
              styles.topBarActionButton,
              (publishingPost || isLoading) && styles.topBarActionButtonDisabled
            ]} 
            onPress={() => setShowPublishCharacterSelector(true)}
            disabled={publishingPost || isLoading}
          >
            {publishingPost ? (
              <ActivityIndicator size="small" color={theme.colors.text} />
            ) : (
              <MaterialIcons name="auto-awesome" size={width > 380 ? 22 : 20} color={theme.colors.buttonText} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // Comment rendering
  const renderComment = useCallback((comment: CircleComment) => {
    const hasThoughts = !!comment.thoughts;
    const isExpanded = expandedThoughts[comment.id] || false;

    return (
      <View key={comment.id} style={styles.comment}>
        <Image
          source={comment.userAvatar ? { uri: comment.userAvatar } : require('@/assets/images/default-avatar.png')}
          style={styles.commentAvatar}
        />
        <View style={styles.commentContent}>
          <Text style={styles.commentAuthor}>{comment.userName}</Text>
          
          {/* Display thoughts if available */}
          {hasThoughts && (
            <View style={styles.thoughtsContainer}>
              <TouchableOpacity 
                style={styles.thoughtsHeader}
                onPress={() => toggleThoughtExpansion(comment.id)}
              >
                <Text style={styles.thoughtsTitle}>
                  {isExpanded ? '收起内心想法' : '查看内心想法'}
                </Text>
                <AntDesign 
                  name={isExpanded ? 'caretup' : 'caretdown'} 
                  size={12} 
                  color={theme.colors.textSecondary} 
                />
              </TouchableOpacity>
              
              {isExpanded && (
                <View style={styles.thoughtsBubble}>
                  <Text style={styles.thoughtsText}>{comment.thoughts}</Text>
                </View>
              )}
            </View>
          )}
          
          <Text style={styles.commentText}>
            {comment.replyTo && <Text style={styles.replyText}>回复 {comment.replyTo.userName}：</Text>}
            {comment.content}
          </Text>
          <TouchableOpacity 
            style={styles.replyButton} 
            onPress={() => handleReplyPress(comment)}
          >
            <Text style={styles.replyButtonText}>回复</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [handleReplyPress, expandedThoughts, toggleThoughtExpansion]);

  // Listen to keyboard events to update comment input state
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      () => {
        setIsCommentInputActive(true);
      }
    );
    
    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => {
        // Add delay to prevent flashing of the FAB
        setTimeout(() => {
          if (!activePostId) {
            setIsCommentInputActive(false);
          }
        }, 100);
      }
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, [activePostId]);
  
  // Add listener for comment input blur
  const commentInputRef = useRef<TextInput>(null);
  useEffect(() => {
    return () => {
      setIsCommentInputActive(false);
    };
  }, []);

  // Update renderCommentInput to add ref and handle blur
  const renderCommentInput = useCallback((post: CirclePost) => {
    return (
      <View style={styles.commentInput}>
        {replyTo && (
          <View style={styles.replyIndicator}>
            <Text style={styles.replyIndicatorText}>
              回复 {replyTo.userName}
            </Text>
            <TouchableOpacity onPress={() => setReplyTo(null)}>
              <MaterialIcons name="close" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
        <TextInput
          ref={commentInputRef}
          style={styles.commentTextInput}
          value={commentText}
          onChangeText={setCommentText}
          placeholder={replyTo ? `回复 ${replyTo.userName}...` : "写评论..."}
          placeholderTextColor={theme.colors.textSecondary}
          multiline={false}
          autoFocus={true}
          blurOnSubmit={false}
          onBlur={() => {
            if (!commentText.trim()) {
              setIsCommentInputActive(false);
            }
          }}
        />
        <TouchableOpacity
          style={styles.sendButton}
          onPress={() => handleComment(post)}
        >
          <MaterialIcons name="send" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>
    );
  }, [commentText, replyTo, handleComment]);

  // Add function to handle post deletion
  const handleDeletePost = useCallback(async (postId: string) => {
    try {
      setDeletingPostId(postId);
      const postToDelete = posts.find(p => p.id === postId);
      if (!postToDelete) return;
      
      // If it's a character post, update the character data
      if (postToDelete.characterId !== 'user-1') {
        const character = characters.find(c => c.id === postToDelete.characterId);
        if (character?.circlePosts) {
          const updatedPosts = character.circlePosts.filter(p => p.id !== postId);
          await updateCharacter({
            ...character,
            circlePosts: updatedPosts,
          });
        }
      }
      
      // Update the posts state
      const updatedPosts = posts.filter(p => p.id !== postId);
      setPosts(updatedPosts);
      
      // Update AsyncStorage
      await AsyncStorage.setItem('circle_posts', JSON.stringify(updatedPosts));
      console.log(`【朋友圈】已删除帖子 ID: ${postId}, 剩余 ${updatedPosts.length} 条帖子`);
    } catch (error) {
      console.error('【朋友圈】删除帖子失败:', error);
      Alert.alert('删除失败', '无法删除此帖子');
    } finally {
      setDeletingPostId(null);
    }
  }, [posts, characters, updateCharacter]);

  // Add post menu for deletion - update to allow deletion of character posts too
  const showPostMenu = useCallback((post: CirclePost) => {
    // Allow deletion of user's posts and character posts
    const isUserPost = post.characterId === 'user-1';
    const isCharacterPost = !isUserPost;
    
    const options: Array<{
      text: string;
      onPress?: () => void;
      style: 'default' | 'cancel' | 'destructive';
    }> = [
      {
        text: '取消',
        style: 'cancel'
      }
    ];
    
    // Add delete option for both user posts and character posts
    options.push({
      text: '删除',
      onPress: () => {
        Alert.alert(
          '确认删除',
          '确定要删除这条朋友圈吗？此操作不可恢复。',
          [
            { text: '取消', style: 'cancel' },
            { 
              text: '删除', 
              style: 'destructive',
              onPress: () => handleDeletePost(post.id)
            }
          ]
        );
      },
      style: 'destructive'
    });
    
       
    // Show alert with options
    Alert.alert(
      '帖子操作',
      '请选择要执行的操作',
      options
    );
  }, [handleDeletePost, toggleFavorite]);

  // Replace the incomplete handleForward function with a proper implementation
  const handleForward = useCallback(async (characterId: string, message: string) => {
    if (!selectedPost) return;
    
    try {
      console.log(`【朋友圈】转发帖子给角色 ID: ${characterId}, 附加消息: ${message}`);
      
      // 优先用 fallbackCharacter
      const character = (fallbackCharacter && fallbackCharacter.id === characterId)
        ? fallbackCharacter
        : characters.find(c => c.id === characterId);

      if (!character) {
        Alert.alert('转发失败', '未找到所选角色');
        return;
      }
      
      // Format the forwarded content with a prefix
      const postAuthor = selectedPost.characterName || "某人";
      const prefix = message ? `转发自${postAuthor}的朋友圈，附言：${message}\n\n` : `转发自${postAuthor}的朋友圈：\n\n`;
      const forwardedContent = prefix + selectedPost.content;
      
      // Check if post contains images
      if (selectedPost.images && selectedPost.images.length > 0) {
        // Handle post with images - we'll need to process each image using the chat system's image handling
        await handleForwardWithImages(character, forwardedContent, selectedPost.images);
      } else {
        // Handle text-only post - use the chat system directly
        await handleForwardTextOnly(character, forwardedContent);
      }
      
      // Close the forward sheet
      setIsForwardSheetVisible(false);
      setSelectedPost(null);
      
      // Show success message
      Alert.alert('转发成功', `已将朋友圈内容转发给${character.name}`);
      
    } catch (error) {
      console.error('【朋友圈】转发失败:', error);
      Alert.alert('转发失败', error instanceof Error ? error.message : '请检查网络连接');
    }
  }, [selectedPost, characters, fallbackCharacter, addMessage]);
  
  // Add new helper function to handle text-only forwards
  const handleForwardTextOnly = async (character: Character, forwardedContent: string) => {
    try {
      // 只调用 NodeSTManager，让其负责插入用户消息
          // 使用最新的api配置
    const apiSettings = getApiSettings();
    const apiKey = apiSettings.apiKey || '';
    const result = await NodeSTManager.processChatMessage({
      userMessage: forwardedContent,
      status: '同一角色继续对话',
      conversationId: character.id,
      apiKey,
      apiSettings,
      character: character,
    });

      if (result.success && result.text) {
        // Add the character's response to chat history
        await addMessage(character.id, {
          id: `forward-response-${Date.now()}`,
          text: result.text,
          sender: "bot",
          timestamp: Date.now()
        });

        console.log(`【朋友圈】成功转发文本内容给角色 ${character.name} 并获得响应`);
      } else {
        console.error('【朋友圈】转发处理失败:', result.error);
      }
    } catch (error) {
      console.error('【朋友圈】处理文本转发失败:', error);
      throw error;
    }
  };

  // Add new helper function to handle forwards with images
  const handleForwardWithImages = async (character: Character, forwardedContent: string, images: string[]) => {
    try {
      // 使用最新的api配置
      const apiSettings = getApiSettings();
      const apiKey = apiSettings.apiKey || '';
      const result = await NodeSTManager.processChatMessage({
        userMessage: forwardedContent,
        status: '同一角色继续对话',
        conversationId: character.id,
        apiKey,
        apiSettings,
        character: character,
      });

      if (result.success && result.text) {
        await addMessage(character.id, {
          id: `forward-response-${Date.now()}`,
          text: result.text,
          sender: "bot",
          timestamp: Date.now()
        });
      }

    // 处理图片部分
    for (let i = 0; i < images.length; i++) {
      const imageUrl = images[i];
      console.log(`【朋友圈】处理转发图片 ${i+1}/${images.length}:`, imageUrl.substring(0, 30) + '...');
      let imageCacheId = imageUrl;
      try {
        if (!apiKey) {
          throw new Error("API密钥未设置");
        }
        const geminiAdapter = new GeminiAdapter(apiKey);
        const imageData = await geminiAdapter.fetchImageAsBase64(imageUrl);
        const cacheResult = await ImageManager.cacheImage(imageData.data, imageData.mimeType);
        imageCacheId = cacheResult.id;

        // 只插入图片 user 消息
        await addMessage(character.id, {
          id: `forward-image-${Date.now()}-${i}`,
          text: `![转发的图片](image:${imageCacheId})`,
          sender: "user",
          timestamp: Date.now()
        });

        // 处理图片并回复
        const response = await geminiAdapter.analyzeImage(
          { url: imageUrl },
          `这是用户转发的朋友圈图片。请分析这张图片并作出回应。注意保持${character.name}的人设口吻。`
        );

        if (response) {
          await addMessage(character.id, {
            id: `forward-image-response-${Date.now()}-${i}`,
            text: response,
            sender: "bot",
            timestamp: Date.now()
          });
        }
      } catch (error) {
        console.error(`【朋友圈】处理图片 ${i+1} 失败:`, error);
        // Continue with next image even if this one fails
      }
    }

    console.log(`【朋友圈】成功转发带图片的内容给角色 ${character.name}`);
  } catch (error) {
    console.error('【朋友圈】处理带图片的转发失败:', error);
    throw error;
  }
};

  // Post rendering
  const renderPost: ListRenderItem<CirclePost> = useCallback(({ item }) => (
    <TouchableOpacity
      activeOpacity={1}
      onLongPress={() => showPostMenu(item)}
      delayLongPress={500}
      style={[styles.card, { width: CARD_WIDTH }]}
      key={item.id}
    >
      <View style={styles.cardHeader}>
        <Image
          source={item.characterAvatar ? { uri: item.characterAvatar } : require('@/assets/images/default-avatar.png')}
          style={styles.authorAvatar}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.authorName}>{item.characterName}</Text>
          <Text style={styles.timestamp}>{new Date(item.createdAt).toLocaleString()}</Text>
        </View>
        
        {/* Show deletion indicator */}
        {deletingPostId === item.id && (
          <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginLeft: theme.spacing.sm }} />
        )}
        
        {/* Show test processing indicator */}
        {testModeEnabled && processingCharacters.length > 0 && (
          <View style={styles.processingIndicator}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.processingText}>处理中 ({processingCharacters.length})</Text>
          </View>
        )}
        
        {/* Add menu button for all posts - modified to allow for all posts */}
        <TouchableOpacity 
          style={styles.postMenuButton}
          onPress={() => showPostMenu(item)}
        >
          <MaterialIcons name="more-vert" size={20} color={theme.colors.white} />
        </TouchableOpacity>
      </View>

      <Text style={styles.content}>{item.content}</Text>
      
      {/* Show post thoughts if available */}
      {item.thoughts && (
        <View style={styles.thoughtsContainer}>
          <TouchableOpacity 
            style={styles.thoughtsHeader}
            onPress={() => toggleThoughtExpansion(`post-${item.id}`)}
          >
            <Text style={styles.thoughtsTitle}>
              {expandedThoughts[`post-${item.id}`] ? '收起发布想法' : '查看发布想法'}
            </Text>
            <AntDesign 
              name={expandedThoughts[`post-${item.id}`] ? 'caretup' : 'caretdown'} 
              size={12} 
              color={theme.colors.textSecondary} 
            />
          </TouchableOpacity>
          
          {expandedThoughts[`post-${item.id}`] && (
            <View style={styles.thoughtsBubble}>
              <Text style={styles.thoughtsText}>{item.thoughts}</Text>
            </View>
          )}
        </View>
      )}
      
      {/* Show images if available */}
        {item.images && item.images.length > 0 && (
      <View style={[
        styles.imagesContainer, 
        { flexDirection: item.images.length === 1 ? 'column' : 'row' }
      ]}>
        {item.images.map((image, index) => {
          const images = item.images || [];
          const imageSize = images.length === 1 
            ? { width: CARD_WIDTH - 16, height: 200 }
            : images.length === 2
              ? { width: (CARD_WIDTH - 24) / 2, height: 180 }
              : { width: (CARD_WIDTH - 32) / Math.min(images.length, 3), height: 120 };
            
            return (
              <TouchableOpacity
                key={index}
                onPress={() => handleImagePress(item.images!, index)}
                activeOpacity={0.8}
                style={{ margin: 4 }}
              >
                <Image 
                  source={{ uri: image }} 
                  style={[styles.contentImage, imageSize]}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => handleLike(item)}>
          <Ionicons
            name={item.hasLiked ? "heart" : "heart-outline"}
            size={24}
            color={item.hasLiked ? theme.colors.primary : theme.colors.white}
          />
          <Text style={styles.actionText}>{item.likes}</Text>
        </TouchableOpacity>



        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleCommentPress(item.id)}
        >
          <MaterialIcons name="comment" size={24} color={theme.colors.white} />
          <Text style={styles.actionText}>{item.comments?.length || 0}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            setSelectedPost(item);
            setIsForwardSheetVisible(true);
          }}
        >
          <MaterialIcons name="share" size={24} color={theme.colors.white} />
          <Text style={styles.actionText}>转发</Text>
        </TouchableOpacity>
      </View>

      {/* Show likes */}
      {item.likes > 0 && (
        <View style={styles.likesContainer}>
          <Ionicons name="heart" size={16} color={theme.colors.primary} style={styles.likeIcon} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.likeAvatars}>
            {item.likedBy?.map((like: CircleLike, index: number) => (
              <TouchableOpacity 
                key={`${like.userId}-${index}`}
                onPress={() => {
                  // Show like thoughts if available
                  if (like.thoughts) {
                    const likeId = `like-${like.userId}-${index}`;
                    toggleThoughtExpansion(likeId);
                  }
                }}
              >
                <Image
                  source={
                    like.userAvatar
                      ? { uri: like.userAvatar }
                      : like.isCharacter
                        ? require('@/assets/images/default-avatar.png')
                        : require('@/assets/images/default-user-avatar.png')
                  }
                  style={styles.likeAvatar}
                />
                
                {/* Display like thoughts in a tooltip/popup if available */}
                {like.thoughts && expandedThoughts[`like-${like.userId}-${index}`] && (
                  <View style={styles.likeThoughtsBubble}>
                    <Text style={styles.thoughtsText}>{like.thoughts}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Show comments */}
      {item.comments?.map(comment => renderComment(comment))}
      
      {/* Show comment input if active */}
      {activePostId === item.id && renderCommentInput(item)}
    </TouchableOpacity>
  ), [activePostId, renderComment, renderCommentInput, testModeEnabled, processingCharacters, 
      handleLike, handleCommentPress, deletingPostId, showPostMenu, handleImagePress,
      expandedThoughts, toggleThoughtExpansion]);

  const renderUserPostModal = () => (
    <Modal
      visible={showUserPostModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowUserPostModal(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.postModalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>发布新动态</Text>
            <TouchableOpacity
              onPress={() => setShowUserPostModal(false)}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close" size={24} color={theme.colors.white} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.postInputContainer}>
            <TextInput
              style={styles.postTextInput}
              multiline
              placeholder="分享你的想法..."
              placeholderTextColor={theme.colors.textSecondary}
              value={userPostText}
              onChangeText={setUserPostText}
              maxLength={500}
            />
            
            {/* Image preview section */}
            {userPostImages.length > 0 && (
              <View style={styles.imagePreviewContainer}>
                {userPostImages.map((uri, index) => (
                  <View key={index} style={styles.imagePreviewWrapper}>
                    <Image source={{ uri }} style={styles.imagePreview} />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => {
                        const newImages = [...userPostImages];
                        newImages.splice(index, 1);
                        setUserPostImages(newImages);
                      }}
                    >
                      <Ionicons name="close-circle" size={20} color={theme.colors.white} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            
            <View style={styles.postActions}>
              <TouchableOpacity 
                style={styles.imagePickerButton}
                onPress={handleSelectImages}
                disabled={userPostImages.length >= 4}
              >
                <Ionicons 
                  name="image-outline" 
                  size={24} 
                  color={userPostImages.length >= 4 ? theme.colors.textSecondary : theme.colors.white} 
                />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[
                  styles.postSubmitButton,
                  (!userPostText.trim() && userPostImages.length === 0) && styles.disabledButton
                ]}
                onPress={handleCreateUserPost}
                disabled={isCreatingPost || (!userPostText.trim() && userPostImages.length === 0)}
              >
                {isCreatingPost ? (
                  <ActivityIndicator size="small" color={theme.colors.white} />
                ) : (
                  <Text style={styles.postSubmitButtonText}>发布</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (error && activeTab === 'circle') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={() => {
              setError(null);
              setIsLoading(true);
              loadPosts();
            }}
          >
            <Text style={styles.retryButtonText}>重试</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.safeArea}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : -200}
      enabled={true}
    >
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ImageBackground 
        source={require('@/assets/images/default-background.jpg')}
        style={styles.backgroundImage}
      >
        {renderHeader()}
        {/* Circle Tab Content */}
        {activeTab === 'circle' && (
          <>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>加载朋友圈内容中...</Text>
              </View>
            ) : (
              <FlatList
                ref={flatListRef}
                data={posts}
                renderItem={renderPost}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContainer}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>暂无动态</Text>
                  </View>
                }
              />
            )}
          </>
        )}      

        {isForwardSheetVisible && selectedPost && (
          <ForwardSheet
            isVisible={isForwardSheetVisible}
            onClose={() => {
              setIsForwardSheetVisible(false);
              setSelectedPost(null);
            }}
            characters={characters}
            post={selectedPost}
            onForward={handleForward}
          />
        )}

        {/* User Post Modal */}
        {renderUserPostModal()}

        {/* Image Viewer */}
        {isImageViewerVisible && (
          <ImageViewer
            images={selectedImages}
            initialIndex={currentImageIndex}
            isVisible={isImageViewerVisible}
            onClose={() => setIsImageViewerVisible(false)}
          />
        )}


        {/* Character Interaction Settings Modal */}
        <CharacterInteractionSettings
          isVisible={showInteractionSettings}
          onClose={() => setShowInteractionSettings(false)}
        />

        {/* Character Selector for Publishing */}
        {renderCharacterSelectorModal()}
      </ImageBackground>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  // Character selector styles
  characterInfo: {
    flex: 1,
    marginRight: 8,
  },
  // Header styles matched with Character page
  header: {
    backgroundColor: '#333333',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 224, 195, 0.2)',
    zIndex: 10,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'rgb(255, 224, 195)',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerButtonDisabled: {
    opacity: 0.5,
  },

  // Post and card styles
  card: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.md,
    padding: width > 380 ? theme.spacing.md : theme.spacing.sm,
    marginBottom: theme.spacing.md,
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  authorAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    marginRight: theme.spacing.sm,
  },
  authorName: {
    color: theme.colors.text,
    fontSize: width > 380 ? theme.fontSizes.md : theme.fontSizes.sm,
    fontWeight: 'bold',
  },
  timestamp: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
  },
  content: {
    color: theme.colors.text,
    fontSize: theme.fontSizes.md,
    marginBottom: theme.spacing.sm,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.xs,
  },
  actionText: {
    color: theme.colors.text,
    marginLeft: 4,
  },
  
  // Like section styles
  likesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  likeIcon: {
    marginRight: theme.spacing.sm,
  },
  likeAvatars: {
    flexDirection: 'row',
  },
  likeAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 4,
    backgroundColor: theme.colors.input,
  },
  
  // Comment styles
  comment: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: width > 380 ? theme.spacing.sm : theme.spacing.xs,
  },
  commentAvatar: {
    width: width > 380 ? 32 : 28,
    height: width > 380 ? 32 : 28,
    borderRadius: width > 380 ? 16 : 14,
    marginRight: theme.spacing.sm,
  },
  commentContent: {
    flex: 1,
  },
  commentAuthor: {
    color: theme.colors.text,
    fontWeight: 'bold',
    fontSize: width > 380 ? theme.fontSizes.md : theme.fontSizes.sm,
    marginBottom: 2,
  },
  commentText: {
    color: theme.colors.text,
    flexShrink: 1,
    fontSize: width > 380 ? theme.fontSizes.md : theme.fontSizes.sm,
  },
  replyText: {
    color: theme.colors.primary,
    fontWeight: 'bold',
    marginRight: 4,
  },
  replyButton: {
    marginTop: 4,
    paddingVertical: 4,
  },
  replyButtonText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.xs,
  },
  
  // Comment input styles
  commentInput: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    position: 'relative',
    zIndex: 1,
    paddingBottom: Platform.OS === 'android' ? 4 : 0,
  },
  commentTextInput: {
    flex: 1,
    backgroundColor: theme.colors.input,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
    maxHeight: 100,
  },
  sendButton: {
    padding: theme.spacing.sm,
  },
  replyIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.backgroundSecondary,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.sm,
  },
  replyIndicatorText: {
    color: theme.colors.text,
    fontSize: theme.fontSizes.sm,
  },
  processingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    backgroundColor: theme.colors.overlay,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
  },
  processingText: {
    color: theme.colors.text,
    fontSize: theme.fontSizes.sm,
    marginLeft: 4,
  },
  
  // Common layout styles
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: theme.colors.text,
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: theme.fontSizes.md,
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSizes.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.md,
  },
  listContainer: {
    padding: theme.spacing.md,
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
  },

  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: width > 600 ? '80%' : '90%',
    maxHeight: '80%',
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modalTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  modalCloseButton: {
    padding: 4,
  },

  // User Post Modal styles
  postModalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
  },
  postInputContainer: {
    padding: theme.spacing.md,
  },
  postTextInput: {
    backgroundColor: theme.colors.input,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.md,
    color: theme.colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  imagePreviewContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: theme.spacing.md,
  },
  imagePreviewWrapper: {
    position: 'relative',
    marginRight: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: theme.borderRadius.sm,
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: theme.colors.overlay,
    borderRadius: 12,
  },
  postActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  imagePickerButton: {
    padding: 10,
  },
  postSubmitButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 20,
  },
  disabledButton: {
    backgroundColor: theme.colors.disabled,
  },
  postSubmitButtonText: {
    color: theme.colors.black,
    fontWeight: '500',
    fontSize: theme.fontSizes.md,
  },
  
  // Images container style
  imagesContainer: {
    flexWrap: 'wrap',
    marginVertical: theme.spacing.sm,
    justifyContent: 'flex-start',
  },
  
  contentImage: {
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.input,
  },

  // Add styles for thoughts section
  thoughtsContainer: {
    marginVertical: theme.spacing.xs,
  },
  thoughtsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.sm,
    alignSelf: 'flex-start',
  },
  thoughtsTitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.xs,
    marginRight: 4,
  },
  thoughtsBubble: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm,
    marginTop: theme.spacing.xs,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.accent,
  },
  thoughtsText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    fontStyle: 'italic',
  },
  
  // Add styles for like thoughts tooltip
  likeThoughtsBubble: {
    position: 'absolute',
    bottom: 40,
    left: -50,
    width: 150,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    zIndex: 100,
    elevation: 5,
    shadowColor: theme.colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  
  // Post menu button style
  postMenuButton: {
    padding: theme.spacing.xs,
    marginLeft: theme.spacing.sm,
  },

  // Styles for character selector
  characterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundSecondary,
    padding: 12,
    borderRadius: theme.borderRadius.md,
    marginBottom: 8,
  },
  selectorAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  characterSubtext: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    marginTop: 2,
  },
  characterName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  randomCharacterButton: {
    backgroundColor: theme.colors.backgroundSecondary,
    padding: 12,
    borderRadius: theme.borderRadius.md,
    margin: 16,
    alignItems: 'center',
  },
  randomButtonText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  selectedCharacterItem: {
    backgroundColor: 'rgba(255, 224, 195, 0.2)',
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  confirmButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
  confirmButtonText: {
    color: theme.colors.black,
    fontSize: theme.fontSizes.md,
    fontWeight: '500',
  },
  emptySubText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },

  // 新增顶部栏样式，完全对齐TopBarWithBackground
  topBarContainer: {
    position: 'relative',
    width: '100%',
    zIndex: 100,
  },
  topBarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  topBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    height: '100%',
  },
  topBarMenuButton: {
    padding: 8,
  },
  topBarTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  topBarTitle: {
    color: '#fff',
    fontSize: width > 380 ? 18 : 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topBarActionButton: {
    padding: width > 380 ? 8 : 6,
    marginLeft: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },
  topBarActionButtonDisabled: {
    opacity: 0.5,
  },
});

export default Explore;