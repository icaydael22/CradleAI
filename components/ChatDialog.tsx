import React, { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Modal,
  FlatList,
  Platform,
  DeviceEventEmitter,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  FadeIn,
} from 'react-native-reanimated';

// Import types
import { Message, ChatDialogProps, User, Character } from '@/shared/types';
import { ChatUISettings } from '@/app/pages/chat-ui-settings';

// Import components
import MessageItem from '@/components/message-renderers/MessageItem';
import VisualNovelDialog from '@/components/dialog-modes/VisualNovelDialog';
import ChatHistoryModal from '@/components/ChatHistoryModal';
import ImageViewer from '@/components/ImageViewer';
import TextEditorModal from '@/components/common/TextEditorModal';
import RewriteOpinionModal from '@/components/RewriteOpinionModal';

// Import hooks
import { useChatUI } from '@/hooks/useChatUI';
import { useChatMessages } from '@/hooks/useChatMessages';
import { useChatImages } from '@/hooks/useChatImages';
import { useChatAudio } from '@/hooks/useChatAudio';

// Import utilities
import ChatUISettingsManager from '@/utils/ChatUISettingsManager';
import { useDialogMode } from '@/constants/DialogModeContext';
import { EventRegister } from 'react-native-event-listeners';

const { width, height } = Dimensions.get('window');
const MAX_WIDTH = Math.min(width * 0.88, 500);
const MIN_PADDING = 8;
const RESPONSIVE_PADDING = Math.max(MIN_PADDING, width * 0.02);
const MAX_IMAGE_HEIGHT = Math.min(300, height * 0.4);
const AVATAR_SIZE = Math.max(Math.min(width * 0.075, 30), 24);
const BUTTON_SIZE = width < 360 ? 28 : 32;

// Default UI settings
const DEFAULT_UI_SETTINGS: ChatUISettings = {
  regularUserBubbleColor: 'rgb(255, 224, 195)',
  regularUserBubbleAlpha: 0.95,
  regularBotBubbleColor: 'rgb(68, 68, 68)',
  regularBotBubbleAlpha: 0.85,
  regularUserTextColor: '#333333',
  regularBotTextColor: '#ffffff',
  bgUserBubbleColor: 'rgb(255, 224, 195)',
  bgUserBubbleAlpha: 0.95,
  bgBotBubbleColor: 'rgb(68, 68, 68)',
  bgBotBubbleAlpha: 0.9,
  bgUserTextColor: '#333333',
  bgBotTextColor: '#ffffff',
  vnDialogColor: 'rgb(0, 0, 0)',
  vnDialogAlpha: 0.7,
  vnTextColor: '#ffffff',
  bubblePaddingMultiplier: 1.0,
  textSizeMultiplier: 1.0,
  markdownHeadingColor: '#ff79c6',
  markdownCodeBackgroundColor: '#111',
  markdownCodeTextColor: '#fff',
  markdownQuoteColor: '#d0d0d0',
  markdownQuoteBackgroundColor: '#111',
  markdownLinkColor: '#3498db',
  markdownBoldColor: '#ff79c6',
  markdownTextColor: '#fff',
  markdownTextScale: 1.0,
  markdownCodeScale: 1.0,
  narrationBubbleColor: 'rgb(255, 215, 0)',
  narrationBubbleAlpha: 0.8,
  narrationTextColor: 'rgb(51, 51, 51)',
  narrationBubbleRoundness: 1.0,
  narrationBubblePaddingMultiplier: 1.2,
};

// Hook to load UI settings
function useChatUISettings() {
  const [settings, setSettings] = useState<ChatUISettings>(DEFAULT_UI_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const manager = ChatUISettingsManager.getInstance();
      const loaded = await manager.loadSettings();
      setSettings({ ...DEFAULT_UI_SETTINGS, ...loaded });
      setIsLoaded(true);
    } catch (error) {
      console.error('Failed to load UI settings:', error);
      setSettings(DEFAULT_UI_SETTINGS);
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    
    // Listen for settings changes
    const subscription = Platform.select({
      default: () => {
        const listener = (newSettings: ChatUISettings) => {
          setSettings({ ...DEFAULT_UI_SETTINGS, ...newSettings });
        };
        // DeviceEventEmitter is not available in React Native Web
        if (typeof DeviceEventEmitter !== 'undefined') {
          DeviceEventEmitter.addListener('chatUISettingsChanged', listener);
          return () => DeviceEventEmitter.removeAllListeners('chatUISettingsChanged');
        }
        return () => {};
      }
    });

    return subscription?.();
  }, [loadSettings]);

  return { settings, isLoaded };
}

// Generated image interface
interface GeneratedImage {
  id: string;
  prompt: string;
  timestamp: number;
}

// Extended props interface
interface ExtendedChatDialogProps extends ChatDialogProps {
  conversationId: string;
  messageMemoryState?: Record<string, string>;
  regeneratingMessageId?: string | null;
  user?: User | null;
  isHistoryModalVisible?: boolean;
  setHistoryModalVisible?: (visible: boolean) => void;
  onShowFullHistory?: () => void;
  onEditAiMessage?: (messageId: string, aiIndex: number, newContent: string) => void;
  onDeleteAiMessage?: (messageId: string, aiIndex: number) => void;
  onEditUserMessage?: (messageId: string, messageIndex: number, newContent: string) => void;
  onDeleteUserMessage?: (messageId: string, messageIndex: number) => void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  hasMore?: boolean;
  generatedImages?: GeneratedImage[];
  onDeleteGeneratedImage?: (imageId: string) => void;
  shouldScrollToBottom?: boolean;
  onScrollToBottomComplete?: () => void;
  // 通知父级刷新消息（编辑/删除/重新生成成功后）
  onRequestRefresh?: () => void;
  // 抑制自动滚动（当外层出现覆盖层/侧栏等）
  suppressAutoScroll?: boolean;
  // 段落模式开关
  paragraphModeEnabled?: boolean;
}

// Combined item interface for FlatList
interface CombinedItem {
  id: string;
  type: 'message' | 'image' | 'loading';
  message?: Message;
  image?: GeneratedImage;
  timestamp: number;
  order?: number; // Add order field for maintaining sequence
}

// Loading indicator component
const LoadingIndicator = memo(function LoadingIndicator({ 
  isRegenerating = false 
}: { 
  isRegenerating?: boolean 
}) {
  const dot1Scale = useSharedValue(1);
  const dot2Scale = useSharedValue(1);
  const dot3Scale = useSharedValue(1);

  useEffect(() => {
    const animate = () => {
      dot1Scale.value = withSequence(
        withTiming(1.5, { duration: 400 }),
        withTiming(1, { duration: 400 })
      );
      dot2Scale.value = withSequence(
        withTiming(1, { duration: 200 }),
        withTiming(1.5, { duration: 400 }),
        withTiming(1, { duration: 400 })
      );
      dot3Scale.value = withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(1.5, { duration: 400 }),
        withTiming(1, { duration: 400 })
      );
    };

    const interval = setInterval(animate, 1200);
    animate();

    return () => clearInterval(interval);
  }, []);

  const dot1Style = useAnimatedStyle(() => ({
    transform: [{ scale: dot1Scale.value }],
  }));

  const dot2Style = useAnimatedStyle(() => ({
    transform: [{ scale: dot2Scale.value }],
  }));

  const dot3Style = useAnimatedStyle(() => ({
    transform: [{ scale: dot3Scale.value }],
  }));

  return (
    <Animated.View 
      entering={FadeIn.duration(300)}
      style={styles.loadingContainer}
    >
      <View style={styles.loadingContent}>
        <View style={styles.loadingDots}>
          <Animated.View style={[styles.dot, dot1Style]} />
          <Animated.View style={[styles.dot, dot2Style]} />
          <Animated.View style={[styles.dot, dot3Style]} />
        </View>
        <Text style={styles.loadingText}>
          {isRegenerating ? '重新生成中...' : 'AI正在思考...'}
        </Text>
      </View>
    </Animated.View>
  );
});

// Scroll to bottom button component
const ScrollToBottomButton = memo(function ScrollToBottomButton({
  onPress,
  style
}: {
  onPress: () => void;
  style?: any;
}) {
  return (
    <TouchableOpacity
      style={[styles.scrollToBottomButton, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons name="chevron-down" size={24} color="#fff" />
    </TouchableOpacity>
  );
});

// Main ChatDialog component
const ChatDialog: React.FC<ExtendedChatDialogProps> = ({
  conversationId,
  messages,
  style,
  selectedCharacter,
  onRegenerateMessage,
  onScrollPositionChange,
  regeneratingMessageId = null,
  user = null,
  isHistoryModalVisible = false,
  setHistoryModalVisible,
  onEditAiMessage,
  onDeleteAiMessage,
  onEditUserMessage,
  onDeleteUserMessage,
  onLoadMore,
  loadingMore,
  hasMore,
  generatedImages = [],
  onDeleteGeneratedImage,
  onScrollToBottomComplete,
  shouldScrollToBottom,
  onRequestRefresh,
  suppressAutoScroll,
  paragraphModeEnabled = false,
}) => {
  const insets = useSafeAreaInsets();
  const { mode } = useDialogMode();
  const { settings: uiSettings, isLoaded: uiSettingsLoaded } = useChatUISettings();
  // 解决重新生成后偶发的 FlatList 冻结：通过 bump key 与微滚动唤醒
  const [listBump, setListBump] = useState(0);
  const prevRegenRef = useRef<string | null>(null);
  
  // 视觉小说模式展开状态
  const [vnExpanded, setVnExpanded] = useState(false);

  // Debug: log the current mode
  console.log('[ChatDialog] Current dialog mode:', mode, 'paragraphModeEnabled:', paragraphModeEnabled);

  // 监听视觉小说展开状态变化，通知其他组件
  useEffect(() => {
    if (mode === 'visual-novel') {
      console.log('[ChatDialog] Visual novel expanded state changed:', vnExpanded);
      EventRegister.emit('visualNovelExpandedChanged', vnExpanded);
    }
  }, [vnExpanded, mode]);

  // Initialize hooks
  const {
    uiState,
    flatListRef,
    handleFlatListScroll,
    scrollToBottom,
  } = useChatUI({
    onScrollToBottomComplete,
    messages,
    conversationId,
    shouldScrollToBottom,
    inverted: true,
    suppressAutoScroll,
  });

  // 监听重新生成状态变化：结束时重建列表并进行一次微滚动，唤醒滚动手势
  useEffect(() => {
    const prev = prevRegenRef.current;
    const curr = regeneratingMessageId || null;
    
    console.log('[ChatDialog] Regeneration state change:', { prev, curr });
    
    // 从有值 -> 空，表示重新生成结束
    if (prev && !curr) {
      console.log('[ChatDialog] Regeneration completed, refreshing FlatList to prevent freeze');
      
      // 先 bump 一次 key，强制 FlatList 重新挂载，避免 maintainVisibleContentPosition 与 inverted 的已知卡顿
      setListBump((n) => {
        console.log('[ChatDialog] Bumping FlatList key:', n + 1);
        return n + 1;
      });
      
      // 延迟更长时间，确保 FlatList 完全重新挂载后再进行微滚动
      setTimeout(() => {
        try {
          const ref: any = flatListRef.current;
          if (ref?.scrollToOffset) {
            console.log('[ChatDialog] Starting post-regeneration scroll wake-up sequence');
            // 执行两次微滚动，确保唤醒滚动状态机
            ref.scrollToOffset({ offset: 2, animated: false });
            setTimeout(() => {
              try {
                ref.scrollToOffset({ offset: 0, animated: true });
                // 再进行一次小幅度的滚动，确保彻底唤醒
                setTimeout(() => {
                  try {
                    ref.scrollToOffset({ offset: 1, animated: false });
                    setTimeout(() => {
                      ref.scrollToOffset({ offset: 0, animated: false });
                      console.log('[ChatDialog] Post-regeneration scroll wake-up sequence completed');
                    }, 16);
                  } catch {}
                }, 100);
              } catch {}
            }, 16);
          }
        } catch (error) {
          console.error('[ChatDialog] Error during post-regeneration scroll wake-up:', error);
        }
      }, 100); // 增加延迟时间，确保 FlatList 完全重新挂载
    }
    prevRegenRef.current = curr;
  }, [regeneratingMessageId, flatListRef]);

  const {
    handleCopyMessage,
    handleEditButton,
    handleDeleteButton,
    isEditModalVisible,
    editingMessage,
    handleEditModalSave,
    handleEditModalCancel,
    handleRegenerateButton,
    isRewriteModalVisible,
    regeneratingMessage,
    isRegenerating,
    handleRegenerateWithOpinion,
    handleRegenerateWithoutOpinion,
    handleCancelRegenerate,
  } = useChatMessages({
    conversationId,
    character: selectedCharacter,
    user,
    messages,
    // 统一刷新：忽略子返回的messages，由父级自行刷新
    onMessagesUpdate: () => {
      onRequestRefresh?.();
    },
    onEditAiMessage,
    onDeleteAiMessage,
    onEditUserMessage,
    onDeleteUserMessage,
    onRegenerateMessage,
  });

  const {
    fullscreenImage,
    handleOpenFullscreenImage,
    handleCloseFullscreenImage,
    handleSaveGeneratedImage,
    handleShareGeneratedImage,
    handleDeleteGeneratedImage,
  } = useChatImages({
    onDeleteGeneratedImage,
  });

  const { handleTTSPress, getAudioState } = useChatAudio({
    selectedCharacter,
    user,
  });

  // 处理消息渲染时间更新的回调
  const handleUpdateRenderedTime = useCallback((messageId: string, renderedAt: number) => {
    // 这里可以选择是否需要持久化渲染时间
    // 由于渲染时间主要用于UI显示，暂时不需要持久化到存储
    console.log(`[ChatDialog] Message ${messageId} rendered at ${new Date(renderedAt).toLocaleTimeString()}`);
  }, []);

  // Combine messages and images into a single list
  const combinedItems = useMemo((): CombinedItem[] => {
    const items: CombinedItem[] = [];
    
    // Add messages with order index to maintain proper sequence
    messages.forEach((message, index) => {
      items.push({
        id: `message-${message.id}`,
        type: 'message',
        message,
        timestamp: message.timestamp || Date.now(),
        order: index, // Use array index as order to maintain sequence
      });
    });

    // Add generated images
    generatedImages.forEach((image) => {
      items.push({
        id: `image-${image.id}`,
        type: 'image',
        image,
        timestamp: image.timestamp,
        order: 999999, // Put images at the end for now
      });
    });

    // Sort by order (messages maintain array order, images at end)
    // This ensures that within the same conversation, messages are displayed
    // in the order they appear in the messages array, not by timestamp
    items.sort((a, b) => (a.order || 0) - (b.order || 0));

    return items;
  }, [messages, generatedImages]);

  // Inverted chat data (newest at bottom, FlatList anchored at bottom)
  const invertedData = useMemo(() => combinedItems.slice().reverse(), [combinedItems]);

  // Separate loading indicator to avoid affecting combinedItems memo
  const showLoadingIndicator = !!regeneratingMessageId;

  // Render item for FlatList - moved before conditional rendering to ensure all hooks are called
  const renderItem = useCallback(({ item, index }: { item: CombinedItem; index: number }) => {
    // Map index to original order when needed
    if (item.type === 'message' && item.message) {
      const isUser = item.message.sender === 'user';
      
      return (
        <View style={styles.messageWrapper}>
            <MessageItem
            message={item.message}
            isUser={isUser}
            index={index}
            uiSettings={uiSettings}
            onImagePress={handleOpenFullscreenImage}
            onCopyMessage={handleCopyMessage}
            onEditMessage={(messageId, isUser) => handleEditButton(item.message!, isUser)}
            onDeleteMessage={(messageId, isUser) => handleDeleteButton(item.message!, isUser)}
              onRegenerateMessage={() => handleRegenerateButton(item.message!)}
            regeneratingMessageId={regeneratingMessageId}
            maxImageHeight={MAX_IMAGE_HEIGHT}
            user={user}
            selectedCharacter={selectedCharacter}
            onUpdateRenderedTime={handleUpdateRenderedTime}
            paragraphModeEnabled={paragraphModeEnabled && mode !== 'visual-novel'}
          />
          
          {/* Action buttons */}
          <View style={[styles.messageActions, isUser ? styles.userActions : styles.botActions]}>
            <TouchableOpacity
              style={[styles.actionButton, styles.darkActionButton]}
              onPress={() => handleCopyMessage(item.message!.text)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="copy-outline" size={16} color="#fff" />
            </TouchableOpacity>
            
            {!isUser && (
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.darkActionButton,
                  getAudioState(item.message!.id).isLoading && styles.loadingButton,
                  getAudioState(item.message!.id).isPlaying && styles.playingButton
                ]}
                onPress={() => handleTTSPress(item.message!)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {getAudioState(item.message!.id).isLoading ? (
                  <ActivityIndicator size={12} color="#fff" />
                ) : (
                  <Ionicons 
                    name={getAudioState(item.message!.id).isPlaying ? "pause-outline" : "volume-high-outline"} 
                    size={16} 
                    color="#fff" 
                  />
                )}
              </TouchableOpacity>
            )}
            
            {/* 编辑按钮 - 错误状态消息不显示 */}
            {item.message!.status !== 'error' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.darkActionButton]}
                onPress={() => handleEditButton(item.message!, isUser)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="create-outline" size={16} color="#fff" />
              </TouchableOpacity>
            )}
            
            {/* 删除按钮 - 错误状态消息不显示 */}
              {/* 仅对非用户消息显示删除按钮 - 错误状态消息不显示 */}
              {item.message!.status !== 'error' && !isUser && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.darkActionButton]}
                  onPress={() => handleDeleteButton(item.message!, isUser)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={16} color="#fff" />
                </TouchableOpacity>
              )}

            {/* 重新生成按钮 - 仅对非错误状态的AI消息显示 */}
            {!isUser && item.message!.status !== 'error' && (
              <TouchableOpacity
                style={[
                  styles.actionButton, 
                  styles.darkActionButton,
                  isRegenerating && regeneratingMessage?.id === item.message!.id && styles.loadingButton
                ]}
                onPress={() => handleRegenerateButton(item.message!)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={isRegenerating}
              >
                {isRegenerating && regeneratingMessage?.id === item.message!.id ? (
                  <ActivityIndicator size={12} color="#fff" />
                ) : (
                  <Ionicons name="refresh-outline" size={16} color="#fff" />
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    // Handle image items (to be implemented if needed)
    return null;
  }, [
    uiSettings,
    regeneratingMessageId,
    handleOpenFullscreenImage,
    handleCopyMessage,
    handleEditButton,
    handleDeleteButton,
    handleTTSPress,
    onRegenerateMessage,
    getAudioState,
  ]);

  // Render Visual Novel Mode after all hooks are called
  if (mode === 'visual-novel') {
    return (
      <View style={[styles.container, style]}>
        <VisualNovelDialog
          messages={messages}
          selectedCharacter={selectedCharacter}
          user={user}
          uiSettings={uiSettings}
          onImagePress={handleOpenFullscreenImage}
          style={style}
          topBarHeight={Platform.OS === 'ios' ? 88 : 64}
          inputHeight={80}
          onExpandedChange={setVnExpanded} // 新增：传递展开状态变化回调
        />
        
        {/* Image Viewer Modal */}
        {fullscreenImage && (
          <ImageViewer
            isVisible={!!fullscreenImage}
            images={[fullscreenImage]}
            initialIndex={0}
            onClose={handleCloseFullscreenImage}
          />
        )}

        {/* Text Editor Modal for message editing */}
        {isEditModalVisible && editingMessage && (
          <TextEditorModal
            isVisible={true}
            initialText={editingMessage.text}
            title="编辑消息"
            onSave={handleEditModalSave}
            onClose={handleEditModalCancel}
          />
        )}

        {/* Rewrite Opinion Modal for message regeneration */}
        <RewriteOpinionModal
          isVisible={isRewriteModalVisible}
          onClose={handleCancelRegenerate}
          onRegenerate={handleRegenerateWithOpinion}
          onRegenerateWithoutOpinion={handleRegenerateWithoutOpinion}
          isProcessing={isRegenerating}
        />
      </View>
    );
  }

  // Main regular/background-focus rendering
  return (
    <View style={[styles.container, style]}>
      <FlatList
        key={`${conversationId}-inverted-${listBump}`}
        ref={flatListRef}
        data={invertedData}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        style={styles.messagesList}
        contentContainerStyle={[
          styles.messagesContent,
          { paddingBottom: insets.bottom + 20 }
        ]}
        inverted
        showsVerticalScrollIndicator={false}
        // 仅用于更新滚动状态；分页由 onEndReached 统一处理，避免重复触发导致抖动
        onScroll={(event) => handleFlatListScroll(event)}
        scrollEventThrottle={16}
        removeClippedSubviews={false}
        maxToRenderPerBatch={10}
        windowSize={10}
        initialNumToRender={15}
        getItemLayout={undefined}
        // 重新生成或加载更多期间禁用保持可见位置，避免在大屏上出现上下抖动
        // 同时，在重新生成刚结束时也暂时禁用，给 FlatList 时间稳定
        maintainVisibleContentPosition={
          uiState.isScrolledToBottom && 
          !regeneratingMessageId && 
          !loadingMore && 
          !suppressAutoScroll &&
          listBump > 2 // 给 FlatList 几次重新挂载的机会来稳定
            ? { minIndexForVisible: 1, autoscrollToTopThreshold: 40 }
            : undefined
        }
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.2}
        extraData={{
          regeneratingMessageId,
          isScrolledToBottom: uiState.isScrolledToBottom,
          messageCount: messages.length,
        }}
        ListFooterComponent={loadingMore ? (
          <View style={styles.loadMoreIndicator}>
            <ActivityIndicator size="small" color="#666" />
            <Text style={styles.loadMoreText}>加载更多消息...</Text>
          </View>
        ) : null}
      />

      {/* Floating loading indicator to avoid jitter when not at bottom */}
      {showLoadingIndicator && (
        <View pointerEvents="none" style={[styles.loadingOverlay, { bottom: insets.bottom + 80 }]}>
          <LoadingIndicator isRegenerating={!!regeneratingMessageId} />
        </View>
      )}

      {/* Scroll to bottom button */}
      {uiState.showScrollToBottomButton && (
        <ScrollToBottomButton
          onPress={() => scrollToBottom(true)}
          style={{
            bottom: insets.bottom + 80,
            right: 20,
          }}
        />
      )}

      {/* 加载更多动画在 inverted 列表中作为 ListFooterComponent 显示于顶部 */}

      {/* Chat History Modal */}
      <ChatHistoryModal
        visible={isHistoryModalVisible}
        messages={messages}
        onClose={() => setHistoryModalVisible?.(false)}
        selectedCharacter={selectedCharacter}
        user={user}
      />

      {/* Image Viewer Modal */}
      {fullscreenImage && (
        <ImageViewer
          isVisible={!!fullscreenImage}
          images={[fullscreenImage]}
          initialIndex={0}
          onClose={handleCloseFullscreenImage}
        />
      )}

      {/* Text Editor Modal for message editing */}
      {isEditModalVisible && editingMessage && (
        <TextEditorModal
          isVisible={true}
          initialText={editingMessage.text}
          title="编辑消息"
          onSave={handleEditModalSave}
          onClose={handleEditModalCancel}
        />
      )}

      {/* Rewrite Opinion Modal for message regeneration */}
      <RewriteOpinionModal
        isVisible={isRewriteModalVisible}
        onClose={handleCancelRegenerate}
        onRegenerate={handleRegenerateWithOpinion}
        onRegenerateWithoutOpinion={handleRegenerateWithoutOpinion}
        isProcessing={isRegenerating}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: RESPONSIVE_PADDING,
    paddingTop: 10,
  },
  messageWrapper: {
    marginVertical: 4,
  },
  messageActions: {
    flexDirection: 'row',
    marginTop: 4,
    paddingHorizontal: 8,
  },
  userActions: {
    justifyContent: 'flex-end',
  },
  botActions: {
    justifyContent: 'flex-start',
  },
  actionButton: {
    padding: 6,
    marginHorizontal: 2,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  darkActionButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  loadingButton: {
    backgroundColor: 'rgba(255, 193, 7, 0.2)',
  },
  playingButton: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  loadingContent: {
    alignItems: 'center',
    backgroundColor: 'rgba(68, 68, 68, 0.9)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    maxWidth: MAX_WIDTH,
  },
  loadingDots: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginHorizontal: 3,
  },
  loadingText: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.8,
  },
  scrollToBottomButton: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  // New: floating loading overlay (instead of ListFooterComponent)
  loadingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  loadMoreIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  loadMoreText: {
    marginLeft: 8,
    color: '#666',
    fontSize: 14,
  },
});

export default ChatDialog;

