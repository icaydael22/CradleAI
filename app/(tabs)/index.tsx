import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy } from 'react';

import {
  View,
  StyleSheet,
  SafeAreaView,
  Platform,
  Keyboard,
  ImageBackground,
  StatusBar,
  TouchableOpacity,
  Text,
  Alert,
  KeyboardAvoidingView,
  AppState,
  ActivityIndicator,
  Animated,
  Easing,
  Dimensions,
  ScrollView
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import ChatDialog from '@/components/ChatDialog';
import ChatInput from '@/components/ChatInput';
import Sidebar from '@/components/Sidebar';
import SettingsSidebar from '@/components/SettingsSidebar';
import MemoOverlay from '@/components/MemoOverlay'; 
import SaveManager from '@/components/SaveManager';
import TTSEnhancerModal from '@/components/TTSEnhancerModal';
import GroupDialog from '@/components/GroupDialog';
import GroupInput from '@/components/GroupInput';
import GroupManagementModal from '@/components/GroupManagementModal';
import GroupSettingsSidebar from '@/components/GroupSettingsSidebar';
import { Group, GroupMessage, getUserGroups, getGroupMessages, sendGroupMessage } from '@/src/group';
import { Message, Character, ChatSave } from '@/shared/types';
import { useCharacters } from '@/constants/CharactersContext';
import { useUser } from '@/constants/UserContext';
// import '@/lib/polyfills';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TopBarWithBackground from '@/components/TopBarWithBackground';
import { NodeSTManager } from '@/utils/NodeSTManager';
import { EventRegister } from 'react-native-event-listeners';
import { MemoryProvider } from '@/src/memory/providers/MemoryProvider';
import Mem0Initializer from '@/src/memory/components/Mem0Initializer';
import '@/src/memory/utils/polyfills';
import Mem0Service from '@/src/memory/services/Mem0Service';
import { ttsService } from '@/services/ttsService';
import { useDialogMode } from '@/constants/DialogModeContext';
import { CharacterLoader } from '@/src/utils/character-loader';
import * as FileSystem from 'expo-file-system';
import { importDefaultCharactersIfNeeded, resetDefaultCharacterImported } from '@/components/DefaultCharacterImporter';
import { loadGlobalSettingsState } from '@/app/pages/global-settings';
import { isTableMemoryEnabled, setTableMemoryEnabled } from '@/src/memory/integration/table-memory-integration';
import { getWebViewExampleHtml } from '@/utils/webViewExample';
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PostChatService from '@/services/PostChat-service';
import MessageService from '@/services/message-service';
import AutoMessageService from '@/services/automessage-service';
import AutoImageService from '@/services/AutoImageService';

declare global {
  interface Window { __globalSettingsCache?: any }
}

if (typeof window !== 'undefined' && !window.__globalSettingsCache) {
  window.__globalSettingsCache = {};
}

// Character view mode cache
export let characterViewModeCache: string | null = null;
const App = () => {
  // 性能优化：页面可见性状态
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [appState, setAppState] = useState<string>(AppState.currentState);
  
  // 性能优化：定时器引用集合，用于页面不可见时清理
  const timersRef = useRef<Set<any>>(new Set());
  const intervalsRef = useRef<Set<any>>(new Set());
  const eventListenersRef = useRef<Set<any>>(new Set()); // 新增：事件监听器集合
  
  // 优化：创建安全的定时器函数，自动管理清理
  const createSafeTimeout = useCallback((callback: () => void, delay: number) => {
    if (!isPageVisible) return null; // 页面不可见时不创建定时器
    
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      if (isPageVisible) { // 执行前再次检查页面可见性
        callback();
      }
    }, delay);
    timersRef.current.add(timer);
    return timer;
  }, [isPageVisible]);
  
  const createSafeInterval = useCallback((callback: () => void, delay: number) => {
    if (!isPageVisible) return null; // 页面不可见时不创建定时器
    
    const interval = setInterval(() => {
      if (isPageVisible) { // 执行前检查页面可见性
        callback();
      }
    }, delay);
    intervalsRef.current.add(interval);
    return interval;
  }, [isPageVisible]);
  
  // 清理所有定时器和监听器
  const clearAllTimers = useCallback(() => {
    console.log(`[Performance] 清理定时器: ${timersRef.current.size} timeouts, ${intervalsRef.current.size} intervals, ${eventListenersRef.current.size} listeners`);
    
    timersRef.current.forEach(timer => {
      if (timer) clearTimeout(timer);
    });
    intervalsRef.current.forEach(interval => {
      if (interval) clearInterval(interval);
    });
    eventListenersRef.current.forEach(listener => {
      if (listener && typeof listener === 'string') {
        EventRegister.removeEventListener(listener);
      }
    });
    
    timersRef.current.clear();
    intervalsRef.current.clear();
    eventListenersRef.current.clear();
  }, []);

  // 新增：节流函数，防止频繁调用
  const throttle = useCallback((func: Function, delay: number) => {
    let timeoutId: any;
    let lastExecTime = 0;
    return (...args: any[]) => {
      const currentTime = Date.now();
      
      if (currentTime - lastExecTime > delay) {
        func(...args);
        lastExecTime = currentTime;
      } else {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          func(...args);
          lastExecTime = Date.now();
        }, delay - (currentTime - lastExecTime));
      }
    };
  }, []);

  // 新增：防抖函数，防止频繁状态更新
  const debounce = useCallback((func: Function, delay: number) => {
    let timeoutId: any;
    return (...args: any[]) => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  }, []);
    
  // Initialize the message service for use throughout the component
  const messageService = useMemo(() => MessageService, []);

  // AutoMessageService 实例 - 使用 useMemo 避免重复创建
  const autoMessageService = useMemo(() => {
    console.log('[Performance] 创建 AutoMessageService 实例');
    return AutoMessageService.getInstance();
  }, []);
  
  const insets = useSafeAreaInsets();
  
  // References to avoid re-creating functions on each render
  const asyncStorageOperations = useRef<Set<Promise<any>>>(new Set());
  
  // Router and params
  const router = useRouter();
  const params = useLocalSearchParams();
  const characterId = params.characterId as string;
  const { user } = useUser();

  // 新增：用于标记是否已尝试恢复 lastConversationId，避免重复恢复
  const [hasRestoredLastConversation, setHasRestoredLastConversation] = useState(false);
  
  // Animation refs (created once, persist between renders)
  const contentSlideAnim = useRef(new Animated.Value(0)).current;
  const settingsSlideAnim = useRef(new Animated.Value(0)).current;
  const contentScaleAnim = useRef(new Animated.Value(1)).current;
  const groupSettingsSidebarAnim = useRef(new Animated.Value(0)).current;
  
  // Constants used throughout the component
  const SIDEBAR_WIDTH = 280;
  const EXTRA_BG_IDS_KEY_PREFIX = 'extraBgProcessedIds-';


  // Character context
  const {
    conversations,
    characters,
    getMessages,
    addMessage,
    clearMessages,
    updateCharacterExtraBackgroundImage,
    isLoading: charactersLoading,
    setCharacters,
    addCharacter,
    addConversation,
    removeMessage,
    getMessagesPaged,
    PAGE_SIZE
  } = useCharacters() as any;

  const PAGE_SIZE_SAFE = PAGE_SIZE || 30;

  // UI state - core functionality
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  // 只维护当前会话的消息
  const [messages, setMessages] = useState<Message[]>([]);
  const [fallbackCharacter, setFallbackCharacter] = useState<Character | null>(null);
  const [isWebViewTestVisible, setIsWebViewTestVisible] = useState(false);
  const [defaultCharacterNavigated, setDefaultCharacterNavigated] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const { mode, setMode } = useDialogMode();

  // 新增：消息发送状态跟踪
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Group chat state
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [groupMembers, setGroupMembers] = useState<Character[]>([]);
  const [isGroupManageModalVisible, setIsGroupManageModalVisible] = useState(false);
  const [disbandedGroups, setDisbandedGroups] = useState<string[]>([]);
  const [groupBackgrounds, setGroupBackgrounds] = useState<Record<string, string | undefined>>({});

  // UI state - sidebar and modals
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isSettingsSidebarVisible, setIsSettingsSidebarVisible] = useState(false);
  const [isMemoSheetVisible, setIsMemoSheetVisible] = useState(false);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [isNovelAITestVisible, setIsNovelAITestVisible] = useState(false);
  const [isVNDBTestVisible, setIsVNDBTestVisible] = useState(false);
  const [groupSettingsSidebarVisible, setGroupSettingsSidebarVisible] = useState(false);
  const [isHistoryModalVisible, setHistoryModalVisible] = useState(false);

  // Save/Load system states
  const [isSaveManagerVisible, setIsSaveManagerVisible] = useState(false);
  const [previewMessages, setPreviewMessages] = useState<Message[] | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [currentPreviewSave, setCurrentPreviewSave] = useState<ChatSave | null>(null);
  const [previewBannerVisible, setPreviewBannerVisible] = useState(false);

  // Message processing state
  const [processedImageUrls, setProcessedImageUrls] = useState<Set<string>>(new Set());
  const processingTaskIds = useRef<Set<string>>(new Set());
  const firstMessageSentRef = useRef<Record<string, boolean>>({});
  const firstMesSentRef = useRef<Record<string, boolean>>({});

  // Chat scroll positions with improved handling
  const [chatScrollPositions, setChatScrollPositions] = useState<Record<string, number>>({});
  const scrollPositionUpdateTimeoutRef = useRef<any>(null);

  // Memory management state
  const [memoryFacts, setMemoryFacts] = useState<any[]>([]);
  const [isMemoryPanelVisible, setIsMemoryPanelVisible] = useState(false);
  const [messageMemoryState, setMessageMemoryState] = useState<Record<string, string>>({});

  // Search and TTS state
  const [braveSearchEnabled, setBraveSearchEnabled] = useState<boolean>(false);
  const [isTtsEnhancerEnabled, setIsTtsEnhancerEnabled] = useState(false);
  const [isTtsEnhancerModalVisible, setIsTtsEnhancerModalVisible] = useState(false);

  // Video player state
  const videoRef = useRef<Video | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Message state
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);
  const [transientError, setTransientError] = useState<string | null>(null);

  // Background image processing state
  const [extraBgStates, setExtraBgStates] = useState<Record<string, {
    isGenerating: boolean;
    taskId: string | null;
    error: string | null;
    image: string | null;
  }>>({});

  // Auto image generation state
  const [autoImageStates, setAutoImageStates] = useState<Record<string, {
    isGenerating: boolean;
    taskId: string | null;
    error: string | null;
  }>>({});

  // UI visibility state
  const [isTopBarVisible, setIsTopBarVisible] = useState(true);
  const [isTestMarkdownVisible, setIsTestMarkdownVisible] = useState(false);

  // 新增：消息管理测试相关状态
  const [isMessageTestVisible, setIsMessageTestVisible] = useState(false);
  const [testResults, setTestResults] = useState<string[]>([]);

  // 修改：使用 CharactersContext 获取生成图片
  const { addGeneratedImage, deleteGeneratedImage, getGeneratedImages, clearGeneratedImages } = useCharacters();

  // 性能优化：页面可见性管理
  useFocusEffect(
    useCallback(() => {
      console.log('[Performance] Index page focused');
      setIsPageVisible(true);
      
      return () => {
        console.log('[Performance] Index page unfocused - cleaning up');
        setIsPageVisible(false);
        clearAllTimers();
        
        // 强制垃圾回收（如果可用）
        if (global.gc) {
          global.gc();
        }
      };
    }, [clearAllTimers])
  );

  // 性能优化：应用状态管理
  useEffect(() => {
    const handleAppStateChange = (nextAppState: any) => {
      console.log(`[Performance] App state changed: ${appState} -> ${nextAppState}`);
      setAppState(nextAppState);
      
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        console.log('[Performance] App backgrounded - cleaning up');
        setIsPageVisible(false);
        clearAllTimers();
        
        // 清理音频缓存已移除
        
        // 强制垃圾回收
        if (global.gc) {
          global.gc();
        }
      } else if (nextAppState === 'active') {
        console.log('[Performance] App activated');
        setIsPageVisible(true);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription?.remove();
    };
  }, [appState, clearAllTimers]);

  // 性能优化：节流的错误显示函数
  const showTransientError = useCallback(throttle((errorMessage: string) => {
    if (!isPageVisible) return;
    
    setTransientError(errorMessage);
    const timer = createSafeTimeout(() => {
      setTransientError(null);
    }, 5000);
    
    if (timer) {
      timersRef.current.add(timer);
    }
  }, 1000), [createSafeTimeout, isPageVisible, throttle]);

  // 修改：处理生成图片，使用 CharactersContext
  const handleGenerateImage = useCallback((imageId: string, prompt: string) => {
    if (!selectedConversationId || !isPageVisible) return;
    
    addGeneratedImage(selectedConversationId, {
      id: imageId,
      prompt,
      timestamp: Date.now()
    });
  }, [selectedConversationId, addGeneratedImage, isPageVisible]);

  // 修改：处理删除生成的图片，使用 CharactersContext
  const handleDeleteGeneratedImage = useCallback((imageId: string) => {
    if (!selectedConversationId || !isPageVisible) return;
    
    deleteGeneratedImage(selectedConversationId, imageId);
  }, [selectedConversationId, deleteGeneratedImage, isPageVisible]);

  // Calculate selected character information with memoization - 优化依赖项
  const selectedCharacter: Character | undefined | null = useMemo(() => {
    if (!selectedConversationId || !characters.length) return null;
    return characters.find((char: Character) => char.id === selectedConversationId) || null;
  }, [selectedConversationId, characters]);
  
  const characterToUse = useMemo(() => fallbackCharacter || selectedCharacter, 
    [fallbackCharacter, selectedCharacter]);

  // Selected group with memoization
  const selectedGroup: Group | null = useMemo(() => {
    if (!selectedGroupId || !groups.length) return null;
    return groups.find(g => g.groupId === selectedGroupId) || null;
  }, [selectedGroupId, groups]);

  // 保存自动消息 inputText
  const [autoMessageInputText, setAutoMessageInputText] = useState<string | null>(null);

  // 加载自动消息 inputText - 优化：只在组件挂载时执行一次
  useEffect(() => {
    let isMounted = true;
    
    (async () => {
      try {
        const configStr = await AsyncStorage.getItem('auto_message_prompt_config');
        if (isMounted) {
          if (configStr) {
            const config = JSON.parse(configStr);
            setAutoMessageInputText(config.inputText || null);
          } else {
            setAutoMessageInputText(null);
          }
        }
      } catch {
        if (isMounted) {
          setAutoMessageInputText(null);
        }
      }
    })();
    
    return () => {
      isMounted = false;
    };
  }, []);

  // 过滤掉自动消息 inputText 的 user 消消息 - 优化：减少计算频率
  const filteredMessages = useMemo(() => {
    if (!isPageVisible || !messages.length) return messages;
    
    return messages.filter(msg => {
      // 过滤掉标记为自动消息输入的用户消息
      if (msg.sender === 'user' && msg.metadata?.isAutoMessageInput === true) {
        return false;
      }
      // 过滤掉标记为继续的用户消息
      if (msg.sender === 'user' && msg.metadata?.isContinue === true) {
        return false;
      }
      // 兼容旧的过滤方式：如果没有 isAutoMessageInput 标记，但文本匹配 autoMessageInputText
      if (autoMessageInputText && msg.sender === 'user' && msg.text === autoMessageInputText) {
        return false;
      }
      return true;
    });
  }, [messages, autoMessageInputText, isPageVisible]);

  // Character ID for memo overlay
  const characterIdForMemo = useMemo(() => selectedConversationId || '', [selectedConversationId]);
  const conversationIdForMemo = useMemo(() => 
    selectedConversationId ? `conversation-${selectedConversationId}` : '',
  [selectedConversationId]);

  // Load user groups - 优化：添加防抖和页面可见性检查
  const loadUserGroups = useCallback(debounce(async () => {
    if (!user || !isPageVisible) return;
    
    try {
      const userGroups = await getUserGroups(user);
      const filteredGroups = userGroups.filter(group => !disbandedGroups.includes(group.groupId));
      
      if (isPageVisible) {
        setGroups(filteredGroups);
        console.log(`[Index] Loaded ${filteredGroups.length} groups (filtered from ${userGroups.length})`);
      }
    } catch (error) {
      console.error('Failed to load user groups:', error);
    }
  }, 500), [user, disbandedGroups, isPageVisible, debounce]);

  // Load group messages - 优化：添加防抖
  const loadGroupMessages = useCallback(debounce(async (groupId: string) => {
    if (!groupId || !isPageVisible) return;

    try {
      const messages = await getGroupMessages(groupId);
      if (isPageVisible) {
        setGroupMessages(messages);
      }
    } catch (error) {
      console.error('Failed to load group messages:', error);
    }
  }, 300), [isPageVisible, debounce]);

  // Handle group disbanded - 优化：添加页面可见性检查
  const handleGroupDisbanded = useCallback((groupId: string) => {
    if (!isPageVisible) return;
    
    console.log(`[Index] Group disbanded: ${groupId}`);
    
    setDisbandedGroups(prev => [...prev, groupId]);
    
    if (selectedGroupId === groupId) {
      setSelectedGroupId(null);
      setGroupMessages([]);
      setIsGroupMode(false);
      
      if (selectedConversationId) {
        console.log(`[Index] Switching back to character conversation: ${selectedConversationId}`);
      } else if (conversations.length > 0) {
        setSelectedConversationId(conversations[0].id);
        console.log(`[Index] Switching to first available character: ${conversations[0].id}`);
      }    
    }
    
    loadUserGroups();
  }, [selectedGroupId, selectedConversationId, conversations, loadUserGroups, isPageVisible]);

  // Handle group background changed - 优化：添加页面可见性检查
  const handleGroupBackgroundChanged = useCallback((groupId: string, newBackground: string | undefined) => {
    if (!isPageVisible) return;
    
    setGroupBackgrounds(prev => ({
      ...prev,
      [groupId]: newBackground,
    }));
    
    setGroups(prevGroups =>
      prevGroups.map(g =>
        g.groupId === groupId ? { ...g, backgroundImage: newBackground } : g
      )
    );
  }, [isPageVisible]);

  // Toggle sidebars with optimized animations
  const toggleSettingsSidebar = useCallback(() => {
    const newIsVisible = !isSettingsSidebarVisible;
    setIsSettingsSidebarVisible(newIsVisible);
    
    Animated.timing(settingsSlideAnim, {
      toValue: newIsVisible ? SIDEBAR_WIDTH : 0,
      duration: 300,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [isSettingsSidebarVisible, settingsSlideAnim, SIDEBAR_WIDTH]);

  const toggleSidebar = useCallback(() => {
    const newIsVisible = !isSidebarVisible;
    setIsSidebarVisible(newIsVisible);
    
    Animated.timing(contentSlideAnim, {
      toValue: newIsVisible ? SIDEBAR_WIDTH : 0,
      duration: 300,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [isSidebarVisible, contentSlideAnim, SIDEBAR_WIDTH]);

  const toggleGroupSettingsSidebar = useCallback(() => {
    const newIsVisible = !groupSettingsSidebarVisible;
    setGroupSettingsSidebarVisible(newIsVisible);
    
    Animated.timing(groupSettingsSidebarAnim, {
      toValue: newIsVisible ? SIDEBAR_WIDTH : 0,
      duration: 300,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [groupSettingsSidebarVisible, groupSettingsSidebarAnim, SIDEBAR_WIDTH]);

  // Toggle save manager with preview mode handling
  const toggleSaveManager = useCallback(() => {
    if (isPreviewMode) {
      Alert.alert(
        'Exit Preview Mode',
        'You are currently previewing a saved chat. Do you want to exit preview mode?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Exit Preview', 
            onPress: () => {
              // Using the function form to avoid stale closures
              (async () => {
                await exitPreviewMode();
                setIsSaveManagerVisible(prev => !prev);
              })();
            }
          }
        ]
      );
    } else {
      setIsSaveManagerVisible(prev => !prev);
    }
  }, [isPreviewMode]);

  // Preview save functionality
  const handlePreviewSave = useCallback((save: ChatSave) => {
    if (!isPreviewMode) {
      setPreviewMessages(messages);
    }
    
    setIsPreviewMode(true);
    setCurrentPreviewSave(save);
    setMessages(save.messages);
    setIsSaveManagerVisible(false);
    
    setPreviewBannerVisible(true);
    
    createSafeTimeout(() => {
      setPreviewBannerVisible(false);
    }, 5000);
  }, [messages, isPreviewMode]);

  // Exit preview mode
  const exitPreviewMode = useCallback(async () => {
    if (isPreviewMode && previewMessages) {
      setMessages(previewMessages);
      setIsPreviewMode(false);
      setCurrentPreviewSave(null);
      setPreviewMessages(null);
      setPreviewBannerVisible(false);
    }
  }, [isPreviewMode, previewMessages]);

  // Load save
  const handleLoadSave = useCallback(async (save: ChatSave) => {
    if (!selectedConversationId) return;
    
    if (save.nodestChatHistory) {
      console.log('[App] Verifying NodeST chat history restoration');
      try {
        await NodeSTManager.restoreChatHistory({
          conversationId: selectedConversationId,
          chatHistory: save.nodestChatHistory
        });
      } catch (error) {
        console.error('[App] Error restoring NodeST chat history:', error);
      }
    } else {
      console.warn('[App] Save does not contain NodeST chat history');
    }
    
    try {
      await clearMessages(selectedConversationId);
      
      // Batch adding messages for better performance
      const messagePromises = save.messages.map(msg => addMessage(selectedConversationId, msg));
      await Promise.all(messagePromises);
      
      setMessages(save.messages);
      setIsSaveManagerVisible(false);
      setIsPreviewMode(false);
      setPreviewMessages(null);
      setCurrentPreviewSave(null);
      
      Alert.alert('Success', 'Chat restored successfully to saved point!');
    } catch (error) {
      console.error('Error restoring chat:', error);
      Alert.alert('Error', 'Failed to restore chat state.');
      
      exitPreviewMode();
    }
  }, [selectedConversationId, clearMessages, addMessage, exitPreviewMode]);

  // Send message with optimized handling
  const sendMessageInternal = useCallback(async (newMessage: string, sender: 'user' | 'bot', isLoading = false) => {
    if (!selectedConversationId) {
      console.warn('No conversation selected.');
      return null;
    }

    console.log(`[sendMessageInternal] 发送消息: ${sender}, isLoading: ${isLoading}, text: ${newMessage.substring(0, 50)}...`);

    const isErrorMessage = newMessage.includes("抱歉，处理消息时出现了错误") || 
                           newMessage.includes("抱歉，无法重新生成回复") ||
                           newMessage.includes("发生错误，无法重新生成") ||
                           newMessage.includes("处理图片时出现了错误") ||
                           newMessage.includes("生成图片时出现了错误") ||
                           newMessage.includes("编辑图片时出现了错误") ||
                           newMessage.includes("发送消息时出现了错误");

    if (isErrorMessage) {
      showTransientError("处理消息时出现了错误");
      // 移除最后一个AI loading消息和其对应的user消息（UI和context）
      setMessages(prev => {
        let msgs = [...prev];
        const lastAiIdx = msgs.map((m, i) => ({...m, i})).reverse().find(m => m.sender === 'bot' && m.isLoading);
        if (lastAiIdx) {
          const aiMsgId = msgs[lastAiIdx.i].id;
          // 移除该AI消息
          msgs.splice(lastAiIdx.i, 1);
          // 移除其前面的最后一个user消息
          let userMsgId: string | undefined;
          for (let j = lastAiIdx.i - 1; j >= 0; j--) {
            if (msgs[j].sender === 'user') {
              userMsgId = msgs[j].id;
              msgs.splice(j, 1);
              break;
            }
          }
          // 移除context中的消息
          if (aiMsgId) removeMessage(selectedConversationId, aiMsgId);
          if (userMsgId) removeMessage(selectedConversationId, userMsgId);
        }
        return msgs;
      });
      return null;
    }

    const messageId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    let metadata = undefined;

    const newMessageObj: Message = {
      id: messageId,
      text: newMessage,
      sender: sender,
      isLoading: false, // 始终为 false
      timestamp: Date.now(),
      metadata
    };

    try {
      if (sender === 'bot') {
        // 直接追加最终 bot 消息
        setMessages(prev => [...prev, newMessageObj]);
      } else {
        // user消息直接追加
        setMessages(prev => [...prev, newMessageObj]);
      }
      
      // 异步保存到存储
      setTimeout(async () => {
        try {
          await addMessage(selectedConversationId, newMessageObj);
        } catch (error) {
          console.error('Error saving message to storage:', error);
        }
      }, 0);
    } catch (err) {
      setTransientError("处理消息时出现了错误");
      setTimeout(() => setTransientError(null), 5000);
      setMessages(prev => {
        let msgs = [...prev];
        const lastAiIdx = msgs.map((m, i) => ({...m, i})).reverse().find(m => m.sender === 'bot' && m.isLoading);
        if (lastAiIdx) {
          const aiMsgId = msgs[lastAiIdx.i].id;
          msgs.splice(lastAiIdx.i, 1);
          let userMsgId: string | undefined;
          for (let j = lastAiIdx.i - 1; j >= 0; j--) {
            if (msgs[j].sender === 'user') {
              userMsgId = msgs[j].id;
              msgs.splice(j, 1);
              break;
            }
          }
          if (aiMsgId) removeMessage(selectedConversationId, aiMsgId);
          if (userMsgId) removeMessage(selectedConversationId, userMsgId);
        }
        return msgs;
      });
      return null;
    }
    return messageId;
  }, [selectedConversationId, messages, addMessage, removeMessage]);

  const handleSendMessage = useCallback(async (newMessage: string, sender: 'user' | 'bot', isLoading = false, metadata?: Record<string, any>) => {
    // Exit preview mode if active
    if (isPreviewMode) {
      Alert.alert(
        'Exit Preview Mode',
        'You\'re currently previewing a saved chat. Sending a new message will exit preview mode.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Send & Exit Preview', 
            onPress: async () => {
              await exitPreviewMode();
              await sendMessageInternal(newMessage, sender, isLoading);
            }
          }
        ]
      );
      return;
    }

    // 新增：当开始发送用户消息时，设置发送状态
    if (sender === 'user' && !isLoading) {
      setIsSendingMessage(true);
    }

    // Check for transient errors
    const isTransientError = metadata?.isErrorMessage === true ||
      newMessage.includes("抱歉，处理消息时出现了错误") ||
      newMessage.includes("抱歉，无法重新生成回复") ||
      newMessage.includes("发生错误，无法重新生成") ||
      newMessage.includes("处理图片时出现了错误") ||
      newMessage.includes("生成图片时出现了错误") ||
      newMessage.includes("编辑图片时出现了错误") ||
      newMessage.includes("发送消息时出现了错误") ||
      newMessage.includes("抱歉，未收到有效回复。");

    if (isTransientError) {
      setTransientError("处理消息时出现了错误");
      setTimeout(() => setTransientError(null), 5000);
      setMessages(prev => {
        let msgs = [...prev];
        const lastAiIdx = msgs.map((m, i) => ({...m, i})).reverse().find(m => m.sender === 'bot' && m.isLoading);
        if (lastAiIdx) {
          const aiMsgId = msgs[lastAiIdx.i].id;
          msgs.splice(lastAiIdx.i, 1);
          let userMsgId: string | undefined;
          for (let j = lastAiIdx.i - 1; j >= 0; j--) {
            if (msgs[j].sender === 'user') {
              userMsgId = msgs[j].id;
              msgs.splice(j, 1);
              break;
            }
          }
          if (aiMsgId) removeMessage(selectedConversationId, aiMsgId);
          if (userMsgId) removeMessage(selectedConversationId, userMsgId);
        }
        return msgs;
      });
      // 重置发送状态
      setIsSendingMessage(false);
      return;
    }

    // Send the message
    let messageId: string | null = null;
    try {
      messageId = await sendMessageInternal(newMessage, sender, isLoading);
    } catch (err) {
      setTransientError("处理消息时出现了错误");
      setTimeout(() => setTransientError(null), 5000);
      setMessages(prev => {
        let msgs = [...prev];
        const lastAiIdx = msgs.map((m, i) => ({...m, i})).reverse().find(m => m.sender === 'bot' && m.isLoading);
        if (lastAiIdx) {
          const aiMsgId = msgs[lastAiIdx.i].id;
          msgs.splice(lastAiIdx.i, 1);
          let userMsgId: string | undefined;
          for (let j = lastAiIdx.i - 1; j >= 0; j--) {
            if (msgs[j].sender === 'user') {
              userMsgId = msgs[j].id;
              msgs.splice(j, 1);
              break;
            }
          }
          if (aiMsgId) removeMessage(selectedConversationId, aiMsgId);
          if (userMsgId) removeMessage(selectedConversationId, userMsgId);
        }
        return msgs;
      });
      // 重置发送状态
      setIsSendingMessage(false);
      return;
    }

    // 新增：当AI响应完成（非loading状态的bot消息）时，重置发送状态
    if (sender === 'bot' && !isLoading) {
      setIsSendingMessage(false);
    }
    
    // Process memory for user messages
    if (sender === 'user' && !isLoading && messageId) {
      setMessageMemoryState(prev => ({
        ...prev,
        [messageId]: 'processing'
      }));
      
      createSafeTimeout(() => {
        processMessageMemory(messageId, newMessage, selectedConversationId);
      }, 500);
    }

    // Update user reply state
    if (sender === 'user' && !isLoading && selectedConversationId) {
      // waitingForUserReplyRef.current = false;
      // updateUnreadMessagesCount(0);
      autoMessageService.onUserMessage(selectedConversationId);
      updateUnreadMessagesCount(0);
    }

    // Reset auto message timer
    if (!isLoading && selectedConversationId) {
      // lastMessageTimeRef.current = Date.now();
      // setupAutoMessageTimer();
      autoMessageService.onAnyMessage(selectedConversationId);
    }
    // Update search preference
    if (sender === 'user' && !isLoading) {
      try {
        await NodeSTManager.setSearchEnabled(braveSearchEnabled);
      } catch (error) {
        console.error('[App] Failed to set search preference:', error);
      }
    }
  }, [
    isPreviewMode, exitPreviewMode, selectedConversationId,
    sendMessageInternal, braveSearchEnabled, removeMessage, autoMessageService
  ]);

  // Handle group messages
  const handleSendGroupMessage = useCallback(async (text: string) => {
    if (!selectedGroupId || !user) return;
    
    try {
      const newMessage = await sendGroupMessage(user, selectedGroupId, text);
      if (newMessage) {
        setGroupMessages(prev => [...prev, newMessage]);
      }
    } catch (error) {
      console.error('Failed to send group message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    }
  }, [selectedGroupId, user]);

  // Replace the existing handleDeleteAiMessage with the new version using the service
  const handleDeleteAiMessage = useCallback(async (messageId: string, aiIndex: number) => {
    if (!selectedConversationId) return;
    try {
      const result = await messageService.handleDeleteAIMessage(
        messageId,
        aiIndex,
        selectedConversationId,
        messages
      );
      
      if (result.success && result.messages) {
        // Clear local messages
        await clearMessages(selectedConversationId);
        
        // Save new messages in batch
        const messagePromises = result.messages.map(m => addMessage(selectedConversationId, m));
        await Promise.all(messagePromises);
        
        // Force reload current page to maintain pagination state
        if (getMessagesPaged) {
          const { messages: pagedMessages, hasMore } = await getMessagesPaged(selectedConversationId, 1, PAGE_SIZE_SAFE);
          setMessages(pagedMessages);
          setCurrentPage(1);
          setHasMoreMessages(hasMore);
        }
      } else {
        setTransientError("处理消息时出现了错误");
        setTimeout(() => setTransientError(null), 5000);
      }
    } catch (e) {
      setTransientError("处理消息时出现了错误");
      setTimeout(() => setTransientError(null), 5000);
    }
  }, [selectedConversationId, clearMessages, addMessage, messages, messageService, getMessagesPaged, PAGE_SIZE_SAFE]);



  const handleEditAiMessage = useCallback(async (messageId: string, aiIndex: number, newContent: string) => {
    if (!selectedConversationId) return;
    try {
      const result = await messageService.handleEditAIMessage(
        messageId,
        aiIndex,
        newContent,
        selectedConversationId,
        messages
      );
      
      if (result.success && result.messages) {
        // Clear local messages
        await clearMessages(selectedConversationId);
        
        // Save new messages in batch
        const messagePromises = result.messages.map(m => addMessage(selectedConversationId, m));
        await Promise.all(messagePromises);
        
        // Force reload current page to maintain pagination state
        if (getMessagesPaged) {
          const { messages: pagedMessages, hasMore } = await getMessagesPaged(selectedConversationId, 1, PAGE_SIZE_SAFE);
          setMessages(pagedMessages);
          setCurrentPage(1);
          setHasMoreMessages(hasMore);
        }
      } else {
        setTransientError("处理消息时出现了错误");
        setTimeout(() => setTransientError(null), 5000);
      }
    } catch (e) {
      setTransientError("处理消息时出现了错误");
      setTimeout(() => setTransientError(null), 5000);
    }
  }, [selectedConversationId, clearMessages, addMessage, messages, messageService, getMessagesPaged, PAGE_SIZE_SAFE]);




  // Add a new handler for editing user messages
  const handleEditUserMessage = useCallback(async (messageId: string, messageIndex: number, newContent: string) => {
    if (!selectedConversationId) return;
    try {
      const result = await messageService.handleEditUserMessage(
        messageId,
        messageIndex,
        newContent,
        selectedConversationId,
        messages
      );
      
      if (result.success && result.messages) {
        // Clear local messages
        await clearMessages(selectedConversationId);
        
        // Save new messages in batch
        const messagePromises = result.messages.map(m => addMessage(selectedConversationId, m));
        await Promise.all(messagePromises);
        
        // Force reload current page to maintain pagination state
        if (getMessagesPaged) {
          const { messages: pagedMessages, hasMore } = await getMessagesPaged(selectedConversationId, 1, PAGE_SIZE_SAFE);
          setMessages(pagedMessages);
          setCurrentPage(1);
          setHasMoreMessages(hasMore);
        }
      } else {
        setTransientError("处理消息时出现了错误");
        setTimeout(() => setTransientError(null), 5000);
      }
    } catch (e) {
      setTransientError("处理消息时出现了错误");
      setTimeout(() => setTransientError(null), 5000);
    }
  }, [selectedConversationId, clearMessages, addMessage, messages, messageService, getMessagesPaged, PAGE_SIZE_SAFE]);




  // Handle WebView test
  const handleWebViewTest = useCallback(async () => {
    try {
      const webViewHtml = await getWebViewExampleHtml();
      
      if (!selectedConversationId) {
        Alert.alert('提示', '请先选择一个角色开始对话');
        return;
      }
      
      if (mode !== 'visual-novel') {
        Alert.alert(
          '切换到视觉小说模式',
          '需要在视觉小说模式下才能测试WebView功能，是否切换？',
          [
            { text: '取消', style: 'cancel' },
            { 
              text: '切换', 
              onPress: () => {
                setMode('visual-novel');
                setTimeout(() => {
                  handleSendMessage(webViewHtml, 'bot');
                }, 300);
              }
            }
          ]
        );
        return;
      }
      
      handleSendMessage(webViewHtml, 'bot');
    } catch (error) {
      console.error('Failed to load WebView example:', error);
      Alert.alert('错误', '加载WebView示例失败');
    }
  }, [selectedConversationId, mode, setMode, handleSendMessage]);

  // Reset default characters
  const handleResetDefaultCharacterInit = useCallback(async () => {
    await resetDefaultCharacterImported();
    Alert.alert('已重置', '下次启动将重新导入默认角色');
  }, []);

  // Get background image
  const getBackgroundImage = useCallback(() => {
    if (characterToUse?.id && extraBgStates[characterToUse.id]?.image) {
      return { uri: extraBgStates[characterToUse.id].image! };
    }
    if (
      characterToUse?.enableAutoExtraBackground &&
      characterToUse?.extrabackgroundimage
    ) {
      return { uri: characterToUse.extrabackgroundimage };
    }
    if (characterToUse?.backgroundImage) {
      if (
        typeof characterToUse.backgroundImage === 'object' &&
        characterToUse.backgroundImage.localAsset
      ) {
        return characterToUse.backgroundImage.localAsset;
      }
      if (typeof characterToUse.backgroundImage === 'string') {
        return { uri: characterToUse.backgroundImage };
      }
    }
    return require('@/assets/images/default-background.jpg');
  }, [characterToUse, extraBgStates]);

  // Get group background image
  const getGroupBackgroundImage = useCallback(() => {
    if (selectedGroup) {
      if (groupBackgrounds[selectedGroup.groupId]) {
        return { uri: groupBackgrounds[selectedGroup.groupId] };
      }
      if (selectedGroup.backgroundImage) {
        return { uri: selectedGroup.backgroundImage };
      }
    }
    return require('@/assets/images/group-chat-background.jpg');
  }, [selectedGroup, groupBackgrounds]);

  // Reset conversation
  const handleResetConversation = useCallback(async () => {
    if (!selectedConversationId) return;
    
    try {
      // 清空消息
      await clearMessages(selectedConversationId);
      const messages = await getMessages(selectedConversationId);
      setMessages(messages);
    } catch (error) {
      console.error('Error resetting conversation:', error);
    }
  }, [selectedConversationId, clearMessages, getMessages]);

  // Handle select conversation
  const handleSelectConversation = useCallback((id: string) => {
    if (id.startsWith('group-')) {
      setSelectedGroupId(id);
      setSelectedConversationId(null);
      setIsGroupMode(true);
      setMessages([]); // 清空非群聊消息
    } else {
      setSelectedConversationId(id);
      setSelectedGroupId(null);
      setIsGroupMode(false);
      // 如果正在发送消息，延迟加载历史消息，否则立即加载
      if (!isSendingMessage) {
        getMessages(id).then((msgs: Message[]) => setMessages(msgs));
      }
      // 注意：如果isSendingMessage为true，消息会在useEffect中延迟加载
    }
    setIsSidebarVisible(false);
    Animated.timing(contentSlideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true
    }).start();
  }, [getMessages, isSendingMessage, contentSlideAnim]);

  // Handle avatar press
  const handleAvatarPress = useCallback(() => {
    if (isPreviewMode) {
      Alert.alert(
        'Exit Preview Mode',
        'You\'re currently previewing a saved chat. Navigating to character details will exit preview mode.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Continue', 
            onPress: () => {
              exitPreviewMode();
              router.push(`/pages/character-detail?id=${selectedConversationId}`);
            }
          }
        ]
      );
    } else {
      router.push(`/pages/character-detail?id=${selectedConversationId}`);
    }
  }, [isPreviewMode, exitPreviewMode, router, selectedConversationId]);

  // Handle toggle group manage
  const handleToggleGroupManage = useCallback(() => {
    setIsGroupManageModalVisible(!isGroupManageModalVisible);
  }, [isGroupManageModalVisible]);

  // Toggle memo overlay
  const toggleMemoOverlay = useCallback(() => {
    setIsMemoSheetVisible(!isMemoSheetVisible);
  }, [isMemoSheetVisible]);


  // Handle save created
  const handleSaveCreated = useCallback((save: ChatSave) => {
    console.log('Save created:', save.id);
  }, []);

  // Handle show full history
  const handleShowFullHistory = useCallback(() => {
    setHistoryModalVisible(true);
  }, []);

  // Handle restore top bar
  const handleRestoreTopBar = useCallback(() => {
    setIsTopBarVisible(true);
    DeviceEventEmitter.emit('topBarVisibilityChanged', true);
  }, []);

  // Get character conversation ID
  const getCharacterConversationId = useCallback((selectedConversationId: string): string | undefined => {
    return selectedConversationId || undefined;
  }, []);

  // Update unread messages count
  const updateUnreadMessagesCount = useCallback((count: number) => {
    AsyncStorage.setItem('unreadMessagesCount', String(count)).catch(err => 
      console.error('[App] Failed to save unread messages count:', err)
    );
    
    EventRegister.emit('unreadMessagesUpdated', count);
  }, []);

  // Toggle memory panel
  const toggleMemoryPanel = useCallback(() => {
    setIsMemoryPanelVisible(!isMemoryPanelVisible);
    if (!isMemoryPanelVisible) {
      fetchMemoryFacts();
    }
  }, [isMemoryPanelVisible]);

  // Fetch memory facts
  const fetchMemoryFacts = useCallback(async () => {
    if (!selectedConversationId) return;
    
    try {
      const userMessage = messages.length > 0 ? messages[messages.length - 1].text : "";
      
      const mem0Service = Mem0Service.getInstance();
      const searchResults = await mem0Service.searchMemories(
        userMessage,
        characterToUse?.id || "",
        selectedConversationId,
        10
      );
      
      if (searchResults && searchResults.results) {
        setMemoryFacts(searchResults.results);
      }
    } catch (error) {
      console.error('Error fetching memory facts:', error);
    }
  }, [selectedConversationId, messages, characterToUse]);

  // Process message memory
  const processMessageMemory = useCallback(async (messageId: string, text: string, conversationId: string | null) => {
    if (!conversationId || !characterToUse?.id) return;
    
    try {
      const mem0Service = Mem0Service.getInstance();
      
      await mem0Service.addChatMemory(
        text,
        'user',
        characterToUse.id,
        conversationId
      );
      
      setMessageMemoryState(prev => ({
        ...prev,
        [messageId]: 'saved'
      }));
      
      if (isMemoryPanelVisible) {
        fetchMemoryFacts();
      }
    } catch (error) {
      console.error('Error processing message memory:', error);
      
      setMessageMemoryState(prev => ({
        ...prev,
        [messageId]: 'failed'
      }));
    }
  }, [characterToUse, isMemoryPanelVisible, fetchMemoryFacts]);

  // Handle TTS enhancer toggle
  const handleTtsEnhancerToggle = useCallback(() => {
    setIsTtsEnhancerModalVisible(true);
  }, []);

  // Handle playback status update
  const handlePlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setIsVideoReady(true);
      if (videoError) setVideoError(null);
    } else {
      if (status.error) {
        console.error('Video playback error:', status.error);
        setVideoError(status.error);
      }
    }
  }, [videoError]);

  // Handle scroll position change with debounce
  const handleScrollPositionChange = useCallback((characterId: string, position: number) => {
    if (scrollPositionUpdateTimeoutRef.current) {
      clearTimeout(scrollPositionUpdateTimeoutRef.current);
    }
    
    scrollPositionUpdateTimeoutRef.current = setTimeout(() => {
      setChatScrollPositions(prev => {
        const previousPosition = prev[characterId];
        if (Math.abs((previousPosition || 0) - position) > 10) {
          return { ...prev, [characterId]: position };
        }
        return prev;
      });
    }, 200); // Debounce for better performance
  }, []);

  // 添加对话切换的滚动控制逻辑
  const lastSelectedCharacterId = useRef<string | null>(null);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState<boolean>(false);

  useEffect(() => {
    if (selectedConversationId && selectedConversationId !== lastSelectedCharacterId.current) {
      // 对话发生切换，标记需要滚动到底部
      lastSelectedCharacterId.current = selectedConversationId;
      setShouldScrollToBottom(true);
      console.log(`[Index] 检测到对话切换: ${selectedConversationId}, 将在消息加载后滚动到底部`);
    }
  }, [selectedConversationId]);

  // 当消息加载完成且需要滚动到底部时，确保触发滚动
  useEffect(() => {
    if (shouldScrollToBottom && filteredMessages.length > 0) {
      console.log(`[Index] 消息已加载完成 (${filteredMessages.length} 条)，准备滚动到底部`);
    }
  }, [shouldScrollToBottom, filteredMessages.length]);

  // 处理滚动到底部完成的回调
  const handleScrollToBottomComplete = useCallback(() => {
    // 只有当前选中的对话ID与触发滚动时的ID一致时才重置标记
    setShouldScrollToBottom(false);
    console.log(`[Index] 滚动到底部完成，重置标记 (当前对话: ${selectedConversationId})`);
  }, [selectedConversationId]);

  // Toggle brave search
  const toggleBraveSearch = useCallback(() => {
    setBraveSearchEnabled(prev => {
      const newState = !prev;
      AsyncStorage.setItem('braveSearchEnabled', JSON.stringify(newState))
        .catch(err => console.error('[App] Failed to save search preference:', err));

      
      return newState;
    });
  }, []);

  // === 新增：强制刷新消息的回调函数 ===
  const handleMessagesRefresh = useCallback(async (conversationId: string) => {
    // 新增：如果正在发送消息，则跳过刷新，避免覆盖临时消息
    if (isSendingMessage) {
      console.log('[Index] 跳过消息刷新，因为正在发送消息');
      return;
    }
    
    if (conversationId === selectedConversationId) {
      try {
        const refreshedMessages = await getMessages(conversationId);
        setMessages(refreshedMessages);
        console.log(`[Index] 强制刷新消息列表: ${refreshedMessages.length} 条消息`);
      } catch (error) {
        console.error('[Index] 刷新消息列表失败:', error);
      }
    }
  }, [selectedConversationId, getMessages, isSendingMessage]);

  // Setup auto message when character or conversation changes - 优化：减少依赖项和频繁重新设置
  useEffect(() => {
    if (!isPageVisible) return; // 页面不可见时跳过

    if (characterToUse && selectedConversationId && user) {
      autoMessageService.setupAutoMessage({
        enabled: characterToUse.autoMessage === true,
        intervalMinutes: characterToUse.autoMessageInterval || 5,
        characterId: characterToUse.id,
        conversationId: selectedConversationId,
        character: characterToUse,
        user: user,
        messages: messages,
        onMessageAdded: addMessage,
        onUnreadCountUpdate: updateUnreadMessagesCount,
        onMessagesRefresh: handleMessagesRefresh
      });
    } else if (selectedConversationId) {
      // Clear auto message if character not available
      autoMessageService.clearAutoMessage(selectedConversationId);
    }

    return () => {
      if (selectedConversationId) {
        autoMessageService.clearAutoMessage(selectedConversationId);
      }
    };
  }, [
    characterToUse?.id, // 只依赖关键ID，减少重新设置
    characterToUse?.autoMessage,
    characterToUse?.autoMessageInterval,
    selectedConversationId, 
    user?.id, // 只依赖用户ID
    messages.length, // 只依赖消息数量，避免深度比较
    addMessage, 
    updateUnreadMessagesCount, 
    autoMessageService, 
    handleMessagesRefresh,
    isPageVisible
  ]);

  // Initialize default characters and load preferences - 优化：减少并发操作
  useEffect(() => {
    let isMounted = true;
    
    (async () => {
      try {
        console.log('[index] 调用 importDefaultCharactersIfNeeded ...');
        setIsInitializing(true);
        
        const result = await importDefaultCharactersIfNeeded(
          addCharacter,
          addConversation,
          (id: string, uri: string) => {
            console.log(`[index] 调用 updateCharacterExtraBackgroundImage: id=${id}, uri=${uri}`);
            return updateCharacterExtraBackgroundImage(id, uri);
          },
          (id: string, uri: string) => {
            console.log(`[index] 调用 setCharacterAvatar: id=${id}, uri=${uri}`);
            return Promise.resolve();
          }
        );
        
        console.log('[index] importDefaultCharactersIfNeeded 完成', result);
        
        if (isMounted && result && result.characterId) {
          setSelectedConversationId(result.characterId);
          
          if (result.imported) {
            const characterMessages = await getMessages(result.characterId);
            if (isMounted) {
              setMessages(characterMessages);
              console.log(`[index] 选择了新导入的默认角色：${result.characterId}`);
            }
          }
          
          if (mode === 'visual-novel') {
            console.log('[index] 视觉小说模式已激活，设置 defaultCharacterNavigated 为 true');
            setDefaultCharacterNavigated(true);
          }
        }
        
        if (isMounted) {
          setTimeout(() => setIsInitializing(false), 500);
        }
      } catch (e) {
        console.warn('[DefaultCharacterImporter] 初始化失败:', e);
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    })();

    // 并行加载其他设置，避免阻塞主流程
    Promise.all([
      // Load character view mode
      (async () => {
        try {
          const mode = await AsyncStorage.getItem('character_view_mode');
          if (
            mode === 'large' ||
            mode === 'small' ||
            mode === 'vertical'
          ) {
            characterViewModeCache = mode;
          } else {
            characterViewModeCache = null;
          }
        } catch (e) {
          characterViewModeCache = null;
        }
      })(),

      // Load global settings
      (async () => {
        const globalSettings = await loadGlobalSettingsState();
        if (globalSettings && typeof window !== 'undefined') {
          window.__globalSettingsCache = globalSettings;
        }
      })(),

      // Load search preference
      (async () => {
        try {
          const savedPref = await AsyncStorage.getItem('braveSearchEnabled');
          if (savedPref !== null && isMounted) {
            setBraveSearchEnabled(JSON.parse(savedPref));
          }
        } catch (error) {
          console.error('[App] Failed to load search preference:', error);
        }
      })(),

      // Load TTS enhancer settings
      (async () => {
        try {
          const settings = ttsService.getEnhancerSettings();
          if (isMounted) {
            setIsTtsEnhancerEnabled(settings.enabled);
          }
        } catch (error) {
          console.error('[App] Error loading TTS enhancer settings:', error);
        }
      })()
    ]).catch(e => {
      console.warn('[index] 并行加载设置失败:', e);
    });

    // Sync table memory plugin
    try {
      const enabled = isTableMemoryEnabled();
      setTableMemoryEnabled(enabled);
      console.log('[index] 同步表格记忆插件开关:', enabled);
    } catch (e) {
      console.warn('[index] 同步表格记忆插件开关失败:', e);
    }

    return () => {
      isMounted = false;
    };
  }, []); // 只在组件挂载时执行一次

  // Fall back to loading character from storage if not found in context - 优化：防抖处理
  useEffect(() => {
    if (!isPageVisible) return;

    if (
      selectedConversationId &&
      !selectedCharacter &&
      !charactersLoading
    ) {
      // 使用防抖避免频繁加载
      const debouncedLoad = debounce(async () => {
        console.warn('[App] selectedCharacter not found in context, try fallback from storage:', selectedConversationId);
        try {
          const filePath = FileSystem.documentDirectory + 'characters.json';
          const fileInfo = await FileSystem.getInfoAsync(filePath);
          if (fileInfo.exists) {
            const content = await FileSystem.readAsStringAsync(filePath);
            const arr = JSON.parse(content);
            if (Array.isArray(arr)) {
              const found = arr.find((c: any) => c.id === selectedConversationId);
              if (found && isPageVisible) {
                setFallbackCharacter(found);
                
                if (!characters.some((c: Character) => c.id === found.id)) {
                  setCharacters([...characters, found]);
                }
                return;
              }
            }
          }
          if (isPageVisible) {
            setFallbackCharacter(null);
          }
        } catch (e) {
          if (isPageVisible) {
            setFallbackCharacter(null);
          }
        }
      }, 300);

      debouncedLoad();
    } else {
      setFallbackCharacter(null);
    }
  }, [selectedConversationId, selectedCharacter, charactersLoading, characters, setCharacters, isPageVisible, debounce]);

  // 初始化时尝试恢复上次的对话 - 优化：避免重复检查
  useEffect(() => {
    if (!isPageVisible) return;

    // 只有在没有通过URL参数指定characterId时才自动恢复
    if (!characterId && !selectedConversationId && !hasRestoredLastConversation && characters.length > 0) {
      let isMounted = true;
      
      (async () => {
        try {
          const lastId = await AsyncStorage.getItem('lastConversationId');
          if (isMounted && lastId && characters.some((char: Character) => char.id === lastId)) {
            setSelectedConversationId(lastId);
            const characterMessages = await getMessages(lastId);
            if (isMounted) {
              setMessages(characterMessages);
            }
          }
        } catch (e) {
          // ignore
        } finally {
          if (isMounted) {
            setHasRestoredLastConversation(true);
          }
        }
      })();

      return () => {
        isMounted = false;
      };
    }
  }, [characterId, selectedConversationId, hasRestoredLastConversation, characters.length, getMessages, isPageVisible]);

  // Load groups when user changes - 优化：避免不必要的重新加载
  useEffect(() => {
    if (!isPageVisible) return;

    if (user) {
      loadUserGroups();
    } else {
      setGroups([]);
      setSelectedGroupId(null);
      setGroupMessages([]);
      setGroupMembers([]);
    }
  }, [user, loadUserGroups]);

  // Load group messages and members
  useEffect(() => {
    if (selectedGroupId) {
      loadGroupMessages(selectedGroupId);

      const selectedGroup = groups.find(g => g.groupId === selectedGroupId);
      if (selectedGroup && characters) {
        const characterMemberIds = selectedGroup.groupMemberIds?.filter(
          id => id !== user?.id
        ) || [];
        
        let memberCharacters = characters.filter(
          (char: Character) => characterMemberIds.includes(char.id)
        );
        
        if (memberCharacters.length < characterMemberIds.length) {
          console.log(`[Index] Found ${memberCharacters.length} of ${characterMemberIds.length} group members, loading missing ones...`);
          
          CharacterLoader.loadCharactersByIds(characterMemberIds)
            .then(loadedMembers => {
              if (loadedMembers && loadedMembers.length > 0) {
                console.log(`[Index] Successfully loaded ${loadedMembers.length} group members`);
                setGroupMembers(loadedMembers);
              }
            })
            .catch(error => {
              console.error('[Index] Error loading missing group members:', error);
            });
        } else {
          setGroupMembers(memberCharacters);
        }
      } else {
        setGroupMembers([]);
      }
    } else {
      setGroupMessages([]);
      setGroupMembers([]);
    }
  }, [selectedGroupId, groups, characters, user?.id, loadGroupMessages]);

  // Load saved chat scroll positions
  useEffect(() => {
    const saveScrollPositions = async () => {
      try {
        if (Object.keys(chatScrollPositions).length > 0) {
          const operation = AsyncStorage.setItem('chatScrollPositions', JSON.stringify(chatScrollPositions));
          asyncStorageOperations.current.add(operation);
          await operation;
          asyncStorageOperations.current.delete(operation);
        }
      } catch (error) {
        console.error('Failed to save scroll positions:', error);
      }
    };

    // Load saved scroll positions
    const loadScrollPositions = async () => {
      try {
        const savedPositions = await AsyncStorage.getItem('chatScrollPositions');
        if (savedPositions) {
          setChatScrollPositions(JSON.parse(savedPositions));
        }
      } catch (error) {
        console.error('Failed to load scroll positions:', error);
      }
    };
    
    loadScrollPositions();
    
    return () => {
      saveScrollPositions();
    };
  }, [chatScrollPositions]);

  // First message handling
  useEffect(() => {
    if (
      selectedConversationId &&
      !isGroupMode &&
      characterToUse &&
      messages.length === 0 &&
      !firstMesSentRef.current[selectedConversationId]
    ) {
      getMessages(selectedConversationId).then((actualMessages: Message[]) => {
        if (actualMessages && actualMessages.length > 0) {
          console.log(`[first_mes] [messages effect] getMessages(${selectedConversationId})已有${actualMessages.length}条消息，不发送first_mes`);
        } else {
          (async () => {
            let firstMes = '';
            try {
              if (characterToUse.jsonData) {
                const characterData = JSON.parse(characterToUse.jsonData);
                firstMes = characterData.roleCard?.first_mes || '';
                
                // Apply regex scripts
                try {
                  const globalSettings = typeof window !== 'undefined' && window.__globalSettingsCache
                    ? window.__globalSettingsCache
                    : await loadGlobalSettingsState();
                  
                  if (
                    globalSettings &&
                    globalSettings.regexEnabled &&
                    Array.isArray(globalSettings.regexScriptGroups) &&
                    globalSettings.regexScriptGroups.length > 0
                  ) {
                    const matchedGroups = globalSettings.regexScriptGroups.filter(
                      (g: any) =>
                        (g.bindType === 'all') ||
                        (g.bindType === 'character' && g.bindCharacterId === selectedConversationId)
                    );
                    
                    const enabledScripts: any[] = [];
                    matchedGroups.forEach((group: any) => {
                      if (Array.isArray(group.scripts)) {
                        group.scripts.forEach((s: any) => {
                          if (!s.disabled) enabledScripts.push(s);
                        });
                      }
                    });
                    
                    if (enabledScripts.length > 0) {
                      let NodeSTCoreClass = null;
                      try {
                        NodeSTCoreClass = (await import('@/NodeST/nodest/core/node-st-core')).NodeSTCore;
                      } catch (e) {}
                      
                      if (NodeSTCoreClass && typeof NodeSTCoreClass.applyGlobalRegexScripts === 'function') {
                        firstMes = NodeSTCoreClass.applyGlobalRegexScripts(
                          firstMes,
                          enabledScripts,
                          2
                        );
                      }
                    }
                  }
                } catch (e) {
                  // Ignore errors
                }
              }
            } catch (e) {
              firstMes = '';
            }
            
            if (firstMes) {
              console.log(`[first_mes] [messages effect] 发送first_mes到${selectedConversationId}:`, firstMes);
              await addMessage(selectedConversationId, {
                id: `first-auto-${Date.now()}`,
                text: firstMes,
                sender: 'bot',
                timestamp: Date.now()
              });
              firstMesSentRef.current[selectedConversationId] = true;
            }
          })();
        }
      });
    }
    // If messages not empty, mark first message as sent
    if (selectedConversationId && messages.length > 0) {
      firstMesSentRef.current[selectedConversationId] = true;
    }
  }, [selectedConversationId, characterToUse, messages, isGroupMode, addMessage, getMessages]);

  // Save last selected conversation
  useEffect(() => {
    if (selectedConversationId) {
      console.log('[Index] Saving selectedConversationId to AsyncStorage:', selectedConversationId);
      const operation = AsyncStorage.setItem('lastConversationId', selectedConversationId);
      asyncStorageOperations.current.add(operation);
      operation.then(() => {
        asyncStorageOperations.current.delete(operation);
      }).catch(err => {
        asyncStorageOperations.current.delete(operation);
        console.error('[Index] Failed to save lastConversationId:', err);
      });
    }
  }, [selectedConversationId]);

  // Initial conversation handling from URL params
  useEffect(() => {
    if (characterId) {
      console.log('[Index] Character ID from params:', characterId);
      const characterExists = characters.some((char: Character) => char.id === characterId);
      console.log('[Index] Character exists in characters array:', characterExists);

      if (characterExists) {
        setSelectedConversationId(characterId);
        console.log('[Index] Selected conversation set to:', characterId);

        getMessages(characterId).then((characterMessages: Message[]) => {
          console.log('[Index] Loaded messages count:', characterMessages.length);
          setMessages(characterMessages);

          if (
            characterMessages.length === 0 &&
            !firstMessageSentRef.current[characterId]
          ) {
            if (messages.length > 0) {
              console.log(`[first_mes] [param effect] 当前界面已有消息，不发送first_mes到${characterId}`);
            } else {
              (async () => {
                const char = characters.find((c: Character) => c.id === characterId);
                let firstMes = '';
                try {
                  if (char?.jsonData) {
                    const characterData = JSON.parse(char.jsonData);
                    firstMes = characterData.roleCard?.first_mes || '';
                  }
                } catch (e) {
                  firstMes = '';
                }
                if (firstMes) {
                  console.log(`[first_mes] [param effect] 发送first_mes到${characterId}:`, firstMes);
                  await addMessage(characterId, {
                    id: `first-create-${Date.now()}`,
                    text: firstMes,
                    sender: 'bot',
                    timestamp: Date.now()
                  });
                  firstMessageSentRef.current[characterId] = true;
                }
              })();
            }
          } else if (characterMessages.length > 0) {
            firstMessageSentRef.current[characterId] = true;
          }
        });
      } else {
        console.warn('[Index] Character not found in characters array:', characterId);
      }

      setIsSidebarVisible(false);
    }
  }, [characterId, characters, getMessages, messages, addMessage]);


  // Cleanup auto message service on unmount
  useEffect(() => {
    return () => {
      autoMessageService.clearAll();
    };
  }, [autoMessageService]);


  // TTS enhancer settings listener - 优化：确保事件监听器正确清理
  useEffect(() => {
    const enhancerSettingsListener = EventRegister.addEventListener(
      'ttsEnhancerSettingsChanged',
      (settings: any) => {
        if (settings && typeof settings.enabled === 'boolean') {
          setIsTtsEnhancerEnabled(settings.enabled);
        }
      }
    );

    // 添加到事件监听器集合中进行统一管理
    if (typeof enhancerSettingsListener === 'string') {
      eventListenersRef.current.add(enhancerSettingsListener);
    }

    return () => {
      if (typeof enhancerSettingsListener === 'string') {
        EventRegister.removeEventListener(enhancerSettingsListener);
        eventListenersRef.current.delete(enhancerSettingsListener);
      }
    };
  }, []);

  // Handle keyboard events - 优化：防止内存泄漏
  useEffect(() => {
    if (!isPageVisible) return; // 页面不可见时不监听键盘事件

    const keyboardWillShowListener = Keyboard.addListener(
      'keyboardWillShow',
      () => {
        if (isPageVisible) {
          setKeyboardVisible(true);
          Animated.timing(contentScaleAnim, {
            toValue: 0.96,
            duration: 220,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }).start();
        }
      }
    );
    
    const keyboardWillHideListener = Keyboard.addListener(
      'keyboardWillHide',
      () => {
        if (isPageVisible) {
          setKeyboardVisible(false);
          Animated.timing(contentScaleAnim, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }).start();
        }
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, [contentScaleAnim, isPageVisible]);

  // Update tab bar visibility based on keyboard - 优化：节流处理
  useEffect(() => {
    if (!isPageVisible) return;

    if (Platform.OS === 'ios') {
      // 使用节流函数避免频繁调用
      const throttledSetParams = throttle((hideTabBar: string) => {
        router.setParams({ hideTabBar });
      }, 100);
      
      throttledSetParams(isKeyboardVisible ? 'true' : 'false');
    }
  }, [isKeyboardVisible, router, isPageVisible, throttle]);

  // Listen for top bar visibility changes - 优化：确保事件监听器正确清理
  useEffect(() => {
    const listener = EventRegister.addEventListener('toggleTopBarVisibility', (visible: boolean) => {
      if (isPageVisible) {
        setIsTopBarVisible(visible);
        DeviceEventEmitter.emit('topBarVisibilityChanged', visible);
      }
    });

    // 添加到事件监听器集合中进行统一管理
    if (typeof listener === 'string') {
      eventListenersRef.current.add(listener);
    }

    return () => {
      if (typeof listener === 'string') {
        EventRegister.removeEventListener(listener);
        eventListenersRef.current.delete(listener);
      }
    };
  }, [isPageVisible]);

  // Clear transient errors - 优化：减少不必要的副作用
  useEffect(() => {
    if (!isPageVisible || !transientError) return;

    if (
      transientError.includes('处理消息时出现了错误') &&
      selectedConversationId &&
      messages.length > 0
    ) {
      // Do nothing - just check conditions
    }
  }, [transientError, selectedConversationId, messages, isPageVisible]);

  // 优化：PostChatService 和 AutoImageService 实例创建
  const postChatService = useMemo(() => {
    console.log('[Performance] 创建 PostChatService 实例');
    return PostChatService.getInstance();
  }, []);

  const autoImageService = useMemo(() => {
    console.log('[Performance] 创建 AutoImageService 实例');
    return AutoImageService.getInstance();
  }, []);
  
  // Track last processed message ID for auto image generation
  const lastProcessedMsgIdRef = useRef<string | null>(null);

  // 计算顶部栏内容高度（与TopBarWithBackground一致）
  const { width } = Dimensions.get('window');
  const AVATAR_SIZE = Math.max(Math.min(width * 0.09, 36), 32);
  const topBarContentHeight = Math.max(AVATAR_SIZE + 16, 48);
  const navbarHeight = Platform.OS === 'ios' ? 44 : StatusBar.currentHeight || 0;
  const computedTopBarHeight = navbarHeight + topBarContentHeight;

  // === 优化：同步每个会话的背景生成状态 ===
  useEffect(() => {
    if (!characterToUse?.id || !isPageVisible) return; // 性能优化：页面不可见时跳过
    
    const updateState = () => {
      if (!isPageVisible) return; // 执行前再次检查
      
      const state = postChatService.getCurrentState(characterToUse.id);
      setExtraBgStates(prev => ({
        ...prev,
        [characterToUse.id]: {
          isGenerating: state.isGenerating,
          taskId: state.taskId,
          error: state.error,
          image: state.image
        }
      }));
    };
    
    updateState();
    const interval = createSafeInterval(updateState, 800); // 使用安全定时器
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [characterToUse?.id, postChatService, isPageVisible, createSafeInterval]);

  // === 新增：每次切换characterId时加载已处理消息ID ===
  useEffect(() => {
    if (characterToUse?.id) {
      postChatService.loadProcessedMessageIds(characterToUse.id);
    }
  }, [characterToUse?.id, postChatService]);

  // === 新增：每次切换characterId时加载自动图片生成的已处理消息ID ===
  useEffect(() => {
    if (characterToUse?.id) {
      autoImageService.loadProcessedMessageIds(characterToUse.id);
      autoImageService.resetCooldown(characterToUse.id);
    }
  }, [characterToUse?.id, autoImageService]);

  // === 新增：触发背景生成的 useEffect ===
  useEffect(() => {
    if (
      characterToUse &&
      characterToUse.enableAutoExtraBackground &&
      characterToUse.backgroundImageConfig?.isNovelAI &&
      characterToUse.backgroundImage &&
      messages &&
      messages.length > 0
    ) {
      // 查找最后一条AI回复消息
      const lastBotMessageIndex = [...messages].reverse().findIndex(msg => 
        msg.sender === 'bot' && !msg.isLoading && !msg.metadata?.isErrorMessage
      );
      
      if (lastBotMessageIndex === -1) {
        console.log('[Index] 未找到AI回复消息，跳过背景生成');
        return;
      }
      
      const lastMsg = messages[messages.length - 1 - lastBotMessageIndex];
      
      // 检查消息是否是最近的消息
      const currentTime = Date.now();
      const messageTime = lastMsg.timestamp || 0;
      const messageAge = currentTime - messageTime;
      
      // 如果消息超过30秒，认为是旧消息，不触发生成
      if (messageAge > 30000) {
        console.log(`[Index] 消息时间过久 (${Math.floor(messageAge / 1000)}秒)，跳过背景生成`);
        return;
      }
      
      // 检查消息是否是最后一条消息，如果不是，可能是因为删除了消息导致的重新加载
      if (lastBotMessageIndex > 0) {
        // 不是最后一条消息，检查后面的消息是否都是用户消息
        const laterMessages = messages.slice(messages.length - lastBotMessageIndex);
        const allUserMessages = laterMessages.every(msg => msg.sender === 'user');
        
        if (!allUserMessages) {
          console.log('[Index] AI消息不是最后一条非用户消息，可能是因为删除操作，跳过背景生成');
          return;
        }
      }
      
      if (!postChatService.hasProcessedMessage(characterToUse.id, lastMsg.id)) {
        const state = postChatService.getCurrentState(characterToUse.id);
        if (!state.isGenerating) {
          postChatService.triggerBackgroundGeneration(
            characterToUse,
            lastMsg.text,
            messages,
            user,
            async (characterId: string, imageUrl: string) => {
              await updateCharacterExtraBackgroundImage(characterId, imageUrl);
            }
          );
        }
      }
    }
  }, [
    characterToUse,
    characterToUse?.enableAutoExtraBackground,
    characterToUse?.backgroundImageConfig?.isNovelAI,
    characterToUse?.backgroundImage,
    messages,
    user,
    updateCharacterExtraBackgroundImage,
    postChatService
  ]);

  // === 清理状态：切换characterToUse时只保留当前会话的状态 ===
  useEffect(() => {
    if (!characterToUse?.id) return;
    setExtraBgStates(prev => {
      const newState: typeof prev = {};
      if (prev[characterToUse.id]) {
        newState[characterToUse.id] = prev[characterToUse.id];
      }
      return newState;
    });
    
    // 清理自动图片生成状态
    setAutoImageStates(prev => {
      const newState: typeof prev = {};
      if (prev[characterToUse.id]) {
        newState[characterToUse.id] = prev[characterToUse.id];
      }
      return newState;
    });
  }, [characterToUse?.id]);

  // === 清理状态：关闭自动背景时清理当前会话的生成图片 ===
  useEffect(() => {
    if (characterToUse && !characterToUse.enableAutoExtraBackground && characterToUse.id) {
      setExtraBgStates(prev => ({
        ...prev,
        [characterToUse.id]: {
          isGenerating: false,
          taskId: null,
          error: null,
          image: null
        }
      }));
    }
  }, [characterToUse?.enableAutoExtraBackground, characterToUse?.id]);

  // === 清理状态：关闭自动图片生成时清理当前会话的状态 ===
  useEffect(() => {
    if (characterToUse && !characterToUse.autoImageEnabled && !characterToUse.customImageEnabled && characterToUse.id) {
      setAutoImageStates(prev => ({
        ...prev,
        [characterToUse.id]: {
          isGenerating: false,
          taskId: null,
          error: null
        }
      }));
    }
  }, [characterToUse?.autoImageEnabled, characterToUse?.customImageEnabled, characterToUse?.id]);

  // === 清理状态：背景图片变更时清理 ===
  useEffect(() => {
    if (
      characterToUse &&
      characterToUse.id &&
      (!characterToUse.enableAutoExtraBackground ||
        (extraBgStates[characterToUse.id]?.image &&
          characterToUse.extrabackgroundimage !== extraBgStates[characterToUse.id]?.image))
    ) {
      setExtraBgStates(prev => ({
        ...prev,
        [characterToUse.id]: {
          isGenerating: false,
          taskId: null,
          error: null,
          image: null
        }
      }));
    }
  }, [characterToUse, characterToUse?.enableAutoExtraBackground, characterToUse?.extrabackgroundimage]);

  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // 加载最新一页
  const loadInitialMessages = useCallback(async (conversationId: string) => {
    // 新增：如果正在发送消息，则跳过加载，避免覆盖临时消息
    if (isSendingMessage) {
      console.log('[Index] 跳过消息加载，因为正在发送消息');
      return;
    }
    
    setLoadingMore(true);
    if (getMessagesPaged) {
      const { messages: pagedMessages, hasMore } = await getMessagesPaged(conversationId, 1, PAGE_SIZE_SAFE);
      setMessages(pagedMessages);
      setCurrentPage(1);
      setHasMoreMessages(hasMore);
    }
    setLoadingMore(false);
  }, [getMessagesPaged, PAGE_SIZE_SAFE, isSendingMessage]);

  // 加载更多（上一页）
  const loadMoreMessages = useCallback(async () => {
    if (!selectedConversationId || !hasMoreMessages || loadingMore) return;
    
    console.log(`[Index] loadMoreMessages: currentPage=${currentPage}, hasMore=${hasMoreMessages}, loadingMore=${loadingMore}`);
    
    setLoadingMore(true);
    try {
      if (getMessagesPaged) {
        const nextPage = currentPage + 1;
        console.log(`[Index] Loading page ${nextPage} for conversation ${selectedConversationId}`);
        
        const { messages: moreMessages, hasMore } = await getMessagesPaged(selectedConversationId, nextPage, PAGE_SIZE_SAFE);
        
        console.log(`[Index] Loaded ${moreMessages.length} messages from page ${nextPage}, hasMore=${hasMore}`);
        console.log(`[Index] First message in loaded batch: ${moreMessages[0]?.text?.substring(0, 50) || 'N/A'}`);
        console.log(`[Index] Last message in loaded batch: ${moreMessages[moreMessages.length - 1]?.text?.substring(0, 50) || 'N/A'}`);
        
        // 检查是否有新消息，防止重复添加
        if (moreMessages.length > 0) {
          setMessages(prev => {
            // 防重复：检查第一条旧消息是否已存在
            const firstOldMessage = moreMessages[0];
            const alreadyExists = prev.some(msg => msg.id === firstOldMessage.id);
            
            if (alreadyExists) {
              console.log(`[Index] Messages already exist, skipping merge to prevent duplicates`);
              return prev;
            }
            
            const newMessages = [...moreMessages, ...prev];
            console.log(`[Index] After merge: total ${newMessages.length} messages`);
            console.log(`[Index] First message after merge: ${newMessages[0]?.text?.substring(0, 50) || 'N/A'}`);
            console.log(`[Index] Last message after merge: ${newMessages[newMessages.length - 1]?.text?.substring(0, 50) || 'N/A'}`);
            return newMessages;
          });
          
          setCurrentPage(nextPage);
        }
        
        setHasMoreMessages(hasMore);
      }
    } catch (error) {
      console.error('[Index] Error loading more messages:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [selectedConversationId, currentPage, hasMoreMessages, loadingMore, getMessagesPaged, PAGE_SIZE_SAFE]);

  // 切换会话时，加载第一页
  useEffect(() => {
    // 新增：如果正在发送消息，则延迟加载，避免覆盖临时消息
    if (selectedConversationId) {
      if (isSendingMessage) {
        console.log('[Index] 延迟消息加载，因为正在发送消息');
        // 等待消息发送完成后再加载
        const checkAndLoad = () => {
          if (!isSendingMessage) {
            loadInitialMessages(selectedConversationId);
          } else {
            setTimeout(checkAndLoad, 100);
          }
        };
        setTimeout(checkAndLoad, 100);
      } else {
        loadInitialMessages(selectedConversationId);
      }
    }
  }, [selectedConversationId, loadInitialMessages, isSendingMessage]);

  // 新增：当会话ID变化时，自动加载生成图片缓存
  useEffect(() => {
    // 会话ID变化时，自动从缓存中加载生成图片
    // getGeneratedImages 会自动从 CharactersContext 中获取当前会话的图片
    console.log('[Index] 会话变更，自动加载生成图片缓存');
  }, [selectedConversationId]);

  // Reset lastProcessedMsgIdRef when conversation changes
  useEffect(() => {
    if (selectedConversationId) {
      lastProcessedMsgIdRef.current = null;
    }
  }, [selectedConversationId]);

  // Message regeneration with message service
  const handleRegenerateMessage = useCallback(async (messageId: string, messageIndex: number) => {
    if (!selectedConversationId) {
      console.warn('No conversation selected for regeneration');
      return;
    }
  
    try {
      setRegeneratingMessageId(messageId);
      
      // Find message position for display purposes
      const targetMsgIndex = messages.findIndex(msg => msg.id === messageId);
      if (targetMsgIndex === -1) {
        console.warn('Target message not found:', messageId);
        setRegeneratingMessageId(null);
        return;
      }
      
      // Get the message for display purposes
      const targetMsg = messages[targetMsgIndex];
      
      // Create messages to keep and loading state for display
      let messagesToKeep = messages.slice(0, targetMsgIndex);
      const displayMessages = [
        ...messagesToKeep,
        {
          ...targetMsg,
          isLoading: true,
          text: '正在重新生成回复...',
          metadata: { ...targetMsg.metadata, isRegenerating: true }
        }
      ];
      
      // Update UI to show loading
      setMessages(displayMessages);
      
      // Call the message service
      const result = await messageService.handleRegenerateMessage(
        messageId, 
        messageIndex, 
        selectedConversationId, 
        messages,
        fallbackCharacter || selectedCharacter,
        user
      );
      
      if (result.success && result.messages) {
        // Save messages
        await clearMessages(selectedConversationId);
        const savePromises = result.messages.map(msg => addMessage(selectedConversationId, msg));
        await Promise.all(savePromises);
      
        // Force reload current page to maintain pagination state
        if (getMessagesPaged) {
          const { messages: pagedMessages, hasMore } = await getMessagesPaged(selectedConversationId, 1, PAGE_SIZE_SAFE);
          setMessages(pagedMessages);
          setCurrentPage(1);
          setHasMoreMessages(hasMore);
        }
      } else {
        setTransientError("处理消息时出现了错误");
        setTimeout(() => setTransientError(null), 5000);
      }
      
      setRegeneratingMessageId(null);
    } catch (error) {
      console.error('Error regenerating message:', error);
      
      setRegeneratingMessageId(null);
      setTransientError("处理消息时出现了错误");
      setTimeout(() => setTransientError(null), 5000);
    }
  }, [
    selectedConversationId, messages, fallbackCharacter, 
    selectedCharacter, clearMessages, addMessage, user, messageService, getMessagesPaged, PAGE_SIZE_SAFE
  ]);



  return (
    <View style={styles.outerContainer}>
           <StatusBar translucent backgroundColor="transparent" />
      
     {/* Restore top bar button */}
      {!isTopBarVisible && (
        <TouchableOpacity
          style={{
            position: 'absolute',
            // 修改：使用安全区顶部高度
            top: (insets?.top ?? 0) + 10,
            left: 18,
            zIndex: 99999,
            backgroundColor: 'rgba(0,0,0,0.18)', 
            borderRadius: 16,
            paddingVertical: 2,
            paddingHorizontal: 8,
            flexDirection: 'row',
            alignItems: 'center',
            elevation: 2,
            shadowColor: 'transparent',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0,
            shadowRadius: 0,
          }}
          onPress={handleRestoreTopBar}
          activeOpacity={0.85}
        >
          <Ionicons name="chevron-down" size={18} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Loading overlay */}
      {isInitializing && (
        <View style={styles.initializingOverlay}>
          <ImageBackground 
            source={require('@/assets/images/default-background.jpg')}
            style={styles.initializingBackground}
            resizeMode="cover"
          >
            <View style={styles.initializingIndicatorContainer}>
              <ActivityIndicator size="large" color="#ffffff" />
            </View>
          </ImageBackground>
        </View>
      )}

      <MemoryProvider>
        <Mem0Initializer />
        
        <View style={styles.backgroundContainer}>
          {!isGroupMode && characterToUse?.dynamicPortraitEnabled && characterToUse?.dynamicPortraitVideo ? (
            <>
              <Video
                ref={videoRef}
                source={{ uri: characterToUse.dynamicPortraitVideo }}
                style={styles.backgroundVideo}
                resizeMode={ResizeMode.COVER}
                isLooping
                shouldPlay
                isMuted
                onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                onError={(error) => {
                  console.error('Video error:', error);
                  setVideoError(error?.toString() || 'Failed to load video');
                }}
                useNativeControls={false}
              /> 
              
              {!isVideoReady && !videoError && (
                <View style={styles.videoLoadingContainer}>
                  <ActivityIndicator size="large" color="#ffffff" />
                  <Text style={styles.videoLoadingText}>加载动态立绘中...</Text>
                </View>
              )}
              
              {videoError && (
                <View style={styles.videoErrorContainer}>
                  <ImageBackground
                    source={characterToUse.backgroundImage 
                      ? { uri: characterToUse.backgroundImage } 
                      : require('@/assets/images/default-background.jpg')}
                    style={styles.backgroundImage}
                    resizeMode="cover"
                  />
                  <View style={styles.videoErrorOverlay}>
                    <Text style={styles.videoErrorText}>
                      无法加载动态立绘视频，已显示静态背景
                    </Text>
                  </View>
                </View>
              )}
            </>
          ) : (
            <ImageBackground
              source={isGroupMode 
                ? getGroupBackgroundImage()
                : (characterToUse ? getBackgroundImage() : require('@/assets/images/default-background.jpg'))}
              style={styles.backgroundImage}
              resizeMode="cover"
            >
              <View style={{flex: 1}} />
            </ImageBackground>
          )}
        </View>

        {/* Background generation indicator */}
        {characterToUse?.id && extraBgStates[characterToUse.id]?.isGenerating && (
          <View style={{
            position: 'absolute',
            top: 90,
            right: 30,
            zIndex: 999999,
            backgroundColor: 'rgba(0,0,0,0.6)',
            borderRadius: 20,
            paddingVertical: 8,
            paddingHorizontal: 18,
            flexDirection: 'row',
            alignItems: 'center',
            elevation: 8,
          }}>
            <ActivityIndicator size="small" color="rgb(255, 224, 195)" />
            <Text style={{ color: 'rgb(255, 224, 195)', marginLeft: 8 }}>生成新背景...</Text>
          </View>
        )}
        
        {/* Auto image generation indicator */}
        {characterToUse?.id && autoImageStates[characterToUse.id]?.isGenerating && (
          <View style={{
            position: 'absolute',
            top: extraBgStates[characterToUse.id]?.isGenerating ? 140 : 90,
            right: 30,
            zIndex: 999999,
            backgroundColor: 'rgba(0,0,0,0.6)',
            borderRadius: 20,
            paddingVertical: 8,
            paddingHorizontal: 18,
            flexDirection: 'row',
            alignItems: 'center',
            elevation: 8,
          }}>
            <ActivityIndicator size="small" color="rgb(173, 216, 230)" />
            <Text style={{ color: 'rgb(173, 216, 230)', marginLeft: 8 }}>生成新图片...</Text>
          </View>
        )}
        
        {/* Sidebar */}
        {user && (
          <Sidebar
            isVisible={isSidebarVisible}
            conversations={characters}
            selectedConversationId={isGroupMode ? selectedGroupId : selectedConversationId}
            onSelectConversation={handleSelectConversation}
            onClose={toggleSidebar}
            animationValue={contentSlideAnim}
            currentUser={user}
            disbandedGroups={disbandedGroups}
          />
        )}

        {/* Group settings sidebar */}
        {isGroupMode && (
          <GroupSettingsSidebar
            isVisible={groupSettingsSidebarVisible}
            onClose={toggleGroupSettingsSidebar}
            animationValue={groupSettingsSidebarAnim}
            selectedGroup={selectedGroup}
            currentUser={user}
            onGroupBackgroundChanged={handleGroupBackgroundChanged}
          />
        )}

        {/* Main content area */}
        <Animated.View 
          style={[
            styles.contentMainContainer,
            {
              transform: [
                { 
                  translateX: Animated.add(
                    contentSlideAnim,
                    Animated.multiply(settingsSlideAnim, -1),
                  ),
                },
                { translateX: Animated.multiply(groupSettingsSidebarAnim, -1) },
                { scale: contentScaleAnim }
              ],
              width: '100%',
            }
          ]}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardAvoidView}
          >
            <View style={[
              styles.container,
              (characterToUse || isGroupMode) ? styles.transparentBackground : styles.darkBackground
            ]}>
              
              {/* Top bar */}
              {isTopBarVisible && (
                <TopBarWithBackground
                  selectedCharacter={!isGroupMode ? characterToUse : null}
                  selectedGroup={isGroupMode ? selectedGroup : null}
                  onAvatarPress={isGroupMode ? handleToggleGroupManage : handleAvatarPress}
                  onMemoPress={() => setIsMemoSheetVisible(true)}
                  onSettingsPress={toggleSettingsSidebar}
                  onMenuPress={toggleSidebar}
                  onSaveManagerPress={isGroupMode ? undefined : toggleSaveManager}
                  showBackground={false}
                  isGroupMode={isGroupMode}
                  currentUser={user}
                  onGroupDisbanded={handleGroupDisbanded}
                  isEmpty={!isGroupMode && (!characterToUse || messages.length === 0)}
                  onGroupSettingsPress={toggleGroupSettingsSidebar}
                />
              )}

              <SafeAreaView style={[
                styles.safeArea,
                (characterToUse || isGroupMode) && styles.transparentBackground,
                mode === 'background-focus' && styles.backgroundFocusSafeArea,
                !isTopBarVisible && { marginTop: 10 }, // 顶部栏隐藏时顶部留10px间隙
                isTopBarVisible && { marginTop: computedTopBarHeight }
              ]}>
                {/* Transient error display */}
                {transientError && (
                  <View style={styles.transientErrorContainer}>
                    <View style={styles.transientErrorBox}>
                      <Text style={styles.transientErrorText}>{transientError}</Text>
                    </View>
                  </View>
                )}

                {/* Preview Mode Banner */}
                {isPreviewMode && previewBannerVisible && !isGroupMode && (
                  <View style={styles.previewBanner}>
                    <Text style={styles.previewBannerText}>
                      You are previewing a saved chat state
                    </Text>
                    <View style={styles.previewBannerButtons}>
                      <TouchableOpacity 
                        style={styles.previewBannerButton}
                        onPress={exitPreviewMode}
                      >
                        <Text style={styles.previewBannerButtonText}>Exit Preview</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity 
                        style={[styles.previewBannerButton, styles.restoreButton]}
                        onPress={() => currentPreviewSave && handleLoadSave(currentPreviewSave)}
                      >
                        <Text style={styles.previewBannerButtonText}>Restore This State</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                
                {/* Chat content */}
                <View style={[
                  styles.contentContainer,
                  (characterToUse || isGroupMode) && styles.transparentBackground,
                  mode === 'background-focus' && !isGroupMode && styles.backgroundFocusContentContainer,
                  !isTopBarVisible && { paddingTop: 0 }
                ]}>
                  {isGroupMode ? (
                    <GroupDialog
                      style={styles.chatDialog}
                      groupId={selectedGroupId || ''}
                      messages={groupMessages}
                      onScrollPositionChange={(groupId, position) => {
                        setChatScrollPositions(prev => ({
                          ...prev,
                          [`group-${groupId}`]: position
                        }));
                      }}
                      currentUser={user || { id: '', name: 'User' }}
                      groupMembers={groupMembers}
                      isGroupDisbanded={disbandedGroups.includes(selectedGroupId || '')}
                    />
                  ) : (
                      <ChatDialog
                        messages={filteredMessages}
                        style={StyleSheet.flatten([styles.chatDialog])}
                        selectedCharacter={characterToUse}
                        onRateMessage={() => {}} // Rating functionality removed
                        savedScrollPosition={characterToUse?.id ? chatScrollPositions[characterToUse.id] : undefined}
                        onScrollPositionChange={handleScrollPositionChange}
                        messageMemoryState={messageMemoryState}
                        regeneratingMessageId={regeneratingMessageId}
                        user={user}
                        isHistoryModalVisible={isHistoryModalVisible}
                        setHistoryModalVisible={setHistoryModalVisible}
                        onShowFullHistory={handleShowFullHistory}
                        onEditAiMessage={handleEditAiMessage} // <--- 传递编辑AI消息回调
                        onEditUserMessage={handleEditUserMessage}
                        onDeleteAiMessage={handleDeleteAiMessage} // <--- 传递删除AI消息回调
                        onRegenerateMessage={handleRegenerateMessage}
                        showMemoryButton={true}
                        isMemoryPanelVisible={isMemoryPanelVisible}
                        onToggleMemoryPanel={toggleMemoryPanel}
                        onLoadMore={loadMoreMessages}
                        loadingMore={loadingMore}
                        hasMore={hasMoreMessages}
                        generatedImages={selectedConversationId ? getGeneratedImages(selectedConversationId) : []}
                        onDeleteGeneratedImage={handleDeleteGeneratedImage}
                        shouldScrollToBottom={shouldScrollToBottom}
                        onScrollToBottomComplete={handleScrollToBottomComplete}
                      />
                  )}
                </View>

                {/* Input bar */}
                <View style={[
                  styles.inputBar,
                  (characterToUse || isGroupMode) && styles.transparentBackground,
                  mode === 'background-focus' && !isGroupMode && styles.backgroundFocusInputBar
                ]}>
                  {isGroupMode ? (
                    <GroupInput
                      onSendMessage={handleSendGroupMessage}
                      groupId={selectedGroupId || ''}
                      currentUser={user || { id: '', name: 'User' }}
                      groupMembers={groupMembers}
                    />
                  ) : (
                    characterToUse && (
                      <ChatInput
                        onSendMessage={handleSendMessage}
                        selectedConversationId={selectedConversationId}
                        conversationId={selectedConversationId ? getCharacterConversationId(selectedConversationId) ?? '' : ''}
                        onResetConversation={handleResetConversation}
                        selectedCharacter={characterToUse}
                        braveSearchEnabled={braveSearchEnabled}
                        toggleBraveSearch={toggleBraveSearch}
                        isTtsEnhancerEnabled={isTtsEnhancerEnabled}
                        onTtsEnhancerToggle={handleTtsEnhancerToggle}
                        onShowNovelAI={() => setIsNovelAITestVisible(true)}
                        onShowVNDB={() => setIsVNDBTestVisible(true)}
                        onShowMemoryPanel={toggleMemoryPanel}
                        onShowFullHistory={handleShowFullHistory}
                        onGenerateImage={handleGenerateImage}
                      />
                    )
                  )}
                </View>
              </SafeAreaView>

              {/* Modals */}
              {isGroupManageModalVisible && selectedGroup && (
                <GroupManagementModal
                  visible={isGroupManageModalVisible}
                  onClose={() => setIsGroupManageModalVisible(false)}
                  group={selectedGroup}
                  groupMembers={groupMembers}
                  allCharacters={characters}
                  currentUser={user || { id: '', name: 'User' }}
                  onGroupUpdated={() => {
                    loadUserGroups();
                    if (selectedGroupId) {
                      loadGroupMessages(selectedGroupId);
                    }
                  }}
                />
              )}

              {/* Overlay Components */}
              <MemoOverlay
                isVisible={isMemoSheetVisible}
                onClose={toggleMemoOverlay}
                characterId={characterIdForMemo}
                conversationId={conversationIdForMemo}
                customUserName={characterToUse?.customUserName}
              />            
              
              {/* Save Manager */}
              {characterToUse && (
                // 新增：解析 first_mes 并传递给 SaveManager
                (() => {
                  let firstMes = '';
                  try {
                    if (characterToUse.jsonData) {
                      const characterData = JSON.parse(characterToUse.jsonData);
                      firstMes = characterData?.roleCard?.first_mes || '';
                    }
                  } catch (e) {
                    firstMes = '';
                  }
                  return (
                    <SaveManager
                      visible={isSaveManagerVisible}
                      onClose={() => setIsSaveManagerVisible(false)}
                      conversationId={selectedConversationId || ''}
                      characterId={characterToUse.id}
                      characterName={characterToUse.name}
                      characterAvatar={characterToUse.avatar || undefined}
                      messages={messages}
                      onSaveCreated={handleSaveCreated}
                      onLoadSave={handleLoadSave}
                      onPreviewSave={handlePreviewSave}
                      // 新增：onChatRestored 回调，强制刷新消息列表
                      onChatRestored={async () => {
                        if (selectedConversationId) {
                          const refreshed = await getMessages(selectedConversationId);
                          setMessages(refreshed);
                        }
                      }}
                      // 新增：传递 firstMes
                      firstMes={firstMes}
                    />
                  );
                })()
              )}
              
              {/* TTS Enhancer Modal */}
              <TTSEnhancerModal
                visible={isTtsEnhancerModalVisible}
                onClose={() => setIsTtsEnhancerModalVisible(false)}
              />

              {/* Lazy loaded modals */}
              <Suspense fallback={null}>
                {/* {isHistoryModalVisible && (
                  <HistoryModal
                    visible={isHistoryModalVisible}
                    onClose={() => setHistoryModalVisible(false)}
                    characterId={selectedConversationId || ''}
                  />
                )} */}
              </Suspense>

                            {/* 浮动WebView测试按钮 */}
              {/* <TouchableOpacity
                style={styles.floatingLogButton}
                onPress={handleWebViewTest}
                activeOpacity={0.85}
              >
                <Text style={styles.floatingLogButtonText}>Web</Text>
              </TouchableOpacity> */}
            </View>
          </KeyboardAvoidingView>
        </Animated.View>

        {/* Settings Sidebar */}
        {characterToUse && (
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              zIndex: 99999,
            }}
          >
            <SettingsSidebar
              isVisible={isSettingsSidebarVisible}
              onClose={toggleSettingsSidebar}
              selectedCharacter={characterToUse}
              animationValue={settingsSlideAnim}
            />
          </View>
        )}
      </MemoryProvider>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#181818',
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
    backgroundColor: '#181818',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  backgroundVideo: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  videoLoadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  videoLoadingText: {
    color: '#ffffff',
    marginTop: 10,
    fontSize: 16,
    fontWeight: '500',
  },
  videoErrorContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  videoErrorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingBottom: 50,
  },
  videoErrorText: {
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    borderRadius: 5,
    fontSize: 14,
  },
  contentMainContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  container: {
    flex: 1,
    position: 'relative',
  },
  darkBackground: {
    backgroundColor: 'rgba(26, 26, 26, 0.8)',
  },
  safeArea: {
    flex: 1,
    color: 'rgba(26, 26, 26, 0.8)',
  },
  contentContainer: {
    flex: 1,
    padding: 10,
    position: 'relative',
  },
  chatDialog: {
    flex: 1,
  },
  inputBar: {
    padding: 10,
    backgroundColor: 'transparent',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 900,
  },
  transparentBackground: {
    backgroundColor: 'transparent',
  },
  previewBanner: {
    backgroundColor: 'rgba(52, 152, 219, 0.8)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    width: '100%',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  previewBannerText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  previewBannerButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
  },
  previewBannerButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    marginHorizontal: 8,
  },
  previewBannerButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  restoreButton: {
    backgroundColor: 'rgba(46, 204, 113, 0.4)',
  },
  keyboardAvoidView: {
    flex: 1,
  },
  inputBarContainer: {
    width: '100%',
  },
  visualNovelContentContainer: {
    flex: 1,
    paddingBottom: 200,
  },
  visualNovelInputBar: {
    paddingBottom: 180,
  },
  backgroundFocusSafeArea: {
    // Keep default settings
  },
  backgroundFocusContentContainer: {
    flex: 1,
    padding: 10,
  },
  backgroundFocusInputBar: {
    padding: 10,
    backgroundColor: 'transparent',
  },
  initializingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
  },
  initializingBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initializingIndicatorContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 16,
    padding: 24,
  },
  floatingLogButton: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    zIndex: 99999,
    backgroundColor: '#4a6fa5',
    borderRadius: 28,
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  floatingLogButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  transientErrorContainer: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    zIndex: 999,
    alignItems: 'center',
    pointerEvents: 'none'
  },
  transientErrorBox: {
    backgroundColor: 'rgba(220,53,69,0.95)',
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6, 
    
  },
  transientErrorText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold'
  },
  testModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
  },

  clearButton: {
    backgroundColor: '#f44336',
  },
});

export default App;
