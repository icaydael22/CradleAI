import { useState, useCallback, useRef, useEffect } from 'react';
import { Keyboard, Platform } from 'react-native';

export interface ChatUIState {
  isScrolledToBottom: boolean;
  showScrollToBottomButton: boolean;
  keyboardVisible: boolean;
  keyboardHeight: number;
}

interface UseChatUIOptions {
  shouldScrollToBottom?: boolean;
  onScrollToBottomComplete?: () => void;
  messages?: any[]; // Add messages to track changes
  conversationId?: string; // to force jump on convo switch
  inverted?: boolean; //  whether list is inverted (chat-style)
  // 当外层有覆盖层/侧栏出现时，禁止自动吸底与自动滚动
  suppressAutoScroll?: boolean;
}

export const useChatUI = ({ 
  shouldScrollToBottom, 
  onScrollToBottomComplete,
  messages = [],
  conversationId,
  inverted = false,
  suppressAutoScroll = false,
}: UseChatUIOptions = {}) => {
  const [uiState, setUIState] = useState<ChatUIState>({
    isScrolledToBottom: true,
    showScrollToBottomButton: false,
    keyboardVisible: false,
    keyboardHeight: 0,
  });

  const flatListRef = useRef<any>(null);
  const lastLoadTimeRef = useRef<number>(0);

  // Jump to bottom when conversation changes
  useEffect(() => {
    if (!conversationId) return;
    // Reset bottom state and jump without animation to avoid flicker
    setUIState(prev => ({ ...prev, isScrolledToBottom: true, showScrollToBottomButton: false }));
    setTimeout(() => {
      if (flatListRef.current) {
        try {
          if (inverted) {
            flatListRef.current.scrollToOffset?.({ offset: 0, animated: false });
          } else {
            flatListRef.current.scrollToEnd?.({ animated: false });
          }
        } catch (e) {
          // noop
        }
      }
    }, 0);
  }, [conversationId, inverted]);

  // Auto-scroll to bottom when messages change (only if already at bottom)
  useEffect(() => {
    if (suppressAutoScroll) return;
    if (!uiState.isScrolledToBottom || messages.length === 0) return;

    // 当最后一条消息是流式输出时，下面的通用自动滚动由流式专用逻辑负责，避免双重滚动造成抖动
    const last = messages[messages.length - 1];
    if (last?.isLoading && last?.sender === 'bot') return;

    const timer = setTimeout(() => {
      if (flatListRef.current) {
        try {
          if (inverted) {
            flatListRef.current.scrollToOffset?.({ offset: 0, animated: true });
            // 为重新生成后的消息更新添加额外的滚动确认
            setTimeout(() => {
              try {
                flatListRef.current.scrollToOffset?.({ offset: 0, animated: false });
              } catch {}
            }, 200);
          } else {
            flatListRef.current.scrollToEnd?.({ animated: true });
          }
        } catch (error) {
          console.error('Error auto-scrolling to bottom:', error);
        }
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [messages, uiState.isScrolledToBottom, inverted, suppressAutoScroll]);

  // 监听最后一条消息的文本变化（流式输出）
  useEffect(() => {
    if (suppressAutoScroll) return;
    if (messages.length > 0 && uiState.isScrolledToBottom) {
      const lastMessage = messages[messages.length - 1];
      // 如果最后一条消息正在流式更新（isLoading且是bot消息），则持续滚动
      if (lastMessage?.isLoading && lastMessage?.sender === 'bot') {
        const timer = setTimeout(() => {
          if (flatListRef.current) {
            try {
              if (inverted) {
                flatListRef.current.scrollToOffset?.({ offset: 0, animated: true });
              } else {
                flatListRef.current.scrollToEnd?.({ animated: true });
              }
            } catch (error) {
              console.error('Error auto-scrolling during stream:', error);
            }
          }
        }, 100); // 更频繁的滚动检查
        return () => clearTimeout(timer);
      }
    }
  }, [messages[messages.length - 1]?.text, uiState.isScrolledToBottom, inverted, messages.length, suppressAutoScroll]);

  // Handle scroll events
  const handleScroll = useCallback((event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    // 更宽松的阈值，减少在大屏设备上的临界抖动
    const threshold = 40;
    const isAtBottom = inverted
      ? contentOffset.y <= threshold
      : contentOffset.y + layoutMeasurement.height >= contentSize.height - threshold;
    
    setUIState(prev => ({
      ...prev,
      isScrolledToBottom: isAtBottom,
      showScrollToBottomButton: !isAtBottom,
    }));
  }, [inverted]);

  // Scroll to bottom functionality
  const scrollToBottom = useCallback((animated: boolean = true) => {
    if (flatListRef.current) {
      try {
        if (inverted) {
          flatListRef.current.scrollToOffset?.({ offset: 0, animated });
        } else {
          flatListRef.current.scrollToEnd?.({ animated });
        }
        
        // Update state immediately if not animated
        if (!animated) {
          setUIState(prev => ({
            ...prev,
            isScrolledToBottom: true,
            showScrollToBottomButton: false,
          }));
        }
        
        // Call completion callback
        if (onScrollToBottomComplete) {
          setTimeout(onScrollToBottomComplete, animated ? 300 : 0);
        }
      } catch (error) {
        console.error('Error scrolling to bottom:', error);
      }
    }
  }, [onScrollToBottomComplete, inverted]);

  // Handle keyboard visibility
  const handleKeyboardShow = useCallback((height: number) => {
    setUIState(prev => ({
      ...prev,
      keyboardVisible: true,
      keyboardHeight: height,
    }));
  }, []);

  const handleKeyboardHide = useCallback(() => {
    setUIState(prev => ({
      ...prev,
      keyboardVisible: false,
      keyboardHeight: 0,
    }));
  }, []);

  // Handle load more (for pull-to-refresh at top)
  const handleLoadMore = useCallback((onLoadMore?: () => void, hasMore?: boolean, loadingMore?: boolean) => {
    if (!hasMore || loadingMore || !onLoadMore) return;

    const now = Date.now();
    if (!lastLoadTimeRef.current || now - lastLoadTimeRef.current > 1000) {
      console.log('[useChatUI] Triggering onLoadMore');
      lastLoadTimeRef.current = now;
      onLoadMore();
    } else {
      console.log('[useChatUI] Load request ignored - too soon after last load');
    }
  }, []);

  // Handle FlatList scroll for load more
  const handleFlatListScroll = useCallback((
    event: any,
    _onLoadMore?: () => void,
    _hasMore?: boolean,
    _loadingMore?: boolean
  ) => {
    // 仅更新滚动状态；分页改由 FlatList 的 onEndReached 统一触发，避免重复触发导致抖动
    handleScroll(event);
  }, [handleScroll]);

  // Force scroll to bottom if needed
  const checkAndScrollToBottom = useCallback(() => {
    if (shouldScrollToBottom && !suppressAutoScroll) {
      scrollToBottom(true);
    }
  }, [shouldScrollToBottom, scrollToBottom, suppressAutoScroll]);

  return {
    uiState,
    flatListRef,
    handleScroll,
    handleFlatListScroll,
    scrollToBottom,
    handleKeyboardShow,
    handleKeyboardHide,
    handleLoadMore,
    checkAndScrollToBottom,
  };
};
