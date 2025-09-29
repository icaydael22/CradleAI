import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import {  SidebarItemProps, CharactersContextType, Memo,CradleSettings, } from '@/constants/types';
import { WorldBookJson,CradleCharacter } from '@/shared/types';
import * as FileSystem from 'expo-file-system';
import { useUser } from './UserContext';
import { Character, Message, CirclePost } from '@/shared/types';
import { EventRegister } from 'react-native-event-listeners';
import { DeviceEventEmitter } from 'react-native';

import { downloadAndSaveImage, deleteCharacterImages } from '@/utils/imageUtils';
import { GeminiAdapter } from '@/NodeST/nodest/utils/gemini-adapter'; 
import { OpenRouterAdapter } from '@/NodeST/nodest/utils/openrouter-adapter';
import CradleCloudAdapter from '@/NodeST/nodest/utils/cradlecloud-adapter';
import { CharacterGeneratorService } from '@/NodeST/nodest/services/character-generator-service';
import { NodeSTManager } from '@/utils/NodeSTManager';
import { getApiSettings } from '@/utils/settings-helper';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';
import AudioCacheManager from '@/utils/AudioCacheManager';
import { CharacterStorageService } from '@/services/CharacterStorageService';

// 新增：定义生成图片的接口
export interface GeneratedImage {
  id: string;
  prompt: string;
  timestamp: number;
}

const CharactersContext = createContext<CharactersContextType | undefined>(undefined);
// Initialize CradleService with API key from environment or settings


export const CharactersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [conversations, setConversations] = useState<SidebarItemProps[]>([]);
  const [conversationIdMap, setConversationIdMap] = useState<{ [key: string]: string }>({});
  const [messagesMap, setMessagesMap] = useState<{ [conversationId: string]: Message[] }>({});
  const [memos, setMemos] = useState<Memo[]>([]);
  const [favorites, setFavorites] = useState<CirclePost[]>([]);
  // 新增：生成图片缓存状态
  const [generatedImages, setGeneratedImages] = useState<{ [conversationId: string]: GeneratedImage[] }>({});
  
  // Initialize storage service
  const storageService = CharacterStorageService.getInstance();
  const updateCharacterExtraBackgroundImage = async (characterId: string, extrabackgroundimage: string) => {
    try {
      // Use new storage service for atomic updates
      await storageService.updateCharacterField(characterId, 'extrabackgroundimage', extrabackgroundimage);
      
      // Update local state
      setCharacters(prevChars => 
        prevChars.map(char => 
          char.id === characterId 
            ? { ...char, extrabackgroundimage, updatedAt: Date.now() }
            : char
        )
      );
      
      console.log(`[CharactersContext] extrabackgroundimage updated for character: ${characterId}`);
    } catch (error) {
      console.error('[CharactersContext] Failed to update extrabackgroundimage:', error);
      throw error;
    }
  };
  // 添加摇篮系统相关状态
  const [cradleSettings, setCradleSettings] = useState<CradleSettings>({
    enabled: false,
    duration: 7,
    progress: 0,
    feedInterval: 1
  });
  const [cradleCharacters, setCradleCharacters] = useState<CradleCharacter[]>([]);
  
  
  const { user } = useUser();

  useEffect(() => {
    initializeStorage();
    loadConversations();
    loadMessages();
    loadMemos();
    loadFavorites();
    loadCradleCharacters();
    loadGeneratedImages(); // 新增：加载生成图片缓存
  }, []);

  const initializeStorage = async () => {
    try {
      setIsLoading(true);
      
      // Initialize storage service (handles migration automatically)
      await storageService.initialize();
      
      // Load characters using new storage service
      await loadCharacters();
    } catch (error) {
      console.error('Failed to initialize storage:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMessages = async () => {
    try {
      const messagesStr = await FileSystem.readAsStringAsync(
        FileSystem.documentDirectory + 'messages.json',
        { encoding: FileSystem.EncodingType.UTF8 }
      ).catch(() => '{}');

      const loadedMessages = JSON.parse(messagesStr);
      setMessagesMap(loadedMessages);
    } catch (error) {
      console.error('加载消息数据失败:', error);
      setMessagesMap({});
    }
  };

  const saveMessages = async (newMessagesMap: { [conversationId: string]: Message[] }) => {
    try {
      await FileSystem.writeAsStringAsync(
        FileSystem.documentDirectory + 'messages.json',
        JSON.stringify(newMessagesMap),
        { encoding: FileSystem.EncodingType.UTF8 }
      );
    } catch (error) {
      console.error('保存消息数据失败:', error);
    }
  };

  const loadCharacters = async () => {
    try {
      console.log('[CharactersContext] Loading characters using new storage service...');
      const loadedCharacters = await storageService.getAllCharacters();
      setCharacters(loadedCharacters);
      console.log(`[CharactersContext] Loaded ${loadedCharacters.length} characters`);
    } catch (error) {
      console.error('Failed to load characters:', error);
      setCharacters([]);
    }
  };

  const loadConversations = async () => {
    try {
      const conversationsStr = await FileSystem.readAsStringAsync(
        FileSystem.documentDirectory + 'conversations.json',
        { encoding: FileSystem.EncodingType.UTF8 }
      ).catch(() => '[]');

      const loadedConversations: SidebarItemProps[] = JSON.parse(conversationsStr);
      const fixedConversations = loadedConversations.map(conversation => {
        if (!conversation.id || typeof conversation.id !== 'string') {
          return { ...conversation, id: String(Date.now()) + Math.random().toString(36).substring(2, 15) };
        }
        return conversation;
      });

      setConversations(fixedConversations);

      const conversationIdMapStr = await FileSystem.readAsStringAsync(
        FileSystem.documentDirectory + 'conversationIdMap.json',
        { encoding: FileSystem.EncodingType.UTF8 }
      ).catch(() => '{}');
      const loadedConversationIdMap: { [key: string]: string } = JSON.parse(conversationIdMapStr);
      setConversationIdMap(loadedConversationIdMap);
    } catch (error) {
      console.error('加载对话或 conversationIdMap 数据失败:', error);
    }
  };

  const addCharacter = async (character: Character): Promise<void> => {
    console.log('[CharactersContext] Starting addCharacter with new storage service...');
    
    if (!character) {
      const error = new Error('Invalid character: received null/undefined');
      console.error('[CharactersContext Error 1]', error);
      throw error;
    }
  
    try {
      // Validate required fields
      if (!character.id || !character.name) {
        const error = new Error('Invalid character data: missing id or name');
        console.error('[CharactersContext Error 2]', error, character);
        throw error;
      }
  
      // Handle cradle character setup if needed
      const isCradleCharacter = character.inCradleSystem === true;
      if (isCradleCharacter) {
        console.log('[CharactersContext] Character has inCradleSystem flag, handling as cradle character');
        
        // Ensure character has all required cradle fields
        const cradleCharacter: CradleCharacter = {
          ...character as Character,
          inCradleSystem: true,
          cradleStatus: (character as CradleCharacter).cradleStatus || 'growing',
          cradleCreatedAt: (character as CradleCharacter).cradleCreatedAt || Date.now(),
          cradleUpdatedAt: (character as CradleCharacter).cradleUpdatedAt || Date.now(),
          feedHistory: (character as CradleCharacter).feedHistory || [],
        };
        
        // Handle image generation tracking if task ID is present
        if ((character as CradleCharacter).imageGenerationTaskId) {
          console.log('[CharactersContext] Character has image generation task, setting up tracking');
          cradleCharacter.imageGenerationStatus = 'pending';
          
          if ((character as any).generationData?.appearanceTags) {
            cradleCharacter.generationData = (character as any).generationData;
            console.log('[CharactersContext] Added generation data from appearance tags');
          }
        }
  
        character = cradleCharacter;
      }
    
      // Use new storage service
      console.log('[CharactersContext] Saving character using storage service...');
      await storageService.addCharacter(character);
      
      // Update local state
      setCharacters(prevChars => {
        const newCharactersArray = [...prevChars, character];
        console.log('[CharactersContext] Characters state updated with new array, length:', newCharactersArray.length);
        return newCharactersArray;
      });
      
      console.log('[CharactersContext] Character added successfully');
    
    } catch (error) {
      console.error('[CharactersContext Error Final]', error);
      throw error;
    }
  };

const updateCharacter = async (character: Character) => {
  try {
    console.log('[CharactersContext] Updating character using new storage service:', character.id);
    
    // Use new storage service
    await storageService.updateCharacter(character);
    
    // Update local state
    setCharacters(prevChars => {
      const charIndex = prevChars.findIndex(char => char.id === character.id);
      if (charIndex >= 0) {
        const updatedChars = [...prevChars];
        updatedChars[charIndex] = character;
        return updatedChars;
      } else {
        // Character not found in state, add it
        return [...prevChars, character];
      }
    });
    
    console.log('[CharactersContext] Character updated successfully:', character.id);
    
    // Trigger character update events
    EventRegister.emit('characterUpdated', {
      characterId: character.id,
      character: character
    });
    
    // Send specific event for image updates
    DeviceEventEmitter.emit('characterImageUpdated', {
      characterId: character.id,
      avatar: character.avatar,
      backgroundImage: character.backgroundImage
    });
    
  } catch (error) {
    console.error('[CharactersContext] Error updating character:', error);
    throw error;
  }
};

  const deleteCharacters = async (ids: string[]) => {
    try {
      console.log('[CharactersContext] Deleting characters using new storage service:', ids);
      
      // 1. Delete local image resources first
      for (const id of ids) {
        await deleteCharacterImages(id);
      }
      console.log('[CharactersContext] Deleted character image resources');

      // 2. Use new storage service to delete characters
      await storageService.deleteCharacters(ids);

      // 3. Update local state
      setCharacters(prevChars => prevChars.filter(char => !ids.includes(char.id)));
      
      // 4. Clean up other related data
      setConversationIdMap(prevMap => {
        const updatedMap = { ...prevMap };
        ids.forEach(id => delete updatedMap[id]);
        FileSystem.writeAsStringAsync(
          FileSystem.documentDirectory + 'conversationIdMap.json',
          JSON.stringify(updatedMap),
          { encoding: FileSystem.EncodingType.UTF8 }
        ).catch(error => console.error('Failed to update conversationIdMap:', error));
        return updatedMap;
      });

      // Clear messages for deleted characters
      setMessagesMap(prevMessages => {
        const updatedMessages = { ...prevMessages };
        ids.forEach(id => delete updatedMessages[id]);
        saveMessages(updatedMessages);
        return updatedMessages;
      });

      // 5. Clear audio cache for deleted characters
      try {
        const audioCacheManager = AudioCacheManager.getInstance();
        for (const id of ids) {
          await audioCacheManager.clearConversationAudio(id);
          console.log(`[CharactersContext] Cleared audio cache for deleted character: ${id}`);
        }
      } catch (error) {
        console.error('[CharactersContext] Failed to clear audio cache for deleted characters:', error);
      }

      // 6. Additional cleanup: conversations, generated images, favorites, cradle characters
      try {
        // Remove conversations entries for deleted characters
        setConversations(prev => {
          try {
            const updated = prev.filter(conv => !ids.includes(conv.id));
            FileSystem.writeAsStringAsync(
              FileSystem.documentDirectory + 'conversations.json',
              JSON.stringify(updated),
              { encoding: FileSystem.EncodingType.UTF8 }
            ).catch(err => console.error('[CharactersContext] Failed to update conversations.json:', err));
            return updated;
          } catch (e) {
            console.error('[CharactersContext] Error filtering conversations:', e);
            return prev;
          }
        });

        // Remove generated images entries for deleted conversations
        try {
          setGeneratedImages(prevMap => {
            const updatedMap = { ...prevMap };
            let changed = false;
            ids.forEach(id => {
              if (updatedMap.hasOwnProperty(id)) {
                delete updatedMap[id];
                changed = true;
              }
            });
            if (changed) {
              saveGeneratedImages(updatedMap).catch(err => console.error('[CharactersContext] Failed to save generated images after deletion:', err));
            }
            return updatedMap;
          });
        } catch (e) {
          console.error('[CharactersContext] Error clearing generated images for deleted characters:', e);
        }

        // Remove favorites that reference deleted characters
        try {
          setFavorites(prev => {
            try {
              const updated = prev.filter(post => !ids.includes((post as any).characterId));
              saveFavorites(updated).catch(err => console.error('[CharactersContext] Failed to save favorites after deletion:', err));
              return updated;
            } catch (e) {
              console.error('[CharactersContext] Error filtering favorites:', e);
              return prev;
            }
          });
        } catch (e) {
          console.error('[CharactersContext] Error during favorites cleanup:', e);
        }

        // Remove cradle characters entries related to deleted characters
        try {
          setCradleCharacters(prev => {
            try {
              const updated = prev.filter(cc => !ids.includes(cc.id) && !ids.includes((cc as any).importedCharacterId));
              saveCradleCharacters(updated).catch(err => console.error('[CharactersContext] Failed to save cradle_characters after deletion:', err));
              return updated;
            } catch (e) {
              console.error('[CharactersContext] Error filtering cradle characters:', e);
              return prev;
            }
          });
        } catch (e) {
          console.error('[CharactersContext] Error during cradle characters cleanup:', e);
        }
      } catch (error) {
        console.error('[CharactersContext] Additional cleanup failed (non-blocking):', error);
      }

      console.log(`[CharactersContext] Successfully deleted ${ids.length} characters`);

    } catch (error) {
      console.error('Failed to delete characters:', error);
      throw error;
    }
  };

  const addConversation = async (conversation: SidebarItemProps) => {
    setConversations(prevConversations => {
      const updatedConversations = [...prevConversations, conversation];
      FileSystem.writeAsStringAsync(
        FileSystem.documentDirectory + 'conversations.json',
        JSON.stringify(updatedConversations),
        { encoding: FileSystem.EncodingType.UTF8 }
      ).catch(error => console.error('保存对话数据失败:', error));

      setConversationIdMap(prevMap => {
        const updatedMap = { ...prevMap, [conversation.id]: '' };
        FileSystem.writeAsStringAsync(
        FileSystem.documentDirectory + 'conversationIdMap.json',
        JSON.stringify(updatedMap),
        { encoding: FileSystem.EncodingType.UTF8 }
      ).catch(error => console.error('保存 conversationIdMap 失败:', error));
        return updatedMap;
      });

      return updatedConversations;
    });
  };

  const getConversationId = (conversationId: string) => {
    return conversationIdMap[conversationId] || '';
  };

  const setConversationId = (conversationId: string, difyConversationId: string) => {
    setConversationIdMap(prevMap => {
      const updatedMap = { ...prevMap, [conversationId]: difyConversationId };
      FileSystem.writeAsStringAsync(
        FileSystem.documentDirectory + 'conversationIdMap.json',
        JSON.stringify(updatedMap),
        { encoding: FileSystem.EncodingType.UTF8 }
      ).catch(error => console.error('保存 conversationIdMap 失败:', error));
      return updatedMap;
    });
  };

  const getApiKey = () => {
    // Check which API provider is being used
    const apiProvider = user?.settings?.chat?.apiProvider || 'gemini';
    
    // Return the appropriate API key based on provider
    if (apiProvider === 'openrouter' && user?.settings?.chat?.openrouter?.enabled) {
      return user?.settings?.chat?.openrouter?.apiKey || '';
    }
    
    // Default to Gemini API key
    return user?.settings?.chat?.characterApiKey || '';
  };

  const getCharacterConversationId = (characterId: string) => {
    const character = characters.find(char => char.id === characterId);
    return character?.conversationId;
  };

  // 新增：获取对话的最后消息时间（用于首页显示）
  const getLastMessageTime = async (conversationId: string) => {
    try {
      const chatMessages = await StorageAdapter.getCleanChatHistory(conversationId);
      if (chatMessages.length === 0) return null;
      
      // 获取最后一条消息
      const lastMessage = chatMessages[chatMessages.length - 1];
      // 优先使用渲染时间，如果没有则使用时间戳
      return lastMessage.renderedAt || lastMessage.timestamp || null;
    } catch (error) {
      console.error('Failed to get last message time:', error);
      return null;
    }
  };

  // New message management functions
  // 重构 getMessages: 直接异步从 StorageAdapter 获取消息，并做角色转换
  const getMessages = async (conversationId: string) => {
    // 从 StorageAdapter 获取干净的消息历史
    const chatMessages = await StorageAdapter.getCleanChatHistory(conversationId);
    // 转换为 context 统一的 Message 格式
    return chatMessages.map(msg => ({
      id: msg.id || `${conversationId}_${msg.timestamp || Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text: msg.parts?.[0]?.text || '',
      sender: (msg.role === 'user') ? 'user' : 'bot',
      isLoading: false,
      timestamp: msg.timestamp,
      renderedAt: msg.renderedAt, // 添加渲染时间字段
      rating: msg.rating,
      metadata: msg.metadata, // 添加metadata字段以保留朋友圈互动标记

    }));
  };

  const addMessage = async (conversationId: string, message: Message) => {
    setMessagesMap(prevMap => {
      const currentMessages = prevMap[conversationId] || [];
      
      if (message.sender === 'bot' && !message.isLoading) {
        // 移除所有加载状态的消息
        const filteredMessages = currentMessages.filter(msg => !msg.isLoading);
        // 检查消息是否已存在
        const messageExists = filteredMessages.some(msg => msg.id === message.id);
        if (!messageExists) {
          filteredMessages.push(message);
        }
        
        const updatedMap = {
          ...prevMap,
          [conversationId]: filteredMessages
        };
        
        saveMessages(updatedMap);
        return updatedMap;
      } else {
        // 检查消息是否已存在
        const messageExists = currentMessages.some(msg => msg.id === message.id);
        if (messageExists) {
          return prevMap; // 如果消息已存在，返回原状态
        }
        
        const newMessages = [...currentMessages, message];
        const updatedMap = {
          ...prevMap,
          [conversationId]: newMessages
        };
        
        saveMessages(updatedMap);
        return updatedMap;
      }
    });
  };

  const clearMessages = async (conversationId: string) => {
    const newMessagesMap = { ...messagesMap };
    delete newMessagesMap[conversationId];
    setMessagesMap(newMessagesMap);
    await saveMessages(newMessagesMap);
    
    // 清理该会话的音频缓存
    try {
      const audioCacheManager = AudioCacheManager.getInstance();
      await audioCacheManager.clearConversationAudio(conversationId);
      console.log(`[CharactersContext] Cleared audio cache for conversation: ${conversationId}`);
    } catch (error) {
      console.error('[CharactersContext] Failed to clear audio cache:', error);
    }
  };

  // Add new function to remove a specific message by ID
  const removeMessage = async (conversationId: string, messageId: string) => {
    try {
      setMessagesMap(prevMap => {
        const currentMessages = prevMap[conversationId] || [];
        
        // Filter out the message with the specified ID
        const updatedMessages = currentMessages.filter(msg => msg.id !== messageId);
        
        // If no change, return the original map
        if (updatedMessages.length === currentMessages.length) {
          return prevMap;
        }
        
        // Create updated map
        const updatedMap = {
          ...prevMap,
          [conversationId]: updatedMessages
        };
        
        // Save to persistent storage
        saveMessages(updatedMap);
        
        return updatedMap;
      });
    } catch (error) {
      console.error('[CharactersContext] Failed to remove message:', error);
    }
  };



  // Add loadMemos function
  const loadMemos = async () => {
    try {
      const memosStr = await FileSystem.readAsStringAsync(
        FileSystem.documentDirectory + 'memos.json',
        { encoding: FileSystem.EncodingType.UTF8 }
      ).catch(() => '[]');

      const loadedMemos: Memo[] = JSON.parse(memosStr);
      setMemos(loadedMemos);
    } catch (error) {
      console.error('Failed to load memos:', error);
      setMemos([]);
    }
  };

  // Add saveMemos function
  const saveMemos = async (newMemos: Memo[]) => {
    try {
      await FileSystem.writeAsStringAsync(
        FileSystem.documentDirectory + 'memos.json',
        JSON.stringify(newMemos),
        { encoding: FileSystem.EncodingType.UTF8 }
      );
    } catch (error) {
      console.error('Failed to save memos:', error);
      throw error;
    }
  };

  // Add memo management functions
  const addMemo = async (content: string) => {
    const firstLine = content.split('\n')[0];
    const newMemo: Memo = {
      id: String(Date.now()),
      title: firstLine,
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedMemos = [...memos, newMemo];
    await saveMemos(updatedMemos);
    setMemos(updatedMemos);
  };

  const updateMemo = async (id: string, content: string) => {
    const updatedMemos = memos.map(memo =>
      memo.id === id
        ? { ...memo, content, updatedAt: new Date().toISOString() }
        : memo
    );
    await saveMemos(updatedMemos);
    setMemos(updatedMemos);
  };

  const deleteMemo = async (id: string) => {
    const updatedMemos = memos.filter(memo => memo.id !== id);
    await saveMemos(updatedMemos);
    setMemos(updatedMemos);
  };

  const rateMessage = async (conversationId: string, messageId: string, isUpvote: boolean) => {
    const currentMessages = messagesMap[conversationId] || [];
    const messageIndex = currentMessages.findIndex(msg => msg.id === messageId);
    
    if (messageIndex === -1) return;

    const message = currentMessages[messageIndex];
    let newRating = message.rating || 0;

    // 如果当前评分与新评分方向相反，先重置评分
    if ((isUpvote && newRating < 0) || (!isUpvote && newRating > 0)) {
      newRating = 0;
    }

    // 根据评分方向更新评分，确保在 [-3, 3] 范围内
    if (isUpvote && newRating < 3) {
      newRating += 1;
    } else if (!isUpvote && newRating > -3) {
      newRating -= 1;
    }

    const updatedMessage = { ...message, rating: newRating };
    const updatedMessages = [...currentMessages];
    updatedMessages[messageIndex] = updatedMessage;

    setMessagesMap(prev => ({
      ...prev,
      [conversationId]: updatedMessages
    }));

    await saveMessages({
      ...messagesMap,
      [conversationId]: updatedMessages
    });
  };

  const loadFavorites = async () => {
    try {
      const favoritesStr = await FileSystem.readAsStringAsync(
        FileSystem.documentDirectory + 'favorites.json',
        { encoding: FileSystem.EncodingType.UTF8 }
      ).catch(() => '[]');

      setFavorites(JSON.parse(favoritesStr));
    } catch (error) {
      console.error('Failed to load favorites:', error);
      setFavorites([]);
    }
  };

  const saveFavorites = async (newFavorites: CirclePost[]) => {
    try {
      await FileSystem.writeAsStringAsync(
        FileSystem.documentDirectory + 'favorites.json',
        JSON.stringify(newFavorites),
        { encoding: FileSystem.EncodingType.UTF8 }
      );
    } catch (error) {
      console.error('Failed to save favorites:', error);
    }
  };

  const toggleFavorite = async (characterId: string, postId: string) => {
    const character = characters.find(c => c.id === characterId);
    if (!character) return;

    // 准备 favoritedPosts 集合
    const favoritedSet = new Set<string>(character.favoritedPosts || []);
    const willFavorite = !favoritedSet.has(postId);
    if (willFavorite) {
      favoritedSet.add(postId);
    } else {
      favoritedSet.delete(postId);
    }

    // 同步更新 circlePosts 内的 isFavorited（如果该帖子存在于内存列表中）
    let updatedCirclePosts = character.circlePosts;
    if (character.circlePosts && Array.isArray(character.circlePosts)) {
      updatedCirclePosts = character.circlePosts.map(p =>
        p.id === postId ? { ...p, isFavorited: willFavorite } : p
      );
    }

    // 生成更新后的角色对象
    const updatedCharacter: Character = {
      ...character,
      circlePosts: updatedCirclePosts,
      favoritedPosts: Array.from(favoritedSet),
      updatedAt: Date.now(),
    } as any;

    // 同步收藏夹（Favorites）状态缓存
    setFavorites(prev => {
      const prevMap = new Map(prev.map(p => [p.id, p]));
      if (willFavorite) {
        // 如果在 circlePosts 找不到这个帖子，则构造一个最小帖子占位符（仅用于收藏列表显示）
        const refPost = (character.circlePosts || []).find(p => p.id === postId) || ({
          id: postId,
          characterId: character.id,
          characterName: character.name,
          characterAvatar: character.avatar || null,
          content: '',
          createdAt: new Date().toISOString(),
          comments: [],
          likes: 0,
          hasLiked: false,
          isFavorited: true,
        } as any);
        prevMap.set(postId, { ...refPost, isFavorited: true });
      } else {
        prevMap.delete(postId);
      }
      const next = Array.from(prevMap.values());
      // 持久化收藏列表
      saveFavorites(next).catch(() => {});
      return next;
    });

    // 持久化角色更新
    await updateCharacter(updatedCharacter);
  };

  const getFavorites = () => favorites;
  
  // 新增：设置角色头像
  const setCharacterAvatar = async (characterId: string, avatarUri: string) => {
    try {
      // Update using CharacterStorageService
      await storageService.updateCharacterField(characterId, 'avatar', avatarUri);
      
      // Update local state
      const updatedCharacters = characters.map(char =>
        char.id === characterId
          // 保留所有原有字段，安全更新
          ? { ...char, avatar: avatarUri, updatedAt: Date.now() }
          : char
      );
      setCharacters(updatedCharacters);
    } catch (error) {
      console.error('[CharactersContext] 设置头像失败:', error);
    }
  };

  const setCharacterBackgroundImage = async (characterId: string, backgroundUri: string, config?: any) => {
    try {
      // Prepare the updated character data
      const updateData: Partial<Character> = {
        backgroundImage: backgroundUri,
        updatedAt: Date.now(),
        ...(config ? { backgroundImageConfig: config } : {})
      };
      
      // Update using CharacterStorageService (multiple fields)
      const character = characters.find(c => c.id === characterId);
      if (character) {
        const updatedCharacter = { ...character, ...updateData };
        await storageService.updateCharacter(updatedCharacter);
      }
      
      // Update local state
      const updatedCharacters = characters.map(char =>
        char.id === characterId
          // 保留所有原有字段，安全更新
          ? {
              ...char,
              backgroundImage: backgroundUri,
              // 新增：同步 config 到 backgroundImageConfig
              ...(config ? { backgroundImageConfig: config } : {}),
              updatedAt: Date.now()
            }
          : char
      );
      setCharacters(updatedCharacters);
    } catch (error) {
      console.error('[CharactersContext] 设置背景图失败:', error);
    }
  };

  
  // 加载摇篮角色列表
  const loadCradleCharacters = async () => {
    try {
      console.log('[摇篮系统] 开始加载摇篮角色');
      const charactersStr = await FileSystem.readAsStringAsync(
        FileSystem.documentDirectory + 'cradle_characters.json',
        { encoding: FileSystem.EncodingType.UTF8 }
      ).catch(() => '[]');

      const loadedCharacters: CradleCharacter[] = JSON.parse(charactersStr);
      console.log('[摇篮系统] 加载了', loadedCharacters.length, '个摇篮角色');
      setCradleCharacters(loadedCharacters);
    } catch (error) {
      console.error('[摇篮系统] 加载摇篮角色失败:', error);
      setCradleCharacters([]);
    }
  };
  
  // 保存摇篮角色列表
  const saveCradleCharacters = async (newCradleCharacters: CradleCharacter[]) => {
    try {
      console.log('[摇篮系统] 保存摇篮角色列表，数量:', newCradleCharacters.length);
      await FileSystem.writeAsStringAsync(
        FileSystem.documentDirectory + 'cradle_characters.json',
        JSON.stringify(newCradleCharacters),
        { encoding: FileSystem.EncodingType.UTF8 }
      );
    } catch (error) {
      console.error('[摇篮系统] 保存摇篮角色列表失败:', error);
    }
  };
  
  // 获取摇篮角色列表
  const getCradleCharacters = () => {
    // Filter characters to get only those in the cradle system and cast them to CradleCharacter
    const cradleChars = characters
      .filter(char => char.inCradleSystem)
      .map(char => ({
        ...char,
        feedHistory: (char as CradleCharacter).feedHistory || [],
        inCradleSystem: true,
        isCradleGenerated: (char as CradleCharacter).isCradleGenerated || false,
        importedFromCharacter: (char as CradleCharacter).importedFromCharacter || false,
        importedCharacterId: (char as CradleCharacter).importedCharacterId || null
      } as CradleCharacter));
    
    console.log(`[CharactersContext] 获取摇篮角色列表, 共 ${cradleChars.length} 个角色`);
    return cradleChars;
  };
  
  // 修改 addCradleCharacter 返回类型为 Promise<CradleCharacter>
const addCradleCharacter = async (character: CradleCharacter): Promise<CradleCharacter> => {
  try {
    console.log(`[CharactersContext] 开始添加摇篮角色: ${character.name}, ID: ${character.id}`);
    
    // Ensure circlePosts has unique keys
    if (character.circlePosts && character.circlePosts.length > 0) {
      character.circlePosts = character.circlePosts.map(post => ({
        ...post,
        id: post.id.includes('post-') ? post.id : `post-${Date.now()}-${Math.random().toString(36).substring(2, 9)}` // Ensure unique ID
      }));
    }
    
    // Ensure the character has all required fields
    const completeCharacter: CradleCharacter = {
      ...character,
      createdAt: character.createdAt || Date.now(),
      updatedAt: Date.now(),
      inCradleSystem: true,
      cradleStatus: 'growing', // Add status indicator
      cradleCreatedAt: Date.now(), // Track when it was added to cradle
      cradleUpdatedAt: Date.now(), // Track last update
      isCradleGenerated: false, // Not generated yet
      feedHistory: character.feedHistory || [],
      imageGenerationStatus: character.imageGenerationStatus || 'idle',
      imageGenerationTaskId: character.imageGenerationTaskId || null,
    };
  
    // Use CharacterStorageService to add the character
    await storageService.addCharacter(completeCharacter);

    // Now update state to ensure UI shows the latest data
    setCharacters(prevChars => [...prevChars, completeCharacter]);
    
    console.log(`[CharactersContext] 摇篮角色添加成功: ${character.name}, ID: ${character.id}`);
    return completeCharacter; // Return complete character object, not just ID
  } catch (error) {
    console.error('[CharactersContext] 添加摇篮角色失败:', error);
    throw error;
  }
};


// 修改 generateCharacterFromCradle 接受完整角色对象作为可选参数
const generateCharacterFromCradle = async (cradleIdOrCharacter: string | CradleCharacter): Promise<Character> => {
  try {
    let cradleCharacter: CradleCharacter | undefined;
    let cradleId: string;
    
    // 判断传入的是字符串ID还是完整角色对象
    if (typeof cradleIdOrCharacter === 'string') {
      cradleId = cradleIdOrCharacter; // 赋值给变量
      console.log(`[摇篮生成] 开始从摇篮ID生成角色: ${cradleId}`);
      
      // 增强：多次尝试查找角色，防止异步问题
      let retryCount = 0;
      const MAX_RETRIES = 3;
      
      // 首先尝试从文件系统中直接查找，这比依赖状态更可靠
      try {
        console.log(`[摇篮生成] 尝试从CharacterStorageService直接加载角色: ${cradleId}`);
        const foundCharacter = await storageService.getCharacter(cradleId);
        
        if (foundCharacter && foundCharacter.inCradleSystem) {
          console.log(`[摇篮生成] 在CharacterStorageService中找到角色: ${cradleId}`);
          cradleCharacter = foundCharacter as CradleCharacter;
        } else {
          // Fallback to FileSystem
          console.log(`[摇篮生成] 尝试从文件系统直接加载角色: ${cradleId}`);
          const existingDataStr = await FileSystem.readAsStringAsync(
            FileSystem.documentDirectory + 'characters.json'
          ).catch(() => '[]');
          const existingCharacters = JSON.parse(existingDataStr);
          const foundFileCharacter: Character | CradleCharacter | undefined = existingCharacters.find((char: Character | CradleCharacter) => char.id === cradleId && char.inCradleSystem);
          
          if (foundFileCharacter) {
            console.log(`[摇篮生成] 在文件系统中找到角色: ${cradleId}`);
            cradleCharacter = foundFileCharacter as CradleCharacter;
          }
        }
      } catch (error) {
        console.error(`[摇篮生成] 从存储加载角色失败: ${error}`);
      }
      
      // 如果文件系统没找到，再尝试从状态中查找
      while (!cradleCharacter && retryCount < MAX_RETRIES) {
        // Find the cradle character
        const foundCharacter = characters.find(char => char.id === cradleId && char.inCradleSystem);
        
        if (foundCharacter) {
          cradleCharacter = foundCharacter as CradleCharacter;
          break;
        } else {
          console.log(`[摇篮生成] 尝试 #${retryCount+1}: 找不到ID为 ${cradleId} 的摇篮角色，等待后重试...`);
          // 等待一段时间后重试
          await new Promise(resolve => setTimeout(resolve, 500));
          retryCount++;
        }
      }
      
      if (!cradleCharacter) {
        console.error(`[摇篮生成] 在 ${MAX_RETRIES} 次尝试后仍找不到ID为 ${cradleId} 的摇篮角色`);
        throw new Error(`找不到ID为 ${cradleId} 的摇篮角色`);
      }
    } else {
      // 传入的是完整角色对象，直接使用
      cradleCharacter = cradleIdOrCharacter;
      cradleId = cradleCharacter.id; // 从角色对象中获取ID
      console.log(`[摇篮生成] 使用传入的完整角色对象生成角色: ${cradleId}`);
    }
    
    
    // Get user API settings
    const apiSettings = getApiSettings();
    const apiProvider = apiSettings.apiProvider || 'gemini';
    const apiKey = apiSettings.apiKey || '';
    
    console.log(`[摇篮生成] 使用API提供商: ${apiProvider}`);
    
    if (!apiKey) {
      throw new Error('未设置API密钥，请在全局设置中配置');
    }

    try {
      // 使用LLM生成角色数据
      console.log('[摇篮生成] 准备调用LLM生成角色数据');
      
      // Select API adapter based on settings-helper
      let llmAdapter;
      if (apiProvider === 'gemini') {
        llmAdapter = new GeminiAdapter(apiKey);
      } else if (apiProvider === 'openrouter') {
        const model = apiSettings.openrouter?.model || "anthropic/claude-3-haiku";
        const openRouterApiKey = apiSettings.openrouter?.apiKey || apiKey;
        llmAdapter = new OpenRouterAdapter(openRouterApiKey, model);
      } else if (apiProvider === 'openai-compatible') {
        // 支持openai-compatible渠道
        const { endpoint, apiKey: openaiKey, model } = apiSettings.OpenAIcompatible || {};
        const { OpenAIAdapter } = require('@/NodeST/nodest/utils/openai-adapter');
        llmAdapter = new OpenAIAdapter({
          endpoint: endpoint || '',
          apiKey: openaiKey || '',
          model: model || 'gpt-3.5-turbo'
        });
      } else if (apiProvider === 'cradlecloud') {
        // Use CradleCloudAdapter when provider is cradlecloud
        try {
          llmAdapter = new CradleCloudAdapter();
        } catch (e) {
          console.warn('[摇篮生成] 初始化 CradleCloudAdapter 失败，回退到 GeminiAdapter', e);
          llmAdapter = new GeminiAdapter(apiKey);
        }
      } else {
        throw new Error(`不支持的API提供商: ${apiProvider}`);
      }
      const generator = new CharacterGeneratorService(llmAdapter);
      
      // Prepare data for character generator
      const initialData = {
        name: cradleCharacter.name,
        description: cradleCharacter.description,
        // Add generation data if available
        appearanceTags: cradleCharacter.generationData?.appearanceTags,
        traits: cradleCharacter.generationData?.traits,
        vndbResults: cradleCharacter.generationData?.vndbResults,
        initialSettings: {
          userGender: cradleCharacter.initialSettings?.userGender || 'male',
          // 使用 gender 属性而不是不存在的 characterGender
          characterGender: cradleCharacter.gender || 'other'
        }
      };
      
      // Log the complete request data that will be sent
      console.log('[摇篮生成] 角色生成请求数据:', JSON.stringify(initialData, null, 2));
      
      // Generate character using the LLM
      const result = await generator.generateInitialCharacter(initialData);
      
      if (!result.success || !result.roleCard || !result.worldBook) {
        throw new Error('生成角色数据失败: ' + (result.error || '未知错误'));
      }
      
      // 详细记录生成的roleCard内容，用于排查问题
      console.log('[摇篮生成] 生成的roleCard:', JSON.stringify(result.roleCard, null, 2));
      console.log('[摇篮生成] 生成的worldBook结构:', 
                 Object.keys(result.worldBook.entries).length + ' 个条目');
      console.log('[摇篮生成] 生成的preset结构:', 
                 result.preset ? Object.keys(result.preset).length + ' 个条目' : '无');
      
      // 构建完整的JSON数据，确保包含character-detail页面所需的所有字段
      // 确保将preset添加到结果中，它可能来自于generator或需要创建
      const preset = result.preset || {
        prompts: [
          {
            name: "Character System",
            content: "You are a Roleplayer who is good at playing various types of roles. Regardless of the genre, you will ensure the consistency and authenticity of the role based on the role settings I provide, so as to better fulfill the role.",
            enable: true,
            identifier: "characterSystem",
            role: "user"
          },
          {
            name: "Character Confirmation",
            content: "[Understood]",
            enable: true,
            identifier: "characterConfirmation",
            role: "model"
          },
          {
            name: "Character Introduction",
            content: "The following are some information about the character you will be playing. Additional information will be given in subsequent interactions.",
            enable: true,
            identifier: "characterIntro",
            role: "user"
          },
          {
            name: "Enhance Definitions",
            content: "",
            enable: true,
            identifier: "enhanceDefinitions",
            injection_position: 1,
            injection_depth: 3,
            role: "user"
          },
          {
            name: "Context Instruction",
            content: "推荐以下面的指令&剧情继续：\n{{lastMessage}}",
            enable: true,
            identifier: "contextInstruction",
            role: "user"
          },
          {
            name: "Continue",
            content: "继续",
            enable: true,
            identifier: "continuePrompt",
            role: "user"
          }
        ],
        prompt_order: [{
          order: [
            { identifier: "characterSystem", enabled: true },
            { identifier: "characterConfirmation", enabled: true },
            { identifier: "characterIntro", enabled: true },
            { identifier: "enhanceDefinitions", enabled: true },
            { identifier: "worldInfoBefore", enabled: true },
            { identifier: "charDescription", enabled: true },
            { identifier: "charPersonality", enabled: true },
            { identifier: "scenario", enabled: true },
            { identifier: "worldInfoAfter", enabled: true },
            { identifier: "dialogueExamples", enabled: true },
            { identifier: "chatHistory", enabled: true },
            { identifier: "contextInstruction", enabled: true },
            { identifier: "continuePrompt", enabled: true }
          ]
        }]
      };
      
      // Create a proper chatHistory with the first message
      const chatHistory = {
        name: "Chat History",
        role: "system",
        identifier: "chatHistory",
        parts: result.roleCard.first_mes ? [
          {
            role: "model",
            parts: [{ text: result.roleCard.first_mes }],
            is_first_mes: true
          }
        ] : []
      };
      
      console.log('[摇篮生成] 创建了聊天历史，包含开场白');
      
      const characterJsonData = {
        roleCard: result.roleCard,
        worldBook: result.worldBook,
        preset: preset,
        authorNote: {
          charname: result.roleCard.name,
          username: user?.settings?.self.nickname || "User",
          content: "",
          injection_depth: 0
        },
        chatHistory: chatHistory  // Include chatHistory in the JSON data
      };
      
      // 记录完整的JSON数据字符串，用于排查问题
      const jsonDataString = JSON.stringify(characterJsonData);
      
      // 校验JSON数据
      try {
        const parsed = JSON.parse(jsonDataString);
        console.log('[摇篮生成] JSON数据校验成功,', 
          '包含roleCard:', !!parsed.roleCard, 
          '包含worldBook:', !!parsed.worldBook);
      } catch (jsonError) {
        console.error('[摇篮生成] JSON数据无效:', jsonError);
        throw new Error('生成的角色数据格式无效，无法进行JSON解析');
      }

      // MAJOR CHANGE: Instead of creating a new character, update the existing cradle character
      console.log('[摇篮生成] 更新现有角色状态，完成培育周期');
      
      // Update the character with the generated data
      const updatedCharacter: Character = {
        ...cradleCharacter,
        name: result.roleCard.name,
        description: result.roleCard.description,
        personality: result.roleCard.personality,
        updatedAt: Date.now(),
        inCradleSystem: true, // CHANGED: Keep in cradle system
        cradleStatus: 'ready', // Change status to 'generated' instead of 'mature'
        cradleUpdatedAt: Date.now(),
        isCradleGenerated: true, // Mark as generated
        generatedCharacterId: cradleCharacter.id, // Reference to itself (when viewing from cradle)
        jsonData: jsonDataString, // Save complete JSON data
      };
      
      // Log the updated character data
      console.log('[摇篮生成] 更新后的角色数据:', 
               `id=${updatedCharacter.id}, name=${updatedCharacter.name}`);
      
      try {
        // Initialize character data structure before adding to characters list
        console.log('[摇篮生成] 初始化角色数据结构');
        // === 修改：apiSettings 也从 getApiSettings() 获取并传递 ===
        const initResult = await NodeSTManager.processChatMessage({
          userMessage: "你好！",
          conversationId: updatedCharacter.id,
          status: "新建角色",
          character: updatedCharacter
        });
        
        if (!initResult.success) {
          console.warn('[摇篮生成] 初始化角色数据警告:', initResult.error);
          // Continue execution but log the warning
        } else {
          console.log('[摇篮生成] 初始化角色数据成功');
        }
        
        // Update the character in the list - use CharacterStorageService
        console.log('[摇篮生成] 更新角色状态');
        try {
          // Check if character already exists in storage
          const existingCharacter = await storageService.getCharacter(updatedCharacter.id);
          
          if (existingCharacter) {
            // Update existing character using storage service
            console.log('[摇篮生成] 角色已存在，执行更新');
            await storageService.updateCharacter(updatedCharacter);
            
            // Update local state
            setCharacters(prevChars => 
              prevChars.map(char => 
                char.id === updatedCharacter.id ? updatedCharacter : char
              )
            );
          } else {
            // Add as new character using storage service
            console.log('[摇篮生成] 角色不存在，执行添加');
            await storageService.addCharacter(updatedCharacter);
            
            // Update local state
            setCharacters(prevChars => [...prevChars, updatedCharacter]);
          }
          
          console.log('[摇篮生成] 角色文件更新成功');
        } catch (fileError) {
          console.error('[摇篮生成] 更新角色文件失败:', fileError);
          // Fall back to updateCharacter
          await updateCharacter(updatedCharacter);
        }
        
        // Double-check that the character data includes JSON data
        console.log('[摇篮生成] 验证更新后的角色JSON数据:', {
          id: updatedCharacter.id,
          hasJsonData: !!updatedCharacter.jsonData,
          jsonDataLength: updatedCharacter.jsonData?.length || 0
        });
        
        console.log('[摇篮生成] 角色培育完成，已从摇篮中毕业');
        
        return updatedCharacter;
      } catch (initError) {
        console.error('[摇篮生成] 初始化角色数据失败:', initError);
        throw new Error(`角色初始化失败: ${initError instanceof Error ? initError.message : '未知错误'}`);
      }
    } catch (error) {
      console.error('[摇篮生成] 生成角色时出错:', error);
      throw error;
    }
  } catch (error) {
    console.error('[摇篮生成] 处理角色时出错:', error);
    throw error;
  }
};


  // 新增方法: 导入常规角色到摇篮系统
  const importCharacterToCradle = async (characterId: string): Promise<void> => {
    console.log('[摇篮系统] 导入常规角色到摇篮:', characterId);
    
    // 查找要导入的角色
    const character = characters.find(char => char.id === characterId);
    if (!character) {
      console.error('[摇篮系统] 未找到指定角色');
      throw new Error('未找到指定角色');
    }
    
    // 检查该角色是否已在摇篮系统中
    const existingCradleChar = cradleCharacters.find(
      char => char.importedCharacterId === characterId
    );
    
    if (existingCradleChar) {
      console.error('[摇篮系统] 该角色已在摇篮系统中');
      throw new Error('该角色已在摇篮系统中');
    }
    
    // 创建一个摇篮角色版本并确保唯一ID
    const uniqueCradleId = `cradle_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // 确保circlePosts有唯一键
    let modifiedCirclePosts = [];
    if (character.circlePosts && character.circlePosts.length > 0) {
      modifiedCirclePosts = character.circlePosts.map(post => ({
        ...post,
        id: `post-${Date.now()}-${Math.random().toString(36).substring(2, 9)}` // 确保唯一ID
      }));
    }
    
    // 下载并本地保存角色的图像
    let localAvatarUri = null;
    let localBackgroundUri = null;
    
    try {
      // 下载头像
      if (character.avatar) {
        localAvatarUri = await downloadAndSaveImage(character.avatar, uniqueCradleId, 'avatar');
        console.log('[摇篮系统] 头像已保存到本地:', localAvatarUri);
      }
      
      // 下载背景图片
      if (character.backgroundImage) {
        localBackgroundUri = await downloadAndSaveImage(
          typeof character.backgroundImage === 'string' 
            ? character.backgroundImage 
            : character.backgroundImage.url,
          uniqueCradleId, 
          'background'
        );
        console.log('[摇篮系统] 背景图片已保存到本地:', localBackgroundUri);
      }
    } catch (error) {
      console.error('[摇篮系统] 保存图片时出错:', error);
      // 继续导入流程，即使图片保存失败
    }
    
    const cradleCharacter: CradleCharacter = {
      ...character,                         
      id: uniqueCradleId,                   // 使用确保唯一的ID
      inCradleSystem: true,                 
      feedHistory: [],                      
      importedFromCharacter: true,          
      importedCharacterId: character.id,
      circlePosts: modifiedCirclePosts,     // 使用修改过的circlePosts
      backgroundImage: character.backgroundImage, // 保留原始URL
      localBackgroundImage: localBackgroundUri, // 保存本地文件URI
      avatar: localAvatarUri || character.avatar, // 优先使用本地头像
      updatedAt: Date.now()
    };
    
    // 添加到摇篮系统
    await addCradleCharacter(cradleCharacter);
    
    console.log('[摇篮系统] 成功导入角色到摇篮:', character.name);
  };

 
  
  // Add this function before the return statement in CharactersProvider
   const checkCradleGeneration = (): {
  readyCharactersCount: number;
  readyCharacters: CradleCharacter[];
} => {
  console.log('[摇篮系统] 检查摇篮角色的生成状态');
  
  const readyCharacters: CradleCharacter[] = [];
  
  // Get all cradle characters
  const allCradleCharacters = getCradleCharacters();
  const duration = cradleSettings.duration || 7; // Default duration: 7 days
  
  // Check which characters are ready based on creation time and cradle duration
  for (const character of allCradleCharacters) {
    if (character.isCradleGenerated) {
      // Skip characters that are already marked as generated
      continue;
    }
    
    const createdAt = character.createdAt;
    const now = Date.now();
    const elapsedDays = (now - createdAt) / (24 * 60 * 60 * 1000); // Convert ms to days
    
    if (elapsedDays >= duration) {
      // This character is ready for generation
      readyCharacters.push(character);
      console.log(`[摇篮系统] 角色 "${character.name}" 已经培育了 ${elapsedDays.toFixed(1)} 天，准备好生成`);
    } else {
      console.log(`[摇篮系统] 角色 "${character.name}" 培育中，已经 ${elapsedDays.toFixed(1)} 天，总共需要 ${duration} 天`);
    }
  }
  
  return {
    readyCharactersCount:     readyCharacters.length,
    readyCharacters
  };
};

// 新增分页获取消息的方法
const PAGE_SIZE = 15;

const getMessagesPaged = async (
  conversationId: string,
  page: number = 1,
  pageSize: number = PAGE_SIZE
): Promise<{
  messages: Message[];
  total: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
}> => {
  // 1. 获取全量消息
  const allMessages = await getMessages(conversationId);
  const total = allMessages.length;

  // 2. 修复分页计算逻辑
  // 第1页返回最新的pageSize条消息，第2页返回接下来的pageSize条，以此类推
  const end = total - (page - 1) * pageSize;
  const start = Math.max(0, end - pageSize);
  const messages = allMessages.slice(start, end);

  // 3. 是否还有更多
  const hasMore = start > 0;

  console.log(`[CharactersContext] getMessagesPaged: page=${page}, total=${total}, start=${start}, end=${end}, returned=${messages.length} messages`);
  if (messages.length > 0) {
    console.log(`[CharactersContext] First message: ${messages[0]?.text?.substring(0, 30) || 'N/A'}`);
    console.log(`[CharactersContext] Last message: ${messages[messages.length - 1]?.text?.substring(0, 30) || 'N/A'}`);
  }

  return {
    messages,
    total,
    hasMore,
    page,
    pageSize,
  };
};

  // 新增：加载生成图片缓存
  const loadGeneratedImages = async () => {
    try {
      const imagesStr = await FileSystem.readAsStringAsync(
        FileSystem.documentDirectory + 'generated_images.json',
        { encoding: FileSystem.EncodingType.UTF8 }
      ).catch(() => '{}');

      const loadedImages = JSON.parse(imagesStr);
      setGeneratedImages(loadedImages);
      console.log('[CharactersContext] 已加载生成图片缓存:', Object.keys(loadedImages).length, '个会话');
    } catch (error) {
      console.error('[CharactersContext] 加载生成图片缓存失败:', error);
      setGeneratedImages({});
    }
  };

  // 新增：保存生成图片缓存
  const saveGeneratedImages = async (newImagesMap: { [conversationId: string]: GeneratedImage[] }) => {
    try {
      await FileSystem.writeAsStringAsync(
        FileSystem.documentDirectory + 'generated_images.json',
        JSON.stringify(newImagesMap),
        { encoding: FileSystem.EncodingType.UTF8 }
      );
    } catch (error) {
      console.error('[CharactersContext] 保存生成图片缓存失败:', error);
    }
  };

  // 新增：添加生成图片
  const addGeneratedImage = async (conversationId: string, image: GeneratedImage) => {
    setGeneratedImages(prevMap => {
      const currentImages = prevMap[conversationId] || [];
      
      // 检查图片是否已存在
      const imageExists = currentImages.some(img => img.id === image.id);
      if (imageExists) {
        return prevMap; // 如果图片已存在，返回原状态
      }
      
      const newImages = [...currentImages, image];
      const updatedMap = {
        ...prevMap,
        [conversationId]: newImages
      };
      
      saveGeneratedImages(updatedMap);
      return updatedMap;
    });
  };

  // 新增：删除生成图片
  const deleteGeneratedImage = async (conversationId: string, imageId: string) => {
    setGeneratedImages(prevMap => {
      const currentImages = prevMap[conversationId] || [];
      
      // 过滤掉要删除的图片
      const updatedImages = currentImages.filter(img => img.id !== imageId);
      
      // 如果没有变化，返回原状态
      if (updatedImages.length === currentImages.length) {
        return prevMap;
      }
      
      const updatedMap = {
        ...prevMap,
        [conversationId]: updatedImages
      };
      
      saveGeneratedImages(updatedMap);
      return updatedMap;
    });
  };

  // 新增：清空指定会话的生成图片
  const clearGeneratedImages = async (conversationId: string) => {
    setGeneratedImages(prevMap => {
      const updatedMap = { ...prevMap };
      delete updatedMap[conversationId];
      
      saveGeneratedImages(updatedMap);
      return updatedMap;
    });
  };

  // 新增：清空所有生成图片缓存
  const clearAllGeneratedImages = async () => {
    setGeneratedImages({});
    await saveGeneratedImages({});
    console.log('[CharactersContext] 已清空所有生成图片缓存');
  };

  // 新增：获取指定会话的生成图片
  const getGeneratedImages = (conversationId: string): GeneratedImage[] => {
    return generatedImages[conversationId] || [];
  };

  return (
    <CharactersContext.Provider
      value={{
        characters,
        addCharacter,
        deleteCharacters,
        isLoading,
        conversations,
        addConversation,
        getConversationId,
        setConversationId,
        getApiKey,
        getCharacterConversationId,
        updateCharacter,
        getMessages,
        getLastMessageTime,
        addMessage,
        clearMessages,
        removeMessage,
        addMemo,
        updateMemo,
        deleteMemo,
        rateMessage,
        toggleFavorite,
        getFavorites,
        setCharacters,
        setIsLoading,
        getCradleCharacters,
        checkCradleGeneration,
        addCradleCharacter,
        importCharacterToCradle,   // 新增方法
        generateCharacterFromCradle,
        setCharacterAvatar, // 新增
        setCharacterBackgroundImage, // 新增
        updateCharacterExtraBackgroundImage, // 新增
        getMessagesPaged, // 新增
        PAGE_SIZE,        // 可导出分页大小
        // 新增：生成图片相关方法
        addGeneratedImage,
        deleteGeneratedImage,
        clearGeneratedImages,
        clearAllGeneratedImages,
        getGeneratedImages,
      } as CharactersContextType}
    >
      {children}
    </CharactersContext.Provider>
  );
};

export const useCharacters = () => {
  const context = useContext(CharactersContext);
  if (!context) {
    throw new Error('useCharacters must be used within a CharactersProvider');
  }
  return context;
};
