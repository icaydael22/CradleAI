import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { GroupMessage } from '@/src/group/group-types';
import { Character, User } from '@/shared/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GroupService } from '@/src/group/group-service'; // 添加GroupService导入

interface GroupDialogProps {
  style?: any;
  groupId: string;
  messages: GroupMessage[];
  onScrollPositionChange?: (groupId: string, position: number) => void;
  currentUser: User;
  groupMembers: Character[];
  isGroupDisbanded?: boolean; // 添加群组是否已解散的标志
  onGroupDisbanded?: (disbandedGroupId: string) => void; // 新增
}

// Constants for virtualization
const INITIAL_LOAD_COUNT = 50; // Initial messages to show
const BATCH_SIZE = 5; // How many messages to load per batch when scrolling up
const { width } = Dimensions.get('window');
const MAX_WIDTH = width - 32; // 保证左右各留16px安全边距
const MAX_IMAGE_HEIGHT = 300;

const GroupDialog: React.FC<GroupDialogProps> = ({
  style,
  groupId,
  messages,
  onScrollPositionChange,
  currentUser,
  groupMembers,
  isGroupDisbanded = false, // 默认为false
  onGroupDisbanded, // 新增
}) => {
  // Reference to FlatList for scrolling
  const flatListRef = useRef<FlatList>(null);
  
  // Animation values
  const fadeAnim = useSharedValue(0);
  const translateAnim = useSharedValue(0);
  const dot1Scale = useSharedValue(1);
  const dot2Scale = useSharedValue(1);
  const dot3Scale = useSharedValue(1);
  
  // State variables for fullscreen image handling
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  
  // State variables for virtualized list
  const [virtualizedMessages, setVirtualizedMessages] = useState<GroupMessage[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessagesToLoad, setHasMoreMessagesToLoad] = useState(false);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  
  // State to track user scroll behavior
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  
  // Add a ref to track if we're programmatically scrolling
  const isAutoScrollingRef = useRef(false);
  
  // Track scroll positions for different group chats
  const [scrollPositions, setScrollPositions] = useState<Record<string, number>>({});
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);
  const isInitialScrollRestored = useRef(false);

  // Character profile cache for message display
  const [characterProfiles, setCharacterProfiles] = useState<Record<string, Character>>({});

  // 添加本地消息状态，以便从服务更新
  const [localMessages, setLocalMessages] = useState<GroupMessage[]>([]);

  // 初始化本地消息
  useEffect(() => {
    // 如果群组已解散，则清空本地消息
    if (isGroupDisbanded) {
      console.log(`[GroupDialog] 群组 ${groupId} 已解散，清空消息`);
      setLocalMessages([]);
      return;
    }
    
    setLocalMessages(messages);
  }, [messages, isGroupDisbanded]);

  // Update current group ID when it changes
  useEffect(() => {
    if (groupId && groupId !== currentGroupId) {
      setCurrentGroupId(groupId);
      isInitialScrollRestored.current = false;
      setInitialScrollDone(false);
    }
  }, [groupId, currentGroupId]);

  // Process group members into a lookup object for easy access
  useEffect(() => {
    const profiles: Record<string, Character> = {};
    groupMembers.forEach(member => {
      profiles[member.id] = member;
    });
    setCharacterProfiles(profiles);
  }, [groupMembers]);

  // Enhance the message listener effect to properly handle group changes:
  useEffect(() => {
    if (!groupId || isGroupDisbanded) return; // 如果群组已解散，不订阅消息
    
    console.log(`[GroupDialog] 开始订阅群组 ${groupId} 的消息更新`);
    
    // 订阅消息更新
    const unsubscribe = GroupService.addMessageListener(groupId, (updatedMessages) => {
      // 如果群组已解散，不更新消息
      if (isGroupDisbanded) {
        console.log(`[GroupDialog] 群组 ${groupId} 已解散，不更新消息`);
        return;
      }
      
      console.log(`[GroupDialog] 收到群组 ${groupId} 的消息更新，消息数: ${updatedMessages.length}`);
      
      // 更新本地消息状态，而不仅是打印日志
      setLocalMessages(updatedMessages);
      
      // 检查更新的消息是否与当前显示的消息不同
      if (updatedMessages.length !== localMessages.length) {
        // 如果用户在底部，重置用户滚动状态以触发自动滚动
        if (isNearBottom) {
          setUserHasScrolled(false);
        }
      }
    });
    
    // 清理函数 - make sure to cleanup the previous listener when the group changes
    return () => {
      console.log(`[GroupDialog] 取消订阅群组 ${groupId} 的消息更新`);
      unsubscribe();
    };
  }, [groupId, isNearBottom, isGroupDisbanded]); // 添加isGroupDisbanded作为依赖项

  // Reset local messages when the group changes
  useEffect(() => {
    if (messages.length > 0 && groupId) {
      console.log(`[GroupDialog] Group changed or initial messages received, updating local messages for ${groupId}`);
      setLocalMessages(messages);
    }
  }, [groupId, messages]);

  // 修改数据源，使用localMessages代替传入的messages
  useEffect(() => {
    if (localMessages.length === 0) {
      setVirtualizedMessages([]);
      setHasMoreMessagesToLoad(false);
      return;
    }

    // Ensure all messages have unique IDs before processing
    const processedMessages = localMessages.map(msg => {
      if (msg.messageId) return msg;
      
      // Generate a stable ID for messages without one
      const contentHash = msg.messageContent ? 
        msg.messageContent.substring(0, 20).replace(/[^a-z0-9]/gi, '') : 
        'empty';
        
      return {
        ...msg,
        messageId: `gen-${msg.senderId}-${new Date(msg.messageCreatedAt).getTime() || Date.now()}-${contentHash}-${Math.random().toString(36).substring(2, 7)}`
      };
    });

    // === 修正：每次localMessages变化都重新计算窗口，始终显示最新N条消息 ===
    // 只在用户主动上拉加载时才扩展窗口，否则始终显示最新的INITIAL_LOAD_COUNT条
    const totalCount = processedMessages.length;
    let startIdx = Math.max(0, totalCount - INITIAL_LOAD_COUNT);
    let endIdx = totalCount;

    // 如果当前virtualizedMessages比窗口大，说明用户上拉加载过历史消息，则保留窗口
    if (virtualizedMessages.length > INITIAL_LOAD_COUNT) {
      // 保持当前窗口大小，向前扩展
      startIdx = Math.max(0, totalCount - virtualizedMessages.length);
    }

    setVirtualizedMessages(processedMessages.slice(startIdx, endIdx));
    setHasMoreMessagesToLoad(startIdx > 0);
    setInitialScrollDone(false);
  }, [localMessages]); // 只依赖localMessages，移除userHasScrolled依赖

  // Load more messages when scrolling up
  const loadMoreMessages = useCallback(() => {
    if (isLoadingMore || !hasMoreMessagesToLoad || localMessages.length === 0) return;
    
    setIsLoadingMore(true);
    console.log(`[GroupDialog] Starting to load more messages. Current count: ${virtualizedMessages.length}`);
    
    // Get the first message ID from current virtualized list
    const firstVisibleMessageId = virtualizedMessages.length > 0 ? virtualizedMessages[0].messageId : null;
    
    if (!firstVisibleMessageId) {
      setIsLoadingMore(false);
      return;
    }
    
    // Find the index of the first visible message in the full message array
    const firstVisibleIndex = localMessages.findIndex(msg => msg.messageId === firstVisibleMessageId);
    
    if (firstVisibleIndex <= 0) {
      console.log(`[GroupDialog] Could not find first visible message in full list, or it's already at position 0`);
      setIsLoadingMore(false);
      setHasMoreMessagesToLoad(false);
      return;
    }
    
    // Calculate the range of additional messages to load
    const newStartIndex = Math.max(0, firstVisibleIndex - BATCH_SIZE);
    const additionalMessages = localMessages.slice(newStartIndex, firstVisibleIndex);
    
    console.log(`[GroupDialog] Loading ${additionalMessages.length} more messages (${newStartIndex}-${firstVisibleIndex} of ${localMessages.length})`);
    
    // If no additional messages to load, exit early
    if (additionalMessages.length === 0) {
      setIsLoadingMore(false);
      setHasMoreMessagesToLoad(false);
      return;
    }
    
    // Remember the current first message for maintaining scroll position later
    const firstItem = virtualizedMessages[0];
    
    // Add the additional messages to the beginning of the virtualized list
    setTimeout(() => {
      setVirtualizedMessages(prev => {
        const existingIds = new Set(prev.map(msg => msg.messageId));
        const uniqueNewMessages = additionalMessages.filter(msg => !existingIds.has(msg.messageId));
        return [...uniqueNewMessages, ...prev];
      });
      
      setHasMoreMessagesToLoad(newStartIndex > 0);
      
      // Stop loading state and maintain position after a short delay
      setTimeout(() => {
        setIsLoadingMore(false);
        
        // If there were previous messages, scroll to maintain relative position
        if (firstItem && flatListRef.current && additionalMessages.length > 0) {
          // Find the index of the previous first message in the new list
          const maintainIndex = additionalMessages.length;
          
          console.log(`[GroupDialog] Scrolling to maintain position at index ${maintainIndex}`);
          
          try {
            flatListRef.current.scrollToIndex({
              index: maintainIndex,
              animated: false,
              viewPosition: 0,
            });
          } catch (error) {
            console.error('[GroupDialog] Error scrolling to index:', error);
            
            // Fallback solution: use scrollToItem
            try {
              if (firstItem) {
                flatListRef.current.scrollToItem({
                  item: firstItem,
                  animated: false,
                  viewPosition: 0
                });
              }
            } catch (fallbackError) {
              console.error('[GroupDialog] Fallback scroll also failed:', fallbackError);
            }
          }
        }
      }, 100);
    }, 300);
  }, [isLoadingMore, hasMoreMessagesToLoad, localMessages, virtualizedMessages]);

  // Handle scroll events
  const handleUserScroll = (event: any) => {
    const yOffset = event.nativeEvent.contentOffset.y;
    
    // Only register as user scroll if it's not from our programmatic scrolling
    if (!isAutoScrollingRef.current) {
      setUserHasScrolled(true);
    }
    
    // Check if near top to load more messages
    if (yOffset < 50 && !isLoadingMore && hasMoreMessagesToLoad) {
      console.log('[GroupDialog] Near top, loading more messages');
      loadMoreMessages();
    }
    
    // Check if near bottom
    const contentHeight = event.nativeEvent.contentSize.height;
    const scrollViewHeight = event.nativeEvent.layoutMeasurement.height;
    
    // Consider user at bottom if they're within 150px of the bottom
    const isCloseToBottom = contentHeight - yOffset - scrollViewHeight < 150;
    
    if (isNearBottom !== isCloseToBottom) {
      setIsNearBottom(isCloseToBottom);
      console.log(`[GroupDialog] Near bottom status changed to: ${isCloseToBottom}`);
    }
    
    // Track scroll position
    if (currentGroupId) {
      setScrollPositions(prev => ({
        ...prev,
        [currentGroupId]: yOffset
      }));
      
      // Report scroll position to parent if callback provided
      if (onScrollPositionChange) {
        onScrollPositionChange(currentGroupId, yOffset);
      }
    }
  };

  // Auto-scroll to bottom for new messages
  useEffect(() => {
    // Only scroll to bottom on initial load or when a new message arrives
    // and the user hasn't scrolled up yet
    if (virtualizedMessages.length > 0 && !isLoadingMore && !userHasScrolled) {
      console.log('[GroupDialog] Initial load or new message while at bottom - scrolling to bottom');
      
      // Set the auto-scrolling flag to avoid interference with user scrolling
      isAutoScrollingRef.current = true;
      
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: false });
        }
        
        // Reset the flag after scrolling
        setTimeout(() => {
          isAutoScrollingRef.current = false;
        }, 100);
      }, 50);
    }
  }, [virtualizedMessages.length, isLoadingMore, userHasScrolled]);

  // Animate dots for loading state
  useEffect(() => {
    const animateDots = () => {
      const setupDotAnimation = (dotScale: Animated.SharedValue<number>, delay: number) => {
        dotScale.value = withDelay(
          delay,
          withSequence(
            withTiming(1.5, { duration: 300 }),
            withTiming(1, { duration: 300 })
          )
        );
      };
      
      setupDotAnimation(dot1Scale, 0);
      setupDotAnimation(dot2Scale, 200);
      setupDotAnimation(dot3Scale, 400);
      
      const interval = setInterval(() => {
        setupDotAnimation(dot1Scale, 0);
        setupDotAnimation(dot2Scale, 200);
        setupDotAnimation(dot3Scale, 400);
      }, 1200);
      
      return () => clearInterval(interval);
    };
    
    const cleanup = animateDots();
    return cleanup;
  }, []);
  
  const dot1Style = useAnimatedStyle(() => ({
    transform: [{ scale: dot1Scale.value }]
  }));
  
  const dot2Style = useAnimatedStyle(() => ({
    transform: [{ scale: dot2Scale.value }]
  }));
  
  const dot3Style = useAnimatedStyle(() => ({
    transform: [{ scale: dot3Scale.value }]
  }));

  // Render loading indicator for header
  const renderListHeader = () => {
    if (!hasMoreMessagesToLoad && !isLoadingMore) return null;
    
    return (
      <View style={styles.loadMoreContainer}>
        {isLoadingMore ? (
          <View style={styles.loadingMoreRow}>
            <ActivityIndicator size="small" color="#aaa" />
            <Text style={styles.loadMoreText}>加载更早的消息...</Text>
          </View>
        ) : (
          <TouchableOpacity 
            onPress={loadMoreMessages}
            style={styles.loadMoreButton}
          >
            <Ionicons name="arrow-up-circle-outline" size={18} color="#ddd" />
            <Text style={styles.loadMoreText}>加载更早的消息</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Render time groups to separate messages by time
  const renderTimeGroup = (timestamp: Date) => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return (
      <View style={styles.timeGroup}>
        <Text style={styles.timeText}>{`${hours}:${minutes}`}</Text>
      </View>
    );
  };

  // Helper to get character avatar by ID
  const getCharacterAvatar = (characterId: string): string | undefined => {
    if (characterId === 'system') {
      return undefined; // Use default for system messages
    }
    if (characterId === currentUser.id) {
      return currentUser.avatar; // Use current user's avatar
    }
    // Find character in the profiles
    const character = characterProfiles[characterId];
    return character?.avatar ?? undefined;
  };

  // Handle opening a fullscreen image
  const handleOpenFullscreenImage = (imageUrl: string) => {
    setFullscreenImage(imageUrl);
  };

  // Process and render message content
  const processMessageContent = (text: string, sender: string) => {
    const isUser = sender === currentUser.id;
    // If text is empty, return a placeholder
    if (!text || text.trim() === '') {
      return (
        <Text style={isUser ? styles.userMessageText : styles.botMessageText}>
          (Empty message)
        </Text>
      );
    }

    // For now, just render plain text (can be enhanced later)
    return (
      <Text style={isUser ? styles.userMessageText : styles.botMessageText}>
        {text}
      </Text>
    );
  };

  // Render a single message
  const renderMessageContent = (message: GroupMessage, isUser: boolean) => {
    const isSenderSystem = message.senderId === 'system';
    // For system messages, render differently
    if (isSenderSystem) {
      return (
        <View style={styles.systemMessageContainer}>
          <Text style={styles.systemMessageText}>{message.messageContent}</Text>
        </View>
      );
    }

    // --- 用户消息条：右上角显示头像，宽度自适应文本 ---
    if (isUser) {
      return (
        <View style={[styles.userMessageWrapper]}>
          {/* 用户头像，绝对定位右上角 */}
          {getCharacterAvatar(message.senderId) && (
            <Image
              source={{ uri: String(getCharacterAvatar(message.senderId)) }}
              style={styles.userMessageAvatar}
            />
          )}
          <View style={[
            styles.userGradient,
            { 
              alignSelf: 'flex-end',
              maxWidth: MAX_WIDTH,
              minWidth: 48,
              paddingRight: 16,
              paddingLeft: 16,
              paddingVertical: 12,
              borderRadius: 18,
              borderTopRightRadius: 4,
            }
          ]}>
            {processMessageContent(message.messageContent, message.senderId)}
          </View>
        </View>
      );
    }

    // ...existing code for bot message...
    return (
      <View style={[
        styles.messageContent,
        isUser ? styles.userMessageContent : styles.botMessageContent,
        { maxWidth: MAX_WIDTH }
      ]}>
        {!isUser && (
          <Image
            source={
              getCharacterAvatar(message.senderId)
                ? { uri: getCharacterAvatar(message.senderId) }
                : require('@/assets/images/default-avatar.png')
            }
            style={styles.messageAvatar}
          />
        )}
        <View style={[styles.botMessageTextContainer, { maxWidth: MAX_WIDTH }]}>
          <Text style={styles.senderName}>{message.senderName}</Text>
          {processMessageContent(message.messageContent, message.senderId)}
        </View>
      </View>
    );
  };

  // Render empty state when no messages
  const renderEmptyState = () => {
    // 如果群组已解散，显示解散信息
    if (isGroupDisbanded) {
      return (
        <View style={styles.emptyStateContainer}>
          <Ionicons name="alert-circle-outline" size={60} color="#777" />
          <Text style={styles.emptyStateTitle}>
            群聊已解散
          </Text>
          <Text style={styles.emptyStateSubtitle}>
            此群聊已被群主解散，无法继续聊天
          </Text>
        </View>
      );
    }
    
    return (
      <View style={styles.emptyStateContainer}>
        <Ionicons name="chatbubbles-outline" size={60} color="#777" />
        <Text style={styles.emptyStateTitle}>
          群聊已创建
        </Text>
        <Text style={styles.emptyStateSubtitle}>
          发送一条消息开始聊天吧
        </Text>
      </View>
    );
  };

  // Handle scroll to index failures for FlatList
  const handleScrollToIndexFailed = (info: {
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }) => {
    console.warn('[GroupDialog] Failed to scroll to index:', info);
    
    // Fallback solution - scroll to offset based on average item height
    const offset = info.averageItemLength * info.index;
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ 
        offset,
        animated: false
      });
    }, 100);
  };

  // Render a message item
  const renderItem = useCallback(({ item, index }: { item: GroupMessage, index: number }) => {
    const isUser = item.senderId === currentUser.id;
    const timestamp = item.messageCreatedAt;
    const showTime = index === 0 || index % 5 === 0 || 
                    (index > 0 && 
                    new Date(virtualizedMessages[index-1].messageCreatedAt).getHours() !== 
                    new Date(timestamp).getHours());
    
    return (
      <View key={item.messageId} style={styles.messageWrapper}>
        {showTime && timestamp && renderTimeGroup(timestamp)}
        
        <View
          style={[
            styles.messageContainer,
            isUser ? styles.userMessageContainer : styles.botMessageContainer,
          ]}
        >
          {renderMessageContent(item, isUser)}
        </View>
      </View>
    );
  }, [virtualizedMessages, currentUser, characterProfiles]);

  // Generate unique keys for FlatList items
  const keyExtractor = useCallback((item: GroupMessage) => {
    return item.messageId || `msg-${item.senderId}-${new Date(item.messageCreatedAt).getTime()}`;
  }, []);

  return (
    <>
      {localMessages.length === 0 ? ( // 修改这里使用localMessages
        <View style={[styles.container, style, styles.emptyContent]}>
          {renderEmptyState()}
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={virtualizedMessages}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          style={[styles.container, style]}
          contentContainerStyle={[styles.content, { paddingHorizontal: 16 }]} // 保证整体左右有安全边距
          onScroll={handleUserScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={true}
          ListHeaderComponent={renderListHeader}
          ListFooterComponent={() => <View style={styles.endSpacer} />}
          onEndReachedThreshold={0.1}
          initialNumToRender={20}
          maxToRenderPerBatch={10}
          windowSize={21}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          removeClippedSubviews={Platform.OS !== 'web'}
          automaticallyAdjustContentInsets={false}
          keyboardShouldPersistTaps="handled"
        />
      )}
      
      {/* Fullscreen image modal */}
      <Modal
        visible={!!fullscreenImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setFullscreenImage(null)}
      >
        <View style={styles.fullscreenContainer}>
          <TouchableOpacity 
            style={styles.fullscreenCloseButton}
            onPress={() => setFullscreenImage(null)}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          
          {fullscreenImage && (
            <Image
              source={{ uri: fullscreenImage }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    paddingVertical: 16,
  },
  emptyContent: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  messageWrapper: {
    marginBottom: 16,
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  botMessageContainer: {
    justifyContent: 'flex-start',
  },
  messageContent: {
    flex: 1,
    maxWidth: MAX_WIDTH,
    marginHorizontal: 8,
    alignSelf: 'center',
  },
  userMessageContent: {
    alignSelf: 'flex-end',
  },
  botMessageContent: {
    alignSelf: 'flex-start',
  },
  userMessageWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    position: 'relative',
    minHeight: 40,
    maxWidth: MAX_WIDTH,
    alignSelf: 'flex-end',
  },
  userGradient: {
    backgroundColor: 'rgba(255, 224, 195, 0.85)',
    borderRadius: 18,
    borderTopRightRadius: 4,
    // padding 由 renderMessageContent 控制
  },
  userMessageAvatar: {
    position: 'absolute',
    right: -15,
    top: -15,
    zIndex: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#444',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  userMessageText: {
    color: '#333',
    fontSize: 16,
  },
  botMessageTextContainer: {
    backgroundColor: 'rgba(68, 68, 68, 0.85)',
    borderRadius: 18,
    borderTopLeftRadius: 4,
    padding: 12,
    paddingHorizontal: 16,
    width: '100%',
    paddingTop: 20,
    marginTop: 15,
    maxWidth: MAX_WIDTH,
  },
  botMessageText: {
    color: '#fff',
    fontSize: 16,
  },
  senderName: {
    fontSize: 12,
    color: '#bbb',
    marginBottom: 4,
    fontWeight: 'bold',
  },
  messageAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    position: 'absolute',
    left: 10,
    top: -15,
    zIndex: 2,
    backgroundColor: '#444',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  loadingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 24,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#bbb',
    marginHorizontal: 2,
    opacity: 0.7,
  },
  timeGroup: {
    alignItems: 'center',
    marginVertical: 8,
  },
  timeText: {
    color: '#ddd',
    fontSize: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 16,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    color: '#bbb',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  endSpacer: {
    height: 40,
  },
  loadMoreContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 10,
  },
  loadingMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  loadMoreText: {
    color: '#ddd',
    fontSize: 14,
    marginLeft: 8,
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: '100%',
    height: '80%',
  },
  fullscreenCloseButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 100,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  systemMessageContainer: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    padding: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginVertical: 8,
  },
  systemMessageText: {
    color: '#ddd',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default GroupDialog;
