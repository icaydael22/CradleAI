import React, { memo, useCallback, useMemo, useState, useEffect } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import ChatDialog from '@/components/ChatDialog';
import ChatInput from '@/components/ChatInput';
import { Message, Character, User } from '@/shared/types';
import { EventRegister } from 'react-native-event-listeners';
import { useCacheCleanup } from '@/hooks/useCacheCleanup';

interface ChatInterfaceProps {
  messages: Message[];
  selectedCharacter: Character | null;
  user?: User | null; 
  regeneratingMessageId: string | null;
  isSendingMessage: boolean;
  isKeyboardVisible: boolean;
  conversationId: string | null;
  onSendMessage: (text: string, sender: 'user' | 'bot', isLoading?: boolean, metadata?: Record<string, any>) => Promise<string> | void;
  onMessageSendFailed?: (messageId: string, error: string) => void;
  onRegenerateMessage: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onScrollPositionChange: (characterId: string, position: number) => void;
  onResetConversation: () => void;
  scrollPosition: number;
  topBarHeight?: number; // Add topBarHeight prop
  // Pagination props
  onLoadMore?: () => void;
  loadingMore?: boolean;
  hasMore?: boolean;
  // 请求刷新消息（编辑/删除/重新生成后）
  onRequestRefresh?: () => void;
  // 当外层出现覆盖层/侧栏等时抑制自动滚动
  suppressAutoScroll?: boolean;
}

const ChatInterface = memo<ChatInterfaceProps>(({
  messages,
  selectedCharacter,
  user, 
  regeneratingMessageId,
  isSendingMessage,
  isKeyboardVisible,
  conversationId,
  onSendMessage,
  onMessageSendFailed,
  onRegenerateMessage,
  onDeleteMessage,
  onScrollPositionChange,
  onResetConversation,
  scrollPosition,
  topBarHeight = 0,
  onLoadMore,
  loadingMore,
  hasMore,
  onRequestRefresh,
  suppressAutoScroll,
}) => {
  // Initialize cache cleanup hook for performance
  useCacheCleanup();
  
  const [isHistoryModalVisible, setHistoryModalVisible] = useState(false);
  // 添加动态顶部栏高度状态
  const [dynamicTopBarHeight, setDynamicTopBarHeight] = useState(topBarHeight);
  const [isTopBarVisible, setIsTopBarVisible] = useState(true);

  // 从角色设置中获取段落模式状态
  const paragraphModeEnabled = selectedCharacter?.paragraphModeEnabled === true;

  // 监听顶部栏可见性变化事件
  useEffect(() => {
    const toggleListener = EventRegister.addEventListener('toggleTopBarVisibility', (visible: boolean) => {
      console.log('[ChatInterface] TopBar visibility changed:', visible);
      setIsTopBarVisible(visible);
      // 如果隐藏顶部栏，将高度设为0；如果显示，使用传入的topBarHeight
      setDynamicTopBarHeight(visible ? topBarHeight : 0);
    });

    // 监听顶部栏高度变化事件
    const heightListener = EventRegister.addEventListener('topBarHeightChanged', (height: number) => {
      console.log('[ChatInterface] TopBar height changed:', height);
      if (isTopBarVisible) {
        setDynamicTopBarHeight(height);
      }
    });

    // 监听段落模式变化事件
    const paragraphListener = EventRegister.addEventListener('paragraphModeToggled', (enabled: boolean) => {
      console.log('[ChatInterface] Paragraph mode toggled:', enabled);
      // Note: We now read paragraph mode from character data instead of state
      // This listener is kept for potential future use or debugging
    });

    return () => {
      EventRegister.removeEventListener(toggleListener as string);
      EventRegister.removeEventListener(heightListener as string);
      EventRegister.removeEventListener(paragraphListener as string);
    };
  }, [topBarHeight, isTopBarVisible]);

  // 当传入的topBarHeight变化时，更新动态高度
  useEffect(() => {
    if (isTopBarVisible) {
      setDynamicTopBarHeight(topBarHeight);
    }
  }, [topBarHeight, isTopBarVisible]);

  const handleSendMessage = useCallback((text: string, sender: 'user' | 'bot' = 'user', isLoading?: boolean, metadata?: Record<string, any>) => {
    if (text.trim() && !isSendingMessage) {
      onSendMessage(text, sender, isLoading, metadata);
    }
  }, [onSendMessage, isSendingMessage]);

  const memoizedMessages = useMemo(() => messages, [messages]);

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { paddingTop: dynamicTopBarHeight }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      enabled={true}
    >
      <View style={styles.chatContainer}>
        <ChatDialog
          messages={memoizedMessages}
          selectedCharacter={selectedCharacter} // 传递selectedCharacter
          user={user} // 传递user
          regeneratingMessageId={regeneratingMessageId}
          onRegenerateMessage={onRegenerateMessage}
          onDeleteAiMessage={onDeleteMessage}
          onScrollPositionChange={onScrollPositionChange}
          conversationId={conversationId || ''}
          onLoadMore={onLoadMore}
          loadingMore={loadingMore}
          hasMore={hasMore}
          isHistoryModalVisible={isHistoryModalVisible}
          setHistoryModalVisible={setHistoryModalVisible}
          // Ensure list stability and auto scroll behavior on conversation change
          shouldScrollToBottom
          onRequestRefresh={onRequestRefresh}
          suppressAutoScroll={!!suppressAutoScroll || isHistoryModalVisible}
          paragraphModeEnabled={paragraphModeEnabled}
        />
      </View>
      
      <View style={[
        styles.inputContainer,
        isKeyboardVisible && styles.inputContainerKeyboard
      ]}>
        {conversationId && selectedCharacter && (
          <ChatInput
            onSendMessage={handleSendMessage}
            onMessageSendFailed={onMessageSendFailed}
            selectedConversationId={conversationId}
            conversationId={conversationId}
            onResetConversation={onResetConversation}
            selectedCharacter={selectedCharacter}
            onShowFullHistory={() => setHistoryModalVisible(true)}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
});

ChatInterface.displayName = 'ChatInterface';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chatContainer: {
    flex: 1,
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 20 : 16,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  inputContainerKeyboard: {
    paddingBottom: Platform.OS === 'ios' ? 16 : 12, // 键盘弹出时减少底部填充
    paddingTop: 6,
    marginBottom: Platform.OS === 'android' ? 20 : 4, // 为Android添加额外边距，iOS也稍微增加
  },
});

export default ChatInterface;
 