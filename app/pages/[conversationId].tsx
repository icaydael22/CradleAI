import React, { memo, useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Animated,
  TouchableOpacity,
  ImageBackground,
  Keyboard,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEventListener } from 'expo';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventRegister } from 'react-native-event-listeners';

import { useUser } from '@/constants/UserContext';
import { useDialogMode } from '@/constants/DialogModeContext';
import { useCharacters } from '@/constants/CharactersContext';

// Custom hooks
import { useUIState } from '@/hooks/useUIState';
import { useChatState } from '@/hooks/useChatState';
import { useGroupState } from '@/hooks/useGroupState';
import { usePerformanceManager } from '@/hooks/usePerformanceManager';
import { useBackgroundState } from '@/hooks/useBackgroundState';
import { useAnimations } from '@/hooks/useAnimations';
import { useAutoMessage } from '@/hooks/useAutoMessage';

// Components
import TopBarWithBackground from '@/components/TopBarWithBackground';
import ChatInterface from '@/app/components/ChatInterface';
import SettingsSidebar from '@/components/SettingsSidebar';
import GroupSettingsSidebar from '@/components/group/GroupSettingsSidebar';
import SaveManager from '@/app/pages/SaveManager';
import MemoOverlay from '@/app/pages/MemoOverlay';
import { chatSaveService } from '@/services/ChatSaveService';
import { chatExportService } from '@/services/ChatExportService';

// Types
import { Character, Message } from '@/shared/types';

const ChatPage = memo(() => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const conversationId = params.conversationId as string;
  
  // Keyboard state
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  // Context hooks
  const { user } = useUser();
  const { mode } = useDialogMode();
  const {
    conversations,
    characters,
    getMessages,
    addMessage,
    clearMessages,
    isLoading: charactersLoading,
    removeMessage,
  } = useCharacters() as any;

  // Custom state management hooks
  const [uiState, uiActions] = useUIState();
  const [chatState, chatActions] = useChatState();
  const [groupState, groupActions] = useGroupState();
  const [performanceState, performanceActions] = usePerformanceManager();
  const [backgroundState, backgroundActions] = useBackgroundState();

  // Animation hooks
  const { 
    settingsSlideAnim, 
    groupSettingsSidebarAnim, 
  } = useAnimations({
    isSidebarVisible: false, // 聊天页面不需要侧边栏
    isSettingsSidebarVisible: uiState.isSettingsSidebarVisible,
    groupSettingsSidebarVisible: uiState.groupSettingsSidebarVisible,
  });

  // 设置当前会话ID
  useEffect(() => {
    if (conversationId && conversationId !== chatState.selectedConversationId) {
      chatActions.setSelectedConversationId(conversationId);
    }
  }, [conversationId, chatState.selectedConversationId, chatActions]);

  // 键盘监听逻辑
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', (event) => {
      setIsKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates.height);
    });
    
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  // Memoized selected group
  const selectedGroup = useMemo(() => {
    if (!groupState.selectedGroupId || !groupState.groups.length) return null;
    return groupState.groups.find(g => g.groupId === groupState.selectedGroupId) || null;
  }, [groupState.selectedGroupId, groupState.groups]);

  // Memoized selected character
  const selectedCharacter = useMemo(() => {
    if (!chatState.selectedConversationId || !characters.length) return null;
    return characters.find((char: Character) => char.id === chatState.selectedConversationId) || null;
  }, [chatState.selectedConversationId, characters]);

  const characterToUse = useMemo(() => 
    chatState.fallbackCharacter || selectedCharacter, 
    [chatState.fallbackCharacter, selectedCharacter]
  );

  // ===== 自动存档 + 导出 =====
  const isAutoSavingRef = React.useRef(false);
  useEffect(() => {
    const runAutosave = async () => {
      if (isAutoSavingRef.current) return;
      const convoId = chatState.selectedConversationId;
      const char = characterToUse;
      const msgCount = chatState.messages.length;
      if (!convoId || !char || msgCount === 0) return;

      try {
        const enabledStr = await AsyncStorage.getItem(`autosave:${convoId}:enabled`);
        if (enabledStr !== 'true') return;
        const intervalStr = await AsyncStorage.getItem(`autosave:${convoId}:interval`);
        const interval = Math.max(1, parseInt(intervalStr || '20', 10) || 20);
        const lastCountStr = await AsyncStorage.getItem(`autosave:${convoId}:lastCount`);
        const lastCount = parseInt(lastCountStr || '0', 10) || 0;

        if (msgCount > lastCount && msgCount % interval === 0) {
          isAutoSavingRef.current = true;
          try {
            const description = `自动存档（${msgCount}条消息）`;
            const save = await chatSaveService.saveChat(
              convoId,
              char.id,
              char.name,
              chatState.messages,
              description,
              (char as any)?.profileImageUrl
            );
            await AsyncStorage.setItem(`autosave:${convoId}:lastCount`, String(msgCount));
            // 静默导出
            await chatExportService.exportChatSaveSilently(save);
          } catch (e) {
            // 不中断主流程
            console.warn('[ChatPage] 自动存档失败:', e);
          } finally {
            isAutoSavingRef.current = false;
          }
        }
      } catch (e) {
        // ignore
      }
    };

    runAutosave();
  }, [chatState.selectedConversationId, characterToUse, chatState.messages.length]);

  // 未读消息计数（仅当前会话）
  const [unreadForThisConversation, setUnreadForThisConversation] = useState<number>(0);

  // 加载该会话未读计数
  useEffect(() => {
    const loadUnread = async () => {
      try {
        if (!chatState.selectedConversationId) { setUnreadForThisConversation(0); return; }
        const mapStr = await AsyncStorage.getItem('unreadPerConversation');
        if (mapStr) {
          const map = JSON.parse(mapStr) as Record<string, number>;
          setUnreadForThisConversation(map[chatState.selectedConversationId] || 0);
        } else {
          setUnreadForThisConversation(0);
        }
      } catch { setUnreadForThisConversation(0); }
    };
    loadUnread();
  }, [chatState.selectedConversationId]);

  // Effect to automatically load messages when conversation changes
  useEffect(() => {
    const loadMessages = async () => {
      if (chatState.selectedConversationId) {
        await chatActions.refreshMessages();
      } else {
        chatActions.setMessages([]);
      }
    };

    loadMessages();
  }, [chatState.selectedConversationId]);

  // 监听角色数据更新（如开场白变更）并刷新消息
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('chatHistoryChanged', async (payload: any) => {
      try {
        if (!payload || !payload.conversationId) return;
        if (payload.conversationId !== chatState.selectedConversationId) return;
        await chatActions.refreshMessages();
      } catch {}
    });
    return () => {
      try { sub.remove(); } catch {}
    };
  }, [chatState.selectedConversationId, chatActions]);

  // 监听角色图片更新事件
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('characterImageUpdated', (payload: any) => {
      try {
        if (!payload || !payload.characterId) return;
        if (payload.characterId !== chatState.selectedConversationId) return;
        
        console.log('[ChatPage] Character image updated, forcing background refresh');
        
        // 强制触发背景图片重新渲染
        backgroundActions.setVideoReady(false);
        setTimeout(() => {
          backgroundActions.setVideoReady(true);
        }, 100);
        
        // 不需要强制更新，background会自动重新渲染
      } catch (e) {
        console.error('[ChatPage] Error handling character image update:', e);
      }
    });
    
    return () => {
      try { sub.remove(); } catch {}
    };
  }, [chatState.selectedConversationId, backgroundActions, performanceActions]);

  // Auto message hook with optimized dependencies
  const { autoMessageService } = useAutoMessage({
    selectedCharacter: characterToUse,
    selectedConversationId: chatState.selectedConversationId,
    userId: user?.id || null,
    messages: chatState.messages,
    isPageVisible: performanceState.isPageVisible,
    addMessage: async (conversationId: string, message: Message) => {
      await addMessage(conversationId, message);
    },
    updateUnreadMessagesCount: async (delta: number) => {
      try {
        const convoId = chatState.selectedConversationId;
        if (!convoId) return;
        // 如果当前页面可见，视为已读，不累计
        if (performanceState.isPageVisible) {
          // 清零该会话
          const mapStr = await AsyncStorage.getItem('unreadPerConversation');
          const map = mapStr ? JSON.parse(mapStr) as Record<string, number> : {};
          if (map[convoId]) {
            const totalStr = await AsyncStorage.getItem('unreadMessagesCount');
            const total = parseInt(totalStr || '0', 10) || 0;
            const newTotal = Math.max(0, total - (map[convoId] || 0));
            map[convoId] = 0;
            setUnreadForThisConversation(0);
            await AsyncStorage.setItem('unreadPerConversation', JSON.stringify(map));
            await AsyncStorage.setItem('unreadMessagesCount', String(newTotal));
            EventRegister.emit('unreadMessagesUpdated', newTotal);
          }
          return;
        }

        // 累计该会话未读
        const mapStr = await AsyncStorage.getItem('unreadPerConversation');
        const map = mapStr ? JSON.parse(mapStr) as Record<string, number> : {};
        map[convoId] = (map[convoId] || 0) + (delta || 1);
        setUnreadForThisConversation(map[convoId]);
        await AsyncStorage.setItem('unreadPerConversation', JSON.stringify(map));

        // 同步总未读到 Tab 角标
        const totalStr = await AsyncStorage.getItem('unreadMessagesCount');
        const total = parseInt(totalStr || '0', 10) || 0;
        const newTotal = total + (delta || 1);
        await AsyncStorage.setItem('unreadMessagesCount', String(newTotal));
        EventRegister.emit('unreadMessagesUpdated', newTotal);
      } catch (e) {
        console.warn('更新未读消息计数失败:', e);
      }
    },
    handleMessagesRefresh: async (conversationId: string) => {
      await chatActions.loadMessages(conversationId);
    },
  });

  // TopBar callback handlers
  const handleAvatarPress = useCallback(() => {
    if (uiState.isPreviewMode) {
      chatActions.setPreviewMessages(null);
      chatActions.setCurrentPreviewSave(null);
      uiActions.togglePreviewMode();
      uiActions.setPreviewBannerVisible(false);
    } else {
      if (chatState.selectedConversationId) {
        router.push(`/pages/character-detail?id=${characterToUse.id}`);
      }
    }
  }, [uiState.isPreviewMode, chatState.selectedConversationId, router, chatActions, uiActions]);

  const handleMemoPress = useCallback(() => {
    uiActions.toggleMemoSheet();
  }, [uiActions]);

  const handleSettingsPress = useCallback(() => {
    uiActions.toggleSettingsSidebar();
  }, [uiActions]);

  const handleBackPress = useCallback(() => {
    router.back();
  }, [router]);

  const handleSaveManagerPress = useCallback(() => {
    uiActions.toggleSaveManager();
  }, [uiActions]);

  const handleGroupSettingsPress = useCallback(() => {
    uiActions.toggleGroupSettings();
  }, [uiActions]);

  // Save/Load system callbacks
  const handlePreviewSave = useCallback((save: any) => {
    if (!uiState.isPreviewMode) {
      chatActions.setPreviewMessages(chatState.messages);
    }
    
    uiActions.togglePreviewMode();
    chatActions.setCurrentPreviewSave(save);
    chatActions.setMessages(save.messages);
    uiActions.toggleSaveManager();
    uiActions.setPreviewBannerVisible(true);
  }, [chatState.messages, uiState.isPreviewMode, chatActions, uiActions]);

  const exitPreviewMode = useCallback(async () => {
    if (uiState.isPreviewMode && chatState.previewMessages) {
      chatActions.setMessages(chatState.previewMessages);
      chatActions.setPreviewMessages(null);
      chatActions.setCurrentPreviewSave(null);
      uiActions.togglePreviewMode();
      uiActions.setPreviewBannerVisible(false);
      
      await chatActions.refreshMessages();
    }
  }, [uiState.isPreviewMode, chatState.previewMessages, chatActions, uiActions]);

  const handleLoadSave = useCallback(async (save: any) => {
    if (!chatState.selectedConversationId) return;
    
    try {
      await clearMessages(chatState.selectedConversationId);
      
      for (const message of save.messages) {
        await addMessage(chatState.selectedConversationId, message);
      }
      
      await exitPreviewMode();
      await chatActions.refreshMessages();
    } catch (error) {
      console.error('Failed to load save:', error);
      performanceActions.showTransientError('Failed to load save');
    }
  }, [chatState.selectedConversationId, clearMessages, addMessage, exitPreviewMode, chatActions, performanceActions]);

  const handleSaveCreated = useCallback((save: any) => {
    console.log('Save created:', save.name);
    performanceActions.showTransientError(`Save "${save.name}" created successfully`);
  }, [performanceActions]);

  // Video playback status handler
  const player = useVideoPlayer(
    (!groupState.isGroupMode && characterToUse?.dynamicPortraitEnabled && characterToUse?.dynamicPortraitVideo)
      ? characterToUse.dynamicPortraitVideo
      : null,
    (p) => {
      // 背景视频：静音、循环、自动播放、无通知
      try {
        p.loop = true;
        p.muted = true;
        p.showNowPlayingNotification = false;
        p.staysActiveInBackground = false;
        p.timeUpdateEventInterval = 0;
        p.play();
      } catch (e) {
        // no-op
      }
    }
  );

  // Reset ready/error when source changes
  useEffect(() => {
    backgroundActions.setVideoReady(false);
    backgroundActions.setVideoError(null);
  }, [characterToUse?.dynamicPortraitVideo]);

  // Listen for status changes to set ready/error
  useEventListener(player, 'statusChange', ({ status, error }) => {
    if (status === 'readyToPlay') {
      backgroundActions.setVideoReady(true);
    } else if (status === 'error') {
      backgroundActions.setVideoError(error?.message || '视频播放错误');
    }
  });

  // Message sending handler
  const handleSendMessage = useCallback(async (text: string, sender: 'user' | 'bot' = 'user', isLoading?: boolean, metadata?: Record<string, any>): Promise<string> => {
    if (!chatState.selectedConversationId || !characterToUse) {
      return '';
    }

    if (metadata?.updateExisting && metadata?.targetMessageId) {
      const targetId = String(metadata.targetMessageId);
      
      const updated = chatState.messages.map(m => {
        if (m.id === targetId) {
          return {
            ...m,
            text: metadata.isStreaming !== false ? (m.text + text) : text,
            isLoading: metadata.isStreaming !== false ? isLoading : false,
            status: metadata.isStreaming !== false ? ('sending' as const) : ('sent' as const)
          };
        }
        return m;
      });
      
      chatActions.setMessages(updated);

      if (metadata?.isStreaming === false) {
        try {
          await addMessage(chatState.selectedConversationId, updated.find(m => m.id === targetId));
        } catch (error) {
          console.error('Failed to persist streamed message:', error);
        }
      }

      return targetId;
    }

    if (sender === 'user' && chatState.isSendingMessage) {
      return '';
    }

    if (sender === 'user') {
      chatActions.setIsSendingMessage(true);
    }
    
    const message: Message = {
      id: Date.now().toString(),
      text,
      sender,
      timestamp: Date.now(),
      isLoading: !!isLoading,
      status: metadata?.status || (sender === 'user' ? 'sending' : 'sent'),
      ...(metadata && { metadata }),
    };

    chatActions.addMessageOptimistically(message);
    
    try {
      await addMessage(chatState.selectedConversationId, message);
      
      if (sender === 'user') {
        chatActions.updateMessageStatus(message.id, 'sent');
      }
      
      if (sender === 'user') {
        autoMessageService.onUserMessage(characterToUse.id);
      }
      
      return message.id;
    } catch (error) {
      console.error('Failed to send message:', error);
      performanceActions.showTransientError('Failed to send message');
      
      chatActions.removeMessageOptimistically(message.id);
      return '';
    } finally {
      if (sender === 'user') {
        chatActions.setIsSendingMessage(false);
      }
    }
  }, [
    chatState.selectedConversationId,
    characterToUse,
    chatState.isSendingMessage,
    chatActions,
    addMessage,
    autoMessageService,
    performanceActions,
    chatState.messages
  ]);

  const handleMessageSendFailed = useCallback((messageId: string, error: string) => {
    console.log(`[ChatPage] Message ${messageId} failed: ${error}`);
    chatActions.updateMessageStatus(messageId, 'error', error);
    performanceActions.showTransientError(`发送失败: ${error}`);
  }, [chatActions, performanceActions]);

  const handleRegenerateMessage = useCallback(async (messageId: string) => {
    // 这个函数实际上不应该执行重新生成逻辑
    // 重新生成是通过 ChatDialog 内的 useChatMessages hook 中的 RewriteOpinionModal 处理的
    // 这里只需要做简单的状态管理
    console.log('[ChatPage] handleRegenerateMessage called for:', messageId);
    // 不要设置 regeneratingMessageId，让 ChatDialog 内部自己管理
  }, []);

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    if (!chatState.selectedConversationId) return;
    
    try {
      await removeMessage(chatState.selectedConversationId, messageId);
      await chatActions.refreshMessages();
    } catch (error) {
      console.error('Failed to delete message:', error);
      performanceActions.showTransientError('Failed to delete message');
    }
  }, [chatState.selectedConversationId, removeMessage, chatActions, performanceActions]);

  const handleScrollPositionChange = useCallback((characterId: string, position: number) => {
    chatActions.updateScrollPosition(characterId, position);
  }, [chatActions]);

  const handleResetConversation = useCallback(async () => {
    if (!chatState.selectedConversationId) return;
    
    try {
      await clearMessages(chatState.selectedConversationId);
      await chatActions.refreshMessages();
    } catch (error) {
      console.error('Failed to reset conversation:', error);
      performanceActions.showTransientError('Failed to reset conversation');
    }
  }, [chatState.selectedConversationId, clearMessages, chatActions, performanceActions]);

  // Get current scroll position
  const currentScrollPosition = useMemo(() => {
    return chatState.selectedConversationId 
      ? chatState.chatScrollPositions[chatState.selectedConversationId] || 0
      : 0;
  }, [chatState.selectedConversationId, chatState.chatScrollPositions]);

  // Filtered messages for display
  const filteredMessages = useMemo(() => {
    // Always exclude circle-interaction messages from private chat
    const base = chatState.messages.filter(
      (msg) => !(msg.metadata?.isCircleInteraction || msg.metadata?.iscircleinteraction)
    );

    if (!performanceState.isPageVisible || !base.length) {
      return base;
    }

    // When page is visible, further exclude auto-message input and continue messages from user
    return base.filter((msg) => {
      if (
        msg.sender === 'user' &&
        (msg.metadata?.isAutoMessageInput === true ||
          msg.metadata?.isContinue === true ||
          (chatState.autoMessageInputText && msg.text === chatState.autoMessageInputText))
      ) {
        return false;
      }
      return true;
    });
  }, [chatState.messages, chatState.autoMessageInputText, performanceState.isPageVisible]);

  // 响应式接收 TopBar 实际高度
  const [topBarHeight, setTopBarHeight] = useState<number>(48);

  if (charactersLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" translucent={false} backgroundColor="#000000" />
      
      {/* Dynamic Background Container */}
      <View style={styles.backgroundContainer}>
        {!groupState.isGroupMode && characterToUse?.dynamicPortraitEnabled && characterToUse?.dynamicPortraitVideo ? (
          <>
            <VideoView
              player={player}
              style={styles.backgroundVideo}
              contentFit="cover"
              nativeControls={false}
              allowsFullscreen={false}
              allowsPictureInPicture={false}
              showsTimecodes={false}
              requiresLinearPlayback
              useExoShutter={false}
              // 首帧渲染后隐藏加载蒙层
              onFirstFrameRender={() => backgroundActions.setVideoReady(true)}
              pointerEvents="none"
            /> 
            
            {!backgroundState.isVideoReady && !backgroundState.videoError && (
              <View style={styles.videoLoadingContainer}>
                <ActivityIndicator size="large" color="#ffffff" />
                <Text style={styles.videoLoadingText}>加载动态立绘中...</Text>
              </View>
            )}
            
            {backgroundState.videoError && (
              <View style={styles.videoErrorContainer}>
                <ImageBackground
                  source={backgroundActions.getBackgroundImage(characterToUse)}
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
            source={groupState.isGroupMode 
              ? backgroundActions.getGroupBackgroundImage(selectedGroup)
              : backgroundActions.getBackgroundImage(characterToUse)}
            style={styles.backgroundImage}
            resizeMode="cover"
          >
            <View style={{flex: 1}} />
          </ImageBackground>
        )}
      </View>
      
      {user && (
        <>
          {/* Preview Banner */}
          {uiState.isPreviewMode && uiState.previewBannerVisible && (
            <View style={styles.previewBanner}>
              <Text style={styles.previewBannerText}>
                {chatState.currentPreviewSave ? `预览存档: ${(chatState.currentPreviewSave as any).name || '未命名'}` : '预览模式'}
              </Text>
              <View style={styles.previewBannerButtons}>
                <TouchableOpacity
                  style={[styles.previewBannerButton, styles.restoreButton]}
                  onPress={exitPreviewMode}
                >
                  <Text style={styles.previewBannerButtonText}>恢复</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.previewBannerButton}
                  onPress={() => uiActions.setPreviewBannerVisible(false)}
                >
                  <Text style={styles.previewBannerButtonText}>继续</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          
          {/* Top Bar */}
          <TopBarWithBackground
            selectedCharacter={characterToUse}
            selectedGroup={selectedGroup}
            onAvatarPress={handleAvatarPress}
            onMemoPress={handleMemoPress}
            onSettingsPress={handleSettingsPress}
            onMenuPress={handleBackPress} // 使用返回功能
            onSaveManagerPress={handleSaveManagerPress}
            onGroupSettingsPress={handleGroupSettingsPress}
            currentUser={user}
            unreadBadgeCount={unreadForThisConversation}
            onHeightChange={setTopBarHeight}
          />
          
          {/* Main Content */}
          <View style={[
            styles.mainContent,
            isKeyboardVisible && Platform.OS === 'android' && {
              marginBottom: Math.max(0, keyboardHeight - 150) // 为Android设备在键盘弹出时添加额外边距
            }
          ]}>
            <ChatInterface
              conversationId={chatState.selectedConversationId || ''}
              selectedCharacter={characterToUse}
              user={user}
              messages={filteredMessages}
              onSendMessage={handleSendMessage}
              onMessageSendFailed={handleMessageSendFailed}
              onRegenerateMessage={handleRegenerateMessage}
              onDeleteMessage={handleDeleteMessage}
              onScrollPositionChange={handleScrollPositionChange}
              onResetConversation={handleResetConversation}
              scrollPosition={currentScrollPosition}
              regeneratingMessageId={chatState.regeneratingMessageId}
              isSendingMessage={chatState.isSendingMessage}
              isKeyboardVisible={isKeyboardVisible}
              topBarHeight={topBarHeight}
              onLoadMore={chatActions.loadMoreMessages}
              loadingMore={chatState.isLoadingMore}
              hasMore={chatState.hasMoreMessages}
              onRequestRefresh={chatActions.refreshMessages}
              suppressAutoScroll={
                uiState.isMemoSheetVisible ||
                uiState.isSaveManagerVisible ||
                uiState.isSettingsSidebarVisible ||
                uiState.groupSettingsSidebarVisible
              }
            />
          </View>
        </>
      )}

      {/* Error display */}
      {performanceState.transientError && (
        <View style={styles.errorContainer}>
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{performanceState.transientError}</Text>
          </View>
        </View>
      )}

      {/* Save Manager Modal */}
      <SaveManager
        visible={uiState.isSaveManagerVisible}
        onClose={() => uiActions.toggleSaveManager()}
        conversationId={chatState.selectedConversationId || ''}
        characterId={characterToUse?.id || ''}
        characterName={characterToUse?.name || ''}
        characterAvatar={characterToUse?.profileImageUrl}
        messages={chatState.messages}
        onSaveCreated={handleSaveCreated}
        onLoadSave={handleLoadSave}
        onPreviewSave={handlePreviewSave}
        firstMes={characterToUse?.first_mes}
      />

      {/* Memo Overlay */}
      <MemoOverlay
        isVisible={uiState.isMemoSheetVisible}
        onClose={uiActions.toggleMemoSheet}
        characterId={characterToUse?.id}
        conversationId={chatState.selectedConversationId || undefined}
        customUserName={characterToUse?.customUserName}
      />

      {/* Settings Sidebar */}
      <SettingsSidebar
        isVisible={uiState.isSettingsSidebarVisible}
        onClose={uiActions.toggleSettingsSidebar}
        selectedCharacter={selectedCharacter}
        animationValue={settingsSlideAnim}
      />

      {/* Group Settings Sidebar */}
      <GroupSettingsSidebar
        isVisible={uiState.groupSettingsSidebarVisible}
        onClose={uiActions.toggleGroupSettings}
        animationValue={groupSettingsSidebarAnim}
        selectedGroup={selectedGroup}
        currentUser={user}
        onGroupBackgroundChanged={(groupId: string, newBackground: string | undefined) => {
          backgroundActions.setGroupBackground(groupId, newBackground);
        }}
        onGroupDisbanded={groupActions.handleGroupDisbanded}
      />
    </SafeAreaView>
  );
});

ChatPage.displayName = 'ChatPage';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  mainContent: {
    flex: 1,
    zIndex: 10,
  },
  errorContainer: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    zIndex: 999,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  errorBox: {
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
  errorText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
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
});

export default ChatPage;
