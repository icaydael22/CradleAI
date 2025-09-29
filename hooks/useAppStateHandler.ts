import { useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';

interface AppStateHandlerOptions {
  isLoading: boolean;
  isContinuing: boolean;
  selectedConversationId: string | null;
  onSendMessage: (text: string, sender: 'user' | 'bot', isLoading?: boolean, metadata?: Record<string, any>) => void;
  onAbortAvailableChange: (isAbortAvailable: boolean) => void;
  resetLoadingState: () => void;
}

export const useAppStateHandler = ({
  isLoading,
  isContinuing,
  selectedConversationId,
  onSendMessage,
  onAbortAvailableChange,
  resetLoadingState,
}: AppStateHandlerOptions) => {
  // Handle App state changes for background/foreground transitions
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        console.log('[useAppStateHandler] App进入后台，检查是否需要处理正在进行的请求');
        
        // If there's an ongoing request, try to save state and prepare for restoration
        if (isLoading || isContinuing) {
          console.log('[useAppStateHandler] 检测到后台切换时有正在进行的请求，将在前台恢复时检查状态');
          // Set a flag indicating there's an unfinished request
          (global as any).__chatInputPendingRequest = {
            conversationId: selectedConversationId,
            timestamp: Date.now()
          };
        }
      } else if (nextAppState === 'active') {
        console.log('[useAppStateHandler] App恢复前台，检查是否有未完成的请求');
        
        // Check if there's a request to restore
        const pendingRequest = (global as any).__chatInputPendingRequest;
        if (pendingRequest && pendingRequest.conversationId === selectedConversationId) {
          const timeElapsed = Date.now() - pendingRequest.timestamp;
          
          // If background time exceeds 30 seconds, consider the request as failed
          if (timeElapsed > 30000) {
            console.log('[useAppStateHandler] 后台时间过长，重置loading状态');
            resetLoadingState();
            
            // Send a timeout error message
            onSendMessage('请求超时，请重新发送消息。', 'bot', false, { 
              isErrorMessage: true, 
              error: 'Request timeout due to app backgrounding' 
            });
          } else {
            console.log('[useAppStateHandler] 短时间后台切换，继续等待响应');
          }
          
          // Clear the flag
          delete (global as any).__chatInputPendingRequest;
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription?.remove();
    };
  }, [isLoading, isContinuing, selectedConversationId, onSendMessage, resetLoadingState]);

  // 简化的处理逻辑，直接管理中止可用性
  useEffect(() => {
    const isAnyLoading = isLoading || isContinuing;
    
    if (isAnyLoading) {
      // 当开始加载时，立即设置中止可用
      onAbortAvailableChange(true);
    } else {
      // 当不再加载时，禁用中止
      onAbortAvailableChange(false);
    }
  }, [isLoading, isContinuing, onAbortAvailableChange]);

  // Cleanup function for manual cleanup if needed
  const cleanup = useCallback(() => {
    // 无需清理定时器，因为我们已经移除了定时器逻辑
  }, []);

  return {
    cleanup,
  };
};